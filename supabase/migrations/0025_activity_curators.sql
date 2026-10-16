-- 0025: allow multiple responsible students for an activity.
create table activity_curators (
  activity_id uuid not null references activities(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);
create index activity_curators_student on activity_curators(student_id);
alter table activity_curators enable row level security;

create policy activity_curators_read on activity_curators for select to authenticated using (
  exists (select 1 from activities a where a.id = activity_id and a.school_id = my_school())
);
create policy activity_curators_write on activity_curators for all to authenticated using (
  exists (select 1 from activities a where a.id = activity_id and a.school_id = my_school()
    and (a.supervisor_id = auth.uid() or is_deputy()))
) with check (
  exists (select 1 from activities a where a.id = activity_id and a.school_id = my_school()
    and (a.supervisor_id = auth.uid() or is_deputy()))
);

insert into activity_curators (activity_id, student_id)
select id, curator_id from activities where curator_id is not null
on conflict do nothing;

create function set_curators(p_activity uuid, p_students uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  a activities;
  ids uuid[] := coalesce(p_students, '{}');
  first_id uuid;
begin
  select * into a from activities where id = p_activity for update;
  if a.id is null or a.school_id <> my_school() then raise exception 'Іс-шара табылмады'; end if;
  if not (a.supervisor_id = auth.uid() or is_deputy()) then raise exception 'Жауапты оқушыларды жетекші немесе орынбасар өзгертеді'; end if;
  if exists (
    select 1 from unnest(ids) s
    where not exists (select 1 from enrollments e where e.activity_id = p_activity and e.student_id = s and not e.waitlisted)
  ) then raise exception 'Жауапты оқушы іс-шара қатысушысы болуы керек'; end if;

  delete from activity_curators where activity_id = p_activity;
  insert into activity_curators (activity_id, student_id)
    select p_activity, s from unnest(ids) s on conflict do nothing;
  first_id := ids[1];
  update activities set curator_id = first_id where id = p_activity;

  perform notify(c.student_id, 'Сіз жауапты оқушы болдыңыз', a.title, '/a/' || p_activity)
    from activity_curators c
    where c.activity_id = p_activity and c.student_id <> auth.uid();
end $$;

-- Keep absence requests compatible with the new list of responsible students.
create or replace function request_absence(p_activity uuid, p_date date, p_category text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u profiles := me();
  a activities;
  rid uuid;
begin
  select * into a from activities where id = p_activity;
  if a.id is null or a.school_id <> u.school_id then raise exception 'Іс-шара табылмады'; end if;
  if not exists (select 1 from enrollments where activity_id = p_activity and student_id = u.id and not waitlisted) then
    raise exception 'Сіз бұл іс-шараға жазылмағансыз'; end if;
  if p_date < school_today(a.school_id) then raise exception 'Өткен күнге рұқсат сұрауға болмайды'; end if;
  if not is_session(a, p_date) then raise exception 'Бұл күні сабақ жоқ'; end if;

  insert into absence_requests (student_id, activity_id, session_date, category, reason)
    values (u.id, p_activity, p_date, p_category, trim(p_reason)) returning id into rid;

  perform notify(a.supervisor_id, 'Рұқсат сұрау', u.full_name || ' · ' || a.title || ' · ' || to_char(p_date, 'DD.MM'), '/a/' || p_activity);
  perform notify(c.student_id, 'Рұқсат сұрау (жауапты оқушыға)', u.full_name || ' · ' || a.title || ' · ' || to_char(p_date, 'DD.MM'), '/a/' || p_activity)
    from activity_curators c
    where c.activity_id = p_activity and c.student_id <> u.id;

  return rid;
exception when unique_violation then raise exception 'Бұл күнге өтініш жіберіп қойғансыз';
end $$;

-- Activity chats should include every selected responsible student.
create or replace function chat_audience(p_chat uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from chats c join chat_members m on m.chat_id = c.id where c.id = p_chat and c.kind = 'direct'
  union select p.id from chats c join profiles p on p.class_id = c.class_id where c.id = p_chat and (c.kind = 'class' or c.audience = 'class')
  union select x.u from chats c join classes k on k.id = c.class_id cross join lateral unnest(array[k.teacher_id, k.tutor_id]) x(u)
    where c.id = p_chat and (c.kind = 'class' or c.audience = 'class') and x.u is not null
  union select x.u from chats c join activities a on a.id = c.activity_id cross join lateral unnest(array[a.supervisor_id, a.author_id, a.curator_id]) x(u)
    where c.id = p_chat and x.u is not null and 'chat' = any(a.features)
  union select ac.student_id from chats c join activities a on a.id = c.activity_id join activity_curators ac on ac.activity_id = a.id
    where c.id = p_chat and 'chat' = any(a.features)
  union select e.student_id from chats c join activities a on a.id = c.activity_id join enrollments e on e.activity_id = a.id
    where c.id = p_chat and not e.waitlisted and 'chat' = any(a.features)
  union select p.id from chats c join profiles p on p.school_id = c.school_id where c.id = p_chat and c.kind = 'channel'
    and (c.audience = 'all' or (c.audience = 'staff' and p.role <> 'student') or (c.audience = 'students' and p.role = 'student'))
  union select c.created_by from chats c where c.id = p_chat and c.kind = 'channel' and c.created_by is not null
$$;

revoke execute on function set_curators from public, anon;
grant execute on function set_curators to authenticated;
