import { supabase } from '../lib/supabase';

export async function fetchNodes() {
  const { data, error } = await supabase.from('nodes').select('*');
  if (error) throw error;
  return data;
}

export async function fetchEdges() {
  const { data, error } = await supabase.from('edges').select('*');
  if (error) throw error;
  return data;
}
