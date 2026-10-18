-- 0043: six meals a day, each with its own text and photo; up to 5 students a weekday keep that day's menu right.
alter table menus drop constraint menus_meal_check;
alter table menus add constraint menus_meal_check check (meal in ('breakfast','brunch','lunch','snack','dinner','supper'));
alter table menus drop constraint menus_items_check;
alter table menus add constraint menus_items_check check (length(items) <= 1000);
alter table menus add column photo text check (photo is null or length(photo) <= 200);

-- menu duty: up to 5 students per weekday correct the day's menu when the canteen serves something else
create table menu_duty (
  school_id uuid not null references schools(id) default my_school(),
  weekday int not null check (weekday between 1 and 7),
  students uuid[] not null default '{}' check (coalesce(array_length(students, 1), 0) <= 5),
  primary key (school_id, weekday)
);
alter table menu_duty enable row level security;
create policy menu_duty_read on menu_duty for select to authenticated using (school_id = my_school());

-- staff any day; a duty student only on their weekday, for that same day
create function can_edit_menu(p_date date) returns boolean language sql stable security definer set search_path = public as $$
  select is_staff() or (p_date = school_today(my_school()) and exists (select 1 from menu_duty d
    where d.school_id = my_school() and auth.uid() = any(d.students) and d.weekday = extract(isodow from p_date)::int))
$$;
alter policy menu_write on menus using (school_id = my_school() and can_edit_menu(on_date))
  with check (school_id = my_school() and can_edit_menu(on_date));

-- photos of the day's meals: day/<date>/<meal>-<id>.jpg
create policy menu_day_photo on storage.objects for insert to authenticated
  with check (bucket_id = 'menu' and (storage.foldername(name))[1] = 'day' and can_edit_menu(((storage.foldername(name))[2])::date));

create function set_menu_duty(p_weekday int, p_students uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() then raise exception 'Мәзір кезекшілерін орынбасар немесе әкімші белгілейді'; end if;
  if coalesce(array_length(p_students, 1), 0) > 5 then raise exception 'Бір күнге 5 оқушыдан артық емес'; end if;
  insert into menu_duty (school_id, weekday, students)
    values (my_school(), p_weekday, array(select p.id from profiles p where p.id = any(p_students) and p.school_id = my_school() and p.role = 'student'))
    on conflict (school_id, weekday) do update set students = excluded.students;
end $$;
revoke execute on function can_edit_menu, set_menu_duty from public, anon;
grant execute on function can_edit_menu, set_menu_duty to authenticated;
