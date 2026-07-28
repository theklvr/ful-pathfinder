import { useEffect, useState } from 'react';
import MapView from './map/MapView';
import { fetchPlaces } from './data/places';

export default function App() {
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    fetchPlaces().then(setPlaces).catch(console.error);
  }, []);

  return <MapView places={places} />;
}
