// Admin moderation actions (approve/reject submissions and edit suggestions,
// general place edits). Listing pending items doesn't need this endpoint --
// the admin's own signed-in session can read them directly, RLS now allows
// it (see supabase/migrations/20260810140000_admin.sql). Only the actual
// writes need the service role, since `places` itself stays admin-write-only
// even for admins, so those go through here.
//
// POST /api/admin
// Body: { action, ...params }, Authorization: Bearer <admin's access token>

import { requireAdmin } from './_lib/adminAuth.js';
import { haversine } from '../src/routing/haversine.js';

async function nearestNodeIdFor(supabase, lat, lng) {
  const { data: nodes } = await supabase.from('nodes').select('id, lat, lng');
  if (!nodes || nodes.length === 0) return null;
  let bestId = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    const d = haversine({ lat, lng }, node);
    if (d < bestDist) {
      bestDist = d;
      bestId = node.id;
    }
  }
  return bestId;
}

async function reviewSubmission(supabase, { id, decision, note }) {
  const { data: submission, error: fetchError } = await supabase.from('place_submissions').select('*').eq('id', id).single();
  if (fetchError) throw fetchError;

  if (decision === 'approve') {
    const nearestNodeId = await nearestNodeIdFor(supabase, submission.lat, submission.lng);
    const { error: insertError } = await supabase.from('places').insert({
      name: submission.name,
      category: submission.category,
      aliases: submission.aliases,
      description: submission.description,
      photo_url: submission.photo_url,
      lat: submission.lat,
      lng: submission.lng,
      nearest_node_id: nearestNodeId,
    });
    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabase
    .from('place_submissions')
    .update({
      status: decision === 'approve' ? 'approved' : 'rejected',
      moderator_note: note || null,
      promoted_at: decision === 'approve' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (updateError) throw updateError;

  return { promoted: decision === 'approve' };
}

async function reviewEditSuggestion(supabase, { id, decision, note }) {
  const { data: suggestion, error: fetchError } = await supabase.from('place_edit_suggestions').select('*').eq('id', id).single();
  if (fetchError) throw fetchError;

  // Only the "photo" kind carries a structured value that's safe to apply
  // automatically -- "details"/"address"/"road_report" are free-text notes
  // describing what should change, not the change itself, so approving
  // those records the decision but the admin still edits the place
  // themselves (via updatePlace below) with the note as a guide.
  if (decision === 'approve' && suggestion.kind === 'photo' && suggestion.suggested_photo_url) {
    const { error: photoError } = await supabase
      .from('places')
      .update({ photo_url: suggestion.suggested_photo_url })
      .eq('id', suggestion.place_id);
    if (photoError) throw photoError;
  }

  const { error: updateError } = await supabase
    .from('place_edit_suggestions')
    .update({ status: decision === 'approve' ? 'approved' : 'rejected', moderator_note: note || null })
    .eq('id', id);
  if (updateError) throw updateError;

  return { appliedDirectly: decision === 'approve' && suggestion.kind === 'photo' };
}

async function updatePlace(supabase, { placeId, fields }) {
  const allowed = ['name', 'category', 'aliases', 'description', 'photo_url'];
  const patch = {};
  for (const key of allowed) {
    if (key in fields) patch[key] = fields[key];
  }
  if (Object.keys(patch).length === 0) throw new Error('No editable fields provided');

  const { error } = await supabase.from('places').update(patch).eq('id', placeId);
  if (error) throw error;
  return { updated: true };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST is supported' });
    return;
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const { action, ...params } = req.body || {};
  try {
    let result;
    if (action === 'reviewSubmission') result = await reviewSubmission(auth.supabase, params);
    else if (action === 'reviewEditSuggestion') result = await reviewEditSuggestion(auth.supabase, params);
    else if (action === 'updatePlace') result = await updatePlace(auth.supabase, params);
    else {
      res.status(400).json({ error: `Unknown action "${action}"` });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
