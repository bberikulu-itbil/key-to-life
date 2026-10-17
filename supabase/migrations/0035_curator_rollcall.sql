-- 0035: a student in charge (curator) keeps the activity's roll call too.
create or replace function can_keep_journal(a activities) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (a.author_id, a.supervisor_id) or is_deputy()
    or exists (select 1 from activity_curators c where c.activity_id = a.id and c.student_id = auth.uid())
$$;
create policy curator_attendance on attendance for select to authenticated
  using (exists (select 1 from activity_curators c where c.activity_id = attendance.activity_id and c.student_id = auth.uid()));
