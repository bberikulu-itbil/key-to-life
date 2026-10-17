-- 0031 (run by hand in the SQL Editor — it deletes the moved timetable rows): move 7Б Etude timetable rows into the class calendar and track weekend meals.
--
-- Etude rows are materialized for the next year so the existing calendar view can
-- show every weekly occurrence without a second recurrence engine.

alter table calendar_events
  add column responsible_name text
    check (responsible_name is null or length(responsible_name) <= 120);

insert into calendars (school_id, kind, class_id, name, color)
select k.school_id, 'class', k.id, k.name || ' сынып күнтізбесі', '#0e7490'
from classes k
where lower(trim(k.name)) in ('7б', '7b')
on conflict do nothing;

with target as (
  select
    t.id,
    t.class_id,
    t.weekday,
    t.start_time,
    t.end_time,
    t.subject,
    cal.id as calendar_id,
    s.tz,
    school_today(k.school_id) as first_day,
    case t.weekday
      when 1 then 'Шыңғыс'
      when 2 then 'Бағдәулет'
      when 3 then 'Шыңғыс'
      when 4 then 'Шыңғыс'
      when 7 then 'Шыңғыс'
      else null
    end as responsible_name
  from timetable t
  join classes k on k.id = t.class_id
  join schools s on s.id = k.school_id
  join calendars cal on cal.class_id = k.id and cal.kind = 'class'
  where lower(trim(k.name)) in ('7б', '7b')
    and lower(trim(t.subject)) in ('etude i', 'etude ii')
), occurrence as (
  select x.*, g::date as event_day
  from target x
  cross join lateral generate_series(x.first_day, x.first_day + 364, interval '1 day') g
  where extract(isodow from g)::int = x.weekday
)
insert into calendar_events (
  calendar_id, title, starts_at, ends_at, all_day, notes, import_uid, responsible_name
)
select
  o.calendar_id,
  o.subject,
  ((o.event_day + o.start_time) at time zone o.tz),
  ((o.event_day + o.end_time) at time zone o.tz),
  false,
  '7Б сабақ кестесінен сынып күнтізбесіне көшірілді',
  'etude:' || o.id::text || ':' || o.event_day::text,
  o.responsible_name
from occurrence o
where not exists (
  select 1
  from calendar_events e
  where e.calendar_id = o.calendar_id
    and e.import_uid = 'etude:' || o.id::text || ':' || o.event_day::text
);

delete from timetable t
using classes k
where k.id = t.class_id
  and lower(trim(k.name)) in ('7б', '7b')
  and lower(trim(t.subject)) in ('etude i', 'etude ii');

create table weekend_meals (
  school_id uuid not null references schools(id),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  weekend_start date not null check (extract(isodow from weekend_start) = 6),
  meal text not null check (meal in (
    'fri_dinner',
    'sat_breakfast',
    'sat_lunch',
    'sat_dinner',
    'sun_breakfast',
    'sun_lunch',
    'sun_dinner'
  )),
  will_eat boolean not null default true,
  updated_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (student_id, weekend_start, meal)
);
create index weekend_meals_class_date on weekend_meals(class_id, weekend_start);
alter table weekend_meals enable row level security;

create policy weekend_meals_read on weekend_meals for select to authenticated using (
  school_id = my_school()
  and (
    student_id = auth.uid()
    or is_deputy()
    or exists (
      select 1 from classes k
      where k.id = class_id and auth.uid() in (k.teacher_id, k.tutor_id)
    )
  )
);

create or replace function set_weekend_meal(
  p_weekend_start date,
  p_meal text,
  p_will_eat boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u profiles := me();
begin
  if u.id is null or u.role <> 'student' or u.class_id is null then
    raise exception 'Бұл белгі оқушыларға арналған';
  end if;
  if p_weekend_start is null or extract(isodow from p_weekend_start) <> 6 then
    raise exception 'Демалыс аптасының басы сенбі болуы керек';
  end if;
  if p_meal is null or p_meal not in (
    'fri_dinner',
    'sat_breakfast',
    'sat_lunch',
    'sat_dinner',
    'sun_breakfast',
    'sun_lunch',
    'sun_dinner'
  ) then
    raise exception 'Тамақ уақытын таңдаңыз';
  end if;

  if p_will_eat then
    insert into weekend_meals (
      school_id, class_id, student_id, weekend_start, meal, will_eat, updated_by, updated_at
    ) values (
      u.school_id, u.class_id, u.id, p_weekend_start, p_meal, true, u.id, now()
    )
    on conflict (student_id, weekend_start, meal) do update set
      school_id = excluded.school_id,
      class_id = excluded.class_id,
      will_eat = true,
      updated_by = excluded.updated_by,
      updated_at = now();
  else
    delete from weekend_meals
    where student_id = u.id
      and weekend_start = p_weekend_start
      and meal = p_meal;
  end if;
end
$$;

revoke execute on function set_weekend_meal(date, text, boolean) from public, anon;
grant execute on function set_weekend_meal(date, text, boolean) to authenticated;
