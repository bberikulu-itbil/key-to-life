-- 0046 (1.2.0): initiatives without a place or a fixed time, a room from the list booked on approval,
-- join requests, tournament matches and results, certificates; notifications split by kind and room,
-- chat complaints go to the chat's own moderators.
-- Run as one script in the Supabase SQL Editor.

/* ---------- place and time are optional ---------- */
-- the old check wanted 2..120 characters; drop it whatever its name, an empty place is now allowed
do $$ declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'activities'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%place%' loop
    execute format('alter table activities drop constraint %I', c);
  end loop;
end $$;
alter table activities add constraint activities_place_len check (length(place) <= 120);
alter table activities add column if not exists no_time boolean not null default false,   -- shown as "all day", times are placeholders
  add column if not exists resource_id uuid references resources(id) on delete set null,  -- the room picked from the list
  add column if not exists join_requests boolean not null default false;                  -- joining needs the leader's yes

alter table bookings add column if not exists activity_id uuid references activities(id) on delete cascade;
create index if not exists bookings_activity on bookings(activity_id);

-- the author (while pending) or the leader sets them right after submit_activity / update_activity
create or replace function set_activity_extras(p_id uuid, p_no_time boolean, p_resource uuid, p_join_requests boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a activities;
begin
  select * into a from activities where id = p_id;
  if a.id is null or a.school_id <> my_school()
     or not (can_manage_activity(p_id) or (a.author_id = auth.uid() and a.status <> 'approved')) then
    raise exception 'Құқығыңыз жоқ'; end if;
  if p_resource is not null and not exists (select 1 from resources r where r.id = p_resource and r.school_id = a.school_id and r.active) then
    raise exception 'Орын табылмады'; end if;
  update activities set no_time = coalesce(p_no_time, false), resource_id = p_resource, join_requests = coalesce(p_join_requests, false)
    where id = p_id;
end $$;

-- every session date of an activity from today on, with its times (weekly slots, extra sessions); at most 200
create or replace function activity_dates(a activities) returns table(d date, st time, en time)
language sql stable set search_path = public as $$
  select x.d, x.st, x.en from (
    select a.on_date as d, a.start_time as st, a.end_time as en where a.schedule = 'once'
    union
    select g::date, coalesce((s->>'start')::time, a.start_time), coalesce((s->>'end')::time, a.end_time)
      from generate_series(a.date_from, a.date_to, interval '1 day') g
      left join lateral (select s from jsonb_array_elements(coalesce(a.slots, '[]'::jsonb)) s
                         where (s->>'wd')::int = extract(isodow from g)::int limit 1) sl on true
      where a.schedule = 'weekly' and (case when a.slots is not null then sl.s is not null
                                            else extract(isodow from g)::int = any(coalesce(a.weekdays, '{}')) end)
    union
    select x.on_date, x.start_time, x.end_time from activity_sessions x where x.activity_id = a.id
  ) x where x.d >= school_today(a.school_id) and x.en > x.st
  order by x.d limit 200
$$;

-- approved with a room (or the room changed): book the room for every future session; busy slots are reported
create or replace function activity_book_room() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; busy int := 0; booked int := 0; room resources;
begin
  if new.status <> 'approved' or new.removed_at is not null or new.archived_at is not null then
    -- cancelled, removed or archived: the room is free again
    update bookings set status = 'cancelled' where activity_id = new.id and status in ('pending', 'approved')
      and on_date >= school_today(new.school_id);
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and old.resource_id is not distinct from new.resource_id
     and old.start_time = new.start_time and old.end_time = new.end_time and old.slots::text is not distinct from new.slots::text
     and old.on_date is not distinct from new.on_date and old.date_from is not distinct from new.date_from
     and old.date_to is not distinct from new.date_to and old.weekdays is not distinct from new.weekdays
     and old.no_time = new.no_time then return new; end if;
  -- the old room bookings of this activity give way to the new plan
  update bookings set status = 'cancelled' where activity_id = new.id and status in ('pending', 'approved')
    and on_date >= school_today(new.school_id);
  if new.resource_id is null or new.no_time then return new; end if;
  select * into room from resources where id = new.resource_id;
  for r in select * from activity_dates(new) loop
    begin
      insert into bookings (resource_id, user_id, on_date, start_time, end_time, purpose, status, decided_by, decided_at, activity_id)
        values (new.resource_id, new.supervisor_id, r.d, r.st, r.en, left('Бастама: ' || new.title, 300), 'approved', new.supervisor_id, now(), new.id);
      booked := booked + 1;
    exception when exclusion_violation then busy := busy + 1;
    end;
  end loop;
  if busy > 0 then
    perform notify(new.supervisor_id, 'Орын кейбір күндері бос емес',
      room.name || ': ' || busy || ' сабаққа брондалмады, ' || booked || ' сабаққа брондалды', '/a/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists activities_book_room on activities;
create trigger activities_book_room after insert or update on activities for each row execute function activity_book_room();

/* ---------- join requests ---------- */
create table if not exists join_requests (
  activity_id uuid not null references activities(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  decided_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);
alter table join_requests enable row level security;
drop policy if exists jr_read on join_requests;
create policy jr_read on join_requests for select to authenticated using (student_id = auth.uid() or can_manage_activity(activity_id)
  or exists (select 1 from activity_curators c where c.activity_id = join_requests.activity_id and c.student_id = auth.uid()));

create or replace function request_join(p_id uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities; g int;
begin
  select * into a from activities where id = p_id;
  if a.id is null or a.school_id <> u.school_id or a.status <> 'approved' or a.removed_at is not null then raise exception 'Іс-шара табылмады'; end if;
  if not a.enrollment_open or a.archived_at is not null then raise exception 'Тіркелу жабық'; end if;
  if u.role <> 'student' then raise exception 'Тек оқушылар жазыла алады'; end if;
  select grade into g from classes where id = u.class_id;
  if a.audience_grades <> '{}' and (g is null or not g = any(a.audience_grades)) then raise exception 'Бұл іс-шара сіздің сыныпқа арналмаған'; end if;
  if exists (select 1 from enrollments where activity_id = p_id and student_id = u.id) then raise exception 'Сіз бұрыннан қатысушысыз'; end if;
  insert into join_requests (activity_id, student_id, note) values (p_id, u.id, nullif(trim(p_note), ''))
    on conflict (activity_id, student_id) do update set note = excluded.note, status = 'pending', decided_by = null, created_at = now();
  perform notify(x.uid, 'Қатысуға өтінім', u.full_name || ' · ' || a.title, '/a/' || p_id)
    from (select a.supervisor_id uid union select c.student_id from activity_curators c where c.activity_id = p_id) x;
end $$;

create or replace function decide_join(p_id uuid, p_student uuid, p_accept boolean) returns void language plpgsql security definer set search_path = public as $$
declare a activities; n int;
begin
  select * into a from activities where id = p_id for update;
  if not (can_manage_activity(p_id) or exists (select 1 from activity_curators c where c.activity_id = p_id and c.student_id = auth.uid())) then
    raise exception 'Құқығыңыз жоқ'; end if;
  update join_requests set status = case when p_accept then 'accepted' else 'declined' end, decided_by = auth.uid()
    where activity_id = p_id and student_id = p_student and status = 'pending';
  if not found then raise exception 'Өтінім табылмады'; end if;
  if p_accept then
    select count(*) into n from enrollments where activity_id = p_id and not waitlisted;
    insert into enrollments (activity_id, student_id, waitlisted) values (p_id, p_student, a.capacity is not null and n >= a.capacity)
      on conflict do nothing;
  end if;
  perform notify(p_student, case when p_accept then 'Өтініміңіз қабылданды' else 'Өтініміңіз қабылданбады' end, a.title, '/a/' || p_id);
end $$;

/* ---------- tournament: matches and final places ---------- */
create table if not exists activity_matches (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  round text not null check (length(trim(round)) between 1 and 40),        -- «1/4 финал», «Тур 2»
  side_a text not null check (length(trim(side_a)) between 1 and 80),
  side_b text not null check (length(trim(side_b)) between 1 and 80),
  score_a int check (score_a between 0 and 999),
  score_b int check (score_b between 0 and 999),
  played_on date,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists activity_results (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  place int not null check (place between 1 and 100),
  name text not null check (length(trim(name)) between 1 and 120),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists matches_activity on activity_matches(activity_id, sort);
create index if not exists results_activity on activity_results(activity_id, place);
alter table activity_matches enable row level security;
alter table activity_results enable row level security;
drop policy if exists match_read on activity_matches;
create policy match_read on activity_matches for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
drop policy if exists match_write on activity_matches;
create policy match_write on activity_matches for all to authenticated using (can_manage_activity(activity_id)) with check (can_manage_activity(activity_id));
drop policy if exists result_read on activity_results;
create policy result_read on activity_results for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
drop policy if exists result_write on activity_results;
create policy result_write on activity_results for all to authenticated using (can_manage_activity(activity_id)) with check (can_manage_activity(activity_id));

/* ---------- certificates ---------- */
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('C-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  school_id uuid not null references schools(id),
  activity_id uuid not null references activities(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),     -- «1-орын», «Белсенді қатысқаны үшін»
  issued_by uuid not null references profiles(id),
  issued_at timestamptz not null default now()
);
create index if not exists certificates_student on certificates(student_id);
alter table certificates enable row level security;
drop policy if exists cert_read on certificates;
create policy cert_read on certificates for select to authenticated using (school_id = my_school()
  and (student_id = auth.uid() or is_staff() or can_manage_activity(activity_id)));

create or replace function issue_certificates(p_id uuid, p_students uuid[], p_title text) returns int
language plpgsql security definer set search_path = public as $$
declare a activities; n int;
begin
  if not can_manage_activity(p_id) then raise exception 'Сертификатты жетекші береді'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'Сертификат атауын жазыңыз'; end if;
  select * into a from activities where id = p_id;
  insert into certificates (school_id, activity_id, student_id, title, issued_by)
    select a.school_id, p_id, e.student_id, trim(p_title), auth.uid() from enrollments e
    where e.activity_id = p_id and e.student_id = any(p_students) and not e.waitlisted;
  get diagnostics n = row_count;
  perform notify(e.student_id, 'Сізге сертификат берілді', a.title || ' · ' || trim(p_title), '/a/' || p_id)
    from enrollments e where e.activity_id = p_id and e.student_id = any(p_students) and not e.waitlisted;
  return n;
end $$;

-- the check page behind a certificate's QR: any signed-in user of the school sees who got what
create or replace function get_certificate(p_code text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', c.code, 'title', c.title, 'issued_at', c.issued_at, 'student', p.full_name,
    'class', k.name, 'activity', a.title, 'type', a.type, 'issuer', i.full_name, 'school', s.name)
  from certificates c join profiles p on p.id = c.student_id left join classes k on k.id = p.class_id
    join activities a on a.id = c.activity_id join profiles i on i.id = c.issued_by join schools s on s.id = c.school_id
  where c.code = upper(trim(p_code)) and c.school_id = my_school()
$$;

/* ---------- notifications: own chats per kind and room; complaints to the chat's moderators ---------- */
create or replace function mark_notices_read(p_ids bigint[]) returns void language sql security definer set search_path = public as
$$ update notifications set read_at = now() where user_id = auth.uid() and read_at is null and id = any(p_ids) $$;

-- booking requests carry the room in the link, so each room gets its own chat
create or replace function create_booking(p_resource uuid, p_date date, p_start time, p_end time, p_purpose text) returns text
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); r resources; st booking_status; c text; boss boolean;
begin
  select * into r from resources where id = p_resource;
  if r.id is null or not sees_resource(r) then raise exception 'Орын табылмады'; end if;
  boss := manages_resource(r.id);
  if r.mode = 'closed' and not boss then raise exception 'Бұл бөлме броньдалмайды'; end if;
  if p_date < school_today(r.school_id) then raise exception 'Өткен күнді броньдауға болмайды'; end if;
  if p_start < r.open_from or p_end > r.open_to or p_end <= p_start then raise exception 'Уақыт орынның ашық сағатынан тыс'; end if;
  if (extract(epoch from p_start - r.open_from) / 60)::int % r.slot_minutes <> 0
     or (extract(epoch from p_end - p_start) / 60)::int % r.slot_minutes <> 0 then raise exception 'Уақытты слоттар бойынша таңдаңыз'; end if;
  if coalesce(length(trim(p_purpose)), 0) < 3 then raise exception 'Мақсатын жазыңыз'; end if;
  st := case when boss or r.mode = 'open' then 'approved' else 'pending' end;
  insert into bookings (resource_id, user_id, on_date, start_time, end_time, purpose, status, decided_by, decided_at)
    values (p_resource, u.id, p_date, p_start, p_end, trim(p_purpose), st,
            case when st = 'approved' then u.id end, case when st = 'approved' then now() end)
    returning code into c;
  if st = 'pending' then
    perform notify(m.user_id, 'Бронь сұрауы', u.full_name || ' · ' || r.name || ' · ' || to_char(p_date, 'DD.MM') || ' ' || to_char(p_start, 'HH24:MI'),
      '/bookings/review?r=' || r.id)
      from (select r.manager_id user_id union select unnest(r.managers)) m;
  end if;
  return c;
exception when exclusion_violation then raise exception 'Бұл уақыт бос емес — басқа слот таңдаңыз';
end $$;

-- who looks after a chat: a channel's owner, a class's teacher and tutor, an activity's leader; nobody → deputies
create or replace function chat_moderators(p_chat uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  with m as (
    select c.created_by uid from chats c where c.id = p_chat and c.kind = 'channel'
    union select k.teacher_id from chats c join classes k on k.id = c.class_id where c.id = p_chat
    union select k.tutor_id from chats c join classes k on k.id = c.class_id where c.id = p_chat
    union select a.supervisor_id from chats c join activities a on a.id = c.activity_id where c.id = p_chat
  )
  select uid from m where uid is not null
  union
  select d.id from profiles d join chats c on c.id = p_chat
    where d.school_id = c.school_id and d.role in ('deputy', 'admin') and not exists (select 1 from m where uid is not null)
$$;

create or replace function report_message(p_msg bigint, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare u profiles := me(); m messages; t text;
begin
  select * into m from messages where id = p_msg;
  if m.id is null or not can_see_chat(m.chat_id) or m.removed_at is not null then raise exception 'Хабар табылмады'; end if;
  insert into chat_reports(school_id, message_id, reporter_id, author_id, body, reason) values (u.school_id, p_msg, u.id, m.author_id, m.body, trim(p_reason));
  select coalesce(c.title, a.title, k.name || ' сыныбы', 'Жеке хат') into t
    from chats c left join activities a on a.id = c.activity_id left join classes k on k.id = c.class_id where c.id = m.chat_id;
  perform notify(x, 'Шағым · ' || t, left(m.body, 120), '/chats/reports?c=' || m.chat_id) from chat_moderators(m.chat_id) x where x <> u.id;
end $$;

alter policy rep_read on chat_reports using (school_id = my_school() and (is_deputy()
  or exists (select 1 from profiles p join classes k on k.id = p.class_id where p.id = author_id and k.teacher_id = auth.uid())
  or exists (select 1 from messages x where x.id = message_id and can_moderate(x.chat_id))));

create or replace function resolve_report(p_id bigint, p_remove boolean) returns void language plpgsql security definer set search_path = public as $$
declare r chat_reports;
begin
  select * into r from chat_reports where id = p_id;
  if r.id is null or r.school_id <> my_school() or not (is_deputy()
     or exists (select 1 from profiles p join classes k on k.id = p.class_id where p.id = r.author_id and k.teacher_id = auth.uid())
     or exists (select 1 from messages x where x.id = r.message_id and can_moderate(x.chat_id))) then
    raise exception 'Құқығыңыз жоқ'; end if;
  if p_remove and r.message_id is not null then
    update messages set body = 'Хабар өшірілді', poll = null, removed_at = now() where id = r.message_id;
  end if;
  update chat_reports set resolved_by = auth.uid(), resolved_at = now(), removed = p_remove where id = p_id;
end $$;

revoke execute on function set_activity_extras, activity_dates, activity_book_room, request_join, decide_join, issue_certificates,
  get_certificate, mark_notices_read, chat_moderators from public, anon;
grant execute on function set_activity_extras, request_join, decide_join, issue_certificates, get_certificate, mark_notices_read to authenticated;
notify pgrst, 'reload schema';
