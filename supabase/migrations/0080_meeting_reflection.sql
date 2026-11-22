-- 0080: «Кездесу режимі» — what the student said during a 1-on-1, kept with the meeting.
--  · mood: «Аптаң қалай өтті?» 1–5
--  · went_well / was_hard: the student's own words, shown to the student (not the closed notes)
--  · a meeting started on the spot (now) does not send a «Жеке кездесу» notification: the student is already in the room

alter table mentor_meetings
  add column if not exists mood smallint check (mood between 1 and 5),
  add column if not exists went_well text check (length(went_well) <= 2000),
  add column if not exists was_hard text check (length(was_hard) <= 2000);

create or replace function mentor_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visible and tg_op = 'INSERT' and new.starts_at > now() + interval '10 minutes' then
    perform notify(new.student_id, 'Жеке кездесу', new.topic, '/mentor');
  elsif new.visible and tg_op = 'UPDATE' and new.actions is distinct from old.actions and coalesce(new.actions, '') <> '' then
    perform notify(new.student_id, 'Кездесу қорытындысы', new.topic, '/mentor');
  end if;
  return new;
end $$;
