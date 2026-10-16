-- ---------- RPC: enrollment ----------
create function join_activity(p_id uuid) returns boolean   -- true = joined, false = waitlisted
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities; g int; n int;
begin
  select * into a from activities where id = p_id for update;
  if a.id is null or a.school_id <> u.school_id or a.status <> 'approved' then raise exception 'Іс-шара табылмады'; end if;
  if u.role <> 'student' then raise exception 'Тек оқушылар жазыла алады'; end if;
  select grade into g from classes where id = u.class_id;
  if a.audience_grades <> '{}' and (g is null or not g = any(a.audience_grades)) then
    raise exception 'Бұл іс-шара сіздің сыныпқа арналмаған'; end if;
  if coalesce(a.date_to, a.on_date) < school_today(a.school_id) then raise exception 'Іс-шара аяқталған'; end if;
  select count(*) into n from enrollments where activity_id = p_id and not waitlisted;
  insert into enrollments (activity_id, student_id, waitlisted)
    values (p_id, u.id, a.capacity is not null and n >= a.capacity)
    on conflict do nothing;
  return not (a.capacity is not null and n >= a.capacity);
end $$;

-- ---------- RPC: attendance ----------
-- can_keep_journal applied separately as 0005a
create function can_keep_journal(a activities) returns boolean language sql stable security definer set search_path = public as
$$ select auth.uid() in (a.author_id, a.supervisor_id) or is_deputy() $$;

-- p_rows: [{student_id, status}]
create function mark_attendance(p_id uuid, p_date date, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare a activities; n int;
begin
  select * into a from activities where id = p_id;
  if a.id is null or a.school_id <> my_school() then raise exception 'Іс-шара табылмады'; end if;
  if not can_keep_journal(a) then raise exception 'Журналды тек жауапты мұғалім жүргізеді'; end if;
  if a.status <> 'approved' then raise exception 'Іс-шара расталмаған'; end if;
  if not is_session(a, p_date) then raise exception 'Бұл күні сабақ жоқ'; end if;
  if p_date > school_today(a.school_id) then raise exception 'Болашақ күнге белгі қоюға болмайды'; end if;
  insert into attendance (activity_id, session_date, student_id, status, marked_by)
  select p_id, p_date, (r->>'student_id')::uuid, (r->>'status')::attendance_status, auth.uid()
  from jsonb_array_elements(p_rows) r
  where exists (select 1 from enrollments e where e.activity_id = p_id and e.student_id = (r->>'student_id')::uuid and not e.waitlisted)
  on conflict (activity_id, session_date, student_id)
    do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- RPC: absence requests ----------
create function request_absence(p_activity uuid, p_date date, p_category text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities; rid uuid;
begin
  select * into a from activities where id = p_activity;
  if a.id is null or a.school_id <> u.school_id then raise exception 'Іс-шара табылмады'; end if;
  if not exists (select 1 from enrollments where activity_id = p_activity and student_id = u.id and not waitlisted) then
    raise exception 'Сіз бұл іс-шараға жазылмағансыз'; end if;
  if p_date < school_today(a.school_id) then raise exception 'Өткен күнге рұқсат сұрауға болмайды'; end if;
  if not is_session(a, p_date) then raise exception 'Бұл күні сабақ жоқ'; end if;
  insert into absence_requests (student_id, activity_id, session_date, category, reason)
    values (u.id, p_activity, p_date, p_category, trim(p_reason)) returning id into rid;
  perform notify(a.supervisor_id, 'Рұқсат сұрау', u.full_name || ' · ' || a.title || ' · ' || to_char(p_date, 'DD.MM'), '/a/' || p_activity);
  return rid;
exception when unique_violation then raise exception 'Бұл күнге өтініш жіберіп қойғансыз';
end $$;

create function decide_absence(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r absence_requests; a activities; ct uuid;
begin
  select * into r from absence_requests where id = p_id for update;
  select * into a from activities where id = r.activity_id;
  select c.teacher_id into ct from profiles p join classes c on c.id = p.class_id where p.id = r.student_id;
  if r.id is null or a.school_id <> my_school() then raise exception 'Өтініш табылмады'; end if;
  if r.status <> 'pending' then raise exception 'Өтініш шешіліп қойған'; end if;
  if not (auth.uid() = a.supervisor_id or auth.uid() = ct or is_deputy()) then raise exception 'Құқығыңыз жоқ'; end if;
  update absence_requests set status = case when p_approve then 'approved'::request_status else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = p_id;
  if p_approve then
    insert into attendance (activity_id, session_date, student_id, status, marked_by)
      values (r.activity_id, r.session_date, r.student_id, 'excused', auth.uid())
      on conflict (activity_id, session_date, student_id) do update set status = 'excused', marked_by = auth.uid(), marked_at = now();
  end if;
  perform notify(r.student_id, case when p_approve then 'Рұқсат берілді' else 'Рұқсат берілмеді' end,
    a.title || ' · ' || to_char(r.session_date, 'DD.MM') || coalesce(' · ' || nullif(trim(p_note), ''), ''), '/a/' || a.id);
end $$;

create function mark_notifications_read() returns void language sql security definer set search_path = public as
$$ update notifications set read_at = now() where user_id = auth.uid() and read_at is null $$;

-- Attendance % = (present + late) / (marked − excused); null when nothing counts yet.
create function attendance_rate(p_student uuid) returns numeric language sql stable security definer set search_path = public as
$$ select round(100.0 * count(*) filter (where status in ('present','late'))
                / nullif(count(*) filter (where status <> 'excused'), 0))
   from attendance where student_id = p_student
     and (p_student = auth.uid() or (is_staff() and (select school_id from profiles where id = p_student) = my_school())) $$;
