import { supabase } from '../lib/supabase';

const POINTS_PER_APPROVED_PLACE = 10;
const POINTS_PER_APPROVED_EDIT = 5;
const POINTS_PER_REVIEW = 2;
const POINTS_PER_LEVEL = 25;

const BADGES = [
  { minPoints: 150, label: 'Campus Legend' },
  { minPoints: 50, label: 'Pathfinder' },
  { minPoints: 10, label: 'Contributor' },
  { minPoints: 0, label: 'Newcomer' },
];

function badgeFor(points) {
  return BADGES.find((b) => points >= b.minPoints).label;
}

// Real counts from the tables that already exist, not invented numbers --
// only approved submissions/edits count, so points reflect contributions
// that actually made it onto the live map.
export async function fetchContributorStats(userId) {
  if (!userId) return null;

  const [placesRes, editsRes, reviewsRes] = await Promise.all([
    supabase.from('place_submissions').select('id', { count: 'exact', head: true }).eq('submitted_by', userId).eq('status', 'approved'),
    supabase
      .from('place_edit_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_by', userId)
      .eq('status', 'approved'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (placesRes.error) throw placesRes.error;
  if (editsRes.error) throw editsRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  const approvedPlaces = placesRes.count ?? 0;
  const approvedEdits = editsRes.count ?? 0;
  const reviewCount = reviewsRes.count ?? 0;

  const points = approvedPlaces * POINTS_PER_APPROVED_PLACE + approvedEdits * POINTS_PER_APPROVED_EDIT + reviewCount * POINTS_PER_REVIEW;
  const level = Math.floor(points / POINTS_PER_LEVEL) + 1;
  const pointsToNextLevel = level * POINTS_PER_LEVEL - points;

  return { points, level, pointsToNextLevel, badge: badgeFor(points), approvedPlaces, approvedEdits, reviewCount };
}
