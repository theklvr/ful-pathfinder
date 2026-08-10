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
// The actual conversion logic lives in scripts/lib/convertOsm.js, shared
// with api/admin.js's in-app "update from OpenStreetMap" admin feature --
// this file is just the file-I/O wrapper around it.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { convertOsmExport } from './lib/convertOsm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OSM_PATH = path.join(ROOT, 'Assets', 'felele-osm-export.json');
const PLACES_OUT = path.join(ROOT, 'data', 'osm-places.csv');
const NETWORK_OUT = path.join(ROOT, 'data', 'osm-network.geojson');

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const raw = JSON.parse(readFileSync(OSM_PATH, 'utf8'));
const { places, buildingFeatures, nodes, edges, report } = convertOsmExport(raw.elements ?? []);

writeFileSync(
  path.join(ROOT, 'public', 'map', 'campus-buildings.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: buildingFeatures }, null, 2) + '\n',
  'utf8',
);

const csvHeader = 'name,category,aliases,description,photo_url,lat,lng';
const csvRows = places.map((p) => [p.name, p.category, p.aliases, p.description, '', p.lat, p.lng].map(csvField).join(','));
writeFileSync(PLACES_OUT, [csvHeader, ...csvRows].join('\n') + '\n', 'utf8');

const nodeFeatures = nodes.map((n) => ({
  type: 'Feature',
  properties: { id: n.id },
  geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
}));
const edgeFeatures = edges.map((e) => {
  const source = nodes.find((n) => n.id === e.source);
  const target = nodes.find((n) => n.id === e.target);
  return {
    type: 'Feature',
    properties: { source: e.source, target: e.target, path_type: e.path_type },
    geometry: { type: 'LineString', coordinates: [[source.lng, source.lat], [target.lng, target.lat]] },
  };
});
writeFileSync(
  NETWORK_OUT,
  JSON.stringify({ type: 'FeatureCollection', features: [...nodeFeatures, ...edgeFeatures] }, null, 2) + '\n',
  'utf8',
);

console.log(JSON.stringify(report, null, 2));
