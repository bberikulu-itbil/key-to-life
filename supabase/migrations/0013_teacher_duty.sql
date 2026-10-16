-- Teacher duty posts per weekday (deputy duty stays in duty_roster, used for leave escalation)
create table teacher_duty (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) default my_school(),
  weekday int not null check (weekday between 1 and 7),
  user_id uuid not null references profiles(id) on delete cascade,
  post text not null check (length(post) between 2 and 60),
  unique (school_id, weekday, user_id, post)
);
alter table teacher_duty enable row level security;
create policy td_read on teacher_duty for select to authenticated using (school_id = my_school());
create policy td_write on teacher_duty for all to authenticated using (school_id = my_school() and is_deputy())
  with check (school_id = my_school() and is_deputy()
    and exists (select 1 from profiles p where p.id = user_id and p.school_id = my_school() and p.role <> 'student'));
