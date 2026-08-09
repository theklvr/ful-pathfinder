import { useEffect, useState } from 'react';
import { fetchMyLists, createList, addToList } from '../data/lists';

export default function AddToListButton({ place, user, onRequireSignIn }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [newName, setNewName] = useState('');
  const [saved, setSaved] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    fetchMyLists(user.id).then(setLists).catch(() => {});
  }, [open, user]);

  async function handleAdd(listId) {
    setLoading(true);
    try {
      await addToList(listId, place.id);
      setSaved((prev) => new Set(prev).add(listId));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAndAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const list = await createList(user.id, name);
      setLists((prev) => [...prev, list]);
      await addToList(list.id, place.id);
      setSaved((prev) => new Set(prev).add(list.id));
      setNewName('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="add-to-list">
      <button
        type="button"
        className="add-to-list-toggle"
        aria-label="Add to list"
        onClick={() => (user ? setOpen((v) => !v) : onRequireSignIn?.())}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </button>
      {open && (
        <div className="add-to-list-menu">
          {lists.length === 0 && <p className="add-to-list-empty">No lists yet.</p>}
          {lists.map((l) => (
            <button key={l.id} type="button" disabled={loading} data-added={saved.has(l.id)} onClick={() => handleAdd(l.id)}>
              {saved.has(l.id) ? '✓ ' : ''}
              {l.name}
            </button>
          ))}
          <form onSubmit={handleCreateAndAdd} className="add-to-list-new">
            <input placeholder="New list name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" disabled={loading || !newName.trim()}>
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
