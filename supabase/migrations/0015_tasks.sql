-- 0015: tasks — a student's own to-dos, or a task a teacher gives to a class or to an activity's participants.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id),
  author_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title text not null check (length(title) between 2 and 200),
  notes text check (notes is null or length(notes) <= 2000),
  due_on date,
  class_id uuid references classes(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (class_id is null or activity_id is null)
);
create index tasks_class on tasks(class_id);
create index tasks_activity on tasks(activity_id);

create table task_done (
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create function task_visible(p_task uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t where t.id = p_task and t.school_id = my_school() and (
    t.author_id = auth.uid()
    or (t.class_id is not null and exists (select 1 from profiles p where p.id = auth.uid() and p.class_id = t.class_id))
    or (t.activity_id is not null and exists (select 1 from enrollments e where e.activity_id = t.activity_id and e.student_id = auth.uid() and not e.waitlisted))))
$$;

-- class: its class teacher, anyone teaching it, a deputy · activity: supervisor, curator, a deputy
create function can_assign(p_class uuid, p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_class is null and p_activity is null then true
    when p_class is not null then is_deputy()
      or exists (select 1 from classes k where k.id = p_class and k.teacher_id = auth.uid())
      or exists (select 1 from timetable t where t.class_id = p_class and t.teacher_id = auth.uid())
    else is_deputy() or exists (select 1 from activities a where a.id = p_activity and auth.uid() in (a.supervisor_id, a.curator_id)) end
$$;

alter table tasks enable row level security;
alter table task_done enable row level security;
create policy task_read on tasks for select to authenticated using (task_visible(id));
create policy task_own on tasks for all to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid() and school_id = my_school() and can_assign(class_id, activity_id));
create policy done_read on task_done for select to authenticated using (user_id = auth.uid()
  or exists (select 1 from tasks t where t.id = task_id and t.author_id = auth.uid()));
create policy done_own on task_done for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and task_visible(task_id));

create function tasks_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is not null or new.activity_id is not null then
    perform notify(x.uid, 'Жаңа тапсырма', new.title, '/plan') from (
      select p.id as uid from profiles p where p.class_id = new.class_id and p.role = 'student'
      union select e.student_id from enrollments e where e.activity_id = new.activity_id and not e.waitlisted) x
    where x.uid <> new.author_id;
  end if;
  return new;
end $$;
create trigger tasks_notify after insert on tasks for each row execute function tasks_notify();

revoke execute on function task_visible, can_assign, tasks_notify from public, anon;
grant execute on function task_visible, can_assign to authenticated;
