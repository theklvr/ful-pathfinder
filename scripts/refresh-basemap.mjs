// Re-extracts public/map/felele.pmtiles from today's Protomaps daily build,
// picking up whatever OpenStreetMap edits have landed since the last
// extract (buildings/roads the school added directly to OSM show up here
// once Protomaps' own build catches up -- usually within a few days, per
// docs/SURVEY-GUIDE.md). This can't be a website button: it needs the
// go-pmtiles CLI (an external binary, not an npm package) and produces a
// ~2.7MB binary file that has to be committed and redeployed, not written
// at runtime -- so this stays a one-command local task for whoever
// maintains the site, wrapping the recipe documented in CLAUDE.md.
//
// Usage: node scripts/refresh-basemap.mjs [YYYYMMDD]
// (date defaults to today; pass an earlier date if today's build 404s --
// Protomaps' daily builds sometimes lag by a day)

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BBOX = '6.60,7.75,6.82,7.92';
const OUT = path.join(ROOT, 'public', 'map', 'felele.pmtiles');

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

const date = process.argv[2] || todayYYYYMMDD();
const sourceUrl = `https://build.protomaps.com/${date}.pmtiles`;

try {
  execFileSync('pmtiles', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('The `pmtiles` CLI (go-pmtiles) isn\'t installed or isn\'t on PATH.');
  console.error('Install it from https://github.com/protomaps/go-pmtiles, then re-run this script.');
  process.exit(1);
}

console.log(`Extracting Felele campus bbox from ${sourceUrl}...`);
try {
  execFileSync('pmtiles', ['extract', sourceUrl, OUT, `--bbox=${BBOX}`, '--maxzoom=18'], { stdio: 'inherit' });
} catch {
  console.error(`\nExtract failed -- if this is a 404, today's build may not be published yet.`);
  console.error(`Try an earlier date: node scripts/refresh-basemap.mjs ${shiftDate(date, -1)}`);
  process.exit(1);
}

console.log(`\nDone -- public/map/felele.pmtiles updated. Commit it and push to deploy the refreshed basemap.`);

function shiftDate(yyyymmdd, days) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(y, m, d + days));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}
