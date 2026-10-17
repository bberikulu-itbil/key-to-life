-- 0031 (run by hand in the SQL Editor — it deletes the moved timetable rows): move 7Б Etude timetable rows into the class calendar (Hafta Sonu became a weekly survey, 0032).
--
-- Etude rows are materialized for the next year so the existing calendar view can
-- show every weekly occurrence without a second recurrence engine.

alter table calendar_events
  add column if not exists responsible_name text
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
    and lower(trim(t.subject)) in ('etude i', 'etude ii', 'этюд-1', 'этюд-2')
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
  and lower(trim(t.subject)) in ('etude i', 'etude ii', 'этюд-1', 'этюд-2');
