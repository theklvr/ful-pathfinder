# FUL PathFinder

A free, mobile-first campus navigation web app for Federal University Lokoja. Search a place, see it, get a walking route. Inspired by AMAP, built on open tools.

## How this repo is meant to be used with Claude Code

1. Open this folder in VS Code with Claude Code.
2. Claude Code automatically reads `CLAUDE.md`. That is the project's rulebook.
3. The build runs day by day. Open `docs/ROADMAP.md`, find the next unchecked day, and paste that day's prompt into Claude Code. It does one day, then stops so you can test.
4. Meanwhile, the team surveys the campus following `docs/SURVEY-GUIDE.md`. That produces `places.csv` and `network.geojson`, which the build needs from Day 4 onward.

## Documents

- `CLAUDE.md` — rules and stack. Read first.
- `docs/ARCHITECTURE.md` — the technical design: data model, routing, folder layout.
- `docs/ROADMAP.md` — the day-by-day build plan with a prompt for each day.
- `docs/SURVEY-GUIDE.md` — how to collect campus data and the file formats to deliver.
- `PROGRESS.md` — running log of what has been done.

## Stack (all free)

MapLibre GL JS, Protomaps PMTiles, Supabase (Postgres and PostGIS), React and Vite, own A* routing, deployed on Vercel.

## Getting started

The project is scaffolded on Day 1. Setup and run commands are added to `CLAUDE.md` and here as the build progresses.

## First thing to do

Two things start at once:

1. Kick off the survey (`docs/SURVEY-GUIDE.md`). It is the slowest part.
2. Start Day 1 in Claude Code with the prompt from `docs/ROADMAP.md`.
