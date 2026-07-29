# ARCHITECTURE.md — FUL PathFinder

Read this before touching the database schema or the routing code.

## The one big decision: map data

We do NOT draw our own base map, and we do NOT rely on someone else for campus detail. We use a **hybrid**:

- **Base layer (free, from others):** the town of Lokoja, roads, rivers, and general geography come from OpenStreetMap, delivered as a Protomaps PMTiles file. We never redraw this.
- **Campus layer (ours):** every building, footpath, and landmark inside FUL is surveyed by the team and stored in Supabase. This is the data no existing map has, and it is what makes the app useful.
- **Routing (ours):** directions run over our own surveyed path graph, not over OSM roads. This is why we can route across footpaths and shortcuts that no other map knows about.

## Why this stack (so nobody swaps it for a paid one later)

- **MapLibre GL JS** is the open-source fork of Mapbox GL JS. It needs no token and has no usage cap or bill. Google Maps and Mapbox both meter usage and require billing, so they are banned here.
- **Protomaps PMTiles** is a single static file that contains vector map tiles. It is served from ordinary static hosting over HTTP range requests, so there is no tile server to run and nothing to pay for. We extract just the Lokoja area, so the file is small (a few MB, not gigabytes).
- **Supabase** gives us Postgres with PostGIS (spatial queries) plus an instant auto-generated API, on a free tier. Perfect for a small POI set and a path graph.
- **Our own A\*** keeps routing free and server-less for a bounded campus, and it is the strongest thing to demonstrate in a computer science project because we built the algorithm ourselves.

## Folder structure

```
ful-pathfinder/
  CLAUDE.md
  README.md
  PROGRESS.md
  .env.example
  docs/
    ARCHITECTURE.md
    ROADMAP.md
    SURVEY-GUIDE.md
  public/
    map/
      felele.pmtiles        # Lokoja extract (added on Day 2)
  supabase/
    migrations/             # SQL schema
    seed/                   # scripts to load surveyed data
  src/
    main.jsx
    App.jsx
    lib/
      supabase.js           # supabase client
    map/
      MapView.jsx           # MapLibre setup and layers
      style.js              # Protomaps style config
    routing/
      graph.js              # build adjacency list from nodes + edges
      astar.js              # A* implementation
      haversine.js          # distance helper
    data/
      places.js             # queries for places
      network.js            # queries for nodes + edges
    components/
      SearchBar.jsx
      PlaceCard.jsx
      DirectionsPanel.jsx
      CategoryFilter.jsx
```

## Data model

Coordinates use WGS84 (SRID 4326), the standard lat/lng system MapLibre expects.

```sql
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
```

Notes:
- We keep plain `lat`/`lng` columns for simplicity and because MapLibre wants raw coordinates. PostGIS is available if we later want spatial queries (nearest place, radius search), but it is not required for the MVP.
- `distance_m` is computed from the two node coordinates with the haversine formula at seed time, so routing never has to recompute it.

## Routing design

The graph is small (a campus, likely a few hundred nodes at most), so for the MVP we run routing **client side**: fetch all nodes and edges once, build an adjacency list in the browser, and run A*. No server compute, no cost. If the graph ever grows too large, this moves to a Supabase edge function without changing the algorithm.

Flow when the user asks for directions:

1. Snap the start place and destination place to their `nearest_node_id`.
2. Run A* from start node to destination node. Edge weight is `distance_m`. The heuristic is the haversine straight-line distance from the current node to the goal (admissible, so A* stays optimal).
3. Return the ordered list of nodes. Draw it as a highlighted line on the map.
4. Total distance is the sum of edge weights. Estimated walking time is distance divided by about 1.3 metres per second (average walking pace).
5. Build simple step text by walking the node list and naming nearby places ("continue past the Library, arrive at Faculty of Science").

Reference shape for `astar.js` (implement and test properly on Day 8):

```js
// graph: Map<nodeId, Array<{ to, weight }>>
// coords: Map<nodeId, { lat, lng }>
// h(a, b): haversine distance between two node ids, used as the heuristic
export function astar(graph, coords, start, goal, h) {
  const open = new MinHeap();            // priority queue by fScore
  const gScore = new Map([[start, 0]]);
  const cameFrom = new Map();
  open.push(start, h(start, goal));

  while (!open.isEmpty()) {
    const current = open.pop();
    if (current === goal) return reconstruct(cameFrom, current);
    for (const { to, weight } of graph.get(current) ?? []) {
      const tentative = gScore.get(current) + weight;
      if (tentative < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentative);
        open.push(to, tentative + h(to, goal));
      }
    }
  }
  return null; // no path
}
```

Dijkstra is the same code with the heuristic set to zero. Keep a Dijkstra fallback for testing and to prove A* returns the same optimal path, faster.

## Environment variables

Never commit real keys. `.env.example` lists the names only:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The Supabase anon key is safe for the browser because access is controlled by Row Level Security. Turn on RLS and add read-only public policies for `places`, `nodes`, and `edges` before deploying.

## Accuracy note to keep expectations honest

Consumer phone GPS is accurate to roughly 5 to 15 metres. On a tight campus that can place a user on the wrong footpath. The app must let the user drag or re-pick their start point. State this limitation plainly in the report rather than pretending the fix does not exist.
