-- 0069: Allow staff to insert/update student questionnaire (student_forms) and add save_student_form RPC

drop policy if exists sf_staff_write on student_forms;
create policy sf_staff_write on student_forms for all to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = student_forms.student_id
        and (class_council(p.class_id) or is_staff())
    )
  )
  with check (
    student_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = student_forms.student_id
        and (class_council(p.class_id) or is_staff())
    )
  );

create or replace function save_student_form(p_student_id uuid, p_answers jsonb)
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

  insert into student_forms(student_id, answers, updated_at)
  values (p_student_id, p_answers, now())
  on conflict (student_id)
  do update set answers = excluded.answers, updated_at = now();
end;
$$;
revoke execute on function save_student_form from public, anon;
grant execute on function save_student_form to authenticated;
