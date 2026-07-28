import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine } from './haversine.js';
import { buildGraph } from './graph.js';
import { astar, dijkstra, haversineHeuristic } from './astar.js';

// A small hand-checkable network: a short direct route (N1-N2-N3, 2 hops),
// a longer detour with more hops (N1-N4-N5-N3, 3 hops), and a same-hop-count
// decoy that covers far more distance (N1-N6-N3, 2 hops). A correct
// weighted shortest-path search must prefer the true minimum-distance route
// over both "fewer hops" and "same hop count" alternatives.
const coordsByNode = {
  N1: { lat: 7.86, lng: 6.68 },
  N2: { lat: 7.8605, lng: 6.68 },
  N3: { lat: 7.861, lng: 6.68 },
  N4: { lat: 7.86, lng: 6.681 },
  N5: { lat: 7.861, lng: 6.681 },
  N6: { lat: 7.8625, lng: 6.6825 },
};

const nodes = Object.entries(coordsByNode).map(([id, c]) => ({ id, ...c }));

const edges = [
  { source_node: 'N1', target_node: 'N2', distance_m: haversine(coordsByNode.N1, coordsByNode.N2) },
  { source_node: 'N2', target_node: 'N3', distance_m: haversine(coordsByNode.N2, coordsByNode.N3) },
  { source_node: 'N1', target_node: 'N4', distance_m: haversine(coordsByNode.N1, coordsByNode.N4) },
  { source_node: 'N4', target_node: 'N5', distance_m: haversine(coordsByNode.N4, coordsByNode.N5) },
  { source_node: 'N5', target_node: 'N3', distance_m: haversine(coordsByNode.N5, coordsByNode.N3) },
  { source_node: 'N1', target_node: 'N6', distance_m: 5000 },
  { source_node: 'N6', target_node: 'N3', distance_m: 5000 },
];

const { graph, coords } = buildGraph(nodes, edges);
const h = haversineHeuristic(coords);

test('A* finds the true shortest path, not just fewest hops or matching hop count', () => {
  const path = astar(graph, coords, 'N1', 'N3', h);
  assert.deepEqual(path, ['N1', 'N2', 'N3']);
});

test('Dijkstra (A* with a zero heuristic) agrees with A* on the same route', () => {
  const astarPath = astar(graph, coords, 'N1', 'N3', h);
  const dijkstraPath = dijkstra(graph, coords, 'N1', 'N3');
  assert.deepEqual(dijkstraPath, astarPath);
});

test('returns null when no path exists', () => {
  const isolatedNodes = [...nodes, { id: 'N7', lat: 7.9, lng: 6.9 }];
  const { graph: g2, coords: c2 } = buildGraph(isolatedNodes, edges);
  const h2 = haversineHeuristic(c2);
  assert.equal(astar(g2, c2, 'N1', 'N7', h2), null);
});
