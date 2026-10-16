-- 0022: several times per activity (a time per weekday) and extra sessions added from the activity calendar.
alter table activities add column slots jsonb check (slots is null or jsonb_typeof(slots) = 'array');

create table activity_sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  on_date date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  note text check (note is null or length(note) <= 200),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (activity_id, on_date, start_time)
);
alter table activity_sessions enable row level security;
create policy as_read on activity_sessions for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
create policy as_write on activity_sessions for all to authenticated using (can_edit_syllabus(activity_id)) with check (can_edit_syllabus(activity_id));

-- a session is a regular weekday (per slot when slots are set) inside the range, or an added extra date
create or replace function is_session(a activities, d date) returns boolean language sql stable set search_path = public as $$
  select case a.schedule
      when 'once' then d = a.on_date
      else d between a.date_from and a.date_to and (
        case when a.slots is not null then exists (select 1 from jsonb_array_elements(a.slots) s where (s->>'wd')::int = extract(isodow from d)::int)
             else extract(isodow from d)::int = any(a.weekdays) end) end
    or exists (select 1 from activity_sessions x where x.activity_id = a.id and x.on_date = d)
$$;

create or replace function submit_activity(p jsonb, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u profiles := me();
  sup profiles;
  ct uuid;
  st activity_status;
  aid uuid := p_id;
  today date;
  old activities;
begin
  if u.id is null then raise exception 'Кіру қажет'; end if;
  today := school_today(u.school_id);
  select * into sup from profiles where id = (p->>'supervisor_id')::uuid;
  if sup.id is null or sup.school_id <> u.school_id or sup.role = 'student' then
    raise exception 'Жауапты мұғалімді таңдаңыз'; end if;
  if p->>'schedule' = 'once' and (p->>'on_date')::date < today then raise exception 'Өткен күнді таңдауға болмайды'; end if;
  if p->>'schedule' = 'weekly' and (p->>'date_to')::date < today then raise exception 'Кезеңнің соңы өтіп кеткен'; end if;

  if u.role in ('deputy','admin') then st := 'approved';
  elsif u.role = 'student' then
    select c.teacher_id into ct from classes c where c.id = u.class_id;
    st := case when ct is null then 'pending_deputy' else 'pending_class_teacher' end;
  else st := 'pending_deputy';
  end if;

  if aid is not null then
    select * into old from activities where id = aid;
    if old.author_id <> u.id then raise exception 'Тек автор өзгерте алады'; end if;
    if old.status not in ('rejected','pending_class_teacher','pending_deputy') then raise exception 'Расталған іс-шараны өзгертуге болмайды'; end if;
    update activities set type = (p->>'type')::activity_type, title = p->>'title', description = p->>'description',
      supervisor_id = sup.id, place = p->>'place',
      audience_grades = coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'audience_grades') x), '{}'),
      capacity = nullif(p->>'capacity','')::int, schedule = (p->>'schedule')::schedule_kind,
      on_date = nullif(p->>'on_date','')::date,
      weekdays = (select array_agg(x::int) from jsonb_array_elements_text(p->'weekdays') x),
      date_from = nullif(p->>'date_from','')::date, date_to = nullif(p->>'date_to','')::date,
      start_time = (p->>'start_time')::time, end_time = (p->>'end_time')::time,
      slots = case when jsonb_array_length(coalesce(p->'slots', '[]')) > 0 then p->'slots' end,
      status = st, updated_at = now()
    where id = aid;
  else
    insert into activities (school_id, type, title, description, author_id, supervisor_id, place, audience_grades, capacity,
      schedule, on_date, weekdays, date_from, date_to, start_time, end_time, slots, status)
    values (u.school_id, (p->>'type')::activity_type, p->>'title', p->>'description', u.id, sup.id, p->>'place',
      coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'audience_grades') x), '{}'),
      nullif(p->>'capacity','')::int, (p->>'schedule')::schedule_kind, nullif(p->>'on_date','')::date,
      (select array_agg(x::int) from jsonb_array_elements_text(p->'weekdays') x),
      nullif(p->>'date_from','')::date, nullif(p->>'date_to','')::date,
      (p->>'start_time')::time, (p->>'end_time')::time,
      case when jsonb_array_length(coalesce(p->'slots', '[]')) > 0 then p->'slots' end, st)
    returning id into aid;
    -- extra dates of a one-time event (several days)
    insert into activity_sessions (activity_id, on_date, start_time, end_time, created_by)
      select aid, (x->>'date')::date, (x->>'start')::time, (x->>'end')::time, u.id from jsonb_array_elements(coalesce(p->'extra', '[]')) x;
  end if;

  insert into approvals (activity_id, step, actor_id, decision) values (aid, st, u.id, 'submitted');
  if st = 'pending_class_teacher' then
    perform notify(ct, 'Жаңа ұсыныс', u.full_name || ': ' || (p->>'title'), '/a/' || aid);
  elsif st = 'pending_deputy' then
    perform notify(d.id, 'Жаңа ұсыныс', u.full_name || ': ' || (p->>'title'), '/a/' || aid)
      from profiles d where d.school_id = u.school_id and d.role = 'deputy';
  end if;
  if sup.id <> u.id then
    perform notify(sup.id, 'Сізді жауапты етіп көрсетті', p->>'title', '/a/' || aid);
  end if;
  return aid;
end $$;
