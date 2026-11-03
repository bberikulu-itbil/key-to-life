-- 0070: Seed demo class and demo students for testing dossier and questionnaires

create or replace function seed_demo_class(p_class_name text default '7-Демо')
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_school_id uuid;
  v_teacher_id uuid;
  v_class_id uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_s5 uuid;
begin
  -- 1. Find or create school
  v_school_id := coalesce(my_school(), (select id from schools limit 1));
  if v_school_id is null then
    insert into schools(name, city)
    values ('Қостанай Білім-Инновация лицейі', 'Қостанай')
    returning id into v_school_id;
  end if;

  -- 2. Find teacher (current caller or first non-student staff)
  v_teacher_id := coalesce(auth.uid(), (select id from profiles where school_id = v_school_id and role <> 'student' limit 1));

  -- 3. Create or reuse class
  select id into v_class_id from classes where school_id = v_school_id and name = p_class_name;
  if v_class_id is null then
    insert into classes(school_id, name, grade, teacher_id)
    values (v_school_id, p_class_name, 7, v_teacher_id)
    returning id into v_class_id;
  else
    if v_teacher_id is not null then
      update classes set teacher_id = coalesce(teacher_id, v_teacher_id) where id = v_class_id;
    end if;
  end if;

  -- 4. Student 1: Амангелді Санжар (ЖСН: 110412501234)
  select id into v_s1 from auth.users where email in ('110412501234@users.lyceum-life.app', 'demo_sanzhar@users.lyceum-life.app') limit 1;
  if v_s1 is null then
    v_s1 := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_s1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '110412501234@users.lyceum-life.app', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  else
    update auth.users set email = '110412501234@users.lyceum-life.app', encrypted_password = crypt('demo1234', gen_salt('bf')) where id = v_s1;
  end if;

  insert into profiles(id, school_id, full_name, role, class_id, title, olympiad, club)
  values (v_s1, v_school_id, 'Амангелді Санжар', 'student', v_class_id, null, 'Информатика', 'Алгоритмдер және C++')
  on conflict (id) do update set class_id = v_class_id, full_name = 'Амангелді Санжар', olympiad = 'Информатика', club = 'Алгоритмдер және C++';

  insert into student_forms(student_id, answers, updated_at)
  values (v_s1, '{
    "father_name": "Амангелді Берік Нұрланұлы",
    "mother_name": "Амангелді Дина Қайратқызы",
    "birthday": "2011-04-12",
    "address": "Қостанай қ., Абай даңғылы, 45/2",
    "nation": "қазақ",
    "doc_number": "N°0485912",
    "iin": "110412501234",
    "hobby": "Бағдарламалау, шахмат, ғылыми-фантастикалық кітаптар",
    "sport": "Үстел теннисі, жүзу",
    "phone": "+7 777 123 4567",
    "father_phone": "+7 701 555 1122",
    "mother_phone": "+7 702 777 3344",
    "top_gallup": "Achiever, Learner, Analytical, Focus, Responsibility",
    "low_gallup": "Woo, Communication",
    "mbti": "INTJ",
    "interests": "Робототехника және жасанды интеллект",
    "strengths": "Математика, алгоритмдік есептер, талдау",
    "hard": "Тарихтан даталарды жаттау",
    "goal": "Информатикадан облыстық олимпиададан 1-орын алу",
    "dream": "AI зерттеуші инженері болу",
    "free": "Codeforces есептерін шығарамын және шахмат ойнаймын",
    "help": "Олимпиадалық есептерге дайындық кестесін құруға кеңес керек"
  }'::jsonb, now())
  on conflict (student_id) do update set answers = excluded.answers, updated_at = now();

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (v_s1,
    '[{"id":"g1","title":"Информатикадан республикалық олимпиадаға өту","category":"olympiad","metric":"1-орын алу","priority":"high","due_on":"2027-03-20","done":false,"steps":[{"id":"s1","title":"Динамикалық бағдарламалау тақырыбын меңгеру","done":true},{"id":"s2","title":"Графтар бойынша 50 есеп шығару","done":true},{"id":"s3","title":"Облыстық кезеңде жеңімпаз болу","done":false}],"created_at":"2026-11-01T10:00:00Z"},
      {"id":"g2","title":"Ағылшын тілін B2 деңгейіне дейін көтеру","category":"study","metric":"IELTS 6.5+","priority":"normal","due_on":"2027-05-15","done":false,"steps":[{"id":"s4","title":"Күнделікті 10 сөз жаттау","done":true},{"id":"s5","title":"Аптасына 1 эссе жазу","done":false}],"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    '[{"id":"h1","title":"Күн сайын 2 алгоритм есебін шығару","category":"olympiad","target_val":"2 есеп","time_of_day":"evening","frequency":"daily","motivation":"Жүйелілік олимпиадада жеңіске жетелейді","goal_id":"g1","archived":false,"checks":["2026-11-03","2026-11-02","2026-11-01","2026-10-31","2026-10-30","2026-10-29","2026-10-28"],"created_at":"2026-10-20T10:00:00Z"},
      {"id":"h2","title":"Күн сайын 20 бет кітап оқу","category":"book","target_val":"20 бет","time_of_day":"evening","frequency":"daily","motivation":"Ой-өрісті дамыту және сөздік қор","goal_id":"g2","archived":false,"checks":["2026-11-03","2026-11-02","2026-11-01","2026-10-31","2026-10-30"],"created_at":"2026-10-20T10:00:00Z"}]'::jsonb,
    '[{"id":"t1","title":"Codeforces кезекті раундына қатысу","category":"olympiad","priority":"high","due_on":"2026-11-08","goal_id":"g1","done":true,"created_at":"2026-11-01T10:00:00Z"},
      {"id":"t2","title":"Динамикалық бағдарламалау бойынша конспект жазу","category":"study","priority":"normal","due_on":"2026-11-12","goal_id":"g1","done":false,"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    now()
  )
  on conflict (student_id) do update set goals = excluded.goals, habits = excluded.habits, tasks = excluded.tasks, updated_at = now();


  -- 5. Student 2: Серікұлы Нұрислам (ЖСН: 110918503456)
  select id into v_s2 from auth.users where email in ('110918503456@users.lyceum-life.app', 'demo_nurislam@users.lyceum-life.app') limit 1;
  if v_s2 is null then
    v_s2 := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_s2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '110918503456@users.lyceum-life.app', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  else
    update auth.users set email = '110918503456@users.lyceum-life.app', encrypted_password = crypt('demo1234', gen_salt('bf')) where id = v_s2;
  end if;

  insert into profiles(id, school_id, full_name, role, class_id, title, olympiad, club)
  values (v_s2, v_school_id, 'Серікұлы Нұрислам', 'student', v_class_id, null, 'Математика', 'Робототехника')
  on conflict (id) do update set class_id = v_class_id, full_name = 'Серікұлы Нұрислам', olympiad = 'Математика', club = 'Робототехника';

  insert into student_forms(student_id, answers, updated_at)
  values (v_s2, '{
    "father_name": "Серік Маратұлы",
    "mother_name": "Серікова Жанар Болатқызы",
    "birthday": "2011-09-18",
    "address": "Қостанай қ., Тәуелсіздік көшесі, 88",
    "nation": "қазақ",
    "doc_number": "N°0512894",
    "iin": "110918503456",
    "hobby": "3D модельдеу, электроника, робот құрастыру",
    "sport": "Футбол",
    "phone": "+7 778 234 5678",
    "father_phone": "+7 705 333 4455",
    "mother_phone": "+7 707 888 9900",
    "top_gallup": "Strategic, Ideation, Command, Futuristic, Relator",
    "low_gallup": "Harmony, Consistency",
    "mbti": "ENTP",
    "interests": "Автоматтандыру және 3D басып шығару",
    "strengths": "Креативті шешімдер табу, физика, сызба",
    "hard": "Эссе жазу",
    "goal": "Мектеп метеостанциясын Arduino арқылы іске қосу",
    "dream": "Инженер-конструктор",
    "free": "Бөлшектерді жинау, сынақ жасау",
    "help": "Жобаларға қажетті бөлшектерді табуда көмек"
  }'::jsonb, now())
  on conflict (student_id) do update set answers = excluded.answers, updated_at = now();

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (v_s2,
    '[{"id":"g1","title":"Мектеп метеостанциясын жасап шығу","category":"other","metric":"Деректерді онлайн серверге жіберу","priority":"high","due_on":"2027-02-15","done":false,"steps":[{"id":"s1","title":"Сенсорларды Arduino-ға жалғау","done":true},{"id":"s2","title":"Wi-Fi модулін баптау","done":false}],"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    '[{"id":"h1","title":"Таңертеңгілік сергу жаттығуы (15 мин)","category":"sport","target_val":"15 мин","time_of_day":"morning","frequency":"daily","motivation":"Күні бойы сергек жүру","goal_id":null,"archived":false,"checks":["2026-11-03","2026-11-02","2026-11-01","2026-10-31","2026-10-30","2026-10-29"],"created_at":"2026-10-20T10:00:00Z"}]'::jsonb,
    '[{"id":"t1","title":"Сенсорлар тапсырысын тексеру","category":"other","priority":"normal","due_on":"2026-11-10","goal_id":"g1","done":true,"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    now()
  )
  on conflict (student_id) do update set goals = excluded.goals, habits = excluded.habits, tasks = excluded.tasks, updated_at = now();


  -- 6. Student 3: Болат Аружан (ЖСН: 111125602341)
  select id into v_s3 from auth.users where email in ('111125602341@users.lyceum-life.app', 'demo_aruzhan@users.lyceum-life.app') limit 1;
  if v_s3 is null then
    v_s3 := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_s3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '111125602341@users.lyceum-life.app', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  else
    update auth.users set email = '111125602341@users.lyceum-life.app', encrypted_password = crypt('demo1234', gen_salt('bf')) where id = v_s3;
  end if;

  insert into profiles(id, school_id, full_name, role, class_id, title, olympiad, club)
  values (v_s3, v_school_id, 'Болат Аружан', 'student', v_class_id, null, 'Қазақ тілі', 'Дебат клубы')
  on conflict (id) do update set class_id = v_class_id, full_name = 'Болат Аружан', olympiad = 'Қазақ тілі', club = 'Дебат клубы';

  insert into student_forms(student_id, answers, updated_at)
  values (v_s3, '{
    "father_name": "Болат Дәурен Қанатұлы",
    "mother_name": "Болатова Айгүл Сәбитқызы",
    "birthday": "2011-11-25",
    "address": "Қостанай қ., Байтұрсынов к-сі, 12",
    "nation": "қазақ",
    "doc_number": "N°0624110",
    "iin": "111125602341",
    "hobby": "Кітап оқу, шешендік өнер, волонтерлік",
    "sport": "Волейбол",
    "phone": "+7 775 345 6789",
    "father_phone": "+7 701 444 7788",
    "mother_phone": "+7 702 222 6655",
    "top_gallup": "Communication, Empathy, Developer, Positivity, Includer",
    "low_gallup": "Deliberative, Analytical",
    "mbti": "ENFJ",
    "interests": "Қоғамдық іс-шаралар, сөз өнері",
    "strengths": "Адамдармен тіл табысу, көпшілік алдында сөйлеу",
    "hard": "Химия формулалары",
    "goal": "Дебат турнирінде бас жүлде алу",
    "dream": "Дипломат немесе халықаралық заңгер",
    "free": "Кітап оқу және волонтерлік",
    "help": "Уақытты жоспарлауға көмек"
  }'::jsonb, now())
  on conflict (student_id) do update set answers = excluded.answers, updated_at = now();

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (v_s3,
    '[{"id":"g1","title":"Айына 3 көркем әдебиет кітабын оқу","category":"book","metric":"3 кітап / ай","priority":"normal","due_on":"2027-05-30","done":false,"steps":[{"id":"s1","title":"«Абай жолы» 1-томын бітіру","done":true},{"id":"s2","title":"«Шұғаның белгісі» талдау","done":true},{"id":"s3","title":"Шетел классикасын таңдау","done":false}],"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    '[{"id":"h1","title":"Күнделік жазу (рефлексия)","category":"discipline","target_val":"10 мин","time_of_day":"evening","frequency":"daily","motivation":"Ойды жинақтау және өзін-өзі дамыту","goal_id":"g1","archived":false,"checks":["2026-11-03","2026-11-02","2026-11-01","2026-10-31","2026-10-30","2026-10-29","2026-10-28","2026-10-27"],"created_at":"2026-10-20T10:00:00Z"}]'::jsonb,
    '[{"id":"t1","title":"Дебат қарарын талдау","category":"social","priority":"high","due_on":"2026-11-09","goal_id":"g1","done":false,"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    now()
  )
  on conflict (student_id) do update set goals = excluded.goals, habits = excluded.habits, tasks = excluded.tasks, updated_at = now();


  -- 7. Student 4: Қасымова Мәдина (ЖСН: 120214609871)
  select id into v_s4 from auth.users where email in ('120214609871@users.lyceum-life.app', 'demo_madina@users.lyceum-life.app') limit 1;
  if v_s4 is null then
    v_s4 := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_s4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '120214609871@users.lyceum-life.app', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  else
    update auth.users set email = '120214609871@users.lyceum-life.app', encrypted_password = crypt('demo1234', gen_salt('bf')) where id = v_s4;
  end if;

  insert into profiles(id, school_id, full_name, role, class_id, title, olympiad, club)
  values (v_s4, v_school_id, 'Қасымова Мәдина', 'student', v_class_id, null, null, 'Сурет & Дизайн')
  on conflict (id) do update set class_id = v_class_id, full_name = 'Қасымова Мәдина', club = 'Сурет & Дизайн';

  insert into student_forms(student_id, answers, updated_at)
  values (v_s4, '{
    "father_name": "Қасымов Бауыржан Серікұлы",
    "mother_name": "Қасымова Сәуле Ермекқызы",
    "birthday": "2012-02-14",
    "address": "Қостанай қ., Алтынсарин к-сі, 67",
    "nation": "қазақ",
    "doc_number": "N°0735129",
    "iin": "120214609871",
    "hobby": "Сандық графика, анимация, фортепиано",
    "sport": "Гимнастика",
    "phone": "+7 776 456 7890",
    "father_phone": "+7 705 666 8899",
    "mother_phone": "+7 708 111 2233",
    "top_gallup": "Input, Connectedness, Individualization, Arranger, Learner",
    "low_gallup": "Competition, Activator",
    "mbti": "INFP"
  }'::jsonb, now())
  on conflict (student_id) do update set answers = excluded.answers, updated_at = now();

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (v_s4,
    '[{"id":"g1","title":"Мектеп журналының мұқабасын безендіру","category":"other","metric":"Векторлық форматта баспаға дайындау","priority":"high","due_on":"2026-12-20","done":false,"steps":[{"id":"s1","title":"Эскиз нұсқаларын сызу","done":true},{"id":"s2","title":"Сынып жетекшісімен бекіту","done":true},{"id":"s3","title":"Финалдық рендер жасау","done":false}],"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    '[{"id":"h1","title":"Күніне 30 мин скетчинг","category":"other","target_val":"30 мин","time_of_day":"afternoon","frequency":"daily","motivation":"Сурет салу дағдысын шыңдау","goal_id":"g1","archived":false,"checks":["2026-11-03","2026-11-02","2026-11-01","2026-10-31","2026-10-30","2026-10-29"],"created_at":"2026-10-20T10:00:00Z"}]'::jsonb,
    '[]'::jsonb,
    now()
  )
  on conflict (student_id) do update set goals = excluded.goals, habits = excluded.habits, tasks = excluded.tasks, updated_at = now();


  -- 8. Student 5: Дәулет Әлихан (ЖСН: 110630504123)
  select id into v_s5 from auth.users where email in ('110630504123@users.lyceum-life.app', 'demo_alikhan@users.lyceum-life.app') limit 1;
  if v_s5 is null then
    v_s5 := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_s5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '110630504123@users.lyceum-life.app', crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  else
    update auth.users set email = '110630504123@users.lyceum-life.app', encrypted_password = crypt('demo1234', gen_salt('bf')) where id = v_s5;
  end if;

  insert into profiles(id, school_id, full_name, role, class_id, title, olympiad, club)
  values (v_s5, v_school_id, 'Дәулет Әлихан', 'student', v_class_id, null, 'Физика', 'Авиамодельдеу')
  on conflict (id) do update set class_id = v_class_id, full_name = 'Дәулет Әлихан', olympiad = 'Физика', club = 'Авиамодельдеу';

  insert into student_forms(student_id, answers, updated_at)
  values (v_s5, '{
    "father_name": "Дәулет Арман Ерболұлы",
    "mother_name": "Дәулетова Гүлнар Оразқызы",
    "birthday": "2011-06-30",
    "address": "Қостанай қ., Қажымұқан к-сі, 5",
    "nation": "қазақ",
    "doc_number": "N°0891234",
    "iin": "110630504123",
    "hobby": "Физикалық тәжірибелер, дрон ұшыру",
    "sport": "Баскетбол, дзюдо",
    "phone": "+7 771 567 8901",
    "father_phone": "+7 701 999 0011",
    "mother_phone": "+7 707 555 4433",
    "top_gallup": "Restorative, Activator, Competition, Self-Assurance, Maximizer",
    "low_gallup": "Context, Deliberative",
    "mbti": "ESTP"
  }'::jsonb, now())
  on conflict (student_id) do update set answers = excluded.answers, updated_at = now();

  insert into student_roadmaps(student_id, goals, habits, tasks, updated_at)
  values (v_s5,
    '[{"id":"g1","title":"Физикадан ғылыми зерттеу жобасын қорғау","category":"olympiad","metric":"Қалалық кезеңге өту","priority":"high","due_on":"2027-04-10","done":false,"steps":[{"id":"s1","title":"Тақырып бойынша әдебиеттерді зерттеу","done":true},{"id":"s2","title":"Тәжірибелік қондырғы жинау","done":false}],"created_at":"2026-11-01T10:00:00Z"}]'::jsonb,
    '[{"id":"h1","title":"Ағылшынша терминдер (күніне 5 сөз)","category":"study","target_val":"5 сөз","time_of_day":"morning","frequency":"daily","motivation":"Халықаралық әдебиеттерді еркін оқу","goal_id":"g1","archived":false,"checks":["2026-11-03","2026-11-02","2026-11-01","2026-10-31"],"created_at":"2026-10-20T10:00:00Z"}]'::jsonb,
    '[]'::jsonb,
    now()
  )
  on conflict (student_id) do update set goals = excluded.goals, habits = excluded.habits, tasks = excluded.tasks, updated_at = now();

  -- 9. Sample meetings for Student 1
  insert into mentor_meetings(class_id, student_id, staff_id, starts_at, topic, visible, actions, notes, done_at)
  values
    (v_class_id, v_s1, v_teacher_id, now() - interval '7 days', 'Олимпиадаға дайындық және кесте', true, 'Күн сайын 2 есеп шығару бекітілді.', 'Қабілеті жоғары, ынтасы зор.', now() - interval '7 days'),
    (v_class_id, v_s1, v_teacher_id, now() + interval '5 days', '1-тоқсан қорытындысы мен мақсаттарды талқылау', true, null, null, null)
  on conflict do nothing;

  return json_build_object(
    'ok', true,
    'school_id', v_school_id,
    'class_id', v_class_id,
    'class_name', p_class_name,
    'students_count', 5
  );
end;
$$;

revoke execute on function seed_demo_class from public, anon;
grant execute on function seed_demo_class to authenticated;
