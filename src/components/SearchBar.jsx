import { useMemo, useRef, useState } from 'react';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../data/recentSearches';

const SpeechRecognitionApi = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : null;

function matches(place, query) {
  const q = query.toLowerCase();
  if (place.name.toLowerCase().includes(q)) return true;
  return (place.aliases ?? []).some((a) => a.toLowerCase().includes(q));
}

export default function SearchBar({ places, onSelect }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [recents, setRecents] = useState(getRecentSearches);
  const recognitionRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return places.filter((p) => matches(p, q)).slice(0, 8);
  }, [places, query]);

  // Recents are stored as {id, name, category}, not full place records --
  // re-resolve against the current places list so stale data (a place
  // renamed or removed since it was searched) never shows.
  const recentPlaces = useMemo(() => {
    if (query.trim()) return [];
    const byId = new Map(places.map((p) => [p.id, p]));
    return recents.map((r) => byId.get(r.id)).filter(Boolean);
  }, [recents, places, query]);

  function handleSelect(place) {
    onSelect(place);
    setQuery('');
    setFocused(false);
    setRecents(addRecentSearch(place));
  }

  function handleClearRecents() {
    clearRecentSearches();
    setRecents([]);
  }

  function handleVoiceSearch() {
    if (!SpeechRecognitionApi) return;
    const recognition = new SpeechRecognitionApi();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => setQuery(e.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="search-bar">
      <input
        type="search"
        className="search-input"
        placeholder="Search places (e.g. SUB, Library, Clinic)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {SpeechRecognitionApi && (
        <button
          type="button"
          className="search-voice-button"
          data-listening={listening}
          aria-label={listening ? 'Listening…' : 'Search by voice'}
          onClick={handleVoiceSearch}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
        </button>
      )}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(p)}>
                <span className="search-result-name">{p.name}</span>
                <span className="search-result-category">{p.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.length === 0 && focused && recentPlaces.length > 0 && (
        <ul className="search-results">
          <li className="search-results-header">
            <span>Recent</span>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleClearRecents}>
              Clear
            </button>
          </li>
          {recentPlaces.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(p)}>
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
