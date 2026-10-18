-- 0042: the canteen menu repeats in a 10-school-day cycle (weeks A and B); one picture per cycle day.
create table menu_cycle (
  school_id uuid not null references schools(id),
  day_code text not null check (day_code ~ '^[AB][1-5]$'),   -- A1 = week A Monday … B5 = week B Friday
  title text not null,
  items jsonb not null default '{}',
  image text,                          -- public path in the «menu» bucket
  primary key (school_id, day_code)
);
create table menu_cycle_anchor (
  school_id uuid primary key references schools(id),
  week_a date not null check (extract(isodow from week_a) = 1)   -- a Monday that is week A
);
alter table menu_cycle enable row level security;
alter table menu_cycle_anchor enable row level security;
create policy menu_cycle_read on menu_cycle for select to authenticated using (school_id = my_school());
create policy menu_cycle_anchor_read on menu_cycle_anchor for select to authenticated using (school_id = my_school());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('menu', 'menu', true, 2097152, array['image/jpeg']) on conflict (id) do nothing;
-- used once for the upload of the cycle pictures, then closed (with check false)
create policy menu_upload_once on storage.objects for insert to anon with check (bucket_id = 'menu' and name like 'cycle/%');
alter policy menu_upload_once on storage.objects with check (false);
