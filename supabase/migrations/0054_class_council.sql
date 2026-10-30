-- 0054: «Сынып кеңесі» — a closed workspace for a class's teacher and tutor (deputies may look in).
--  · notes: quick observations through the week, students tagged with @; open notes become the next meeting's agenda
--  · meetings: a time (reminders a day and an hour before), minutes kept in the archive
--  · task board: todo → doing → done, an owner and a deadline
--  · parent contacts: who spoke with which parent, when, about what

create or replace function class_council(p_class uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from classes k where k.id = p_class and k.school_id = my_school() and auth.uid() in (k.teacher_id, k.tutor_id))
$$;

create table council_meetings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  starts_at timestamptz not null,
  minutes text check (length(minutes) <= 10000),
  done_at timestamptz,
  reminded smallint not null default 0, -- 1: the day-before reminder went, 2: the hour-before one too
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index council_meetings_class on council_meetings(class_id, starts_at);

create table council_notes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  author_id uuid default auth.uid() references profiles(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  student_ids uuid[] not null default '{}',
  meeting_id uuid references council_meetings(id) on delete set null, -- the meeting that settled it
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index council_notes_class on council_notes(class_id, created_at desc);
create index council_notes_students on council_notes using gin(student_ids);

create table council_tasks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 300),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee_id uuid references profiles(id) on delete set null,
  due_on date,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index council_tasks_class on council_tasks(class_id);

create table parent_contacts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  staff_id uuid default auth.uid() references profiles(id) on delete set null,
  on_date date not null default current_date,
  channel text not null default 'phone' check (channel in ('phone', 'meeting', 'chat', 'visit')),
  summary text not null check (length(trim(summary)) between 2 and 2000),
  created_at timestamptz not null default now()
);
create index parent_contacts_class on parent_contacts(class_id, on_date desc);

alter table council_meetings enable row level security;
alter table council_notes enable row level security;
alter table council_tasks enable row level security;
alter table parent_contacts enable row level security;
create policy cm_council on council_meetings for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy cn_council on council_notes for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy ct_council on council_tasks for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy pc_council on parent_contacts for all to authenticated using (class_council(class_id))
  with check (class_council(class_id) and exists (select 1 from profiles p where p.id = student_id and p.class_id = parent_contacts.class_id));

-- reminders to the class's teacher and tutor: a day and an hour before a meeting
create or replace function council_tick() returns void language plpgsql security definer set search_path = public as $$
declare m record; step smallint;
begin
  for m in select c.*, k.teacher_id, k.tutor_id, k.name from council_meetings c join classes k on k.id = c.class_id
           where c.done_at is null and c.starts_at > now() and c.reminded < 2 and c.starts_at <= now() + interval '1 day' loop
    step := case when m.starts_at <= now() + interval '1 hour' then 2 else 1 end;
    if step > m.reminded then
      perform notify(u, 'Сынып кеңесі', case step when 2 then 'Жиналыс бір сағаттан кейін · ' else 'Жиналыс алдағы тәулікте · ' end || m.name, '/council/' || m.class_id)
        from unnest(array[m.teacher_id, m.tutor_id]) u where u is not null;
      update council_meetings set reminded = step where id = m.id;
    end if;
  end loop;
end $$;
select cron.schedule('council-reminders', '*/5 * * * *', 'select public.council_tick()');

revoke execute on function class_council, council_tick from public, anon;
grant execute on function class_council to authenticated;
