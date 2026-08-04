-- Phase 3: accounts. User rows live in Supabase's built-in auth.users; this
-- only adds what's specific to this app -- saved places and reviews.

create table favorites (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   bigint not null references places(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, place_id)
);

create table reviews (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   bigint not null references places(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz default now(),
  unique (user_id, place_id)
);

alter table favorites enable row level security;
alter table reviews enable row level security;

-- Reviews are public read (so ratings show to everyone browsing), but only
-- the author can write, change, or delete their own.
create policy "Public read access" on reviews for select using (true);
create policy "Users manage their own reviews" on reviews for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Favorites are private to the owner -- no reason for anyone else to read them.
create policy "Users manage their own favorites" on favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
