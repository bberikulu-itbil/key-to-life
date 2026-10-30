-- 0053: a third ready-made test, type 'holland': 42 pairs of jobs (wording in web/src/lib/holland.ts).
-- Its answer is an array of 42 picks, each -1 (left job) or 1 (right job).

create or replace function create_survey(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
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
      or q->>'type' not in ('single','multi','text','mbti','mi','holland')
      or (q->>'type' in ('single','multi') and coalesce(jsonb_array_length(q->'options'), 0) < 2)) then
    raise exception 'Әр сұрақты және жауап нұсқаларын (кемінде 2) толтырыңыз'; end if;
  insert into surveys(school_id, author_id, title, description, questions, audience, class_id, activity_id, anonymous, closes_at)
    values (u.school_id, u.id, trim(p->>'title'), nullif(trim(p->>'description'), ''), p->'questions', aud,
      case when aud = 'class' then (p->>'class_id')::uuid end, case when aud = 'activity' then (p->>'activity_id')::uuid end,
      coalesce((p->>'anonymous')::boolean, false), nullif(p->>'closes_at', '')::timestamptz)
    returning id into sid;
  perform notify(x.uid, 'Жаңа сауалнама', trim(p->>'title'), '/surveys/' || sid) from (
    select p2.id as uid from profiles p2 where aud = 'class' and p2.class_id = (p->>'class_id')::uuid
    union select e.student_id from enrollments e where aud = 'activity' and e.activity_id = (p->>'activity_id')::uuid and not e.waitlisted) x
  where x.uid <> u.id;
  return sid;
end $$;

create or replace function answer_survey(p_id uuid, p_answers jsonb) returns void language plpgsql security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = p_id;
  if s.id is null or not survey_for_me(p_id) then raise exception 'Сауалнама табылмады'; end if;
  if s.kind = 'weekend' and (select role from profiles where id = auth.uid()) <> 'student' then raise exception 'Бұл белгі оқушыларға арналған'; end if;
  if s.closed or (s.closes_at is not null and s.closes_at < now()) then raise exception 'Сауалнама жабылған'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> jsonb_array_length(s.questions) then raise exception 'Барлық сұраққа жауап беріңіз'; end if;
  -- a test: all its items, each a whole number from -3 to 3
  if exists (select 1 from jsonb_array_elements(s.questions) with ordinality q(v, i) where q.v->>'type' in ('mbti', 'mi', 'holland') and (
      jsonb_typeof(p_answers->(q.i::int - 1)) <> 'array'
      or jsonb_array_length(p_answers->(q.i::int - 1)) <> case q.v->>'type' when 'mbti' then 70 when 'mi' then 90 else 42 end
      or exists (select 1 from jsonb_array_elements(p_answers->(q.i::int - 1)) a where jsonb_typeof(a) <> 'number' or a::numeric not in (-3, -2, -1, 0, 1, 2, 3) or (q.v->>'type' = 'holland' and a::numeric not in (-1, 1))))) then
    raise exception 'Тесттің барлық сұрағына жауап беріңіз'; end if;
  insert into survey_responses(survey_id, user_id, answers) values (p_id, auth.uid(), p_answers)
    on conflict (survey_id, user_id) do update set answers = excluded.answers, created_at = now();
end $$;
