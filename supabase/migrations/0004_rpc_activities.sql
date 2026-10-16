-- ---------- RPC: activities ----------
-- p: {type,title,description,supervisor_id,place,audience_grades,capacity,schedule,on_date,weekdays,date_from,date_to,start_time,end_time}
create function submit_activity(p jsonb, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u profiles := me();
  sup profiles;
  ct uuid;
  st activity_status;
  aid uuid := p_id;
  today date;
  old activities;
begin
  if u.id is null then raise exception 'Кіру қажет'; end if;
  today := school_today(u.school_id);
  select * into sup from profiles where id = (p->>'supervisor_id')::uuid;
  if sup.id is null or sup.school_id <> u.school_id or sup.role = 'student' then
    raise exception 'Жауапты мұғалімді таңдаңыз'; end if;
  if p->>'schedule' = 'once' and (p->>'on_date')::date < today then raise exception 'Өткен күнді таңдауға болмайды'; end if;
  if p->>'schedule' = 'weekly' and (p->>'date_to')::date < today then raise exception 'Кезеңнің соңы өтіп кеткен'; end if;

  if u.role in ('deputy','admin') then st := 'approved';
  elsif u.role = 'student' then
    select c.teacher_id into ct from classes c where c.id = u.class_id;
    st := case when ct is null then 'pending_deputy' else 'pending_class_teacher' end;
  else st := 'pending_deputy';
  end if;

  if aid is not null then
    select * into old from activities where id = aid;
    if old.author_id <> u.id then raise exception 'Тек автор өзгерте алады'; end if;
    if old.status not in ('rejected','pending_class_teacher','pending_deputy') then raise exception 'Расталған іс-шараны өзгертуге болмайды'; end if;
    update activities set type = (p->>'type')::activity_type, title = p->>'title', description = p->>'description',
      supervisor_id = sup.id, place = p->>'place',
      audience_grades = coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'audience_grades') x), '{}'),
      capacity = nullif(p->>'capacity','')::int, schedule = (p->>'schedule')::schedule_kind,
      on_date = nullif(p->>'on_date','')::date,
      weekdays = (select array_agg(x::int) from jsonb_array_elements_text(p->'weekdays') x),
      date_from = nullif(p->>'date_from','')::date, date_to = nullif(p->>'date_to','')::date,
      start_time = (p->>'start_time')::time, end_time = (p->>'end_time')::time,
      status = st, updated_at = now()
    where id = aid;
  else
    insert into activities (school_id, type, title, description, author_id, supervisor_id, place, audience_grades, capacity,
      schedule, on_date, weekdays, date_from, date_to, start_time, end_time, status)
    values (u.school_id, (p->>'type')::activity_type, p->>'title', p->>'description', u.id, sup.id, p->>'place',
      coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'audience_grades') x), '{}'),
      nullif(p->>'capacity','')::int, (p->>'schedule')::schedule_kind, nullif(p->>'on_date','')::date,
      (select array_agg(x::int) from jsonb_array_elements_text(p->'weekdays') x),
      nullif(p->>'date_from','')::date, nullif(p->>'date_to','')::date,
      (p->>'start_time')::time, (p->>'end_time')::time, st)
    returning id into aid;
  end if;

  insert into approvals (activity_id, step, actor_id, decision) values (aid, st, u.id, 'submitted');
  if st = 'pending_class_teacher' then
    perform notify(ct, 'Жаңа ұсыныс', u.full_name || ': ' || (p->>'title'), '/a/' || aid);
  elsif st = 'pending_deputy' then
    perform notify(d.id, 'Жаңа ұсыныс', u.full_name || ': ' || (p->>'title'), '/a/' || aid)
      from profiles d where d.school_id = u.school_id and d.role = 'deputy';
  end if;
  if sup.id <> u.id then
    perform notify(sup.id, 'Сізді жауапты етіп көрсетті', p->>'title', '/a/' || aid);
  end if;
  return aid;
end $$;

create function decide_activity(p_id uuid, p_approve boolean, p_comment text default null) returns activity_status
language plpgsql security definer set search_path = public as $$
declare
  u profiles := me();
  a activities;
  author profiles;
  ct uuid;
  nxt activity_status;
begin
  select * into a from activities where id = p_id for update;
  if a.id is null or a.school_id <> u.school_id then raise exception 'Іс-шара табылмады'; end if;
  if a.status not in ('pending_class_teacher','pending_deputy') then raise exception 'Бұл өтініш шешіліп қойған'; end if;
  select * into author from profiles where id = a.author_id;
  select teacher_id into ct from classes where id = author.class_id;

  if not (u.role in ('deputy','admin') or (a.status = 'pending_class_teacher' and ct = u.id)) then
    raise exception 'Бұл өтінішті шешуге құқығыңыз жоқ'; end if;
  if not p_approve and coalesce(length(trim(p_comment)), 0) < 5 then
    raise exception 'Қайтару себебін жазыңыз'; end if;

  nxt := case when not p_approve then 'rejected'
              when u.role in ('deputy','admin') then 'approved'
              else 'pending_deputy' end;
  update activities set status = nxt, updated_at = now() where id = p_id;
  insert into approvals (activity_id, step, actor_id, decision, comment)
    values (p_id, a.status, u.id, case when p_approve then 'approved' else 'rejected' end, nullif(trim(p_comment), ''));

  if nxt = 'approved' then
    perform notify(a.author_id, 'Іс-шара расталды', a.title, '/a/' || p_id);
  elsif nxt = 'rejected' then
    perform notify(a.author_id, 'Ұсыныс қайтарылды', a.title || ': ' || p_comment, '/a/' || p_id);
  else
    perform notify(a.author_id, 'Сынып жетекшісі растады', a.title || ' — енді орынбасардың шешімі күтілуде', '/a/' || p_id);
    perform notify(d.id, 'Жаңа ұсыныс', author.full_name || ': ' || a.title, '/a/' || p_id)
      from profiles d where d.school_id = a.school_id and d.role = 'deputy';
  end if;
  return nxt;
end $$;

create function cancel_activity(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); a activities;
begin
  select * into a from activities where id = p_id for update;
  if a.id is null or a.school_id <> u.school_id then raise exception 'Іс-шара табылмады'; end if;
  if not (u.id in (a.author_id, a.supervisor_id) or u.role in ('deputy','admin')) then raise exception 'Құқығыңыз жоқ'; end if;
  update activities set status = 'cancelled', updated_at = now() where id = p_id;
  perform notify(e.student_id, 'Іс-шара тоқтатылды', a.title || coalesce(': ' || p_reason, ''), '/a/' || p_id)
    from enrollments e where e.activity_id = p_id;
end $$;
