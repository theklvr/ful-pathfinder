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
import { convertOsmExport } from '../scripts/lib/convertOsm.js';
import { mergeSurveyData } from '../scripts/lib/mergeSurvey.js';

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

// Fetches the live campus data and runs it through the exact same
// convert+merge logic the local CLI pipeline uses (scripts/lib/), so an
// admin-uploaded OSM export is evaluated identically to how the developer's
// own local workflow already works -- one set of rules, not two.
async function computeOsmMerge(supabase, osmExport) {
  const elements = osmExport?.elements ?? [];
  if (elements.length === 0) throw new Error('No elements found in this export -- did you export "raw data" from Overpass Turbo?');

  const { places: osmPlaces, nodes: osmNodes, edges: osmEdges } = convertOsmExport(elements);

  const [placesRes, nodesRes, edgesRes] = await Promise.all([
    supabase.from('places').select('id, name, category, aliases, description, photo_url, lat, lng'),
    supabase.from('nodes').select('id, lat, lng'),
    supabase.from('edges').select('source_node, target_node, distance_m'),
  ]);
  if (placesRes.error) throw placesRes.error;
  if (nodesRes.error) throw nodesRes.error;
  if (edgesRes.error) throw edgesRes.error;

  const existingEdges = edgesRes.data.map((e) => ({ source: e.source_node, target: e.target_node }));

  const merge = mergeSurveyData({
    existingPlaces: placesRes.data,
    existingNodes: nodesRes.data,
    existingEdges,
    osmPlaces,
    osmNodes,
    osmEdges,
  });

  return merge;
}

export async function previewOsmUpdate(supabase, { osmExport }) {
  const merge = await computeOsmMerge(supabase, osmExport);
  return { report: merge.report, connectivityOk: merge.connectivityOk };
}

// Additive only -- inserts the genuinely-new places/nodes/edges the merge
// identified, never touches or replaces anything that already exists. A
// full replace (like the local CLI pipeline's seed scripts do) would
// cascade-delete every favorite/review/list/visited-history row tied to
// existing places, since those all reference places.id.
async function applyOsmUpdate(supabase, { osmExport }) {
  const merge = await computeOsmMerge(supabase, osmExport);
  if (!merge.connectivityOk) {
    throw new Error(
      `Refusing to apply: ${merge.report.connectivity.placesInDisconnectedComponents.length} place(s) would end up disconnected from School Gate. Review the preview report.`,
    );
  }

  let insertedNodes = [];
  const localIdToRealId = new Map();
  if (merge.newNodes.length > 0) {
    const { data, error } = await supabase
      .from('nodes')
      .insert(merge.newNodes.map((n) => ({ lat: n.lat, lng: n.lng })))
      .select('id');
    if (error) throw error;
    insertedNodes = data;
    merge.newNodes.forEach((n, i) => localIdToRealId.set(n.id, insertedNodes[i].id));
  }

  function realNodeId(localOrRealId) {
    return localIdToRealId.get(localOrRealId) ?? localOrRealId;
  }

  if (merge.newEdges.length > 0) {
    const nodeById = new Map([
      ...merge.finalNodes.map((n) => [n.id, n]),
      ...merge.newNodes.map((n, i) => [n.id, { ...n, id: insertedNodes[i]?.id }]),
    ]);
    const edgeRows = merge.newEdges.map((e) => {
      const sourceReal = realNodeId(e.source);
      const targetReal = realNodeId(e.target);
      const sourceCoord = nodeById.get(e.source);
      const targetCoord = nodeById.get(e.target);
      const distanceM = sourceCoord && targetCoord ? haversine(sourceCoord, targetCoord) : 0;
      return { source_node: sourceReal, target_node: targetReal, distance_m: Math.round(distanceM), path_type: e.path_type };
    });
    const { error } = await supabase.from('edges').insert(edgeRows);
    if (error) throw error;
  }

  let insertedPlaces = 0;
  if (merge.newPlaces.length > 0) {
    // nearest_node_id needs the full, now-current node set including what
    // was just inserted above.
    const { data: allNodes, error: nodesError } = await supabase.from('nodes').select('id, lat, lng');
    if (nodesError) throw nodesError;

    const placeRows = merge.newPlaces.map((p) => {
      let bestId = null;
      let bestDist = Infinity;
      for (const node of allNodes) {
        const d = haversine(p, node);
        if (d < bestDist) {
          bestDist = d;
          bestId = node.id;
        }
      }
      return {
        name: p.name,
        category: p.category,
        aliases: p.aliases ? p.aliases.split(';').filter(Boolean) : [],
        description: p.description || null,
        photo_url: p.photo_url || null,
        lat: p.lat,
        lng: p.lng,
        nearest_node_id: bestId,
      };
    });
    const { error } = await supabase.from('places').insert(placeRows);
    if (error) throw error;
    insertedPlaces = placeRows.length;
  }

  return {
    applied: true,
    insertedPlaces,
    insertedNodes: insertedNodes.length,
    insertedEdges: merge.newEdges.length,
  };
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
    else if (action === 'previewOsmUpdate') result = await previewOsmUpdate(auth.supabase, params);
    else if (action === 'applyOsmUpdate') result = await applyOsmUpdate(auth.supabase, params);
    else {
      res.status(400).json({ error: `Unknown action "${action}"` });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
