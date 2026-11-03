-- 0073: Allow 'planned' (want to read) state in media_progress, allow staff to manage student reading progress, and seed books

alter table media_progress drop constraint if exists media_progress_state_check;
alter table media_progress add constraint media_progress_state_check check (state in ('planned', 'want', 'doing', 'done'));

drop policy if exists mp_staff on media_progress;
create policy mp_staff on media_progress for all to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from class_media m
      where m.id = media_progress.media_id
        and (class_council(m.class_id) or is_staff())
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from class_media m
      where m.id = media_progress.media_id
        and (class_council(m.class_id) or is_staff())
    )
  );

-- Sample books and reading status for 7-Демо
do $$
declare
  v_class_id uuid;
  v_teacher_id uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid;
begin
  select id into v_class_id from classes where name = '7-Демо' limit 1;
  if v_class_id is not null then
    select id into v_teacher_id from profiles where school_id = (select school_id from classes where id = v_class_id) and role <> 'student' limit 1;
    select id into v_s1 from auth.users where email in ('110412501234@users.lyceum-life.app', 'demo_sanzhar@users.lyceum-life.app') limit 1;
    select id into v_s2 from auth.users where email in ('110918503456@users.lyceum-life.app', 'demo_nurislam@users.lyceum-life.app') limit 1;
    select id into v_s3 from auth.users where email in ('111125602341@users.lyceum-life.app', 'demo_aruzhan@users.lyceum-life.app') limit 1;

    select id into b1 from class_media where class_id = v_class_id and title = 'Абай жолы (1-том)';
    if b1 is null then
      insert into class_media(class_id, kind, title, author, note, genre, format, approved, proposed_by)
      values (v_class_id, 'book', 'Абай жолы (1-том)', 'Мұхтар Әуезов', 'Қазақ әдебиетінің жауһары', 'novel', 'book', true, v_teacher_id)
      returning id into b1;
    end if;

    select id into b2 from class_media where class_id = v_class_id and title = 'Қара сөздер';
    if b2 is null then
      insert into class_media(class_id, kind, title, author, note, genre, format, approved, proposed_by)
      values (v_class_id, 'book', 'Қара сөздер', 'Абай Құнанбайұлы', 'Өмірлік пәлсапа және тәрбие', 'self', 'book', true, v_teacher_id)
      returning id into b2;
    end if;

    select id into b3 from class_media where class_id = v_class_id and title = 'Шұғаның белгісі';
    if b3 is null then
      insert into class_media(class_id, kind, title, author, note, genre, format, approved, proposed_by)
      values (v_class_id, 'book', 'Шұғаның белгісі', 'Бейімбет Майлин', 'Классикалық қазақ прозасы', 'novel', 'book', true, v_teacher_id)
      returning id into b3;
    end if;

    select id into b4 from class_media where class_id = v_class_id and title = 'Алгоритмдер: құру және қолдану';
    if b4 is null then
      insert into class_media(class_id, kind, title, author, note, genre, format, approved, proposed_by)
      values (v_class_id, 'book', 'Алгоритмдер: құру және қолдану', 'Томас Кормен', 'Информатика олимпиадашыларына негіз', 'science', 'book', true, v_teacher_id)
      returning id into b4;
    end if;

    select id into b5 from class_media where class_id = v_class_id and title = 'Көшпенділер';
    if b5 is null then
      insert into class_media(class_id, kind, title, author, note, genre, format, approved, proposed_by)
      values (v_class_id, 'book', 'Көшпенділер', 'Ілияс Есенберлин', 'Қазақ хандығының тарихы', 'history', 'book', true, v_teacher_id)
      returning id into b5;
    end if;

    select id into b6 from class_media where class_id = v_class_id and title = 'Гарри Поттер және пәлсапа тас';
    if b6 is null then
      insert into class_media(class_id, kind, title, author, note, genre, format, approved, proposed_by)
      values (v_class_id, 'book', 'Гарри Поттер және пәлсапа тас', 'Дж. К. Роулинг', 'Әлемдік бестселлер фэнтези', 'fantasy', 'book', true, v_teacher_id)
      returning id into b6;
    end if;

    if v_s1 is not null then
      insert into media_progress(media_id, user_id, state, updated_at) values (b4, v_s1, 'planned', now()) on conflict (media_id, user_id) do update set state = 'planned';
      insert into media_progress(media_id, user_id, state, updated_at) values (b6, v_s1, 'planned', now()) on conflict (media_id, user_id) do update set state = 'planned';
      insert into media_progress(media_id, user_id, state, updated_at) values (b1, v_s1, 'doing', now()) on conflict (media_id, user_id) do update set state = 'doing';
      insert into media_progress(media_id, user_id, state, rating, review, updated_at) values (b2, v_s1, 'done', 5, 'Өте мазмұнды шығарма', now()) on conflict (media_id, user_id) do update set state = 'done', rating = 5, review = 'Өте мазмұнды шығарма';
    end if;

    if v_s3 is not null then
      insert into media_progress(media_id, user_id, state, updated_at) values (b5, v_s3, 'planned', now()) on conflict (media_id, user_id) do update set state = 'planned';
      insert into media_progress(media_id, user_id, state, updated_at) values (b1, v_s3, 'doing', now()) on conflict (media_id, user_id) do update set state = 'doing';
      insert into media_progress(media_id, user_id, state, rating, review, updated_at) values (b3, v_s3, 'done', 5, 'Керемет лирикалық туынды', now()) on conflict (media_id, user_id) do update set state = 'done', rating = 5;
    end if;
  end if;
end $$;
