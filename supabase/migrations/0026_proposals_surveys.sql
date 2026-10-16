-- 0026: proposals addressed to the parliament (public, voted on), the administration or one teacher (private),
-- and surveys with single/multiple choice and text questions.
alter table posts add column addressee text check (addressee in ('parliament','admin','teacher')),
  add column addressee_id uuid references profiles(id);
update posts set addressee = 'parliament' where kind = 'proposal' and addressee is null;

create function can_answer_post(p posts) returns boolean language sql stable security definer set search_path = public as $$
  select case p.addressee
    when 'admin' then is_deputy()
    when 'teacher' then p.addressee_id = auth.uid() or is_deputy()
    else can_answer_proposals() end
$$;

-- private proposals: only the author, the addressee and deputies see them
create policy post_private_proposals on posts as restrictive for select to authenticated
  using (kind <> 'proposal' or coalesce(addressee, 'parliament') = 'parliament' or author_id = auth.uid()
    or addressee_id = auth.uid() or is_deputy());

create function create_proposal(p_to text, p_teacher uuid, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); pid uuid;
begin
  if u.id is null then raise exception 'Кіріңіз'; end if;
  if p_to not in ('parliament','admin','teacher') then raise exception 'Кімге екенін таңдаңыз'; end if;
  if p_to = 'teacher' and not exists (select 1 from profiles where id = p_teacher and school_id = u.school_id and role <> 'student') then
    raise exception 'Мұғалімді таңдаңыз'; end if;
  insert into posts(school_id, author_id, kind, title, body, addressee, addressee_id)
    values (u.school_id, u.id, 'proposal', trim(p_title), coalesce(trim(p_body), ''), p_to, case when p_to = 'teacher' then p_teacher end)
    returning id into pid;
  perform notify(d.id, 'Жаңа ұсыныс', trim(p_title), '/proposals') from profiles d
    where d.school_id = u.school_id and d.id <> u.id and (
      (p_to = 'parliament' and (d.role in ('deputy','admin') or d.parliament))
      or (p_to = 'admin' and d.role in ('deputy','admin'))
      or (p_to = 'teacher' and d.id = p_teacher));
  return pid;
end $$;

create or replace function set_post_status(p_id uuid, p_status text, p_answer text default null) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles := me(); p posts;
begin
  select * into p from posts where id = p_id and school_id = u.school_id and hidden_at is null;
  if p.id is null then raise exception 'Жазба табылмады'; end if;
  if p.kind in ('lost','found') then
    if p_status not in ('open','resolved') or not (p.author_id = u.id or u.role <> 'student') then raise exception 'Құқығыңыз жоқ'; end if;
    update posts set status = p_status where id = p_id;
  elsif p.kind = 'proposal' then
    if p_status not in ('open','considering','accepted','rejected') or not can_answer_post(p) then raise exception 'Бұл ұсынысқа жауап беруге құқығыңыз жоқ'; end if;
    update posts set status = p_status, answer = nullif(trim(p_answer), ''), answered_by = u.id where id = p_id;
    perform notify(p.author_id, 'Ұсынысыңызға жауап: ' || case p_status when 'accepted' then 'қабылданды' when 'rejected' then 'қабылданбады' when 'considering' then 'қаралуда' else 'жаңа' end,
      p.title, '/proposals');
  else raise exception 'Бұл жазбаның күйі жоқ';
  end if;
end $$;

-- ---------- surveys ----------
-- questions: [{"q": "Сұрақ", "type": "single"|"multi"|"text", "options": ["…"]}]
create table surveys (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null check (length(title) between 3 and 140),
  description text check (description is null or length(description) <= 2000),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 30),
  audience text not null check (audience in ('all','students','staff','class','activity')),
  class_id uuid references classes(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  anonymous boolean not null default false,
  closes_at timestamptz,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create table survey_responses (
  survey_id uuid references surveys(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  created_at timestamptz not null default now(),
  primary key (survey_id, user_id)
);

create function survey_for_me(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from surveys s join profiles u on u.id = auth.uid() where s.id = p_id and s.school_id = u.school_id and (
    s.author_id = u.id or is_deputy()
    or s.audience = 'all'
    or (s.audience = 'students' and u.role = 'student')
    or (s.audience = 'staff' and u.role <> 'student')
    or (s.audience = 'class' and (u.class_id = s.class_id or exists (select 1 from classes k where k.id = s.class_id and u.id in (k.teacher_id, k.tutor_id))))
    or (s.audience = 'activity' and activity_insider(s.activity_id))))
$$;

alter table surveys enable row level security;
alter table survey_responses enable row level security;
create policy survey_read on surveys for select to authenticated using (survey_for_me(id));
create policy response_read on survey_responses for select to authenticated using (user_id = auth.uid());

create function create_survey(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare u profiles := me(); sid uuid; aud text := p->>'audience';
begin
  if u.role = 'student' and not u.parliament then raise exception 'Сауалнаманы мұғалім немесе парламент мүшесі жасайды'; end if;
  if aud = 'class' and not (is_deputy() or exists (select 1 from classes k where k.id = (p->>'class_id')::uuid and u.id in (k.teacher_id, k.tutor_id))
      or exists (select 1 from timetable t where t.class_id = (p->>'class_id')::uuid and t.teacher_id = u.id)) then
    raise exception 'Бұл сыныпқа сауалнама жібере алмайсыз'; end if;
  if aud = 'activity' and not (is_deputy() or exists (select 1 from activities a where a.id = (p->>'activity_id')::uuid and u.id in (a.supervisor_id, a.curator_id))) then
    raise exception 'Бұл іс-шараға сауалнама жібере алмайсыз'; end if;
  if aud in ('all','staff') and not is_deputy() and u.role = 'student' then raise exception 'Бүкіл мектепке сауалнаманы мұғалім жібереді'; end if;
  if exists (select 1 from jsonb_array_elements(p->'questions') q where length(coalesce(q->>'q', '')) < 2
      or q->>'type' not in ('single','multi','text')
      or (q->>'type' <> 'text' and coalesce(jsonb_array_length(q->'options'), 0) < 2)) then
    raise exception 'Әр сұрақты және жауап нұсқаларын (кемінде 2) толтырыңыз'; end if;
  insert into surveys(school_id, author_id, title, description, questions, audience, class_id, activity_id, anonymous, closes_at)
    values (u.school_id, u.id, trim(p->>'title'), nullif(trim(p->>'description'), ''), p->'questions', aud,
      case when aud = 'class' then (p->>'class_id')::uuid end, case when aud = 'activity' then (p->>'activity_id')::uuid end,
      coalesce((p->>'anonymous')::boolean, false), nullif(p->>'closes_at', '')::timestamptz)
    returning id into sid;
  -- shortcut: only class/activity audiences get a notification; school-wide surveys show on Home
  perform notify(x.uid, 'Жаңа сауалнама', trim(p->>'title'), '/surveys/' || sid) from (
    select p2.id as uid from profiles p2 where aud = 'class' and p2.class_id = (p->>'class_id')::uuid
    union select e.student_id from enrollments e where aud = 'activity' and e.activity_id = (p->>'activity_id')::uuid and not e.waitlisted) x
  where x.uid <> u.id;
  return sid;
end $$;

create function answer_survey(p_id uuid, p_answers jsonb) returns void language plpgsql security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = p_id;
  if s.id is null or not survey_for_me(p_id) then raise exception 'Сауалнама табылмады'; end if;
  if s.closed or (s.closes_at is not null and s.closes_at < now()) then raise exception 'Сауалнама жабылған'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> jsonb_array_length(s.questions) then raise exception 'Барлық сұраққа жауап беріңіз'; end if;
  insert into survey_responses(survey_id, user_id, answers) values (p_id, auth.uid(), p_answers)
    on conflict (survey_id, user_id) do update set answers = excluded.answers, created_at = now();
end $$;

create function close_survey(p_id uuid, p_closed boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from surveys where id = p_id and (author_id = auth.uid() or (is_deputy() and school_id = my_school()))) then raise exception 'Құқығыңыз жоқ'; end if;
  update surveys set closed = p_closed where id = p_id;
end $$;

-- results for the author / deputies; names hidden when the survey is anonymous
create function survey_results(p_id uuid) returns table(respondent text, class_name text, answers jsonb, answered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = p_id;
  if s.id is null or not (s.author_id = auth.uid() or (is_deputy() and s.school_id = my_school())) then raise exception 'Нәтижені сауалнама авторы көреді'; end if;
  return query select case when s.anonymous then null else p.full_name end, case when s.anonymous then null else k.name end, r.answers, r.created_at
    from survey_responses r join profiles p on p.id = r.user_id left join classes k on k.id = p.class_id
    where r.survey_id = p_id order by r.created_at;
end $$;

revoke execute on function can_answer_post, create_proposal, survey_for_me, create_survey, answer_survey, close_survey, survey_results from public, anon;
grant execute on function can_answer_post, create_proposal, survey_for_me, create_survey, answer_survey, close_survey, survey_results to authenticated;
