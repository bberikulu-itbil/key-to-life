-- request_absence also notifies the activity's жауапты оқушы (curator_id)
create or replace function request_absence(p_activity uuid, p_date date, p_category text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities; rid uuid;
begin
  select * into a from activities where id = p_activity;
  if a.id is null or a.school_id <> u.school_id then raise exception 'Іс-шара табылмады'; end if;
  if not exists (select 1 from enrollments where activity_id = p_activity and student_id = u.id and not waitlisted) then
    raise exception 'Сіз бұл іс-шараға жазылмағансыз'; end if;
  if p_date < school_today(a.school_id) then raise exception 'Өткен күнге рұқсат сұрауға болмайды'; end if;
  if not is_session(a, p_date) then raise exception 'Бұл күні сабақ жоқ'; end if;
  insert into absence_requests (student_id, activity_id, session_date, category, reason)
    values (u.id, p_activity, p_date, p_category, trim(p_reason)) returning id into rid;
  perform notify(a.supervisor_id, 'Рұқсат сұрау', u.full_name || ' · ' || a.title || ' · ' || to_char(p_date, 'DD.MM'), '/a/' || p_activity);
  if a.curator_id is not null and a.curator_id <> u.id then
    perform notify(a.curator_id, 'Рұқсат сұрау (жауапты оқушыға)', u.full_name || ' · ' || a.title || ' · ' || to_char(p_date, 'DD.MM'), '/a/' || p_activity);
  end if;
  return rid;
exception when unique_violation then raise exception 'Бұл күнге өтініш жіберіп қойғансыз';
end $$;
