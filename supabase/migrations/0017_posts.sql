-- 0017: feed posts — news, announcements, lost & found, proposals to the student parliament.
alter table profiles add column parliament boolean not null default false;

create table posts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  author_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('news','announcement','lost','found','proposal')),
  title text not null check (length(title) between 3 and 140),
  body text not null default '' check (length(body) <= 5000),
  photo text check (photo is null or length(photo) <= 200),
  place text check (place is null or length(place) <= 120),
  status text not null default 'open' check (status in ('open','resolved','considering','accepted','rejected')),
  answer text check (answer is null or length(answer) <= 2000),
  answered_by uuid references profiles(id),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);
create index posts_feed on posts(school_id, kind, created_at desc);

create table post_votes (
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  value int not null default 1 check (value in (0, 1)),      -- 0 = vote withdrawn (no deletes in RPCs)
  primary key (post_id, user_id)
);

create function can_answer_proposals() returns boolean language sql stable security definer set search_path = public as
$$ select is_deputy() or coalesce((select parliament from profiles where id = auth.uid()), false) $$;

alter table posts enable row level security;
alter table post_votes enable row level security;
create policy post_read on posts for select to authenticated using (school_id = my_school() and hidden_at is null);
create policy pvote_read on post_votes for select to authenticated using (exists (select 1 from posts p where p.id = post_id));

create function create_post(p_kind text, p_title text, p_body text, p_photo text default null, p_place text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); pid uuid;
begin
  if u.id is null then raise exception 'Кіріңіз'; end if;
  if p_kind = 'announcement' and u.role = 'student' then raise exception 'Хабарландыруды мұғалім жариялайды'; end if;
  if p_kind = 'news' and u.role = 'student' and not u.parliament then raise exception 'Жаңалықты мұғалім немесе парламент мүшесі жариялайды'; end if;
  if p_photo is not null and p_photo not like u.id::text || '/%' then raise exception 'Фото қате'; end if;
  insert into posts(school_id, author_id, kind, title, body, photo, place)
    values (u.school_id, u.id, p_kind, trim(p_title), coalesce(trim(p_body), ''), p_photo, nullif(trim(p_place), '')) returning id into pid;
  if p_kind = 'proposal' then
    perform notify(d.id, 'Парламентке жаңа ұсыныс', trim(p_title), '/?t=parliament')
      from profiles d where d.school_id = u.school_id and d.id <> u.id and (d.role in ('deputy','admin') or d.parliament);
  end if;
  return pid;
end $$;

create function set_post_status(p_id uuid, p_status text, p_answer text default null) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); p posts;
begin
  select * into p from posts where id = p_id and school_id = u.school_id and hidden_at is null;
  if p.id is null then raise exception 'Жазба табылмады'; end if;
  if p.kind in ('lost','found') then
    if p_status not in ('open','resolved') or not (p.author_id = u.id or u.role <> 'student') then raise exception 'Құқығыңыз жоқ'; end if;
    update posts set status = p_status where id = p_id;
  elsif p.kind = 'proposal' then
    if p_status not in ('open','considering','accepted','rejected') or not can_answer_proposals() then raise exception 'Ұсынысқа парламент немесе орынбасар жауап береді'; end if;
    update posts set status = p_status, answer = nullif(trim(p_answer), ''), answered_by = u.id where id = p_id;
    perform notify(p.author_id, 'Ұсынысыңызға жауап: ' || case p_status when 'accepted' then 'қабылданды' when 'rejected' then 'қабылданбады' when 'considering' then 'қаралуда' else 'жаңа' end,
      p.title, '/?t=parliament');
  else raise exception 'Бұл жазбаның күйі жоқ';
  end if;
end $$;

create function vote_post(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_id and kind = 'proposal' and school_id = my_school() and hidden_at is null) then raise exception 'Ұсыныс табылмады'; end if;
  insert into post_votes(post_id, user_id, value) values (p_id, auth.uid(), case when p_on then 1 else 0 end)
    on conflict (post_id, user_id) do update set value = excluded.value;
end $$;

create function pin_post(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Құқығыңыз жоқ'; end if;
  update posts set pinned = p_on where id = p_id and school_id = my_school();
end $$;

create function hide_post(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare p posts;
begin
  select * into p from posts where id = p_id and school_id = my_school();
  if p.id is null or not (p.author_id = auth.uid() or is_deputy() or (p.kind in ('lost','found') and is_staff())) then raise exception 'Құқығыңыз жоқ'; end if;
  update posts set hidden_at = now() where id = p_id;
end $$;

create function set_parliament(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() then raise exception 'Парламент құрамын орынбасар белгілейді'; end if;
  update profiles set parliament = p_on where id = p_user and school_id = my_school() and role = 'student';
end $$;

revoke execute on function can_answer_proposals, create_post, set_post_status, vote_post, pin_post, hide_post, set_parliament from public, anon;
grant execute on function can_answer_proposals, create_post, set_post_status, vote_post, pin_post, hide_post, set_parliament to authenticated;

-- photos: public bucket, each user writes only under their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('posts', 'posts', true, 2097152, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy posts_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);
