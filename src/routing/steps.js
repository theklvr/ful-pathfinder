import { haversine } from './haversine.js';

const TURN_THRESHOLD_DEG = 25;
const LANDMARK_RADIUS_M = 50;

function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function turnLabel(deltaDeg) {
  if (deltaDeg > TURN_THRESHOLD_DEG) return 'Turn right';
  if (deltaDeg < -TURN_THRESHOLD_DEG) return 'Turn left';
  return 'Continue straight';
}

function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function nearestLandmark(point, places, excludeIds) {
  let best = null;
  let bestDist = LANDMARK_RADIUS_M;
  for (const place of places) {
    if (excludeIds.has(place.id)) continue;
    const d = haversine(point, { lat: place.lat, lng: place.lng });
    if (d < bestDist) {
      bestDist = d;
      best = place;
    }
  }
  return best;
}

// path: array of node ids from astar(). coords: Map<nodeId, { lat, lng }>.
// origin/destination: place rows, used to name the first/last step.
// places: all places, used to call out nearby landmarks along turns.
export function buildSteps(path, coords, origin, destination, places) {
  if (!path || path.length < 2) return [];

  const usedPlaceIds = new Set([origin.id, destination.id]);
  const steps = [`Head out from ${origin.name}.`];

  let legStart = 0;
  let legBearing = bearing(coords.get(path[0]), coords.get(path[1]));

  for (let i = 1; i < path.length - 1; i++) {
    const nextBearing = bearing(coords.get(path[i]), coords.get(path[i + 1]));
    const delta = ((nextBearing - legBearing + 540) % 360) - 180;

    if (Math.abs(delta) > TURN_THRESHOLD_DEG) {
      const legDistance = path
        .slice(legStart, i + 1)
        .slice(1)
        .reduce((sum, id, j) => sum + haversine(coords.get(path[legStart + j]), coords.get(id)), 0);

      const landmark = nearestLandmark(coords.get(path[i]), places, usedPlaceIds);
      if (landmark) usedPlaceIds.add(landmark.id);
      const landmarkText = landmark ? `, past ${landmark.name}` : '';

      steps.push(`${turnLabel(delta)} after ${formatDistance(legDistance)}${landmarkText}.`);

      legStart = i;
      legBearing = nextBearing;
    }
  }

  steps.push(`Arrive at ${destination.name}.`);
  return steps;
}
