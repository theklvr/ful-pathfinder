import { useState } from 'react';
import { getSettings, saveSettings } from '../data/settings';

export function useSettings() {
  const [settings, setSettings] = useState(getSettings);

  function updateSettings(partial) {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }

  return [settings, updateSettings];
}
