import { supabase } from '../lib/supabase';

const PROFILE_COLUMNS = 'id, display_name, avatar_url, home_lat, home_lng, home_label, work_lat, work_lng, work_label, is_admin';

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProfile({ userId, displayName, avatarUrl }) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, display_name: displayName || null, avatar_url: avatarUrl || null, updated_at: new Date().toISOString() })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateHomeWork({ userId, home, work }) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      home_lat: home?.lat ?? null,
      home_lng: home?.lng ?? null,
      home_label: home?.label ?? null,
      work_lat: work?.lat ?? null,
      work_lng: work?.lng ?? null,
      work_label: work?.label ?? null,
      updated_at: new Date().toISOString(),
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
