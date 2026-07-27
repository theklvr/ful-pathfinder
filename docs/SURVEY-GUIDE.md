# SURVEY-GUIDE.md — FUL PathFinder

The map is only as good as the data you walk out and collect. Claude Code cannot do this part. This guide tells the team what to gather and, crucially, the exact two file formats the build expects back.

Start this on calendar day one and run it in parallel with the build. It is the slowest part of the project, so do not save it for last.

## What you are collecting

1. **Places:** every building and landmark students care about (faculties, departments, hostels, admin blocks, the library, eateries, ATMs, the gate, the clinic, sports areas). For each: a name, a category, the local nicknames, and its GPS coordinate.
2. **Paths:** the walking network. Every footpath and road, captured as GPS tracks by physically walking them.

## Tools (all free)

- A **GPS logger app** on any Android phone (for example, "GPS Logger for Android") to record path tracks as you walk, and to drop waypoints for places.
- A phone camera for one photo per place.
- **Google Earth** or **QGIS** (free desktop) to trace anything you could not walk, using satellite imagery, and to tidy coordinates.
- Optional but valuable: add the same data to OpenStreetMap using the free **StreetComplete** or **Vespucci** app. This improves the real map, gives you a legitimate contribution to cite in the report, and you can pull it back for free.

## How to survey efficiently

- Split the campus into zones and assign one person per zone. Everyone surveys in week one.
- For a place: stand at its main entrance, drop a waypoint, note the name, pick a category, note nicknames, take one photo.
- For a path: start the tracker, walk the whole path at a steady pace, stop the tracker, label the track. Capture the real shortcuts students use, not only the vehicle roads.
- Where two paths meet, make sure a track point exists at the junction. Junctions become graph nodes, so missing junctions mean broken routes.

## The two files the build needs

Deliver these to the repo. The build's seed scripts read exactly these shapes.

### 1. `places.csv`

One row per place. Columns, in this order:

```
name,category,aliases,description,photo_url,lat,lng
```

- `category` is one of: `faculty`, `hostel`, `admin`, `eatery`, `atm`, `landmark`, `service`, `health`, `sport`.
- `aliases` is nicknames separated by a semicolon, for example `SUB;Student Union`.
- `photo_url` can be left blank for now.
- `lat` and `lng` are decimal degrees, for example `7.8012`, `6.7431`.

Example rows:

```
name,category,aliases,description,photo_url,lat,lng
Faculty of Science,faculty,FoS;Science,Main science faculty building,,7.8014,6.7429
Student Union Building,landmark,SUB;Student Union,Central student hub,,7.8009,6.7435
Main Gate,landmark,Gate;Entrance,Felele campus main entrance,,7.7998,6.7440
```

### 2. `network.geojson`

The walking-path graph as GeoJSON. Two kinds of features:

- **Nodes:** `Point` features. Each needs a unique `id` in its properties.
- **Edges:** `LineString` features connecting exactly two node coordinates, with `source` and `target` in properties matching node ids, plus an optional `path_type` (`walkway`, `road`, or `stairs`).

You do not have to hand-write this. The normal flow is: record tracks, export them from the GPS app as GPX or GeoJSON, import into QGIS or geojson.io, snap the ends together at junctions, assign node ids, then export. If that is too fiddly, hand the raw tracks to Claude Code and ask it to help convert them into this shape.

Minimal example:

```json
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "properties": { "id": 1 },
      "geometry": { "type": "Point", "coordinates": [6.7440, 7.7998] } },
    { "type": "Feature", "properties": { "id": 2 },
      "geometry": { "type": "Point", "coordinates": [6.7435, 7.8009] } },
    { "type": "Feature", "properties": { "source": 1, "target": 2, "path_type": "walkway" },
      "geometry": { "type": "LineString", "coordinates": [[6.7440, 7.7998], [6.7435, 7.8009]] } }
  ]
}
```

Note the coordinate order in GeoJSON is `[lng, lat]`, the reverse of how you say it out loud. The seed script accounts for this, but keep it consistent in the file.

## Quality checklist before handing data to the build

- [ ] Every place has a real coordinate, a category from the allowed list, and its common nicknames.
- [ ] Every path junction has a node, and edges only connect nodes that exist.
- [ ] The network is connected: you can trace a path from the main gate to any building without a gap.
- [ ] Coordinates look right when dropped on geojson.io (they land on campus, not in the ocean, which usually means lat and lng got swapped).
