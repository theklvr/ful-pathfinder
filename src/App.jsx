import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import PlaceCard from './components/PlaceCard';
import PlaceList from './components/PlaceList';
import AccountPanel from './components/AccountPanel';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import DirectionsPanel from './components/DirectionsPanel';
import NavBanner from './components/NavBanner';
import NavBottomBar from './components/NavBottomBar';
import LoadingScreen from './components/LoadingScreen';
import ErrorBanner from './components/ErrorBanner';
import { fetchPlaces } from './data/places';
import { fetchNodes, fetchEdges } from './data/network';
import { fetchFavoriteIds, addFavorite, removeFavorite } from './data/favorites';
import { CATEGORIES } from './data/categories';
import { buildGraph, nearestNodeId } from './routing/graph';
import { astar, haversineHeuristic } from './routing/astar';
import { haversine } from './routing/haversine';
import { buildSteps, currentLiveStep } from './routing/steps';
import { useLiveLocation } from './location/useLiveLocation';
import { useAuth } from './lib/auth';

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
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [originPlace, setOriginPlace] = useState(null);
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [showDirections, setShowDirections] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [meActive, setMeActive] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const auth = useAuth();
  const mapRef = useRef(null);
  const lastSpokenRef = useRef('');
  const arrivalTimerRef = useRef(null);
  const meFlyToDoneRef = useRef(false);

  const { position: userPosition, status: locationStatus, overridePosition } = useLiveLocation(navigating || meActive);

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

  useEffect(() => {
    if (!auth.user) {
      setFavoriteIds(new Set());
      return;
    }
    fetchFavoriteIds(auth.user.id)
      .then(setFavoriteIds)
      .catch((err) => console.error(err));
  }, [auth.user]);

  // Give up on live navigation if permission is denied/unavailable, rather
  // than sitting in a "navigating" state with no position to navigate from.
  useEffect(() => {
    if (navigating && (locationStatus === 'denied' || locationStatus === 'unavailable')) {
      setNavigating(false);
    }
  }, [navigating, locationStatus]);

  // Same idea for the "Me" recenter button.
  useEffect(() => {
    if (meActive && (locationStatus === 'denied' || locationStatus === 'unavailable')) {
      setMeActive(false);
    }
  }, [meActive, locationStatus]);

  // Jump the camera to the user's position once per "Me" activation, not on
  // every GPS tick — continuous re-centering would fight the user panning
  // around, unlike live-nav mode where following the walker is the point.
  useEffect(() => {
    if (!meActive) {
      meFlyToDoneRef.current = false;
      return;
    }
    if (userPosition && !meFlyToDoneRef.current) {
      mapRef.current?.flyTo(userPosition);
      meFlyToDoneRef.current = true;
    }
  }, [meActive, userPosition]);

  const filteredPlaces = useMemo(() => {
    if (navigating) return destinationPlace ? [destinationPlace] : [];
    if (activeCategory) return places.filter((p) => p.category === activeCategory);
    return places;
  }, [places, activeCategory, navigating, destinationPlace]);

  const categoryListPlaces = useMemo(() => {
    if (!activeCategory) return [];
    return places.filter((p) => p.category === activeCategory);
  }, [places, activeCategory]);

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

  function selectCategory(id) {
    setActiveCategory((prev) => (prev === id ? null : id));
  }

  function handleSelectPlace(place) {
    setShowDirections(false);
    setDestinationPlace(null);
    setSelectedPlace(place);
    mapRef.current?.flyTo(place);
  }

  function handleStartDirections(place) {
    setSelectedPlace(null);
    setDestinationPlace(place);
    setShowDirections(true);
    mapRef.current?.flyTo(place);
  }

  function handleOpenDirections() {
    setSelectedPlace(null);
    setActiveCategory(null);
    setShowDirections(true);
  }

  function handleCloseDirections() {
    setShowDirections(false);
    setDestinationPlace(null);
  }

  function handleStartNavigation() {
    lastSpokenRef.current = '';
    setMeActive(false);
    setNavigating(true);
  }

  function handleEndNavigation() {
    setNavigating(false);
  }

  function handleToggleMe() {
    setMeActive((v) => !v);
  }

  function handleRequireSignIn() {
    setShowAccountPanel(true);
  }

  async function handleToggleFavorite(place) {
    if (!auth.user) {
      handleRequireSignIn();
      return;
    }
    const isFavorite = favoriteIds.has(place.id);
    try {
      if (isFavorite) await removeFavorite(auth.user.id, place.id);
      else await addFavorite(auth.user.id, place.id);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.delete(place.id);
        else next.add(place.id);
        return next;
      });
    } catch (err) {
      console.error(err);
    }
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
        userPosition={navigating || meActive ? userPosition : null}
        navigating={navigating}
        meActive={meActive}
        onPlaceClick={handleSelectPlace}
        onUserPositionDrag={overridePosition}
        onToggleMe={handleToggleMe}
        onOpenDirections={handleOpenDirections}
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
            <div className="search-row">
              <SearchBar places={places} onSelect={handleSelectPlace} />
              <button
                type="button"
                className="account-button"
                data-active={showAccountPanel}
                data-signed-in={!!auth.user}
                aria-label="Account"
                onClick={() => setShowAccountPanel((v) => !v)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </button>
            </div>
            {showAccountPanel && <AccountPanel auth={auth} onClose={() => setShowAccountPanel(false)} />}
            <div className="category-filter-wrap">
              <CategoryFilter activeCategory={activeCategory} onSelect={selectCategory} />
            </div>
          </div>
          {showDirections ? (
            <DirectionsPanel
              places={places}
              origin={originPlace}
              destination={destinationPlace}
              onChangeOrigin={setOriginPlace}
              onChangeDestination={setDestinationPlace}
              onClose={handleCloseDirections}
              route={staticRoute}
              steps={staticSteps}
              onStartNavigation={handleStartNavigation}
              locationStatus={locationStatus}
            />
          ) : selectedPlace ? (
            <PlaceCard
              place={selectedPlace}
              onClose={() => setSelectedPlace(null)}
              onDirections={handleStartDirections}
              user={auth.user}
              isFavorite={favoriteIds.has(selectedPlace.id)}
              onToggleFavorite={handleToggleFavorite}
              onRequireSignIn={handleRequireSignIn}
            />
          ) : activeCategory ? (
            <PlaceList
              places={categoryListPlaces}
              categoryLabel={CATEGORIES.find((c) => c.id === activeCategory)?.label ?? activeCategory}
              onSelectPlace={handleSelectPlace}
              onDirections={handleStartDirections}
              onClose={() => setActiveCategory(null)}
            />
          ) : null}
        </>
      )}
    </>
  );
}
