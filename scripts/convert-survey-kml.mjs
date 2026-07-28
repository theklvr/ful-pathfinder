// One-off / re-runnable converter: turns the Google My Maps KML export in
// Assets/ into the two files docs/SURVEY-GUIDE.md specifies for the build:
// data/places.csv and data/network.geojson.
//
// Usage: node scripts/convert-survey-kml.mjs
//
// What it does:
// - Places: reads category/nicknames/note out of each pin's description.
// - Paths: turns every LineString into a chain of nodes + edges. Vertices
//   from different lines that land within SNAP_METERS of each other are
//   merged into one shared node, so touching paths actually connect.
// - Prints a report of anything that couldn't be resolved automatically
//   (missing name/category, disconnected path segments) instead of
//   guessing.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KML_PATH = path.join(ROOT, 'Assets', 'FUL PathFinder Survey.kml');
const PLACES_OUT = path.join(ROOT, 'data', 'places.csv');
const NETWORK_OUT = path.join(ROOT, 'data', 'network.geojson');

const ALLOWED_CATEGORIES = ['faculty', 'hostel', 'admin', 'eatery', 'atm', 'landmark', 'service', 'health', 'sport'];
const SNAP_METERS = 8; // vertices from different lines within this distance are treated as the same junction

const kml = readFileSync(KML_PATH, 'utf8');

function stripCdata(s) {
  if (s == null) return '';
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : s).trim();
}

function extractFolder(xml, folderName) {
  const startTag = `<name>${folderName}</name>`;
  const start = xml.indexOf(startTag);
  if (start === -1) throw new Error(`Folder "${folderName}" not found`);
  const end = xml.indexOf('</Folder>', start);
  return xml.slice(start, end);
}

function extractPlacemarks(xml) {
  const out = [];
  const re = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\s*/>`));
  if (m) return '';
  const m2 = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m2 ? stripCdata(m2[1]) : null;
}

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

// ---------- Places ----------

const placesXml = extractFolder(kml, 'Places');
const placePlacemarks = extractPlacemarks(placesXml);

const places = [];
const flaggedPlaces = [];

for (const block of placePlacemarks) {
  const rawName = extractTag(block, 'name') ?? '';
  const name = rawName.trim();

  const rawDesc = extractTag(block, 'description') ?? '';
  const descNoImg = rawDesc.replace(/<img[^>]*>/gi, '').trim();
  const lines = descNoImg
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean);

  let category = '';
  let aliases = '';
  let note = '';
  const freeText = [];

  for (const line of lines) {
    const catM = line.match(/^category:\s*(.+)$/i);
    const nickM = line.match(/^nicknames:\s*(.+)$/i);
    const noteM = line.match(/^note:\s*(.+)$/i);
    if (catM) category = catM[1].trim().toLowerCase();
    else if (nickM) aliases = nickM[1].split(',').map((s) => s.trim()).filter(Boolean).join(';');
    else if (noteM) note = noteM[1].trim();
    else freeText.push(line);
  }

  let categoryInferred = false;
  if (!category && freeText.length) {
    const joined = freeText.join(' ');
    const found = ALLOWED_CATEGORIES.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(joined));
    if (found.length === 1) {
      category = found[0].toLowerCase();
      categoryInferred = true;
      note = note || joined.replace(new RegExp(`,?\\s*\\b${found[0]}\\b`, 'i'), '').trim();
    }
  }

  const coordM = block.match(/<Point>\s*<coordinates>\s*([-\d.]+),([-\d.]+)(?:,[-\d.]+)?\s*<\/coordinates>\s*<\/Point>/);
  const lng = coordM ? Number(coordM[1]) : null;
  const lat = coordM ? Number(coordM[2]) : null;

  const entry = { name, category, aliases, description: note, lat, lng, categoryInferred };

  if (!name || !category) {
    flaggedPlaces.push({ ...entry, reason: [!name && 'missing name', !category && 'missing category'].filter(Boolean).join(', ') });
    continue;
  }
  if (categoryInferred) {
    flaggedPlaces.push({ ...entry, reason: `category inferred from free text ("${category}"), not a structured "category:" field — verify` });
  }
  places.push(entry);
}

// ---------- Paths ----------

const pathsXml = extractFolder(kml, 'Paths');
const pathPlacemarks = extractPlacemarks(pathsXml);

const lines = [];
for (const block of pathPlacemarks) {
  const name = (extractTag(block, 'name') ?? '').trim();
  const coordBlockM = block.match(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
  if (!coordBlockM) continue;
  const coords = coordBlockM[1]
    .trim()
    .split(/\s+/)
    .map((triplet) => {
      const [lon, lat] = triplet.split(',').map(Number);
      return [lon, lat];
    });
  lines.push({ name, coords, pathType: /road/i.test(name) ? 'road' : 'walkway' });
}

// ---- Node snapping (union-find over every vertex from every line) ----

const allVerts = []; // { lineIdx, pointIdx, coord }
lines.forEach((line, lineIdx) => {
  line.coords.forEach((coord, pointIdx) => allVerts.push({ lineIdx, pointIdx, coord }));
});

const parent = allVerts.map((_, i) => i);
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

for (let i = 0; i < allVerts.length; i++) {
  for (let j = i + 1; j < allVerts.length; j++) {
    if (haversine(allVerts[i].coord, allVerts[j].coord) <= SNAP_METERS) union(i, j);
  }
}

// cluster -> node id, node coord = centroid of cluster members
const clusterToNodeId = new Map();
const nodeCoords = []; // index 0-based, node id = index + 1
const clusterMembers = new Map();
for (let i = 0; i < allVerts.length; i++) {
  const root = find(i);
  if (!clusterMembers.has(root)) clusterMembers.set(root, []);
  clusterMembers.get(root).push(i);
}
for (const [root, members] of clusterMembers) {
  const lng = members.reduce((s, i) => s + allVerts[i].coord[0], 0) / members.length;
  const lat = members.reduce((s, i) => s + allVerts[i].coord[1], 0) / members.length;
  clusterToNodeId.set(root, nodeCoords.length + 1);
  nodeCoords.push([Number(lng.toFixed(7)), Number(lat.toFixed(7))]);
}

function nodeIdFor(lineIdx, pointIdx) {
  const flatIdx = allVerts.findIndex((v) => v.lineIdx === lineIdx && v.pointIdx === pointIdx);
  return clusterToNodeId.get(find(flatIdx));
}

// ---- Edges: consecutive vertex pairs per line ----

const edges = [];
const seenPairs = new Set();
let degenerateCount = 0;
lines.forEach((line, lineIdx) => {
  for (let p = 0; p < line.coords.length - 1; p++) {
    const source = nodeIdFor(lineIdx, p);
    const target = nodeIdFor(lineIdx, p + 1);
    if (source === target) {
      degenerateCount++;
      continue;
    }
    const key = source < target ? `${source}-${target}` : `${target}-${source}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    edges.push({ source, target, pathType: line.pathType, lineName: line.name });
  }
});

// ---- Connectivity check from the node nearest "School Gate" ----

const gatePlace = places.find((p) => p.name === 'School Gate');
let gateNodeId = null;
if (gatePlace) {
  let best = Infinity;
  nodeCoords.forEach(([lng, lat], idx) => {
    const d = haversine([gatePlace.lng, gatePlace.lat], [lng, lat]);
    if (d < best) { best = d; gateNodeId = idx + 1; }
  });
}

const adjacency = new Map();
for (const e of edges) {
  if (!adjacency.has(e.source)) adjacency.set(e.source, []);
  if (!adjacency.has(e.target)) adjacency.set(e.target, []);
  adjacency.get(e.source).push(e.target);
  adjacency.get(e.target).push(e.source);
}

const reachable = new Set();
if (gateNodeId != null) {
  const queue = [gateNodeId];
  reachable.add(gateNodeId);
  while (queue.length) {
    const cur = queue.pop();
    for (const nb of adjacency.get(cur) ?? []) {
      if (!reachable.has(nb)) { reachable.add(nb); queue.push(nb); }
    }
  }
}

const disconnectedLines = [];
lines.forEach((line, lineIdx) => {
  const nodeIds = line.coords.map((_, p) => nodeIdFor(lineIdx, p));
  if (nodeIds.some((id) => !reachable.has(id))) {
    disconnectedLines.push({ name: line.name || `(unnamed line #${lineIdx + 1})`, firstCoord: line.coords[0] });
  }
});

// ---------- Write places.csv ----------

const csvHeader = 'name,category,aliases,description,photo_url,lat,lng';
const csvRows = places.map((p) =>
  [p.name, p.category, p.aliases, p.description, '', p.lat, p.lng].map(csvField).join(','),
);
writeFileSync(PLACES_OUT, [csvHeader, ...csvRows].join('\n') + '\n', 'utf8');

// ---------- Write network.geojson ----------

const nodeFeatures = nodeCoords.map((coord, idx) => ({
  type: 'Feature',
  properties: { id: idx + 1 },
  geometry: { type: 'Point', coordinates: coord },
}));

const edgeFeatures = edges.map((e) => ({
  type: 'Feature',
  properties: { source: e.source, target: e.target, path_type: e.pathType },
  geometry: {
    type: 'LineString',
    coordinates: [nodeCoords[e.source - 1], nodeCoords[e.target - 1]],
  },
}));

const geojson = { type: 'FeatureCollection', features: [...nodeFeatures, ...edgeFeatures] };
writeFileSync(NETWORK_OUT, JSON.stringify(geojson, null, 2) + '\n', 'utf8');

// ---------- Report ----------

const totalLengthM = edges.reduce((s, e) => s + haversine(nodeCoords[e.source - 1], nodeCoords[e.target - 1]), 0);

console.log(JSON.stringify({
  places: { written: places.length, flagged: flaggedPlaces },
  network: {
    rawVertices: allVerts.length,
    nodes: nodeCoords.length,
    edges: edges.length,
    degenerateEdgesSkipped: degenerateCount,
    totalLengthMeters: Math.round(totalLengthM),
    gateNodeId,
    reachableFromGate: reachable.size,
    disconnectedLines,
  },
}, null, 2));
