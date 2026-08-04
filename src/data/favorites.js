import { supabase } from '../lib/supabase';

export async function fetchFavoriteIds(userId) {
  if (!userId) return new Set();
  const { data, error } = await supabase.from('favorites').select('place_id').eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((row) => row.place_id));
}

export async function addFavorite(userId, placeId) {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, place_id: placeId });
  if (error) throw error;
}

export async function removeFavorite(userId, placeId) {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('place_id', placeId);
  if (error) throw error;
}
