export default function PlaceCard({ place, onClose, onDirections }) {
  if (!place) return null;

  return (
    <div className="place-card">
      <button className="place-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {place.photo_url && <img className="place-card-photo" src={place.photo_url} alt={place.name} />}
      <div className="place-card-body">
        <span className="place-card-category">{place.category}</span>
        <h2 className="place-card-name">{place.name}</h2>
        {place.description && <p className="place-card-description">{place.description}</p>}
        <button
          className="place-card-directions"
          onClick={() => onDirections?.(place)}
          disabled
          title="Routing lands in Day 9"
        >
          Directions (coming soon)
        </button>
      </div>
    </div>
  );
}
