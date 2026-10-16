-- Booking: Аймақ (resource_groups) → Орын (resources) → bookings.
create extension if not exists btree_gist;
create type booking_status as enum ('pending','approved','rejected','cancelled');

create table resource_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  name text not null check (length(name) between 2 and 60),
  sort int not null default 0,
  unique (school_id, name)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  group_id uuid not null references resource_groups(id),
  name text not null check (length(name) between 2 and 80),
  capacity int check (capacity is null or capacity between 1 and 2000),
  manager_id uuid not null references profiles(id),
  slot_minutes int not null default 30 check (slot_minutes in (15,30,45,60,90,120)),
  open_from time not null default '08:00',
  open_to time not null default '22:00',
  active boolean not null default true,
  check (open_to > open_from)
);
create index on resources (group_id);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('B-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  resource_id uuid not null references resources(id),
  user_id uuid not null references profiles(id),
  on_date date not null,
  start_time time not null,
  end_time time not null,
  purpose text not null check (length(purpose) between 3 and 300),
  status booking_status not null,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  -- one live booking per slot: pending requests also hold the slot
  exclude using gist (resource_id with =, tsrange(on_date + start_time, on_date + end_time) with &&)
    where (status in ('pending','approved'))
);
create index on bookings (resource_id, on_date);
create index on bookings (user_id);

alter table resource_groups enable row level security;
alter table resources enable row level security;
alter table bookings enable row level security;
create policy read_groups on resource_groups for select to authenticated using (school_id = my_school());
create policy read_resources on resources for select to authenticated using (school_id = my_school());
create policy read_bookings on bookings for select to authenticated using (
  exists (select 1 from resources r where r.id = resource_id));

create function create_booking(p_resource uuid, p_date date, p_start time, p_end time, p_purpose text) returns text
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); r resources; st booking_status; c text;
begin
  select * into r from resources where id = p_resource;
  if r.id is null or r.school_id <> u.school_id or not r.active then raise exception 'Орын табылмады'; end if;
  if p_date < school_today(r.school_id) then raise exception 'Өткен күнді броньдауға болмайды'; end if;
  if p_start < r.open_from or p_end > r.open_to or p_end <= p_start then raise exception 'Уақыт орынның ашық сағатынан тыс'; end if;
  if (extract(epoch from p_start - r.open_from) / 60)::int % r.slot_minutes <> 0
     or (extract(epoch from p_end - p_start) / 60)::int % r.slot_minutes <> 0 then raise exception 'Уақытты слоттар бойынша таңдаңыз'; end if;
  if coalesce(length(trim(p_purpose)), 0) < 3 then raise exception 'Мақсатын жазыңыз'; end if;
  st := case when u.id = r.manager_id or u.role in ('deputy','admin') then 'approved' else 'pending' end;
  insert into bookings (resource_id, user_id, on_date, start_time, end_time, purpose, status, decided_by, decided_at)
    values (p_resource, u.id, p_date, p_start, p_end, trim(p_purpose), st,
            case when st = 'approved' then u.id end, case when st = 'approved' then now() end)
    returning code into c;
  if st = 'pending' then
    perform notify(r.manager_id, 'Бронь сұрауы', u.full_name || ' · ' || r.name || ' · ' || to_char(p_date, 'DD.MM') || ' ' || to_char(p_start, 'HH24:MI'), '/bookings');
  end if;
  return c;
exception when exclusion_violation then raise exception 'Бұл уақыт бос емес — басқа слот таңдаңыз';
end $$;

create function decide_booking(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; r resources;
begin
  select * into b from bookings where id = p_id for update;
  select * into r from resources where id = b.resource_id;
  if b.id is null or r.school_id <> my_school() then raise exception 'Бронь табылмады'; end if;
  if b.status <> 'pending' then raise exception 'Бронь шешіліп қойған'; end if;
  if not (auth.uid() = r.manager_id or is_deputy()) then raise exception 'Бұл орынның жауаптысы ғана шеше алады'; end if;
  update bookings set status = case when p_approve then 'approved'::booking_status else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), note = nullif(trim(p_note), '') where id = p_id;
  perform notify(b.user_id, case when p_approve then 'Бронь расталды' else 'Бронь қабылданбады' end,
    r.name || ' · ' || to_char(b.on_date, 'DD.MM') || ' ' || to_char(b.start_time, 'HH24:MI') || ' · ' || b.code
    || coalesce(' · ' || nullif(trim(p_note), ''), ''), '/bookings');
end $$;

create function cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; r resources;
begin
  select * into b from bookings where id = p_id for update;
  select * into r from resources where id = b.resource_id;
  if b.id is null or r.school_id <> my_school() then raise exception 'Бронь табылмады'; end if;
  if not (auth.uid() in (b.user_id, r.manager_id) or is_deputy()) then raise exception 'Құқығыңыз жоқ'; end if;
  if b.status not in ('pending','approved') then raise exception 'Бронь белсенді емес'; end if;
  update bookings set status = 'cancelled' where id = p_id;
  if auth.uid() <> b.user_id then
    perform notify(b.user_id, 'Бронь тоқтатылды', r.name || ' · ' || to_char(b.on_date, 'DD.MM') || ' · ' || b.code, '/bookings');
  end if;
end $$;

create function update_resource(p_id uuid, p_slot int, p_from time, p_to time, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r resources;
begin
  select * into r from resources where id = p_id;
  if r.id is null or r.school_id <> my_school() then raise exception 'Орын табылмады'; end if;
  if not (auth.uid() = r.manager_id or is_deputy()) then raise exception 'Тек жауапты кісі баптай алады'; end if;
  update resources set slot_minutes = p_slot, open_from = p_from, open_to = p_to, active = p_active where id = p_id;
end $$;

create function create_resource(p_group text, p_name text, p_manager uuid, p_capacity int) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid := my_school(); g uuid; rid uuid;
begin
  if not is_deputy() then raise exception 'Орынды тек орынбасар қоса алады'; end if;
  if not exists (select 1 from profiles where id = p_manager and school_id = s and role <> 'student') then raise exception 'Жауапты мұғалімді таңдаңыз'; end if;
  insert into resource_groups (school_id, name) values (s, trim(p_group)) on conflict (school_id, name) do nothing;
  select id into g from resource_groups where school_id = s and name = trim(p_group);
  insert into resources (school_id, group_id, name, manager_id, capacity) values (s, g, trim(p_name), p_manager, p_capacity) returning id into rid;
  return rid;
end $$;

revoke execute on function create_booking, decide_booking, cancel_booking, update_resource, create_resource from public, anon;
grant execute on function create_booking, decide_booking, cancel_booking, update_resource, create_resource to authenticated;
