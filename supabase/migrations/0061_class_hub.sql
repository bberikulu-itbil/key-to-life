-- 0061: recipes and class plans for the class hub.
-- Run this migration in the Supabase SQL Editor before testing the new screen.

create table class_hub_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  kind text not null check (kind in ('book', 'movie', 'recipe')),
  title text not null check (length(trim(title)) between 2 and 200),
  original_title text,
  release_year int check (release_year is null or release_year between 1000 and 2100),
  country text,
  duration_minutes int check (duration_minutes is null or duration_minutes between 1 and 2000),
  pages int check (pages is null or pages between 1 and 100000),
  volumes int not null default 1 check (volumes between 1 and 100),
  servings int check (servings is null or servings between 1 and 10000),
  prep_minutes int check (prep_minutes is null or prep_minutes between 1 and 10000),
  description text,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index class_hub_resources_class on class_hub_resources(class_id, kind, created_at desc);

create table class_hub_progress (
  resource_id uuid not null references class_hub_resources(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  volume int not null default 1 check (volume between 1 and 100),
  status text not null default 'saved' check (status in ('saved', 'in_progress', 'done')),
  rating int check (rating is null or rating between 1 and 5),
  note text,
  updated_at timestamptz not null default now(),
  primary key (resource_id, user_id, volume)
);
create index class_hub_progress_user on class_hub_progress(user_id);

alter table class_hub_resources enable row level security;
alter table class_hub_progress enable row level security;

create policy class_hub_resources_read on class_hub_resources for select to authenticated
  using (school_id = my_school() and class_member(class_id));
create policy class_hub_resources_write on class_hub_resources for all to authenticated
  using (class_council(class_id))
  with check (school_id = my_school() and created_by = auth.uid() and class_council(class_id));
create policy class_hub_progress_read on class_hub_progress for select to authenticated
  using (exists (select 1 from class_hub_resources r where r.id = resource_id and r.school_id = my_school() and class_member(r.class_id)));
create policy class_hub_progress_write on class_hub_progress for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from class_hub_resources r where r.id = resource_id and r.school_id = my_school() and class_member(r.class_id)));

-- Tutors can create class plans, and class managers can see completion counts.
create or replace function can_assign(p_class uuid, p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_class is null and p_activity is null then true
    when p_class is not null then is_deputy()
      or exists (select 1 from classes k where k.id = p_class and auth.uid() in (k.teacher_id, k.tutor_id))
      or exists (select 1 from timetable t where t.class_id = p_class and t.teacher_id = auth.uid())
    else is_deputy() or exists (select 1 from activities a where a.id = p_activity and auth.uid() in (a.supervisor_id, a.curator_id))
  end
$$;
create or replace function task_visible(p_task uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t where t.id = p_task and t.school_id = my_school() and (
    t.author_id = auth.uid() or t.assignee_id = auth.uid()
    or (t.assignee_id is null and t.class_id is not null and exists (select 1 from profiles p where p.id = auth.uid() and p.class_id = t.class_id))
    or (t.assignee_id is null and t.class_id is not null and can_assign(t.class_id, null))
    or (t.assignee_id is null and t.activity_id is not null and exists (select 1 from enrollments e where e.activity_id = t.activity_id and e.student_id = auth.uid() and not e.waitlisted))
  ))
$$;
create policy task_done_class_manager on task_done for select to authenticated using (
  exists (select 1 from tasks t where t.id = task_id and can_assign(t.class_id, t.activity_id))
);
revoke execute on function task_visible, can_assign from public, anon;
grant execute on function task_visible, can_assign to authenticated;
