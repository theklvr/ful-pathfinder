import { useEffect, useState } from 'react';
import { CATEGORY_COLOR, DEFAULT_MARKER_COLOR } from '../data/categories';
import { CATEGORY_ICON_PATH, DEFAULT_ICON_PATH } from '../data/categoryIcons';
import { fetchRatingSummaries } from '../data/reviews';
import PlaceActions from './PlaceActions';

export default function PlaceList({ places, categoryLabel, onSelectPlace, onDirections, onClose }) {
  const [ratings, setRatings] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchRatingSummaries(places.map((p) => p.id))
      .then((summaries) => {
        if (!cancelled) setRatings(summaries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [places]);

  return (
    <div className="place-list">
      <div className="place-list-header">
        <h2 className="place-list-title">
          {categoryLabel} <span className="place-list-count">({places.length})</span>
        </h2>
        <button type="button" className="place-list-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {places.length === 0 ? (
        <p className="place-list-empty">No {categoryLabel.toLowerCase()} places yet.</p>
      ) : (
        <ul className="place-list-items">
          {places.map((place) => (
            <li key={place.id} className="place-list-item">
              <button type="button" className="place-list-item-main" onClick={() => onSelectPlace(place)}>
                {place.photo_url ? (
                  <img className="place-list-thumb" src={place.photo_url} alt="" />
                ) : (
                  <div
                    className="place-list-thumb place-list-thumb-icon"
                    style={{ backgroundColor: CATEGORY_COLOR[place.category] ?? DEFAULT_MARKER_COLOR }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dangerouslySetInnerHTML={{ __html: CATEGORY_ICON_PATH[place.category] ?? DEFAULT_ICON_PATH }}
                    />
                  </div>
                )}
                <div className="place-list-item-body">
                  <span className="place-list-item-name">{place.name}</span>
                  {ratings.has(place.id) && (
                    <span className="place-list-item-rating">
                      ★ {ratings.get(place.id).average.toFixed(1)} ({ratings.get(place.id).count})
                    </span>
                  )}
                  {place.description && <span className="place-list-item-desc">{place.description}</span>}
                </div>
              </button>
              <div className="place-list-item-actions">
                <PlaceActions place={place} onDirections={onDirections} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
