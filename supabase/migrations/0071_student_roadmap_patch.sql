-- 0071: update one roadmap lane atomically (goal edits and habit checks cannot overwrite each other)
create or replace function patch_student_roadmap(
  p_student_id uuid,
  p_goals jsonb default null,
  p_habits jsonb default null,
  p_tasks jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class uuid;
begin
  if auth.uid() is null then
    raise exception 'Кіру қажет';
  end if;

  if auth.uid() <> p_student_id then
    select class_id into target_class from profiles where id = p_student_id;
    if target_class is null or not class_council(target_class) then
      raise exception 'Бұл оқушының жоспарын өзгертуге рұқсат жоқ';
    end if;
  end if;

  if p_goals is not null and jsonb_typeof(p_goals) <> 'array' then
    raise exception 'Мақсаттар тізімі қате';
  end if;
  if p_habits is not null and jsonb_typeof(p_habits) <> 'array' then
    raise exception 'Әдеттер тізімі қате';
  end if;
  if p_tasks is not null and jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'Тапсырмалар тізімі қате';
  end if;

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (p_student_id, coalesce(p_goals, '[]'::jsonb), coalesce(p_habits, '[]'::jsonb), coalesce(p_tasks, '[]'::jsonb), now())
  on conflict (student_id) do update set
    goals = coalesce(p_goals, student_roadmaps.goals),
    habits = coalesce(p_habits, student_roadmaps.habits),
    tasks = coalesce(p_tasks, student_roadmaps.tasks),
    updated_at = now();
end;
$$;

grant execute on function patch_student_roadmap(uuid, jsonb, jsonb, jsonb) to authenticated;
