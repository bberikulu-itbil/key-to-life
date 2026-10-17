-- 0033: self sign-up. Login is the ЖСН. The account exists at once but has no profile until approved:
-- a student by the school admin or the class teacher of the chosen class, a teacher only by the admin.
create table registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references schools(id),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role text not null check (role in ('student','teacher')),
  class_id uuid references classes(id) on delete set null,
  title text check (title is null or length(title) <= 120),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text check (note is null or length(note) <= 500),
  decided_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (role <> 'student' or class_id is not null)
);
create index registrations_school on registrations(school_id, status);

create function can_approve_registration(r registrations) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles u where u.id = auth.uid() and u.school_id = r.school_id and u.role = 'admin')
    or (r.role = 'student' and exists (select 1 from classes k where k.id = r.class_id and k.teacher_id = auth.uid()))
$$;

alter table registrations enable row level security;
create policy reg_read on registrations for select to authenticated using (user_id = auth.uid() or can_approve_registration(registrations));

-- the people who can approve hear about a new request
create function registration_notify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(p.id, 'Тіркелу өтініші', new.full_name || case when new.role = 'student' then coalesce(' · ' || (select name from classes where id = new.class_id), '') else ' · мұғалім' end, '/registrations')
  from profiles p where p.school_id = new.school_id
    and (p.role = 'admin' or (new.role = 'student' and p.id = (select teacher_id from classes where id = new.class_id)));
  return new;
end $$;
create trigger registrations_notify after insert on registrations for each row execute function registration_notify();

create function decide_registration(p_user uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r registrations;
begin
  select * into r from registrations where user_id = p_user for update;
  if r.user_id is null then raise exception 'Өтініш табылмады'; end if;
  if not can_approve_registration(r) then raise exception 'Бұл өтінішті шешуге құқығыңыз жоқ'; end if;
  if r.status <> 'pending' then raise exception 'Өтініш шешіліп қойған'; end if;
  if p_approve then
    insert into profiles(id, school_id, full_name, role, class_id, title)
      values (r.user_id, r.school_id, trim(r.full_name), r.role::user_role, case when r.role = 'student' then r.class_id end, r.title);
  elsif length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Бас тарту себебін жазыңыз';
  end if;
  update registrations set status = case when p_approve then 'approved' else 'rejected' end, note = nullif(trim(p_note), ''), decided_by = auth.uid()
    where user_id = p_user;
end $$;

revoke execute on function can_approve_registration, registration_notify, decide_registration from public, anon;
grant execute on function can_approve_registration, decide_registration to authenticated;
