-- 0074: date periods for olympiad and club participation
alter table student_trajectory_items
  add column if not exists started_on date,
  add column if not exists ended_on date;

alter table student_trajectory_items
  drop constraint if exists student_trajectory_items_date_range;

alter table student_trajectory_items
  add constraint student_trajectory_items_date_range
  check (ended_on is null or started_on is null or ended_on >= started_on);

