-- 0044: roadmap for 1.0.0.
--  · goals → plans → daily tasks (a plan is a goal with a parent; tasks link to either), habits with daily ticks
--  · an initiative's profile: photo or icon + colour, Hall of Fame, highlights
--  · syllabus hub: a topic may have a date, tasks may belong to a topic
--  · session types get a category (Camp / Çalışma / КБО-олимпиада) for the overview

/* ---------- goals and plans ---------- */
create table goals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  parent_id uuid references goals(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  due_on date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index goals_owner on goals(owner_id);
alter table goals enable row level security;
-- a plan sits under one's own top-level goal (a function: a policy reading its own table would recurse)
create function own_top_goal(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from goals g where g.id = p_id and g.owner_id = auth.uid() and g.parent_id is null)
$$;
create policy goal_own on goals for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and school_id = my_school() and (parent_id is null or own_top_goal(parent_id)));

alter table tasks add column goal_id uuid references goals(id) on delete set null;
-- only into one's own goal (goals are visible only to their owner, so the subquery sees only those)
create policy task_goal on tasks as restrictive for all to authenticated using (true)
  with check (goal_id is null or exists (select 1 from goals g where g.id = goal_id));

/* ---------- habits ---------- */
create table habits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default my_school() references schools(id),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create table habit_checks (
  habit_id uuid not null references habits(id) on delete cascade,
  on_date date not null,
  primary key (habit_id, on_date)
);
alter table habits enable row level security;
alter table habit_checks enable row level security;
create policy habit_own on habits for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and school_id = my_school());
create policy habit_check_own on habit_checks for all to authenticated
  using (exists (select 1 from habits h where h.id = habit_id))
  with check (exists (select 1 from habits h where h.id = habit_id) and on_date <= current_date + 1);

/* ---------- initiative profile ---------- */
alter table activities add column photo text check (photo is null or length(photo) <= 200),
  add column icon text check (icon is null or length(icon) <= 20),
  add column color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

create function set_activity_look(p_id uuid, p_photo text, p_icon text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_activity(p_id) then raise exception 'Құқығыңыз жоқ'; end if;
  if p_photo is not null and p_photo not like auth.uid()::text || '/%'
    and p_photo is distinct from (select photo from activities where id = p_id) then raise exception 'Фото қате'; end if;
  update activities set photo = p_photo, icon = p_icon, color = p_color where id = p_id;
end $$;

create table activity_awards (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  title text not null check (length(trim(title)) between 2 and 200),   -- олимпиада, кезең, орын
  winners text check (winners is null or length(winners) <= 500),
  created_at timestamptz not null default now()
);
create table activity_highlights (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 30),
  body text check (body is null or length(body) <= 3000),
  link text check (link is null or link ~ '^https?://'),
  photo text check (photo is null or length(photo) <= 200),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index awards_activity on activity_awards(activity_id, year desc);
create index highlights_activity on activity_highlights(activity_id, sort);
alter table activity_awards enable row level security;
alter table activity_highlights enable row level security;
create policy award_read on activity_awards for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
create policy award_write on activity_awards for all to authenticated using (can_manage_activity(activity_id)) with check (can_manage_activity(activity_id));
create policy hl_read on activity_highlights for select to authenticated using (exists (select 1 from activities a where a.id = activity_id));
create policy hl_write on activity_highlights for all to authenticated using (can_manage_activity(activity_id)) with check (can_manage_activity(activity_id));

/* ---------- syllabus hub ---------- */
alter table activity_topics add column on_date date;
alter table tasks add column topic_id uuid references activity_topics(id) on delete set null;
-- a topic's task belongs to that topic's activity
create policy task_topic on tasks as restrictive for all to authenticated using (true)
  with check (topic_id is null or exists (select 1 from activity_topics t where t.id = topic_id and t.activity_id = tasks.activity_id));

/* ---------- plan categories ---------- */
alter table activity_session_types add column category text not null default 'other'
  check (category in ('camp', 'calisma', 'olympiad', 'other'));
update activity_session_types set category = case
  when name ilike '%camp%' or name ilike '%камп%' or name ilike '%кэмп%' then 'camp'
  when name ilike '%çal%' or name ilike '%cal%ma%' or name ilike '%чалыс%' or name ilike '%чалыш%' then 'calisma'
  when name ilike '%кбо%' or name ilike '%kbo%' or name ilike '%олимп%' then 'olympiad'
  else 'other' end
where category = 'other';

revoke execute on function set_activity_look, own_top_goal from public, anon;
grant execute on function set_activity_look, own_top_goal to authenticated;
