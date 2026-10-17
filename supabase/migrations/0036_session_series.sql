-- 0036: sessions added together as a repeating plan share a series id, so the plan can be edited or removed as one
alter table activity_sessions add column series_id uuid;
create index activity_sessions_series on activity_sessions(series_id) where series_id is not null;
