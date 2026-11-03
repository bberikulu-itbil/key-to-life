-- 0075: Seed activity_history and favorite_subjects for demo students

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
    update student_forms set answers = answers || '{
      "favorite_subjects": "Информатика, Математика, Ағылшын тілі, Робототехника",
      "activity_history": "[{\"id\":\"act-s1-1\",\"kind\":\"olympiad\",\"title\":\"Информатикадан олимпиадалық резерв\",\"mentor\":\"Әбенова Айгерім\",\"start_date\":\"2024-09\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Облыстық кезеңге жолдама (1-орын)\",\"notes\":\"Аптасына 3 рет C++ алгоритмдерімен дайындық\"},{\"id\":\"act-s1-2\",\"kind\":\"club\",\"title\":\"Алгоритмдер және Codeforces үйірмесі\",\"mentor\":\"Лицей IT орталығы\",\"start_date\":\"2024-10\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Рейтинг 1400+\",\"notes\":\"Динамикалық бағдарламалау тақырыптары\"},{\"id\":\"act-s1-3\",\"kind\":\"section\",\"title\":\"Шахмат секциясы\",\"mentor\":\"Қалалық шахмат клубы\",\"start_date\":\"2022-09\",\"end_date\":\"2024-05\",\"is_current\":false,\"achievement\":\"2-ересектер разряды\",\"notes\":\"Лицей біріншілігінде 1-орын алған\"},{\"id\":\"act-s1-4\",\"kind\":\"course\",\"title\":\"Робототехника және Arduino\",\"mentor\":\"Технопарк\",\"start_date\":\"2023-01\",\"end_date\":\"2023-12\",\"is_current\":false,\"achievement\":\"RoboLand жарысының финалисі\",\"notes\":\"Автономды робот жобасын қорғады\"}]"
    }'::jsonb where student_id = v_s1;
  end if;

  if v_s2 is not null then
    update student_forms set answers = answers || '{
      "favorite_subjects": "Математика, Физика, Сызу, Робототехника",
      "activity_history": "[{\"id\":\"act-s2-1\",\"kind\":\"olympiad\",\"title\":\"Математикадан олимпиадалық дайындық\",\"mentor\":\"Қасымов Ерлан\",\"start_date\":\"2024-09\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Қалалық олимпиада 2-орын\",\"notes\":\"Геометрия және комбинаторика есептері\"},{\"id\":\"act-s2-2\",\"kind\":\"club\",\"title\":\"Робототехника және 3D модельдеу үйірмесі\",\"mentor\":\"Технопарк\",\"start_date\":\"2023-09\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Arduino метеостанция жобасы\",\"notes\":\"Лицейге арналған сенсорлық станция жасауда\"},{\"id\":\"act-s2-3\",\"kind\":\"section\",\"title\":\"Үстел теннисі секциясы\",\"mentor\":\"Қанатұлы Д.\",\"start_date\":\"2023-02\",\"end_date\":\"2024-05\",\"is_current\":false,\"achievement\":\"Спартакиада жүлдегері\",\"notes\":\"Қалалық жасөспірімдер турниріне қатысқан\"}]"
    }'::jsonb where student_id = v_s2;
  end if;

  if v_s3 is not null then
    update student_forms set answers = answers || '{
      "favorite_subjects": "Биология, Химия, Қазақ әдебиеті, Ағылшын тілі",
      "activity_history": "[{\"id\":\"act-s3-1\",\"kind\":\"olympiad\",\"title\":\"Биология олимпиадасы\",\"mentor\":\"Биология кафедрасы\",\"start_date\":\"2024-09\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Аудандық кезең 1-орын\",\"notes\":\"Цитология және генетика бағыты\"},{\"id\":\"act-s3-2\",\"kind\":\"club\",\"title\":\"Дебат клубы және шешендік өнер\",\"mentor\":\"Лицей дебат орталығы\",\"start_date\":\"2023-10\",\"end_date\":null,\"is_current\":true,\"achievement\":\"«Үздік спикер» дипломы\",\"notes\":\"Қалалық турнирдің жартылай финалисі\"},{\"id\":\"act-s3-3\",\"kind\":\"section\",\"title\":\"Волейбол секциясы\",\"mentor\":\"Спорт кешені\",\"start_date\":\"2022-09\",\"end_date\":\"2024-05\",\"is_current\":false,\"achievement\":\"Лицей кубогының жүлдегері\",\"notes\":\"Сынып командасының капитаны\"}]"
    }'::jsonb where student_id = v_s3;
  end if;

  if v_s4 is not null then
    update student_forms set answers = answers || '{
      "favorite_subjects": "Физика, Алгебра, География, Дүниежүзі тарихы",
      "activity_history": "[{\"id\":\"act-s4-1\",\"kind\":\"olympiad\",\"title\":\"Физика олимпиадасына дайындық\",\"mentor\":\"Физика мұғалімі\",\"start_date\":\"2024-09\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Қалалық кезең 3-орын\",\"notes\":\"Механика және термодинамика бөлімдері\"},{\"id\":\"act-s4-2\",\"kind\":\"club\",\"title\":\"Астрономия және космонавтика үйірмесі\",\"mentor\":\"Жас ғалымдар клубы\",\"start_date\":\"2024-01\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Ғылыми жоба қорғау кезеңінде\",\"notes\":\"Телескоппен бақылау жұмыстары\"},{\"id\":\"act-s4-3\",\"kind\":\"course\",\"title\":\"IT сауаттылық және Python\",\"mentor\":\"Онлайн академия\",\"start_date\":\"2023-06\",\"end_date\":\"2023-12\",\"is_current\":false,\"achievement\":\"Сертификат (Grade A)\",\"notes\":\"Базалық бағдарламалау курсы\"}]"
    }'::jsonb where student_id = v_s4;
  end if;

  if v_s5 is not null then
    update student_forms set answers = answers || '{
      "favorite_subjects": "Қазақстан тарихы, Құқық негіздері, География, Ағылшын тілі",
      "activity_history": "[{\"id\":\"act-s5-1\",\"kind\":\"olympiad\",\"title\":\"Қазақстан тарихы олимпиадасы\",\"mentor\":\"Тарих пәні бірлестігі\",\"start_date\":\"2024-09\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Мектепішілік 1-орын\",\"notes\":\"Қазақ хандығы кезеңі бойынша тереңдетілген дайындық\"},{\"id\":\"act-s5-2\",\"kind\":\"club\",\"title\":\"Медиа және журналистика үйірмесі\",\"mentor\":\"Мектеп баспасөз қызметі\",\"start_date\":\"2024-02\",\"end_date\":null,\"is_current\":true,\"achievement\":\"Мектеп газетінің редакторы\",\"notes\":\"Мақалалар мен репортаждар дайындау\"},{\"id\":\"act-s5-3\",\"kind\":\"section\",\"title\":\"Футбол секциясы\",\"mentor\":\"Жаттықтырушы Б.\",\"start_date\":\"2022-09\",\"end_date\":\"2024-05\",\"is_current\":false,\"achievement\":\"Қалалық біріншілік қола жүлдегері\",\"notes\":\"Қорғаушы позициясында ойнаған\"}]"
    }'::jsonb where student_id = v_s5;
  end if;
end $$;
