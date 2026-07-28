# PROGRESS.md — FUL PathFinder

A running log. Claude Code appends one line after finishing each task: the date, what changed, and anything the user must do next. Newest at the bottom.

Format: `YYYY-MM-DD | Day N | what changed | user action needed (if any)`

---

- 2026-07-27 | Day 1 | Scaffolded Vite + React app, installed maplibre-gl and pmtiles, created the folder structure from docs/ARCHITECTURE.md, rendered a blank full-screen MapLibre map centred on Felele campus (placeholder coords 7.80, 6.74). | Run `npm run dev` and open the printed local URL to see the map; correct the campus centre once survey data gives real coordinates.
- 2026-07-27 | Fix | Downgraded Vite 8 (experimental rolldown-vite) to Vite 7.3.6 because it crashed resolving maplibre-gl's worker file in dev mode. | None, `npm run dev` works clean now.
- 2026-07-28 | Day 3 (done ahead of Day 2, at user's request) | Created the Supabase project directly via the Supabase MCP tools (org: theklvr's Org, project: ful-pathfinder, region eu-west-1, free tier), applied the places/nodes/edges migration with PostGIS and public-read RLS policies, wired src/lib/supabase.js, and seeded 3 clearly-labelled PLACEHOLDER places (not real survey data). Verified reads work and writes are correctly blocked for the anon key. | `.env` with the real project URL and anon/publishable key was created locally in this session (gitignored, not committed) — recreate it from `.env.example` if setting up on another machine. Delete the placeholder places once docs/SURVEY-GUIDE.md data is imported (Day 4). Still need Day 2 (real Protomaps basemap).
