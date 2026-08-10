export function mapsUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
}

// Generic share-a-link helper -- used for location-share links, which
// aren't tied to a `place` row the way sharePlace() is.
export async function shareUrl(title, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      // Cancelled or unsupported combination of fields -- fall back to clipboard.
    }
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    return true;
  }
  return false;
}

export async function sharePlace(place) {
  const text = `${place.name} — FUL PathFinder`;
  const url = mapsUrl(place);
  if (navigator.share) {
    try {
      await navigator.share({ title: place.name, text, url });
      return;
    } catch {
      // Cancelled or unsupported combination of fields — fall back to clipboard.
    }
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(`${text} — ${url}`);
  }
}
