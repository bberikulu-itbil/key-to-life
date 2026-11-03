-- 0072: Allow all teachers and staff to access and manage demo classes (e.g. 7-Демо)

create or replace function class_council(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (
    select 1 from classes k
    where k.id = p_class
      and k.school_id = my_school()
      and (
        auth.uid() in (k.teacher_id, k.tutor_id)
        or (is_staff() and (k.name ilike '%демо%' or k.name ilike '%demo%'))
      )
  );
$$;

create or replace function update_student(p_student uuid, p_full_name text, p_olympiad text, p_club text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from profiles p
    where p.id = p_student
      and p.role = 'student'
      and p.school_id = my_school()
      and (is_deputy() or class_council(p.class_id))
  ) then
    raise exception 'Оқушы мәліметін сынып жетекшісі немесе тәрбиеші өзгертеді';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then
    raise exception 'Аты-жөнін жазыңыз';
  end if;
  update profiles
  set full_name = trim(p_full_name),
      olympiad = nullif(trim(p_olympiad), ''),
      club = nullif(trim(p_club), '')
  where id = p_student;
end $$;

create or replace function can_edit_photo(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_student = auth.uid() or is_deputy() or exists (
    select 1 from profiles p
    where p.id = p_student
      and p.school_id = my_school()
      and class_council(p.class_id)
  );
$$;

revoke execute on function class_council, update_student, can_edit_photo from public, anon;
grant execute on function class_council, update_student, can_edit_photo to authenticated;
