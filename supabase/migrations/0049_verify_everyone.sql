-- 0049 (1.3.1): anyone at school can check a QR from the «+» menu. Staff see everything; a student sees whether a
-- pass or booking is valid now, whose it is and when, but not the reason of a pass or who allowed it.
create or replace function verify_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s uuid := my_school(); l leave_requests; b bookings; r resources; staff boolean := is_staff();
begin
  if s is null then raise exception 'Кіріңіз'; end if;
  select * into l from leave_requests where code = upper(trim(p_code)) and school_id = s;
  if l.id is not null then
    return jsonb_build_object('type', 'leave', 'code', l.code, 'status', l.status, 'kind', l.kind,
      'student', (select full_name from profiles where id = l.student_id),
      'class', (select c.name from profiles p join classes c on c.id = p.class_id where p.id = l.student_id),
      'starts_at', l.starts_at, 'ends_at', l.ends_at,
      'category', case when staff then l.category end,
      'decided_by', case when staff then (select full_name from profiles where id = l.decided_by) end,
      'valid_now', l.status = 'approved' and now() between l.starts_at - interval '15 minutes' and l.ends_at);
  end if;
  select * into b from bookings where code = upper(trim(p_code));
  select * into r from resources where id = b.resource_id;
  if b.id is not null and r.school_id = s then
    return jsonb_build_object('type', 'booking', 'code', b.code, 'status', b.status, 'resource', r.name,
      'group', (select name from resource_groups where id = r.group_id),
      'user', (select full_name from profiles where id = b.user_id), 'date', b.on_date,
      'start', to_char(b.start_time, 'HH24:MI'), 'end', to_char(b.end_time, 'HH24:MI'), 'purpose', b.purpose,
      'valid_now', b.status = 'approved' and b.on_date = school_today(s)
        and (now() at time zone (select tz from schools where id = s))::time between b.start_time - interval '15 minutes' and b.end_time);
  end if;
  return null;
end $$;
revoke execute on function verify_code from public, anon;
grant execute on function verify_code to authenticated;
