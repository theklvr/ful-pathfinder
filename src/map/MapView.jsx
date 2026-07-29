import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Map as MaplibreMap, NavigationControl, Marker, addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildStyle } from './style';
import { CATEGORY_COLOR, DEFAULT_MARKER_COLOR } from '../data/categories';

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

  useImperativeHandle(ref, () => ({
    flyTo(place) {
      mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: PLACE_ZOOM });
    },
  }));

  useEffect(() => {
    mapRef.current = new MaplibreMap({
      container: containerRef.current,
      style: buildStyle(),
      center: FELELE_CENTER,
      zoom: FELELE_ZOOM,
    });

    mapRef.current.addControl(new NavigationControl(), 'top-right');
    mapRef.current.on('load', () => setMapLoaded(true));

    // Exposed for debugging via the browser console or CDP — the previous
    // blank-screen bug (see PROGRESS.md) was hard to diagnose without this.
    window.__mapErrors = [];
    mapRef.current.on('error', (e) => window.__mapErrors.push(String(e.error?.message || e.error)));
    window.__map = mapRef.current;

    return () => {
      mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

  // Debug layer: draw the surveyed path network as faint lines so it can be
  // eyeballed against the basemap (docs/ROADMAP.md Day 7). Hidden while
  // actively navigating to cut visual clutter, like a real nav app does.
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
      id: 'network-debug-layer',
      type: 'line',
      source: 'network-debug',
      paint: {
        'line-color': '#0B2545',
        'line-width': 1.5,
        'line-opacity': 0.2,
      },
    });
  }, [mapLoaded, nodes, edges]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer('network-debug-layer')) return;
    map.setLayoutProperty('network-debug-layer', 'visibility', navigating ? 'none' : 'visible');
  }, [mapLoaded, navigating]);

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
  }, [mapLoaded, route]);

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
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPlaceClick?.(place);
      });
      const marker = new Marker({ element: el }).setLngLat([place.lng, place.lat]).addTo(map);
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

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
});

export default MapView;
