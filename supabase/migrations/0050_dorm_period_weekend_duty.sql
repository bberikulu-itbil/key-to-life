-- 0050 (1.4.0): dorm settings grouped as the tutor sees them.
--  · the current placement's dates (when this placement is valid), editable
--  · weekend room change: when allowed, a boy says in which room he stays this Saturday–Sunday
--  · room duty roster: who is on duty in a room on each weekday of the term

alter table dorm_settings add column if not exists period_from date,
  add column if not exists period_to date,
  add column if not exists weekend_move boolean not null default false;
alter table dorm_settings add constraint dorm_settings_period_check check (period_to is null or period_from is null or period_to >= period_from);

-- one call for all of a class's dorm settings (the bed mode is set in the placement wizard and kept here as it was)
create or replace function save_dorm_settings(p_class uuid, p_mode text, p_swap text, p_linen_days int, p_linen_time time, p_criteria jsonb,
  p_weekend boolean, p_from date, p_to date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_dorm_settings(p_class, p_mode, p_swap, p_linen_days, p_linen_time, p_criteria);
  update dorm_settings set weekend_move = coalesce(p_weekend, false), period_from = p_from, period_to = p_to where class_id = p_class;
end $$;

/* ---------- weekend room change ---------- */
create table if not exists dorm_weekend (
  weekend date not null,                                   -- the Saturday
  student_id uuid not null references profiles(id) on delete cascade,
  room_id uuid references dorm_rooms(id) on delete cascade, -- null: stays in his own room
  created_at timestamptz not null default now(),
  primary key (weekend, student_id)
);
alter table dorm_weekend enable row level security;
create policy dw_read on dorm_weekend for select to authenticated
  using (exists (select 1 from profiles p where p.id = student_id and p.school_id = my_school()));

-- the Saturday of this weekend: Monday–Saturday look ahead to it, Sunday looks back
create or replace function dorm_weekend_of(d date) returns date language sql immutable as $$
  select case when extract(isodow from d) = 7 then d - 1 else d + (6 - extract(isodow from d)::int) end
$$;

create or replace function set_weekend_room(p_term text, p_room uuid) returns date language plpgsql security definer set search_path = public as $$
declare me profiles := me(); w date; st dorm_settings; r dorm_rooms; own uuid; n int;
begin
  if me.id is null or me.role <> 'student' then raise exception 'Тек жатақханадағы оқушы'; end if;
  select * into st from dorm_settings where class_id = me.class_id;
  if not coalesce(st.weekend_move, false) then raise exception 'Апта соңы бөлме ауыстыруға рұқсат жоқ'; end if;
  select room_id into own from dorm_assignments where term = p_term and student_id = me.id;
  if own is null then raise exception 'Бөлмеге әлі орналастырылмағансыз'; end if;
  w := dorm_weekend_of(school_today(me.school_id));
  if p_room is not null and p_room <> own then
    select * into r from dorm_rooms where id = p_room and school_id = me.school_id and active;
    if r.id is null then raise exception 'Бөлме табылмады'; end if;
    -- who sleeps there this weekend: its own boys who did not move out, plus those who moved in
    select count(*) into n from (
      select a.student_id from dorm_assignments a where a.term = p_term and a.room_id = r.id
        and not exists (select 1 from dorm_weekend x where x.weekend = w and x.student_id = a.student_id and x.room_id is not null and x.room_id <> r.id)
      union select x.student_id from dorm_weekend x where x.weekend = w and x.room_id = r.id and x.student_id <> me.id) t;
    if n >= r.capacity then raise exception 'Бөлме толы: %', r.name; end if;
  end if;
  insert into dorm_weekend (weekend, student_id, room_id) values (w, me.id, nullif(p_room, own))
    on conflict (weekend, student_id) do update set room_id = excluded.room_id, created_at = now();
  return w;
end $$;

/* ---------- room duty roster ---------- */
create table if not exists dorm_duty (
  term text not null,
  room_id uuid not null references dorm_rooms(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  student_id uuid references profiles(id) on delete cascade,
  primary key (term, room_id, weekday)
);
alter table dorm_duty enable row level security;
create policy ddu_read on dorm_duty for select to authenticated
  using (exists (select 1 from dorm_rooms r where r.id = room_id and r.school_id = my_school()));

-- p_rows = [{weekday, student}]; a day another tutor's boy holds is left as it is
create or replace function set_dorm_duty(p_term text, p_room uuid, p_rows jsonb) returns int language plpgsql security definer set search_path = public as $$
declare x record; cur uuid; n int := 0;
begin
  if not is_staff() then raise exception 'Құқығыңыз жоқ'; end if;
  for x in select (e->>'weekday')::int wd, nullif(e->>'student', '')::uuid sid from jsonb_array_elements(p_rows) e loop
    if x.sid is not null and not (dorm_keeper(x.sid) and exists (select 1 from dorm_assignments a where a.term = p_term and a.room_id = p_room and a.student_id = x.sid)) then
      raise exception 'Оқушы бұл бөлмеде емес'; end if;
    select student_id into cur from dorm_duty where term = p_term and room_id = p_room and weekday = x.wd;
    continue when cur is not null and not dorm_keeper(cur);
    if not exists (select 1 from dorm_rooms r where r.id = p_room and r.school_id = my_school()) then raise exception 'Бөлме табылмады'; end if;
    insert into dorm_duty (term, room_id, weekday, student_id) values (p_term, p_room, x.wd, x.sid)
      on conflict (term, room_id, weekday) do update set student_id = excluded.student_id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function save_dorm_settings, set_weekend_room, set_dorm_duty from public, anon;
grant execute on function save_dorm_settings, set_weekend_room, set_dorm_duty to authenticated;
notify pgrst, 'reload schema';
