-- Calendars (personal / class / school / olympiad), timetable, olympiad syllabus.
-- Writes go straight to the tables, guarded by "for all" RLS policies that call can_edit_* helpers.

create table calendars (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  kind text not null check (kind in ('personal','class','school','olympiad')),
  owner_id uuid references profiles(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  color text not null default '#1d5bd8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  check ((kind = 'personal') = (owner_id is not null)),
  check ((kind = 'class') = (class_id is not null))
);
create unique index calendars_one_personal on calendars (owner_id) where kind = 'personal';
create unique index calendars_one_class on calendars (class_id) where kind = 'class';
create unique index calendars_one_shared on calendars (school_id, kind) where kind in ('school','olympiad');

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references calendars(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  notes text,
  import_uid text,                        -- UID from an imported .ics, so re-importing does not duplicate
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index on calendar_events (calendar_id, starts_at);
create unique index calendar_events_import on calendar_events (calendar_id, import_uid) where import_uid is not null;

-- calendars a person chose to hide from their own view (calendar id, or 'activities' / 'timetable')
create table calendar_hidden (
  user_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  cal_key text not null,
  primary key (user_id, cal_key)
);

create table timetable (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  subject text not null check (length(subject) between 1 and 80),
  teacher_id uuid references profiles(id) on delete set null,
  room text,
  check (end_time > start_time)
);
create index on timetable (class_id, weekday);
create index on timetable (teacher_id);

create table activity_topics (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  sort int not null default 0,
  title text not null check (length(title) between 2 and 160),
  body text,
  problems text                           -- one link or problem name per line
);
create index on activity_topics (activity_id, sort);

create table topic_progress (
  topic_id uuid not null references activity_topics(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  done_at timestamptz not null default now(),
  primary key (topic_id, student_id)
);

-- ---------- who may edit ----------
create function can_edit_calendar(p_cal uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from calendars c where c.id = p_cal and c.school_id = my_school() and (
    (c.kind = 'personal' and c.owner_id = auth.uid())
    or (c.kind = 'class' and (is_deputy() or exists (select 1 from classes k where k.id = c.class_id and k.teacher_id = auth.uid())))
    or (c.kind = 'school' and is_deputy())
    or (c.kind = 'olympiad' and is_staff())))
$$;

create function can_see_calendar(p_cal uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from calendars c where c.id = p_cal and c.school_id = my_school() and (
    c.kind in ('school','olympiad')
    or (c.kind = 'personal' and c.owner_id = auth.uid())
    or (c.kind = 'class' and (is_staff() or c.class_id = (select class_id from profiles where id = auth.uid())))))
$$;

create function can_edit_timetable(p_class uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from classes k where k.id = p_class and k.school_id = my_school() and k.teacher_id = auth.uid())
$$;

create function can_edit_syllabus(p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = p_activity and a.school_id = my_school()
    and (a.supervisor_id = auth.uid() or is_deputy()))
$$;

alter table calendars enable row level security;
alter table calendar_events enable row level security;
alter table calendar_hidden enable row level security;
alter table timetable enable row level security;
alter table activity_topics enable row level security;
alter table topic_progress enable row level security;

create policy cal_read on calendars for select to authenticated using (can_see_calendar(id));
create policy cal_write on calendars for update to authenticated using (can_edit_calendar(id)) with check (can_edit_calendar(id));
create policy ev_read on calendar_events for select to authenticated using (can_see_calendar(calendar_id));
create policy ev_write on calendar_events for all to authenticated using (can_edit_calendar(calendar_id)) with check (can_edit_calendar(calendar_id));
create policy hid_own on calendar_hidden for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tt_read on timetable for select to authenticated using (exists (select 1 from classes k where k.id = class_id and k.school_id = my_school()));
create policy tt_write on timetable for all to authenticated using (can_edit_timetable(class_id)) with check (can_edit_timetable(class_id));
create policy top_read on activity_topics for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
create policy top_write on activity_topics for all to authenticated using (can_edit_syllabus(activity_id)) with check (can_edit_syllabus(activity_id));
create policy prog_read on topic_progress for select to authenticated using (student_id = auth.uid() or is_staff());
create policy prog_own on topic_progress for all to authenticated using (student_id = auth.uid()) with check (
  student_id = auth.uid() and exists (select 1 from activity_topics t join enrollments e on e.activity_id = t.activity_id
    where t.id = topic_id and e.student_id = auth.uid()));

-- creates the calendars this person should have, on first use
create function ensure_calendars() returns void language plpgsql security definer set search_path = public as $$
declare u profiles := me();
begin
  if u.id is null then return; end if;
  insert into calendars (school_id, kind, owner_id, name, color) values (u.school_id, 'personal', u.id, 'Жеке жоспарым', '#7c3aed')
    on conflict do nothing;
  insert into calendars (school_id, kind, name, color) values (u.school_id, 'school', 'Мектеп күнтізбесі', '#13733a') on conflict do nothing;
  insert into calendars (school_id, kind, name, color) values (u.school_id, 'olympiad', 'Олимпиадалар', '#c2410c') on conflict do nothing;
  insert into calendars (school_id, kind, class_id, name, color)
    select u.school_id, 'class', k.id, k.name || ' сынып күнтізбесі', '#0e7490' from classes k
    where k.school_id = u.school_id and (k.id = u.class_id or k.teacher_id = u.id or u.role in ('deputy','admin'))
    on conflict do nothing;
end $$;

revoke execute on function can_edit_calendar, can_see_calendar, can_edit_timetable, can_edit_syllabus, ensure_calendars from public, anon;
grant execute on function can_edit_calendar, can_see_calendar, can_edit_timetable, can_edit_syllabus, ensure_calendars to authenticated;
