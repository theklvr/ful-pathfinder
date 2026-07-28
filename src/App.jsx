import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import PlaceCard from './components/PlaceCard';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import DirectionsPanel from './components/DirectionsPanel';
import { fetchPlaces } from './data/places';
import { fetchNodes, fetchEdges } from './data/network';
import { CATEGORIES } from './data/categories';
import { buildGraph } from './routing/graph';
import { astar, haversineHeuristic } from './routing/astar';
import { haversine } from './routing/haversine';
import { buildSteps } from './routing/steps';

const DEFAULT_ORIGIN_NAME = 'School Gate';

export default function App() {
  const [places, setPlaces] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [activeCategories, setActiveCategories] = useState(() => new Set(CATEGORIES.map((c) => c.id)));
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [originPlace, setOriginPlace] = useState(null);
  const [destinationPlace, setDestinationPlace] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    fetchPlaces().then(setPlaces).catch(console.error);
    fetchNodes().then(setNodes).catch(console.error);
    fetchEdges().then(setEdges).catch(console.error);
  }, []);

  useEffect(() => {
    if (originPlace || places.length === 0) return;
    setOriginPlace(places.find((p) => p.name === DEFAULT_ORIGIN_NAME) ?? places[0]);
  }, [places, originPlace]);

  const filteredPlaces = useMemo(
    () => places.filter((p) => activeCategories.has(p.category)),
    [places, activeCategories],
  );

  const routingGraph = useMemo(() => {
    if (nodes.length === 0 || edges.length === 0) return null;
    return buildGraph(nodes, edges);
  }, [nodes, edges]);

  const route = useMemo(() => {
    if (!routingGraph || !originPlace || !destinationPlace) return null;
    if (originPlace.nearest_node_id == null || destinationPlace.nearest_node_id == null) return null;

    const { graph, coords } = routingGraph;
    const h = haversineHeuristic(coords);
    const path = astar(graph, coords, originPlace.nearest_node_id, destinationPlace.nearest_node_id, h);
    if (!path) return null;

    const distanceM = path
      .slice(1)
      .reduce((sum, id, i) => sum + haversine(coords.get(path[i]), coords.get(id)), 0);
    const coordinates = path.map((id) => {
      const c = coords.get(id);
      return [c.lng, c.lat];
    });

    return { path, distanceM, coordinates };
  }, [routingGraph, originPlace, destinationPlace]);

  const steps = useMemo(() => {
    if (!route || !routingGraph || !originPlace || !destinationPlace) return [];
    return buildSteps(route.path, routingGraph.coords, originPlace, destinationPlace, places);
  }, [route, routingGraph, originPlace, destinationPlace, places]);

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

  return (
    <>
      <MapView
        ref={mapRef}
        places={filteredPlaces}
        nodes={nodes}
        edges={edges}
        route={route?.coordinates}
        onPlaceClick={handleSelectPlace}
      />
      <div className="top-overlay">
        <SearchBar places={places} onSelect={handleSelectPlace} />
        <CategoryFilter activeCategories={activeCategories} onToggle={toggleCategory} />
      </div>
      {destinationPlace ? (
        <DirectionsPanel
          places={places}
          origin={originPlace}
          destination={destinationPlace}
          onChangeOrigin={setOriginPlace}
          onClose={() => setDestinationPlace(null)}
          route={route}
          steps={steps}
        />
      ) : (
        <PlaceCard place={selectedPlace} onClose={() => setSelectedPlace(null)} onDirections={handleStartDirections} />
      )}
    </>
  );
}
