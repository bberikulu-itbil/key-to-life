-- 0062: richer class events and dorm period archive.
-- Run this migration in the Supabase SQL Editor before testing.

alter table class_events
  add column if not exists end_time time,
  add column if not exists type_codes text[] not null default '{}',
  add column if not exists place text,
  add column if not exists responsible_id uuid references profiles(id) on delete set null,
  add column if not exists linked_kind text,
  add column if not exists linked_id uuid,
  add column if not exists status text not null default 'planned' check (status in ('planned', 'passed', 'postponed', 'archived')),
  add column if not exists archived_at timestamptz;
alter table class_photos add column if not exists event_id uuid references class_events(id) on delete set null;
drop policy if exists ce_students on class_events;
create policy ce_students on class_events for select to authenticated
  using (visible and status <> 'archived' and class_member(class_id));

create table class_event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references class_events(id) on delete cascade,
  kind text not null check (kind in ('student', 'group', 'room')),
  student_id uuid references profiles(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 200),
  check ((kind = 'student' and student_id is not null) or (kind in ('group', 'room') and student_id is null))
);
create index class_event_participants_event on class_event_participants(event_id);
alter table class_event_participants enable row level security;
create policy cep_read on class_event_participants for select to authenticated using (
  exists (select 1 from class_events e where e.id = event_id and (class_council(e.class_id) or (e.visible and class_member(e.class_id))))
);
create policy cep_write on class_event_participants for all to authenticated using (
  exists (select 1 from class_events e where e.id = event_id and class_council(e.class_id))
) with check (
  exists (select 1 from class_events e where e.id = event_id and class_council(e.class_id))
);

create table class_wallets (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);
create table class_event_expenses (
  event_id uuid primary key references class_events(id) on delete cascade,
  wallet_id uuid not null references class_wallets(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid not null default auth.uid() references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index class_event_expenses_wallet on class_event_expenses(wallet_id);
alter table class_wallets enable row level security;
alter table class_event_expenses enable row level security;
create policy cw_council on class_wallets for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy cee_council on class_event_expenses for all to authenticated using (
  exists (select 1 from class_events e where e.id = event_id and class_council(e.class_id))
) with check (
  exists (select 1 from class_events e join class_wallets w on w.class_id = e.class_id where e.id = event_id and w.id = wallet_id and class_council(e.class_id))
);

create table dorm_periods (
  class_id uuid not null references classes(id) on delete cascade,
  term text not null check (length(term) between 3 and 30),
  label text,
  period_from date,
  period_to date,
  primary key (class_id, term),
  check (period_to is null or period_from is null or period_to >= period_from)
);
alter table dorm_periods enable row level security;
create policy dp_read on dorm_periods for select to authenticated using (
  exists (select 1 from classes c where c.id = class_id and c.school_id = my_school())
);
create policy dp_write on dorm_periods for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
