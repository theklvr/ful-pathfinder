// Compresses the real survey photos in Assets/images/ (raw ~105MB across 28
// files, some over 5MB each -- exactly the "lag on a weak campus network"
// problem docs/ARCHITECTURE.md and CLAUDE.md's mobile-first rule warn
// about), uploads the compressed versions to the `place-photos` Supabase
// Storage bucket, and conservatively matches filenames to real place names.
//
// "Conservative" matters here: several filenames are generic or duplicated
// (two different photos are both called chemistry.jpg.jpeg) with no
// reliable way to tell them apart from the filename alone. Rather than
// guess and risk showing the wrong building's photo on a place, only an
// unambiguous single match gets applied automatically -- everything else
// is uploaded (so the URL exists) but left unassigned, printed in a report
// for a human who's actually seen the campus to assign by eye.
//
// Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
// Usage: node scripts/prepare-photos.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'Assets', 'images');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'place-overrides.csv');
const BUCKET = 'place-photos';

// Keeps images fast on a weak campus connection (this project's core
// constraint) while still looking good on a phone screen.
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 78;

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
  console.error('Get the service role key from the Supabase dashboard -> Settings -> API -> service_role.');
  process.exit(1);
}
const supabase = createClient(url, key);

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/\.(jpg|jpeg|png|webp)/g, '')
    .replace(/^\(unnamed\)-?\s*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const files = readdirSync(IMAGES_DIR).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
  console.log(`Found ${files.length} source images in Assets/images/`);

  const { data: places, error: placesError } = await supabase.from('places').select('id, name, photo_url');
  if (placesError) throw placesError;

  const uploaded = []; // { file, url, sizeBeforeKb, sizeAfterKb }
  const matched = [];
  const skipped = [];

  for (const file of files) {
    const srcPath = path.join(IMAGES_DIR, file);
    const srcBuffer = readFileSync(srcPath);
    const compressed = await sharp(srcBuffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const storagePath = `${normalize(file).replace(/\s+/g, '-')}-${Buffer.from(file).toString('hex').slice(0, 6)}.webp`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, compressed, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (uploadError) {
      console.error(`Upload failed for ${file}:`, uploadError.message);
      continue;
    }
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    uploaded.push({
      file,
      url: publicUrlData.publicUrl,
      sizeBeforeKb: Math.round(srcBuffer.length / 1024),
      sizeAfterKb: Math.round(compressed.length / 1024),
    });
  }

  console.log(`\nUploaded ${uploaded.length}/${files.length} images to the "${BUCKET}" bucket.`);
  const totalBefore = uploaded.reduce((s, u) => s + u.sizeBeforeKb, 0);
  const totalAfter = uploaded.reduce((s, u) => s + u.sizeAfterKb, 0);
  console.log(`Total size: ${(totalBefore / 1024).toFixed(1)} MB -> ${(totalAfter / 1024).toFixed(1)} MB`);

  // Conservative filename -> place matching. A filename's cleaned token set
  // must appear as a whole word inside exactly one place name to auto-apply.
  const overrideRows = [];
  for (const item of uploaded) {
    const cleaned = normalize(item.file);
    const words = cleaned.split(' ').filter((w) => w.length >= 4); // skip short/generic tokens
    if (words.length === 0) {
      skipped.push({ file: item.file, url: item.url, reason: 'filename has no usable words (e.g. "1.jpg", "2.jpg")' });
      continue;
    }

    // A generic word (e.g. "building") matches many places and isn't a
    // signal either way, so only words that uniquely identify exactly one
    // place count as evidence. But two *different* words that each uniquely
    // identify a *different* place (e.g. a mosque photo whose filename also
    // happens to contain "memorial", which is otherwise only in an unrelated
    // lecture theatre's name) is a genuine conflict, not a tiebreak -- both
    // can't be right, so neither gets auto-applied.
    const wordMatches = words.map((w) => ({
      word: w,
      candidates: places.filter((p) => new RegExp(`\\b${w}\\b`).test(p.name.toLowerCase())),
    }));
    const uniqueMatches = wordMatches.filter((wm) => wm.candidates.length === 1);
    const distinctPlaceIds = new Set(uniqueMatches.map((wm) => wm.candidates[0].id));

    if (uniqueMatches.length === 0) {
      const anyMatch = wordMatches.find((wm) => wm.candidates.length > 0);
      skipped.push({
        file: item.file,
        url: item.url,
        reason: anyMatch
          ? `no word uniquely identifies one place -- "${anyMatch.word}" alone matches ${anyMatch.candidates.length} places`
          : `no place name matches "${cleaned}"`,
      });
    } else if (distinctPlaceIds.size > 1) {
      skipped.push({
        file: item.file,
        url: item.url,
        reason: `conflicting matches -- ${uniqueMatches.map((wm) => `"${wm.word}" -> ${wm.candidates[0].name}`).join(', ')}`,
      });
    } else {
      const place = uniqueMatches[0].candidates[0];
      if (place.photo_url) {
        skipped.push({ file: item.file, url: item.url, reason: `"${place.name}" already has a photo_url -- not overwriting` });
        continue;
      }
      const { error: updateError } = await supabase.from('places').update({ photo_url: item.url }).eq('id', place.id);
      if (updateError) {
        skipped.push({ file: item.file, url: item.url, reason: `DB update failed: ${updateError.message}` });
        continue;
      }
      matched.push({ file: item.file, place: place.name, url: item.url });
      overrideRows.push([place.name, item.url, '']);
    }
  }

  if (overrideRows.length > 0) {
    let existing = '';
    try {
      existing = readFileSync(OVERRIDES_PATH, 'utf8');
    } catch {
      existing = 'name,photo_url,description_override\n';
    }
    const newLines = overrideRows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const separator = existing.endsWith('\n') ? '' : '\n';
    writeFileSync(OVERRIDES_PATH, existing + separator + newLines + '\n');
  }

  console.log(`\nAuto-matched ${matched.length} place${matched.length === 1 ? '' : 's'}:`);
  for (const m of matched) console.log(`  ${m.place} <- ${m.file}`);

  console.log(`\nNeeds manual assignment (${skipped.length}) -- pick the right one by eye and set photo_url on that place:`);
  for (const s of skipped) console.log(`  ${s.file} (${s.url})\n    ${s.reason}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
