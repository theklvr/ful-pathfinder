import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Map as MaplibreMap, NavigationControl, ScaleControl, Marker, addProtocol, setWorkerUrl } from 'maplibre-gl';
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

// No surveyed "importance" field exists yet (docs/SURVEY-GUIDE.md doesn't
// collect one) -- this is a category-based heuristic so the map isn't a wall
// of pins when zoomed out: major orientation landmarks show first, smaller
// amenities only once you're zoomed in close enough to actually walk to one.
const CATEGORY_MIN_ZOOM = {
  faculty: 0,
  admin: 0,
  hostel: 0,
  landmark: 0,
  sport: 15.5,
  health: 15.5,
  eatery: 16.5,
  atm: 16.5,
  service: 16.5,
};

const MapView = forwardRef(function MapView(
  {
    places,
    nodes = [],
    edges = [],
    route,
    userPosition,
    navigating = false,
    meActive = false,
    declutterByZoom = true,
    initialFlavor = 'light',
    onPlaceClick,
    onUserPositionDrag,
    onToggleMe,
    onOpenDirections,
    addPlaceMode = false,
    onMapClickForNewPlace,
    onStartAddPlace,
    onUseMyLocationForNewPlace,
  },
  ref,
) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [zoom, setZoom] = useState(FELELE_ZOOM);
  const [styleVersion, setStyleVersion] = useState(0);
  const [flavor, setFlavor] = useState(initialFlavor);
  const [mapTypeMenuOpen, setMapTypeMenuOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const addPlaceModeRef = useRef(addPlaceMode);
  const onMapClickForNewPlaceRef = useRef(onMapClickForNewPlace);
  const flavorRef = useRef(flavor);
  const initialFlavorRef = useRef(flavor);
  const hasHandledInitialLoadRef = useRef(false);
  const navigatingRef = useRef(navigating);

  useEffect(() => {
    addPlaceModeRef.current = addPlaceMode;
    onMapClickForNewPlaceRef.current = onMapClickForNewPlace;
  }, [addPlaceMode, onMapClickForNewPlace]);

  useEffect(() => {
    flavorRef.current = flavor;
  }, [flavor]);

  useEffect(() => {
    navigatingRef.current = navigating;
    // Every fresh "Start navigation" should follow the walker again, even if
    // a previous session ended with the camera paused from manual panning.
    if (navigating) setFollowing(true);
  }, [navigating]);

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
    // Live distance-to-pixel reference, updates automatically on zoom --
    // both units since walkers on campus think in metres, but not everyone
    // does.
    mapRef.current.addControl(new ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');
    mapRef.current.addControl(new ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'bottom-left');
    mapRef.current.on('zoom', () => setZoom(mapRef.current.getZoom()));
    mapRef.current.on('load', () => {
      setMapLoaded(true);
      setStyleVersion((v) => v + 1);
    });

    // While navigating, the camera follows the walker (see the effect
    // below) -- but a walker who drags the map to look ahead shouldn't have
    // it yanked back out from under them. Pause following on manual drag; a
    // "recenter" button (rendered below) lets them resume it deliberately.
    mapRef.current.on('dragstart', () => {
      if (navigatingRef.current) setFollowing(false);
    });

    // Add-a-place mode: the next raw map click (not a marker, those stop
    // propagation on their own click handler) drops the pin there. Reads
    // through refs rather than closing over props, since this listener is
    // only ever attached once for the map instance's lifetime.
    mapRef.current.on('click', (e) => {
      if (!addPlaceModeRef.current) return;
      onMapClickForNewPlaceRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
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
    // mapLoaded is a dependency, not just a guard -- without it, a style
    // change requested before the map's first 'load' event (e.g. tapping
    // the map-type button within the first ~second) would bail out here and
    // never retry, silently stranding the map on the old style forever
    // (this effect only re-fires when one of its deps actually changes, and
    // `flavor` wouldn't change again just because the click didn't "take").
    if (!map || !mapLoaded) return;

    if (!hasHandledInitialLoadRef.current) {
      hasHandledInitialLoadRef.current = true;
      if (flavor === initialFlavorRef.current) {
        // The map was already constructed with buildStyle(flavor) at this
        // exact value (see the mount effect above) -- reapplying it the
        // instant 'load' fires would be a pointless teardown/rebuild, and
        // exactly the kind of redundant setStyle call that was racing with
        // the buildings-fetch effect below. Only fall through to actually
        // apply a style here if the user changed flavor before the map had
        // even finished its first load.
        return;
      }
    }

    // diff:false forces a full teardown/rebuild instead of MapLibre's
    // default style-diffing. With custom layers (route, network-debug)
    // already present, the diff path was silently stalling and never
    // firing style.load, leaving those layers gone until reload.
    map.setStyle(buildStyle(flavor), { diff: false });
    map.once('style.load', () => setStyleVersion((v) => v + 1));
  }, [flavor, mapLoaded]);

  // Campus building footprints, drawn ourselves straight from the team's OSM
  // survey export (scripts/convert-survey-osm.mjs -> public/map/campus-
  // buildings.geojson). The basemap tile file predates that survey and
  // Protomaps' builds lag live OSM by days, so the buildings would otherwise
  // be invisible on the map for a long time regardless of how much gets
  // traced -- this shows them immediately instead of waiting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || map.getSource('campus-buildings')) return;

    fetch('/map/campus-buildings.geojson')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !map.getSource || map.getSource('campus-buildings')) return;
        // The fetch above is async, and a style swap (light/dark/satellite)
        // can land in that same window -- addSource() throws "Style is not
        // done loading" if the map's *current* style isn't actually ready
        // yet, even though the mapLoaded/styleVersion gate above passed when
        // this effect started. Check readiness again right here, and defer
        // to 'idle' (fires once the style and all its sources have settled)
        // rather than assuming nothing changed while the fetch was in flight.
        // isStyleLoaded() is checked below, but it isn't a hard guarantee --
        // MapLibre can still reject addSource() with "Style is not done
        // loading" in a narrow window even when it reported true. Rather
        // than chase that internal timing exactly, catch the failure and
        // retry on the next 'idle' (fires once the style and every source
        // has genuinely settled), which converges correctly regardless.
        const addBuildingLayers = () => {
          if (!map.getSource || map.getSource('campus-buildings')) return;
          try {
            const before = map.getLayer('network-debug-casing') ? 'network-debug-casing' : undefined;
            // Over satellite imagery a solid fill would just hide the photo
            // underneath it -- keep it as a faint tint with a brighter
            // outline instead, so real building shapes stay visible either
            // way. Reads flavor via a ref since this can fire well after the
            // effect that captured it started, on whatever style is current.
            const isSatellite = flavorRef.current === 'satellite';
            map.addSource('campus-buildings', { type: 'geojson', data });
            map.addLayer(
              {
                id: 'campus-buildings-fill',
                type: 'fill',
                source: 'campus-buildings',
                paint: { 'fill-color': '#c9c2b6', 'fill-opacity': isSatellite ? 0.12 : 0.85 },
              },
              before,
            );
            map.addLayer(
              {
                id: 'campus-buildings-outline',
                type: 'line',
                source: 'campus-buildings',
                paint: { 'line-color': isSatellite ? '#ffffff' : '#a89f8f', 'line-width': isSatellite ? 1.5 : 1 },
              },
              before,
            );
          } catch {
            map.once('idle', addBuildingLayers);
          }
        };

        if (map.isStyleLoaded()) {
          addBuildingLayers();
        } else {
          map.once('idle', addBuildingLayers);
        }
      })
      .catch(() => {});
  }, [mapLoaded, styleVersion]);

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

  const visiblePlaces = useMemo(() => {
    if (!declutterByZoom) return places;
    return places.filter((p) => zoom >= (CATEGORY_MIN_ZOOM[p.category] ?? 0));
  }, [places, zoom, declutterByZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(visiblePlaces.map((p) => p.id));
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const place of visiblePlaces) {
      if (markersRef.current.has(place.id)) continue;
      const wrap = document.createElement('div');
      wrap.className = 'place-marker-wrap';

      const pin = document.createElement('div');
      pin.className = 'place-marker';
      pin.style.backgroundColor = CATEGORY_COLOR[place.category] ?? DEFAULT_MARKER_COLOR;
      pin.innerHTML = `<svg class="place-marker-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICON_PATH[place.category] ?? DEFAULT_ICON_PATH}</svg>`;

      const label = document.createElement('span');
      label.className = 'place-marker-label';
      label.textContent = place.name;

      wrap.appendChild(pin);
      wrap.appendChild(label);
      wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        onPlaceClick?.(place);
      });
      const marker = new Marker({ element: wrap, anchor: 'bottom' }).setLngLat([place.lng, place.lat]).addTo(map);
      markersRef.current.set(place.id, marker);
    }
  }, [visiblePlaces, onPlaceClick]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = addPlaceMode ? 'crosshair' : '';
  }, [addPlaceMode]);

  // Camera follows the walker while navigating, like a real turn-by-turn app
  // -- but only while `following` is true, so a manual drag (see the
  // `dragstart` listener above) actually sticks instead of snapping back on
  // the next GPS tick.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigating || !userPosition || !following) return;
    map.easeTo({ center: [userPosition.lng, userPosition.lat], zoom: Math.max(map.getZoom(), NAV_ZOOM), duration: 800 });
  }, [navigating, userPosition, following]);

  function handleRecenter() {
    const map = mapRef.current;
    if (map && userPosition) {
      map.easeTo({ center: [userPosition.lng, userPosition.lat], zoom: NAV_ZOOM, duration: 500 });
    }
    setFollowing(true);
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {navigating && !following && (
        <button type="button" className="recenter-button" aria-label="Re-center on my location" onClick={handleRecenter}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
        </button>
      )}
      {!navigating && (
        <>
          <button
            type="button"
            className="me-button"
            data-active={meActive}
            aria-label={meActive ? 'Stop showing my location' : 'Show my location'}
            onClick={onToggleMe}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
          <button type="button" className="directions-fab" aria-label="Directions" onClick={onOpenDirections}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l18-8-8 18-2-8-8-2z" />
            </svg>
          </button>
          <button
            type="button"
            className="add-place-fab"
            data-active={addPlaceMode}
            aria-label="Add a place"
            onClick={onStartAddPlace}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {addPlaceMode && (
            <div className="add-place-hint">
              <span>Tap the map to place your pin</span>
              <div className="add-place-hint-actions">
                {userPosition && (
                  <button type="button" onClick={onUseMyLocationForNewPlace}>
                    Use my location
                  </button>
                )}
                <button type="button" onClick={onStartAddPlace} aria-label="Cancel">
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="map-type-wrap">
            <button
              type="button"
              className="map-style-toggle"
              aria-label="Map type"
              onClick={() => setMapTypeMenuOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </button>
            {mapTypeMenuOpen && (
              <div className="map-type-menu">
                {[
                  { id: 'light', label: 'Default' },
                  { id: 'dark', label: 'Dark' },
                  { id: 'grayscale', label: 'Grayscale' },
                  { id: 'satellite', label: 'Satellite' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-active={flavor === opt.id}
                    onClick={() => {
                      setFlavor(opt.id);
                      setMapTypeMenuOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default MapView;
