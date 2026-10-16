-- 0019: class tutor (тәрбиеші), student olympiad/club labels, timetable teachers known by name until they get an account.
alter table classes add column tutor_id uuid references profiles(id) on delete set null;
alter table profiles add column olympiad text check (olympiad is null or length(olympiad) <= 60),
  add column club text check (club is null or length(club) <= 120);
alter table timetable add column teacher_name text check (teacher_name is null or length(teacher_name) <= 120);

create function name_words(t text) returns text[] language sql immutable set search_path = public as
$$ select regexp_split_to_array(lower(trim(t)), '\s+') $$;

-- a new staff account claims the timetable rows written under its name («Қуаныш Бектұрғанов» ⊂ «Бектұрғанов Қуаныш Ержанұлы»)
create function match_teacher_name() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> 'student' then
    update timetable t set teacher_id = new.id from classes k
    where k.id = t.class_id and k.school_id = new.school_id and t.teacher_id is null and t.teacher_name is not null
      and name_words(new.full_name) @> name_words(t.teacher_name);
  end if;
  return new;
end $$;
create trigger profiles_match_teacher after insert or update of full_name, role on profiles for each row execute function match_teacher_name();

create function set_tutor(p_class uuid, p_tutor uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_deputy() or exists (select 1 from classes where id = p_class and teacher_id = auth.uid())) then
    raise exception 'Тәрбиешіні сынып жетекшісі немесе орынбасар белгілейді'; end if;
  if p_tutor is not null and not exists (select 1 from profiles where id = p_tutor and school_id = my_school() and role <> 'student') then
    raise exception 'Мұғалімді таңдаңыз'; end if;
  update classes set tutor_id = p_tutor where id = p_class and school_id = my_school();
end $$;

-- tutor joins the class chat, moderates it and may give the class tasks
create or replace function chat_audience(p_chat uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from chats c join chat_members m on m.chat_id = c.id where c.id = p_chat and c.kind = 'direct'
  union select p.id from chats c join profiles p on p.class_id = c.class_id where c.id = p_chat and (c.kind = 'class' or c.audience = 'class')
  union select x.u from chats c join classes k on k.id = c.class_id cross join lateral unnest(array[k.teacher_id, k.tutor_id]) x(u)
    where c.id = p_chat and (c.kind = 'class' or c.audience = 'class') and x.u is not null
  union select x.u from chats c join activities a on a.id = c.activity_id cross join lateral unnest(array[a.supervisor_id, a.author_id, a.curator_id]) x(u) where c.id = p_chat and x.u is not null
  union select e.student_id from chats c join enrollments e on e.activity_id = c.activity_id where c.id = p_chat and not e.waitlisted
  union select p.id from chats c join profiles p on p.school_id = c.school_id where c.id = p_chat and c.kind = 'channel'
    and (c.audience = 'all' or (c.audience = 'staff' and p.role <> 'student') or (c.audience = 'students' and p.role = 'student'))
  union select c.created_by from chats c where c.id = p_chat and c.kind = 'channel' and c.created_by is not null
$$;

create or replace function can_moderate(p_chat uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chats c where c.id = p_chat and c.school_id = my_school() and c.kind <> 'direct' and (
    is_deputy() or c.created_by = auth.uid()
    or exists (select 1 from classes k where k.id = c.class_id and auth.uid() in (k.teacher_id, k.tutor_id))
    or exists (select 1 from activities a where a.id = c.activity_id and a.supervisor_id = auth.uid())))
$$;

create or replace function can_assign(p_class uuid, p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_class is null and p_activity is null then true
    when p_class is not null then is_deputy()
      or exists (select 1 from classes k where k.id = p_class and auth.uid() in (k.teacher_id, k.tutor_id))
      or exists (select 1 from timetable t where t.class_id = p_class and t.teacher_id = auth.uid())
    else is_deputy() or exists (select 1 from activities a where a.id = p_activity and auth.uid() in (a.supervisor_id, a.curator_id)) end
$$;

revoke execute on function name_words, match_teacher_name, set_tutor from public, anon;
revoke execute on function match_teacher_name, chat_audience from authenticated;
grant execute on function set_tutor to authenticated;
