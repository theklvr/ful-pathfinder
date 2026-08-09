const STORAGE_KEY = 'ful-pathfinder:settings';

const DEFAULTS = {
  unit: 'metric',
  mapStyle: 'light',
  voiceEnabled: true,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be full or disabled (private browsing) -- settings are a
    // device-local convenience, not worth surfacing an error for.
  }
}
