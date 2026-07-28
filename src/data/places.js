import { supabase } from '../lib/supabase';

export async function fetchPlaces() {
  const { data, error } = await supabase.from('places').select('*').order('name');
  if (error) throw error;
  return data;
}
