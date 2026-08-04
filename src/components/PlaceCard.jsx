import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import PlaceActions from './PlaceActions';

export default function PlaceCard({ place, onClose, onDirections }) {
  const { sheetRef, handleProps } = useSwipeToDismiss(onClose);

  if (!place) return null;

  return (
    <div className="place-card" ref={sheetRef}>
      <div className="sheet-handle" {...handleProps} />
      <button className="place-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {place.photo_url && <img className="place-card-photo" src={place.photo_url} alt={place.name} />}
      <div className="place-card-body">
        <span className="place-card-category">{place.category}</span>
        <h2 className="place-card-name">{place.name}</h2>
        {place.description && <p className="place-card-description">{place.description}</p>}
        <PlaceActions place={place} onDirections={onDirections} />
      </div>
    </div>
  );
}
