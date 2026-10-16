-- 0006a (applied): lock functions down to the RPC list
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function submit_activity, decide_activity, cancel_activity, join_activity,
  mark_attendance, request_absence, decide_absence, mark_notifications_read, attendance_rate to authenticated;
grant execute on function me, my_school, is_staff, is_deputy, school_today, is_session, can_keep_journal to authenticated;
alter function is_session(activities, date) set search_path = public;
