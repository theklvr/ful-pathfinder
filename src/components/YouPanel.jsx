import { useEffect, useMemo, useState } from 'react';
import { getRecentSearches } from '../data/recentSearches';
import { fetchMyLists, createList, deleteList, fetchListItems } from '../data/lists';
import { fetchVisited } from '../data/visited';
import { updateHomeWork } from '../data/profiles';
import PlaceSelectField from './PlaceSelectField';

function groupByDate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const day = new Date(row.visited_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(row);
  }
  return [...groups.entries()];
}

export default function YouPanel({ places, auth, profile, onProfileChange, favoriteIds, onSelectPlace, onRequireSignIn }) {
  const [lists, setLists] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [openListId, setOpenListId] = useState(null);
  const [listItems, setListItems] = useState([]);
  const [visited, setVisited] = useState([]);
  const [settingHome, setSettingHome] = useState(false);
  const [settingWork, setSettingWork] = useState(false);
  const [savingHomeWork, setSavingHomeWork] = useState(false);

  const recentPlaces = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, p]));
    return getRecentSearches()
      .map((r) => byId.get(r.id))
      .filter(Boolean);
  }, [places]);

  const favoritePlaces = useMemo(() => places.filter((p) => favoriteIds.has(p.id)), [places, favoriteIds]);

  useEffect(() => {
    if (!auth.user) return;
    fetchMyLists(auth.user.id).then(setLists).catch(() => {});
    fetchVisited(auth.user.id).then(setVisited).catch(() => {});
  }, [auth.user]);

  useEffect(() => {
    if (openListId == null) {
      setListItems([]);
      return;
    }
    fetchListItems(openListId).then(setListItems).catch(() => {});
  }, [openListId]);

  async function handleCreateList(e) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const list = await createList(auth.user.id, name);
    setLists((prev) => [...prev, list]);
    setNewListName('');
  }

  async function handleDeleteList(listId) {
    await deleteList(listId);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    if (openListId === listId) setOpenListId(null);
  }

  async function handleSetHome(place) {
    setSettingHome(false);
    setSavingHomeWork(true);
    try {
      const work = profile?.work_lat != null ? { lat: profile.work_lat, lng: profile.work_lng, label: profile.work_label } : null;
      const next = await updateHomeWork({ userId: auth.user.id, home: { lat: place.lat, lng: place.lng, label: place.name }, work });
      onProfileChange?.(next);
    } finally {
      setSavingHomeWork(false);
    }
  }

  async function handleSetWork(place) {
    setSettingWork(false);
    setSavingHomeWork(true);
    try {
      const home = profile?.home_lat != null ? { lat: profile.home_lat, lng: profile.home_lng, label: profile.home_label } : null;
      const next = await updateHomeWork({ userId: auth.user.id, home, work: { lat: place.lat, lng: place.lng, label: place.name } });
      onProfileChange?.(next);
    } finally {
      setSavingHomeWork(false);
    }
  }

  function goTo(place) {
    onSelectPlace?.(place);
  }

  if (!auth.user) {
    return (
      <div className="you-panel">
        <p className="contribute-signin-hint">Sign in to see your recent places, lists, visited history, and home/work.</p>
        <button type="button" className="account-panel-submit" onClick={onRequireSignIn}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="you-panel">
      <section className="you-section">
        <h3 className="you-section-title">Home &amp; work</h3>
        <div className="you-homework-row">
          <span>Home</span>
          {settingHome ? (
            <PlaceSelectField label="Home" places={places} value={null} onChange={handleSetHome} placeholder="Search a place" />
          ) : (
            <button type="button" onClick={() => setSettingHome(true)} disabled={savingHomeWork}>
              {profile?.home_label || 'Set home'}
            </button>
          )}
        </div>
        <div className="you-homework-row">
          <span>Work</span>
          {settingWork ? (
            <PlaceSelectField label="Work" places={places} value={null} onChange={handleSetWork} placeholder="Search a place" />
          ) : (
            <button type="button" onClick={() => setSettingWork(true)} disabled={savingHomeWork}>
              {profile?.work_label || 'Set work'}
            </button>
          )}
        </div>
      </section>

      {recentPlaces.length > 0 && (
        <section className="you-section">
          <h3 className="you-section-title">Recent</h3>
          <ul className="you-place-list">
            {recentPlaces.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => goTo(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="you-section">
        <h3 className="you-section-title">Lists</h3>
        <ul className="you-lists">
          <li>
            <button type="button" className="you-list-row" data-active={openListId === 'favorites'} onClick={() => setOpenListId(openListId === 'favorites' ? null : 'favorites')}>
              Favorites <span>({favoritePlaces.length})</span>
            </button>
            {openListId === 'favorites' && (
              <ul className="you-place-list you-list-items">
                {favoritePlaces.length === 0 && <li className="you-list-empty">No favorites yet.</li>}
                {favoritePlaces.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => goTo(p)}>
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
          {lists.map((l) => (
            <li key={l.id}>
              <div className="you-list-row">
                <button type="button" data-active={openListId === l.id} onClick={() => setOpenListId(openListId === l.id ? null : l.id)}>
                  {l.name} <span>({l.itemCount})</span>
                </button>
                <button type="button" className="you-list-delete" aria-label={`Delete ${l.name}`} onClick={() => handleDeleteList(l.id)}>
                  ×
                </button>
              </div>
              {openListId === l.id && (
                <ul className="you-place-list you-list-items">
                  {listItems.length === 0 && <li className="you-list-empty">No places in this list yet.</li>}
                  {listItems.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => goTo(p)}>
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <form className="you-new-list" onSubmit={handleCreateList}>
          <input placeholder="New list (e.g. Want to go)" value={newListName} onChange={(e) => setNewListName(e.target.value)} />
          <button type="submit" disabled={!newListName.trim()}>
            Create
          </button>
        </form>
      </section>

      {visited.length > 0 && (
        <section className="you-section">
          <h3 className="you-section-title">Timeline</h3>
          {groupByDate(visited).map(([day, rows]) => (
            <div key={day} className="you-timeline-day">
              <span className="you-timeline-date">{day}</span>
              <ul className="you-place-list">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => goTo(r.places)}>
                      {r.places.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
