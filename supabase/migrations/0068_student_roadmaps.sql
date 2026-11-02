-- 0068: rich student goals, habits and tasks for 1-on-1 mentor meetings
create table if not exists student_roadmaps (
  student_id uuid primary key references profiles(id) on delete cascade,
  goals jsonb not null default '[]' check (jsonb_typeof(goals) = 'array'),
  habits jsonb not null default '[]' check (jsonb_typeof(habits) = 'array'),
  tasks jsonb not null default '[]' check (jsonb_typeof(tasks) = 'array'),
  updated_at timestamptz not null default now()
);

alter table student_roadmaps enable row level security;

create policy srm_own on student_roadmaps for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy srm_staff on student_roadmaps for all to authenticated
  using (exists (select 1 from profiles p where p.id = student_id and (p.id = auth.uid() or class_council(p.class_id))))
  with check (exists (select 1 from profiles p where p.id = student_id and (p.id = auth.uid() or class_council(p.class_id))));
