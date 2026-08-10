import { supabase } from '../lib/supabase';

export async function fetchPendingSubmissions() {
  const { data, error } = await supabase
    .from('place_submissions')
    .select('id, name, category, aliases, description, photo_url, lat, lng, submitted_by, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchPendingEditSuggestions() {
  const { data, error } = await supabase
    .from('place_edit_suggestions')
    .select('id, kind, note, suggested_photo_url, submitted_by, created_at, places(id, name, photo_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Mutating actions go through /api/admin (service role, server-side only)
// -- admins still can't write `places` directly via RLS, on purpose.
async function callAdminApi(action, params) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export function reviewSubmission(id, decision, note) {
  return callAdminApi('reviewSubmission', { id, decision, note });
}

export function reviewEditSuggestion(id, decision, note) {
  return callAdminApi('reviewEditSuggestion', { id, decision, note });
}

export function updatePlace(placeId, fields) {
  return callAdminApi('updatePlace', { placeId, fields });
}

export function previewOsmUpdate(osmExport) {
  return callAdminApi('previewOsmUpdate', { osmExport });
}

export function applyOsmUpdate(osmExport) {
  return callAdminApi('applyOsmUpdate', { osmExport });
}
