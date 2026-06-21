import { useCallback, useEffect, useMemo, useState } from 'react';
import { builtinThemes, themeToCssVariables } from '../../shared/theme';
import type { AppSettings, ThemeDefinition } from '../../shared/types';

export function useTheme(settings: AppSettings | undefined, updateSettings: (settings: AppSettings) => void) {
  const [userThemes, setUserThemes] = useState<ThemeDefinition[]>([]);
  const themes = useMemo(() => mergeThemes([...builtinThemes, ...userThemes]), [userThemes]);
  const selectedTheme = themes.find((theme) => theme.id === settings?.themeId) ?? themes[0];

  const refreshThemes = useCallback(async () => {
    const info = await window.auralis.getCustomizationInfo();
    setUserThemes(info.themes);
  }, []);

  useEffect(() => {
    refreshThemes().catch(console.error);
    return window.auralis.onThemeChanged(() => {
      refreshThemes().catch(console.error);
    });
  }, [refreshThemes]);

  useEffect(() => {
    if (!selectedTheme) return;
    const vars = themeToCssVariables(selectedTheme);
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value);
    }
    if (settings) {
      document.documentElement.style.setProperty('--font-size', `${settings.layout.fontSize}px`);
      document.documentElement.style.setProperty('--space-row', `${settings.layout.rowHeight}px`);
      document.documentElement.style.setProperty('--widget-dock-max-height', `${settings.layout.widgetDockMaxHeight}px`);
    }
    document.documentElement.dataset.theme = selectedTheme.id;
    document.documentElement.dataset.density = settings?.layout.density ?? selectedTheme.density ?? 'compact';
  }, [selectedTheme, settings]);

  const selectTheme = useCallback((themeId: string) => {
    if (!settings) return;
    const theme = themes.find((item) => item.id === themeId);
    updateSettings({
      ...settings,
      themeId,
      layout: { ...settings.layout, ...(theme?.layout ?? {}) }
    });
  }, [settings, themes, updateSettings]);

  return {
    themes,
    selectedTheme,
    selectTheme,
    refreshThemes
  };
}

function mergeThemes(themes: ThemeDefinition[]): ThemeDefinition[] {
  const map = new Map<string, ThemeDefinition>();
  for (const theme of themes) map.set(theme.id, theme);
  return [...map.values()];
}
