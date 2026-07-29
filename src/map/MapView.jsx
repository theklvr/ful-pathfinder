import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Map as MaplibreMap, NavigationControl, Marker, addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildStyle } from './style';
import { CATEGORY_COLOR, DEFAULT_MARKER_COLOR } from '../data/categories';
import { CATEGORY_ICON_PATH, DEFAULT_ICON_PATH } from '../data/categoryIcons';

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

// Felele (permanent site) campus, Federal University Lokoja.
// Source: Wikipedia/Wikidata (7°51'34"N 6°41'01"E) — a public reference, not a
// ground survey point. Correct once docs/SURVEY-GUIDE.md data comes in.
const FELELE_CENTER = [6.68361, 7.85944];
const FELELE_ZOOM = 15;
const PLACE_ZOOM = 18;
const NAV_ZOOM = 18.5;

const MapView = forwardRef(function MapView(
  { places, nodes = [], edges = [], route, userPosition, navigating = false, onPlaceClick, onUserPositionDrag },
  ref,
) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [flavor, setFlavor] = useState('light');

  useImperativeHandle(ref, () => ({
    flyTo(place) {
      mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: PLACE_ZOOM });
    },
  }));

  useEffect(() => {
    mapRef.current = new MaplibreMap({
      container: containerRef.current,
      style: buildStyle(flavor),
      center: FELELE_CENTER,
      zoom: FELELE_ZOOM,
    });

    mapRef.current.addControl(new NavigationControl(), 'top-right');
    mapRef.current.on('load', () => {
      setMapLoaded(true);
      setStyleVersion((v) => v + 1);
    });

    // Exposed for debugging via the browser console or CDP — the previous
    // blank-screen bug (see PROGRESS.md) was hard to diagnose without this.
    window.__mapErrors = [];
    mapRef.current.on('error', (e) => window.__mapErrors.push(String(e.error?.message || e.error)));
    window.__map = mapRef.current;

    return () => {
      mapRef.current.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light/dark map style switcher -- our free equivalent of Google Maps'
  // map-type toggle (no satellite imagery, that needs a paid provider).
  // Swapping the style clears custom sources/layers, so bump styleVersion
  // to make the effects below re-add the path network and route line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    // diff:false forces a full teardown/rebuild instead of MapLibre's
    // default style-diffing. With custom layers (route, network-debug)
    // already present, the diff path was silently stalling and never
    // firing style.load, leaving those layers gone until reload.
    map.setStyle(buildStyle(flavor), { diff: false });
    map.once('style.load', () => setStyleVersion((v) => v + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flavor]);

  // The surveyed path network, drawn as real walking paths (docs/ROADMAP.md
  // Day 7) -- a light casing plus a dashed amber line, echoing the crest's
  // "laterite footpaths" theme. Hidden while actively navigating to cut
  // visual clutter, like a real nav app does.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || map.getSource('network-debug')) return;
    if (nodes.length === 0 || edges.length === 0) return;

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const features = edges
      .map((e) => {
        const source = nodeById.get(e.source_node);
        const target = nodeById.get(e.target_node);
        if (!source || !target) return null;
        return {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [source.lng, source.lat],
              [target.lng, target.lat],
            ],
          },
        };
      })
      .filter(Boolean);

    map.addSource('network-debug', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });

    map.addLayer({
      id: 'network-debug-casing',
      type: 'line',
      source: 'network-debug',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 4.5,
        'line-opacity': 0.85,
      },
    });

    map.addLayer({
      id: 'network-debug-layer',
      type: 'line',
      source: 'network-debug',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f2a93b',
        'line-width': 2.5,
        'line-dasharray': [0.2, 1.6],
        'line-opacity': 0.9,
      },
    });
  }, [mapLoaded, styleVersion, nodes, edges]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer('network-debug-layer')) return;
    const visibility = navigating ? 'none' : 'visible';
    map.setLayoutProperty('network-debug-casing', 'visibility', visibility);
    map.setLayoutProperty('network-debug-layer', 'visibility', visibility);
  }, [mapLoaded, styleVersion, navigating]);

  // Highlighted route line for the active Directions request (Day 9).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const data = route
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } }] }
      : { type: 'FeatureCollection', features: [] };

    const source = map.getSource('route');
    if (source) {
      source.setData(data);
      return;
    }

    map.addSource('route', { type: 'geojson', data });
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#0B2545',
        'line-width': 10,
        'line-opacity': 0.35,
      },
    });
    map.addLayer({
      id: 'route-layer',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#4FA8E0',
        'line-width': 6,
        'line-opacity': 0.95,
      },
    });
  }, [mapLoaded, styleVersion, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(places.map((p) => p.id));
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const place of places) {
      if (markersRef.current.has(place.id)) continue;
      const el = document.createElement('div');
      el.className = 'place-marker';
      el.style.backgroundColor = CATEGORY_COLOR[place.category] ?? DEFAULT_MARKER_COLOR;
      el.innerHTML = `<svg class="place-marker-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICON_PATH[place.category] ?? DEFAULT_ICON_PATH}</svg>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPlaceClick?.(place);
      });
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([place.lng, place.lat]).addTo(map);
      markersRef.current.set(place.id, marker);
    }
  }, [places, onPlaceClick]);

  // "You are here" puck: draggable so a walker can correct GPS drift
  // (consumer phone GPS is only accurate to ~5-15m — docs/ARCHITECTURE.md).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userPosition) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-puck';
      el.innerHTML = '<div class="user-puck-cone"></div><div class="user-puck-dot"></div>';
      const marker = new Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat([userPosition.lng, userPosition.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        onUserPositionDrag?.(lat, lng);
      });
      userMarkerRef.current = marker;
    } else {
      userMarkerRef.current.setLngLat([userPosition.lng, userPosition.lat]);
    }

    const cone = userMarkerRef.current.getElement().querySelector('.user-puck-cone');
    if (cone) cone.style.display = userPosition.heading != null ? 'block' : 'none';
    if (cone && userPosition.heading != null) cone.style.transform = `rotate(${userPosition.heading}deg)`;
  }, [userPosition, onUserPositionDrag]);

  // Camera follows the walker while navigating, like a real turn-by-turn app.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigating || !userPosition) return;
    map.easeTo({ center: [userPosition.lng, userPosition.lat], zoom: Math.max(map.getZoom(), NAV_ZOOM), duration: 800 });
  }, [navigating, userPosition]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <button
        type="button"
        className="map-style-toggle"
        aria-label={flavor === 'light' ? 'Switch to dark map' : 'Switch to light map'}
        onClick={() => setFlavor((f) => (f === 'light' ? 'dark' : 'light'))}
      >
        {flavor === 'light' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" />
            <line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" />
            <line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
          </svg>
        )}
      </button>
    </div>
  );
});

export default MapView;
