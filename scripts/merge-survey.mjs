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
//
// The actual merge/dedupe/connectivity-check logic lives in
// scripts/lib/mergeSurvey.js, shared with api/admin.js's in-app "update
// from OpenStreetMap" admin feature -- this file is the file-I/O wrapper
// and the one place that's allowed to fully rewrite the canonical files
// (safe here since they're just local files, not a live DB with foreign
// keys pointing at existing rows -- api/admin.js writes additively instead).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergeSurveyData } from './lib/mergeSurvey.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const PLACES_PATH = path.join(DATA, 'places.csv');
const NETWORK_PATH = path.join(DATA, 'network.geojson');
const OSM_PLACES_PATH = path.join(DATA, 'osm-places.csv');
const OSM_NETWORK_PATH = path.join(DATA, 'osm-network.geojson');
const OVERRIDES_PATH = path.join(DATA, 'place-overrides.csv');

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
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') {
        fields.push(cur);
        cur = '';
      } else cur += c;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

function readPlacesCsv(p) {
  if (!existsSync(p)) return [];
  return parseCsv(readFileSync(p, 'utf8')).map(([name, category, aliases, description, photo_url, lat, lng]) => ({
    name,
    category,
    aliases: aliases ?? '',
    description: description ?? '',
    photo_url: photo_url ?? '',
    lat: Number(lat),
    lng: Number(lng),
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
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  ? parseCsv(readFileSync(OVERRIDES_PATH, 'utf8')).map(([name, photo_url, description_override]) => ({
      name,
      photo_url,
      description_override,
    }))
  : [];

const { finalPlaces, finalNodes, finalEdges, connectivityOk, report } = mergeSurveyData({
  existingPlaces,
  existingNodes,
  existingEdges,
  osmPlaces,
  osmNodes,
  osmEdges,
});

// Durable manual overrides (e.g. photo_url set by hand in Supabase) applied
// last, so a re-run never clobbers them.
let overridesApplied = 0;
if (overrides.length) {
  const byNormName = new Map(finalPlaces.map((p) => [normalizeName(p.name), p]));
  for (const o of overrides) {
    const p = byNormName.get(normalizeName(o.name));
    if (!p) continue;
    if (o.photo_url) {
      p.photo_url = o.photo_url;
      overridesApplied++;
    }
    if (o.description_override) p.description = o.description_override;
  }
}
report.places.overridesApplied = overridesApplied;

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
writeFileSync(
  NETWORK_PATH,
  JSON.stringify({ type: 'FeatureCollection', features: [...nodeFeatures, ...edgeFeatures] }, null, 2) + '\n',
  'utf8',
);

console.log(JSON.stringify(report, null, 2));

if (!connectivityOk) {
  console.error(
    `\nBLOCKING: ${report.connectivity.placesInDisconnectedComponents.length} place(s) are in a component disconnected from School Gate. Fix the path network (in OSM or the existing survey) before seeding. See "placesInDisconnectedComponents" above.`,
  );
  process.exit(1);
}
