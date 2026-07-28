import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import PlaceCard from './components/PlaceCard';
import CategoryFilter from './components/CategoryFilter';
import SearchBar from './components/SearchBar';
import { fetchPlaces } from './data/places';
import { fetchNodes, fetchEdges } from './data/network';
import { CATEGORIES } from './data/categories';

export default function App() {
  const [places, setPlaces] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [activeCategories, setActiveCategories] = useState(() => new Set(CATEGORIES.map((c) => c.id)));
  const [selectedPlace, setSelectedPlace] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    fetchPlaces().then(setPlaces).catch(console.error);
    fetchNodes().then(setNodes).catch(console.error);
    fetchEdges().then(setEdges).catch(console.error);
  }, []);

  const filteredPlaces = useMemo(
    () => places.filter((p) => activeCategories.has(p.category)),
    [places, activeCategories],
  );

  function toggleCategory(id) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectPlace(place) {
    setSelectedPlace(place);
    mapRef.current?.flyTo(place);
  }

  return (
    <>
      <MapView ref={mapRef} places={filteredPlaces} nodes={nodes} edges={edges} onPlaceClick={setSelectedPlace} />
      <div className="top-overlay">
        <SearchBar places={places} onSelect={handleSelectPlace} />
        <CategoryFilter activeCategories={activeCategories} onToggle={toggleCategory} />
      </div>
      <PlaceCard place={selectedPlace} onClose={() => setSelectedPlace(null)} />
    </>
  );
}
