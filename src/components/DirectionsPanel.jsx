import { formatDistance, formatDuration } from '../routing/format';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';

export default function DirectionsPanel({
  places,
  origin,
  destination,
  onChangeOrigin,
  onClose,
  route,
  steps = [],
  onStartNavigation,
  locationStatus,
}) {
  const { sheetRef, handleProps } = useSwipeToDismiss(onClose);

  if (!destination) return null;

  return (
    <div className="place-card directions-panel" ref={sheetRef}>
      <div className="sheet-handle" {...handleProps} />
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
              <span>{formatDuration(route.distanceM)} walk</span>
            </div>

            <button className="directions-start-nav" onClick={onStartNavigation}>
              {locationStatus === 'denied' ? 'Enable location to navigate' : 'Start navigation'}
            </button>
            {locationStatus === 'denied' && (
              <p className="directions-location-hint">
                Location access was denied. Allow it in your browser's site settings to get turn-by-turn guidance
                from where you're standing.
              </p>
            )}

            <ol className="directions-steps">
              {steps.map((step, i) => (
                <li key={i} data-kind={step.kind}>
                  {step.text}
                </li>
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
