-- Leave requests (сыртқа шығу / сабақтан сұрану), duty roster, 20-minute escalation, QR verification.

create table duty_roster (
  school_id uuid not null references schools(id),
  weekday int not null check (weekday between 1 and 7),
  deputy_id uuid references profiles(id) on delete set null,
  primary key (school_id, weekday)
);

alter table activities add column curator_id uuid references profiles(id) on delete set null;   -- жауапты оқушы

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('L-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  school_id uuid not null references schools(id),
  student_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('outside','lesson')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  category text not null check (category in ('illness','family','documents','competition','other')),
  reason text not null check (length(reason) between 5 and 1000),
  teacher_id uuid references profiles(id),          -- lesson: subject teacher who decides
  class_teacher_id uuid references profiles(id),    -- snapshot at submit
  status text not null check (status in ('pending_class_teacher','pending_deputy','pending_teacher','approved','rejected','cancelled')),
  ct_opinion boolean,                               -- class teacher's answer, forwarded to the deputy
  ct_note text,
  escalated boolean not null default false,         -- class teacher did not answer in 20 minutes
  assigned_deputy uuid references profiles(id),
  deadline_at timestamptz,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '7 days'),
  check (kind <> 'lesson' or teacher_id is not null)
);
create index on leave_requests (school_id, status);
create index on leave_requests (student_id);
create index on leave_requests (school_id, starts_at);

alter table duty_roster enable row level security;
alter table leave_requests enable row level security;
create policy read_duty on duty_roster for select to authenticated using (school_id = my_school());
create policy read_leaves on leave_requests for select to authenticated using (
  student_id = auth.uid() or (is_staff() and school_id = my_school()));

create function duty_deputy(p_school uuid) returns uuid language sql stable security definer set search_path = public as
$$ select deputy_id from duty_roster where school_id = p_school and weekday = extract(isodow from school_today(p_school))::int $$;

-- notify the duty deputy, or every deputy when nobody is on the roster for today
create function notify_deputies(p_school uuid, p_assigned uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  select notify(d.id, p_title, p_body, p_link) from profiles d
  where d.school_id = p_school and d.role in ('deputy','admin') and (p_assigned is null or d.id = p_assigned) $$;

create function leave_label(l leave_requests) returns text language sql stable set search_path = public as
$$ select (select full_name from profiles where id = l.student_id) || ' · '
     || case l.kind when 'outside' then 'сыртқа шығу' else 'сабақтан сұрану' end || ' · '
     || to_char(l.starts_at at time zone (select tz from schools where id = l.school_id), 'DD.MM HH24:MI') || '–'
     || to_char(l.ends_at at time zone (select tz from schools where id = l.school_id), 'HH24:MI') $$;

create function create_leave(p_kind text, p_starts timestamptz, p_ends timestamptz, p_category text, p_reason text, p_teacher uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare u profiles := me(); ct uuid; l leave_requests; dep uuid;
begin
  if u.role <> 'student' then raise exception 'Рұқсатты оқушы сұрайды'; end if;
  if p_ends <= p_starts then raise exception 'Қайту уақыты шығу уақытынан кейін болуы керек'; end if;
  if p_starts < now() - interval '15 minutes' then raise exception 'Өткен уақытқа рұқсат сұрауға болмайды'; end if;
  select teacher_id into ct from classes where id = u.class_id;
  if p_kind = 'lesson' and not exists (select 1 from profiles where id = p_teacher and school_id = u.school_id and role <> 'student') then
    raise exception 'Пән мұғалімін таңдаңыз'; end if;

  insert into leave_requests (school_id, student_id, kind, starts_at, ends_at, category, reason, teacher_id, class_teacher_id, status, deadline_at, assigned_deputy)
  values (u.school_id, u.id, p_kind, p_starts, p_ends, p_category, trim(p_reason),
    case when p_kind = 'lesson' then p_teacher end, ct,
    case when p_kind = 'lesson' then 'pending_teacher' when ct is null then 'pending_deputy' else 'pending_class_teacher' end,
    case when p_kind = 'outside' and ct is not null then now() + interval '20 minutes' end,
    case when p_kind = 'outside' and ct is null then duty_deputy(u.school_id) end)
  returning * into l;

  if l.status = 'pending_teacher' then
    perform notify(p_teacher, 'Сабақтан сұрану', leave_label(l), '/leaves');
    if ct is not null and ct <> p_teacher then perform notify(ct, 'Оқушыңыз сабақтан сұранды (хабарлама)', leave_label(l), '/leaves'); end if;
  elsif l.status = 'pending_class_teacher' then
    perform notify(ct, 'Сыртқа шығуға рұқсат сұрауы · 20 минут', leave_label(l), '/leaves');
  else
    perform notify_deputies(u.school_id, l.assigned_deputy, 'Сыртқа шығуға рұқсат сұрауы', leave_label(l), '/leaves');
  end if;
  return l.code;
end $$;

create function decide_leave(p_id uuid, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); l leave_requests; final boolean := false;
begin
  select * into l from leave_requests where id = p_id for update;
  if l.id is null or l.school_id <> u.school_id then raise exception 'Өтініш табылмады'; end if;
  if l.status not like 'pending%' then raise exception 'Өтініш шешіліп қойған'; end if;

  if u.role in ('deputy','admin') then
    final := true;                                     -- a deputy may decide at any step
  elsif l.status = 'pending_class_teacher' and u.id = l.class_teacher_id then
    update leave_requests set ct_opinion = p_approve, ct_note = nullif(trim(p_note), ''), status = 'pending_deputy',
      assigned_deputy = duty_deputy(l.school_id), deadline_at = null where id = p_id returning * into l;
    perform notify_deputies(l.school_id, l.assigned_deputy, 'Рұқсат сұрауы · сынып жетекшісі ' || case when p_approve then 'келіседі' else 'келіспейді' end,
      leave_label(l) || coalesce(' · «' || l.ct_note || '»', ''), '/leaves');
    perform notify(l.student_id, 'Сынып жетекшісі жауап берді', 'Өтінішіңіз орынбасарға жіберілді', '/leaves');
    return l.status;
  elsif l.status = 'pending_teacher' and u.id = l.teacher_id then
    final := true;
  else
    raise exception 'Бұл өтінішті шешуге құқығыңыз жоқ';
  end if;

  if not p_approve and coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Бас тарту себебін жазыңыз'; end if;
  update leave_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = u.id, decided_at = now(), decision_note = nullif(trim(p_note), ''), deadline_at = null
  where id = p_id returning * into l;
  perform notify(l.student_id, case when p_approve then 'Рұқсат берілді · ' || l.code else 'Рұқсат берілмеді' end,
    leave_label(l) || coalesce(' · ' || l.decision_note, ''), '/leaves');
  if l.kind = 'lesson' and l.class_teacher_id is not null and l.class_teacher_id <> u.id then
    perform notify(l.class_teacher_id, 'Сабақтан сұрану ' || case when p_approve then 'мақұлданды' else 'мақұлданбады' end, leave_label(l), '/leaves');
  end if;
  return l.status;
end $$;

create function cancel_leave(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update leave_requests set status = 'cancelled', deadline_at = null
  where id = p_id and student_id = auth.uid() and (status like 'pending%' or (status = 'approved' and ends_at > now()));
  if not found then raise exception 'Бұл өтінішті тоқтату мүмкін емес'; end if;
end $$;

-- runs every minute from pg_cron; not callable by users
create function escalate_leaves() returns int
language plpgsql security definer set search_path = public as $$
declare l leave_requests; e leave_requests; n int := 0;
begin
  for l in select * from leave_requests where status = 'pending_class_teacher' and deadline_at <= now() for update skip locked loop
    update leave_requests set status = 'pending_deputy', escalated = true, deadline_at = null, assigned_deputy = duty_deputy(l.school_id)
      where id = l.id returning * into e;
    perform notify_deputies(e.school_id, e.assigned_deputy, 'Рұқсат сұрауы · сынып жетекшісі 20 минутта жауап бермеді', leave_label(e), '/leaves');
    perform notify(e.class_teacher_id, '20 минут өтті — өтініш орынбасарға жіберілді', leave_label(e), '/leaves');
    n := n + 1;
  end loop;
  return n;
end $$;

create function set_duty(p_weekday int, p_deputy uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() then raise exception 'Кестені тек орынбасар өзгертеді'; end if;
  if p_deputy is not null and not exists (select 1 from profiles where id = p_deputy and school_id = my_school() and role in ('deputy','admin')) then
    raise exception 'Орынбасарды таңдаңыз'; end if;
  insert into duty_roster (school_id, weekday, deputy_id) values (my_school(), p_weekday, p_deputy)
    on conflict (school_id, weekday) do update set deputy_id = excluded.deputy_id;
end $$;

create function set_curator(p_activity uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a activities;
begin
  select * into a from activities where id = p_activity;
  if a.id is null or a.school_id <> my_school() then raise exception 'Іс-шара табылмады'; end if;
  if not (auth.uid() = a.supervisor_id or is_deputy()) then raise exception 'Жауапты оқушыны жауапты мұғалім тағайындайды'; end if;
  if p_student is not null and not exists (select 1 from enrollments where activity_id = p_activity and student_id = p_student and not waitlisted) then
    raise exception 'Жауапты оқушы осы іс-шараның қатысушысы болуы керек'; end if;
  update activities set curator_id = p_student where id = p_activity;
  if p_student is not null then perform notify(p_student, 'Сіз жауапты оқушы болдыңыз', a.title, '/a/' || p_activity); end if;
end $$;

-- QR check: any teacher scans a code and sees whether it is valid right now
create function verify_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s uuid := my_school(); l leave_requests; b bookings; r resources;
begin
  if not is_staff() then raise exception 'QR-ды тек мұғалімдер тексереді'; end if;
  select * into l from leave_requests where code = upper(trim(p_code)) and school_id = s;
  if l.id is not null then
    return jsonb_build_object('type', 'leave', 'code', l.code, 'status', l.status, 'kind', l.kind,
      'student', (select full_name from profiles where id = l.student_id),
      'class', (select c.name from profiles p join classes c on c.id = p.class_id where p.id = l.student_id),
      'starts_at', l.starts_at, 'ends_at', l.ends_at, 'category', l.category,
      'decided_by', (select full_name from profiles where id = l.decided_by),
      'valid_now', l.status = 'approved' and now() between l.starts_at - interval '15 minutes' and l.ends_at);
  end if;
  select * into b from bookings where code = upper(trim(p_code));
  select * into r from resources where id = b.resource_id;
  if b.id is not null and r.school_id = s then
    return jsonb_build_object('type', 'booking', 'code', b.code, 'status', b.status, 'resource', r.name,
      'group', (select name from resource_groups where id = r.group_id),
      'user', (select full_name from profiles where id = b.user_id), 'date', b.on_date,
      'start', to_char(b.start_time, 'HH24:MI'), 'end', to_char(b.end_time, 'HH24:MI'), 'purpose', b.purpose,
      'valid_now', b.status = 'approved' and b.on_date = school_today(s)
        and (now() at time zone (select tz from schools where id = s))::time between b.start_time - interval '15 minutes' and b.end_time);
  end if;
  return null;
end $$;

revoke execute on function duty_deputy, notify_deputies, leave_label, create_leave, decide_leave, cancel_leave,
  escalate_leaves, set_duty, set_curator, verify_code from public, anon, authenticated;
grant execute on function create_leave, decide_leave, cancel_leave, set_duty, set_curator, verify_code to authenticated;

create extension if not exists pg_cron;
select cron.schedule('escalate-leaves', '* * * * *', $$select public.escalate_leaves()$$);
