-- 0038: crashes in the app are written here so they can be fixed without asking for screenshots.
create table client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  message text not null check (length(message) <= 2000),
  stack text check (length(stack) <= 8000),
  path text check (length(path) <= 300),
  ua text check (length(ua) <= 400),
  created_at timestamptz not null default now()
);
alter table client_errors enable row level security;
-- write-only from the app; read in the SQL editor
create policy client_errors_insert on client_errors for insert to authenticated with check (user_id = auth.uid());
