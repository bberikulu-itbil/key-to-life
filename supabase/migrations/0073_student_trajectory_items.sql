-- 0073: hobby, sport, olympiad and club timetable for each student
create table if not exists student_trajectory_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('hobby', 'sport', 'olympiad', 'club')),
  title text not null check (length(trim(title)) between 2 and 160),
  days_of_week smallint[] not null default '{}',
  start_time time,
  end_time time,
  coach_or_place text,
  note text,
  created_by uuid not null default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time >= start_time),
  check (array_position(days_of_week, 0) is null and array_position(days_of_week, 8) is null)
);

create index if not exists student_trajectory_student on student_trajectory_items(student_id, kind, title);
alter table student_trajectory_items enable row level security;

create policy student_trajectory_read on student_trajectory_items
  for select to authenticated using (
    student_id = auth.uid() or exists (
      select 1 from profiles p where p.id = student_id and class_council(p.class_id)
    )
  );
create policy student_trajectory_write on student_trajectory_items
  for all to authenticated using (
    student_id = auth.uid() or exists (
      select 1 from profiles p where p.id = student_id and class_council(p.class_id)
    )
  ) with check (
    student_id = auth.uid() or exists (
      select 1 from profiles p where p.id = student_id and class_council(p.class_id)
    )
  );
