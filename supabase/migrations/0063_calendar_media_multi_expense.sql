-- 0063: link class photos to calendar events and allow multiple wallets per event.
-- Run this migration in the Supabase SQL Editor before testing multi-wallet expenses.

alter table class_event_expenses
  add column if not exists id uuid default gen_random_uuid();

update class_event_expenses
set id = gen_random_uuid()
where id is null;

alter table class_event_expenses
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.class_event_expenses'::regclass
    and contype = 'p';

  if pk_name is not null then
    execute format('alter table public.class_event_expenses drop constraint %I', pk_name);
  end if;

  alter table public.class_event_expenses
    add constraint class_event_expenses_pkey primary key (id);
end $$;

create unique index if not exists class_event_expenses_event_wallet
  on class_event_expenses(event_id, wallet_id);
