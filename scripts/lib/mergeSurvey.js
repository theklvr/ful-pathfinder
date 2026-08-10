// Pure merge logic, extracted from scripts/merge-survey.mjs so api/admin.js
// can run the exact same dedupe/snap/connectivity-check logic against live
// Supabase data as the CLI script runs against the local canonical files.
// No filesystem access -- takes existing + osm-derived places/nodes/edges
// as plain arrays, returns the merge result and report as plain data.
//
// Returns `newPlaces`/`newNodes`/`newEdges` (the genuinely-new additions,
// safe to INSERT without touching anything that already exists) separately
// from the full connectivity-check result computed over existing+new
// combined -- callers that must never delete/replace existing rows (an
// admin-triggered live update, unlike the CLI script's local canonical
// files) should only ever write the "new" arrays.

import { haversineLngLat } from './convertOsm.js';

const CROSS_SOURCE_SNAP_METERS = 12;
const DUPLICATE_PLACE_METERS = 30;
const SAME_SPOT_METERS = 15;
const NAME_JACCARD_THRESHOLD = 0.5;

function normalizeName(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function wordsOf(s) {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}
function nameJaccard(a, b) {
  const A = wordsOf(a);
  const B = wordsOf(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

export function mergeSurveyData({ existingPlaces, existingNodes, existingEdges, osmPlaces, osmNodes, osmEdges }) {
  // ---------- Places ----------
  const duplicatePlaces = [];
  const likelyDuplicatePlaces = [];
  const possibleDuplicatePlaces = [];
  const newPlaces = [];

  for (const osmPlace of osmPlaces) {
    const withDistance = existingPlaces.map((ex) => ({ ex, dist: haversineLngLat([osmPlace.lng, osmPlace.lat], [ex.lng, ex.lat]) }));
    const nameMatches = withDistance.filter(({ ex }) => nameJaccard(ex.name, osmPlace.name) >= NAME_JACCARD_THRESHOLD);

    if (nameMatches.length) {
      const closest = nameMatches.reduce((a, b) => (a.dist < b.dist ? a : b));
      if (closest.dist <= DUPLICATE_PLACE_METERS) {
        duplicatePlaces.push({ osmName: osmPlace.name, existingName: closest.ex.name, distanceMeters: Math.round(closest.dist) });
        continue;
      }
      likelyDuplicatePlaces.push({
        osmName: osmPlace.name,
        existingName: closest.ex.name,
        distanceMeters: Math.round(closest.dist),
        reason: 'name matches but far apart',
      });
      continue;
    }

    const closeAny = withDistance.filter(({ dist }) => dist <= SAME_SPOT_METERS);
    if (closeAny.length) {
      const closest = closeAny.reduce((a, b) => (a.dist < b.dist ? a : b));
      possibleDuplicatePlaces.push({
        osmName: osmPlace.name,
        existingName: closest.ex.name,
        distanceMeters: Math.round(closest.dist),
        reason: 'same spot, different name',
      });
      continue;
    }

    newPlaces.push(osmPlace);
  }

  const finalPlaces = [...existingPlaces, ...newPlaces];

  // ---------- Network ----------
  const existingIds = existingNodes.map((n) => n.id);
  let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;

  const osmIdToFinalId = new Map();
  const ambiguousJunctionMerges = [];
  let exactMergesIntoExisting = 0;
  const newNodes = [];

  for (const osmNode of osmNodes) {
    const candidates = existingNodes
      .map((ex) => ({ ex, dist: haversineLngLat([osmNode.lng, osmNode.lat], [ex.lng, ex.lat]) }))
      .filter(({ dist }) => dist <= CROSS_SOURCE_SNAP_METERS);

    if (candidates.length === 1) {
      osmIdToFinalId.set(osmNode.id, candidates[0].ex.id);
      exactMergesIntoExisting++;
    } else if (candidates.length > 1) {
      ambiguousJunctionMerges.push({
        osmNodeId: osmNode.id,
        candidateExistingIds: candidates.map((c) => c.ex.id),
        distancesMeters: candidates.map((c) => Math.round(c.dist)),
      });
      const finalId = nextId++;
      osmIdToFinalId.set(osmNode.id, finalId);
      newNodes.push({ id: finalId, lat: osmNode.lat, lng: osmNode.lng });
    } else {
      const finalId = nextId++;
      osmIdToFinalId.set(osmNode.id, finalId);
      newNodes.push({ id: finalId, lat: osmNode.lat, lng: osmNode.lng });
    }
  }

  const finalNodes = [...existingNodes, ...newNodes];

  const seenPairs = new Set();
  for (const e of existingEdges) {
    const key = e.source < e.target ? `${e.source}-${e.target}` : `${e.target}-${e.source}`;
    seenPairs.add(key);
  }

  const newEdges = [];
  let degenerateSkipped = 0;
  let duplicateEdgesSkipped = 0;
  for (const e of osmEdges) {
    const source = osmIdToFinalId.get(e.source);
    const target = osmIdToFinalId.get(e.target);
    if (source == null || target == null || source === target) {
      degenerateSkipped++;
      continue;
    }
    const key = source < target ? `${source}-${target}` : `${target}-${source}`;
    if (seenPairs.has(key)) {
      duplicateEdgesSkipped++;
      continue;
    }
    seenPairs.add(key);
    newEdges.push({ source, target, path_type: e.path_type });
  }

  const finalEdges = [...existingEdges, ...newEdges];

  // ---------- Connectivity check (over the combined existing+new state) ----------
  const adjacency = new Map();
  for (const n of finalNodes) adjacency.set(n.id, []);
  for (const e of finalEdges) {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  }

  const componentOf = new Map();
  let componentCount = 0;
  for (const n of finalNodes) {
    if (componentOf.has(n.id)) continue;
    componentCount++;
    const queue = [n.id];
    componentOf.set(n.id, componentCount);
    while (queue.length) {
      const cur = queue.pop();
      for (const nb of adjacency.get(cur) ?? []) {
        if (!componentOf.has(nb)) {
          componentOf.set(nb, componentCount);
          queue.push(nb);
        }
      }
    }
  }

  const gatePlace = finalPlaces.find((p) => p.name === 'School Gate');
  let gateComponent = null;
  if (gatePlace && finalNodes.length) {
    let best = Infinity;
    let bestNode = null;
    for (const n of finalNodes) {
      const d = haversineLngLat([gatePlace.lng, gatePlace.lat], [n.lng, n.lat]);
      if (d < best) {
        best = d;
        bestNode = n;
      }
    }
    gateComponent = componentOf.get(bestNode.id);
  }

  const placesInDisconnectedComponents = [];
  if (gateComponent != null) {
    for (const place of finalPlaces) {
      let best = Infinity;
      let bestNode = null;
      for (const n of finalNodes) {
        const d = haversineLngLat([place.lng, place.lat], [n.lng, n.lat]);
        if (d < best) {
          best = d;
          bestNode = n;
        }
      }
      if (bestNode && componentOf.get(bestNode.id) !== gateComponent) {
        placesInDisconnectedComponents.push({ name: place.name, nearestNodeId: bestNode.id, component: componentOf.get(bestNode.id) });
      }
    }
  }

  const connectivityOk = gateComponent != null && placesInDisconnectedComponents.length === 0;

  return {
    newPlaces,
    newNodes,
    newEdges,
    finalPlaces,
    finalNodes,
    finalEdges,
    connectivityOk,
    report: {
      places: {
        existing: existingPlaces.length,
        osmConsidered: osmPlaces.length,
        new: newPlaces.length,
        duplicate: duplicatePlaces,
        likelyDuplicate: likelyDuplicatePlaces,
        possibleDuplicate: possibleDuplicatePlaces,
        finalTotal: finalPlaces.length,
      },
      network: {
        existingNodes: existingNodes.length,
        osmNodes: osmNodes.length,
        mergedIntoExisting: exactMergesIntoExisting,
        ambiguousJunctionMerges,
        newNodes: newNodes.length,
        finalNodes: finalNodes.length,
        existingEdges: existingEdges.length,
        osmEdgesAdded: newEdges.length,
        degenerateOrUnresolvedSkipped: degenerateSkipped,
        duplicateEdgesSkipped,
        finalEdges: finalEdges.length,
      },
      connectivity: {
        ok: connectivityOk,
        componentCount,
        gateComponent,
        reachableFromGate: gateComponent != null ? [...componentOf.values()].filter((c) => c === gateComponent).length : 0,
        placesInDisconnectedComponents,
      },
    },
  };
}
