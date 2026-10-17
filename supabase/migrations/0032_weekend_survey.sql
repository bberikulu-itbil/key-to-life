-- 0032: Hafta Sonu as a weekly survey. Every Monday each school gets a survey for students about weekend meals;
-- class teachers and tutors see its results (staff are not asked to answer).
alter table surveys add column kind text check (kind in ('weekend'));

create or replace function survey_for_me(p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from surveys s join profiles u on u.id = auth.uid() where s.id = p_id and s.school_id = u.school_id and (
    s.author_id = u.id or is_deputy()
    or s.audience = 'all'
    or (s.audience = 'students' and u.role = 'student')
    or (s.audience = 'staff' and u.role <> 'student')
    or (s.kind = 'weekend' and u.role <> 'student')
    or (s.audience = 'class' and (u.class_id = s.class_id or exists (select 1 from classes k where k.id = s.class_id and u.id in (k.teacher_id, k.tutor_id))))
    or (s.audience = 'activity' and activity_insider(s.activity_id))))
$$;

-- results: the author, deputies, and for Hafta Sonu every class teacher and tutor of the school
create or replace function survey_results(p_id uuid) returns table(respondent text, class_name text, answers jsonb, answered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = p_id;
  if s.id is null or not (s.author_id = auth.uid() or (is_deputy() and s.school_id = my_school())
      or (s.kind = 'weekend' and s.school_id = my_school() and exists (select 1 from classes k where auth.uid() in (k.teacher_id, k.tutor_id)))) then
    raise exception 'Нәтижені сауалнама авторы көреді'; end if;
  return query select case when s.anonymous then null else p.full_name end, case when s.anonymous then null else k.name end, r.answers, r.created_at
    from survey_responses r join profiles p on p.id = r.user_id left join classes k on k.id = p.class_id
    where r.survey_id = p_id order by k.name, p.full_name;
end $$;

-- staff see Hafta Sonu but do not answer it
create or replace function answer_survey(p_id uuid, p_answers jsonb) returns void language plpgsql security definer set search_path = public as $$
declare s surveys;
begin
  select * into s from surveys where id = p_id;
  if s.id is null or not survey_for_me(p_id) then raise exception 'Сауалнама табылмады'; end if;
  if s.kind = 'weekend' and (select role from profiles where id = auth.uid()) <> 'student' then raise exception 'Бұл белгі оқушыларға арналған'; end if;
  if s.closed or (s.closes_at is not null and s.closes_at < now()) then raise exception 'Сауалнама жабылған'; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> jsonb_array_length(s.questions) then raise exception 'Барлық сұраққа жауап беріңіз'; end if;
  insert into survey_responses(survey_id, user_id, answers) values (p_id, auth.uid(), p_answers)
    on conflict (survey_id, user_id) do update set answers = excluded.answers, created_at = now();
end $$;

-- one survey per school for the coming weekend; open until Friday 12:00 school time; safe to run twice
create function create_weekend_surveys() returns int language plpgsql security definer set search_path = public as $$
declare sc schools; sat date; d int; sid uuid; n int := 0; author uuid;
begin
  for sc in select * from schools loop
    d := extract(isodow from school_today(sc.id))::int;
    sat := school_today(sc.id) + case when d < 6 then 6 - d else 13 - d end;   -- on a weekend: the next one
    select id into author from profiles where school_id = sc.id and role in ('admin','deputy') order by role limit 1;
    continue when author is null
      or exists (select 1 from surveys where school_id = sc.id and kind = 'weekend' and title = 'Hafta Sonu · ' || to_char(sat, 'DD.MM'));
    insert into surveys(school_id, author_id, title, description, questions, audience, closes_at, kind)
    values (sc.id, author, 'Hafta Sonu · ' || to_char(sat, 'DD.MM'),
      'Демалыс күндері асханаға қай уақытта баратыныңызды белгілеңіз.',
      jsonb_build_array(jsonb_build_object('q', 'Қай тамаққа барасыз?', 'type', 'multi', 'options', jsonb_build_array(
        'Жұма · кешкі ас', 'Сенбі · таңғы ас', 'Сенбі · түскі ас', 'Сенбі · кешкі ас',
        'Жексенбі · таңғы ас', 'Жексенбі · түскі ас', 'Жексенбі · кешкі ас', 'Бармаймын'))),
      'students', ((sat - 1) + time '12:00') at time zone sc.tz, 'weekend')
    returning id into sid;
    perform notify(p.id, 'Жаңа сауалнама', 'Hafta Sonu · ' || to_char(sat, 'DD.MM'), '/surveys/' || sid)
      from profiles p where p.school_id = sc.id and p.role = 'student';
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function create_weekend_surveys from public, anon, authenticated;

-- Mondays 08:00 Almaty (03:00 UTC)
select cron.schedule('weekend-survey', '0 3 * * 1', 'select create_weekend_surveys()');
