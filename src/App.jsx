import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import PlaceCard from './components/PlaceCard';
import PlaceList from './components/PlaceList';
import AccountPanel from './components/AccountPanel';
import SubmitPlaceForm from './components/SubmitPlaceForm';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import DirectionsPanel from './components/DirectionsPanel';
import WeatherWidget from './components/WeatherWidget';
import NavBanner from './components/NavBanner';
import NavBottomBar from './components/NavBottomBar';
import LoadingScreen from './components/LoadingScreen';
import ErrorBanner from './components/ErrorBanner';
import BottomNav from './components/BottomNav';
import YouPanel from './components/YouPanel';
import ContributePanel from './components/ContributePanel';
import { fetchPlaces } from './data/places';
import { fetchNodes, fetchEdges } from './data/network';
import { fetchFavoriteIds, addFavorite, removeFavorite } from './data/favorites';
import { recordVisit } from './data/visited';
import { CATEGORIES } from './data/categories';
import { buildGraph, nearestNodeId } from './routing/graph';
import { astar, haversineHeuristic } from './routing/astar';
import { haversine } from './routing/haversine';
import { buildSteps, currentLiveStep } from './routing/steps';
import { useLiveLocation } from './location/useLiveLocation';
import { useAuth } from './lib/auth';
import { useProfile } from './lib/useProfile';
import { useSettings } from './lib/useSettings';
import { useLocationSharing } from './lib/useLocationSharing';

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
  const [settings, updateSettings] = useSettings();
  const [voiceEnabled, setVoiceEnabled] = useState(settings.voiceEnabled);
  const [arrived, setArrived] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [meActive, setMeActive] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [addPlaceMode, setAddPlaceMode] = useState(false);
  const [newPlaceLocation, setNewPlaceLocation] = useState(null);
  const [activeTab, setActiveTab] = useState('explore');
  const [wantsToShare, setWantsToShare] = useState(false);
  const auth = useAuth();
  const [profile, setProfile] = useProfile(auth.user);
  const sharing = useLocationSharing(auth.user);
  const mapRef = useRef(null);
  const lastSpokenRef = useRef('');
  const arrivalTimerRef = useRef(null);
  const meFlyToDoneRef = useRef(false);

  const originIsLiveLocation = originPlace?.isLiveLocation ?? false;
  const isSharingLocation = !!sharing.shareId || wantsToShare;
  // originPlace is sticky for the whole session once set (see the
  // default-origin effect below) -- so gating live GPS on originIsLiveLocation
  // alone meant picking "Your location" once left GPS running in the
  // background indefinitely, even after Directions was closed and nothing
  // was using the position anymore. Only keep it live while that choice is
  // actually in view.
  const { position: userPosition, status: locationStatus, overridePosition } = useLiveLocation(
    navigating || meActive || (showDirections && originIsLiveLocation) || addPlaceMode || isSharingLocation,
  );

  // wantsToShare arms GPS (above) so a fix is available; once one arrives,
  // actually create the share row. Two steps because there's no position to
  // share until GPS -- which this same flag turns on -- has produced one.
  useEffect(() => {
    if (!wantsToShare || !userPosition) return;
    setWantsToShare(false);
    sharing.start(userPosition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsToShare, userPosition]);

  // Keep the shared position fresh while sharing is active (throttled
  // internally by the hook).
  useEffect(() => {
    if (!sharing.shareId || !userPosition) return;
    sharing.reportPosition(userPosition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing.shareId, userPosition]);

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

  // Handoff from SharePage's "Get directions to here" -- an arbitrary
  // lat/lng with no place record, passed via URL params since there's no
  // shared app state between that page and this one (a fresh page load).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const destLat = params.get('destLat');
    const destLng = params.get('destLng');
    if (destLat == null || destLng == null) return;
    setDestinationPlace({
      id: `shared:${destLat},${destLng}`,
      name: params.get('destLabel') || 'Shared location',
      lat: Number(destLat),
      lng: Number(destLng),
      nearest_node_id: null,
    });
    setShowDirections(true);
    window.history.replaceState({}, '', window.location.pathname);
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

  // Static route: from whichever place is picked in the "From" field, or
  // from the walker's live GPS position if they chose "Your location". The
  // destination is normally a real place with a precomputed nearest_node_id,
  // but a shared-location link (see the URL-param effect below) hands over
  // an arbitrary lat/lng with no such precompute -- resolve it the same way
  // live-location origins already are.
  const staticRoute = useMemo(() => {
    if (!routingGraph || !originPlace || !destinationPlace) return null;
    const startNodeId = originIsLiveLocation
      ? userPosition
        ? nearestNodeId(userPosition, routingGraph.coords)
        : null
      : originPlace.nearest_node_id;
    const endNodeId = destinationPlace.nearest_node_id ?? nearestNodeId(destinationPlace, routingGraph.coords);
    if (startNodeId == null || endNodeId == null) return null;
    return routeBetween(routingGraph, startNodeId, endNodeId);
  }, [routingGraph, originPlace, destinationPlace, originIsLiveLocation, userPosition]);

  const staticOriginForSteps = useMemo(() => {
    if (!originIsLiveLocation) return originPlace;
    if (!userPosition) return null;
    return { id: 'live', name: 'your location', lat: userPosition.lat, lng: userPosition.lng };
  }, [originIsLiveLocation, originPlace, userPosition]);

  const staticSteps = useMemo(() => {
    if (!staticRoute || !routingGraph || !staticOriginForSteps || !destinationPlace) return [];
    return buildSteps(staticRoute.path, routingGraph.coords, staticOriginForSteps, destinationPlace, places, settings.unit);
  }, [staticRoute, routingGraph, staticOriginForSteps, destinationPlace, places, settings.unit]);

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
    return buildSteps(liveRoute.path, routingGraph.coords, virtualOrigin, destinationPlace, places, settings.unit);
  }, [liveRoute, routingGraph, destinationPlace, places, userPosition, settings.unit]);

  const currentStep = useMemo(() => currentLiveStep(liveSteps), [liveSteps]);
  const distanceToStep = currentStep && userPosition ? haversine(userPosition, currentStep.at) : null;

  // Arrival: once within range of the destination, announce it and end
  // navigation shortly after, rather than leaving the walker stuck staring
  // at a 0 m countdown.
  useEffect(() => {
    if (!navigating || !userPosition || !destinationPlace) return;
    const distanceToDestination = haversine(userPosition, { lat: destinationPlace.lat, lng: destinationPlace.lng });
    if (distanceToDestination <= ARRIVAL_RADIUS_M) {
      if (!arrived) {
        setArrived(true);
        if (auth.user) recordVisit(auth.user.id, destinationPlace.id);
      }
      if (!arrivalTimerRef.current) {
        arrivalTimerRef.current = setTimeout(() => {
          setNavigating(false);
          setArrived(false);
          arrivalTimerRef.current = null;
        }, 4000);
      }
    }
  }, [navigating, userPosition, destinationPlace, arrived, auth.user]);

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
    setActiveTab('explore');
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

  function handleStartAddPlace() {
    if (!auth.user) {
      handleRequireSignIn();
      return;
    }
    setActiveTab('explore');
    setSelectedPlace(null);
    setShowDirections(false);
    setActiveCategory(null);
    setAddPlaceMode((v) => !v);
  }

  function handleMapClickForNewPlace(latLng) {
    setAddPlaceMode(false);
    setNewPlaceLocation(latLng);
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
        userPosition={navigating || meActive || addPlaceMode ? userPosition : null}
        navigating={navigating}
        meActive={meActive}
        declutterByZoom={!activeCategory}
        initialFlavor={settings.mapStyle}
        onUseMyLocationForNewPlace={() => userPosition && handleMapClickForNewPlace(userPosition)}
        onPlaceClick={handleSelectPlace}
        onUserPositionDrag={overridePosition}
        onToggleMe={handleToggleMe}
        onOpenDirections={handleOpenDirections}
        addPlaceMode={addPlaceMode}
        onStartAddPlace={handleStartAddPlace}
        onMapClickForNewPlace={handleMapClickForNewPlace}
      />

      {dataLoading && places.length === 0 && !dataError && <LoadingScreen />}

      {navigating ? (
        <>
          <NavBanner
            step={currentStep}
            distanceToStep={distanceToStep}
            unit={settings.unit}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => setVoiceEnabled((v) => !v)}
            statusMessage={navBannerStatusMessage}
          />
          {destinationPlace && (
            <NavBottomBar
              destination={destinationPlace}
              remainingDistanceM={liveRoute?.distanceM ?? 0}
              unit={settings.unit}
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
              <WeatherWidget />
              <button
                type="button"
                className="account-button"
                data-active={showAccountPanel}
                data-signed-in={!!auth.user}
                aria-label="Account"
                onClick={() => setShowAccountPanel((v) => !v)}
              >
                {profile?.avatar_url ? (
                  <img className="account-button-avatar" src={profile.avatar_url} alt="" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                )}
              </button>
            </div>
            {showAccountPanel && (
              <AccountPanel
                auth={auth}
                profile={profile}
                onProfileChange={setProfile}
                onStartAddPlace={handleStartAddPlace}
                settings={settings}
                onUpdateSettings={updateSettings}
                onClose={() => setShowAccountPanel(false)}
              />
            )}
            <div className="category-filter-wrap">
              <CategoryFilter activeCategory={activeCategory} onSelect={selectCategory} />
            </div>
          </div>
          {activeTab === 'you' ? (
            <div className="place-card tab-panel">
              <YouPanel
                places={places}
                auth={auth}
                profile={profile}
                onProfileChange={setProfile}
                favoriteIds={favoriteIds}
                onSelectPlace={handleSelectPlace}
                onRequireSignIn={handleRequireSignIn}
                shareId={sharing.shareId}
                shareExpiresAt={sharing.expiresAt}
                shareStarting={sharing.starting || wantsToShare}
                onStartSharing={() => setWantsToShare(true)}
                onStopSharing={() => sharing.stop()}
              />
            </div>
          ) : activeTab === 'contribute' ? (
            <div className="place-card tab-panel">
              <ContributePanel
                places={places}
                auth={auth}
                onRequireSignIn={handleRequireSignIn}
                onStartAddPlace={handleStartAddPlace}
                onOpenPlaceForReview={handleSelectPlace}
              />
            </div>
          ) : showDirections ? (
            <DirectionsPanel
              places={places}
              origin={originPlace}
              destination={destinationPlace}
              onChangeOrigin={setOriginPlace}
              onChangeDestination={setDestinationPlace}
              onClose={handleCloseDirections}
              route={staticRoute}
              steps={staticSteps}
              unit={settings.unit}
              onStartNavigation={handleStartNavigation}
              locationStatus={locationStatus}
              locatingOrigin={originIsLiveLocation && !userPosition}
            />
          ) : newPlaceLocation ? (
            <SubmitPlaceForm
              lat={newPlaceLocation.lat}
              lng={newPlaceLocation.lng}
              user={auth.user}
              onClose={() => setNewPlaceLocation(null)}
              onSubmitted={() => {}}
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
          <BottomNav activeTab={activeTab} onSelect={setActiveTab} />
        </>
      )}
    </>
  );
}
