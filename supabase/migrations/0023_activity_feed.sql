-- 0023: a feed inside each activity. Posts are public (also shown in the school feed) or for its participants only.
alter table posts add column activity_id uuid references activities(id) on delete cascade,
  add column visibility text not null default 'public' check (visibility in ('public','members'));
create index posts_activity on posts(activity_id, created_at desc);

create function activity_insider(p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_deputy() or exists (select 1 from activities a where a.id = p_activity and a.school_id = my_school()
    and (auth.uid() in (a.supervisor_id, a.author_id, a.curator_id)
      or exists (select 1 from enrollments e where e.activity_id = a.id and e.student_id = auth.uid() and not e.waitlisted)))
$$;

-- restrictive: ANDed with post_read, hides members-only posts from everyone outside the activity
create policy post_members on posts as restrictive for select to authenticated
  using (visibility = 'public' or activity_id is null or activity_insider(activity_id));

create function create_activity_post(p_activity uuid, p_title text, p_body text, p_photo text default null, p_visibility text default 'public') returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities; pid uuid;
begin
  select * into a from activities where id = p_activity and school_id = u.school_id and status = 'approved';
  if a.id is null then raise exception 'Іс-шара табылмады'; end if;
  if not (u.id in (a.supervisor_id, a.curator_id) or is_deputy()) then raise exception 'Лентаға жетекші немесе жауапты оқушы жазады'; end if;
  if p_visibility not in ('public','members') then raise exception 'Көрінуі қате'; end if;
  if p_photo is not null and p_photo not like u.id::text || '/%' then raise exception 'Фото қате'; end if;
  insert into posts(school_id, author_id, kind, title, body, photo, activity_id, visibility)
    values (u.school_id, u.id, 'news', trim(p_title), coalesce(trim(p_body), ''), p_photo, a.id, p_visibility) returning id into pid;
  perform notify(e.student_id, a.title || ': жаңа жазба', trim(p_title), '/a/' || a.id)
    from enrollments e where e.activity_id = a.id and not e.waitlisted and e.student_id <> u.id;
  return pid;
end $$;

revoke execute on function activity_insider, create_activity_post from public, anon;
grant execute on function activity_insider, create_activity_post to authenticated;
