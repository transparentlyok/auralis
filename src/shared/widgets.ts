import type { CustomWidgetDefinition, WidgetInstance, WidgetKind } from './types';

const KINDS = new Set<WidgetKind>(['waveform', 'spectrum', 'spectrogram', 'oscilloscope', 'lyrics', 'now-playing', 'track-stats', 'custom']);

export function validateCustomWidget(input: unknown): CustomWidgetDefinition {
  if (!input || typeof input !== 'object') throw new Error('Widget must be a JSON object.');
  const widget = input as Partial<CustomWidgetDefinition>;
  if (!widget.id || !/^[a-z0-9][a-z0-9-_]{1,63}$/i.test(widget.id)) throw new Error('Widget id is invalid.');
  if (!widget.name || typeof widget.name !== 'string') throw new Error('Widget name is required.');
  if (!widget.template || typeof widget.template !== 'string') throw new Error('Widget template is required.');
  return {
    id: widget.id,
    name: widget.name,
    author: widget.author,
    version: widget.version,
    template: widget.template,
    style: widget.style && typeof widget.style === 'object' ? widget.style : undefined,
    defaultSpan: clampSpan(widget.defaultSpan),
    defaultHeight: clampHeight(widget.defaultHeight)
  };
}

export function normalizeWidgetInstances(input: unknown, fallback: WidgetInstance[]): WidgetInstance[] {
  if (!Array.isArray(input)) return fallback.map((widget) => ({ ...widget }));
  return input.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const widget = value as Partial<WidgetInstance>;
    if (!widget.kind || !KINDS.has(widget.kind)) return [];
    return [{
      id: typeof widget.id === 'string' && widget.id ? widget.id : `widget-${index}`,
      kind: widget.kind,
      title: typeof widget.title === 'string' ? widget.title : undefined,
      enabled: widget.enabled !== false,
      span: clampSpan(widget.span) ?? 1,
      height: clampHeight(widget.height) ?? 92,
      customWidgetId: typeof widget.customWidgetId === 'string' ? widget.customWidgetId : undefined
    }];
  });
}

function clampSpan(value: unknown): 1 | 2 | 3 | undefined {
  const number = Number(value);
  return number === 1 || number === 2 || number === 3 ? number : undefined;
}

function clampHeight(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(58, Math.min(360, Math.round(number))) : undefined;
}
