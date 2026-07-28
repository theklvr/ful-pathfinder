import { haversine } from './haversine.js';

// Snaps an arbitrary point (e.g. a live GPS fix) to the closest graph node.
export function nearestNodeId(point, coords) {
  let bestId = null;
  let bestDist = Infinity;
  for (const [id, coord] of coords) {
    const d = haversine(point, coord);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

// Builds an adjacency list from nodes + edges as fetched from Supabase.
// graph: Map<nodeId, Array<{ to, weight }>>
// coords: Map<nodeId, { lat, lng }>
export function buildGraph(nodes, edges) {
  const graph = new Map();
  const coords = new Map();

  for (const node of nodes) {
    graph.set(node.id, []);
    coords.set(node.id, { lat: node.lat, lng: node.lng });
  }

  for (const edge of edges) {
    graph.get(edge.source_node)?.push({ to: edge.target_node, weight: edge.distance_m });
    if (edge.bidirectional !== false) {
      graph.get(edge.target_node)?.push({ to: edge.source_node, weight: edge.distance_m });
    }
  }

  return { graph, coords };
}
