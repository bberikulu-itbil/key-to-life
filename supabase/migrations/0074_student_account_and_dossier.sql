-- 0074: Add latin_name to profiles, update_student RPC overload, and seed expanded dossier fields for demo students

alter table profiles add column if not exists latin_name text;

-- Extended update_student with p_latin_name
create or replace function update_student(
  p_student uuid,
  p_full_name text,
  p_olympiad text,
  p_club text,
  p_latin_name text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from profiles p
    where p.id = p_student
      and p.role = 'student'
      and p.school_id = my_school()
      and (is_deputy() or class_council(p.class_id))
  ) then
    raise exception 'Оқушы мәліметін сынып жетекшісі немесе тәрбиеші өзгертеді';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Аты-жөнін жазыңыз';
  end if;
  update profiles
  set full_name = trim(p_full_name),
      latin_name = nullif(trim(p_latin_name), ''),
      olympiad = nullif(trim(p_olympiad), ''),
      club = nullif(trim(p_club), '')
  where id = p_student;
end $$;

-- Backward-compatible 4-arg overload
create or replace function update_student(p_student uuid, p_full_name text, p_olympiad text, p_club text)
returns void language sql security definer set search_path = public as $$
  select update_student(p_student, p_full_name, p_olympiad, p_club, null);
$$;

revoke execute on function update_student(uuid, text, text, text, text) from public, anon;
grant execute on function update_student(uuid, text, text, text, text) to authenticated;

-- Seed expanded dossier info & latin_name for demo students
do $$
declare
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_s5 uuid;
begin
  select id into v_s1 from auth.users where email in ('110412501234@users.lyceum-life.app', 'demo_sanzhar@users.lyceum-life.app') limit 1;
  select id into v_s2 from auth.users where email in ('110918503456@users.lyceum-life.app', 'demo_nurislam@users.lyceum-life.app') limit 1;
  select id into v_s3 from auth.users where email in ('110123605678@users.lyceum-life.app', 'demo_aruzhan@users.lyceum-life.app') limit 1;
  select id into v_s4 from auth.users where email in ('110605507890@users.lyceum-life.app', 'demo_damir@users.lyceum-life.app') limit 1;
  select id into v_s5 from auth.users where email in ('111111509012@users.lyceum-life.app', 'demo_alikhan@users.lyceum-life.app') limit 1;

  if v_s1 is not null then
    update profiles set latin_name = 'Amangeldi Sanzhar' where id = v_s1;
    update student_forms set answers = answers || '{
      "latin_name": "Amangeldi Sanzhar",
      "ru": "Арғын - Тобықты",
      "birthplace": "Қостанай қ.",
      "blood_type": "II (A) Rh+",
      "allergies": "Жоқ",
      "phobias": "Жоқ",
      "chronic_diseases": "Жоқ",
      "medical_dispensary": "Жоқ",
      "father_job": "Инженер-бағдарламашы, IT компания",
      "mother_job": "Қаржыгер, Ұлттық банк",
      "family_notes": "Отбасында 3 бала (үлкені)"
    }'::jsonb where student_id = v_s1;
  end if;

  if v_s2 is not null then
    update profiles set latin_name = 'Serikuly Nurislam' where id = v_s2;
    update student_forms set answers = answers || '{
      "latin_name": "Serikuly Nurislam",
      "ru": "Қыпшақ - Қарақыпшақ",
      "birthplace": "Арқалық қ.",
      "blood_type": "I (0) Rh+",
      "allergies": "Пенициллин",
      "phobias": "Биіктік (акрофобия)",
      "chronic_diseases": "Жоқ",
      "medical_dispensary": "Жоқ",
      "father_job": "Құрылыс инженері",
      "mother_job": "Мектеп мұғалімі",
      "family_notes": "Отбасында 2 бала"
    }'::jsonb where student_id = v_s2;
  end if;

  if v_s3 is not null then
    update profiles set latin_name = 'Bolat Aruzhan' where id = v_s3;
    update student_forms set answers = answers || '{
      "latin_name": "Bolat Aruzhan",
      "ru": "Найман - Бағаналы",
      "birthplace": "Рудный қ.",
      "blood_type": "III (B) Rh+",
      "allergies": "Цитрус жемістері, жаңғақ",
      "phobias": "Қараңғылық (никтофобия)",
      "chronic_diseases": "Жоқ",
      "medical_dispensary": "Жоқ",
      "father_job": "Жеке кәсіпкер",
      "mother_job": "Дәрігер-педиатр, Қалалық емхана",
      "family_notes": "Көпбалалы отбасы (4 бала)"
    }'::jsonb where student_id = v_s3;
  end if;

  if v_s4 is not null then
    update profiles set latin_name = 'Temirlan Damir' where id = v_s4;
    update student_forms set answers = answers || '{
      "latin_name": "Temirlan Damir",
      "ru": "Жалайыр",
      "birthplace": "Лисаков қ.",
      "blood_type": "I (0) Rh+",
      "allergies": "Жоқ",
      "phobias": "Тұйық кеңістік (клаустрофобия)",
      "chronic_diseases": "Созылмалы гастрит (жеңіл түрі)",
      "medical_dispensary": "Гастроэнтеролог бақылауында",
      "father_job": "Логистика менеджері",
      "mother_job": "Бас бухгалтер",
      "family_notes": "Отбасында 2 бала"
    }'::jsonb where student_id = v_s4;
  end if;

  if v_s5 is not null then
    update profiles set latin_name = 'Qanat Alikhan' where id = v_s5;
    update student_forms set answers = answers || '{
      "latin_name": "Qanat Alikhan",
      "ru": "Шапырашты",
      "birthplace": "Қостанай қ.",
      "blood_type": "IV (AB) Rh+",
      "allergies": "Маусымдық тозаң (поллиноз)",
      "phobias": "Жоқ",
      "chronic_diseases": "Жоқ",
      "medical_dispensary": "Аллерголог бақылауында",
      "father_job": "Экономист",
      "mother_job": "Интерьер дизайнері",
      "family_notes": "Отбасында 1 бала"
    }'::jsonb where student_id = v_s5;
  end if;
end $$;
