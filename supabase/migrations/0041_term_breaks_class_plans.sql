-- 0041: timetable rows hold for a date range and pause in school breaks; Etude is a class plan, not an initiative.
alter table timetable add column valid_from date, add column valid_to date;   -- null: no limit

create table school_breaks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null check (length(name) between 2 and 80),
  from_date date not null,
  to_date date not null check (to_date >= from_date)
);
alter table school_breaks enable row level security;
create policy breaks_read on school_breaks for select to authenticated using (school_id = my_school());

-- a class plan (Etude): roll call and the students' Plan work as before, but it is not listed among initiatives
alter table activities add column class_plan uuid references classes(id) on delete set null;
