// Promotes crowdsourced place submissions a human has approved into the
// real, live `places` table. Moderation itself happens outside this script
// -- review pending rows in the Supabase table editor (place_submissions,
// status='pending') and flip status to 'approved' or 'rejected' by hand.
// This script only ever touches rows already marked 'approved' and not yet
// promoted, so re-running it is always safe.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (not the anon key -- RLS blocks writes
// to `places` and updates to `place_submissions` from anyone else) alongside
// VITE_SUPABASE_URL, both read from .env.
//
// Usage: node supabase/seed/promote_submissions.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: approved, error: fetchError } = await supabase
  .from('place_submissions')
  .select('id, name, category, aliases, description, photo_url, lat, lng')
  .eq('status', 'approved')
  .is('promoted_at', null);
if (fetchError) throw fetchError;

if (approved.length === 0) {
  console.log('Nothing to promote -- no approved, unpromoted submissions.');
  process.exit(0);
}

const { error: insertError } = await supabase.from('places').insert(
  approved.map((s) => ({
    name: s.name,
    category: s.category,
    aliases: s.aliases,
    description: s.description,
    photo_url: s.photo_url,
    lat: s.lat,
    lng: s.lng,
  })),
);
if (insertError) throw insertError;

const { error: updateError } = await supabase
  .from('place_submissions')
  .update({ promoted_at: new Date().toISOString() })
  .in('id', approved.map((s) => s.id));
if (updateError) throw updateError;

console.log(`Promoted ${approved.length} submission(s) into places: ${approved.map((s) => s.name).join(', ')}`);
console.log('Run supabase/seed/import_network.mjs afterward if these need nearest_node_id set for routing.');
