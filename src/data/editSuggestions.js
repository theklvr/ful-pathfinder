import { supabase } from '../lib/supabase';

export async function submitEditSuggestion({ userId, placeId, kind, note, suggestedPhotoUrl }) {
  const { error } = await supabase.from('place_edit_suggestions').insert({
    submitted_by: userId,
    place_id: placeId,
    kind,
    note,
    suggested_photo_url: suggestedPhotoUrl || null,
  });
  if (error) throw error;
}

export async function fetchMyEditSuggestions(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('place_edit_suggestions')
    .select('id, place_id, kind, note, status, created_at, places(name)')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
