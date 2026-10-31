-- 0058: richer class resources and class calendar.
--  · books and films get a cover photo and a genre
--  · a calendar event can be shown to the class's students (they get a notification, and a reminder the day before)
--  · a class photo can carry a caption (the photo album)
--  · a class-hour plan: how many class hours of each direction the class should have

alter table class_media add column if not exists cover text check (cover is null or cover ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  add column if not exists genre text check (genre is null or length(genre) <= 40);

alter table class_events add column if not exists visible boolean not null default false,
  add column if not exists note text check (length(note) <= 1000),
  add column if not exists reminded boolean not null default false;
create policy ce_students on class_events for select to authenticated using (visible and class_member(class_id));

create or replace function class_event_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visible and (tg_op = 'INSERT' or not old.visible) then
    perform notify(p.id, 'Сынып күнтізбесі', new.title || ' · ' || to_char(new.on_date, 'DD.MM'), '/journal')
      from profiles p where p.class_id = new.class_id and p.role = 'student' and p.removed_at is null;
  end if;
  return new;
end $$;
create trigger class_events_notify after insert or update of visible on class_events for each row execute function class_event_notify();

-- the evening before a shown event, the class hears about it again
create or replace function class_event_tick() returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  for e in select c.* from class_events c join classes k on k.id = c.class_id join schools s on s.id = k.school_id
           where c.visible and not c.reminded and c.on_date = ((now() at time zone coalesce(s.tz, 'Asia/Qostanay'))::date + 1)
             and (now() at time zone coalesce(s.tz, 'Asia/Qostanay'))::time >= '18:00' loop
    perform notify(p.id, 'Ертең', e.title || coalesce(' · ' || to_char(e.at_time, 'HH24:MI'), ''), '/journal')
      from profiles p where p.class_id = e.class_id and p.role = 'student' and p.removed_at is null;
    update class_events set reminded = true where id = e.id;
  end loop;
end $$;
select cron.schedule('class-event-reminders', '*/15 * * * *', 'select public.class_event_tick()');

alter table class_photos add column if not exists caption text check (length(caption) <= 300);

create table if not exists class_hour_plan (
  class_id uuid not null references classes(id) on delete cascade,
  direction text not null,
  target smallint not null check (target between 0 and 100),
  primary key (class_id, direction)
);
alter table class_hour_plan enable row level security;
create policy chp_council on class_hour_plan for all to authenticated using (class_council(class_id)) with check (class_council(class_id));

revoke execute on function class_event_notify, class_event_tick from public, anon;
