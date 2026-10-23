-- 0047 (1.2.0): staff directory (teachers, tutors, other staff, a teacher's subject), roles inside an initiative,
-- posts written as a subject or as an initiative role («Парламент · Мәдениет министрі»).
-- Run after 0046, as one script in the Supabase SQL Editor.

/* ---------- staff: kind and subject ---------- */
alter table profiles add column if not exists staff_kind text check (staff_kind in ('teacher', 'tutor', 'staff')),
  add column if not exists subject text check (subject is null or length(subject) <= 60);

-- admin or deputy sets anyone's kind and subject; a teacher may set their own subject
create or replace function set_staff_info(p_user uuid, p_kind text, p_subject text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() and p_user <> auth.uid() then raise exception 'Мұғалім мәліметін әкімші немесе орынбасар өзгертеді'; end if;
  update profiles set staff_kind = case when is_deputy() then p_kind else staff_kind end, subject = nullif(trim(p_subject), '')
    where id = p_user and school_id = my_school() and role <> 'student';
  if not found then raise exception 'Мұғалім табылмады'; end if;
end $$;

/* ---------- roles inside an initiative: «Капитан», «Мәдениет министрі» ---------- */
create table if not exists activity_roles (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 60),
  holder_id uuid references profiles(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activity_roles_activity on activity_roles(activity_id, sort);
create index if not exists activity_roles_holder on activity_roles(holder_id);
alter table activity_roles enable row level security;
drop policy if exists role_read on activity_roles;
create policy role_read on activity_roles for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
drop policy if exists role_write on activity_roles;
create policy role_write on activity_roles for all to authenticated using (can_manage_activity(activity_id)) with check (can_manage_activity(activity_id)
  and (holder_id is null or exists (select 1 from profiles p where p.id = holder_id and p.school_id = my_school())));

/* ---------- posts: as a subject, or as a role ---------- */
alter table posts add column if not exists role_id uuid references activity_roles(id) on delete set null,
  add column if not exists as_subject boolean not null default false;

drop function if exists create_feed_post(text, text, text, text, uuid, boolean, boolean, uuid);
create or replace function create_feed_post(p_kind text, p_title text, p_body text, p_photo text default null, p_activity uuid default null,
  p_hide_likes boolean default false, p_comments_off boolean default false, p_repost_of uuid default null,
  p_role uuid default null, p_as_subject boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); o posts; a activities; r activity_roles; pid uuid; t text := trim(coalesce(p_title, ''));
begin
  if u.id is null then raise exception 'Кіріңіз'; end if;
  if p_kind not in ('news','announcement','project','event') then raise exception 'Жазба түрі қате'; end if;
  if p_repost_of is not null then
    select * into o from posts where id = p_repost_of and school_id = u.school_id and hidden_at is null
      and kind in ('news','announcement','project','event') and visibility = 'public';
    if o.id is null then raise exception 'Жазба табылмады'; end if;
    if o.repost_of is not null then select * into o from posts where id = o.repost_of; end if;   -- repost the original, not a repost
    p_kind := o.kind; t := o.title; p_photo := null;
  end if;
  if p_role is not null then
    -- a role's holder writes in the initiative's name, signed with the role
    select * into r from activity_roles where id = p_role and holder_id = u.id;
    if r.id is null then raise exception 'Бұл рөл сізге берілмеген'; end if;
    p_activity := r.activity_id;
    select * into a from activities where id = p_activity and school_id = u.school_id and status = 'approved';
    if a.id is null then raise exception 'Бастама табылмады'; end if;
  elsif p_activity is not null then
    if not leads_activity(p_activity) then raise exception 'Бастама атынан жетекші немесе жауапты оқушы жазады'; end if;
    select * into a from activities where id = p_activity;
  elsif p_kind = 'announcement' and u.role = 'student' then raise exception 'Хабарландыруды мұғалім жариялайды';
  elsif p_kind <> 'announcement' and u.role = 'student' and not u.parliament then raise exception 'Жаңалықты мұғалім немесе парламент мүшесі жариялайды';
  end if;
  if p_as_subject and (u.role = 'student' or u.subject is null or r.id is not null or p_activity is not null) then
    raise exception 'Пән атынан тек пәні көрсетілген мұғалім жазады'; end if;
  if p_photo is not null and p_photo not like u.id::text || '/%' then raise exception 'Фото қате'; end if;
  insert into posts(school_id, author_id, kind, title, body, photo, activity_id, hide_likes, comments_off, repost_of, role_id, as_subject)
    values (u.school_id, u.id, p_kind, t, coalesce(trim(p_body), ''), p_photo, p_activity, p_hide_likes, p_comments_off, o.id, r.id, coalesce(p_as_subject, false))
    returning id into pid;
  if a.id is not null and o.id is null then
    perform notify(e.student_id, a.title || ': жаңа жазба', t, '/a/' || a.id)
      from enrollments e where e.activity_id = a.id and not e.waitlisted and e.student_id <> u.id;
  end if;
  return pid;
end $$;

revoke execute on function set_staff_info, create_feed_post from public, anon;
grant execute on function set_staff_info, create_feed_post to authenticated;
notify pgrst, 'reload schema';
