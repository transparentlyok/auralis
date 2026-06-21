import type { ThemeDefinition } from './types';

export const builtinThemes: ThemeDefinition[] = [
  {
    id: 'classic-foobar',
    name: 'Classic Foobar',
    author: 'Auralis',
    version: '1.0.0',
    density: 'compact',
    colors: {
      background: '#ece9d8',
      surface: '#f7f5e8',
      surfaceAlt: '#dfdbc9',
      text: '#111111',
      textMuted: '#555555',
      border: '#9a988e',
      borderStrong: '#5f5d55',
      accent: '#ff6a00',
      accentText: '#ffffff',
      selected: '#0a246a',
      selectedText: '#ffffff',
      danger: '#a40000',
      ok: '#177245',
      waveform: '#525252'
    },
    fonts: {
      ui: 'Tahoma, "Segoe UI", sans-serif',
      mono: '"Cascadia Mono", Consolas, monospace',
      size: '12px'
    },
    spacing: {
      unit: '4px',
      panel: '6px',
      row: '24px'
    },
    borders: {
      radius: '0px',
      width: '1px'
    }
  },
  {
    id: 'dark-compact',
    name: 'Dark Compact',
    author: 'Auralis',
    version: '1.0.0',
    density: 'dense',
    colors: {
      background: '#111314',
      surface: '#181b1d',
      surfaceAlt: '#222629',
      text: '#f0f2f3',
      textMuted: '#9ca7ad',
      border: '#30363a',
      borderStrong: '#485158',
      accent: '#ff7700',
      accentText: '#1a0d00',
      selected: '#263f52',
      selectedText: '#ffffff',
      danger: '#ff5b65',
      ok: '#67d391',
      waveform: '#ff8b22'
    },
    fonts: {
      ui: '"Segoe UI", Arial, sans-serif',
      mono: '"Cascadia Mono", Consolas, monospace',
      size: '12px'
    },
    spacing: {
      unit: '4px',
      panel: '8px',
      row: '22px'
    },
    borders: {
      radius: '3px',
      width: '1px'
    }
  },
  {
    id: 'modern-soundcloud',
    name: 'Modern SoundCloud',
    author: 'Auralis',
    version: '1.0.0',
    density: 'comfortable',
    colors: {
      background: '#fafafa',
      surface: '#ffffff',
      surfaceAlt: '#f0f1f2',
      text: '#171717',
      textMuted: '#6b6f75',
      border: '#d8dadd',
      borderStrong: '#b4b8bd',
      accent: '#ff5500',
      accentText: '#ffffff',
      selected: '#ffe4d2',
      selectedText: '#181818',
      danger: '#c73a46',
      ok: '#217a52',
      waveform: '#ff5500'
    },
    fonts: {
      ui: '"Inter", "Segoe UI", Arial, sans-serif',
      mono: '"Cascadia Mono", Consolas, monospace',
      size: '13px'
    },
    spacing: {
      unit: '5px',
      panel: '10px',
      row: '30px'
    },
    borders: {
      radius: '6px',
      width: '1px'
    }
  },
  {
    id: 'minimal',
    name: 'Minimal',
    author: 'Auralis',
    version: '1.0.0',
    density: 'compact',
    colors: {
      background: '#f5f5f3',
      surface: '#fbfbfa',
      surfaceAlt: '#ededeb',
      text: '#20201e',
      textMuted: '#777771',
      border: '#d0d0cc',
      borderStrong: '#9a9a94',
      accent: '#2f6f73',
      accentText: '#ffffff',
      selected: '#dbe9ea',
      selectedText: '#111111',
      danger: '#a94b42',
      ok: '#467c45',
      waveform: '#2f6f73'
    },
    fonts: {
      ui: '"Segoe UI", Arial, sans-serif',
      mono: '"Cascadia Mono", Consolas, monospace',
      size: '12px'
    },
    spacing: {
      unit: '4px',
      panel: '8px',
      row: '26px'
    },
    borders: {
      radius: '2px',
      width: '1px'
    }
  },
  {
    id: 'graphite-red',
    name: 'Graphite Red',
    author: 'Auralis',
    version: '1.0.0',
    density: 'dense',
    colors: {
      background: '#101112', surface: '#17191b', surfaceAlt: '#222528', text: '#f4f4f2', textMuted: '#a5a7a8',
      border: '#363a3d', borderStrong: '#5b6064', accent: '#ef3e4a', accentText: '#ffffff', selected: '#5b2027',
      selectedText: '#ffffff', danger: '#ff6a72', ok: '#55c58a', waveform: '#ef3e4a'
    },
    fonts: { ui: '"Segoe UI", Arial, sans-serif', mono: '"Cascadia Mono", Consolas, monospace', size: '12px' },
    spacing: { unit: '4px', panel: '7px', row: '22px' },
    borders: { radius: '2px', width: '1px' }
  },
  {
    id: 'studio-light',
    name: 'Studio Light',
    author: 'Auralis',
    version: '1.0.0',
    density: 'compact',
    colors: {
      background: '#e7eaed', surface: '#f8f9fa', surfaceAlt: '#dfe3e7', text: '#1d2329', textMuted: '#626a72',
      border: '#b9c0c6', borderStrong: '#7c858d', accent: '#e94f37', accentText: '#ffffff', selected: '#d7e8f4',
      selectedText: '#14222d', danger: '#b82d3b', ok: '#287a4f', waveform: '#207a8a'
    },
    fonts: { ui: '"Segoe UI Variable", "Segoe UI", sans-serif', mono: '"Cascadia Mono", Consolas, monospace', size: '12px' },
    spacing: { unit: '4px', panel: '8px', row: '26px' },
    borders: { radius: '3px', width: '1px' }
  },
  {
    id: 'windows-98',
    name: 'Windows 98',
    author: 'Auralis',
    version: '1.0.0',
    density: 'compact',
    colors: {
      background: '#008080', surface: '#c0c0c0', surfaceAlt: '#d4d0c8', text: '#000000', textMuted: '#404040',
      border: '#808080', borderStrong: '#000000', accent: '#000080', accentText: '#ffffff', selected: '#000080',
      selectedText: '#ffffff', danger: '#800000', ok: '#006400', waveform: '#000080'
    },
    fonts: { ui: 'Tahoma, "MS Sans Serif", sans-serif', mono: '"Courier New", monospace', size: '11px' },
    spacing: { unit: '3px', panel: '5px', row: '23px' },
    borders: { radius: '0px', width: '1px' }
  },
  {
    id: 'terminal-amber',
    name: 'Terminal Amber',
    author: 'Auralis',
    version: '1.0.0',
    density: 'dense',
    colors: {
      background: '#090a08', surface: '#11120f', surfaceAlt: '#1a1b16', text: '#ffd77a', textMuted: '#aa8d4d',
      border: '#4d4128', borderStrong: '#806b3d', accent: '#ffb82e', accentText: '#1c1300', selected: '#58420f',
      selectedText: '#fff2c7', danger: '#ff6b59', ok: '#8fd06c', waveform: '#ffb82e'
    },
    fonts: { ui: '"Cascadia Mono", Consolas, monospace', mono: '"Cascadia Mono", Consolas, monospace', size: '11px' },
    spacing: { unit: '3px', panel: '5px', row: '21px' },
    borders: { radius: '0px', width: '1px' }
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    author: 'Auralis',
    version: '1.0.0',
    density: 'comfortable',
    colors: {
      background: '#000000', surface: '#000000', surfaceAlt: '#111111', text: '#ffffff', textMuted: '#d0d0d0',
      border: '#ffffff', borderStrong: '#ffff00', accent: '#ffff00', accentText: '#000000', selected: '#00ffff',
      selectedText: '#000000', danger: '#ff5c8a', ok: '#65ff7a', waveform: '#ffff00'
    },
    fonts: { ui: 'Arial, sans-serif', mono: 'Consolas, monospace', size: '14px' },
    spacing: { unit: '5px', panel: '8px', row: '32px' },
    borders: { radius: '0px', width: '2px' }
  }
];

export function validateTheme(input: unknown): ThemeDefinition {
  if (!input || typeof input !== 'object') {
    throw new Error('Theme must be a JSON object.');
  }
  const theme = input as Partial<ThemeDefinition>;
  if (!theme.id || !/^[a-z0-9][a-z0-9-_]{1,63}$/i.test(theme.id)) {
    throw new Error('Theme id must be 2-64 characters and contain only letters, numbers, dashes, or underscores.');
  }
  if (!theme.name || typeof theme.name !== 'string') {
    throw new Error('Theme name is required.');
  }
  if (!theme.colors || typeof theme.colors !== 'object') {
    throw new Error('Theme colors are required.');
  }
  const requiredColors = ['background', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border', 'accent', 'selected'];
  for (const color of requiredColors) {
    if (!theme.colors[color]) {
      throw new Error(`Theme color "${color}" is required.`);
    }
  }
  return {
    id: theme.id,
    name: theme.name,
    author: theme.author,
    version: theme.version,
    density: theme.density ?? 'compact',
    colors: theme.colors as Record<string, string>,
    fonts: theme.fonts,
    spacing: theme.spacing,
    borders: theme.borders,
    icons: theme.icons,
    layout: theme.layout
  };
}

export function themeToCssVariables(theme: ThemeDefinition): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--color-${toKebab(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.spacing ?? {})) {
    vars[`--space-${toKebab(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.borders ?? {})) {
    vars[`--border-${toKebab(key)}`] = value;
  }
  if (theme.fonts?.ui) vars['--font-ui'] = theme.fonts.ui;
  if (theme.fonts?.mono) vars['--font-mono'] = theme.fonts.mono;
  if (theme.fonts?.size) vars['--font-size'] = theme.fonts.size;
  return vars;
}

function toKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
