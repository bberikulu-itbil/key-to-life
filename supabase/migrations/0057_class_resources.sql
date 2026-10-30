-- 0057: «Сынып ресурстары» — shared by a class's students and its teacher and tutor.
--  · a book and film library: students suggest, staff approve; everyone marks "reading / read" and writes a short review
--  · film club: staff tick who watched a screening; it goes to the class calendar and counts as watched
--  · shopping lists for class events (tea, picnic): item, price, amount, the student in charge
--  · the class fund: money in and out, and planned spending

create or replace function class_member(p_class uuid) returns boolean language sql stable security definer set search_path = public as $$
  select class_council(p_class) or exists (select 1 from profiles p where p.id = auth.uid() and p.class_id = p_class and p.role = 'student')
$$;

create table class_media (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  kind text not null check (kind in ('book', 'film')),
  title text not null check (length(trim(title)) between 2 and 200),
  author text check (length(author) <= 200), -- writer or director
  note text check (length(note) <= 1000),
  approved boolean not null default false,
  proposed_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index class_media_class on class_media(class_id, kind);
alter table class_media enable row level security;
create policy cmd_read on class_media for select to authenticated using (class_council(class_id) or (class_member(class_id) and (approved or proposed_by = auth.uid())));
-- a student's suggestion waits for staff; staff add straight to the shelf
create policy cmd_add on class_media for insert to authenticated with check (class_member(class_id) and proposed_by = auth.uid() and (not approved or class_council(class_id)));
create policy cmd_edit on class_media for update to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy cmd_remove on class_media for delete to authenticated using (class_council(class_id) or (proposed_by = auth.uid() and not approved));

create table media_progress (
  media_id uuid not null references class_media(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  state text not null check (state in ('doing', 'done')),
  review text check (length(review) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (media_id, user_id)
);
alter table media_progress enable row level security;
create policy mp_read on media_progress for select to authenticated using (exists (select 1 from class_media m where m.id = media_id));
create policy mp_own on media_progress for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from class_media m where m.id = media_id and m.approved));

-- film club: a screening on the calendar with who came; those who came have watched the film
alter table class_events add column if not exists media_id uuid references class_media(id) on delete set null,
  add column if not exists attendees uuid[] not null default '{}';
create or replace function log_screening(p_media uuid, p_date date, p_students uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare m class_media; eid uuid;
begin
  select * into m from class_media where id = p_media and kind = 'film' and approved;
  if m.id is null or not class_council(m.class_id) then raise exception 'Құқығыңыз жоқ'; end if;
  insert into class_events(class_id, on_date, kind, title, media_id, attendees, created_by)
    values (m.class_id, p_date, 'fun', 'Киноклуб: ' || m.title, m.id, p_students, auth.uid()) returning id into eid;
  insert into media_progress(media_id, user_id, state)
    select m.id, p.id, 'done' from profiles p where p.id = any(p_students) and p.class_id = m.class_id
    on conflict (media_id, user_id) do update set state = 'done', updated_at = now();
  return eid;
end $$;

create table class_lists (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  on_date date,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table class_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references class_lists(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  price numeric(12, 2) not null default 0 check (price >= 0),
  qty numeric(10, 2) not null default 1 check (qty > 0),
  student_id uuid references profiles(id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table class_lists enable row level security;
alter table class_list_items enable row level security;
create policy cl_read on class_lists for select to authenticated using (class_member(class_id));
create policy cl_write on class_lists for all to authenticated using (class_council(class_id)) with check (class_council(class_id));
create policy cli_read on class_list_items for select to authenticated using (exists (select 1 from class_lists l where l.id = list_id));
create policy cli_write on class_list_items for all to authenticated
  using (exists (select 1 from class_lists l where l.id = list_id and class_council(l.class_id)))
  with check (exists (select 1 from class_lists l where l.id = list_id and class_council(l.class_id)));
-- the student in charge ticks their own item as bought
create or replace function tick_list_item(p_id uuid, p_done boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  update class_list_items i set done = p_done from class_lists l
    where i.id = p_id and l.id = i.list_id and (i.student_id = auth.uid() or class_council(l.class_id));
  if not found then raise exception 'Құқығыңыз жоқ'; end if;
end $$;

create table class_fund (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  on_date date not null default current_date,
  amount numeric(12, 2) not null check (amount <> 0), -- + money in, − money out
  note text not null check (length(trim(note)) between 2 and 300),
  planned boolean not null default false, -- a plan, not yet spent
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index class_fund_class on class_fund(class_id, on_date desc);
alter table class_fund enable row level security;
create policy cf_read on class_fund for select to authenticated using (class_member(class_id));
create policy cf_write on class_fund for all to authenticated using (class_council(class_id)) with check (class_council(class_id));

revoke execute on function class_member, log_screening, tick_list_item from public, anon;
grant execute on function class_member, log_screening, tick_list_item to authenticated;
