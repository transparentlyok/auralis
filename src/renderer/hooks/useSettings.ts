import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultSettings } from '../../shared/defaultSettings';
import type { AppSettings } from '../../shared/types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>();
  const [loading, setLoading] = useState(true);
  const saveQueue = useRef(Promise.resolve());
  const revision = useRef(0);

  useEffect(() => {
    window.auralis.getSettings()
      .then(setSettings)
      .catch((error) => {
        console.error(error);
        setSettings(defaultSettings);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateSettings = useCallback((next: AppSettings) => {
    const nextRevision = ++revision.current;
    setSettings(next);
    saveQueue.current = saveQueue.current
      .then(async () => {
        const saved = await window.auralis.saveSettings(next);
        if (revision.current === nextRevision) setSettings(saved);
      })
      .catch(console.error);
  }, []);

  return { settings, updateSettings, loading };
}
