import { useEffect, useState } from 'react';
import { fetchContributorStats } from '../data/contributorStats';
import { submitEditSuggestion, fetchMyEditSuggestions } from '../data/editSuggestions';
import PlaceSelectField from './PlaceSelectField';

const EDIT_KINDS = [
  { id: 'details', label: 'Update place details', hint: "Wrong name, category, or description? Describe what's wrong." },
  { id: 'photo', label: 'Add or replace a photo', hint: 'Paste a photo URL for this place.' },
  { id: 'address', label: 'Update address', hint: 'Describe the correct address or location.' },
  { id: 'road_report', label: 'Report a path/road problem', hint: 'e.g. blocked, wrong on the map, unsafe.' },
];

export default function ContributePanel({ places, auth, onRequireSignIn, onStartAddPlace, onOpenPlaceForReview }) {
  const [stats, setStats] = useState(null);
  const [mySuggestions, setMySuggestions] = useState([]);
  const [activeKind, setActiveKind] = useState(null); // one of EDIT_KINDS.id, or 'review'
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!auth.user) return;
    fetchContributorStats(auth.user.id).then(setStats).catch(() => {});
    fetchMyEditSuggestions(auth.user.id).then(setMySuggestions).catch(() => {});
  }, [auth.user]);

  // "Add a review" reuses the existing PlaceCard/PlaceReviews UI rather than
  // duplicating a review form here -- once a place is picked, hand off to
  // the parent and reset. Side-effecting during render would be unsafe, so
  // this runs from an effect instead.
  useEffect(() => {
    if (activeKind === 'review' && selectedPlace) {
      onOpenPlaceForReview?.(selectedPlace);
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKind, selectedPlace]);

  function resetForm() {
    setActiveKind(null);
    setSelectedPlace(null);
    setNote('');
    setPhotoUrl('');
    setError(null);
    setDone(false);
  }

  function requireAuthThen(action) {
    if (!auth.user) {
      onRequireSignIn?.();
      return;
    }
    action();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedPlace) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitEditSuggestion({
        userId: auth.user.id,
        placeId: selectedPlace.id,
        kind: activeKind,
        note: note.trim(),
        suggestedPhotoUrl: activeKind === 'photo' ? photoUrl.trim() : null,
      });
      setDone(true);
      fetchMyEditSuggestions(auth.user.id).then(setMySuggestions).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (activeKind && done) {
    return (
      <div className="contribute-panel">
        <p className="submit-place-done">Thanks! Your suggestion is pending review.</p>
        <button type="button" className="account-panel-submit" onClick={resetForm}>
          Done
        </button>
      </div>
    );
  }

  if (activeKind === 'review') {
    return (
      <div className="contribute-panel">
        <button type="button" className="settings-back" aria-label="Back" onClick={resetForm}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h3 className="settings-panel-title">Add a review</h3>
        <PlaceSelectField label="Place" places={places} value={selectedPlace} onChange={setSelectedPlace} placeholder="Which place?" />
      </div>
    );
  }

  if (activeKind) {
    const kindInfo = EDIT_KINDS.find((k) => k.id === activeKind);
    return (
      <form className="contribute-panel" onSubmit={handleSubmit}>
        <button type="button" className="settings-back" aria-label="Back" onClick={resetForm}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h3 className="settings-panel-title">{kindInfo.label}</h3>
        <PlaceSelectField label="Place" places={places} value={selectedPlace} onChange={setSelectedPlace} placeholder="Which place?" />
        {activeKind === 'photo' && (
          <input
            className="directions-input"
            type="url"
            placeholder="Photo URL"
            required
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
          />
        )}
        <textarea
          className="place-reviews-comment"
          placeholder={kindInfo.hint}
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="account-panel-error">{error}</p>}
        <button type="submit" className="account-panel-submit" disabled={submitting || !selectedPlace || !note.trim()}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    );
  }

  return (
    <div className="contribute-panel">
      {auth.user && stats && (
        <div className="contributor-stats">
          <div className="contributor-stats-level">
            <span className="contributor-stats-level-num">Lvl {stats.level}</span>
            <span className="contributor-stats-badge">{stats.badge}</span>
          </div>
          <div className="contributor-stats-points">
            {stats.points} pts · {stats.pointsToNextLevel} to next level
          </div>
        </div>
      )}

      <div className="contribute-actions">
        <button type="button" className="contribute-action" onClick={() => requireAuthThen(() => onStartAddPlace?.())}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add a place
        </button>
        <button type="button" className="contribute-action" onClick={() => requireAuthThen(() => setActiveKind('review'))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 9 12 2" />
          </svg>
          Add a review
        </button>
        {EDIT_KINDS.map((k) => (
          <button key={k.id} type="button" className="contribute-action" onClick={() => requireAuthThen(() => setActiveKind(k.id))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {k.label}
          </button>
        ))}
      </div>

      {!auth.user && <p className="contribute-signin-hint">Sign in to contribute and earn points.</p>}

      {auth.user && mySuggestions.length > 0 && (
        <div className="account-submissions">
          <span className="directions-label">Your suggestions</span>
          <ul>
            {mySuggestions.map((s) => (
              <li key={s.id}>
                <span>{s.places?.name ?? 'Place'}</span>
                <span className={`submission-status submission-status-${s.status}`}>{s.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
