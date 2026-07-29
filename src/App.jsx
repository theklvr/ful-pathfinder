import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import PlaceCard from './components/PlaceCard';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import DirectionsPanel from './components/DirectionsPanel';
import NavBanner from './components/NavBanner';
import NavBottomBar from './components/NavBottomBar';
import LoadingScreen from './components/LoadingScreen';
import ErrorBanner from './components/ErrorBanner';
import { fetchPlaces } from './data/places';
import { fetchNodes, fetchEdges } from './data/network';
import { CATEGORIES } from './data/categories';
import { buildGraph, nearestNodeId } from './routing/graph';
import { astar, haversineHeuristic } from './routing/astar';
import { haversine } from './routing/haversine';
import { buildSteps, currentLiveStep } from './routing/steps';
import { useLiveLocation } from './location/useLiveLocation';

const DEFAULT_ORIGIN_NAME = 'School Gate';
const ARRIVAL_RADIUS_M = 15;

function routeBetween(routingGraph, startNodeId, goalNodeId) {
  if (!routingGraph || startNodeId == null || goalNodeId == null) return null;
  const { graph, coords } = routingGraph;
  const h = haversineHeuristic(coords);
  const path = astar(graph, coords, startNodeId, goalNodeId, h);
  if (!path) return null;

  const distanceM = path.slice(1).reduce((sum, id, i) => sum + haversine(coords.get(path[i]), coords.get(id)), 0);
  const coordinates = path.map((id) => {
    const c = coords.get(id);
    return [c.lng, c.lat];
  });
  return { path, distanceM, coordinates };
}

export default function App() {
  const [places, setPlaces] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [activeCategories, setActiveCategories] = useState(() => new Set(CATEGORIES.map((c) => c.id)));
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [originPlace, setOriginPlace] = useState(null);
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [navigating, setNavigating] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const mapRef = useRef(null);
  const lastSpokenRef = useRef('');
  const arrivalTimerRef = useRef(null);

  const { position: userPosition, status: locationStatus, overridePosition } = useLiveLocation(navigating);

  function loadData() {
    setDataLoading(true);
    setDataError(null);
    // A weak campus network more often means a request hangs than one that
    // fails outright — without this, a hung fetch would leave the loading
    // screen up forever with no way for the walker to retry.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 15000));
    Promise.race([Promise.all([fetchPlaces(), fetchNodes(), fetchEdges()]), timeout])
      .then(([placesData, nodesData, edgesData]) => {
        setPlaces(placesData);
        setNodes(nodesData);
        setEdges(edgesData);
      })
      .catch((err) => {
        console.error(err);
        setDataError('Could not load campus data. Check your connection and try again.');
      })
      .finally(() => setDataLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (originPlace || places.length === 0) return;
    setOriginPlace(places.find((p) => p.name === DEFAULT_ORIGIN_NAME) ?? places[0]);
  }, [places, originPlace]);

  // Give up on live navigation if permission is denied/unavailable, rather
  // than sitting in a "navigating" state with no position to navigate from.
  useEffect(() => {
    if (navigating && (locationStatus === 'denied' || locationStatus === 'unavailable')) {
      setNavigating(false);
    }
  }, [navigating, locationStatus]);

  const filteredPlaces = useMemo(() => {
    if (navigating) return destinationPlace ? [destinationPlace] : [];
    return places.filter((p) => activeCategories.has(p.category));
  }, [places, activeCategories, navigating, destinationPlace]);

  const routingGraph = useMemo(() => {
    if (nodes.length === 0 || edges.length === 0) return null;
    return buildGraph(nodes, edges);
  }, [nodes, edges]);

  // Static route: from whichever place is picked in the "From" dropdown.
  const staticRoute = useMemo(() => {
    if (!routingGraph || !originPlace || !destinationPlace) return null;
    return routeBetween(routingGraph, originPlace.nearest_node_id, destinationPlace.nearest_node_id);
  }, [routingGraph, originPlace, destinationPlace]);

  const staticSteps = useMemo(() => {
    if (!staticRoute || !routingGraph || !originPlace || !destinationPlace) return [];
    return buildSteps(staticRoute.path, routingGraph.coords, originPlace, destinationPlace, places);
  }, [staticRoute, routingGraph, originPlace, destinationPlace, places]);

  // Live route: recomputed from the walker's current GPS fix every update,
  // so it's inherently self-correcting — no separate "off route" check
  // needed, the route is always the shortest path from wherever they are.
  const liveRoute = useMemo(() => {
    if (!navigating || !routingGraph || !userPosition || !destinationPlace) return null;
    const startNodeId = nearestNodeId(userPosition, routingGraph.coords);
    return routeBetween(routingGraph, startNodeId, destinationPlace.nearest_node_id);
  }, [navigating, routingGraph, userPosition, destinationPlace]);

  const liveSteps = useMemo(() => {
    if (!liveRoute || !routingGraph || !destinationPlace || !userPosition) return [];
    const virtualOrigin = { id: 'live', name: 'your location', lat: userPosition.lat, lng: userPosition.lng };
    return buildSteps(liveRoute.path, routingGraph.coords, virtualOrigin, destinationPlace, places);
  }, [liveRoute, routingGraph, destinationPlace, places, userPosition]);

  const currentStep = useMemo(() => currentLiveStep(liveSteps), [liveSteps]);
  const distanceToStep = currentStep && userPosition ? haversine(userPosition, currentStep.at) : null;

  // Arrival: once within range of the destination, announce it and end
  // navigation shortly after, rather than leaving the walker stuck staring
  // at a 0 m countdown.
  useEffect(() => {
    if (!navigating || !userPosition || !destinationPlace) return;
    const distanceToDestination = haversine(userPosition, { lat: destinationPlace.lat, lng: destinationPlace.lng });
    if (distanceToDestination <= ARRIVAL_RADIUS_M) {
      if (!arrived) setArrived(true);
      if (!arrivalTimerRef.current) {
        arrivalTimerRef.current = setTimeout(() => {
          setNavigating(false);
          setArrived(false);
          arrivalTimerRef.current = null;
        }, 4000);
      }
    }
  }, [navigating, userPosition, destinationPlace, arrived]);

  useEffect(() => {
    if (!navigating) {
      setArrived(false);
      if (arrivalTimerRef.current) {
        clearTimeout(arrivalTimerRef.current);
        arrivalTimerRef.current = null;
      }
    }
  }, [navigating]);

  // Voice guidance: speak each instruction once, when it first becomes current.
  useEffect(() => {
    if (!navigating || !voiceEnabled || !currentStep) return;
    if (!('speechSynthesis' in window)) return;
    if (lastSpokenRef.current === currentStep.text) return;
    lastSpokenRef.current = currentStep.text;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(currentStep.text));
  }, [navigating, voiceEnabled, currentStep]);

  function toggleCategory(id) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectPlace(place) {
    setDestinationPlace(null);
    setSelectedPlace(place);
    mapRef.current?.flyTo(place);
  }

  function handleStartDirections(place) {
    setSelectedPlace(null);
    setDestinationPlace(place);
    mapRef.current?.flyTo(place);
  }

  function handleStartNavigation() {
    lastSpokenRef.current = '';
    setNavigating(true);
  }

  function handleEndNavigation() {
    setNavigating(false);
  }

  const navBannerStatusMessage = arrived
    ? `You've arrived at ${destinationPlace?.name}.`
    : locationStatus === 'locating'
      ? 'Finding your location…'
      : !currentStep
        ? 'Working out the route…'
        : null;

  return (
    <>
      <MapView
        ref={mapRef}
        places={filteredPlaces}
        nodes={nodes}
        edges={edges}
        route={navigating ? liveRoute?.coordinates : staticRoute?.coordinates}
        userPosition={navigating ? userPosition : null}
        navigating={navigating}
        onPlaceClick={handleSelectPlace}
        onUserPositionDrag={overridePosition}
      />

      {dataLoading && places.length === 0 && !dataError && <LoadingScreen />}

      {navigating ? (
        <>
          <NavBanner
            step={currentStep}
            distanceToStep={distanceToStep}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled((v) => !v)}
            statusMessage={navBannerStatusMessage}
          />
          {destinationPlace && (
            <NavBottomBar
              destination={destinationPlace}
              remainingDistanceM={liveRoute?.distanceM ?? 0}
              onEnd={handleEndNavigation}
            />
          )}
        </>
      ) : (
        <>
          <div className="top-overlay">
            {dataError && <ErrorBanner message={dataError} onRetry={loadData} />}
            <SearchBar places={places} onSelect={handleSelectPlace} />
            <div className="category-filter-wrap">
              <CategoryFilter activeCategories={activeCategories} onToggle={toggleCategory} />
            </div>
          </div>
          {destinationPlace ? (
            <DirectionsPanel
              places={places}
              origin={originPlace}
              destination={destinationPlace}
              onChangeOrigin={setOriginPlace}
              onClose={() => setDestinationPlace(null)}
              route={staticRoute}
              steps={staticSteps}
              onStartNavigation={handleStartNavigation}
              locationStatus={locationStatus}
            />
          ) : (
            <PlaceCard place={selectedPlace} onClose={() => setSelectedPlace(null)} onDirections={handleStartDirections} />
          )}
        </>
      )}
    </>
  );
}
