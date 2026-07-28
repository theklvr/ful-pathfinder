# ROADMAP.md — FUL PathFinder

This is the day-by-day build plan. Each "day" is one focused Claude Code session, not necessarily one calendar day. Do the days in order. Do one day at a time, then stop and let the user test before moving on.

For each day: tick the boxes as you finish, then append a line to `PROGRESS.md`.

A copy-paste prompt is given for each day. The user pastes it into Claude Code to start that day.

**Survey runs in parallel.** The field survey (Days S1 to S3 below) should start on calendar day one and run alongside the build. Routing days (7 to 10) are blocked until survey data exists, so do not leave the survey until the end.

---

## Survey track (humans, in parallel with the build)

See `docs/SURVEY-GUIDE.md` for the how. This is the real bottleneck. Start it immediately.

- [ ] **S1.** Walk Felele campus, record every building and landmark as a waypoint (name, category, photo).
- [ ] **S2.** Walk every footpath and road, recording GPS tracks, so paths reflect where students actually walk.
- [ ] **S3.** Clean the data into the two files the build expects: `places.csv` and `network.geojson` (formats in the survey guide).

---

## Phase A: Foundation

### Day 1: Scaffold the project
- [x] Create a Vite + React app.
- [x] Install `maplibre-gl` and `pmtiles`.
- [x] Create the folder structure from `docs/ARCHITECTURE.md`.
- [x] Render a blank MapLibre map filling the screen, centred on Felele campus (approx lat 7.80, lng 6.74; correct once survey data arrives).
- [x] Add `.env.example`, a `.gitignore`, and fill the Commands section of `CLAUDE.md`.
- [x] First commit.

> Prompt: "Read CLAUDE.md and docs/ARCHITECTURE.md. Do Day 1 in docs/ROADMAP.md: scaffold the Vite + React app, install maplibre-gl and pmtiles, create the folder structure, and render a blank full-screen MapLibre map centred on Felele campus. Then stop and tell me how to run it."

Done when: `npm run dev` shows a blank interactive map.

### Day 2: Real base map of Lokoja
- [x] Install the `pmtiles` CLI (go-pmtiles v1.31.2). Extract a small bounding box around Lokoja town and Felele campus (bbox 6.60,7.75,6.82,7.92, zoom 0-15) from the Protomaps daily build straight off the remote file via HTTP range requests (no full planet download needed) into `public/map/felele.pmtiles` (~2.8 MB).
- [x] Wire the PMTiles protocol into MapLibre and apply a Protomaps basemap style (`@protomaps/basemaps`, light flavor).
- [x] Confirm the map shows Lokoja streets and features, panning and zooming smoothly (verified tile content and a clean dev server run; visually confirm in your browser too).
- [x] Commit.

> Prompt: "Do Day 2: get a small Lokoja Protomaps PMTiles extract into public/map/felele.pmtiles and render it with MapLibre using a Protomaps style. Walk me through any CLI step I need to run myself. Then stop."

Done when: the base map shows real Lokoja geography with no API key.

### Day 3: Supabase schema
- [x] Create the Supabase project (created via the Supabase MCP tools instead of manual signup — see PROGRESS.md).
- [x] Enable PostGIS and create `places`, `nodes`, `edges` per `docs/ARCHITECTURE.md`, as a migration in `supabase/migrations/`.
- [x] Turn on RLS with public read-only policies on the three tables.
- [x] Add the supabase client in `src/lib/supabase.js`, reading keys from env.
- [x] Seed 3 placeholder places (not real survey data yet — see supabase/seed/seed_placeholder_places.sql).
- [x] Commit.

> Prompt: "Do Day 3: create the SQL migration for places, nodes, edges from docs/ARCHITECTURE.md, add RLS read policies, wire the Supabase client, and seed a few test places. I will create the Supabase project and give you the URL and anon key. Then stop."

Done when: the app can fetch places from Supabase.

---

## Phase B: Data and display

### Day 4: Import surveyed places and show them
- [x] Write a seed script in `supabase/seed/` that loads `places.csv` into the `places` table (`supabase/seed/import_places.mjs`; the actual load into the live project was run via the Supabase MCP tools).
- [x] Render every place as a marker on the map, coloured by category (`src/data/categories.js`, wired into `src/map/MapView.jsx`).
- [x] Commit.

> Prompt: "Do Day 4: write a seed script to import places.csv into Supabase, then render all places as category-coloured markers on the map. If places.csv is missing, tell me exactly what columns it needs and pause."

Done when: surveyed places appear on the map by category.

### Day 5: Place detail and category filter
- [x] Clicking a marker opens `PlaceCard`: name, photo, description, and a Directions button (disabled for now — routing is Day 9).
- [x] Add `CategoryFilter` to toggle categories on and off.
- [x] Commit.

> Prompt: "Do Day 5: build the PlaceCard on marker click (name, photo, description, Directions button) and a category filter toggle. Then stop."

Done when: tapping a place shows its details and filtering works.

### Day 6: Search
- [x] Build `SearchBar` that searches `places` by name and by `aliases`.
- [x] Selecting a result flies the map to that place and opens its card.
- [x] Commit.

> Prompt: "Do Day 6: build search over place name and aliases, and fly to the selected result. Then stop."

Done when: a student can find a place by its common nickname.

---

## Phase C: Routing (the core of PathFinder)

### Day 7: Load the path network
- [x] Write a seed script that loads `network.geojson` into `nodes` and `edges`, computing each edge `distance_m` with haversine at load time (`supabase/seed/import_network.mjs`; live load done via the Supabase MCP tools, same approach as Day 4).
- [x] For each place, compute and store `nearest_node_id`.
- [x] Add a debug layer that draws the path network as faint lines so we can eyeball it.
- [x] Commit.

> Prompt: "Do Day 7: seed nodes and edges from network.geojson (compute edge distances via haversine), set each place's nearest_node_id, and add a faint debug layer showing the path network. If network.geojson is missing, tell me its required shape and pause."

Done when: the surveyed path network is visible on the map.

### Day 8: A* implementation
- [x] Implement `haversine.js`, `graph.js` (adjacency list from edges), and `astar.js` per `docs/ARCHITECTURE.md`.
- [x] Add a Dijkstra fallback and a small test that both return the same shortest path on a known example (`npm test`).
- [x] Commit.

> Prompt: "Do Day 8: implement haversine, the adjacency-list graph builder, and A* (with a Dijkstra fallback), plus a test proving they agree on a known route. Then stop."

Done when: A* returns a correct shortest path in a test.

### Day 9: Directions on the map
- [x] Wire the Directions button: choose start (default: School Gate, changeable via a dropdown — live geolocation is Day 11) and destination, run A*, draw the route line.
- [x] Show total distance and estimated walking time in `DirectionsPanel`.
- [x] Commit.

> Prompt: "Do Day 9: connect the Directions flow end to end. Snap start and destination to nearest nodes, run A*, draw the route, and show distance and walk time. Then stop."

Done when: picking two places draws a real walking route with distance and time.

### Day 10: Turn-by-turn steps
- [x] Generate a readable step list from the node path, naming nearby landmarks (`src/routing/steps.js`).
- [x] Show it in `DirectionsPanel`.
- [x] Commit.

> Prompt: "Do Day 10: turn the routed node path into readable turn-by-turn steps that reference nearby places, shown in the directions panel. Then stop."

Done when: the route comes with human-readable directions.

---

## Phase D: Location and polish

### Day 11: You are here (expanded into full live navigation, at user's request)
- [x] Use the browser Geolocation API to show the user's position and let them route from it (`src/location/useLiveLocation.js`, `watchPosition`).
- [x] Let the user drag or re-pick their start point to correct GPS drift (draggable puck marker).
- [x] Beyond the original spec: a real live "Start navigation" mode — top instruction banner (AMAP/Google-Maps style) that auto-recomputes the route from the walker's live position on every GPS update, counts down distance to the next turn, speaks each instruction via the Web Speech API (mute toggle), follows the walker with the camera, and detects arrival. See `src/components/NavBanner.jsx`, `NavBottomBar.jsx`, and the nav state machine in `App.jsx`.
- [x] Visual redesign grounded in Federal University Lokoja's own crest colours (Navy Blue / Sky Blue) plus a deliberate amber accent, rather than generic UI-kit teal.
- [x] Commit.

> Prompt: "Do Day 11: add live geolocation as a start point, with a way to manually correct the start marker for GPS drift. Then stop."

### Day 12: Mobile-first pass
- [x] Make the layout work well on a phone: bottom sheet for cards and directions (draggable handle, swipe-down-to-dismiss via `src/hooks/useSwipeToDismiss.js`), large tap targets (44-48px: category chips, search input, close/end buttons, voice toggle), no desktop-only assumptions. Added a scroll-fade hint on the category chip row.
- [x] Commit.

> Prompt: "Do Day 12: a mobile-first responsive pass (bottom-sheet UI, large tap targets, thumb-reachable controls). Then stop."

### Day 13: Offline and resilience
- [ ] Add a service worker to cache the pmtiles file and place data so the map works on weak campus network.
- [ ] Add loading states and error handling for failed fetches.
- [ ] Commit.

> Prompt: "Do Day 13: add offline caching via a service worker for the map and place data, plus loading and error states. Then stop."

### Day 14: Deploy
- [ ] Deploy the frontend to Vercel and connect the Supabase env vars.
- [ ] Confirm the deployed app works on real phones on campus.
- [ ] Commit.

> Prompt: "Do Day 14: prepare and guide me through deploying to Vercel with Supabase env vars. Give me a checklist to test on my phone on campus. Then stop."

### Day 15: Field-test fixes, demo, and report
- [ ] Fix issues found in real campus testing.
- [ ] Write the README run instructions and gather screenshots for the report.
- [ ] Draft the demo script.
- [ ] Commit.

> Prompt: "Do Day 15: help me fix the issues I found on campus (I will paste them), finalise the README, and outline a demo script and report screenshots. Then stop."

---

## After the MVP (future work, do not build during the MVP)

Adankolo campus, indoor building maps, accessibility routing (avoid stairs), live crowd or event data, saved favourites, and user accounts. List these in the report as future work.
