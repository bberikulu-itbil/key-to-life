-- ---------- helpers ----------
create function me() returns profiles language sql stable security definer set search_path = public as
$$ select * from profiles where id = auth.uid() $$;

create function my_school() returns uuid language sql stable security definer set search_path = public as
$$ select school_id from profiles where id = auth.uid() $$;

create function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role <> 'student' from profiles where id = auth.uid()), false) $$;

create function is_deputy() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('deputy','admin') from profiles where id = auth.uid()), false) $$;

create function school_today(p_school uuid) returns date language sql stable set search_path = public as
$$ select (now() at time zone (select tz from schools where id = p_school))::date $$;

create function is_session(a activities, d date) returns boolean language sql immutable as
$$ select case a.schedule
     when 'once' then d = a.on_date
     else d between a.date_from and a.date_to and extract(isodow from d)::int = any(a.weekdays) end $$;

create function notify(p_user uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as
$$ insert into notifications(user_id, title, body, link) values (p_user, p_title, p_body, p_link) $$;

-- ---------- RLS: read only ----------
alter table schools enable row level security;
alter table classes enable row level security;
alter table profiles enable row level security;
alter table activities enable row level security;
alter table approvals enable row level security;
alter table enrollments enable row level security;
alter table attendance enable row level security;
alter table absence_requests enable row level security;
alter table notifications enable row level security;

create policy read_school on schools for select to authenticated using (id = my_school());
create policy read_classes on classes for select to authenticated using (school_id = my_school());
create policy read_profiles on profiles for select to authenticated using (school_id = my_school());
create policy read_activities on activities for select to authenticated using (
  school_id = my_school() and (status = 'approved' or is_staff() or author_id = auth.uid() or supervisor_id = auth.uid()));
create policy read_approvals on approvals for select to authenticated using (
  exists (select 1 from activities a where a.id = activity_id));
create policy read_enrollments on enrollments for select to authenticated using (
  exists (select 1 from activities a where a.id = activity_id));
create policy read_attendance on attendance for select to authenticated using (
  student_id = auth.uid() or (is_staff() and exists (select 1 from activities a where a.id = activity_id))
  or exists (select 1 from activities a where a.id = activity_id and a.author_id = auth.uid()));
create policy read_requests on absence_requests for select to authenticated using (
  student_id = auth.uid() or (is_staff() and exists (select 1 from activities a where a.id = activity_id)));
create policy read_notifications on notifications for select to authenticated using (user_id = auth.uid());
