-- 0071: Student roadmaps table, security policies and RPC helper for saving roadmaps

create table if not exists student_roadmaps (
  student_id uuid primary key references profiles(id) on delete cascade,
  goals jsonb not null default '[]' check (jsonb_typeof(goals) = 'array'),
  habits jsonb not null default '[]' check (jsonb_typeof(habits) = 'array'),
  tasks jsonb not null default '[]' check (jsonb_typeof(tasks) = 'array'),
  updated_at timestamptz not null default now()
);

alter table student_roadmaps enable row level security;

drop policy if exists srm_own on student_roadmaps;
create policy srm_own on student_roadmaps for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists srm_staff on student_roadmaps;
create policy srm_staff on student_roadmaps for all to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = student_id
        and (p.id = auth.uid() or class_council(p.class_id) or is_staff())
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = student_id
        and (p.id = auth.uid() or class_council(p.class_id) or is_staff())
    )
  );

create or replace function save_student_roadmap(
  p_student_id uuid,
  p_goals jsonb default '[]'::jsonb,
  p_habits jsonb default '[]'::jsonb,
  p_tasks jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> p_student_id then
    if not exists (
      select 1 from profiles s
      where s.id = p_student_id
        and s.school_id = my_school()
        and (is_deputy() or class_council(s.class_id) or is_staff())
    ) then
      raise exception 'Құқығыңыз жоқ';
    end if;
  end if;

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (p_student_id, coalesce(p_goals, '[]'::jsonb), coalesce(p_habits, '[]'::jsonb), coalesce(p_tasks, '[]'::jsonb), now())
  on conflict (student_id)
  do update set
    goals = excluded.goals,
    habits = excluded.habits,
    tasks = excluded.tasks,
    updated_at = now();
end;
$$;

revoke execute on function save_student_roadmap from public, anon;
grant execute on function save_student_roadmap to authenticated;
