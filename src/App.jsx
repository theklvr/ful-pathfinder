import { useEffect, useMemo, useState } from 'react';
import MapView from './map/MapView';
import PlaceCard from './components/PlaceCard';
import CategoryFilter from './components/CategoryFilter';
import { fetchPlaces } from './data/places';
import { CATEGORIES } from './data/categories';

export default function App() {
  const [places, setPlaces] = useState([]);
  const [activeCategories, setActiveCategories] = useState(() => new Set(CATEGORIES.map((c) => c.id)));
  const [selectedPlace, setSelectedPlace] = useState(null);

  useEffect(() => {
    fetchPlaces().then(setPlaces).catch(console.error);
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

  return (
    <>
      <MapView places={filteredPlaces} onPlaceClick={setSelectedPlace} />
      <CategoryFilter activeCategories={activeCategories} onToggle={toggleCategory} />
      <PlaceCard place={selectedPlace} onClose={() => setSelectedPlace(null)} />
    </>
  );
}
