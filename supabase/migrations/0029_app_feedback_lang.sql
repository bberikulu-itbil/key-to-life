-- 0029: suggestions to develop the app (sent to the app's admins), and each person's interface language.
create table app_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 5 and 2000),
  created_at timestamptz not null default now()
);
alter table app_feedback enable row level security;
-- the author sees their own; admins (the people who develop the app) see all
create policy af_read on app_feedback for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create function send_app_feedback(p_body text) returns void language plpgsql security definer set search_path = public as $$
declare u profiles := me();
begin
  if u.id is null then raise exception 'Кіріңіз'; end if;
  if length(trim(coalesce(p_body, ''))) < 5 then raise exception 'Ұсынысыңызды толығырақ жазыңыз'; end if;
  insert into app_feedback(user_id, body) values (u.id, trim(p_body));
  -- shortcut: every admin of every school gets it (today the admin is the app's developer); add a developer flag when schools get their own admins
  perform notify(a.id, 'Қосымшаға ұсыныс', u.full_name || ': ' || left(trim(p_body), 300), '/feedback') from profiles a where a.role = 'admin' and a.id <> u.id;
end $$;

alter table profiles add column lang text check (lang in ('kk','en','tr','ru'));
create function set_my_lang(p_lang text) returns void language sql security definer set search_path = public as
$$ update profiles set lang = p_lang where id = auth.uid() $$;

revoke execute on function send_app_feedback, set_my_lang from public, anon;
grant execute on function send_app_feedback, set_my_lang to authenticated;
