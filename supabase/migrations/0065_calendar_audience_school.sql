-- 0065: Target audience for calendar events (students, teachers, tutors, all).
-- Deputies can create and manage school-wide events with audience filtering.
-- Tutors can edit their class calendars.

alter table calendar_events
  add column if not exists audience text not null default 'all'
  check (audience in ('all', 'students', 'staff', 'teachers', 'tutors'));

alter table class_events
  add column if not exists audience text not null default 'all'
  check (audience in ('all', 'students', 'staff', 'teachers', 'tutors'));

-- Allow tutors to edit their class calendar as well
create or replace function can_edit_calendar(p_cal uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from calendars c where c.id = p_cal and c.school_id = my_school() and (
    (c.kind = 'personal' and c.owner_id = auth.uid())
    or (c.kind = 'class' and (is_deputy() or exists (select 1 from classes k where k.id = c.class_id and (k.teacher_id = auth.uid() or k.tutor_id = auth.uid()))))
    or (c.kind = 'school' and is_deputy())
    or (c.kind = 'olympiad' and is_staff())))
$$;

create or replace function can_see_calendar_event(p_cal uuid, p_audience text, p_created_by uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  u profiles := me();
begin
  if not can_see_calendar(p_cal) then
    return false;
  end if;
  if p_created_by = u.id or u.role in ('deputy', 'admin') then
    return true;
  end if;
  if u.role = 'student' then
    return p_audience in ('all', 'students');
  end if;
  -- Staff member:
  if p_audience in ('all', 'students', 'staff') then
    return true;
  end if;
  if p_audience = 'teachers' then
    return coalesce(u.staff_kind, 'teacher') in ('teacher', 'dorm_head') or u.role in ('teacher', 'class_teacher');
  end if;
  if p_audience = 'tutors' then
    return u.staff_kind = 'tutor' or exists (select 1 from classes where tutor_id = u.id and school_id = u.school_id);
  end if;
  return true;
end $$;

drop policy if exists ev_read on calendar_events;
create policy ev_read on calendar_events for select to authenticated
  using (can_see_calendar_event(calendar_id, audience, created_by));

revoke execute on function can_see_calendar_event, can_edit_calendar from public, anon;
grant execute on function can_see_calendar_event, can_edit_calendar to authenticated;
