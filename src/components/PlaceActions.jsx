import { useState } from 'react';
import { sharePlace, mapsUrl } from '../utils/share';

const ICONS = {
  directions: <path d="M3 11l18-8-8 18-2-8-8-2z" />,
  call: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
};

function ActionIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

// Icon-over-label action row (Directions/Call/Share/More), matching the
// Google Maps place-card convention, shared between the place detail card
// and the category list rows.
export default function PlaceActions({ place, onDirections }) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="place-actions">
      <button type="button" className="place-action-btn place-action-btn-primary" onClick={() => onDirections(place)}>
        <span className="place-action-icon">
          <ActionIcon name="directions" />
        </span>
        <span className="place-action-label">Directions</span>
      </button>
      {place.phone && (
        <a className="place-action-btn" href={`tel:${place.phone}`}>
          <span className="place-action-icon">
            <ActionIcon name="call" />
          </span>
          <span className="place-action-label">Call</span>
        </a>
      )}
      <button type="button" className="place-action-btn" onClick={() => sharePlace(place)}>
        <span className="place-action-icon">
          <ActionIcon name="share" />
        </span>
        <span className="place-action-label">Share</span>
      </button>
      <div className="place-action-more-wrap">
        <button type="button" className="place-action-btn" aria-label="More actions" onClick={() => setMoreOpen((v) => !v)}>
          <span className="place-action-icon">
            <ActionIcon name="more" />
          </span>
          <span className="place-action-label">More</span>
        </button>
        {moreOpen && (
          <div className="place-action-menu">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(`${place.lat}, ${place.lng}`);
                setMoreOpen(false);
              }}
            >
              Copy coordinates
            </button>
            <a href={mapsUrl(place)} target="_blank" rel="noreferrer" onClick={() => setMoreOpen(false)}>
              Open in Google Maps
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
