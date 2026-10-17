-- 0034 (data, applied once on 2026-10-17): 7B Etude as two activities with roll call, every 7B student enrolled,
-- so it shows in students' Plan and the tutor (supervisor) and class teacher (author) keep the journal.
-- The calendar copies from 0031 are removed by hand: delete from calendar_events where import_uid like 'etude:%';
with a as (
  insert into activities (school_id, type, title, description, author_id, supervisor_id, place, audience_grades, capacity,
    schedule, weekdays, date_from, date_to, start_time, end_time, status, enrollment_open, features)
  select k.school_id, 'course', x.title, '7B сыныбының кешкі өзіндік дайындығы (Etude). Тәрбиеші мен сынып жетекшісі түгелдейді.',
    k.teacher_id, k.tutor_id, '7B сыныбы', '{7}', null, 'weekly', '{1,2,3,4,7}', date '2026-10-18', date '2027-05-31', x.st, x.en,
    'approved', false, '{schedule,attendance,tasks}'
  from classes k, (values ('Этюд-1 · 7B', time '19:00', time '19:45'), ('Этюд-2 · 7B', time '20:00', time '20:45')) x(title, st, en)
  where lower(trim(k.name)) in ('7б', '7b')
  returning id, (select id from classes where lower(trim(name)) in ('7б', '7b') limit 1) as class_id
)
insert into enrollments (activity_id, student_id)
select a.id, p.id from a join profiles p on p.class_id = a.class_id and p.role = 'student';
