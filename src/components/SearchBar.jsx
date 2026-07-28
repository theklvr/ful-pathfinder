import { useMemo, useState } from 'react';

function matches(place, query) {
  const q = query.toLowerCase();
  if (place.name.toLowerCase().includes(q)) return true;
  return (place.aliases ?? []).some((a) => a.toLowerCase().includes(q));
}

export default function SearchBar({ places, onSelect }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return places.filter((p) => matches(p, q)).slice(0, 8);
  }, [places, query]);

  function handleSelect(place) {
    onSelect(place);
    setQuery('');
  }

  return (
    <div className="search-bar">
      <input
        type="search"
        className="search-input"
        placeholder="Search places (e.g. SUB, Library, Clinic)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => handleSelect(p)}>
                <span className="search-result-name">{p.name}</span>
                <span className="search-result-category">{p.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
