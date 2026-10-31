-- 0060: books and films get a type (film, series, anime, cartoon · book, comic, manga, audiobook, magazine),
-- series a number of seasons, and everyone a 1–5 star rating, per season too.

alter table class_media add column if not exists format text check (format is null or format in ('movie', 'series', 'anime', 'cartoon', 'book', 'comic', 'manga', 'audio', 'magazine')),
  add column if not exists seasons smallint check (seasons is null or seasons between 1 and 50);

-- season ratings as {"1": 5, "2": 4}: season numbers 1–50, stars 1–5
create or replace function valid_season_stars(j jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'object' and not exists (select 1 from jsonb_each(j) e
    where e.key !~ '^[1-9][0-9]?$' or e.key::int > 50 or jsonb_typeof(e.value) <> 'number' or e.value::numeric not in (1, 2, 3, 4, 5))
$$;
alter table media_progress add column if not exists rating smallint check (rating is null or rating between 1 and 5),
  add column if not exists season_stars jsonb not null default '{}' check (valid_season_stars(season_stars));
