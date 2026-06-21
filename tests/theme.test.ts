import { describe, expect, it } from 'vitest';
import { builtinThemes, themeToCssVariables, validateTheme } from '../src/shared/theme';

describe('theme engine', () => {
  it('validates a minimal theme', () => {
    const theme = validateTheme({
      id: 'test-theme',
      name: 'Test Theme',
      colors: {
        background: '#000000',
        surface: '#111111',
        surfaceAlt: '#222222',
        text: '#ffffff',
        textMuted: '#aaaaaa',
        border: '#333333',
        accent: '#ff5500',
        selected: '#444444'
      }
    });
    expect(theme.id).toBe('test-theme');
  });

  it('turns theme tokens into css variables', () => {
    const vars = themeToCssVariables({
      id: 'x',
      name: 'X',
      colors: {
        background: '#000',
        surface: '#111',
        surfaceAlt: '#222',
        text: '#fff',
        textMuted: '#999',
        border: '#333',
        accent: '#f50',
        selected: '#444'
      },
      fonts: { ui: 'Arial' },
      spacing: { row: '24px' }
    });
    expect(vars['--color-surface-alt']).toBe('#222');
    expect(vars['--font-ui']).toBe('Arial');
    expect(vars['--space-row']).toBe('24px');
  });

  it('rejects invalid theme ids', () => {
    expect(() => validateTheme({ id: '../bad', name: 'Bad', colors: {} })).toThrow();
  });

  it('ships a broad built-in theme set', () => {
    expect(builtinThemes.length).toBeGreaterThanOrEqual(9);
    expect(new Set(builtinThemes.map((theme) => theme.id)).size).toBe(builtinThemes.length);
  });
});
