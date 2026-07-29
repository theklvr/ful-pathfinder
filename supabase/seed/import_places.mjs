// Loads data/places.csv into the Supabase `places` table, replacing
// whatever is there. Requires SUPABASE_SERVICE_ROLE_KEY (not the anon
// key — RLS blocks writes from that) alongside VITE_SUPABASE_URL, both
// read from .env.
//
// Usage: node supabase/seed/import_places.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CSV_PATH = path.join(ROOT, 'data', 'places.csv');

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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
const places = rows.map(([name, category, aliases, description, photo_url, lat, lng]) => ({
  name,
  category,
  aliases: aliases ? aliases.split(';') : [],
  description: description || null,
  photo_url: photo_url || null,
  lat: Number(lat),
  lng: Number(lng),
}));

const { error: deleteError } = await supabase.from('places').delete().gte('id', 0);
if (deleteError) throw deleteError;

const { error: insertError } = await supabase.from('places').insert(places);
if (insertError) throw insertError;

console.log(`Seeded ${places.length} places from data/places.csv`);
