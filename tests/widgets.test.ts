import { describe, expect, it } from 'vitest';
import { normalizeWidgetInstances, validateCustomWidget } from '../src/shared/widgets';

describe('widget customization', () => {
  it('validates declarative widgets', () => {
    const widget = validateCustomWidget({ id: 'details', name: 'Details', template: '{{track.title}}', defaultSpan: 2, defaultHeight: 120 });
    expect(widget).toMatchObject({ id: 'details', defaultSpan: 2, defaultHeight: 120 });
  });

  it('normalizes persisted widget bounds', () => {
    const widgets = normalizeWidgetInstances([{ id: 'x', kind: 'spectrogram', enabled: true, span: 3, height: 999 }], []);
    expect(widgets[0]).toMatchObject({ kind: 'spectrogram', span: 3, height: 360 });
  });

  it('accepts the built-in lyrics widget', () => {
    expect(normalizeWidgetInstances([{ id: 'lyrics', kind: 'lyrics', enabled: true, span: 2, height: 180 }], [])[0])
      .toMatchObject({ kind: 'lyrics', span: 2, height: 180 });
  });

  it('accepts the now-playing and track-stats widgets', () => {
    const widgets = normalizeWidgetInstances([
      { id: 'now', kind: 'now-playing', enabled: true, span: 1, height: 100 },
      { id: 'stats', kind: 'track-stats', enabled: true, span: 1, height: 100 }
    ], []);
    expect(widgets.map((widget) => widget.kind)).toEqual(['now-playing', 'track-stats']);
  });

  it('rejects unsafe widget ids', () => {
    expect(() => validateCustomWidget({ id: '../x', name: 'X', template: 'x' })).toThrow();
  });
});
