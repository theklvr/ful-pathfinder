// Plain hand-rolled service worker (no build-time manifest, no framework —
// public/ files aren't processed by Vite). Caches the app shell, the
// pmtiles basemap, and Supabase API responses so the app still works on a
// weak or dropped campus network (docs/ROADMAP.md Day 13).
const CACHE_NAME = 'ful-pathfinder-v1';
const PMTILES_PATH = '/map/felele.pmtiles';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(['/', PMTILES_PATH]))
      .catch(() => {}), // offline on first install: nothing to precache yet
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // The pmtiles library reads the basemap via HTTP Range requests. The
  // Cache API doesn't serve partial content on its own, so slice the
  // cached full file by hand.
  if (url.pathname === PMTILES_PATH) {
    event.respondWith(handlePmtilesRequest(event.request));
    return;
  }

  // Supabase REST calls (places/nodes/edges): prefer fresh data, fall back
  // to the last-known-good response when the network drops.
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // App shell (HTML/JS/CSS/icons): serve from cache instantly, refresh in
  // the background so the next visit picks up a new deploy.
  if (url.origin === self.location.origin && event.request.method === 'GET') {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

async function handlePmtilesRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  let full = await cache.match(PMTILES_PATH);

  if (!full) {
    try {
      const response = await fetch(new Request(PMTILES_PATH, { headers: {} }));
      if (!response.ok) return response;
      await cache.put(PMTILES_PATH, response.clone());
      full = response;
    } catch {
      return new Response('Map unavailable offline — visit once online to cache it.', { status: 503 });
    }
  }

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return full;

  const match = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);
  if (!match) return full;

  const buffer = await full.clone().arrayBuffer();
  const total = buffer.byteLength;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : total - 1;

  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await networkFetch) || new Response('Offline', { status: 503 });
}
