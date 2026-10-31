-- 0059: richer one-on-ones and class council.
--  · the student's own questionnaire (interests, goals, difficulties, dream job …), kept on their profile
--  · action items from a meeting go to the student's Plan as a task or a habit, and staff follow whether they are done
--  · how often each student should be met; a Monday reminder to the class's staff about who is overdue
--  · council notes get tags, an "urgent" mark and a photo

/* ---------- questionnaire ---------- */
create table if not exists student_forms (
  student_id uuid primary key references profiles(id) on delete cascade,
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object' and length(answers::text) <= 8000),
  updated_at timestamptz not null default now()
);
alter table student_forms enable row level security;
create policy sf_own on student_forms for all to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy sf_staff on student_forms for select to authenticated
  using (exists (select 1 from profiles p where p.id = student_id and class_council(p.class_id)));

/* ---------- action items as tasks and habits ---------- */
alter table tasks add column if not exists mentor_id uuid references mentor_meetings(id) on delete set null;
alter table habits add column if not exists mentor_id uuid references mentor_meetings(id) on delete set null;

-- a task is the class teacher's own row (assignee = student, as personal tasks already work); a habit belongs to the student
create or replace function mentor_assign(p_meeting uuid, p_kind text, p_title text, p_due date) returns uuid
language plpgsql security definer set search_path = public as $$
declare m mentor_meetings; nid uuid;
begin
  select * into m from mentor_meetings where id = p_meeting;
  if m.id is null or not class_council(m.class_id) then raise exception 'Құқығыңыз жоқ'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'Міндетті жазыңыз'; end if;
  if p_kind = 'habit' then
    insert into habits(school_id, owner_id, title, mentor_id) values (my_school(), m.student_id, left(trim(p_title), 100), m.id) returning id into nid;
    perform notify(m.student_id, 'Жаңа әдет', trim(p_title), '/plan');
  else
    insert into tasks(school_id, author_id, title, due_on, assignee_id, mentor_id) values (my_school(), auth.uid(), left(trim(p_title), 200), p_due, m.student_id, m.id) returning id into nid;
  end if;
  return nid;
end $$;

-- what was given to a student and how it goes: a task is done or not, a habit shows its ticks of the last 7 days
create or replace function mentor_items(p_student uuid) returns table(id uuid, kind text, title text, due_on date, done boolean, last7 int, meeting_id uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles p where p.id = p_student and (p.id = auth.uid() or class_council(p.class_id))) then raise exception 'Құқығыңыз жоқ'; end if;
  return query
    select t.id, 'task'::text, t.title, t.due_on, exists (select 1 from task_done d where d.task_id = t.id and d.user_id = p_student), null::int, t.mentor_id, t.created_at
      from tasks t where t.assignee_id = p_student and t.mentor_id is not null
    union all
    select h.id, 'habit', h.title, null, h.archived_at is not null,
      (select count(*)::int from habit_checks c where c.habit_id = h.id and c.on_date > current_date - 7), h.mentor_id, h.created_at
      from habits h where h.owner_id = p_student and h.mentor_id is not null
    order by 8 desc;
end $$;

/* ---------- how often to meet ---------- */
create table if not exists mentor_settings (
  class_id uuid primary key references classes(id) on delete cascade,
  every_days smallint not null default 30 check (every_days between 7 and 180)
);
alter table mentor_settings enable row level security;
create policy ms_council on mentor_settings for all to authenticated using (class_council(class_id)) with check (class_council(class_id));

-- Mondays: tell the class's teacher and tutor how many students are overdue for a one-on-one
create or replace function mentor_overdue_tick() returns void language plpgsql security definer set search_path = public as $$
declare c record; n int;
begin
  for c in select s.class_id, s.every_days, k.teacher_id, k.tutor_id from mentor_settings s join classes k on k.id = s.class_id loop
    select count(*) into n from profiles p where p.class_id = c.class_id and p.role = 'student' and p.removed_at is null
      and not exists (select 1 from mentor_meetings m where m.student_id = p.id and (m.done_at > now() - make_interval(days => c.every_days) or m.done_at is null and m.starts_at > now()));
    if n > 0 then
      perform notify(u, 'Жеке кездесулер', n || ' оқушымен ' || c.every_days || ' күннен бері кездеспедіңіз', '/mentor?class=' || c.class_id)
        from unnest(array[c.teacher_id, c.tutor_id]) u where u is not null;
    end if;
  end loop;
end $$;
select cron.schedule('mentor-overdue', '0 4 * * 1', 'select public.mentor_overdue_tick()');

/* ---------- council notes: tags, urgent, a photo ---------- */
alter table council_notes add column if not exists tags text[] not null default '{}',
  add column if not exists urgent boolean not null default false,
  add column if not exists photo text check (photo is null or photo ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
create index if not exists council_notes_tags on council_notes using gin(tags);

revoke execute on function mentor_assign, mentor_items, mentor_overdue_tick from public, anon;
grant execute on function mentor_assign, mentor_items to authenticated;
