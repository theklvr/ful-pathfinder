// Merges the OSM-derived staging files (data/osm-places.csv,
// data/osm-network.geojson — produced by scripts/convert-survey-osm.mjs)
// into the canonical data/places.csv and data/network.geojson that the
// existing, unmodified seed scripts (supabase/seed/import_*.mjs) read.
//
// The existing survey data is always the authoritative base and is never
// discarded. Nothing here silently dedupes a place that might be distinct,
// and nothing silently merges a graph junction that might be two separate
// ones — every ambiguous case is excluded from the automatic merge and
// printed in the report for a human to resolve by hand-editing
// data/places.csv or data/network.geojson afterward.
//
// Usage: node scripts/merge-survey.mjs
//
// Reads (all optional except the canonical files, which must already exist):
//   data/places.csv, data/network.geojson       (canonical, authoritative)
//   data/osm-places.csv, data/osm-network.geojson (staging, from the OSM converter)
//   data/place-overrides.csv                      (durable manual overrides, e.g. photo_url)
//
// Writes: data/places.csv, data/network.geojson (overwritten with the merged result),
// plus a JSON report to stdout.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const PLACES_PATH = path.join(DATA, 'places.csv');
const NETWORK_PATH = path.join(DATA, 'network.geojson');
const OSM_PLACES_PATH = path.join(DATA, 'osm-places.csv');
const OSM_NETWORK_PATH = path.join(DATA, 'osm-network.geojson');
const OVERRIDES_PATH = path.join(DATA, 'place-overrides.csv');

const CROSS_SOURCE_SNAP_METERS = 12; // existing-survey-node <-> osm-node junction match tolerance
const DUPLICATE_PLACE_METERS = 30;   // name-matched places within this distance = duplicate
const SAME_SPOT_METERS = 15;         // no name match but this close = possible duplicate (same spot, different name)
const NAME_JACCARD_THRESHOLD = 0.5;  // word-overlap ratio to call two place names a fuzzy match

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

function parseCsv(text) {
  const rows = [];
  const lines = text.split('\n').filter((l) => l.length > 0);
  for (const line of lines.slice(1)) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

function readPlacesCsv(p) {
  if (!existsSync(p)) return [];
  return parseCsv(readFileSync(p, 'utf8')).map(([name, category, aliases, description, photo_url, lat, lng]) => ({
    name, category, aliases: aliases ?? '', description: description ?? '', photo_url: photo_url ?? '',
    lat: Number(lat), lng: Number(lng),
  }));
}

function readNetworkGeojson(p) {
  if (!existsSync(p)) return { nodes: [], edges: [] };
  const geojson = JSON.parse(readFileSync(p, 'utf8'));
  const nodes = geojson.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => ({ id: f.properties.id, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  const edges = geojson.features
    .filter((f) => f.geometry.type === 'LineString')
    .map((f) => ({ source: f.properties.source, target: f.properties.target, path_type: f.properties.path_type ?? 'walkway' }));
  return { nodes, edges };
}

function normalizeName(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function wordsOf(s) {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}
function nameJaccard(a, b) {
  const A = wordsOf(a), B = wordsOf(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

if (!existsSync(PLACES_PATH) || !existsSync(NETWORK_PATH)) {
  console.error('Missing canonical data/places.csv or data/network.geojson — nothing to merge into.');
  process.exit(1);
}

const existingPlaces = readPlacesCsv(PLACES_PATH);
const osmPlaces = readPlacesCsv(OSM_PLACES_PATH);
const { nodes: existingNodes, edges: existingEdges } = readNetworkGeojson(NETWORK_PATH);
const { nodes: osmNodes, edges: osmEdges } = readNetworkGeojson(OSM_NETWORK_PATH);
const overrides = existsSync(OVERRIDES_PATH)
  ? parseCsv(readFileSync(OVERRIDES_PATH, 'utf8')).map(([name, photo_url, description_override]) => ({ name, photo_url, description_override }))
  : [];

// ---------- Merge places ----------

const duplicatePlaces = [];
const likelyDuplicatePlaces = [];
const possibleDuplicatePlaces = [];
const newPlaces = [];

for (const osmPlace of osmPlaces) {
  const withDistance = existingPlaces.map((ex) => ({ ex, dist: haversine([osmPlace.lng, osmPlace.lat], [ex.lng, ex.lat]) }));
  const nameMatches = withDistance.filter(({ ex }) => nameJaccard(ex.name, osmPlace.name) >= NAME_JACCARD_THRESHOLD);

  if (nameMatches.length) {
    const closest = nameMatches.reduce((a, b) => (a.dist < b.dist ? a : b));
    if (closest.dist <= DUPLICATE_PLACE_METERS) {
      duplicatePlaces.push({ osmName: osmPlace.name, existingName: closest.ex.name, distanceMeters: Math.round(closest.dist) });
      continue;
    }
    likelyDuplicatePlaces.push({ osmName: osmPlace.name, existingName: closest.ex.name, distanceMeters: Math.round(closest.dist), reason: 'name matches but far apart' });
    continue;
  }

  const closeAny = withDistance.filter(({ dist }) => dist <= SAME_SPOT_METERS);
  if (closeAny.length) {
    const closest = closeAny.reduce((a, b) => (a.dist < b.dist ? a : b));
    possibleDuplicatePlaces.push({ osmName: osmPlace.name, existingName: closest.ex.name, distanceMeters: Math.round(closest.dist), reason: 'same spot, different name' });
    continue;
  }

  newPlaces.push(osmPlace);
}

let finalPlaces = [...existingPlaces, ...newPlaces];

// Apply durable manual overrides (e.g. photo_url set by hand in Supabase) last, so a re-run never clobbers them.
let overridesApplied = 0;
if (overrides.length) {
  const byNormName = new Map(finalPlaces.map((p) => [normalizeName(p.name), p]));
  for (const o of overrides) {
    const p = byNormName.get(normalizeName(o.name));
    if (!p) continue;
    if (o.photo_url) { p.photo_url = o.photo_url; overridesApplied++; }
    if (o.description_override) p.description = o.description_override;
  }
}

// ---------- Merge network ----------

const existingIds = existingNodes.map((n) => n.id);
let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;

const osmIdToFinalId = new Map();
const ambiguousJunctionMerges = [];
let exactMergesIntoExisting = 0;
const newNodeEntries = [];

for (const osmNode of osmNodes) {
  const candidates = existingNodes
    .map((ex) => ({ ex, dist: haversine([osmNode.lng, osmNode.lat], [ex.lng, ex.lat]) }))
    .filter(({ dist }) => dist <= CROSS_SOURCE_SNAP_METERS);

  if (candidates.length === 1) {
    osmIdToFinalId.set(osmNode.id, candidates[0].ex.id);
    exactMergesIntoExisting++;
  } else if (candidates.length > 1) {
    ambiguousJunctionMerges.push({
      osmNodeId: osmNode.id,
      candidateExistingIds: candidates.map((c) => c.ex.id),
      distancesMeters: candidates.map((c) => Math.round(c.dist)),
    });
    const finalId = nextId++;
    osmIdToFinalId.set(osmNode.id, finalId);
    newNodeEntries.push({ id: finalId, lat: osmNode.lat, lng: osmNode.lng });
  } else {
    const finalId = nextId++;
    osmIdToFinalId.set(osmNode.id, finalId);
    newNodeEntries.push({ id: finalId, lat: osmNode.lat, lng: osmNode.lng });
  }
}

const finalNodes = [...existingNodes, ...newNodeEntries];

const seenPairs = new Set();
for (const e of existingEdges) {
  const key = e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`;
  seenPairs.add(key);
}

const remappedOsmEdges = [];
let degenerateSkipped = 0;
let duplicateEdgesSkipped = 0;
for (const e of osmEdges) {
  const source = osmIdToFinalId.get(e.source);
  const target = osmIdToFinalId.get(e.target);
  if (source == null || target == null || source === target) { degenerateSkipped++; continue; }
  const key = source < target ? `${source}-${target}` : `${target}-${source}`;
  if (seenPairs.has(key)) { duplicateEdgesSkipped++; continue; }
  seenPairs.add(key);
  remappedOsmEdges.push({ source, target, path_type: e.path_type });
}

const finalEdges = [...existingEdges, ...remappedOsmEdges];

// ---------- Connectivity check ----------

const adjacency = new Map();
for (const n of finalNodes) adjacency.set(n.id, []);
for (const e of finalEdges) {
  adjacency.get(e.source)?.push(e.target);
  adjacency.get(e.target)?.push(e.source);
}

const componentOf = new Map();
let componentCount = 0;
for (const n of finalNodes) {
  if (componentOf.has(n.id)) continue;
  componentCount++;
  const queue = [n.id];
  componentOf.set(n.id, componentCount);
  while (queue.length) {
    const cur = queue.pop();
    for (const nb of adjacency.get(cur) ?? []) {
      if (!componentOf.has(nb)) { componentOf.set(nb, componentCount); queue.push(nb); }
    }
  }
}

const gatePlace = finalPlaces.find((p) => p.name === 'School Gate');
let gateComponent = null;
if (gatePlace && finalNodes.length) {
  let best = Infinity, bestNode = null;
  for (const n of finalNodes) {
    const d = haversine([gatePlace.lng, gatePlace.lat], [n.lng, n.lat]);
    if (d < best) { best = d; bestNode = n; }
  }
  gateComponent = componentOf.get(bestNode.id);
}

const placesInDisconnectedComponents = [];
if (gateComponent != null) {
  for (const place of finalPlaces) {
    let best = Infinity, bestNode = null;
    for (const n of finalNodes) {
      const d = haversine([place.lng, place.lat], [n.lng, n.lat]);
      if (d < best) { best = d; bestNode = n; }
    }
    if (bestNode && componentOf.get(bestNode.id) !== gateComponent) {
      placesInDisconnectedComponents.push({ name: place.name, nearestNodeId: bestNode.id, component: componentOf.get(bestNode.id) });
    }
  }
}

const reachableFromGate = gateComponent != null
  ? [...componentOf.values()].filter((c) => c === gateComponent).length
  : 0;

// ---------- Write merged canonical files ----------

const csvHeader = 'name,category,aliases,description,photo_url,lat,lng';
const csvRows = finalPlaces.map((p) => [p.name, p.category, p.aliases, p.description, p.photo_url, p.lat, p.lng].map(csvField).join(','));
writeFileSync(PLACES_PATH, [csvHeader, ...csvRows].join('\n') + '\n', 'utf8');

const nodeFeatures = finalNodes.map((n) => ({
  type: 'Feature',
  properties: { id: n.id },
  geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
}));
const edgeFeatures = finalEdges.map((e) => {
  const source = finalNodes.find((n) => n.id === e.source);
  const target = finalNodes.find((n) => n.id === e.target);
  return {
    type: 'Feature',
    properties: { source: e.source, target: e.target, path_type: e.path_type },
    geometry: { type: 'LineString', coordinates: [[source.lng, source.lat], [target.lng, target.lat]] },
  };
});
writeFileSync(NETWORK_PATH, JSON.stringify({ type: 'FeatureCollection', features: [...nodeFeatures, ...edgeFeatures] }, null, 2) + '\n', 'utf8');

// ---------- Report ----------

console.log(JSON.stringify({
  places: {
    existing: existingPlaces.length,
    osmConsidered: osmPlaces.length,
    new: newPlaces.length,
    duplicate: duplicatePlaces,
    likelyDuplicate: likelyDuplicatePlaces,
    possibleDuplicate: possibleDuplicatePlaces,
    overridesApplied,
    finalTotal: finalPlaces.length,
  },
  network: {
    existingNodes: existingNodes.length,
    osmNodes: osmNodes.length,
    mergedIntoExisting: exactMergesIntoExisting,
    ambiguousJunctionMerges,
    newNodes: newNodeEntries.length,
    finalNodes: finalNodes.length,
    existingEdges: existingEdges.length,
    osmEdgesAdded: remappedOsmEdges.length,
    degenerateOrUnresolvedSkipped: degenerateSkipped,
    duplicateEdgesSkipped,
    finalEdges: finalEdges.length,
  },
  connectivity: {
    componentCount,
    gateComponent,
    finalNodesTotal: finalNodes.length,
    reachableFromGate,
    placesInDisconnectedComponents,
  },
}, null, 2));

if (placesInDisconnectedComponents.length) {
  console.error(`\nBLOCKING: ${placesInDisconnectedComponents.length} place(s) are in a component disconnected from School Gate. Fix the path network (in OSM or the existing survey) before seeding. See "placesInDisconnectedComponents" above.`);
  process.exit(1);
}
