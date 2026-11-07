-- «Белсенділік»: class groups for a period, and per-student activity stats for the class calendar.

create table class_groups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index class_groups_class on class_groups(class_id);

create table class_group_members (
  group_id uuid not null references class_groups(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  primary key (group_id, student_id)
);

alter table class_groups enable row level security;
alter table class_group_members enable row level security;
create policy cg_read on class_groups for select using (class_member(class_id));
create policy cg_write on class_groups for all using (class_council(class_id)) with check (class_council(class_id));
create policy cgm_read on class_group_members for select using (exists (select 1 from class_groups g where g.id = group_id and class_member(g.class_id)));
create policy cgm_write on class_group_members for all
  using (exists (select 1 from class_groups g where g.id = group_id and class_council(g.class_id)))
  with check (exists (select 1 from class_groups g join profiles p on p.id = student_id and p.class_id = g.class_id where g.id = group_id and class_council(g.class_id)));

-- One row per student of the class for [p_from, p_to]. Only the class teacher, tutor or a deputy may call it.
-- Events: a past (or «passed») event counts for a student who is listed as a participant,
-- or for everyone when the event lists no students (whole class). A home visit counts only for listed students.
create or replace function class_activity_stats(p_class uuid, p_from date, p_to date)
returns table (
  student_id uuid, events int, mentor int, tasks_total int, tasks_done int,
  habit_expected int, habit_checks int, goals_done int, parent_visits int, parent_meetings int, parent_other int
) language plpgsql stable security definer set search_path = public as $$
declare v_to date := least(p_to, current_date);
begin
  if not class_council(p_class) then raise exception 'Рұқсат жоқ'; end if;
  return query
  with s as (select p.id from profiles p where p.class_id = p_class and p.role = 'student' and p.removed_at is null),
  ev as (
    select e.id, e.type_codes, not exists (select 1 from class_event_participants x where x.event_id = e.id and x.kind = 'student') as whole
    from class_events e
    where e.class_id = p_class and e.on_date between p_from and v_to and e.status in ('planned', 'passed')
  ),
  hit as (  -- (event, student) pairs that count
    select ev.id, ev.type_codes, ev.whole, s.id as sid from ev cross join s
    where ev.whole or exists (select 1 from class_event_participants x where x.event_id = ev.id and x.kind = 'student' and x.student_id = s.id)
  )
  select s.id,
    (select count(*)::int from hit where hit.sid = s.id and not hit.type_codes && array['mentor', 'visit', 'parent_activity', 'hour_parent', 'meeting']),
    (select count(*)::int from mentor_meetings m where m.student_id = s.id and m.starts_at::date between p_from and v_to),
    (select count(*)::int from tasks t where (t.assignee_id = s.id or (t.class_id = p_class and t.assignee_id is null)) and coalesce(t.due_on, t.created_at::date) between p_from and p_to),
    (select count(*)::int from tasks t join task_done d on d.task_id = t.id and d.user_id = s.id
      where (t.assignee_id = s.id or (t.class_id = p_class and t.assignee_id is null)) and coalesce(t.due_on, t.created_at::date) between p_from and p_to),
    (select coalesce(sum(greatest(0, least(v_to, coalesce(h.archived_at::date, v_to)) - greatest(p_from, h.created_at::date) + 1)), 0)::int
      from habits h where h.owner_id = s.id),
    (select count(*)::int from habit_checks c join habits h on h.id = c.habit_id where h.owner_id = s.id and c.on_date between p_from and v_to),
    (select count(*)::int from goals g where g.owner_id = s.id and g.done_at::date between p_from and v_to),
    (select count(*)::int from parent_contacts c where c.student_id = s.id and c.channel = 'visit' and c.on_date between p_from and v_to)
      + (select count(*)::int from hit where hit.sid = s.id and hit.type_codes && array['visit'] and not hit.whole),
    (select count(*)::int from parent_contacts c where c.student_id = s.id and c.channel = 'meeting' and c.on_date between p_from and v_to)
      + (select count(*)::int from hit where hit.sid = s.id and hit.type_codes && array['parent_activity', 'hour_parent']),
    (select count(*)::int from parent_contacts c where c.student_id = s.id and c.channel in ('phone', 'chat') and c.on_date between p_from and v_to)
  from s;
end $$;
revoke execute on function class_activity_stats from public, anon;
grant execute on function class_activity_stats to authenticated;
