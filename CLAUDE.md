# CLAUDE.md — FUL PathFinder

This file is loaded automatically by Claude Code. Read it fully before doing anything.

## What we are building

A campus navigation web app for **Federal University Lokoja (FUL)**. Think "Google Maps for FUL," inspired by AMAP. A user can search for a place on campus, see it on the map, and get a walking route with distance and estimated time.

**MVP scope is the Felele (permanent site) campus only.** The Adankolo campus is future work. Do not build it into the MVP.

The core deliverable, and the part that carries the most academic weight, is the routing: a shortest-path finder (A*) running over a path network that the team surveys by hand. The name is PathFinder for a reason. Treat routing as the centrepiece, not an afterthought.

## Golden rules (do not break these)

1. **Free tools only.** No paid API keys, no billing, no credit card. If a task looks like it needs a paid service, STOP and tell the user before continuing.
2. **No Google Maps and no Mapbox.** Use MapLibre GL JS with Protomaps PMTiles. This is non-negotiable and is the reason the project stays free.
3. **Mobile first.** Almost every user is on a phone, walking, on a weak campus network. Design and test for that first, desktop second.
4. **Ship the MVP path first:** search a place, view it, route to it. Everything else (both campuses, indoor maps, live crowd data, accounts) is future work. Resist scope creep and say so if the user drifts.
5. **Work one task at a time.** Open `docs/ROADMAP.md`, do the next unchecked task only, then stop and report. Do not race ahead across multiple days in one go.
6. **Keep changes surgical.** Small diffs. Ask before adding any new dependency or changing the stack.

## Stack

- Frontend: **React + Vite + MapLibre GL JS**
- Base map: **Protomaps PMTiles**, a single static `.pmtiles` file holding a small Lokoja extract, served from `public/map/`
- Database and backend: **Supabase** (Postgres with the PostGIS extension)
- Routing: **our own A\*** over a hand-surveyed graph of nodes and edges, run client side for the MVP (see `docs/ARCHITECTURE.md`)
- Hosting: **Vercel** (frontend), Supabase (database), static hosting for the `.pmtiles` file

## Data model (summary)

Three tables. Full schema and rationale are in `docs/ARCHITECTURE.md`.

- `places`: the points of interest a user searches for (faculties, hostels, admin blocks, eateries, ATMs, landmarks). Has name, category, aliases, description, photo, coordinates, and a link to its nearest graph node.
- `nodes`: vertices of the walking-path graph (path junctions and key points).
- `edges`: connections between two nodes, each carrying a real walking distance in metres. This is what A* traverses.

## How to work in this repo

- Before touching the schema or the routing code, read `docs/ARCHITECTURE.md`.
- The field survey (walking the campus to collect places and paths) is done by humans, not by you. When a task needs that data and it is not present yet, read `docs/SURVEY-GUIDE.md` and tell the user exactly what to collect and in what format, then pause.
- After you finish a task: tick its checkbox in `docs/ROADMAP.md` and append one line to `PROGRESS.md` (date, what changed, anything the user must do next).
- Never invent campus data. If real surveyed coordinates are missing, use clearly labelled placeholder data and flag it, so nobody ships fake buildings.

## Writing conventions for any docs or reports you generate

- No em dashes anywhere. Use commas, colons, or parentheses instead.
- Plain, direct prose. No decorative filler.

## Commands

- `npm run dev` — start the dev server (Vite, default port 5173)
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build locally
- `npm run lint` — lint with oxlint

Supabase project: `ful-pathfinder` (ref `qvwgeowgidwzyaztyhdu`, region `eu-west-1`, free tier), in the "theklvr's Org" organization. Schema lives in `supabase/migrations/`; seed scripts in `supabase/seed/`. Requires a local `.env` (see `.env.example`) with the project URL and anon/publishable key, not committed.

`public/map/felele.pmtiles` was produced with the [go-pmtiles CLI](https://github.com/protomaps/go-pmtiles) (not an npm dependency, install separately), extracting bbox `6.60,7.75,6.82,7.92` at zoom 0-15 from a Protomaps daily planet build via HTTP range requests:
```
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles public/map/felele.pmtiles --bbox=6.60,7.75,6.82,7.92 --maxzoom=18
```
Re-run with a newer date or a wider bbox if the region needs to grow.
