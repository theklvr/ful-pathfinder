// Public, unauthenticated walking-directions endpoint for other teams'
// projects (a chatbot, an exam-venue platform) to call -- same access
// posture as the app itself (read-only, anon key), just server-side so
// routing logic lives in one place instead of being reimplemented per
// consumer. See docs/API.md for the documented contract.
//
// GET /api/route?from=<place name | "lat,lng">&to=<place name | "lat,lng">&unit=metric|imperial

import { createClient } from '@supabase/supabase-js';
import { buildGraph, nearestNodeId } from '../src/routing/graph.js';
import { astar, haversineHeuristic } from '../src/routing/astar.js';
import { haversine } from '../src/routing/haversine.js';
import { buildSteps } from '../src/routing/steps.js';
import { formatDistance, formatDuration } from '../src/routing/format.js';

const COORD_PATTERN = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/;

function resolvePoint(input, places) {
  const coordMatch = input.match(COORD_PATTERN);
  if (coordMatch) {
    return { id: `point:${input}`, name: input, lat: Number(coordMatch[1]), lng: Number(coordMatch[2]) };
  }

  const query = input.trim().toLowerCase();
  const matches = places.filter(
    (p) => p.name.toLowerCase() === query || (p.aliases ?? []).some((a) => a.toLowerCase() === query),
  );
  if (matches.length === 1) return matches[0];

  // Fall back to a substring match only if it's unambiguous -- same
  // "don't guess when there's a conflict" principle as scripts/prepare-photos.mjs.
  const partial = places.filter(
    (p) => p.name.toLowerCase().includes(query) || (p.aliases ?? []).some((a) => a.toLowerCase().includes(query)),
  );
  if (partial.length === 1) return partial[0];

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Only GET is supported' });
    return;
  }

  const { from, to, unit } = req.query;
  if (!from || !to) {
    res.status(400).json({ error: 'Both "from" and "to" query params are required (a place name or "lat,lng")' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'Server misconfigured (missing Supabase env vars)' });
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [placesRes, nodesRes, edgesRes] = await Promise.all([
    supabase.from('places').select('*'),
    supabase.from('nodes').select('*'),
    supabase.from('edges').select('*'),
  ]);
  if (placesRes.error || nodesRes.error || edgesRes.error) {
    res.status(500).json({ error: 'Could not load campus data' });
    return;
  }
  const places = placesRes.data;

  const origin = resolvePoint(String(from), places);
  const destination = resolvePoint(String(to), places);
  if (!origin) {
    res.status(404).json({ error: `"${from}" doesn't match a known place (and isn't a "lat,lng" pair)` });
    return;
  }
  if (!destination) {
    res.status(404).json({ error: `"${to}" doesn't match a known place (and isn't a "lat,lng" pair)` });
    return;
  }

  const { graph, coords } = buildGraph(nodesRes.data, edgesRes.data);
  const originNodeId = origin.nearest_node_id ?? nearestNodeId(origin, coords);
  const destinationNodeId = destination.nearest_node_id ?? nearestNodeId(destination, coords);

  const path = astar(graph, coords, originNodeId, destinationNodeId, haversineHeuristic(coords));
  if (!path) {
    res.status(404).json({ error: 'No walking route exists between these two points' });
    return;
  }

  const distanceMeters = path.slice(1).reduce((sum, id, i) => sum + haversine(coords.get(path[i]), coords.get(id)), 0);
  const routeUnit = unit === 'imperial' ? 'imperial' : 'metric';
  const steps = buildSteps(path, coords, origin, destination, places, routeUnit);

  res.status(200).json({
    origin: { name: origin.name, lat: origin.lat, lng: origin.lng },
    destination: { name: destination.name, lat: destination.lat, lng: destination.lng },
    distanceMeters: Math.round(distanceMeters),
    distanceLabel: formatDistance(distanceMeters, routeUnit),
    walkMinutesLabel: formatDuration(distanceMeters),
    path: path.map((id) => coords.get(id)),
    steps: steps.map((s) => ({ text: s.text, kind: s.kind })),
  });
}
