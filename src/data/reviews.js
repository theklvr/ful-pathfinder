import { supabase } from '../lib/supabase';

export async function fetchReviews(placeId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, user_id, rating, comment, created_at')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function upsertReview({ userId, placeId, rating, comment }) {
  const { error } = await supabase
    .from('reviews')
    .upsert({ user_id: userId, place_id: placeId, rating, comment }, { onConflict: 'user_id,place_id' });
  if (error) throw error;
}

// One bulk query for a whole category list rather than one query per place.
export async function fetchRatingSummaries(placeIds) {
  if (!placeIds.length) return new Map();
  const { data, error } = await supabase.from('reviews').select('place_id, rating').in('place_id', placeIds);
  if (error) throw error;

  const totals = new Map();
  for (const row of data) {
    const cur = totals.get(row.place_id) ?? { sum: 0, count: 0 };
    cur.sum += row.rating;
    cur.count += 1;
    totals.set(row.place_id, cur);
  }

  const summaries = new Map();
  for (const [placeId, { sum, count }] of totals) {
    summaries.set(placeId, { average: sum / count, count });
  }
  return summaries;
}
