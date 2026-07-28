// Loads data/network.geojson into the Supabase `nodes` and `edges` tables,
// replacing whatever is there, then computes each place's nearest_node_id.
// distance_m is computed here with haversine, not stored in the geojson.
// Requires SUPABASE_SERVICE_ROLE_KEY (not the anon key — RLS blocks writes)
// alongside VITE_SUPABASE_URL, both read from .env.
//
// Usage: node supabase/seed/import_network.mjs
//
// nodes.id is `generated always as identity`, and PostgREST's insert
// endpoint (what supabase-js uses) can't set that explicitly — so nodes
// are inserted without ids, then the ids Postgres actually assigned are
// read back (bulk insert preserves row order) and used to remap edges'
// source/target from the geojson's own node ids.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const NETWORK_PATH = path.join(ROOT, 'data', 'network.geojson');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const geojson = JSON.parse(readFileSync(NETWORK_PATH, 'utf8'));
const nodeFeatures = geojson.features.filter((f) => f.geometry.type === 'Point');
const edgeFeatures = geojson.features.filter((f) => f.geometry.type === 'LineString');

await supabase.from('edges').delete().gte('id', 0);
await supabase.from('nodes').delete().gte('id', 0);

const { data: insertedNodes, error: nodeError } = await supabase
  .from('nodes')
  .insert(nodeFeatures.map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })))
  .select('id');
if (nodeError) throw nodeError;

// geojson node id (index-based, from convert-survey-kml.mjs) -> real DB id
const geojsonIdToDbId = new Map(nodeFeatures.map((f, i) => [f.properties.id, insertedNodes[i].id]));
const nodeCoordByGeojsonId = new Map(nodeFeatures.map((f) => [f.properties.id, f.geometry.coordinates]));

const edges = edgeFeatures.map((f) => ({
  source_node: geojsonIdToDbId.get(f.properties.source),
  target_node: geojsonIdToDbId.get(f.properties.target),
  path_type: f.properties.path_type ?? 'walkway',
  distance_m: haversine(
    nodeCoordByGeojsonId.get(f.properties.source),
    nodeCoordByGeojsonId.get(f.properties.target),
  ),
}));

const { error: edgeError } = await supabase.from('edges').insert(edges);
if (edgeError) throw edgeError;

console.log(`Seeded ${insertedNodes.length} nodes and ${edges.length} edges from data/network.geojson`);

// Nearest node per place
const { data: places, error: placesError } = await supabase.from('places').select('id, lat, lng');
if (placesError) throw placesError;

const dbNodes = insertedNodes.map((n, i) => ({
  id: n.id,
  lng: nodeFeatures[i].geometry.coordinates[0],
  lat: nodeFeatures[i].geometry.coordinates[1],
}));

for (const place of places) {
  let bestId = null;
  let bestDist = Infinity;
  for (const node of dbNodes) {
    const d = haversine([place.lng, place.lat], [node.lng, node.lat]);
    if (d < bestDist) {
      bestDist = d;
      bestId = node.id;
    }
  }
  const { error } = await supabase.from('places').update({ nearest_node_id: bestId }).eq('id', place.id);
  if (error) throw error;
}

console.log(`Set nearest_node_id for ${places.length} places`);
