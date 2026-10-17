-- 0028: session types with importance (Çalışma, Camp, KBO…), late minutes and excuse in the roll call,
-- an activity linked to a Telegram group that receives the roll call.

/* ---------- session types ---------- */
create table activity_session_types (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  importance smallint not null default 1 check (importance between 1 and 3),   -- 1 орташа, 2 маңызды, 3 өте маңызды
  created_at timestamptz not null default now(),
  unique (activity_id, name),
  unique (id, activity_id)
);
alter table activity_session_types enable row level security;
create policy ast_read on activity_session_types for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
create policy ast_write on activity_session_types for all to authenticated using (can_manage_activity(activity_id)) with check (can_manage_activity(activity_id));

-- a type must belong to the same activity; removing a type leaves its sessions untyped
alter table activity_sessions add column type_id uuid,
  add foreign key (type_id, activity_id) references activity_session_types(id, activity_id) on delete set null (type_id);
alter table activities add column default_type_id uuid,
  add foreign key (default_type_id, id) references activity_session_types(id, activity_id) on delete set null (default_type_id),
  add column tg_chat_id bigint,           -- shortcut: readable by everyone who sees the activity; a chat id alone lets nobody post
  add column tg_chat_title text;

/* ---------- "times later, in the calendar": weekly with no fixed weekdays ---------- */
-- the old activities_check1 demands weekdays; 0028b (run by hand) drops it, this one stays
alter table activities add constraint activities_schedule_ok check (
  schedule = 'once' and on_date is not null
  or schedule = 'weekly' and (weekdays is null or weekdays <@ '{1,2,3,4,5,6,7}') and date_from is not null and date_to >= date_from);

-- coalesce: with no weekdays the regular part is null, and `not null` would let mark_attendance through
create or replace function is_session(a activities, d date) returns boolean language sql stable set search_path = public as $$
  select coalesce(case a.schedule
      when 'once' then d = a.on_date
      else d between a.date_from and a.date_to and (
        case when a.slots is not null then exists (select 1 from jsonb_array_elements(a.slots) s where (s->>'wd')::int = extract(isodow from d)::int)
             else extract(isodow from d)::int = any(a.weekdays) end) end, false)
    or exists (select 1 from activity_sessions x where x.activity_id = a.id and x.on_date = d)
$$;

create function set_default_session_type(p_activity uuid, p_type uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_activity(p_activity) then raise exception 'Құқығыңыз жоқ'; end if;
  update activities set default_type_id = p_type where id = p_activity;
end $$;

/* ---------- roll call details ---------- */
alter table attendance add column late_min smallint check (late_min between 1 and 240),
  add column excuse text check (excuse in ('sick','other'));

create or replace function mark_attendance(p_id uuid, p_date date, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare a activities; n int;
begin
  select * into a from activities where id = p_id;
  if a.id is null or a.school_id <> my_school() then raise exception 'Іс-шара табылмады'; end if;
  if not can_keep_journal(a) then raise exception 'Журналды тек жауапты мұғалім жүргізеді'; end if;
  if a.status <> 'approved' then raise exception 'Іс-шара расталмаған'; end if;
  if not is_session(a, p_date) then raise exception 'Бұл күні сабақ жоқ'; end if;
  if p_date > school_today(a.school_id) then raise exception 'Болашақ күнге белгі қоюға болмайды'; end if;
  insert into attendance (activity_id, session_date, student_id, status, late_min, excuse, marked_by)
  select p_id, p_date, (r->>'student_id')::uuid, (r->>'status')::attendance_status,
    case when r->>'status' = 'late' then nullif(r->>'late_min', '')::smallint end,
    case when r->>'status' = 'excused' then nullif(r->>'excuse', '') end, auth.uid()
  from jsonb_array_elements(p_rows) r
  where exists (select 1 from enrollments e where e.activity_id = p_id and e.student_id = (r->>'student_id')::uuid and not e.waitlisted)
  on conflict (activity_id, session_date, student_id)
    do update set status = excluded.status, late_min = excluded.late_min, excuse = excluded.excuse, marked_by = excluded.marked_by, marked_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

/* ---------- Telegram group ---------- */
alter table telegram_codes add column activity_id uuid references activities(id) on delete cascade;   -- set = a group-link code

create function telegram_group_code(p_activity uuid) returns text language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
begin
  if not can_manage_activity(p_activity) then raise exception 'Telegram тобын жетекші немесе орынбасар байланыстырады'; end if;
  insert into telegram_codes(code, user_id, activity_id) values (c, auth.uid(), p_activity);
  return c;
end $$;

create function unlink_telegram_group(p_activity uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_activity(p_activity) then raise exception 'Құқығыңыз жоқ'; end if;
  update activities set tg_chat_id = null, tg_chat_title = null where id = p_activity;
end $$;

-- what the bot posts to the group: the session and every participant with their mark (null = not marked)
create function rollcall_payload(p_activity uuid, p_date date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a activities; x activity_sessions; s jsonb;
begin
  select * into a from activities where id = p_activity and school_id = my_school() and removed_at is null;
  if a.id is null then raise exception 'Іс-шара табылмады'; end if;
  if not can_keep_journal(a) then raise exception 'Журналды тек жауапты мұғалім жүргізеді'; end if;
  if a.tg_chat_id is null then raise exception 'Telegram тобы байланыспаған. Баптаулар → Telegram тобы'; end if;
  select * into x from activity_sessions where activity_id = a.id and on_date = p_date order by start_time limit 1;
  select e.v into s from jsonb_array_elements(a.slots) as e(v) where (e.v->>'wd')::int = extract(isodow from p_date)::int limit 1;
  return jsonb_build_object('chat_id', a.tg_chat_id, 'title', a.title, 'date', p_date,
    'start', to_char(coalesce(x.start_time, (s->>'start')::time, a.start_time), 'HH24:MI'),
    'end', to_char(coalesce(x.end_time, (s->>'end')::time, a.end_time), 'HH24:MI'),
    'type', (select t.name from activity_session_types t where t.id = coalesce(x.type_id, a.default_type_id)),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'status', t.status, 'late_min', t.late_min, 'excuse', t.excuse) order by p.full_name)
      from enrollments e join profiles p on p.id = e.student_id
      left join attendance t on t.activity_id = a.id and t.session_date = p_date and t.student_id = e.student_id
      where e.activity_id = a.id and not e.waitlisted), '[]'::jsonb));
end $$;

revoke execute on function set_default_session_type, telegram_group_code, unlink_telegram_group, rollcall_payload from public, anon;
grant execute on function set_default_session_type, telegram_group_code, unlink_telegram_group, rollcall_payload to authenticated;
