-- 0030: the bot writes in each reader's language: notifications carry the recipient's, the roll call the sender's.
create or replace function telegram_payload(p_id bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tg_id', t.tg_id, 'title', n.title, 'body', n.body, 'link', n.link, 'lang', u.lang,
    'leave', case when l.id is not null then jsonb_build_object('id', l.id, 'status', l.status, 'reason', l.reason,
      'ct_opinion', l.ct_opinion, 'escalated', l.escalated) end)
  from notifications n join telegram_links t on t.user_id = n.user_id and t.tg_id is not null
  join profiles u on u.id = n.user_id
  left join lateral (select * from leave_for_notice(n.user_id, n.body)) l on l.id is not null
  where n.id = p_id
$$;

create or replace function rollcall_payload(p_activity uuid, p_date date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a activities; x activity_sessions; s jsonb;
begin
  select * into a from activities where id = p_activity and school_id = my_school() and removed_at is null;
  if a.id is null then raise exception 'Іс-шара табылмады'; end if;
  if not can_keep_journal(a) then raise exception 'Журналды тек жауапты мұғалім жүргізеді'; end if;
  if a.tg_chat_id is null then raise exception 'Telegram тобы байланыспаған. Баптаулар → Telegram тобы'; end if;
  select * into x from activity_sessions where activity_id = a.id and on_date = p_date order by start_time limit 1;
  select e.v into s from jsonb_array_elements(a.slots) as e(v) where (e.v->>'wd')::int = extract(isodow from p_date)::int limit 1;
  return jsonb_build_object('chat_id', a.tg_chat_id, 'title', a.title, 'date', p_date, 'lang', (select lang from profiles where id = auth.uid()),
    'start', to_char(coalesce(x.start_time, (s->>'start')::time, a.start_time), 'HH24:MI'),
    'end', to_char(coalesce(x.end_time, (s->>'end')::time, a.end_time), 'HH24:MI'),
    'type', (select t.name from activity_session_types t where t.id = coalesce(x.type_id, a.default_type_id)),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'status', t.status, 'late_min', t.late_min, 'excuse', t.excuse) order by p.full_name)
      from enrollments e join profiles p on p.id = e.student_id
      left join attendance t on t.activity_id = a.id and t.session_date = p_date and t.student_id = e.student_id
      where e.activity_id = a.id and not e.waitlisted), '[]'::jsonb));
end $$;
