-- 0027: canteen menu per day and meal; duty class per weekday.
create table menus (
  school_id uuid not null references schools(id) default my_school(),
  on_date date not null,
  meal text not null check (meal in ('breakfast','lunch','snack','dinner')),
  items text not null check (length(items) between 1 and 1000),
  updated_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (school_id, on_date, meal)
);
alter table menus enable row level security;
create policy menu_read on menus for select to authenticated using (school_id = my_school());
-- shortcut: any staff member may edit the menu (no canteen role yet); add a canteen flag if misuse appears
create policy menu_write on menus for all to authenticated using (school_id = my_school() and is_staff())
  with check (school_id = my_school() and is_staff());

alter table duty_roster add column class_id uuid references classes(id) on delete set null;

create function set_duty_class(p_weekday int, p_class uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_deputy() then raise exception 'Кестені тек орынбасар өзгертеді'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and school_id = my_school()) then raise exception 'Сыныпты таңдаңыз'; end if;
  insert into duty_roster (school_id, weekday, class_id) values (my_school(), p_weekday, p_class)
    on conflict (school_id, weekday) do update set class_id = excluded.class_id;
end $$;
revoke execute on function set_duty_class from public, anon;
grant execute on function set_duty_class to authenticated;
