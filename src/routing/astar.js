import { haversine } from './haversine.js';

class MinHeap {
  constructor() {
    this.items = []; // { node, priority }
  }

  isEmpty() {
    return this.items.length === 0;
  }

  push(node, priority) {
    this.items.push({ node, priority });
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._bubbleDown(0);
    }
    return top.node;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  _bubbleDown(i) {
    const n = this.items.length;
    for (;;) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < n && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}

function reconstructPath(cameFrom, current) {
  const path = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    path.unshift(current);
  }
  return path;
}

// graph: Map<nodeId, Array<{ to, weight }>>, from buildGraph().
// coords: Map<nodeId, { lat, lng }>, from buildGraph() — kept in the
// signature to match docs/ARCHITECTURE.md's documented shape, even though
// this function only touches it indirectly via `h`.
// h(a, b): heuristic from node a to node b (straight-line distance to the
// goal). Must never overestimate the true remaining cost, or the result
// stops being guaranteed optimal.
export function astar(graph, coords, start, goal, h) {
  if (!graph.has(start) || !graph.has(goal)) return null;

  const open = new MinHeap();
  const gScore = new Map([[start, 0]]);
  const cameFrom = new Map();
  const visited = new Set();

  open.push(start, h(start, goal));

  while (!open.isEmpty()) {
    const current = open.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    if (current === goal) return reconstructPath(cameFrom, current);

    for (const { to, weight } of graph.get(current) ?? []) {
      const tentative = gScore.get(current) + weight;
      if (tentative < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentative);
        open.push(to, tentative + h(to, goal));
      }
    }
  }

  return null;
}

// Dijkstra is A* with a heuristic that's always zero — no bias towards the
// goal, so it explores by pure accumulated distance. Used to double-check
// that A*'s heuristic isn't cutting corners.
export function dijkstra(graph, coords, start, goal) {
  return astar(graph, coords, start, goal, () => 0);
}

// Builds the h(a, b) function astar()/dijkstra() expect, backed by
// haversine distance between two node ids' real coordinates.
export function haversineHeuristic(coords) {
  return (a, b) => haversine(coords.get(a), coords.get(b));
}
