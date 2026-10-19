-- 0045: an admin removes a student; chats can be muted and archived.
-- Applied without the two `delete` lines of remove_student (the MCP tool refuses deletes); the owner runs
-- this file's remove_student as `create or replace` in the Supabase SQL Editor to add them.

/* ---------- removing a student ---------- */
-- The profile stays (marks, messages and history still name the student) but is hidden from lists,
-- the account is banned, the student leaves the class, initiatives and the Telegram link.
alter table profiles add column removed_at timestamptz;

create function remove_student(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'Оқушыны тек әкімші өшіреді'; end if;
  update profiles set removed_at = now(), class_id = null, parliament = false
    where id = p_id and role = 'student' and school_id = my_school() and removed_at is null;
  if not found then raise exception 'Оқушы табылмады'; end if;
  update auth.users set banned_until = 'infinity' where id = p_id;
  delete from enrollments where student_id = p_id;
  delete from telegram_links where user_id = p_id;
end $$;

/* ---------- chat flags: mute and archive, per person ---------- */
alter table chat_state add column muted boolean not null default false,
  add column archived boolean not null default false;

-- null keeps a flag as it is; a new row starts unread (muting is not reading)
create function set_chat_flags(p_chat uuid, p_muted boolean, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_see_chat(p_chat) then raise exception 'Чат табылмады'; end if;
  insert into chat_state(chat_id, user_id, last_read_at, muted, archived)
    values (p_chat, auth.uid(), '-infinity', coalesce(p_muted, false), coalesce(p_archived, false))
    on conflict (chat_id, user_id) do update
      set muted = coalesce(p_muted, chat_state.muted), archived = coalesce(p_archived, chat_state.archived);
end $$;

revoke execute on function remove_student, set_chat_flags from public, anon;
grant execute on function remove_student, set_chat_flags to authenticated;
notify pgrst, 'reload schema';
