-- 0028b: run by hand in the SQL Editor (the tool refuses DROP).
-- The old check demands weekdays for a weekly activity; 0028 added activities_schedule_ok, which allows
-- "times later, in the calendar" (weekly, no weekdays, sessions added from the calendar).
alter table activities drop constraint activities_check1;
notify pgrst, 'reload schema';
