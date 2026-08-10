import { addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// Shared one-time MapLibre setup, used by both MapView (the main app map)
// and SharePage (its own lightweight map for viewing a shared location) --
// factored out so a second map instance doesn't need to duplicate it or,
// worse, silently skip it and render blank.
let done = false;

export function setupMapLibre() {
  if (done) return;
  done = true;

  // maplibre-gl computes its worker script URL relative to its own bundled
  // chunk's import.meta.url at runtime, which Vite's static analyzer can't
  // see -- so a production build never emits/copies maplibre-gl-worker.mjs,
  // the worker silently fails to start, and vector tiles never get parsed
  // (only DOM markers render; the whole basemap stays blank). Point it at a
  // manually-copied static copy instead (see public/maplibre/, and re-copy
  // from node_modules/maplibre-gl/dist/ if the maplibre-gl version changes).
  setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

  const protocol = new Protocol();
  addProtocol('pmtiles', protocol.tile);
}
