import { useMemo, useRef, useState } from 'react';

const SpeechRecognitionApi = typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : null;

function matches(place, query) {
  const q = query.toLowerCase();
  if (place.name.toLowerCase().includes(q)) return true;
  return (place.aliases ?? []).some((a) => a.toLowerCase().includes(q));
}

export default function SearchBar({ places, onSelect }) {
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return places.filter((p) => matches(p, q)).slice(0, 8);
  }, [places, query]);

  function handleSelect(place) {
    onSelect(place);
    setQuery('');
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
