import { supabase } from '../lib/supabase';

export async function recordVisit(userId, placeId) {
  // Best-effort: a walker arriving at their destination shouldn't see an
  // error if this write fails for some reason.
  try {
    await supabase.from('visited_places').insert({ user_id: userId, place_id: placeId });
  } catch {
    // Ignore -- the timeline just won't have this entry.
  }
}

export async function fetchVisited(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('visited_places')
    .select('id, visited_at, places(id, name, category)')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.filter((row) => row.places);
}
