import { useEffect, useState } from 'react';
import { fetchPendingSubmissions, fetchPendingEditSuggestions, reviewSubmission, reviewEditSuggestion, updatePlace } from '../data/admin';
import { CATEGORIES } from '../data/categories';
import PlaceSelectField from './PlaceSelectField';

const KIND_LABELS = {
  details: 'Update details',
  photo: 'Add/replace photo',
  address: 'Update address',
  road_report: 'Road/path problem',
};

function SubmissionCard({ submission, onReviewed }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function handle(decision) {
    setBusy(true);
    try {
      await reviewSubmission(submission.id, decision, note);
      onReviewed(submission.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card">
      {submission.photo_url && <img className="admin-card-photo" src={submission.photo_url} alt="" />}
      <div className="admin-card-body">
        <p className="admin-card-title">
          {submission.name} <span className="admin-card-category">{submission.category}</span>
        </p>
        {submission.description && <p className="admin-card-note">{submission.description}</p>}
        <p className="admin-card-meta">
          {submission.lat.toFixed(5)}, {submission.lng.toFixed(5)} · {new Date(submission.created_at).toLocaleDateString()}
        </p>
        <input
          className="directions-input"
          placeholder="Moderator note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="admin-card-actions">
          <button type="button" className="admin-reject" disabled={busy} onClick={() => handle('reject')}>
            Reject
          </button>
          <button type="button" className="admin-approve" disabled={busy} onClick={() => handle('approve')}>
            {busy ? 'Working…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditSuggestionCard({ suggestion, onReviewed }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function handle(decision) {
    setBusy(true);
    try {
      await reviewEditSuggestion(suggestion.id, decision, note);
      onReviewed(suggestion.id);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card">
      {suggestion.kind === 'photo' && suggestion.suggested_photo_url && (
        <img className="admin-card-photo" src={suggestion.suggested_photo_url} alt="" />
      )}
      <div className="admin-card-body">
        <p className="admin-card-title">
          {suggestion.places?.name ?? 'Unknown place'} <span className="admin-card-category">{KIND_LABELS[suggestion.kind]}</span>
        </p>
        <p className="admin-card-note">{suggestion.note}</p>
        <p className="admin-card-meta">{new Date(suggestion.created_at).toLocaleDateString()}</p>
        {suggestion.kind !== 'photo' && (
          <p className="admin-card-meta admin-card-warning">
            Approving records the decision but doesn't change the place automatically -- use "Edit a place" below to make the
            actual change.
          </p>
        )}
        <input
          className="directions-input"
          placeholder="Moderator note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="admin-card-actions">
          <button type="button" className="admin-reject" disabled={busy} onClick={() => handle('reject')}>
            Reject
          </button>
          <button type="button" className="admin-approve" disabled={busy} onClick={() => handle('approve')}>
            {busy ? 'Working…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPlaceSection({ places }) {
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSelect(place) {
    setSelected(place);
    setName(place.name);
    setCategory(place.category);
    setDescription(place.description || '');
    setPhotoUrl(place.photo_url || '');
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updatePlace(selected.id, { name, category, description, photo_url: photoUrl });
      setSaved(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-group">
      <span className="directions-label">Edit a place directly</span>
      <PlaceSelectField label="Place" places={places} value={selected} onChange={handleSelect} placeholder="Search a place" />
      {selected && (
        <>
          <input className="directions-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <select className="directions-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            className="place-reviews-comment"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          <input
            className="directions-input"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="Photo URL"
          />
          <button type="button" className="account-panel-submit" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        </>
      )}
    </section>
  );
}

export default function AdminPanel({ places }) {
  const [submissions, setSubmissions] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    Promise.all([fetchPendingSubmissions(), fetchPendingEditSuggestions()])
      .then(([s, e]) => {
        setSubmissions(s);
        setSuggestions(e);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="admin-panel">
      <section className="settings-group">
        <span className="directions-label">Pending place submissions ({submissions.length})</span>
        {loading && <p className="developer-note">Loading…</p>}
        {!loading && submissions.length === 0 && <p className="developer-note">Nothing pending.</p>}
        {submissions.map((s) => (
          <SubmissionCard key={s.id} submission={s} onReviewed={(id) => setSubmissions((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </section>

      <section className="settings-group">
        <span className="directions-label">Pending edit suggestions ({suggestions.length})</span>
        {loading && <p className="developer-note">Loading…</p>}
        {!loading && suggestions.length === 0 && <p className="developer-note">Nothing pending.</p>}
        {suggestions.map((s) => (
          <EditSuggestionCard key={s.id} suggestion={s} onReviewed={(id) => setSuggestions((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </section>

      <EditPlaceSection places={places} />
    </div>
  );
}
