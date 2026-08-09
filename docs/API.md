# FUL PathFinder API

For other projects (a chatbot, an exam-venue platform) that want to reuse this project's campus data or routing. Both are public and read-only — no API key or account needed beyond what's documented below.

## Campus places (already exists, no new code)

Supabase auto-generates a REST API for every table. `places`, `nodes`, and `edges` are all public-read (see `supabase/migrations/20260727214200_initial_schema.sql`), so you can query them directly:

```
GET https://qvwgeowgidwzyaztyhdu.supabase.co/rest/v1/places
apikey: <the anon key>
```

The anon key is not a secret — it's the same key shipped in this app's own browser bundle (`VITE_SUPABASE_ANON_KEY` in `.env`); Row Level Security, not key secrecy, is what protects the data. Ask the FUL PathFinder team for the current value, or find it in the deployed app's bundle.

Examples (PostgREST query syntax — see [postgrest.org](https://postgrest.org/en/stable/references/api/tables_views.html)):

```
# All places
GET /rest/v1/places?select=*

# Search by name (case-insensitive substring)
GET /rest/v1/places?name=ilike.*library*

# Only faculties
GET /rest/v1/places?category=eq.faculty

# One place by id, specific columns
GET /rest/v1/places?id=eq.12&select=name,category,description,lat,lng,photo_url
```

Each place has: `id, name, category, aliases (text[]), description, photo_url, lat, lng, nearest_node_id`. Categories: `faculty, hostel, admin, eatery, atm, landmark, service, health, sport`.

## Walking directions

```
GET https://<this app's deployment>/api/route?from=<place name or "lat,lng">&to=<place name or "lat,lng">&unit=metric|imperial
```

`from`/`to` each accept either a known place name (or alias, case-insensitive) or a raw `"lat,lng"` pair (e.g. a student's live GPS position, or an exam venue's coordinates). Runs the same A* routing this app uses client-side.

**Example:**
```
GET /api/route?from=School Gate&to=Library
```
```json
{
  "origin": { "name": "School Gate", "lat": 7.853434, "lng": 6.6841912 },
  "destination": { "name": "Library", "lat": 7.858, "lng": 6.684 },
  "distanceMeters": 1861,
  "distanceLabel": "1.9 km",
  "walkMinutesLabel": "24 min",
  "path": [{ "lat": 7.8534, "lng": 6.6842 }, "..."],
  "steps": [
    { "text": "Head out from School Gate.", "kind": "start" },
    { "text": "Turn right after 1.5 km, past Bus Stop.", "kind": "right" },
    { "text": "Arrive at Library.", "kind": "arrive" }
  ]
}
```

**Errors:** `400` if `from`/`to` are missing, `404` if a name doesn't match a known place (or matches more than one — ambiguous names aren't guessed) or no walking route exists between the two points.

This only covers Felele campus (MVP scope — see `CLAUDE.md`).

## Not available yet

An MCP server (so an LLM can call this as a tool directly, rather than a backend hitting the REST endpoints above) is planned as a follow-up once the REST API above is in real use — not built yet.
