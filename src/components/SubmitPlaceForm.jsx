import { useState } from 'react';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import { CATEGORIES } from '../data/categories';
import { submitPlace } from '../data/submissions';

export default function SubmitPlaceForm({ lat, lng, user, onClose, onSubmitted }) {
  const { sheetRef, handleProps } = useSwipeToDismiss(onClose);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [aliases, setAliases] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitPlace({
        userId: user.id,
        name: name.trim(),
        category,
        aliases: aliases
          .split(';')
          .map((a) => a.trim())
          .filter(Boolean),
        description: description.trim(),
        photoUrl: photoUrl.trim(),
        lat,
        lng,
      });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="place-card submit-place-form" ref={sheetRef}>
        <div className="sheet-handle" {...handleProps} />
        <div className="place-card-body">
          <p className="submit-place-done">Thanks! Your submission is pending review before it appears on the map.</p>
          <button type="button" className="account-panel-submit" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="place-card submit-place-form" ref={sheetRef} onSubmit={handleSubmit}>
      <div className="sheet-handle" {...handleProps} />
      <button type="button" className="place-card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="place-card-body">
        <span className="directions-label">Add a place</span>
        <p className="submit-place-coords">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
        <input className="directions-input" placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <select className="directions-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          className="directions-input"
          placeholder="Nicknames, separated by ;"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
        />
        <textarea
          className="place-reviews-comment"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="directions-input"
          type="url"
          placeholder="Photo URL (optional)"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
        />
        {error && <p className="account-panel-error">{error}</p>}
        <button type="submit" className="account-panel-submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>
    </form>
  );
}
