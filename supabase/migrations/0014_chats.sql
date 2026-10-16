-- 0014: chats — activity groups, class chats, announcement channels, direct messages.
-- Membership of activity/class/channel chats is derived (chat_audience), so nothing has to be kept in sync.
create type chat_kind as enum ('activity','class','channel','direct');

create table chats (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  kind chat_kind not null,
  title text check (title is null or length(title) between 2 and 80),
  activity_id uuid unique references activities(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  audience text check (audience in ('all','staff','students','class')),
  direct_key text unique,
  locked boolean not null default false,            -- only staff may post
  pinned_id bigint,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check ((kind = 'activity') = (activity_id is not null)),
  check ((kind = 'direct') = (direct_key is not null)),
  check (kind <> 'channel' or audience is not null),
  check (kind <> 'class' or class_id is not null),
  check (audience is distinct from 'class' or class_id is not null)
);
create unique index chats_one_class on chats(class_id) where kind = 'class';
create unique index chats_one_school_channel on chats(school_id) where kind = 'channel' and created_by is null;

create table chat_members (            -- direct chats only
  chat_id uuid references chats(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (chat_id, user_id)
);

create table chat_state (
  chat_id uuid references chats(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table messages (
  id bigserial primary key,
  chat_id uuid not null references chats(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null check (length(body) between 1 and 4000),
  poll jsonb,                                      -- {"options": ["Иә", "Жоқ"]}
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index messages_chat on messages(chat_id, id desc);
alter table chats add constraint chats_pinned_fk foreign key (pinned_id) references messages(id) on delete set null;

create table message_reads (
  message_id bigint references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table poll_votes (
  message_id bigint references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  option int not null check (option between 0 and 9),
  primary key (message_id, user_id)
);

create table chat_reports (
  id bigserial primary key,
  school_id uuid not null references schools(id),
  message_id bigint references messages(id) on delete set null,
  reporter_id uuid not null references profiles(id),
  author_id uuid not null references profiles(id),
  body text not null,
  reason text not null check (length(reason) between 2 and 300),
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  removed boolean not null default false
);

-- ---------- helpers ----------
-- shortcut: audience is computed on every check; fine for one school, add a members cache past ~5k users.
create function chat_audience(p_chat uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from chats c join chat_members m on m.chat_id = c.id where c.id = p_chat and c.kind = 'direct'
  union select p.id from chats c join profiles p on p.class_id = c.class_id where c.id = p_chat and (c.kind = 'class' or c.audience = 'class')
  union select k.teacher_id from chats c join classes k on k.id = c.class_id where c.id = p_chat and (c.kind = 'class' or c.audience = 'class') and k.teacher_id is not null
  union select x.u from chats c join activities a on a.id = c.activity_id cross join lateral unnest(array[a.supervisor_id, a.author_id, a.curator_id]) x(u) where c.id = p_chat and x.u is not null
  union select e.student_id from chats c join enrollments e on e.activity_id = c.activity_id where c.id = p_chat and not e.waitlisted
  union select p.id from chats c join profiles p on p.school_id = c.school_id where c.id = p_chat and c.kind = 'channel'
    and (c.audience = 'all' or (c.audience = 'staff' and p.role <> 'student') or (c.audience = 'students' and p.role = 'student'))
  union select c.created_by from chats c where c.id = p_chat and c.kind = 'channel' and c.created_by is not null
$$;

create function in_chat(p_chat uuid) returns boolean language sql stable security definer set search_path = public as
$$ select auth.uid() in (select chat_audience(p_chat)) $$;

-- class teacher of a class chat, supervisor of an activity chat, channel creator, any deputy (never DMs)
create function can_moderate(p_chat uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats c where c.id = p_chat and c.school_id = my_school() and c.kind <> 'direct' and (
    is_deputy() or c.created_by = auth.uid()
    or exists (select 1 from classes k where k.id = c.class_id and k.teacher_id = auth.uid())
    or exists (select 1 from activities a where a.id = c.activity_id and a.supervisor_id = auth.uid())))
$$;

create function can_see_chat(p_chat uuid) returns boolean language sql stable security definer set search_path = public as
$$ select in_chat(p_chat) or can_moderate(p_chat) $$;

-- ---------- RLS ----------
alter table chats enable row level security;
alter table chat_members enable row level security;
alter table chat_state enable row level security;
alter table messages enable row level security;
alter table message_reads enable row level security;
alter table poll_votes enable row level security;
alter table chat_reports enable row level security;

create policy chat_read on chats for select to authenticated using (can_see_chat(id));
create policy cm_read on chat_members for select to authenticated using (exists (select 1 from chats c where c.id = chat_id));
create policy cs_own on chat_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy msg_read on messages for select to authenticated using (can_see_chat(chat_id));
create policy mr_read on message_reads for select to authenticated using (user_id = auth.uid()
  or exists (select 1 from messages m where m.id = message_id and (m.author_id = auth.uid() or can_moderate(m.chat_id))));
create policy pv_read on poll_votes for select to authenticated using (exists (select 1 from messages m where m.id = message_id));
create policy rep_read on chat_reports for select to authenticated using (school_id = my_school() and (is_deputy()
  or exists (select 1 from profiles p join classes k on k.id = p.class_id where p.id = author_id and k.teacher_id = auth.uid())));

-- ---------- RPC ----------
create function ensure_chats() returns void language plpgsql security definer set search_path = public as $$
declare u profiles := me();
begin
  if u.id is null then return; end if;
  insert into chats(school_id, kind, class_id, created_by)
    select k.school_id, 'class', k.id, k.teacher_id from classes k where k.school_id = u.school_id
  on conflict do nothing;
  insert into chats(school_id, kind, activity_id, created_by)
    select a.school_id, 'activity', a.id, a.supervisor_id from activities a where a.school_id = u.school_id and a.status = 'approved'
  on conflict do nothing;
  insert into chats(school_id, kind, title, audience, locked)
    values (u.school_id, 'channel', 'Мектеп хабарландырулары', 'all', true)
  on conflict do nothing;
end $$;

create function my_chats() returns table(id uuid, kind chat_kind, title text, locked boolean, last_body text, last_at timestamptz, last_author text, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind,
    coalesce(c.title, a.title, k.name || ' сыныбы',
      (select p.full_name from chat_members m join profiles p on p.id = m.user_id where m.chat_id = c.id and m.user_id <> auth.uid() limit 1)),
    c.locked, lm.body, coalesce(lm.created_at, c.created_at), lp.full_name,
    (select count(*)::int from messages x where x.chat_id = c.id and x.author_id <> auth.uid() and x.removed_at is null
       and x.created_at > coalesce((select s.last_read_at from chat_state s where s.chat_id = c.id and s.user_id = auth.uid()), '-infinity'))
  from chats c
  left join activities a on a.id = c.activity_id
  left join classes k on k.id = c.class_id and c.kind = 'class'
  left join lateral (select m.body, m.created_at, m.author_id from messages m where m.chat_id = c.id and m.removed_at is null order by m.id desc limit 1) lm on true
  left join profiles lp on lp.id = lm.author_id
  where c.school_id = my_school() and in_chat(c.id) and (c.kind <> 'activity' or a.status = 'approved')
  order by coalesce(lm.created_at, c.created_at) desc
$$;

create function chat_info(p_chat uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'kind', c.kind, 'locked', c.locked, 'pinned_id', c.pinned_id,
    'activity_id', c.activity_id, 'audience', c.audience,
    'title', coalesce(c.title, a.title, k.name || ' сыныбы',
      (select p.full_name from chat_members m join profiles p on p.id = m.user_id where m.chat_id = c.id and m.user_id <> auth.uid() limit 1)),
    'moderator', can_moderate(c.id),
    'can_post', case when c.kind = 'channel' then can_moderate(c.id) else not c.locked or is_staff() end,
    'members', (select count(*) from chat_audience(c.id)))
  from chats c left join activities a on a.id = c.activity_id left join classes k on k.id = c.class_id and c.kind = 'class'
  where c.id = p_chat and can_see_chat(c.id)
$$;

create function chat_people(p_chat uuid) returns table(id uuid, full_name text, role user_role, class_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role, k.name from chat_audience(p_chat) a(uid) join profiles p on p.id = a.uid left join classes k on k.id = p.class_id
  where can_see_chat(p_chat) order by p.role <> 'student', p.full_name
$$;

create function send_message(p_chat uuid, p_body text, p_poll jsonb default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); c chats; v bigint; h int;
begin
  select * into c from chats where id = p_chat;
  if c.id is null or not can_see_chat(p_chat) then raise exception 'Бұл чатқа жаза алмайсыз'; end if;
  if c.kind = 'channel' and not can_moderate(p_chat) then raise exception 'Бұл арнаға тек оның иесі мен орынбасарлар жазады'; end if;
  if c.locked and u.role = 'student' then raise exception 'Бұл чатта қазір тек мұғалімдер жазады'; end if;
  if u.role = 'student' then
    h := extract(hour from now() at time zone (select tz from schools where id = u.school_id));
    if h >= 22 or h < 7 then raise exception 'Тыныш уақыт: 22:00–07:00 аралығында оқушылар хат жібере алмайды'; end if;
  end if;
  if p_poll is not null then
    if u.role = 'student' then raise exception 'Сауалнаманы тек мұғалім жасайды'; end if;
    if coalesce(jsonb_typeof(p_poll->'options'), '') <> 'array' or jsonb_array_length(p_poll->'options') not between 2 and 10 then
      raise exception 'Сауалнамаға 2–10 жауап нұсқасы керек'; end if;
  end if;
  insert into messages(chat_id, author_id, body, poll) values (p_chat, u.id, trim(p_body), p_poll) returning id into v;
  insert into chat_state(chat_id, user_id) values (p_chat, u.id) on conflict (chat_id, user_id) do update set last_read_at = now();
  return v;
end $$;

create function read_chat(p_chat uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_see_chat(p_chat) then return; end if;
  insert into chat_state(chat_id, user_id) values (p_chat, auth.uid()) on conflict (chat_id, user_id) do update set last_read_at = now();
  if (select kind from chats where id = p_chat) = 'channel' and in_chat(p_chat) then
    insert into message_reads(message_id, user_id)
      select m.id, auth.uid() from messages m where m.chat_id = p_chat and m.author_id <> auth.uid() on conflict do nothing;
  end if;
end $$;

create function message_readers(p_msg bigint) returns table(full_name text, class_name text, read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_msg;
  if m.id is null or not (m.author_id = auth.uid() or can_moderate(m.chat_id)) then raise exception 'Құқығыңыз жоқ'; end if;
  return query select p.full_name, k.name, r.read_at from chat_audience(m.chat_id) a(uid) join profiles p on p.id = a.uid
    left join classes k on k.id = p.class_id left join message_reads r on r.message_id = p_msg and r.user_id = a.uid
    where a.uid <> m.author_id order by r.read_at nulls first, p.full_name;
end $$;

create function open_direct(p_user uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare u profiles := me(); o profiles; k text; cid uuid;
begin
  select * into o from profiles where id = p_user;
  if o.id is null or o.school_id <> u.school_id or o.id = u.id then raise exception 'Пайдаланушы табылмады'; end if;
  k := least(u.id::text, o.id::text) || ':' || greatest(u.id::text, o.id::text);
  select id into cid from chats where direct_key = k;
  if cid is null then
    insert into chats(school_id, kind, direct_key, created_by) values (u.school_id, 'direct', k, u.id)
      on conflict (direct_key) do nothing returning id into cid;
    if cid is null then select id into cid from chats where direct_key = k;
    else insert into chat_members values (cid, u.id), (cid, o.id); end if;
  end if;
  return cid;
end $$;

create function create_channel(p_title text, p_audience text, p_class uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); cid uuid;
begin
  if u.role = 'student' then raise exception 'Арнаны тек мұғалім ашады'; end if;
  if p_audience = 'class' then
    if p_class is null or not (is_deputy() or exists (select 1 from classes k where k.id = p_class and k.teacher_id = u.id)) then
      raise exception 'Сынып арнасын сол сыныптың жетекшісі немесе орынбасар ашады'; end if;
  elsif not is_deputy() then raise exception 'Бүкіл мектепке арнаны орынбасар ашады';
  end if;
  insert into chats(school_id, kind, title, audience, class_id, locked, created_by)
    values (u.school_id, 'channel', trim(p_title), p_audience, case when p_audience = 'class' then p_class end, true, u.id) returning id into cid;
  return cid;
end $$;

create function set_chat_locked(p_chat uuid, p_locked boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_moderate(p_chat) then raise exception 'Құқығыңыз жоқ'; end if;
  update chats set locked = p_locked where id = p_chat and kind <> 'channel';
end $$;

create function pin_message(p_chat uuid, p_msg bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_moderate(p_chat) then raise exception 'Құқығыңыз жоқ'; end if;
  if p_msg is not null and not exists (select 1 from messages where id = p_msg and chat_id = p_chat) then raise exception 'Хабар табылмады'; end if;
  update chats set pinned_id = p_msg where id = p_chat;
end $$;

create function remove_message(p_msg bigint) returns void language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_msg;
  if m.id is null or not (m.author_id = auth.uid() or can_moderate(m.chat_id)) then raise exception 'Құқығыңыз жоқ'; end if;
  update messages set body = 'Хабар өшірілді', poll = null, removed_at = now() where id = p_msg;
  update chats set pinned_id = null where pinned_id = p_msg;
end $$;

create function vote_poll(p_msg bigint, p_option int) returns void language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_msg;
  if m.id is null or m.poll is null or m.removed_at is not null or not in_chat(m.chat_id) then raise exception 'Сауалнама табылмады'; end if;
  if p_option < 0 or p_option >= jsonb_array_length(m.poll->'options') then raise exception 'Жауап нұсқасы қате'; end if;
  insert into poll_votes values (p_msg, auth.uid(), p_option) on conflict (message_id, user_id) do update set option = excluded.option;
end $$;

create function report_message(p_msg bigint, p_reason text) returns void language plpgsql security definer set search_path = public as $$
declare u profiles := me(); m messages;
begin
  select * into m from messages where id = p_msg;
  if m.id is null or not can_see_chat(m.chat_id) or m.removed_at is not null then raise exception 'Хабар табылмады'; end if;
  insert into chat_reports(school_id, message_id, reporter_id, author_id, body, reason) values (u.school_id, p_msg, u.id, m.author_id, m.body, trim(p_reason));
  perform notify(d.id, 'Чаттағы хабарға шағым', left(m.body, 120), '/chats/reports') from profiles d where d.school_id = u.school_id and d.role in ('deputy','admin');
  perform notify(k.teacher_id, 'Оқушыңыздың хабарына шағым', left(m.body, 120), '/chats/reports')
    from profiles p join classes k on k.id = p.class_id where p.id = m.author_id and k.teacher_id is not null;
end $$;

create function resolve_report(p_id bigint, p_remove boolean) returns void language plpgsql security definer set search_path = public as $$
declare r chat_reports;
begin
  select * into r from chat_reports where id = p_id;
  if r.id is null or r.school_id <> my_school() or not (is_deputy()
     or exists (select 1 from profiles p join classes k on k.id = p.class_id where p.id = r.author_id and k.teacher_id = auth.uid())) then
    raise exception 'Құқығыңыз жоқ'; end if;
  if p_remove and r.message_id is not null then
    update messages set body = 'Хабар өшірілді', poll = null, removed_at = now() where id = r.message_id;
  end if;
  update chat_reports set resolved_by = auth.uid(), resolved_at = now(), removed = p_remove where id = p_id;
end $$;

alter publication supabase_realtime add table messages;

revoke execute on function chat_audience, in_chat, can_moderate, can_see_chat, ensure_chats, my_chats, chat_info, chat_people,
  send_message, read_chat, message_readers, open_direct, create_channel, set_chat_locked, pin_message, remove_message,
  vote_poll, report_message, resolve_report from public, anon;
grant execute on function chat_audience, in_chat, can_moderate, can_see_chat, ensure_chats, my_chats, chat_info, chat_people,
  send_message, read_chat, message_readers, open_direct, create_channel, set_chat_locked, pin_message, remove_message,
  vote_poll, report_message, resolve_report to authenticated;
