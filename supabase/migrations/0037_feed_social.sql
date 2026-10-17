-- 0037: the school feed becomes social. News and announcements are written in the teacher's own name or in the name
-- of an activity they lead; everyone can like and comment; writers can repost. The author can hide the like count
-- or turn comments off. Likes reuse post_votes (value 0 = withdrawn, so no deletes are needed).
alter table posts add column hide_likes boolean not null default false,
  add column comments_off boolean not null default false,
  add column repost_of uuid references posts(id) on delete cascade;

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);
create index post_comments_post on post_comments(post_id, created_at);
alter table post_comments enable row level security;
-- the posts policies apply inside the subquery, so a comment is visible exactly when its post is
create policy pcomment_read on post_comments for select to authenticated
  using (hidden_at is null and exists (select 1 from posts p where p.id = post_id));

-- supervisor, a responsible student, or a deputy may write in an activity's name
create function leads_activity(p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from activities a where a.id = p_activity and a.school_id = my_school() and a.status = 'approved'
    and (auth.uid() in (a.supervisor_id, a.curator_id) or exists (select 1 from activity_curators c where c.activity_id = a.id and c.student_id = auth.uid())))
$$;

create function create_feed_post(p_kind text, p_title text, p_body text, p_photo text default null, p_activity uuid default null,
  p_hide_likes boolean default false, p_comments_off boolean default false, p_repost_of uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); o posts; a activities; pid uuid; t text := trim(coalesce(p_title, ''));
begin
  if u.id is null then raise exception 'Кіріңіз'; end if;
  if p_kind not in ('news','announcement') then raise exception 'Жазба түрі қате'; end if;
  if p_repost_of is not null then
    select * into o from posts where id = p_repost_of and school_id = u.school_id and hidden_at is null
      and kind in ('news','announcement') and visibility = 'public';
    if o.id is null then raise exception 'Жазба табылмады'; end if;
    if o.repost_of is not null then select * into o from posts where id = o.repost_of; end if;   -- repost the original, not a repost
    p_kind := o.kind; t := o.title; p_photo := null;
  end if;
  if p_activity is not null then
    if not leads_activity(p_activity) then raise exception 'Іс-шара атынан жетекші немесе жауапты оқушы жазады'; end if;
    select * into a from activities where id = p_activity;
  elsif p_kind = 'announcement' and u.role = 'student' then raise exception 'Хабарландыруды мұғалім жариялайды';
  elsif p_kind = 'news' and u.role = 'student' and not u.parliament then raise exception 'Жаңалықты мұғалім немесе парламент мүшесі жариялайды';
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

create function like_post(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_id and kind in ('news','announcement') and school_id = my_school() and hidden_at is null) then raise exception 'Жазба табылмады'; end if;
  insert into post_votes(post_id, user_id, value) values (p_id, auth.uid(), case when p_on then 1 else 0 end)
    on conflict (post_id, user_id) do update set value = excluded.value;
end $$;

create function add_comment(p_post uuid, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
declare u profiles := me(); p posts; cid uuid;
begin
  select * into p from posts where id = p_post and school_id = u.school_id and hidden_at is null and kind in ('news','announcement');
  -- members-only activity posts: only insiders may comment
  if p.id is null or (p.visibility = 'members' and p.activity_id is not null and not activity_insider(p.activity_id)) then raise exception 'Жазба табылмады'; end if;
  if p.comments_off then raise exception 'Пікір жазу өшірілген'; end if;
  insert into post_comments(post_id, author_id, body) values (p_post, u.id, trim(p_body)) returning id into cid;
  if p.author_id <> u.id then perform notify(p.author_id, 'Жаңа пікір', u.full_name || ': ' || left(trim(p_body), 80), '/p/' || p.id); end if;
  return cid;
end $$;

-- the comment's author, the post's author, or a deputy
create function hide_comment(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update post_comments c set hidden_at = now() from posts p
    where c.id = p_id and p.id = c.post_id and p.school_id = my_school() and (c.author_id = auth.uid() or p.author_id = auth.uid() or is_deputy());
  if not found then raise exception 'Құқығыңыз жоқ'; end if;
end $$;

create function set_post_options(p_id uuid, p_hide_likes boolean, p_comments_off boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  update posts set hide_likes = p_hide_likes, comments_off = p_comments_off
    where id = p_id and school_id = my_school() and (author_id = auth.uid() or is_deputy());
  if not found then raise exception 'Құқығыңыз жоқ'; end if;
end $$;

revoke execute on function leads_activity, create_feed_post, like_post, add_comment, hide_comment, set_post_options from public, anon;
grant execute on function leads_activity, create_feed_post, like_post, add_comment, hide_comment, set_post_options to authenticated;
