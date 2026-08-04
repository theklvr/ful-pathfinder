import { useMemo, useState } from 'react';

function matches(place, query) {
  const q = query.toLowerCase();
  if (place.name.toLowerCase().includes(q)) return true;
  return (place.aliases ?? []).some((a) => a.toLowerCase().includes(q));
}

// A typeahead field for picking a place, used for both the "From" and "To"
// sides of Directions so either can be freely searched, not just chosen from
// a fixed dropdown or set implicitly by which marker was tapped.
export default function PlaceSelectField({ label, places, value, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim();
    const pool = q ? places.filter((p) => matches(p, q)) : places;
    return pool.slice(0, 8);
  }, [places, query]);

  function handlePick(place) {
    onChange(place);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="place-select-field">
      <label className="directions-label" htmlFor={`place-select-${label}`}>
        {label}
      </label>
      <input
        id={`place-select-${label}`}
        className="directions-input"
        type="text"
        placeholder={placeholder}
        value={open ? query : (value?.name ?? '')}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && results.length > 0 && (
        <ul className="directions-input-results">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handlePick(p)}>
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
