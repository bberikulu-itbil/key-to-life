-- 0048 (1.3.0): the dormitory. Rooms with numbered beds, wardrobes and nightstands (each with a QR), boys placed
-- into rooms every term by their class tutor, beds chosen by QR or given automatically, bed swaps, linen-change
-- rounds with answers, the evening roll call by rooms, room cleanliness scores, damage reports, and the
-- dorm head (жатақхана меңгерушісі) who sees everything and will host guests from other schools in holidays.
-- Run as one script in the Supabase SQL Editor.

/* ---------- people ---------- */
do $$ declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%staff_kind%' loop
    execute format('alter table profiles drop constraint %I', c);
  end loop;
end $$;
alter table profiles add constraint profiles_staff_kind_check check (staff_kind in ('teacher', 'tutor', 'staff', 'dorm_head'));
alter table profiles add column if not exists dorm boolean not null default false;   -- lives in the dormitory

create or replace function is_dorm_head() returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from profiles where id = auth.uid() and staff_kind = 'dorm_head')
$$;
-- who looks after a boy in the dorm: his class tutor or class teacher, the dorm head, deputies
create or replace function dorm_keeper(p_student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_dorm_head() or exists (select 1 from profiles p join classes k on k.id = p.class_id
    where p.id = p_student and p.school_id = my_school() and auth.uid() in (k.tutor_id, k.teacher_id))
$$;
create or replace function dorm_class_keeper(p_class uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_dorm_head() or exists (select 1 from classes k where k.id = p_class and k.school_id = my_school() and auth.uid() in (k.tutor_id, k.teacher_id))
$$;

create or replace function set_dorm_resident(p_student uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not dorm_keeper(p_student) then raise exception 'Құқығыңыз жоқ'; end if;
  update profiles set dorm = p_on where id = p_student and role = 'student';
end $$;

/* ---------- rooms and their things ---------- */
create table if not exists dorm_rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id),
  name text not null check (length(trim(name)) between 1 and 20),
  floor int check (floor between -2 and 30),
  capacity int not null default 4 check (capacity between 1 and 20),
  active boolean not null default true,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create or replace function dorm_room_editor(p_room uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dorm_rooms r where r.id = p_room and r.school_id = my_school() and (r.created_by = auth.uid() or is_dorm_head()))
$$;
alter table dorm_rooms enable row level security;
drop policy if exists dr_read on dorm_rooms;
create policy dr_read on dorm_rooms for select to authenticated using (school_id = my_school());
drop policy if exists dr_insert on dorm_rooms;
create policy dr_insert on dorm_rooms for insert to authenticated with check (school_id = my_school() and is_staff());
drop policy if exists dr_update on dorm_rooms;
create policy dr_update on dorm_rooms for update to authenticated using (dorm_room_editor(id)) with check (school_id = my_school());

create table if not exists dorm_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references dorm_rooms(id) on delete cascade,
  kind text not null check (kind in ('bed', 'wardrobe', 'nightstand')),
  no int not null check (no between 1 and 40),
  code text not null unique default ('D-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),   -- printed as a QR
  state text not null default 'ok' check (state in ('ok', 'damaged')),
  note text check (note is null or length(note) <= 300),
  unique (room_id, kind, no)
);
alter table dorm_items enable row level security;
drop policy if exists di_read on dorm_items;
create policy di_read on dorm_items for select to authenticated using (exists (select 1 from dorm_rooms r where r.id = room_id and r.school_id = my_school()));
drop policy if exists di_write on dorm_items;
create policy di_write on dorm_items for all to authenticated using (dorm_room_editor(room_id)) with check (dorm_room_editor(room_id));

/* ---------- placement per term ---------- */
create table if not exists dorm_assignments (
  term text not null check (length(term) between 3 and 20),        -- «2026-2027-2»: school year and quarter
  student_id uuid not null references profiles(id) on delete cascade,
  school_id uuid not null default my_school() references schools(id),
  room_id uuid references dorm_rooms(id) on delete set null,
  pinned boolean not null default false,                            -- placed by hand, not by the random
  is_head boolean not null default false,                           -- the room's responsible boy
  assigned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (term, student_id)
);
create index if not exists dorm_assignments_room on dorm_assignments(term, room_id);
alter table dorm_assignments enable row level security;
drop policy if exists da_read on dorm_assignments;
create policy da_read on dorm_assignments for select to authenticated using (school_id = my_school());

-- who has held which bed, wardrobe or nightstand: damage is asked of the holder of that time
create table if not exists dorm_item_holders (
  id bigserial primary key,
  item_id uuid not null references dorm_items(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  term text not null,
  from_at timestamptz not null default now(),
  to_at timestamptz
);
create unique index if not exists dorm_item_holder_now on dorm_item_holders(item_id) where to_at is null;
create index if not exists dorm_item_holders_student on dorm_item_holders(student_id) where to_at is null;
alter table dorm_item_holders enable row level security;
drop policy if exists dih_read on dorm_item_holders;
create policy dih_read on dorm_item_holders for select to authenticated
  using (exists (select 1 from dorm_items i join dorm_rooms r on r.id = i.room_id where i.id = item_id and r.school_id = my_school()));

-- a tutor's choices for his class
create table if not exists dorm_settings (
  class_id uuid primary key references classes(id) on delete cascade,
  mode text not null default 'self' check (mode in ('auto', 'self')),          -- beds given automatically or chosen by QR
  swap text not null default 'confirm' check (swap in ('off', 'free', 'confirm')),
  linen_days int check (linen_days between 1 and 60),                          -- null: no automatic reminder
  linen_time time not null default '18:00',
  linen_last date
);
alter table dorm_settings enable row level security;
drop policy if exists ds_read on dorm_settings;
create policy ds_read on dorm_settings for select to authenticated using (exists (select 1 from classes k where k.id = class_id and k.school_id = my_school()));

create or replace function set_dorm_settings(p_class uuid, p_mode text, p_swap text, p_linen_days int, p_linen_time time) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not dorm_class_keeper(p_class) then raise exception 'Құқығыңыз жоқ'; end if;
  insert into dorm_settings (class_id, mode, swap, linen_days, linen_time) values (p_class, p_mode, p_swap, p_linen_days, coalesce(p_linen_time, '18:00'))
    on conflict (class_id) do update set mode = excluded.mode, swap = excluded.swap, linen_days = excluded.linen_days, linen_time = excluded.linen_time;
end $$;

-- the free things of one kind in a room, lowest number first
create or replace function dorm_free_item(p_room uuid, p_kind text) returns uuid language sql stable security definer set search_path = public as $$
  select i.id from dorm_items i where i.room_id = p_room and i.kind = p_kind
    and not exists (select 1 from dorm_item_holders h where h.item_id = i.id and h.to_at is null) order by i.no limit 1
$$;

-- publish a placement: p_rows = [{student, room, pinned}]; rooms must not overflow (other classes' boys count too)
create or replace function dorm_publish(p_term text, p_class uuid, p_rows jsonb) returns int language plpgsql security definer set search_path = public as $$
declare x record; r dorm_rooms; n int := 0; st dorm_settings; k text;
begin
  if not dorm_class_keeper(p_class) then raise exception 'Құқығыңыз жоқ'; end if;
  select * into st from dorm_settings where class_id = p_class;
  for x in select (e->>'student')::uuid sid, nullif(e->>'room', '')::uuid rid, coalesce((e->>'pinned')::boolean, false) pin from jsonb_array_elements(p_rows) e loop
    if not exists (select 1 from profiles p where p.id = x.sid and p.class_id = p_class and p.role = 'student') then raise exception 'Оқушы бұл сыныпта емес'; end if;
    -- the old term's things are handed back
    update dorm_item_holders set to_at = now() where student_id = x.sid and to_at is null and term <> p_term;
    if x.rid is not null and not exists (select 1 from dorm_assignments a where a.term = p_term and a.student_id = x.sid and a.room_id = x.rid) then
      update dorm_item_holders set to_at = now() where student_id = x.sid and to_at is null;
    end if;
    insert into dorm_assignments (term, student_id, school_id, room_id, pinned, assigned_by) values (p_term, x.sid, my_school(), x.rid, x.pin, auth.uid())
      on conflict (term, student_id) do update set room_id = excluded.room_id, pinned = excluded.pinned, assigned_by = excluded.assigned_by,
        is_head = dorm_assignments.is_head and dorm_assignments.room_id is not distinct from excluded.room_id;
    n := n + 1;
  end loop;
  for r in select distinct d.* from dorm_rooms d join dorm_assignments a on a.room_id = d.id and a.term = p_term loop
    if (select count(*) from dorm_assignments a where a.term = p_term and a.room_id = r.id) > r.capacity then
      raise exception 'Бөлме толы: %', r.name; end if;
  end loop;
  -- automatic mode: each boy gets a free bed, wardrobe and nightstand of his room
  if coalesce(st.mode, 'self') = 'auto' then
    for x in select a.student_id sid, a.room_id rid from dorm_assignments a join profiles p on p.id = a.student_id
             where a.term = p_term and p.class_id = p_class and a.room_id is not null loop
      foreach k in array array['bed', 'wardrobe', 'nightstand'] loop
        if not exists (select 1 from dorm_item_holders h join dorm_items i on i.id = h.item_id where h.student_id = x.sid and h.to_at is null and i.kind = k)
           and dorm_free_item(x.rid, k) is not null then
          insert into dorm_item_holders (item_id, student_id, term) values (dorm_free_item(x.rid, k), x.sid, p_term);
        end if;
      end loop;
    end loop;
  end if;
  perform notify(a.student_id, 'Жатақхана: жаңа бөлме', 'Бөлме ' || d.name || case when coalesce(st.mode, 'self') = 'self' then ' · орныңызды QR арқылы таңдаңыз' else '' end, '/dorm')
    from dorm_assignments a join dorm_rooms d on d.id = a.room_id join profiles p on p.id = a.student_id
    where a.term = p_term and p.class_id = p_class and a.student_id in (select (e->>'student')::uuid from jsonb_array_elements(p_rows) e);
  return n;
end $$;

create or replace function set_room_head(p_term text, p_room uuid, p_student uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not dorm_keeper(p_student) then raise exception 'Құқығыңыз жоқ'; end if;
  if not exists (select 1 from dorm_assignments where term = p_term and room_id = p_room and student_id = p_student) then raise exception 'Оқушы бұл бөлмеде емес'; end if;
  update dorm_assignments set is_head = (student_id = p_student) where term = p_term and room_id = p_room;
end $$;

-- a boy scans the QR on a bed, wardrobe or nightstand of his room and takes it
create or replace function claim_dorm_item(p_code text, p_term text) returns jsonb language plpgsql security definer set search_path = public as $$
declare i dorm_items; a dorm_assignments; st dorm_settings;
begin
  select * into i from dorm_items where code = upper(trim(p_code));
  if i.id is null then raise exception 'Мұндай QR табылмады'; end if;
  select * into a from dorm_assignments where term = p_term and student_id = auth.uid();
  if a.room_id is null or a.room_id <> i.room_id then raise exception 'Бұл зат сіздің бөлмеңізде емес'; end if;
  select s.* into st from dorm_settings s join profiles p on p.class_id = s.class_id where p.id = auth.uid();
  if coalesce(st.mode, 'self') <> 'self' then raise exception 'Орындарды тәрбиеші береді'; end if;
  if exists (select 1 from dorm_item_holders h where h.item_id = i.id and h.to_at is null) then raise exception 'Бұл зат бос емес'; end if;
  if exists (select 1 from dorm_item_holders h join dorm_items x on x.id = h.item_id where h.student_id = auth.uid() and h.to_at is null and x.kind = i.kind) then
    raise exception 'Сізде бұл түрдегі зат бар'; end if;
  insert into dorm_item_holders (item_id, student_id, term) values (i.id, auth.uid(), p_term);
  return jsonb_build_object('kind', i.kind, 'no', i.no);
end $$;

-- the tutor fixes who holds a thing (or frees it)
create or replace function set_item_holder(p_item uuid, p_student uuid, p_term text) returns void language plpgsql security definer set search_path = public as $$
declare cur uuid;
begin
  select student_id into cur from dorm_item_holders where item_id = p_item and to_at is null;
  if not ((cur is null or dorm_keeper(cur)) and (p_student is null or dorm_keeper(p_student)) and (cur is not null or p_student is not null)) then
    raise exception 'Құқығыңыз жоқ'; end if;
  update dorm_item_holders set to_at = now() where item_id = p_item and to_at is null;
  if p_student is not null then
    update dorm_item_holders h set to_at = now() from dorm_items x, dorm_items i
      where h.item_id = x.id and i.id = p_item and x.kind = i.kind and h.student_id = p_student and h.to_at is null;
    insert into dorm_item_holders (item_id, student_id, term) values (p_item, p_student, p_term);
  end if;
end $$;

create or replace function set_item_state(p_item uuid, p_state text, p_note text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() and exists (select 1 from dorm_items i join dorm_rooms r on r.id = i.room_id where i.id = p_item and r.school_id = my_school())) then
    raise exception 'Құқығыңыз жоқ'; end if;
  update dorm_items set state = p_state, note = nullif(trim(p_note), '') where id = p_item;
end $$;

/* ---------- bed swaps between roommates ---------- */
create table if not exists dorm_swaps (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  from_id uuid not null references profiles(id) on delete cascade,
  to_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'done', 'rejected')),
  created_at timestamptz not null default now()
);
alter table dorm_swaps enable row level security;
drop policy if exists dsw_read on dorm_swaps;
create policy dsw_read on dorm_swaps for select to authenticated using (auth.uid() in (from_id, to_id) or dorm_keeper(from_id));

create or replace function dorm_do_swap(s dorm_swaps) returns void language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid;
begin
  select h.item_id into a from dorm_item_holders h join dorm_items i on i.id = h.item_id where h.student_id = s.from_id and h.to_at is null and i.kind = 'bed';
  select h.item_id into b from dorm_item_holders h join dorm_items i on i.id = h.item_id where h.student_id = s.to_id and h.to_at is null and i.kind = 'bed';
  update dorm_item_holders set to_at = now() where to_at is null and item_id in (a, b);
  if b is not null then insert into dorm_item_holders (item_id, student_id, term) values (b, s.from_id, s.term); end if;
  if a is not null then insert into dorm_item_holders (item_id, student_id, term) values (a, s.to_id, s.term); end if;
  update dorm_swaps set status = 'done' where id = s.id;
end $$;

create or replace function request_bed_swap(p_to uuid, p_term text) returns void language plpgsql security definer set search_path = public as $$
declare st dorm_settings; me_room uuid; to_room uuid;
begin
  select s.* into st from dorm_settings s join profiles p on p.class_id = s.class_id where p.id = auth.uid();
  if coalesce(st.swap, 'confirm') = 'off' then raise exception 'Төсек алмасуға рұқсат жоқ'; end if;
  select room_id into me_room from dorm_assignments where term = p_term and student_id = auth.uid();
  select room_id into to_room from dorm_assignments where term = p_term and student_id = p_to;
  if me_room is null or me_room is distinct from to_room or p_to = auth.uid() then raise exception 'Тек бөлмелеспен алмасуға болады'; end if;
  insert into dorm_swaps (term, from_id, to_id) values (p_term, auth.uid(), p_to);
  perform notify(p_to, 'Төсек алмасу ұсынысы', (select full_name from profiles where id = auth.uid()), '/dorm');
end $$;

create or replace function answer_bed_swap(p_id uuid, p_ok boolean) returns void language plpgsql security definer set search_path = public as $$
declare s dorm_swaps; st dorm_settings;
begin
  select * into s from dorm_swaps where id = p_id and to_id = auth.uid() and status = 'pending';
  if s.id is null then raise exception 'Ұсыныс табылмады'; end if;
  if not p_ok then update dorm_swaps set status = 'declined' where id = p_id; return; end if;
  select d.* into st from dorm_settings d join profiles p on p.class_id = d.class_id where p.id = s.from_id;
  if coalesce(st.swap, 'confirm') = 'free' then perform dorm_do_swap(s);
  else
    update dorm_swaps set status = 'accepted' where id = p_id;
    perform notify(k.tutor_id, 'Төсек алмасуды растаңыз', (select full_name from profiles where id = s.from_id) || ' ↔ ' || (select full_name from profiles where id = s.to_id), '/dorm')
      from profiles p join classes k on k.id = p.class_id where p.id = s.from_id and k.tutor_id is not null;
  end if;
end $$;

create or replace function approve_bed_swap(p_id uuid, p_ok boolean) returns void language plpgsql security definer set search_path = public as $$
declare s dorm_swaps;
begin
  select * into s from dorm_swaps where id = p_id and status = 'accepted';
  if s.id is null or not dorm_keeper(s.from_id) then raise exception 'Ұсыныс табылмады'; end if;
  if p_ok then perform dorm_do_swap(s); else update dorm_swaps set status = 'rejected' where id = p_id; end if;
  perform notify(x, case when p_ok then 'Төсек алмасу расталды' else 'Төсек алмасу қабылданбады' end, '', '/dorm') from unnest(array[s.from_id, s.to_id]) x;
end $$;

/* ---------- linen change: rounds and answers ---------- */
create table if not exists dorm_linen_rounds (
  id bigserial primary key,
  class_id uuid not null references classes(id) on delete cascade,
  sent_at timestamptz not null default now(),
  sent_by uuid references profiles(id) on delete set null
);
create table if not exists dorm_linen_answers (
  round_id bigint not null references dorm_linen_rounds(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  answer text not null check (answer in ('done', 'later', 'no')),
  note text check (note is null or length(note) <= 300),
  answered_at timestamptz not null default now(),
  primary key (round_id, student_id)
);
alter table dorm_linen_rounds enable row level security;
alter table dorm_linen_answers enable row level security;
drop policy if exists dlr_read on dorm_linen_rounds;
create policy dlr_read on dorm_linen_rounds for select to authenticated using (exists (select 1 from classes k where k.id = class_id and k.school_id = my_school()));
drop policy if exists dla_read on dorm_linen_answers;
create policy dla_read on dorm_linen_answers for select to authenticated using (student_id = auth.uid() or dorm_keeper(student_id));

-- a new round notifies every boy of the class who lives in the dorm; p_resend only reminds those who have not answered the last one
create or replace function send_linen(p_class uuid, p_resend boolean) returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if auth.uid() is not null and not dorm_class_keeper(p_class) then raise exception 'Құқығыңыз жоқ'; end if;
  if p_resend then
    select id into rid from dorm_linen_rounds where class_id = p_class order by sent_at desc limit 1;
    if rid is null then raise exception 'Әлі хабарлама жіберілмеген'; end if;
    perform notify(p.id, 'Постельді ауыстыру — еске салу', 'Жауап беріңіз: ауыстырдыңыз ба?', '/dorm')
      from profiles p where p.class_id = p_class and p.dorm and p.removed_at is null
        and not exists (select 1 from dorm_linen_answers x where x.round_id = rid and x.student_id = p.id and x.answer = 'done');
    return rid;
  end if;
  insert into dorm_linen_rounds (class_id, sent_by) values (p_class, auth.uid()) returning id into rid;
  perform notify(p.id, 'Постельді ауыстыру күні', 'Ауыстырдым · Кейін · Ауыстырмаймын — жауап беріңіз', '/dorm')
    from profiles p where p.class_id = p_class and p.dorm and p.removed_at is null;
  return rid;
end $$;

create or replace function answer_linen(p_round bigint, p_answer text, p_note text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dorm_linen_rounds r join profiles p on p.class_id = r.class_id where r.id = p_round and p.id = auth.uid() and p.dorm) then
    raise exception 'Хабарлама табылмады'; end if;
  insert into dorm_linen_answers (round_id, student_id, answer, note) values (p_round, auth.uid(), p_answer, nullif(trim(p_note), ''))
    on conflict (round_id, student_id) do update set answer = excluded.answer, note = excluded.note, answered_at = now();
end $$;

-- hourly: a class whose reminder is due (every N days, at its time) gets a new round
create or replace function dorm_linen_tick() returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select d.*, (now() at time zone coalesce(sc.tz, 'Asia/Qostanay')) as local from dorm_settings d
           join classes k on k.id = d.class_id join schools sc on sc.id = k.school_id where d.linen_days is not null loop
    if (s.linen_last is null or s.linen_last + s.linen_days <= s.local::date) and s.local::time >= s.linen_time then
      perform send_linen(s.class_id, false);
      update dorm_settings set linen_last = s.local::date where class_id = s.class_id;
    end if;
  end loop;
end $$;
select cron.schedule('dorm-linen', '7 * * * *', 'select public.dorm_linen_tick()');

/* ---------- evening roll call by rooms; room cleanliness ---------- */
create table if not exists dorm_checks (
  on_date date not null,
  student_id uuid not null references profiles(id) on delete cascade,
  school_id uuid not null default my_school() references schools(id),
  status text not null check (status in ('present', 'absent', 'leave')),
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (on_date, student_id)
);
alter table dorm_checks enable row level security;
drop policy if exists dc_read on dorm_checks;
create policy dc_read on dorm_checks for select to authenticated using (student_id = auth.uid() or dorm_keeper(student_id));

create or replace function mark_dorm_check(p_date date, p_rows jsonb) returns int language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  for x in select (e->>'student')::uuid sid, e->>'status' st from jsonb_array_elements(p_rows) e loop
    if not dorm_keeper(x.sid) and not is_staff() then raise exception 'Құқығыңыз жоқ'; end if;
    insert into dorm_checks (on_date, student_id, school_id, status, marked_by) values (p_date, x.sid, my_school(), x.st, auth.uid())
      on conflict (on_date, student_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

create table if not exists dorm_clean (
  room_id uuid not null references dorm_rooms(id) on delete cascade,
  on_date date not null,
  score int not null check (score between 1 and 5),
  scored_by uuid references profiles(id) on delete set null,
  primary key (room_id, on_date)
);
alter table dorm_clean enable row level security;
drop policy if exists dcl_read on dorm_clean;
create policy dcl_read on dorm_clean for select to authenticated using (exists (select 1 from dorm_rooms r where r.id = room_id and r.school_id = my_school()));
drop policy if exists dcl_write on dorm_clean;
create policy dcl_write on dorm_clean for all to authenticated using (is_staff() and exists (select 1 from dorm_rooms r where r.id = room_id and r.school_id = my_school()))
  with check (is_staff() and exists (select 1 from dorm_rooms r where r.id = room_id and r.school_id = my_school()));

/* ---------- damage reports ---------- */
create table if not exists dorm_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references dorm_items(id) on delete cascade,
  student_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 2 and 500),
  photo text check (photo is null or length(photo) <= 200),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table dorm_reports enable row level security;
drop policy if exists drp_read on dorm_reports;
create policy drp_read on dorm_reports for select to authenticated using (student_id = auth.uid() or (is_staff()
  and exists (select 1 from dorm_items i join dorm_rooms r on r.id = i.room_id where i.id = item_id and r.school_id = my_school())));
drop policy if exists drp_insert on dorm_reports;
create policy drp_insert on dorm_reports for insert to authenticated with check (student_id = auth.uid()
  and exists (select 1 from dorm_items i join dorm_rooms r on r.id = i.room_id where i.id = item_id and r.school_id = my_school()));
drop policy if exists drp_update on dorm_reports;
create policy drp_update on dorm_reports for update to authenticated using (is_staff()
  and exists (select 1 from dorm_items i join dorm_rooms r on r.id = i.room_id where i.id = item_id and r.school_id = my_school()));

/* ---------- guests in holidays (the dorm head's) ---------- */
create table if not exists dorm_guests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  from_school text check (from_school is null or length(from_school) <= 120),
  from_date date not null,
  to_date date not null check (to_date >= from_date),
  room_id uuid references dorm_rooms(id) on delete set null,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table dorm_guests enable row level security;
drop policy if exists dg_all on dorm_guests;
create policy dg_all on dorm_guests for all to authenticated using (school_id = my_school() and is_dorm_head()) with check (school_id = my_school() and is_dorm_head());

/* ---------- the dorm head is set like a staff kind ---------- */
create or replace function set_staff_info(p_user uuid, p_kind text, p_subject text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() and p_user <> auth.uid() then raise exception 'Мұғалім мәліметін әкімші немесе орынбасар өзгертеді'; end if;
  update profiles set staff_kind = case when is_deputy() then p_kind else staff_kind end, subject = nullif(trim(p_subject), '')
    where id = p_user and school_id = my_school() and role <> 'student';
  if not found then raise exception 'Мұғалім табылмады'; end if;
end $$;

revoke execute on function is_dorm_head, dorm_keeper, dorm_class_keeper, set_dorm_resident, dorm_room_editor, set_dorm_settings, dorm_free_item,
  dorm_publish, set_room_head, claim_dorm_item, set_item_holder, set_item_state, dorm_do_swap, request_bed_swap, answer_bed_swap, approve_bed_swap,
  send_linen, answer_linen, dorm_linen_tick, mark_dorm_check from public, anon;
grant execute on function is_dorm_head, dorm_keeper, dorm_class_keeper, set_dorm_resident, dorm_room_editor, set_dorm_settings,
  dorm_publish, set_room_head, claim_dorm_item, set_item_holder, set_item_state, request_bed_swap, answer_bed_swap, approve_bed_swap,
  send_linen, answer_linen, mark_dorm_check to authenticated;
notify pgrst, 'reload schema';
