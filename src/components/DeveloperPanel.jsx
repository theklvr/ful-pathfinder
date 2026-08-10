import { useState } from 'react';
import { supabase } from '../lib/supabase';

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied -- the value is still selectable text.
    }
  }

  return (
    <div className="developer-copy-field">
      <span className="directions-label">{label}</span>
      <div className="developer-copy-row">
        <code>{value}</code>
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function DeveloperPanel() {
  const supabaseUrl = supabase.supabaseUrl;
  const supabaseAnonKey = supabase.supabaseKey;
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ful-pathfinder.vercel.app';

  return (
    <div className="developer-panel">
      <p className="developer-intro">
        Build against FUL PathFinder's campus data and routing from your own project. Both endpoints below are public,
        read-only, and free to use: no account or approval needed.
      </p>

      <section className="settings-group">
        <span className="directions-label">1. Campus places (Supabase REST)</span>
        <p className="developer-note">Every place, searchable and filterable via standard REST query params.</p>
        <CopyField label="Base URL" value={`${supabaseUrl}/rest/v1/places`} />
        <CopyField label="apikey header" value={supabaseAnonKey} />
        <pre className="developer-example">{`GET ${supabaseUrl}/rest/v1/places?select=*
GET ${supabaseUrl}/rest/v1/places?name=ilike.*library*
GET ${supabaseUrl}/rest/v1/places?category=eq.faculty`}</pre>
        <p className="developer-note">
          Columns: <code>id, name, category, aliases, description, photo_url, lat, lng</code>. Categories:{' '}
          <code>faculty, hostel, admin, eatery, atm, landmark, service, health, sport</code>.
        </p>
      </section>

      <section className="settings-group">
        <span className="directions-label">2. Walking directions</span>
        <p className="developer-note">Runs the same A* routing this app uses. Accepts a place name or a "lat,lng" pair.</p>
        <CopyField label="Endpoint" value={`${appOrigin}/api/route`} />
        <pre className="developer-example">{`GET ${appOrigin}/api/route?from=School+Gate&to=Library
GET ${appOrigin}/api/route?from=7.853,6.684&to=Library&unit=imperial`}</pre>
        <p className="developer-note">
          Returns distance, walk time, the full path, and turn-by-turn steps. <code>404</code> if a name is unknown or
          ambiguous, <code>400</code> if <code>from</code>/<code>to</code> are missing.
        </p>
      </section>

      <section className="settings-group">
        <span className="directions-label">Full documentation</span>
        <p className="developer-note">
          Complete reference with example responses lives in <code>docs/API.md</code> in the project repository
          (github.com/theklvr/ful-pathfinder). An MCP server for LLM tool-calling is planned once this REST layer is in
          real use.
        </p>
      </section>
    </div>
  );
}
