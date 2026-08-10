import { supabase } from '../lib/supabase';

export async function createShare(userId, lat, lng) {
  const { data, error } = await supabase
    .from('location_shares')
    .insert({ user_id: userId, lat, lng })
    .select('id, expires_at')
    .single();
  if (error) throw error;
  return data;
}

export async function updateSharePosition(shareId, lat, lng) {
  const { error } = await supabase
    .from('location_shares')
    .update({ lat, lng, updated_at: new Date().toISOString() })
    .eq('id', shareId);
  if (error) throw error;
}

export async function stopShare(shareId) {
  const { error } = await supabase.from('location_shares').update({ active: false }).eq('id', shareId);
  if (error) throw error;
}

export async function fetchShare(shareId) {
  const { data, error } = await supabase
    .from('location_shares')
    .select('id, lat, lng, active, expires_at, updated_at, user_id')
    .eq('id', shareId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // profiles is a separate public-read table -- a share row doesn't carry
  // the sharer's name/photo directly, so fetch it alongside for the "X is
  // sharing their location" greeting on the viewer's page.
  const { data: profile } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', data.user_id).maybeSingle();
  return { ...data, sharerName: profile?.display_name ?? null, sharerAvatar: profile?.avatar_url ?? null };
}

export async function fetchMyActiveShare(userId) {
  const { data, error } = await supabase
    .from('location_shares')
    .select('id, expires_at, active')
    .eq('user_id', userId)
    .eq('active', true)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
