-- 0076: Manage class plans (Etude) with term-based validity and calendar integration

-- 1. Insert default school breaks for 2026-2027 if table is empty
insert into school_breaks (school_id, name, from_date, to_date)
select s.id, x.name, x.fd::date, x.td::date
from schools s,
  (values
    ('Күзгі демалыс (1-тоқсан соңы)', '2026-11-01', '2026-11-08'),
    ('Қысқы демалыс (2-тоқсан соңы)', '2026-12-30', '2027-01-08'),
    ('Көктемгі демалыс (3-тоқсан соңы)', '2027-03-21', '2027-03-31'),
    ('Жазғы демалыс', '2027-06-01', '2027-08-31')
  ) x(name, fd, td)
where not exists (select 1 from school_breaks b where b.school_id = s.id);

-- 2. Function to create or update a class plan (Etude)
create or replace function save_class_plan(p_class uuid, p_plan jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_teacher_id uuid;
  v_tutor_id uuid;
  v_class_name text;
  v_id uuid := p_id;
  v_title text;
  v_place text;
  v_desc text;
  v_start time;
  v_end time;
  v_from date;
  v_to date;
  v_wds int[];
begin
  if not class_council(p_class) then
    raise exception 'Сынып жоспарын тек сынып жетекшісі, тәрбиеші немесе орынбасар өзгерте алады';
  end if;

  select school_id, teacher_id, tutor_id, name
  into v_school_id, v_teacher_id, v_tutor_id, v_class_name
  from classes where id = p_class;

  if v_school_id is null then
    raise exception 'Сынып табылмады';
  end if;

  v_title := trim(coalesce(p_plan->>'title', ''));
  if length(v_title) < 2 then
    raise exception 'Жоспар атауын жазыңыз';
  end if;

  v_start := (p_plan->>'start_time')::time;
  v_end := (p_plan->>'end_time')::time;
  if v_end <= v_start then
    raise exception 'Аяқталу уақыты басталу уақытынан кейін болуы керек';
  end if;

  v_from := (p_plan->>'date_from')::date;
  v_to := (p_plan->>'date_to')::date;
  if v_to < v_from then
    raise exception 'Кезеңнің аяқталу күні басталу күнінен кейін болуы керек';
  end if;

  v_place := nullif(trim(coalesce(p_plan->>'place', '')), '');
  if v_place is null then
    v_place := v_class_name || ' сыныбы';
  end if;

  v_desc := nullif(trim(coalesce(p_plan->>'description', '')), '');
  if v_desc is null then
    v_desc := v_class_name || ' сыныбының өзіндік дайындығы (Etude). Тәрбиеші мен сынып жетекшісі түгелдейді.';
  end if;

  if p_plan ? 'weekdays' and jsonb_array_length(p_plan->'weekdays') > 0 then
    select array_agg(x::int) into v_wds from jsonb_array_elements_text(p_plan->'weekdays') x;
  else
    v_wds := array[1, 2, 3, 4, 7]; -- Default Mon-Thu + Sun
  end if;

  if v_id is null then
    insert into activities (
      school_id,
      class_plan,
      type,
      title,
      description,
      place,
      author_id,
      supervisor_id,
      schedule,
      weekdays,
      date_from,
      date_to,
      start_time,
      end_time,
      status,
      enrollment_open,
      features
    )
    values (
      v_school_id,
      p_class,
      'course',
      v_title,
      v_desc,
      v_place,
      coalesce(v_teacher_id, auth.uid()),
      coalesce(v_tutor_id, v_teacher_id, auth.uid()),
      'weekly',
      v_wds,
      v_from,
      v_to,
      v_start,
      v_end,
      'approved',
      false,
      array['schedule', 'attendance', 'tasks']
    )
    returning id into v_id;
  else
    update activities set
      title = v_title,
      description = v_desc,
      place = v_place,
      weekdays = v_wds,
      date_from = v_from,
      date_to = v_to,
      start_time = v_start,
      end_time = v_end,
      updated_at = now()
    where id = v_id and class_plan = p_class;
  end if;

  -- Ensure all current students of the class are enrolled for roll call
  insert into enrollments (activity_id, student_id)
  select v_id, p.id
  from profiles p
  where p.class_id = p_class and p.role = 'student'
  on conflict do nothing;

  return v_id;
end $$;

-- 3. Function to cancel/remove a class plan
create or replace function remove_class_plan(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid;
begin
  select class_plan into v_class from activities where id = p_id;
  if v_class is null then
    raise exception 'Жоспар табылмады';
  end if;

  if not class_council(v_class) then
    raise exception 'Құқығыңыз жоқ';
  end if;

  update activities
  set removed_at = now(),
      status = 'cancelled'
  where id = p_id;
end $$;

revoke all on function save_class_plan from public, anon;
grant execute on function save_class_plan to authenticated;

revoke all on function remove_class_plan from public, anon;
grant execute on function remove_class_plan to authenticated;

-- 4. Seed demo Etude activities for 7-Демо if not already created
do $$
declare
  v_demo_class_id uuid;
  v_school_id uuid;
  v_teacher_id uuid;
  v_tutor_id uuid;
  v_act1 uuid;
  v_act2 uuid;
begin
  select id, school_id, teacher_id, tutor_id
  into v_demo_class_id, v_school_id, v_teacher_id, v_tutor_id
  from classes
  where name = '7-Демо'
  limit 1;

  if v_demo_class_id is not null then
    -- Check if Etude-1 already exists for 7-Демо
    select id into v_act1 from activities where class_plan = v_demo_class_id and title like 'Этюд-1%' limit 1;
    if v_act1 is null then
      insert into activities (
        school_id, class_plan, type, title, description, place,
        author_id, supervisor_id, schedule, weekdays,
        date_from, date_to, start_time, end_time,
        status, enrollment_open, features
      ) values (
        v_school_id, v_demo_class_id, 'course', 'Этюд-1 · 7-Демо',
        '7-Демо сыныбының кешкі өзіндік дайындығы (1-сабақ). Тәрбиеші мен сынып жетекшісі түгелдейді.',
        '7-Демо сыныбы', v_teacher_id, coalesce(v_tutor_id, v_teacher_id), 'weekly', '{1,2,3,4,7}',
        date '2026-09-01', date '2026-10-31', time '19:00', time '19:45',
        'approved', false, '{schedule,attendance,tasks}'
      ) returning id into v_act1;
    end if;

    -- Check if Etude-2 already exists for 7-Демо
    select id into v_act2 from activities where class_plan = v_demo_class_id and title like 'Этюд-2%' limit 1;
    if v_act2 is null then
      insert into activities (
        school_id, class_plan, type, title, description, place,
        author_id, supervisor_id, schedule, weekdays,
        date_from, date_to, start_time, end_time,
        status, enrollment_open, features
      ) values (
        v_school_id, v_demo_class_id, 'course', 'Этюд-2 · 7-Демо',
        '7-Демо сыныбының кешкі өзіндік дайындығы (2-сабақ). Тәрбиеші мен сынып жетекшісі түгелдейді.',
        '7-Демо сыныбы', v_teacher_id, coalesce(v_tutor_id, v_teacher_id), 'weekly', '{1,2,3,4,7}',
        date '2026-09-01', date '2026-10-31', time '20:00', time '20:45',
        'approved', false, '{schedule,attendance,tasks}'
      ) returning id into v_act2;
    end if;

    -- Enroll all students of 7-Демо in both activities
    insert into enrollments (activity_id, student_id)
    select a.id, p.id
    from (values (v_act1), (v_act2)) as a(id)
    cross join profiles p
    where p.class_id = v_demo_class_id and p.role = 'student' and a.id is not null
    on conflict do nothing;
  end if;
end $$;
