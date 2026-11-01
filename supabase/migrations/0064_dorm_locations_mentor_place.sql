-- 0064: dorm locations in resource groups & rooms, place for mentor meetings.
-- Run in the Supabase SQL Editor if applying to an existing deployment.

-- 1. Add place to mentor_meetings
alter table mentor_meetings
  add column if not exists place text check (place is null or length(trim(place)) <= 120);

-- 2. Update my_mentor_meetings RPC function to include place
drop function if exists my_mentor_meetings();
create or replace function my_mentor_meetings()
returns table(id uuid, starts_at timestamptz, topic text, actions text, done_at timestamptz, staff_name text, place text)
language sql stable security definer set search_path = public as $$
  select m.id, m.starts_at, m.topic, m.actions, m.done_at, p.full_name, m.place
  from mentor_meetings m
  left join profiles p on p.id = m.staff_id
  where m.student_id = auth.uid() and m.visible
  order by m.starts_at desc limit 100
$$;

revoke execute on function my_mentor_meetings from public, anon;
grant execute on function my_mentor_meetings to authenticated;

-- 3. Seed 'Жатақхана орындары' group and rooms for each school
do $$
declare
  s uuid; g uuid; adm uuid; x record;
begin
  for s in select id from schools loop
    select id into adm from profiles where school_id = s and role = 'admin' limit 1;
    if adm is null then
      select id into adm from profiles where school_id = s and role in ('deputy', 'class_teacher', 'teacher') limit 1;
    end if;
    if adm is not null then
      insert into resource_groups (school_id, name, sort)
        values (s, 'Жатақхана орындары', 5)
        on conflict (school_id, name) do update set sort = excluded.sort
        returning id into g;
      if g is null then
        select id into g from resource_groups where school_id = s and name = 'Жатақхана орындары';
      end if;

      for x in select * from (values
        ('Ыбырай бөлмесі', 'Ыбырай бөлмесі', 15, 'open', 'all'),
        ('2-қабат шай бөлмесі', 'Шай бөлмесі', 10, 'open', 'all'),
        ('3-қабат шай бөлмесі', 'Шай бөлмесі', 10, 'open', 'all'),
        ('4-қабат шай бөлмесі', 'Шай бөлмесі', 10, 'open', 'all'),
        ('2-қабат оқу/этюд залы', 'Оқу/этюд залы', 25, 'open', 'all'),
        ('3-қабат оқу/этюд залы', 'Оқу/этюд залы', 25, 'open', 'all'),
        ('4-қабат оқу/этюд залы', 'Оқу/этюд залы', 25, 'open', 'all')
      ) v(name, title, cap, mode, audience) loop
        if not exists (select 1 from resources where school_id = s and name = x.name) then
          insert into resources (school_id, group_id, name, title, capacity, manager_id, managers, mode, audience)
            values (s, g, x.name, x.title, x.cap, adm, array[adm], x.mode, x.audience);
        end if;
      end loop;
    end if;
  end loop;
end $$;
