-- «Рецепттер» in Сынып ресурстары (replaces «Шараға тізім» in the UI; class_lists stays for old data).
-- A recipe has ingredients (amount, unit, price for that amount), steps (one per line) and #tags.
-- An event links to a recipe through class_events.linked_kind = 'recipe'.

create table class_recipes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  servings int not null default 1 check (servings between 1 and 500),
  steps text not null default '' check (length(steps) <= 5000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  photo text,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index class_recipes_class on class_recipes(class_id);

create table class_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references class_recipes(id) on delete cascade,
  pos int not null default 0,
  name text not null check (length(trim(name)) between 1 and 120),
  amount numeric(10, 2) check (amount is null or amount > 0),
  unit text check (length(unit) <= 20),
  price numeric(12, 2) not null default 0 check (price >= 0)
);
create index class_recipe_items_recipe on class_recipe_items(recipe_id);

alter table class_recipes enable row level security;
alter table class_recipe_items enable row level security;
create policy cr_read on class_recipes for select using (class_member(class_id));
create policy cr_write on class_recipes for all using (class_council(class_id)) with check (class_council(class_id));
create policy cri_read on class_recipe_items for select using (exists (select 1 from class_recipes r where r.id = recipe_id and class_member(r.class_id)));
create policy cri_write on class_recipe_items for all
  using (exists (select 1 from class_recipes r where r.id = recipe_id and class_council(r.class_id)))
  with check (exists (select 1 from class_recipes r where r.id = recipe_id and class_council(r.class_id)));
