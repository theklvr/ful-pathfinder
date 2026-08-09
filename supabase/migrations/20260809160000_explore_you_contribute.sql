-- Phase 5: Explore / You / Contribute. Adds what the You and Contribute
-- tabs need: edit suggestions for existing places (update details/photo/
-- address, or report a road problem -- reviewed by a human the same
-- low-tech way as place_submissions, never a live write to `places` or the
-- routing graph, so a bad-faith or mistaken edit can't corrupt routing),
-- user-created lists beyond the existing single Favorites table, a visited/
-- timeline log, and home/work on the profile.

create table place_edit_suggestions (
  id                  bigint generated always as identity primary key,
  submitted_by        uuid not null references auth.users(id) on delete cascade,
  place_id            bigint not null references places(id) on delete cascade,
  kind                text not null check (kind in ('details', 'photo', 'address', 'road_report')),
  note                text not null,
  suggested_photo_url text,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderator_note      text,
  created_at          timestamptz default now()
);

alter table place_edit_suggestions enable row level security;

create policy "Users insert their own edit suggestions" on place_edit_suggestions
  for insert with check (auth.uid() = submitted_by);
create policy "Users read their own edit suggestions" on place_edit_suggestions
  for select using (auth.uid() = submitted_by);

-- User-created lists (Favorites already exists as its own table/button --
-- this is for "Want to go", "Saved trips", and anything custom-named).
create table lists (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

create table list_items (
  id         bigint generated always as identity primary key,
  list_id    bigint not null references lists(id) on delete cascade,
  place_id   bigint not null references places(id) on delete cascade,
  created_at timestamptz default now(),
  unique (list_id, place_id)
);

alter table lists enable row level security;
alter table list_items enable row level security;

create policy "Users manage their own lists" on lists for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage items in their own lists" on list_items for all
  using (exists (select 1 from lists where lists.id = list_items.list_id and lists.user_id = auth.uid()))
  with check (exists (select 1 from lists where lists.id = list_items.list_id and lists.user_id = auth.uid()));

-- Visited log, written once per arrival during live navigation (see
-- src/App.jsx's existing arrival-detection effect) -- doubles as the
-- "Timeline" view, just grouped by date client-side.
create table visited_places (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   bigint not null references places(id) on delete cascade,
  visited_at timestamptz default now()
);

alter table visited_places enable row level security;

create policy "Users manage their own visited places" on visited_places for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Home/work, set from the You tab, shown there and offered as quick
-- directions destinations.
alter table profiles add column home_lat double precision;
alter table profiles add column home_lng double precision;
alter table profiles add column home_label text;
alter table profiles add column work_lat double precision;
alter table profiles add column work_lng double precision;
alter table profiles add column work_label text;
