// One-off / re-runnable converter: turns a raw Overpass API export of FUL
// Felele campus (buildings, POIs, footpaths) into OSM-derived STAGING files
// — data/osm-places.csv and data/osm-network.geojson. These are NOT the
// canonical data/places.csv / data/network.geojson the seed scripts read;
// run scripts/merge-survey.mjs afterward to fold them into the canonical
// files alongside the existing hand-surveyed data.
//
// Usage: node scripts/convert-survey-osm.mjs
//
// Input: Assets/felele-osm-export.json — the RAW Overpass JSON response
// (elements: [{ type: 'node'|'way', id, lat, lon, tags, nodes }]), not a
// GeoJSON export. Get it from https://overpass-turbo.eu: run the query in
// docs/SURVEY-GUIDE.md, then Export -> "raw data" (NOT "GeoJSON" — the
// GeoJSON export flattens ways to bare coordinate arrays and discards the
// OSM node ids that tell us which ways share a junction).
//
// What it does:
// - Places: building ways and standalone POI nodes tagged with amenity /
//   shop / office / leisure / healthcare / tourism, mapped to this app's
//   fixed 9-category enum. Anything that doesn't map cleanly is flagged for
//   manual verification instead of guessed silently.
// - Paths: footway/path/pedestrian/steps/service/residential/track/
//   unclassified/living_street ways. Ways that share a junction already
//   reference the same OSM node id, so no snapping is needed for that case;
//   a tight defensive union-find pass (2m) catches ways that visually touch
//   in iD but weren't actually snapped to a shared node.
// - Prints a JSON report instead of guessing on anything ambiguous.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OSM_PATH = path.join(ROOT, 'Assets', 'felele-osm-export.json');
const PLACES_OUT = path.join(ROOT, 'data', 'osm-places.csv');
const NETWORK_OUT = path.join(ROOT, 'data', 'osm-network.geojson');

const ALLOWED_CATEGORIES = ['faculty', 'hostel', 'admin', 'eatery', 'atm', 'landmark', 'service', 'health', 'sport'];
const SNAP_METERS = 2; // defensive-only: OSM topology should already be exact

const raw = JSON.parse(readFileSync(OSM_PATH, 'utf8'));
const elements = raw.elements ?? [];

function haversine([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const nodesById = new Map();
const waysById = new Map();
const relationsSkipped = [];

for (const el of elements) {
  if (el.type === 'node') nodesById.set(el.id, el);
  else if (el.type === 'way') waysById.set(el.id, el);
  else if (el.type === 'relation') relationsSkipped.push(el.id);
}

// ---------- Category mapping ----------

function mapCategory(tags) {
  const t = tags ?? {};

  if (t.amenity === 'university' || t.amenity === 'college' || t.building === 'university' || t.building === 'college') {
    return { category: 'faculty' };
  }
  if (t.building === 'dormitory' || t.building === 'hostel' || t.amenity === 'dormitory') {
    return { category: 'hostel' };
  }
  if (t.amenity === 'atm') {
    return { category: 'atm' };
  }
  if (t.amenity === 'bank') {
    return { category: 'service', flag: 'amenity=bank without atm=yes — atm or admin? verify', categoryAmbiguous: true };
  }
  if (['restaurant', 'cafe', 'fast_food', 'food_court'].includes(t.amenity) || ['convenience', 'supermarket', 'bakery'].includes(t.shop)) {
    return { category: 'eatery' };
  }
  if (['pitch', 'sports_centre', 'stadium', 'track'].includes(t.leisure) || t.sport) {
    return { category: 'sport' };
  }
  if (['clinic', 'hospital', 'doctors', 'pharmacy'].includes(t.amenity) || t.healthcare) {
    return { category: 'health' };
  }
  if (t.office === 'government' || t.amenity === 'townhall' || t.building === 'civic' || t.office) {
    return { category: 'admin' };
  }
  if (['police', 'toilets', 'fuel', 'marketplace'].includes(t.amenity) || t.shop) {
    return { category: 'service' };
  }
  if (t.amenity === 'place_of_worship' || t.tourism || t.historic) {
    return { category: 'landmark' };
  }
  return null; // no recognized category-indicating tag
}

function inferFromName(name) {
  const found = ALLOWED_CATEGORIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(name));
  return found.length === 1 ? found[0] : null;
}

function aliasesFromTags(tags) {
  const t = tags ?? {};
  return [t.alt_name, t.old_name, t.short_name]
    .filter(Boolean)
    .flatMap((v) => v.split(';'))
    .map((s) => s.trim())
    .filter(Boolean)
    .join(';');
}

// ---------- Places: building ways + standalone POI nodes ----------

const places = [];
const flaggedPlaces = [];
let unnamedBuildingsSkipped = 0;

function centroidOfWay(way) {
  const ids = way.nodes ?? [];
  const closed = ids.length > 1 && ids[0] === ids[ids.length - 1];
  const usable = closed ? ids.slice(0, -1) : ids;
  const coords = usable.map((id) => nodesById.get(id)).filter(Boolean);
  if (!coords.length) return null;
  const lat = coords.reduce((s, n) => s + n.lat, 0) / coords.length;
  const lon = coords.reduce((s, n) => s + n.lon, 0) / coords.length;
  return { lat, lon };
}

function considerPlace({ tags, lat, lon, sourceKind, sourceId }) {
  const name = (tags.name ?? '').trim();
  const description = tags.description ?? tags.note ?? '';
  const aliases = aliasesFromTags(tags);

  let mapped = mapCategory(tags);
  let categoryInferred = false;

  if (!mapped) {
    if (tags.building) {
      if (!name) {
        unnamedBuildingsSkipped++;
        return;
      }
      const inferred = name ? inferFromName(name) : null;
      if (inferred) {
        mapped = { category: inferred };
        categoryInferred = true;
      } else {
        mapped = { category: 'landmark', flag: 'unmapped generic building, needs a category — defaulted to landmark, verify' };
      }
    } else if (name) {
      const inferred = inferFromName(name);
      mapped = inferred
        ? { category: inferred }
        : { category: 'landmark', flag: 'no recognized category tags, defaulted to landmark' };
      categoryInferred = !!inferred;
    } else {
      return; // no name, no usable tags — nothing to record
    }
  }

  if (!name) {
    flaggedPlaces.push({ sourceKind, sourceId, reason: 'missing name', tags });
    return;
  }

  const entry = { name, category: mapped.category, aliases, description, lat, lng: lon };
  places.push(entry);

  if (mapped.flag) {
    flaggedPlaces.push({ name, sourceKind, sourceId, reason: mapped.flag, categoryAmbiguous: !!mapped.categoryAmbiguous });
  }
  if (categoryInferred) {
    flaggedPlaces.push({ name, sourceKind, sourceId, reason: `category inferred from name ("${mapped.category}") — verify` });
  }
}

// Building footprints for the map's own building layer (public/map/campus-
// buildings.geojson) -- every traced building, named or not, since this is a
// purely visual layer, independent of the searchable places pipeline above.
// It exists because the basemap tile file is a frozen extract from before
// the campus was mapped in OSM, and re-extracting won't pick up fresh edits
// for days (Protomaps builds lag live OSM) -- drawing the shapes ourselves,
// straight from the same export, shows them immediately.
const buildingFeatures = [];

for (const way of waysById.values()) {
  if (!way.tags?.building) continue;
  const ids = way.nodes ?? [];
  if (ids.length < 4 || ids[0] !== ids[ids.length - 1]) continue; // needs a closed ring
  const ring = ids.map((id) => nodesById.get(id)).filter(Boolean).map((n) => [n.lon, n.lat]);
  if (ring.length >= 4) {
    buildingFeatures.push({
      type: 'Feature',
      properties: { name: way.tags.name ?? null },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }

  const c = centroidOfWay(way);
  if (!c) continue;
  considerPlace({ tags: way.tags, lat: c.lat, lon: c.lon, sourceKind: 'way', sourceId: way.id });
}

writeFileSync(
  path.join(ROOT, 'public', 'map', 'campus-buildings.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: buildingFeatures }, null, 2) + '\n',
  'utf8',
);

for (const node of nodesById.values()) {
  if (!node.tags) continue;
  if (node.tags.building) continue; // handled as a way normally; skip stray tagged nodes on buildings
  const hasCategoryTag = ['amenity', 'shop', 'office', 'leisure', 'healthcare', 'tourism'].some((k) => node.tags[k]);
  if (!hasCategoryTag) continue;
  considerPlace({ tags: node.tags, lat: node.lat, lon: node.lon, sourceKind: 'node', sourceId: node.id });
}

// ---------- Paths: highway ways -> node/edge graph ----------

const PATH_TYPE_BY_HIGHWAY = {
  footway: 'walkway',
  path: 'walkway',
  pedestrian: 'walkway',
  living_street: 'walkway',
  steps: 'stairs',
  service: 'road',
  residential: 'road',
  track: 'road',
  unclassified: 'road',
  tertiary: 'road',
  secondary: 'road',
  primary: 'road',
};

const pathWays = [...waysById.values()].filter((w) => w.tags?.highway && w.nodes?.length > 1);

const usedNodeIds = [...new Set(pathWays.flatMap((w) => w.nodes))].filter((id) => nodesById.has(id));

// ---- Defensive snap: union-find over distinct OSM node ids within SNAP_METERS ----
const parent = usedNodeIds.map((_, i) => i);
function find(i) {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}
function union(i, j) {
  const ri = find(i), rj = find(j);
  if (ri !== rj) parent[ri] = rj;
}

for (let i = 0; i < usedNodeIds.length; i++) {
  const a = nodesById.get(usedNodeIds[i]);
  for (let j = i + 1; j < usedNodeIds.length; j++) {
    const b = nodesById.get(usedNodeIds[j]);
    if (haversine([a.lon, a.lat], [b.lon, b.lat]) <= SNAP_METERS) union(i, j);
  }
}

const clusterMembers = new Map();
usedNodeIds.forEach((_, i) => {
  const root = find(i);
  if (!clusterMembers.has(root)) clusterMembers.set(root, []);
  clusterMembers.get(root).push(i);
});

const osmIdToLocalId = new Map();
const localNodeCoords = []; // index 0-based, local id = index + 1
for (const members of clusterMembers.values()) {
  const lat = members.reduce((s, i) => s + nodesById.get(usedNodeIds[i]).lat, 0) / members.length;
  const lon = members.reduce((s, i) => s + nodesById.get(usedNodeIds[i]).lon, 0) / members.length;
  const localId = localNodeCoords.length + 1;
  localNodeCoords.push([Number(lon.toFixed(7)), Number(lat.toFixed(7))]);
  for (const i of members) osmIdToLocalId.set(usedNodeIds[i], localId);
}

const nodesMergedByDefensiveSnap = usedNodeIds.length - clusterMembers.size;

// ---- Edges: consecutive node pairs per way ----

const edges = [];
const seenPairs = new Set();
let degenerateCount = 0;
let unrecognizedHighwayCount = 0;

for (const way of pathWays) {
  let pathType = PATH_TYPE_BY_HIGHWAY[way.tags.highway];
  if (!pathType) {
    pathType = 'walkway';
    unrecognizedHighwayCount++;
  }
  const localIds = way.nodes.map((id) => osmIdToLocalId.get(id)).filter((id) => id != null);
  for (let p = 0; p < localIds.length - 1; p++) {
    const source = localIds[p];
    const target = localIds[p + 1];
    if (source === target) {
      degenerateCount++;
      continue;
    }
    const key = source < target ? `${source}-${target}` : `${target}-${source}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    edges.push({ source, target, pathType });
  }
}

// ---------- Write staging files ----------

const csvHeader = 'name,category,aliases,description,photo_url,lat,lng';
const csvRows = places.map((p) => [p.name, p.category, p.aliases, p.description, '', p.lat, p.lng].map(csvField).join(','));
writeFileSync(PLACES_OUT, [csvHeader, ...csvRows].join('\n') + '\n', 'utf8');

const nodeFeatures = localNodeCoords.map((coord, idx) => ({
  type: 'Feature',
  properties: { id: idx + 1 },
  geometry: { type: 'Point', coordinates: coord },
}));

const edgeFeatures = edges.map((e) => ({
  type: 'Feature',
  properties: { source: e.source, target: e.target, path_type: e.pathType },
  geometry: {
    type: 'LineString',
    coordinates: [localNodeCoords[e.source - 1], localNodeCoords[e.target - 1]],
  },
}));

const geojson = { type: 'FeatureCollection', features: [...nodeFeatures, ...edgeFeatures] };
writeFileSync(NETWORK_OUT, JSON.stringify(geojson, null, 2) + '\n', 'utf8');

// ---------- Report ----------

const totalLengthM = edges.reduce(
  (s, e) => s + haversine(localNodeCoords[e.source - 1], localNodeCoords[e.target - 1]),
  0,
);

console.log(JSON.stringify({
  places: { written: places.length, flagged: flaggedPlaces, unnamedBuildingsSkipped },
  buildingFootprints: buildingFeatures.length,
  network: {
    nodes: localNodeCoords.length,
    edges: edges.length,
    degenerateEdgesSkipped: degenerateCount,
    nodesMergedByDefensiveSnap,
    unrecognizedHighwayDefaultedToWalkway: unrecognizedHighwayCount,
    totalLengthMeters: Math.round(totalLengthM),
  },
  relationsSkipped: relationsSkipped.length,
}, null, 2));
