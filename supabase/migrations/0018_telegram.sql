-- 0018: Telegram — account links, every in-app notification mirrored to the bot, leave decisions from the bot.
create extension if not exists pg_net;

create table telegram_links (
  user_id uuid primary key references profiles(id) on delete cascade,
  tg_id bigint unique,                 -- null = unlinked
  tg_username text,
  linked_at timestamptz not null default now()
);
create table telegram_codes (
  code text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create table telegram_pending (        -- bot asked for a rejection reason and waits for the reply
  tg_id bigint primary key,
  leave_id uuid not null references leave_requests(id) on delete cascade,
  message_id bigint,
  created_at timestamptz not null default now()
);
create table app_secrets (name text primary key, value text not null);
insert into app_secrets values ('hook', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')) on conflict do nothing;

alter table telegram_links enable row level security;
alter table telegram_codes enable row level security;
alter table telegram_pending enable row level security;
alter table app_secrets enable row level security;     -- no policies: service role only
create policy tl_own on telegram_links for select to authenticated using (user_id = auth.uid());

create function telegram_link_code() returns text language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  if auth.uid() is null then raise exception 'Кіріңіз'; end if;
  insert into telegram_codes(code, user_id) values (c, auth.uid());
  return c;
end $$;

create function telegram_unlink() returns void language sql security definer set search_path = public as
$$ update telegram_links set tg_id = null, tg_username = null where user_id = auth.uid() $$;

-- the pending leave this notification is about, when the recipient is the one who decides it now
create function leave_for_notice(p_user uuid, p_body text) returns leave_requests language sql stable security definer set search_path = public as $$
  select l.* from leave_requests l join profiles u on u.id = p_user
  where l.school_id = u.school_id and l.status like 'pending%' and p_body like leave_label(l) || '%'
    and ((l.status = 'pending_class_teacher' and l.class_teacher_id = p_user)
      or (l.status = 'pending_teacher' and l.teacher_id = p_user)
      or (l.status = 'pending_deputy' and u.role in ('deputy','admin') and (l.assigned_deputy is null or l.assigned_deputy = p_user)))
  order by l.created_at desc limit 1
$$;

-- service role only: everything the bot needs to send one notification
create function telegram_payload(p_id bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tg_id', t.tg_id, 'title', n.title, 'body', n.body, 'link', n.link,
    'leave', case when l.id is not null then jsonb_build_object('id', l.id, 'status', l.status, 'reason', l.reason,
      'ct_opinion', l.ct_opinion, 'escalated', l.escalated) end)
  from notifications n join telegram_links t on t.user_id = n.user_id and t.tg_id is not null
  left join lateral (select * from leave_for_notice(n.user_id, n.body)) l on l.id is not null
  where n.id = p_id
$$;

-- service role only: decide a leave as the linked Telegram user
create function telegram_decide_leave(p_tg bigint, p_leave uuid, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from telegram_links where tg_id = p_tg;
  if uid is null then raise exception 'Telegram аккаунты байланыспаған'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  return decide_leave(p_leave, p_approve, p_note);
end $$;

create function notifications_to_telegram() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from telegram_links where user_id = new.user_id and tg_id is not null) then
    perform net.http_post(
      url := 'https://tsaqxuutacgbeaaqzivv.supabase.co/functions/v1/telegram',
      body := jsonb_build_object('type', 'notification', 'id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select value from app_secrets where name = 'hook')));
  end if;
  return new;
end $$;
create trigger notifications_to_telegram after insert on notifications for each row execute function notifications_to_telegram();

revoke execute on function telegram_link_code, telegram_unlink, leave_for_notice, telegram_payload, telegram_decide_leave, notifications_to_telegram from public, anon, authenticated;
grant execute on function telegram_link_code, telegram_unlink to authenticated;
grant execute on function telegram_payload, telegram_decide_leave to service_role;
