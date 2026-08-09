const MAP_STYLES = [
  { id: 'light', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'satellite', label: 'Satellite' },
];

export default function SettingsPanel({ settings, onUpdateSettings }) {
  return (
    <div className="settings-panel">
      <div className="settings-group">
        <span className="directions-label">Distance units</span>
        <div className="settings-toggle-row">
          <button type="button" data-active={settings.unit === 'metric'} onClick={() => onUpdateSettings({ unit: 'metric' })}>
            Metric (m, km)
          </button>
          <button type="button" data-active={settings.unit === 'imperial'} onClick={() => onUpdateSettings({ unit: 'imperial' })}>
            Imperial (ft, mi)
          </button>
        </div>
      </div>

      <div className="settings-group">
        <span className="directions-label">Default map style</span>
        <div className="settings-toggle-row">
          {MAP_STYLES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-active={settings.mapStyle === opt.id}
              onClick={() => onUpdateSettings({ mapStyle: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label className="settings-checkbox-row">
        <input
          type="checkbox"
          checked={settings.voiceEnabled}
          onChange={(e) => onUpdateSettings({ voiceEnabled: e.target.checked })}
        />
        Voice guidance during navigation
      </label>
    </div>
  );
}
