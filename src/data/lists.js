import { supabase } from '../lib/supabase';

export async function fetchMyLists(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('lists')
    .select('id, name, created_at, list_items(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map((l) => ({ ...l, itemCount: l.list_items?.[0]?.count ?? 0 }));
}

export async function createList(userId, name) {
  const { data, error } = await supabase.from('lists').insert({ user_id: userId, name }).select('id, name, created_at').single();
  if (error) throw error;
  return { ...data, itemCount: 0 };
}

export async function deleteList(listId) {
  const { error } = await supabase.from('lists').delete().eq('id', listId);
  if (error) throw error;
}

export async function fetchListItems(listId) {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, place_id, places(id, name, category, description, photo_url, lat, lng)')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => row.places).filter(Boolean);
}

export async function addToList(listId, placeId) {
  const { error } = await supabase.from('list_items').insert({ list_id: listId, place_id: placeId });
  if (error && error.code !== '23505') throw error; // 23505 = already in this list, fine
}

export async function removeFromList(listId, placeId) {
  const { error } = await supabase.from('list_items').delete().eq('list_id', listId).eq('place_id', placeId);
  if (error) throw error;
}
