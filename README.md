# FUL PathFinder

A free, mobile-first campus navigation web app for Federal University Lokoja (Felele campus). Search a place, see it, get a real walking route with live turn-by-turn guidance. Inspired by AMAP, built entirely on free tools — no paid APIs, no billing.

**Live:** https://ful-pathfinder-klvr.vercel.app

## What it does

- **Search** any of the 47 surveyed campus places by name or nickname.
- **See it** on a real basemap (OpenStreetMap via Protomaps), colour-coded by category.
- **Get directions**: a hand-built A* router runs over a hand-surveyed footpath network (133 nodes, 139 edges) — not straight-line guessing, the actual paths students walk.
- **Live navigation**: hit "Start navigation" and it tracks your real GPS position, recomputes the route as you walk, counts down distance to the next turn, and speaks each instruction aloud.
- **Works on a weak connection**: a service worker caches the basemap and campus data, so the map keeps working if the campus network drops mid-use.

See `docs/screenshots/` for real screenshots taken during development and testing.

## Documents

- `CLAUDE.md` — rules and stack. Read first.
- `docs/ARCHITECTURE.md` — the technical design: data model, routing, folder layout.
- `docs/ROADMAP.md` — the day-by-day build plan, with what's done and what's outstanding.
- `docs/SURVEY-GUIDE.md` — how the campus survey data was collected and its file formats.
- `docs/DEMO-SCRIPT.md` — a walkthrough for presenting/demoing the app.
- `PROGRESS.md` — running log of what has been done, day by day.

## Stack (all free)

MapLibre GL JS, Protomaps PMTiles, Supabase (Postgres and PostGIS), React and Vite, our own A* routing (hand-rolled, no routing-engine dependency), deployed on Vercel.

## Getting started

```
npm install
```

Create `.env` (see `.env.example`) with your Supabase project URL and anon/publishable key:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

```
npm run dev       # start the dev server
npm test          # run the A*/Dijkstra routing tests
npm run build     # production build
npm run preview   # serve the production build locally (needed to test the service worker/offline behaviour — it's disabled in dev)
```

To try live navigation locally, open the dev server on a phone (or grant location permission in desktop Chrome), search a place, hit Directions, then Start navigation.

## Project status

Phases A through D (Days 1-14) are built and working: scaffolding, real basemap, Supabase backend, place search and browsing, A*-routed directions with turn-by-turn steps, live GPS navigation with voice guidance, a mobile-first pass, offline resilience, and deployment. See `PROGRESS.md` for the detailed log of each day, including bugs found and fixed along the way.

Two things need action before the deployed app is usable by students — see the latest entries in `PROGRESS.md`:
1. Vercel's Deployment Protection is currently on, blocking anyone without a KLVR Vercel login.
2. Real on-campus testing (GPS accuracy, network conditions, actual phones) hasn't happened yet — that's Day 15.

Future work, deliberately out of MVP scope: the Adankolo campus, indoor maps, accessibility routing, live crowd data, saved favourites, and user accounts.
