export function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Matches the ~1.3 m/s average walking pace from docs/ARCHITECTURE.md.
export function formatDuration(m) {
  const minutes = Math.round(m / 1.3 / 60);
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}
