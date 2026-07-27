import { useEffect, useRef } from 'react';
import { Map, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { blankStyle } from './style';

// Felele (permanent site) campus, Federal University Lokoja.
// Approximate, to be corrected once survey data gives a real campus centroid.
const FELELE_CENTER = [6.74, 7.8];
const FELELE_ZOOM = 16;

export default function MapView() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    mapRef.current = new Map({
      container: containerRef.current,
      style: blankStyle,
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
