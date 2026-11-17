-- Media: series (each part keeps its own status), finish date, and a daily reading log.

alter table class_media add column if not exists series text check (series is null or length(trim(series)) between 1 and 120);
alter table class_media add column if not exists series_no smallint check (series_no is null or series_no between 1 and 999);
create index if not exists class_media_series on class_media(class_id, series) where series is not null;

-- The day a book was read / a film watched; set automatically on «done», editable afterwards.
alter table media_progress add column if not exists finished_on date;
create or replace function media_progress_finished() returns trigger language plpgsql as $$
begin
  if new.state = 'done' and new.finished_on is null and (tg_op = 'INSERT' or old.state is distinct from 'done') then
    new.finished_on := current_date;
  elsif new.state <> 'done' then
    new.finished_on := null;
  end if;
  return new;
end $$;
create or replace trigger media_progress_finished before insert or update of state, finished_on on media_progress
  for each row execute function media_progress_finished();
update media_progress set finished_on = updated_at::date where state = 'done' and finished_on is null;

-- Pages read per day. media_progress.pages_read is kept as the sum of these rows.
create table if not exists media_reading_log (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references class_media(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  on_date date not null default current_date,
  pages int not null check (pages between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists media_reading_log_user on media_reading_log(user_id, on_date);
create index if not exists media_reading_log_media on media_reading_log(media_id);

alter table media_reading_log enable row level security;
-- Own rows; staff of the class; classmates may read (class reading analytics).
create policy mrl_own on media_reading_log for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mrl_staff on media_reading_log for all to authenticated
  using (exists (select 1 from class_media m where m.id = media_id and (class_council(m.class_id) or is_staff())))
  with check (exists (select 1 from class_media m where m.id = media_id and (class_council(m.class_id) or is_staff())));
create policy mrl_read on media_reading_log for select to authenticated using (exists (select 1 from class_media m where m.id = media_id and class_member(m.class_id)));

create or replace function media_reading_sum() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct media_id, user_id from (select new.media_id, new.user_id where tg_op <> 'DELETE' union all select old.media_id, old.user_id where tg_op <> 'INSERT') x loop
    insert into media_progress (media_id, user_id, state, pages_read, updated_at)
    values (r.media_id, r.user_id, 'doing', (select coalesce(sum(pages), 0) from media_reading_log where media_id = r.media_id and user_id = r.user_id), now())
    on conflict (media_id, user_id) do update set pages_read = excluded.pages_read, updated_at = now(),
      -- Reaching the last page marks the book read; logging pages on a «want» book starts it.
      state = case
        when (select pages from class_media where id = r.media_id) <= excluded.pages_read then 'done'
        when media_progress.state = 'want' then 'doing'
        else media_progress.state end;
  end loop;
  return null;
end $$;
create or replace trigger media_reading_sum after insert or update or delete on media_reading_log for each row execute function media_reading_sum();

-- Pages entered before the log existed become one log row, so the sum keeps them.
insert into media_reading_log (media_id, user_id, on_date, pages)
select media_id, user_id, updated_at::date, least(pages_read, 2000) from media_progress where pages_read > 0;
