-- 0075: make student_trajectory_items the canonical source for interests and directions.
-- Legacy values are snapshotted before the old columns/JSON keys are retired.

create table if not exists student_legacy_interest_archive (
  student_id uuid primary key references profiles(id) on delete cascade,
  olympiad text,
  club text,
  hobby text,
  sport text,
  archived_at timestamptz not null default now()
);

alter table student_legacy_interest_archive enable row level security;
drop policy if exists student_legacy_interest_archive_staff on student_legacy_interest_archive;
create policy student_legacy_interest_archive_staff on student_legacy_interest_archive
  for select to authenticated using (
    exists (
      select 1 from profiles p
      where p.id = student_id and (p.id = auth.uid() or class_council(p.class_id) or is_staff())
    )
  );

insert into student_legacy_interest_archive(student_id, olympiad, club, hobby, sport)
select
  p.id,
  nullif(trim(p.olympiad), ''),
  nullif(trim(p.club), ''),
  nullif(trim(f.answers->>'hobby'), ''),
  nullif(trim(f.answers->>'sport'), '')
from profiles p
left join student_forms f on f.student_id = p.id
where p.role = 'student'
  and (
    nullif(trim(p.olympiad), '') is not null
    or nullif(trim(p.club), '') is not null
    or nullif(trim(f.answers->>'hobby'), '') is not null
    or nullif(trim(f.answers->>'sport'), '') is not null
  )
on conflict (student_id) do nothing;

insert into student_trajectory_items(student_id, kind, title, created_by)
select p.id, 'olympiad', trim(p.olympiad), coalesce(auth.uid(), p.id)
from profiles p
where p.role = 'student'
  and length(trim(coalesce(p.olympiad, ''))) between 2 and 160
  and not exists (
    select 1 from student_trajectory_items i
    where i.student_id = p.id and i.kind = 'olympiad' and lower(trim(i.title)) = lower(trim(p.olympiad))
  );

insert into student_trajectory_items(student_id, kind, title, created_by)
select p.id, 'club', trim(p.club), coalesce(auth.uid(), p.id)
from profiles p
where p.role = 'student'
  and length(trim(coalesce(p.club, ''))) between 2 and 160
  and not exists (
    select 1 from student_trajectory_items i
    where i.student_id = p.id and i.kind = 'club' and lower(trim(i.title)) = lower(trim(p.club))
  );

insert into student_trajectory_items(student_id, kind, title, created_by)
select p.id, 'hobby', trim(f.answers->>'hobby'), coalesce(auth.uid(), p.id)
from student_forms f
join profiles p on p.id = f.student_id
where p.role = 'student'
  and length(trim(coalesce(f.answers->>'hobby', ''))) between 2 and 160
  and not exists (
    select 1 from student_trajectory_items i
    where i.student_id = p.id and i.kind = 'hobby' and lower(trim(i.title)) = lower(trim(f.answers->>'hobby'))
  );

insert into student_trajectory_items(student_id, kind, title, created_by)
select p.id, 'sport', trim(f.answers->>'sport'), coalesce(auth.uid(), p.id)
from student_forms f
join profiles p on p.id = f.student_id
where p.role = 'student'
  and length(trim(coalesce(f.answers->>'sport', ''))) between 2 and 160
  and not exists (
    select 1 from student_trajectory_items i
    where i.student_id = p.id and i.kind = 'sport' and lower(trim(i.title)) = lower(trim(f.answers->>'sport'))
  );

-- The UI no longer writes these fields. Keep the snapshot above for audit/rollback,
-- then clear the duplicated active values so there is one source of truth.
update profiles set olympiad = null, club = null
where role = 'student' and (olympiad is not null or club is not null);

update student_forms
set answers = answers - 'hobby' - 'sport' - 'iin', updated_at = now()
where jsonb_typeof(answers) = 'object'
  and (answers ? 'hobby' or answers ? 'sport' or answers ? 'iin');

comment on column profiles.olympiad is 'Deprecated since 0075; use student_trajectory_items(kind=olympiad). Archived in student_legacy_interest_archive.';
comment on column profiles.club is 'Deprecated since 0075; use student_trajectory_items(kind=club). Archived in student_legacy_interest_archive.';

create or replace function patch_student_form(p_student_id uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() <> p_student_id and not exists (
    select 1 from profiles s
    where s.id = p_student_id
      and s.school_id = my_school()
      and (is_deputy() or class_council(s.class_id) or is_staff())
  ) then raise exception 'Құқығыңыз жоқ'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Дерек пішімі қате'; end if;
  if p_patch ?| array['iin', 'hobby', 'sport'] then
    raise exception 'ЖСН, хобби және спорт «Қызығушылықтар және бағыттар» немесе жеке деректер бөлімінде сақталады';
  end if;

  insert into student_forms(student_id, answers, updated_at)
  values (p_student_id, p_patch, now())
  on conflict (student_id)
  do update set answers = student_forms.answers || excluded.answers, updated_at = now();
end
$$;

create or replace function update_student_name(p_student uuid, p_full_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles p
    where p.id = p_student and p.role = 'student' and p.school_id = my_school()
      and (is_deputy() or exists (
        select 1 from classes k where k.id = p.class_id and auth.uid() in (k.teacher_id, k.tutor_id)
      ))
  ) then raise exception 'Оқушы мәліметін сынып жетекшісі немесе тәрбиеші өзгертеді'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'Аты-жөнін жазыңыз'; end if;
  update profiles set full_name = trim(p_full_name) where id = p_student;
end
$$;
revoke execute on function update_student_name from public, anon;
grant execute on function update_student_name to authenticated;

-- Keep the old RPC signature for older clients, but prevent it from reviving
-- the retired duplicate columns.
create or replace function update_student(p_student uuid, p_full_name text, p_olympiad text, p_club text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform update_student_name(p_student, p_full_name);
end
$$;

-- Return the same dossier shape as before, but derive the two legacy display
-- labels from the canonical trajectory table as well.
create or replace function student_dossier(p_student uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare staff_view boolean := student_dossier_staff(p_student);
begin
  if auth.uid() <> p_student and not staff_view then raise exception 'Құқығыңыз жоқ'; end if;

  return jsonb_build_object(
    'student', (
      select jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'photo', p.photo,
        'class_id', p.class_id,
        'olympiad', (select array_to_string(array_agg(distinct trim(i.title) order by trim(i.title)), ' · ') from student_trajectory_items i where i.student_id = p.id and i.kind = 'olympiad'),
        'club', (select array_to_string(array_agg(distinct trim(i.title) order by trim(i.title)), ' · ') from student_trajectory_items i where i.student_id = p.id and i.kind = 'club')
      ) from profiles p where p.id = p_student
    ),
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'student_id', m.student_id, 'staff_id', m.staff_id,
        'starts_at', m.starts_at, 'topic', m.topic, 'visible', m.visible,
        'actions', m.actions, 'notes', case when staff_view then m.notes end,
        'done_at', m.done_at, 'place', m.place
      ) order by m.starts_at desc)
      from mentor_meetings m
      where m.student_id = p_student and (staff_view or m.visible)
    ), '[]'::jsonb),
    'tests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', q.v->>'type',
        'answers', r.answers->(q.i::int - 1),
        'answered_at', r.created_at
      ) order by r.created_at desc)
      from survey_responses r
      join surveys s on s.id = r.survey_id,
      jsonb_array_elements(s.questions) with ordinality q(v, i)
      where r.user_id = p_student and q.v->>'type' in ('mbti', 'mi', 'holland')
    ), '[]'::jsonb),
    'notes', case when staff_view then coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from council_notes n where p_student = any(n.student_ids)
    ), '[]'::jsonb) else '[]'::jsonb end,
    'contacts', case when staff_view then coalesce((
      select jsonb_agg(to_jsonb(c) order by c.on_date desc)
      from parent_contacts c where c.student_id = p_student
    ), '[]'::jsonb) else '[]'::jsonb end,
    'form', (select to_jsonb(f) from student_forms f where f.student_id = p_student),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at desc) from mentor_items(p_student) i
    ), '[]'::jsonb),
    'roadmap', coalesce((
      select jsonb_build_object('goals', r.goals, 'habits', r.habits, 'tasks', r.tasks)
      from student_roadmaps r where r.student_id = p_student
    ), jsonb_build_object('goals', '[]'::jsonb, 'habits', '[]'::jsonb, 'tasks', '[]'::jsonb)),
    'profile_details', (select to_jsonb(x) - 'updated_by' from student_profile_details x where x.student_id = p_student),
    'health', (select to_jsonb(x) - 'updated_by' from student_health_profiles x where x.student_id = p_student),
    'health_events', coalesce((
      select jsonb_agg((to_jsonb(x) - 'created_by') order by coalesce(x.started_on, x.on_date) desc)
      from student_health_events x where x.student_id = p_student
    ), '[]'::jsonb),
    'family_contacts', coalesce((
      select jsonb_agg((to_jsonb(x) - 'updated_by') order by x.relationship)
      from student_family_contacts x where x.student_id = p_student
    ), '[]'::jsonb)
  );
end
$$;
