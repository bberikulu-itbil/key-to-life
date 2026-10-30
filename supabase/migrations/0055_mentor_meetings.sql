-- 0055: «Жеке кездесулер» (1-on-1) — the class teacher or tutor meets one student.
--  · a meeting is either shown to the student (a notification now, a reminder an hour before) or kept for staff only
--  · after it: action items the student sees, and closed notes only staff see
--  · the student's test answers (MBTI, multiple intelligences, Holland) for their profile

create table mentor_meetings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  staff_id uuid default auth.uid() references profiles(id) on delete set null,
  starts_at timestamptz not null,
  topic text not null check (length(trim(topic)) between 2 and 300),
  visible boolean not null default true, -- false: only staff know about it
  actions text check (length(actions) <= 3000), -- for the student
  notes text check (length(notes) <= 5000), -- staff only
  done_at timestamptz,
  reminded boolean not null default false,
  created_at timestamptz not null default now()
);
create index mentor_meetings_student on mentor_meetings(student_id, starts_at desc);
create index mentor_meetings_class on mentor_meetings(class_id, starts_at);
alter table mentor_meetings enable row level security;
-- staff of the class only; the student reads their own through my_mentor_meetings(), which leaves out the notes
create policy mm_council on mentor_meetings for all to authenticated using (class_council(class_id))
  with check (class_council(class_id) and exists (select 1 from profiles p where p.id = student_id and p.class_id = mentor_meetings.class_id));

create or replace function my_mentor_meetings() returns table(id uuid, starts_at timestamptz, topic text, actions text, done_at timestamptz, staff_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.starts_at, m.topic, m.actions, m.done_at, p.full_name from mentor_meetings m left join profiles p on p.id = m.staff_id
  where m.student_id = auth.uid() and m.visible order by m.starts_at desc limit 100
$$;

-- the student hears about a meeting meant for them, and about its action items
create or replace function mentor_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.visible and tg_op = 'INSERT' then
    perform notify(new.student_id, 'Жеке кездесу', new.topic, '/mentor');
  elsif new.visible and new.actions is distinct from old.actions and coalesce(new.actions, '') <> '' then
    perform notify(new.student_id, 'Кездесу қорытындысы', new.topic, '/mentor');
  end if;
  return new;
end $$;
create trigger mentor_meetings_notify after insert or update on mentor_meetings for each row execute function mentor_notify();

-- an hour before: the staff member, and the student when the meeting is shown to them
create or replace function mentor_tick() returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in select * from mentor_meetings where not reminded and done_at is null and starts_at > now() and starts_at <= now() + interval '1 hour' loop
    if m.staff_id is not null then perform notify(m.staff_id, 'Жеке кездесу бір сағаттан кейін', m.topic, '/mentor/' || m.student_id); end if;
    if m.visible then perform notify(m.student_id, 'Жеке кездесу бір сағаттан кейін', m.topic, '/mentor'); end if;
    update mentor_meetings set reminded = true where id = m.id;
  end loop;
end $$;
select cron.schedule('mentor-reminders', '*/5 * * * *', 'select public.mentor_tick()');

-- the student's answers to the ready-made tests, newest first, for the class's staff
create or replace function student_tests(p_student uuid) returns table(type text, answers jsonb, answered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles p where p.id = p_student and class_council(p.class_id)) then raise exception 'Құқығыңыз жоқ'; end if;
  return query select q.v->>'type', r.answers->(q.i::int - 1), r.created_at
    from survey_responses r join surveys s on s.id = r.survey_id, jsonb_array_elements(s.questions) with ordinality q(v, i)
    where r.user_id = p_student and q.v->>'type' in ('mbti', 'mi', 'holland') order by r.created_at desc;
end $$;

revoke execute on function my_mentor_meetings, mentor_notify, mentor_tick, student_tests from public, anon;
grant execute on function my_mentor_meetings, student_tests to authenticated;
