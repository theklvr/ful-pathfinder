import { useEffect, useRef } from 'react';
import { Map, NavigationControl, addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildStyle } from './style';

const protocol = new Protocol();
addProtocol('pmtiles', protocol.tile);

// Felele (permanent site) campus, Federal University Lokoja.
// Source: Wikipedia/Wikidata (7°51'34"N 6°41'01"E) — a public reference, not a
// ground survey point. Correct once docs/SURVEY-GUIDE.md data comes in.
const FELELE_CENTER = [6.68361, 7.85944];
const FELELE_ZOOM = 15;

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

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

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
