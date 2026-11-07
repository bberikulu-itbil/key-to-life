-- 0076: students hear about a class event only when the teacher ticks «notify» (off by default);
-- a film-club screening is an ordinary «film» event linked to the film, with the students who watched as participants.

alter table class_events add column if not exists notify boolean not null default false;

create or replace function class_event_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.notify and new.class_id is not null and (tg_op = 'INSERT' or not old.notify) then
    perform notify(p.id, 'Сынып күнтізбесі', new.title || ' · ' || to_char(new.on_date, 'DD.MM'), '/journal')
      from profiles p where p.class_id = new.class_id and p.role = 'student' and p.removed_at is null;
  end if;
  return new;
end $$;
-- the old trigger fires on insert and on «visible»; this one on switching «notify» on later
create trigger class_events_notify_on after update of notify on class_events for each row execute function class_event_notify();

create or replace function class_event_tick() returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  for e in select c.* from class_events c join classes k on k.id = c.class_id join schools s on s.id = k.school_id
           where c.notify and not c.reminded and c.status = 'planned' and c.on_date = ((now() at time zone coalesce(s.tz, 'Asia/Qostanay'))::date + 1)
             and (now() at time zone coalesce(s.tz, 'Asia/Qostanay'))::time >= '18:00' loop
    perform notify(p.id, 'Ертең', e.title || coalesce(' · ' || to_char(e.at_time, 'HH24:MI'), ''), '/journal')
      from profiles p where p.class_id = e.class_id and p.role = 'student' and p.removed_at is null;
    update class_events set reminded = true where id = e.id;
  end loop;
end $$;

create or replace function log_screening(p_media uuid, p_date date, p_students uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare m class_media; eid uuid;
begin
  select * into m from class_media where id = p_media and kind = 'film' and approved;
  if m.id is null or not class_council(m.class_id) then raise exception 'Құқығыңыз жоқ'; end if;
  insert into class_events(class_id, on_date, kind, type_codes, title, linked_kind, linked_id, status, created_by)
    values (m.class_id, p_date, 'fun', '{film}', m.title, 'media', m.id, case when p_date <= current_date then 'passed' else 'planned' end, auth.uid()) returning id into eid;
  insert into class_event_participants(event_id, kind, student_id, label)
    select eid, 'student', p.id, p.full_name from profiles p where p.id = any(p_students) and p.class_id = m.class_id;
  insert into media_progress(media_id, user_id, state)
    select m.id, p.id, 'done' from profiles p where p.id = any(p_students) and p.class_id = m.class_id
    on conflict (media_id, user_id) do update set state = 'done', updated_at = now();
  return eid;
end $$;
