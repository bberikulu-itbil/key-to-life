create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  tz text not null default 'Asia/Almaty',
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references schools(id),
  full_name text not null check (length(full_name) between 2 and 120),
  role user_role not null default 'student',
  class_id uuid,
  title text,
  created_at timestamptz not null default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null,
  grade int not null check (grade between 1 and 12),
  teacher_id uuid references profiles(id) on delete set null,
  unique (school_id, name)
);
alter table profiles add constraint profiles_class_fk foreign key (class_id) references classes(id) on delete set null;

create table activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  type activity_type not null,
  title text not null check (length(title) between 3 and 120),
  description text not null check (length(description) between 30 and 4000),
  author_id uuid not null references profiles(id),
  supervisor_id uuid not null references profiles(id),
  place text not null check (length(place) between 2 and 120),
  audience_grades int[] not null default '{}',   -- empty = everyone
  capacity int check (capacity is null or capacity between 1 and 2000),
  schedule schedule_kind not null,
  on_date date,                                   -- once
  weekdays int[],                                 -- weekly, ISO 1=Mon..7=Sun
  date_from date,
  date_to date,
  start_time time not null,
  end_time time not null,
  status activity_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (schedule = 'once' and on_date is not null
      or schedule = 'weekly' and coalesce(cardinality(weekdays), 0) > 0 and weekdays <@ '{1,2,3,4,5,6,7}'
         and date_from is not null and date_to >= date_from)
);
create index on activities (school_id, status);
create index on activities (supervisor_id);
create index on activities (author_id);

create table approvals (
  id bigint generated always as identity primary key,
  activity_id uuid not null references activities(id) on delete cascade,
  step activity_status not null,
  actor_id uuid not null references profiles(id),
  decision text not null check (decision in ('submitted','approved','rejected')),
  comment text,
  created_at timestamptz not null default now()
);
create index on approvals (activity_id);

create table enrollments (
  activity_id uuid not null references activities(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  waitlisted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);
create index on enrollments (student_id);

create table attendance (
  activity_id uuid not null references activities(id) on delete cascade,
  session_date date not null,
  student_id uuid not null references profiles(id) on delete cascade,
  status attendance_status not null,
  marked_by uuid not null references profiles(id),
  marked_at timestamptz not null default now(),
  primary key (activity_id, session_date, student_id)
);
create index on attendance (student_id);

create table absence_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  session_date date not null,
  category text not null check (category in ('illness','school_exam','family','competition','other')),
  reason text not null check (length(reason) between 10 and 1000),
  status request_status not null default 'pending',
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  unique (student_id, activity_id, session_date)
);

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);
