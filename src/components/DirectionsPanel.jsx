import { formatDistance, formatDuration } from '../routing/format';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import PlaceSelectField from './PlaceSelectField';

export default function DirectionsPanel({
  places,
  origin,
  destination,
  onChangeOrigin,
  onChangeDestination,
  onClose,
  route,
  steps = [],
  onStartNavigation,
  locationStatus,
  locatingOrigin = false,
}) {
  const { sheetRef, handleProps } = useSwipeToDismiss(onClose);

  function handleReverse() {
    if (!origin || !destination) return;
    onChangeOrigin(destination);
    onChangeDestination(origin);
  }

  return (
    <div className="place-card directions-panel" ref={sheetRef}>
      <div className="sheet-handle" {...handleProps} />
      <button className="place-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="place-card-body">
        <div className="directions-fields">
          <div className="directions-fields-inputs">
            <PlaceSelectField
              label="From"
              places={places}
              value={origin}
              onChange={onChangeOrigin}
              placeholder="Choose starting point"
              myLocationOption
            />
            <PlaceSelectField label="To" places={places} value={destination} onChange={onChangeDestination} placeholder="Choose destination" />
          </div>
          <button
            type="button"
            className="directions-reverse"
            aria-label="Swap origin and destination"
            disabled={!origin || !destination}
            onClick={handleReverse}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>

        {!destination ? (
          <div className="directions-summary directions-summary-empty">Choose a destination.</div>
        ) : !origin ? (
          <div className="directions-summary directions-summary-empty">Choose a starting point.</div>
        ) : origin.isLiveLocation && locationStatus === 'denied' ? (
          <div className="directions-summary directions-summary-empty">
            Location access was denied. Allow it in your browser's site settings, or pick a starting point instead.
          </div>
        ) : origin.isLiveLocation && locatingOrigin ? (
          <div className="directions-summary directions-summary-empty">Finding your location…</div>
        ) : route ? (
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
          <div className="directions-summary directions-summary-empty">No walking route found between these places.</div>
        )}
      </div>
    </div>
  );
}
