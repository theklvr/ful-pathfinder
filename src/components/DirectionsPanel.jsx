function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// Matches the ~1.3 m/s average walking pace from docs/ARCHITECTURE.md.
function formatDuration(m) {
  const minutes = Math.round(m / 1.3 / 60);
  return minutes < 1 ? '<1 min walk' : `${minutes} min walk`;
}

export default function DirectionsPanel({ places, origin, destination, onChangeOrigin, onClose, route, steps = [] }) {
  if (!destination) return null;

  return (
    <div className="place-card directions-panel">
      <button className="place-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="place-card-body">
        <label className="directions-label">
          From
          <select
            className="directions-select"
            value={origin?.id ?? ''}
            onChange={(e) => onChangeOrigin(places.find((p) => p.id === Number(e.target.value)))}
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="directions-to">
          To <strong>{destination.name}</strong>
        </div>

        {route ? (
          <>
            <div className="directions-summary">
              <span>{formatDistance(route.distanceM)}</span>
              <span>{formatDuration(route.distanceM)}</span>
            </div>
            <ol className="directions-steps">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        ) : (
          <div className="directions-summary directions-summary-empty">
            {origin ? 'No walking route found between these places.' : 'Pick a starting point.'}
          </div>
        )}
      </div>
    </div>
  );
}
