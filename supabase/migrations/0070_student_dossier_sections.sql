-- 0070: structured student dossier sections, privacy boundaries, and patch saves.
-- Sensitive profile, health, and family data no longer has to live in student_forms.answers.

create table if not exists student_profile_details (
  student_id uuid primary key references profiles(id) on delete cascade,
  birthday date,
  iin text check (iin is null or iin ~ '^[0-9]{12}$'),
  document_number text check (document_number is null or length(trim(document_number)) between 3 and 40),
  nation text,
  city text,
  address text,
  tribe text,
  dorm_room text,
  dorm_bed text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists student_health_profiles (
  student_id uuid primary key references profiles(id) on delete cascade,
  chronic_conditions text,
  allergies text,
  diet text,
  needs_attention boolean not null default false,
  extra_notes text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists student_health_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  on_date date not null default current_date,
  illness_kind text not null check (length(trim(illness_kind)) between 2 and 120),
  started_on date,
  ended_on date,
  impact text,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index if not exists student_health_events_student on student_health_events(student_id, started_on desc nulls last, on_date desc);

create table if not exists student_family_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  relationship text not null check (relationship in ('father', 'mother', 'guardian')),
  full_name text,
  workplace text,
  position text,
  phone text,
  telegram text,
  whatsapp text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (student_id, relationship)
);

alter table parent_contacts add column if not exists next_action text;

alter table student_profile_details enable row level security;
alter table student_health_profiles enable row level security;
alter table student_health_events enable row level security;
alter table student_family_contacts enable row level security;

-- The current app has no separate medical-worker role. Until it does, sensitive data is
-- visible to the student themself and to the class council/deputy/admin only.
create or replace function student_dossier_staff(p_student uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = p_student
      and p.school_id = my_school()
      and class_council(p.class_id)
  )
$$;

create policy student_profile_details_read on student_profile_details
  for select to authenticated
  using (student_id = auth.uid() or student_dossier_staff(student_id));
create policy student_health_profiles_read on student_health_profiles
  for select to authenticated
  using (student_id = auth.uid() or student_dossier_staff(student_id));
create policy student_health_events_read on student_health_events
  for select to authenticated
  using (student_id = auth.uid() or student_dossier_staff(student_id));
create policy student_family_contacts_read on student_family_contacts
  for select to authenticated
  using (student_id = auth.uid() or student_dossier_staff(student_id));

create or replace function save_student_profile_details(p_student_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare staff boolean := student_dossier_staff(p_student_id);
begin
  if auth.uid() <> p_student_id and not staff then raise exception 'Құқығыңыз жоқ'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Дерек пішімі қате'; end if;

  insert into student_profile_details(
    student_id, birthday, iin, document_number, nation, city, address, tribe, dorm_room, dorm_bed, updated_by, updated_at
  )
  values (
    p_student_id,
    case when staff and (p_data->>'birthday') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'birthday')::date end,
    case when staff then nullif(trim(p_data->>'iin'), '') end,
    case when staff then nullif(trim(p_data->>'document_number'), '') end,
    nullif(trim(p_data->>'nation'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'tribe'), ''),
    nullif(trim(p_data->>'dorm_room'), ''),
    nullif(trim(p_data->>'dorm_bed'), ''),
    auth.uid(), now()
  )
  on conflict (student_id) do update set
    birthday = case when staff and p_data ? 'birthday' then excluded.birthday else student_profile_details.birthday end,
    iin = case when staff and p_data ? 'iin' then excluded.iin else student_profile_details.iin end,
    document_number = case when staff and p_data ? 'document_number' then excluded.document_number else student_profile_details.document_number end,
    nation = case when p_data ? 'nation' then excluded.nation else student_profile_details.nation end,
    city = case when p_data ? 'city' then excluded.city else student_profile_details.city end,
    address = case when p_data ? 'address' then excluded.address else student_profile_details.address end,
    tribe = case when p_data ? 'tribe' then excluded.tribe else student_profile_details.tribe end,
    dorm_room = case when p_data ? 'dorm_room' then excluded.dorm_room else student_profile_details.dorm_room end,
    dorm_bed = case when p_data ? 'dorm_bed' then excluded.dorm_bed else student_profile_details.dorm_bed end,
    updated_by = auth.uid(), updated_at = now();
end
$$;

create or replace function save_student_health_profile(p_student_id uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() <> p_student_id and not student_dossier_staff(p_student_id) then raise exception 'Құқығыңыз жоқ'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Дерек пішімі қате'; end if;

  insert into student_health_profiles(
    student_id, chronic_conditions, allergies, diet, needs_attention, extra_notes, updated_by, updated_at
  )
  values (
    p_student_id,
    nullif(trim(p_data->>'chronic_conditions'), ''),
    nullif(trim(p_data->>'allergies'), ''),
    nullif(trim(p_data->>'diet'), ''),
    coalesce((p_data->>'needs_attention')::boolean, false),
    nullif(trim(p_data->>'extra_notes'), ''),
    auth.uid(), now()
  )
  on conflict (student_id) do update set
    chronic_conditions = case when p_data ? 'chronic_conditions' then nullif(trim(p_data->>'chronic_conditions'), '') else student_health_profiles.chronic_conditions end,
    allergies = case when p_data ? 'allergies' then nullif(trim(p_data->>'allergies'), '') else student_health_profiles.allergies end,
    diet = case when p_data ? 'diet' then nullif(trim(p_data->>'diet'), '') else student_health_profiles.diet end,
    needs_attention = case when p_data ? 'needs_attention' then coalesce((p_data->>'needs_attention')::boolean, false) else student_health_profiles.needs_attention end,
    extra_notes = case when p_data ? 'extra_notes' then nullif(trim(p_data->>'extra_notes'), '') else student_health_profiles.extra_notes end,
    updated_by = auth.uid(), updated_at = now();
end
$$;

create or replace function save_student_family_contact(p_student_id uuid, p_relationship text, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  if auth.uid() <> p_student_id and not student_dossier_staff(p_student_id) then raise exception 'Құқығыңыз жоқ'; end if;
  if p_relationship not in ('father', 'mother', 'guardian') then raise exception 'Байланыс түрі қате'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Дерек пішімі қате'; end if;

  insert into student_family_contacts(
    student_id, relationship, full_name, workplace, position, phone, telegram, whatsapp, updated_by, updated_at
  )
  values (
    p_student_id, p_relationship,
    nullif(trim(p_data->>'full_name'), ''),
    nullif(trim(p_data->>'workplace'), ''),
    nullif(trim(p_data->>'position'), ''),
    nullif(trim(p_data->>'phone'), ''),
    nullif(trim(p_data->>'telegram'), ''),
    nullif(trim(p_data->>'whatsapp'), ''),
    auth.uid(), now()
  )
  on conflict (student_id, relationship) do update set
    full_name = case when p_data ? 'full_name' then excluded.full_name else student_family_contacts.full_name end,
    workplace = case when p_data ? 'workplace' then excluded.workplace else student_family_contacts.workplace end,
    position = case when p_data ? 'position' then excluded.position else student_family_contacts.position end,
    phone = case when p_data ? 'phone' then excluded.phone else student_family_contacts.phone end,
    telegram = case when p_data ? 'telegram' then excluded.telegram else student_family_contacts.telegram end,
    whatsapp = case when p_data ? 'whatsapp' then excluded.whatsapp else student_family_contacts.whatsapp end,
    updated_by = auth.uid(), updated_at = now()
  returning id into cid;
  return cid;
end
$$;

create or replace function save_student_health_event(p_student_id uuid, p_event_id uuid, p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare eid uuid;
begin
  if auth.uid() <> p_student_id and not student_dossier_staff(p_student_id) then raise exception 'Құқығыңыз жоқ'; end if;
  if jsonb_typeof(p_data) <> 'object' or length(trim(coalesce(p_data->>'illness_kind', ''))) < 2 then
    raise exception 'Ауру түрін жазыңыз';
  end if;

  if p_event_id is null then
    insert into student_health_events(student_id, on_date, illness_kind, started_on, ended_on, impact, note, created_by, updated_at)
    values (
      p_student_id,
      case when (p_data->>'on_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'on_date')::date else current_date end,
      left(trim(p_data->>'illness_kind'), 120),
      case when (p_data->>'started_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'started_on')::date end,
      case when (p_data->>'ended_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'ended_on')::date end,
      nullif(trim(p_data->>'impact'), ''),
      nullif(trim(p_data->>'note'), ''),
      auth.uid(), now()
    )
    returning id into eid;
  else
    update student_health_events
       set on_date = case when (p_data->>'on_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'on_date')::date else on_date end,
           illness_kind = left(trim(p_data->>'illness_kind'), 120),
           started_on = case when (p_data->>'started_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'started_on')::date end,
           ended_on = case when (p_data->>'ended_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_data->>'ended_on')::date end,
           impact = nullif(trim(p_data->>'impact'), ''),
           note = nullif(trim(p_data->>'note'), ''),
           updated_at = now()
     where id = p_event_id and student_id = p_student_id
     returning id into eid;
    if eid is null then raise exception 'Ауру жазбасы табылмады'; end if;
  end if;
  return eid;
end
$$;

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

  insert into student_forms(student_id, answers, updated_at)
  values (p_student_id, p_patch, now())
  on conflict (student_id)
  do update set answers = student_forms.answers || excluded.answers, updated_at = now();
end
$$;

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
        'class_id', p.class_id, 'olympiad', p.olympiad, 'club', p.club
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

insert into student_profile_details(student_id, birthday, iin, document_number, address, nation, updated_at)
select
  student_id,
  case when answers->>'birthday' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (answers->>'birthday')::date end,
  case when answers->>'iin' ~ '^[0-9]{12}
  nullif(answers->>'doc_number', ''),
  nullif(answers->>'address', ''),
  nullif(answers->>'nation', ''),
  now()
from student_forms
where jsonb_typeof(answers) = 'object'
on conflict (student_id) do nothing;

insert into student_family_contacts(student_id, relationship, full_name, phone, updated_at)
select student_id, 'father', nullif(answers->>'father_name', ''), nullif(answers->>'father_phone', ''), now()
from student_forms
where nullif(answers->>'father_name', '') is not null or nullif(answers->>'father_phone', '') is not null
on conflict (student_id, relationship) do nothing;

insert into student_family_contacts(student_id, relationship, full_name, phone, updated_at)
select student_id, 'mother', nullif(answers->>'mother_name', ''), nullif(answers->>'mother_phone', ''), now()
from student_forms
where nullif(answers->>'mother_name', '') is not null or nullif(answers->>'mother_phone', '') is not null
on conflict (student_id, relationship) do nothing;

grant execute on function student_dossier_staff to authenticated;

revoke execute on function student_dossier_staff, save_student_profile_details, save_student_health_profile,
  save_student_family_contact, save_student_health_event, patch_student_form, student_dossier
from public, anon;
grant execute on function save_student_profile_details, save_student_health_profile,
  save_student_family_contact, save_student_health_event, patch_student_form, student_dossier
to authenticated;
notify pgrst, 'reload schema';
 then answers->>'iin' end,
  nullif(answers->>'doc_number', ''),
  nullif(answers->>'address', ''),
  nullif(answers->>'nation', ''),
  now()
from student_forms
where jsonb_typeof(answers) = 'object'
on conflict (student_id) do nothing;

insert into student_family_contacts(student_id, relationship, full_name, phone, updated_at)
select student_id, 'father', nullif(answers->>'father_name', ''), nullif(answers->>'father_phone', ''), now()
from student_forms
where nullif(answers->>'father_name', '') is not null or nullif(answers->>'father_phone', '') is not null
on conflict (student_id, relationship) do nothing;

insert into student_family_contacts(student_id, relationship, full_name, phone, updated_at)
select student_id, 'mother', nullif(answers->>'mother_name', ''), nullif(answers->>'mother_phone', ''), now()
from student_forms
where nullif(answers->>'mother_name', '') is not null or nullif(answers->>'mother_phone', '') is not null
on conflict (student_id, relationship) do nothing;

grant execute on function student_dossier_staff to authenticated;

revoke execute on function student_dossier_staff, save_student_profile_details, save_student_health_profile,
  save_student_family_contact, save_student_health_event, patch_student_form, student_dossier
from public, anon;
grant execute on function save_student_profile_details, save_student_health_profile,
  save_student_family_contact, save_student_health_event, patch_student_form, student_dossier
to authenticated;
notify pgrst, 'reload schema';
