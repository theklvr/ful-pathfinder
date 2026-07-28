-- Enable PostGIS once per Supabase project
create extension if not exists postgis;

-- Points of interest the user searches for
create table places (
  id          bigint generated always as identity primary key,
  name        text not null,
  category    text not null,           -- faculty | hostel | admin | eatery | atm | landmark | service | health | sport
  aliases     text[] default '{}',     -- local names: 'SUB', 'New Hall', 'Senate'
  description text,
  photo_url   text,
  lat         double precision not null,
  lng         double precision not null,
  nearest_node_id bigint,              -- filled in when the graph exists (Day 7)
  created_at  timestamptz default now()
);

-- Vertices of the walking-path graph
create table nodes (
  id   bigint generated always as identity primary key,
  lat  double precision not null,
  lng  double precision not null
);

-- Connections between nodes, weighted by real walking distance
create table edges (
  id            bigint generated always as identity primary key,
  source_node   bigint not null references nodes(id),
  target_node   bigint not null references nodes(id),
  distance_m    double precision not null,   -- metres, computed with haversine
  path_type     text default 'walkway',      -- walkway | road | stairs
  bidirectional boolean default true
);

-- Row Level Security: public read-only access on all three tables
alter table places enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;

create policy "Public read access" on places for select using (true);
create policy "Public read access" on nodes for select using (true);
create policy "Public read access" on edges for select using (true);
