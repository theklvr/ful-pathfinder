import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Map, NavigationControl, Marker, addProtocol } from 'maplibre-gl';
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

const MapView = forwardRef(function MapView({ places, onPlaceClick }, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());

  useImperativeHandle(ref, () => ({
    flyTo(place) {
      mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: PLACE_ZOOM });
    },
  }));

  useEffect(() => {
    mapRef.current = new Map({
      container: containerRef.current,
      style: buildStyle(),
      center: FELELE_CENTER,
      zoom: FELELE_ZOOM,
    });

    mapRef.current.addControl(new NavigationControl(), 'top-right');

    return () => {
      mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

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
