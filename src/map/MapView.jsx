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

const MapView = forwardRef(function MapView({ places, nodes = [], edges = [], route, onPlaceClick }, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
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
  // eyeballed against the basemap (docs/ROADMAP.md Day 7).
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
        'line-color': '#000000',
        'line-width': 1.5,
        'line-opacity': 0.25,
      },
    });
  }, [mapLoaded, nodes, edges]);

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
        'line-color': '#0891b2',
        'line-width': 5,
        'line-opacity': 0.9,
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

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
});

export default MapView;
