-- Run once in Supabase Dashboard → SQL Editor (the MCP tool cannot confirm statements containing DELETE).
create function leave_activity(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare was_waiting boolean; nxt uuid; a activities;
begin
  select * into a from activities where id = p_id for update;
  delete from enrollments where activity_id = p_id and student_id = auth.uid() returning waitlisted into was_waiting;
  if was_waiting = false then
    select student_id into nxt from enrollments where activity_id = p_id and waitlisted order by created_at limit 1;
    if nxt is not null then
      update enrollments set waitlisted = false where activity_id = p_id and student_id = nxt;
      perform notify(nxt, 'Орын босады', 'Сіз енді қатысушысыз: ' || a.title, '/a/' || p_id);
    end if;
  end if;
end $$;
revoke execute on function leave_activity from public, anon;
grant execute on function leave_activity to authenticated;
