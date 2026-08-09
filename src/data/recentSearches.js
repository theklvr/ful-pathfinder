const STORAGE_KEY = 'ful-pathfinder:recent-searches';
const MAX_RECENTS = 8;

export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(place) {
  const existing = getRecentSearches().filter((p) => p.id !== place.id);
  const next = [{ id: place.id, name: place.name, category: place.category }, ...existing].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or disabled (private browsing) -- recents are a
    // convenience, not worth surfacing an error for.
  }
  return next;
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
}
