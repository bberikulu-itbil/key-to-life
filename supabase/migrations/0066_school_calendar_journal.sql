-- 0066: School calendar in class journal.
-- Allows class_events to represent school-wide events (class_id IS NULL) created by deputies,
-- with audience targeting ('all', 'students', 'staff', 'teachers', 'tutors').
-- Automatically synchronizes school events to calendar_events for Google Calendar & Agenda.

-- 1. Allow nullable class_id and add school_id on class_events
alter table class_events alter column class_id drop not null;
alter table class_events add column if not exists school_id uuid references schools(id) on delete cascade;

update class_events set school_id = (select school_id from classes where classes.id = class_events.class_id)
  where school_id is null and class_id is not null;

alter table class_events drop constraint if exists class_events_has_scope;
alter table class_events add constraint class_events_has_scope check (class_id is not null or school_id is not null);

create index if not exists class_events_school on class_events(school_id, on_date) where class_id is null;

-- 2. Link calendar_events to class_events
alter table calendar_events add column if not exists class_event_id uuid references class_events(id) on delete cascade;
create unique index if not exists calendar_events_class_event on calendar_events(class_event_id) where class_event_id is not null;

-- 3. RLS policies on class_events
drop policy if exists ce_council on class_events;
create policy ce_council on class_events for all to authenticated
  using (
    (class_id is not null and class_council(class_id))
    or (class_id is null and is_deputy() and school_id = my_school())
  )
  with check (
    (class_id is not null and class_council(class_id))
    or (class_id is null and is_deputy() and school_id = my_school())
  );

drop policy if exists ce_school_read on class_events;
create policy ce_school_read on class_events for select to authenticated
  using (
    class_id is null
    and school_id = my_school()
    and can_see_calendar_event(
      coalesce((select id from calendars where school_id = class_events.school_id and kind = 'school' limit 1), '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(audience, 'all'),
      created_by
    )
  );

-- 4. Sync trigger from class_events to calendar_events (school events)
create or replace function sync_class_event_to_calendar() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cal_id uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_all_day boolean;
  v_resp_name text;
  v_tz text;
begin
  if TG_OP = 'DELETE' then
    delete from calendar_events where class_event_id = OLD.id;
    return OLD;
  end if;

  if NEW.class_id is not null then
    delete from calendar_events where class_event_id = NEW.id;
    return NEW;
  end if;

  select id into v_cal_id from calendars where school_id = NEW.school_id and kind = 'school' limit 1;
  if v_cal_id is null then
    insert into calendars (school_id, kind, name, color)
    values (NEW.school_id, 'school', 'Мектеп күнтізбесі', '#13733a')
    returning id into v_cal_id;
  end if;

  select coalesce(tz, 'Asia/Almaty') into v_tz from schools where id = NEW.school_id;

  if NEW.at_time is null then
    v_starts := (NEW.on_date::text || ' 00:00:00')::timestamp at time zone v_tz;
    v_ends := (NEW.on_date::text || ' 23:59:59')::timestamp at time zone v_tz;
    v_all_day := true;
  else
    v_starts := (NEW.on_date::text || ' ' || NEW.at_time::text)::timestamp at time zone v_tz;
    if NEW.end_time is not null then
      v_ends := (NEW.on_date::text || ' ' || NEW.end_time::text)::timestamp at time zone v_tz;
    else
      v_ends := v_starts + interval '1 hour';
    end if;
    v_all_day := false;
  end if;

  if NEW.responsible_id is not null then
    select full_name into v_resp_name from profiles where id = NEW.responsible_id;
  else
    v_resp_name := null;
  end if;

  insert into calendar_events (
    calendar_id, title, starts_at, ends_at, all_day, location, notes,
    responsible_name, audience, created_by, class_event_id
  ) values (
    v_cal_id, NEW.title, v_starts, v_ends, v_all_day, NEW.place, NEW.note,
    v_resp_name, coalesce(NEW.audience, 'all'), NEW.created_by, NEW.id
  )
  on conflict (class_event_id) do update set
    calendar_id = EXCLUDED.calendar_id,
    title = EXCLUDED.title,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    all_day = EXCLUDED.all_day,
    location = EXCLUDED.location,
    notes = EXCLUDED.notes,
    responsible_name = EXCLUDED.responsible_name,
    audience = EXCLUDED.audience;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_class_event_to_calendar on class_events;
create trigger trg_sync_class_event_to_calendar
  after insert or update of title, on_date, at_time, end_time, place, note, responsible_id, audience, class_id, school_id
  on class_events
  for each row execute function sync_class_event_to_calendar();

-- 5. Notification trigger for school events
create or replace function class_event_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visible and (tg_op = 'INSERT' or not old.visible) then
    if new.class_id is not null then
      perform notify(p.id, 'Сынып күнтізбесі', new.title || ' · ' || to_char(new.on_date, 'DD.MM'), '/journal/' || new.class_id::text)
        from profiles p where p.class_id = new.class_id and p.role = 'student' and p.removed_at is null;
    elsif new.school_id is not null then
      if new.audience in ('all', 'students') then
        perform notify(p.id, 'Мектеп күнтізбесі', new.title || ' · ' || to_char(new.on_date, 'DD.MM'), '/journal/school')
          from profiles p where p.school_id = new.school_id and p.role = 'student' and p.removed_at is null;
      end if;
      if new.audience in ('all', 'staff', 'teachers') then
        perform notify(p.id, 'Мектеп күнтізбесі', new.title || ' · ' || to_char(new.on_date, 'DD.MM'), '/journal/school')
          from profiles p where p.school_id = new.school_id and p.role in ('teacher', 'class_teacher', 'deputy') and p.removed_at is null;
      end if;
      if new.audience in ('all', 'staff', 'tutors') then
        perform notify(p.id, 'Мектеп күнтізбесі', new.title || ' · ' || to_char(new.on_date, 'DD.MM'), '/journal/school')
          from profiles p where p.school_id = new.school_id and (p.staff_kind = 'tutor' or exists (select 1 from classes where tutor_id = p.id)) and p.removed_at is null;
      end if;
    end if;
  end if;
  return new;
end $$;

revoke execute on function sync_class_event_to_calendar, class_event_notify from public, anon;
grant execute on function sync_class_event_to_calendar, class_event_notify to authenticated;
