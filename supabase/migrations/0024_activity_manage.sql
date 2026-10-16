-- 0024: managing an approved activity — edit details and times, change the leader, add/remove people,
-- open/close registration, archive, stop, remove (soft).
alter table activities add column enrollment_open boolean not null default true,
  add column archived_at timestamptz,
  add column removed_at timestamptz;

-- removed activities disappear for everyone (restrictive: ANDed with read_activities)
create policy act_not_removed on activities as restrictive for select to authenticated using (removed_at is null);

create function can_manage_activity(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = p_id and a.school_id = my_school() and a.removed_at is null
    and (a.supervisor_id = auth.uid() or is_deputy()))
$$;

-- p: same shape as submit_activity
create function update_activity(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare a activities; sup profiles; moved boolean;
begin
  if not can_manage_activity(p_id) then raise exception 'Іс-шараны жетекші немесе орынбасар өзгертеді'; end if;
  select * into a from activities where id = p_id for update;
  select * into sup from profiles where id = (p->>'supervisor_id')::uuid;
  if sup.id is null or sup.school_id <> a.school_id or sup.role = 'student' then raise exception 'Жауапты мұғалімді таңдаңыз'; end if;
  if length(trim(p->>'title')) < 3 then raise exception 'Атауы кемінде 3 таңба'; end if;
  if (p->>'end_time')::time <= (p->>'start_time')::time then raise exception 'Аяқталу уақыты басталудан кейін болуы керек'; end if;
  if p->>'schedule' = 'weekly' and (p->>'date_to')::date < (p->>'date_from')::date then raise exception 'Кезеңнің соңы басынан кейін болуы керек'; end if;
  update activities set title = trim(p->>'title'), description = p->>'description', place = p->>'place', supervisor_id = sup.id,
    type = (p->>'type')::activity_type,
    audience_grades = coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'audience_grades') x), '{}'),
    capacity = nullif(p->>'capacity','')::int, schedule = (p->>'schedule')::schedule_kind,
    on_date = nullif(p->>'on_date','')::date,
    weekdays = (select array_agg(x::int) from jsonb_array_elements_text(p->'weekdays') x),
    date_from = nullif(p->>'date_from','')::date, date_to = nullif(p->>'date_to','')::date,
    start_time = (p->>'start_time')::time, end_time = (p->>'end_time')::time,
    slots = case when jsonb_typeof(p->'slots') = 'array' and jsonb_array_length(p->'slots') > 0 then p->'slots' end,
    updated_at = now()
  where id = p_id;
  moved := (select row(x.schedule, x.on_date, x.weekdays, x.date_from, x.date_to, x.start_time, x.end_time, x.slots::text, x.place)
            is distinct from row(a.schedule, a.on_date, a.weekdays, a.date_from, a.date_to, a.start_time, a.end_time, a.slots::text, a.place)
            from activities x where x.id = p_id);
  if moved then
    perform notify(e.student_id, 'Іс-шараның уақыты немесе орны өзгерді', trim(p->>'title'), '/a/' || p_id)
      from enrollments e where e.activity_id = p_id and not e.waitlisted;
  end if;
  if sup.id <> a.supervisor_id then perform notify(sup.id, 'Сіз іс-шараның жетекшісі болдыңыз', trim(p->>'title'), '/a/' || p_id); end if;
end $$;

create function set_activity_flags(p_id uuid, p_open boolean, p_archived boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_activity(p_id) then raise exception 'Құқығыңыз жоқ'; end if;
  update activities set enrollment_open = coalesce(p_open, enrollment_open),
    archived_at = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) end
  where id = p_id;
end $$;

create function remove_activity(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare a activities;
begin
  if not can_manage_activity(p_id) then raise exception 'Құқығыңыз жоқ'; end if;
  update activities set removed_at = now(), status = 'cancelled' where id = p_id returning * into a;
  perform notify(e.student_id, 'Іс-шара жойылды', a.title, '/') from enrollments e where e.activity_id = p_id and not e.waitlisted;
end $$;

-- joining respects closed registration and archive
create or replace function join_activity(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities; g int; n int;
begin
  select * into a from activities where id = p_id for update;
  if a.id is null or a.school_id <> u.school_id or a.status <> 'approved' or a.removed_at is not null then raise exception 'Іс-шара табылмады'; end if;
  if not a.enrollment_open or a.archived_at is not null then raise exception 'Тіркелу жабық'; end if;
  if u.role <> 'student' then raise exception 'Тек оқушылар жазыла алады'; end if;
  select grade into g from classes where id = u.class_id;
  if a.audience_grades <> '{}' and (g is null or not g = any(a.audience_grades)) then
    raise exception 'Бұл іс-шара сіздің сыныпқа арналмаған'; end if;
  if coalesce(a.date_to, a.on_date) < school_today(a.school_id) then raise exception 'Іс-шара аяқталған'; end if;
  select count(*) into n from enrollments where activity_id = p_id and not waitlisted;
  insert into enrollments (activity_id, student_id, waitlisted)
    values (p_id, u.id, a.capacity is not null and n >= a.capacity)
    on conflict do nothing;
  return not (a.capacity is not null and n >= a.capacity);
end $$;

-- managers add, accept and remove participants directly; a student may remove only themselves
alter table enrollments enable row level security;
create policy enr_manage on enrollments for all to authenticated using (can_manage_activity(activity_id))
  with check (can_manage_activity(activity_id) and exists (select 1 from profiles p where p.id = student_id and p.role = 'student' and p.school_id = my_school()));
create policy enr_self on enrollments for all to authenticated using (student_id = auth.uid()) with check (false);

create function enrollment_added() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.student_id <> coalesce(auth.uid(), new.student_id) and not new.waitlisted then
    perform notify(new.student_id, 'Сізді іс-шараға қосты', (select title from activities where id = new.activity_id), '/a/' || new.activity_id);
  end if;
  return new;
end $$;
create trigger enrollment_added after insert or update of waitlisted on enrollments for each row execute function enrollment_added();

revoke execute on function can_manage_activity, update_activity, set_activity_flags, remove_activity, enrollment_added from public, anon;
grant execute on function can_manage_activity, update_activity, set_activity_flags, remove_activity to authenticated;
revoke execute on function enrollment_added from authenticated;
