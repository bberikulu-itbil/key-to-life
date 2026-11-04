-- 0072: structured sibling information in the student profile
alter table student_profile_details
  add column if not exists siblings jsonb not null default '[]'::jsonb
  check (jsonb_typeof(siblings) = 'array');

create or replace function save_student_siblings(p_student_id uuid, p_siblings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> p_student_id and not student_dossier_staff(p_student_id) then
    raise exception 'Құқығыңыз жоқ';
  end if;
  if jsonb_typeof(p_siblings) <> 'array' then
    raise exception 'Бауырлар тізімі қате';
  end if;

  insert into student_profile_details(student_id, siblings, updated_by, updated_at)
  values (p_student_id, p_siblings, auth.uid(), now())
  on conflict (student_id) do update set
    siblings = excluded.siblings,
    updated_by = auth.uid(),
    updated_at = now();
end;
$$;

grant execute on function save_student_siblings(uuid, jsonb) to authenticated;
