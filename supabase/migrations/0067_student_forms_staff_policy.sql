-- 0067: allow class council (class teacher, tutor, deputy) to update student questionnaire answers
create policy sf_staff_write on student_forms for all to authenticated
  using (exists (select 1 from profiles p where p.id = student_forms.student_id and class_council(p.class_id)))
  with check (exists (select 1 from profiles p where p.id = student_forms.student_id and class_council(p.class_id)));
