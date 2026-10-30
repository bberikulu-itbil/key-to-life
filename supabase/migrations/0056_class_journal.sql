-- 0056: «Журнал және күнтізбе» — the class's upbringing log and calendar, for the class teacher and tutor only.
--  · class hours: direction, topic, who led it, who was absent, an optional sub-group
--  · class events: school events and exams, film or sport, parent meetings and home visits
--  · photos of a day, for the calendar's photo view (files live in the public «posts» bucket under the uploader's folder)

create table class_hours (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  on_date date not null,
  direction text not null check (direction in ('moral', 'safety', 'national', 'patriotic', 'health', 'family', 'career', 'other')),
  topic text not null check (length(trim(topic)) between 2 and 300),
  led_by uuid references profiles(id) on delete set null,
  absent uuid[] not null default '{}',
  grp text check (length(grp) <= 100), -- when the class was split: which group
  note text check (length(note) <= 2000),
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index class_hours_class on class_hours(class_id, on_date desc);

create table class_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  on_date date not null,
  at_time time,
  kind text not null check (kind in ('school', 'fun', 'parents')), -- red, yellow, purple on the calendar
  title text not null check (length(trim(title)) between 2 and 200),
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index class_events_class on class_events(class_id, on_date);

create table class_photos (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  on_date date not null,
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index class_photos_class on class_photos(class_id, on_date);

alter table class_hours enable row level security;
alter table class_events enable row level security;
alter table class_photos enable row level security;
create policy ch_council on class_hours for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy ce_council on class_events for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
-- a photo row points only at a file in one's own folder
create policy cp_council on class_photos for all to authenticated using (class_council(class_id))
  with check (class_council(class_id) and split_part(path, '/', 1) = auth.uid()::text);
