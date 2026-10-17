-- 0039: feed types Жаңалық / Хабарландыру / Жобалар / Оқиғалар; new initiative types (league, community, team);
-- everyone sets their own photo; the class teacher and tutor edit their students' details.
alter table posts drop constraint posts_kind_check;
alter table posts add constraint posts_kind_check check (kind in ('news','announcement','project','event','lost','found','proposal'));

alter type activity_type add value if not exists 'league';
alter type activity_type add value if not exists 'community';
alter type activity_type add value if not exists 'team';

-- projects and events are written by the same people as news
create or replace function create_feed_post(p_kind text, p_title text, p_body text, p_photo text default null, p_activity uuid default null,
  p_hide_likes boolean default false, p_comments_off boolean default false, p_repost_of uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); o posts; a activities; pid uuid; t text := trim(coalesce(p_title, ''));
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
  if p_activity is not null then
    if not leads_activity(p_activity) then raise exception 'Бастама атынан жетекші немесе жауапты оқушы жазады'; end if;
    select * into a from activities where id = p_activity;
  elsif p_kind = 'announcement' and u.role = 'student' then raise exception 'Хабарландыруды мұғалім жариялайды';
  elsif p_kind <> 'announcement' and u.role = 'student' and not u.parliament then raise exception 'Жаңалықты мұғалім немесе парламент мүшесі жариялайды';
  end if;
  if p_photo is not null and p_photo not like u.id::text || '/%' then raise exception 'Фото қате'; end if;
  insert into posts(school_id, author_id, kind, title, body, photo, activity_id, hide_likes, comments_off, repost_of)
    values (u.school_id, u.id, p_kind, t, coalesce(trim(p_body), ''), p_photo, p_activity, p_hide_likes, p_comments_off, o.id)
    returning id into pid;
  if a.id is not null and o.id is null then
    perform notify(e.student_id, a.title || ': жаңа жазба', t, '/a/' || a.id)
      from enrollments e where e.activity_id = a.id and not e.waitlisted and e.student_id <> u.id;
  end if;
  return pid;
end $$;

create or replace function like_post(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_id and kind in ('news','announcement','project','event') and school_id = my_school() and hidden_at is null) then raise exception 'Жазба табылмады'; end if;
  insert into post_votes(post_id, user_id, value) values (p_id, auth.uid(), case when p_on then 1 else 0 end)
    on conflict (post_id, user_id) do update set value = excluded.value;
end $$;

create or replace function add_comment(p_post uuid, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
declare u profiles := me(); p posts; cid uuid;
begin
  select * into p from posts where id = p_post and school_id = u.school_id and hidden_at is null and kind in ('news','announcement','project','event');
  -- members-only activity posts: only insiders may comment
  if p.id is null or (p.visibility = 'members' and p.activity_id is not null and not activity_insider(p.activity_id)) then raise exception 'Жазба табылмады'; end if;
  if p.comments_off then raise exception 'Пікір жазу өшірілген'; end if;
  insert into post_comments(post_id, author_id, body) values (p_post, u.id, trim(p_body)) returning id into cid;
  if p.author_id <> u.id then perform notify(p.author_id, 'Жаңа пікір', u.full_name || ': ' || left(trim(p_body), 80), '/p/' || p.id); end if;
  return cid;
end $$;

-- own photo too (the avatars upload policy uses this check)
create or replace function can_edit_photo(p_student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_student = auth.uid() or is_deputy() or exists (select 1 from profiles p join classes k on k.id = p.class_id
    where p.id = p_student and p.school_id = my_school() and auth.uid() in (k.teacher_id, k.tutor_id))
$$;

create or replace function set_student_photo(p_student uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_photo(p_student) then raise exception 'Суретті өзі, сынып жетекшісі немесе тәрбиеші қояды'; end if;
  if p_path is not null and p_path not like p_student::text || '/%' then raise exception 'Сурет қате'; end if;
  update profiles set photo = p_path where id = p_student;
end $$;

-- a student's details: the class teacher, the tutor or a deputy (not the student)
create function update_student(p_student uuid, p_full_name text, p_olympiad text, p_club text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles p where p.id = p_student and p.role = 'student' and p.school_id = my_school()
      and (is_deputy() or exists (select 1 from classes k where k.id = p.class_id and auth.uid() in (k.teacher_id, k.tutor_id)))) then
    raise exception 'Оқушы мәліметін сынып жетекшісі немесе тәрбиеші өзгертеді'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'Аты-жөнін жазыңыз'; end if;
  update profiles set full_name = trim(p_full_name), olympiad = nullif(trim(p_olympiad), ''), club = nullif(trim(p_club), '') where id = p_student;
end $$;
revoke execute on function update_student from public, anon;
grant execute on function update_student to authenticated;
