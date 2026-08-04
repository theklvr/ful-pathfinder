import { supabase } from '../lib/supabase';

export async function submitPlace({ userId, name, category, aliases, description, photoUrl, lat, lng }) {
  const { error } = await supabase.from('place_submissions').insert({
    submitted_by: userId,
    name,
    category,
    aliases,
    description: description || null,
    photo_url: photoUrl || null,
    lat,
    lng,
  });
  if (error) throw error;
}

export async function fetchMySubmissions(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('place_submissions')
    .select('id, name, category, status, moderator_note, created_at')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
