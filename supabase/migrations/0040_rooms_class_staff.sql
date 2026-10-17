-- 0040: rooms by floor with several responsible teachers, visibility, booking mode and hidden free slots;
-- the admin assigns a class's teacher and edits teachers from the class page.

-- ---------- class page: staff ----------
create function set_class_teacher(p_class uuid, p_teacher uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() then raise exception 'Сынып жетекшісін әкімші немесе орынбасар белгілейді'; end if;
  if p_teacher is not null and not exists (select 1 from profiles where id = p_teacher and school_id = my_school() and role <> 'student') then
    raise exception 'Мұғалімді таңдаңыз'; end if;
  update classes set teacher_id = p_teacher where id = p_class and school_id = my_school();
  update profiles set role = 'class_teacher' where id = p_teacher and role = 'teacher';
end $$;

create function update_staff(p_user uuid, p_full_name text, p_title text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() then raise exception 'Мұғалім мәліметін әкімші немесе орынбасар өзгертеді'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'Аты-жөнін жазыңыз'; end if;
  update profiles set full_name = trim(p_full_name), title = nullif(trim(p_title), '')
    where id = p_user and school_id = my_school() and role <> 'student';
  if not found then raise exception 'Мұғалім табылмады'; end if;
end $$;

revoke execute on function set_class_teacher, update_staff from public, anon;
grant execute on function set_class_teacher, update_staff to authenticated;

-- ---------- rooms ----------
alter table resources
  add column title text check (title is null or length(title) <= 80),                      -- «Ағылшын тілі», «Кітапхана»
  add column mode text not null default 'open' check (mode in ('open','request','closed')), -- open: confirmed at once; request: a responsible teacher decides; closed: not bookable
  add column audience text not null default 'all' check (audience in ('all','staff','listed')),
  add column hide_slots boolean not null default false,                                     -- others do not see the schedule, only send a request
  add column managers uuid[] not null default '{}',   -- responsible teachers besides manager_id (the first one)
  add column viewers uuid[] not null default '{}';    -- audience 'listed': who else sees the room

create function manages_resource(p_resource uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from resources r where r.id = p_resource and (r.manager_id = auth.uid() or auth.uid() = any(r.managers)))
$$;
create function sees_resource(r resources) returns boolean language sql stable security definer set search_path = public as $$
  select r.school_id = my_school() and (manages_resource(r.id) or (r.active and (r.audience = 'all'
    or (r.audience = 'staff' and (select role from profiles where id = auth.uid()) <> 'student')
    or (r.audience = 'listed' and auth.uid() = any(r.viewers)))))
$$;

alter policy read_resources on resources using (sees_resource(resources));
-- with hidden slots only the booker and the responsible teachers see a booking
alter policy read_bookings on bookings using (exists (select 1 from resources r where r.id = resource_id
  and (not r.hide_slots or user_id = auth.uid() or manages_resource(r.id))));

create or replace function create_booking(p_resource uuid, p_date date, p_start time, p_end time, p_purpose text) returns text
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); r resources; st booking_status; c text; boss boolean;
begin
  select * into r from resources where id = p_resource;
  if r.id is null or not sees_resource(r) then raise exception 'Орын табылмады'; end if;
  boss := manages_resource(r.id);
  if r.mode = 'closed' and not boss then raise exception 'Бұл бөлме броньдалмайды'; end if;
  if p_date < school_today(r.school_id) then raise exception 'Өткен күнді броньдауға болмайды'; end if;
  if p_start < r.open_from or p_end > r.open_to or p_end <= p_start then raise exception 'Уақыт орынның ашық сағатынан тыс'; end if;
  if (extract(epoch from p_start - r.open_from) / 60)::int % r.slot_minutes <> 0
     or (extract(epoch from p_end - p_start) / 60)::int % r.slot_minutes <> 0 then raise exception 'Уақытты слоттар бойынша таңдаңыз'; end if;
  if coalesce(length(trim(p_purpose)), 0) < 3 then raise exception 'Мақсатын жазыңыз'; end if;
  st := case when boss or r.mode = 'open' then 'approved' else 'pending' end;
  insert into bookings (resource_id, user_id, on_date, start_time, end_time, purpose, status, decided_by, decided_at)
    values (p_resource, u.id, p_date, p_start, p_end, trim(p_purpose), st,
            case when st = 'approved' then u.id end, case when st = 'approved' then now() end)
    returning code into c;
  if st = 'pending' then
    perform notify(m.user_id, 'Бронь сұрауы', u.full_name || ' · ' || r.name || ' · ' || to_char(p_date, 'DD.MM') || ' ' || to_char(p_start, 'HH24:MI'), '/bookings/review')
      from (select r.manager_id user_id union select unnest(r.managers)) m;
  end if;
  return c;
exception when exclusion_violation then raise exception 'Бұл уақыт бос емес — басқа слот таңдаңыз';
end $$;

create or replace function decide_booking(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; r resources;
begin
  select * into b from bookings where id = p_id for update;
  select * into r from resources where id = b.resource_id;
  if b.id is null or r.school_id <> my_school() then raise exception 'Бронь табылмады'; end if;
  if b.status <> 'pending' then raise exception 'Бронь шешіліп қойған'; end if;
  if not manages_resource(r.id) then raise exception 'Бұл орынның жауаптысы ғана шеше алады'; end if;
  update bookings set status = case when p_approve then 'approved'::booking_status else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), note = nullif(trim(p_note), '') where id = p_id;
  perform notify(b.user_id, case when p_approve then 'Бронь расталды' else 'Бронь қабылданбады' end,
    r.name || ' · ' || to_char(b.on_date, 'DD.MM') || ' ' || to_char(b.start_time, 'HH24:MI') || ' · ' || b.code
    || coalesce(' · ' || nullif(trim(p_note), ''), ''), '/bookings');
end $$;

create or replace function cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; r resources;
begin
  select * into b from bookings where id = p_id for update;
  select * into r from resources where id = b.resource_id;
  if b.id is null or r.school_id <> my_school() then raise exception 'Бронь табылмады'; end if;
  if not (auth.uid() = b.user_id or manages_resource(r.id)) then raise exception 'Құқығыңыз жоқ'; end if;
  if b.status not in ('pending','approved') then raise exception 'Бронь белсенді емес'; end if;
  update bookings set status = 'cancelled' where id = p_id;
  if auth.uid() <> b.user_id then
    perform notify(b.user_id, 'Бронь тоқтатылды', r.name || ' · ' || to_char(b.on_date, 'DD.MM') || ' · ' || b.code, '/bookings');
  end if;
end $$;

-- a responsible teacher (or a deputy) sets everything about a room, including who else is responsible
create function update_room(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare r resources; mgr uuid[] := array(select jsonb_array_elements_text(p->'managers')::uuid);
  vw uuid[] := array(select jsonb_array_elements_text(coalesce(p->'viewers', '[]'))::uuid);
begin
  select * into r from resources where id = p_id;
  if r.id is null or r.school_id <> my_school() then raise exception 'Орын табылмады'; end if;
  if not manages_resource(r.id) then raise exception 'Тек жауапты кісі баптай алады'; end if;
  if coalesce(array_length(mgr, 1), 0) = 0 then raise exception 'Кемінде бір жауапты керек'; end if;
  if exists (select 1 from unnest(mgr) x where not exists (select 1 from profiles where id = x and school_id = r.school_id and role <> 'student')) then
    raise exception 'Жауапты тек мұғалім бола алады'; end if;
  update resources set title = nullif(trim(p->>'title'), ''), capacity = nullif(p->>'capacity', '')::int,
    slot_minutes = (p->>'slot')::int, open_from = (p->>'from')::time, open_to = (p->>'to')::time, active = (p->>'active')::boolean,
    mode = p->>'mode', audience = p->>'audience', hide_slots = (p->>'hide_slots')::boolean, manager_id = mgr[1], managers = mgr,
    viewers = array(select x from unnest(vw) x join profiles pr on pr.id = x and pr.school_id = r.school_id)
    where id = p_id;
end $$;

create or replace function create_resource(p_group text, p_name text, p_manager uuid, p_capacity int) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid := my_school(); g uuid; rid uuid;
begin
  if not is_deputy() then raise exception 'Орынды тек орынбасар қоса алады'; end if;
  if not exists (select 1 from profiles where id = p_manager and school_id = s and role <> 'student') then raise exception 'Жауапты мұғалімді таңдаңыз'; end if;
  insert into resource_groups (school_id, name) values (s, trim(p_group)) on conflict (school_id, name) do nothing;
  select id into g from resource_groups where school_id = s and name = trim(p_group);
  insert into resources (school_id, group_id, name, manager_id, managers, capacity) values (s, g, trim(p_name), p_manager, array[p_manager], p_capacity) returning id into rid;
  return rid;
end $$;

revoke execute on function manages_resource, sees_resource, update_room from public, anon;
grant execute on function manages_resource, sees_resource, update_room to authenticated;

-- ---------- the lyceum's rooms (responsible: the school admin until rooms are handed out) ----------
do $$
declare s uuid; adm uuid; g uuid; x record;
begin
  select id into s from schools where name = 'Қостанай Білім-Инновация лицейі';
  select id into adm from profiles where school_id = s and role = 'admin' order by created_at limit 1;
  if s is null or adm is null then return; end if;
  for x in select * from (values
    (1,'105','Алғашқы әскери дайындық',22,'open','all'), (1,'106','Кітапхана',null,'request','all'),
    (1,'107','АХЧ орынбасары',null,'closed','all'), (1,'109','Директордың қабылдау бөлмесі',null,'closed','all'),
    (1,'112','Ағылшын тілі',22,'open','all'), (1,'113','Ағылшын тілі',22,'open','all'), (1,'114','Ағылшын тілі',22,'open','all'),
    (2,'201','Кәсіби бағдар беруші (Профориентатор)',null,'request','staff'), (2,'202','Қазақ тілі және әдебиеті',22,'open','all'),
    (2,'204','Қазақ тілі және әдебиеті',22,'open','all'), (2,'206','Психолог кабинеті',null,'closed','all'),
    (2,'207','Тәрбие ісі жөніндегі орынбасары (ТІО)',null,'closed','all'), (2,'208','Химия кабинеті',22,'open','all'),
    (2,'209','Биология кабинеті',22,'open','all'), (2,'210','Қоғамдық істер жөніндегі орынбасары',null,'closed','all'),
    (2,'Коворкинг','Ашық коворкинг аймағы',null,'request','all'), (2,'Мұғалімдер бөлмесі','Ұжымдық бөлме',null,'closed','all'),
    (3,'301','Олимпиада бөлмесі',5,'request','all'), (3,'302','Түрік тілі',22,'open','all'), (3,'304','Дүниежүзі тарихы',22,'open','all'),
    (3,'305','Математика',22,'open','all'), (3,'306','Математика',22,'open','all'), (3,'307','Физика',22,'open','all'),
    (3,'308','Математика',22,'open','all'), (3,'309','Олимпиада бөлмесі',5,'request','all'),
    (4,'401','Олимпиада бөлмесі',5,'request','all'), (4,'402','Еңбек (технология)',22,'open','all'), (4,'403','Орыс тілі',22,'open','all'),
    (4,'404','Орыс тілі',22,'open','all'), (4,'405','Қазақстан тарихы',28,'open','all'), (4,'406','География',22,'open','all'),
    (4,'407','Информатика · компьютерлік сынып',20,'request','all'), (4,'407A','Информатика',null,'request','listed')
  ) v(floor, name, title, cap, mode, audience) loop
    insert into resource_groups (school_id, name, sort) values (s, x.floor || '-қабат', x.floor) on conflict (school_id, name) do update set sort = excluded.sort;
    select id into g from resource_groups where school_id = s and name = x.floor || '-қабат';
    if not exists (select 1 from resources where school_id = s and name = x.name) then
      insert into resources (school_id, group_id, name, title, capacity, manager_id, managers, mode, audience)
        values (s, g, x.name, x.title, x.cap, adm, array[adm], x.mode, x.audience);
    end if;
  end loop;
end $$;
