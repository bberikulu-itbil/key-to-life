-- 0020: each activity's leader picks its modules (chat, syllabus, schedule, tasks, attendance); tasks can go to one student.
alter table activities add column features text[] not null default '{chat,syllabus,schedule,tasks,attendance}'
  check (features <@ array['chat','syllabus','schedule','tasks','attendance']);

create function set_activity_features(p_id uuid, p_features text[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from activities where id = p_id and school_id = my_school() and (supervisor_id = auth.uid() or is_deputy())) then
    raise exception 'Баптауды жетекші немесе орынбасар өзгертеді'; end if;
  update activities set features = (select coalesce(array_agg(distinct f), '{}') from unnest(p_features) f) where id = p_id;
end $$;

-- the activity chat exists only while its leader keeps the chat module on
create or replace function chat_audience(p_chat uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from chats c join chat_members m on m.chat_id = c.id where c.id = p_chat and c.kind = 'direct'
  union select p.id from chats c join profiles p on p.class_id = c.class_id where c.id = p_chat and (c.kind = 'class' or c.audience = 'class')
  union select x.u from chats c join classes k on k.id = c.class_id cross join lateral unnest(array[k.teacher_id, k.tutor_id]) x(u)
    where c.id = p_chat and (c.kind = 'class' or c.audience = 'class') and x.u is not null
  union select x.u from chats c join activities a on a.id = c.activity_id cross join lateral unnest(array[a.supervisor_id, a.author_id, a.curator_id]) x(u)
    where c.id = p_chat and x.u is not null and 'chat' = any(a.features)
  union select e.student_id from chats c join activities a on a.id = c.activity_id join enrollments e on e.activity_id = a.id
    where c.id = p_chat and not e.waitlisted and 'chat' = any(a.features)
  union select p.id from chats c join profiles p on p.school_id = c.school_id where c.id = p_chat and c.kind = 'channel'
    and (c.audience = 'all' or (c.audience = 'staff' and p.role <> 'student') or (c.audience = 'students' and p.role = 'student'))
  union select c.created_by from chats c where c.id = p_chat and c.kind = 'channel' and c.created_by is not null
$$;

-- personal tasks: assignee_id set → only that student (and the author) sees it
alter table tasks add column assignee_id uuid references profiles(id) on delete cascade;
create index tasks_assignee on tasks(assignee_id);

create or replace function task_visible(p_task uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t where t.id = p_task and t.school_id = my_school() and (
    t.author_id = auth.uid() or t.assignee_id = auth.uid()
    or (t.assignee_id is null and t.class_id is not null and exists (select 1 from profiles p where p.id = auth.uid() and p.class_id = t.class_id))
    or (t.assignee_id is null and t.activity_id is not null and exists (select 1 from enrollments e where e.activity_id = t.activity_id and e.student_id = auth.uid() and not e.waitlisted))))
$$;

-- who may give one student a task: a deputy, the student's class teacher or tutor, or the leader/curator of an activity the student attends
create function can_assign_person(p_user uuid, p_activity uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_user is null or is_deputy()
    or exists (select 1 from profiles p join classes k on k.id = p.class_id where p.id = p_user and auth.uid() in (k.teacher_id, k.tutor_id))
    or exists (select 1 from activities a join enrollments e on e.activity_id = a.id and e.student_id = p_user and not e.waitlisted
               where a.id = p_activity and auth.uid() in (a.supervisor_id, a.curator_id))
$$;

-- restrictive: ANDed with task_own, so a personal task also needs the right to address that student
create policy task_person on tasks as restrictive for all to authenticated using (true) with check (can_assign_person(assignee_id, activity_id));

create or replace function tasks_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null then
    if new.assignee_id <> new.author_id then perform notify(new.assignee_id, 'Сізге жеке тапсырма', new.title, '/plan'); end if;
  elsif new.class_id is not null or new.activity_id is not null then
    perform notify(x.uid, 'Жаңа тапсырма', new.title, '/plan') from (
      select p.id as uid from profiles p where p.class_id = new.class_id and p.role = 'student'
      union select e.student_id from enrollments e where e.activity_id = new.activity_id and not e.waitlisted) x
    where x.uid <> new.author_id;
  end if;
  return new;
end $$;

revoke execute on function set_activity_features, can_assign_person from public, anon;
grant execute on function set_activity_features, can_assign_person to authenticated;
revoke execute on function chat_audience, tasks_notify from authenticated;
