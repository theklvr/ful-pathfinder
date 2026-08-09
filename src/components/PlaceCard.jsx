import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import PlaceActions from './PlaceActions';
import PlaceReviews from './PlaceReviews';
import AddToListButton from './AddToListButton';

export default function PlaceCard({ place, onClose, onDirections, user, isFavorite, onToggleFavorite, onRequireSignIn }) {
  const { sheetRef, handleProps } = useSwipeToDismiss(onClose);

  if (!place) return null;

  return (
    <div className="place-card" ref={sheetRef}>
      <div className="sheet-handle" {...handleProps} />
      <button className="place-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <button
        type="button"
        className="place-card-save"
        data-active={isFavorite}
        aria-label={isFavorite ? 'Remove from saved places' : 'Save this place'}
        onClick={() => (user ? onToggleFavorite?.(place) : onRequireSignIn?.())}
      >
        <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <div className="place-card-add-to-list">
        <AddToListButton place={place} user={user} onRequireSignIn={onRequireSignIn} />
      </div>
      {place.photo_url && <img className="place-card-photo" src={place.photo_url} alt={place.name} />}
      <div className="place-card-body">
        <span className="place-card-category">{place.category}</span>
        <h2 className="place-card-name">{place.name}</h2>
        {place.description && <p className="place-card-description">{place.description}</p>}
        <PlaceActions place={place} onDirections={onDirections} />
        <PlaceReviews place={place} user={user} onRequireSignIn={onRequireSignIn} />
      </div>
    </div>
  );
}
