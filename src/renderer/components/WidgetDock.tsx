import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Columns3, GripVertical, X } from 'lucide-react';
import { compactNumber, formatDuration } from '../../shared/format';
import type { CustomWidgetDefinition, LyricsRecord, PlaybackState, Track, WidgetInstance, WidgetKind } from '../../shared/types';
import { parseSyncedLyrics } from '../../shared/lyrics';
import { requestLyrics } from '../lyricsClient';
import { WaveformPanel } from './WaveformPanel';

interface WidgetDockProps {
  widgets: WidgetInstance[];
  customWidgets: CustomWidgetDefinition[];
  track?: Track;
  playback: PlaybackState;
  getAnalyser: () => AnalyserNode | null;
  onSeek: (ms: number) => void;
  onWidgets: (widgets: WidgetInstance[]) => void;
}

export function WidgetDock(props: WidgetDockProps) {
  const visible = props.widgets.filter((widget) => widget.enabled);

  const update = (id: string, patch: Partial<WidgetInstance>) => {
    props.onWidgets(props.widgets.map((widget) => widget.id === id ? { ...widget, ...patch } : widget));
  };

  const move = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const next = [...props.widgets];
    const sourceIndex = next.findIndex((widget) => widget.id === sourceId);
    const targetIndex = next.findIndex((widget) => widget.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [source] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    props.onWidgets(next);
  };

  if (!visible.length) return null;
  return (
    <section className="widget-dock">
      {visible.map((widget) => {
        const custom = widget.kind === 'custom'
          ? props.customWidgets.find((item) => item.id === widget.customWidgetId)
          : undefined;
        return (
          <article
            className="widget-panel"
            draggable
            key={widget.id}
            style={{ gridColumn: `span ${widget.span}`, height: widget.height }}
            onDragStart={(event) => event.dataTransfer.setData('text/widget-id', widget.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => move(event.dataTransfer.getData('text/widget-id'), widget.id)}
          >
            <header className="widget-header">
              <GripVertical size={13} aria-hidden="true" />
              <strong>{widget.title || custom?.name || widgetTitle(widget.kind)}</strong>
              <button
                className="icon-inline"
                title="Cycle panel width"
                onClick={() => update(widget.id, { span: ((widget.span % 3) + 1) as 1 | 2 | 3 })}
              >
                <Columns3 size={13} />
              </button>
              <button className="icon-inline" title="Hide panel" onClick={() => update(widget.id, { enabled: false })}>
                <X size={13} />
              </button>
            </header>
            <div className="widget-body">
              {widget.kind === 'waveform' ? (
                <WaveformPanel track={props.track} playback={props.playback} onSeek={props.onSeek} />
              ) : widget.kind === 'lyrics' ? (
                <LyricsWidget track={props.track} playback={props.playback} onSeek={props.onSeek} />
              ) : widget.kind === 'now-playing' ? (
                <NowPlayingWidget track={props.track} playback={props.playback} onSeek={props.onSeek} />
              ) : widget.kind === 'track-stats' ? (
                <TrackStatsWidget track={props.track} />
              ) : widget.kind === 'custom' ? (
                <CustomWidget definition={custom} track={props.track} playback={props.playback} />
              ) : (
                <AudioVisualizer mode={widget.kind} getAnalyser={props.getAnalyser} active={props.playback.playing} />
              )}
            </div>
            <button
              className="widget-resizer"
              aria-label={`Resize ${widget.title || widgetTitle(widget.kind)}`}
              onPointerDown={(event) => beginResize(event, widget, update)}
            />
          </article>
        );
      })}
    </section>
  );
}

function beginResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  widget: WidgetInstance,
  update: (id: string, patch: Partial<WidgetInstance>) => void
) {
  event.preventDefault();
  const panel = event.currentTarget.closest<HTMLElement>('.widget-panel');
  if (!panel) return;
  const startY = event.clientY;
  const startHeight = panel.getBoundingClientRect().height;
  let height = startHeight;
  const move = (next: PointerEvent) => {
    height = Math.max(58, Math.min(360, startHeight + next.clientY - startY));
    panel.style.height = `${height}px`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    update(widget.id, { height: Math.round(height) });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function AudioVisualizer(props: { mode: Exclude<WidgetKind, 'waveform' | 'lyrics' | 'now-playing' | 'track-stats' | 'custom'>; getAnalyser: () => AnalyserNode | null; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const data = useRef<Uint8Array<ArrayBuffer>>();
  useEffect(() => {
    let frame = 0;
    let lastPaint = 0;
    if (!props.active) {
      const element = canvas.current;
      if (element) {
        resizeCanvas(element);
        element.getContext('2d')?.clearRect(0, 0, element.width, element.height);
      }
      return;
    }
    const paint = (time: number) => {
      frame = requestAnimationFrame(paint);
      if (time - lastPaint < 50) return;
      lastPaint = time;
      const element = canvas.current;
      const analyser = props.getAnalyser();
      if (!element || !analyser) return;
      resizeCanvas(element);
      const context = element.getContext('2d');
      if (!context) return;
      const size = props.mode === 'oscilloscope' ? analyser.fftSize : analyser.frequencyBinCount;
      if (!data.current || data.current.length !== size) data.current = new Uint8Array(size);
      if (props.mode === 'oscilloscope') drawOscilloscope(context, element, analyser, data.current);
      else if (props.mode === 'spectrogram') drawSpectrogram(context, element, analyser, data.current);
      else drawSpectrum(context, element, analyser, data.current);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [props.active, props.getAnalyser, props.mode]);
  return <canvas className="visualizer-canvas" ref={canvas} />;
}

function NowPlayingWidget(props: { track?: Track; playback: PlaybackState; onSeek: (ms: number) => void }) {
  const duration = props.playback.duration || props.track?.duration || 0;
  if (!props.track) return <div className="lyrics-empty">Nothing playing</div>;
  return (
    <div className="now-playing-widget">
      <strong title={props.track.title}>{props.track.title}</strong>
      <span title={props.track.artist}>{props.track.artist}</span>
      <input type="range" min={0} max={duration || 1} value={Math.min(props.playback.currentTime, duration || 1)} onChange={(event) => props.onSeek(Number(event.target.value))} aria-label="Track position" />
      <div><span>{formatDuration(props.playback.currentTime)}</span><span>{formatDuration(duration)}</span></div>
    </div>
  );
}

function TrackStatsWidget(props: { track?: Track }) {
  if (!props.track) return <div className="lyrics-empty">Play a track to see stats</div>;
  const stats = [
    ['Plays', compactNumber(props.track.playbackCount) || '-'],
    ['Likes', compactNumber(props.track.likesCount) || '-'],
    ['BPM', props.track.bpm ? String(Math.round(props.track.bpm)) : '-'],
    ['Genre', props.track.genre || '-']
  ];
  return <div className="track-stats-widget">{stats.map(([label, value]) => <div key={label}><span>{label}</span><strong title={value}>{value}</strong></div>)}</div>;
}

function LyricsWidget(props: { track?: Track; playback: PlaybackState; onSeek: (ms: number) => void }) {
  const [lyrics, setLyrics] = useState<LyricsRecord>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'synced' | 'plain'>('synced');
  const activeRef = useRef<HTMLButtonElement>(null);
  const lines = useMemo(() => parseSyncedLyrics(lyrics?.syncedLyrics), [lyrics?.syncedLyrics]);
  const activeIndex = activeLyricIndex(lines, props.playback.currentTime + 80);

  useEffect(() => {
    let active = true;
    setLyrics(undefined);
    setError(undefined);
    if (!props.track) return () => { active = false; };
    setLoading(true);
    void requestLyrics(props.track, true).then((result) => {
      if (!active) return;
      setLyrics(result);
      setMode(result?.syncedLyrics ? 'synced' : 'plain');
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error:\s*/i, '') : 'Lyrics lookup failed');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [props.track?.id]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex]);

  if (!props.track) return <div className="lyrics-empty">Play a track to load lyrics</div>;
  if (loading) return <div className="lyrics-empty">Finding lyrics...</div>;
  if (error) return <div className="lyrics-empty">{error}</div>;
  if (!lyrics) return <div className="lyrics-empty">No lyrics found</div>;
  if (lyrics.instrumental) return <div className="lyrics-empty">Instrumental track</div>;

  return (
    <div className="lyrics-widget">
      {lyrics.syncedLyrics && lyrics.plainLyrics && (
        <div className="lyrics-modes">
          <button className={mode === 'synced' ? 'active' : ''} onClick={() => setMode('synced')}>Synced</button>
          <button className={mode === 'plain' ? 'active' : ''} onClick={() => setMode('plain')}>Plain</button>
        </div>
      )}
      {mode === 'synced' && lines.length ? (
        <div className="synced-lyrics">
          {lines.map((line, index) => (
            <button
              key={`${line.time}-${index}`}
              ref={index === activeIndex ? activeRef : undefined}
              className={index === activeIndex ? 'active' : ''}
              onClick={() => props.onSeek(line.time)}
            >
              {line.text || '...'}
            </button>
          ))}
        </div>
      ) : (
        <div className="plain-lyrics">{lyrics.plainLyrics || 'No plain lyrics available'}</div>
      )}
    </div>
  );
}

function activeLyricIndex(lines: Array<{ time: number }>, currentTime: number): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].time <= currentTime) return index;
  }
  return -1;
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * scale));
  const height = Math.max(1, Math.floor(canvas.clientHeight * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawSpectrum(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteFrequencyData(data);
  const styles = getComputedStyle(document.documentElement);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = styles.getPropertyValue('--color-surface-alt').trim();
  context.fillRect(0, 0, canvas.width, canvas.height);
  const count = Math.min(96, data.length);
  const width = canvas.width / count;
  context.fillStyle = styles.getPropertyValue('--color-waveform').trim();
  for (let index = 0; index < count; index += 1) {
    const source = Math.floor((index / count) ** 2 * (data.length - 1));
    const height = Math.max(1, (data[source] / 255) * canvas.height);
    context.fillRect(index * width, canvas.height - height, Math.max(1, width - 1), height);
  }
}

function drawOscilloscope(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(data);
  const styles = getComputedStyle(document.documentElement);
  context.fillStyle = styles.getPropertyValue('--color-surface-alt').trim();
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = styles.getPropertyValue('--color-waveform').trim();
  context.lineWidth = Math.max(1, window.devicePixelRatio || 1);
  context.beginPath();
  data.forEach((value, index) => {
    const x = (index / (data.length - 1)) * canvas.width;
    const y = (value / 255) * canvas.height;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
}

function drawSpectrogram(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteFrequencyData(data);
  context.drawImage(canvas, -2, 0);
  const bins = Math.min(data.length, canvas.height);
  for (let y = 0; y < canvas.height; y += 2) {
    const bin = Math.floor(((canvas.height - y) / canvas.height) ** 2 * (bins - 1));
    const value = data[bin] / 255;
    context.fillStyle = `hsl(${195 - value * 190} 90% ${8 + value * 55}%)`;
    context.fillRect(canvas.width - 2, y, 2, 2);
  }
}

function CustomWidget(props: { definition?: CustomWidgetDefinition; track?: Track; playback: PlaybackState }) {
  const content = useMemo(
    () => renderTemplate(props.definition?.template || '', props.track, props.playback),
    [props.definition?.template, props.playback, props.track]
  );
  return <div className="custom-widget" style={sanitizeStyle(props.definition?.style)}>{content}</div>;
}

function renderTemplate(template: string, track: Track | undefined, playback: PlaybackState): string {
  const values: Record<string, string> = {
    'track.title': track?.title || '-',
    'track.artist': track?.artist || '-',
    'track.genre': track?.genre || '-',
    'track.duration': formatDuration(track?.duration),
    'playback.elapsed': formatDuration(playback.currentTime),
    'playback.duration': formatDuration(playback.duration || track?.duration),
    'playback.volume': `${Math.round(playback.volume * 100)}%`
  };
  return template.replace(/\{\{([\w.]+)}}/g, (_match, key: string) => values[key] ?? '');
}

function sanitizeStyle(input: Record<string, string> | undefined): CSSProperties {
  const allowed = new Set(['color', 'background', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'padding', 'textAlign', 'whiteSpace']);
  return Object.fromEntries(Object.entries(input || {}).filter(([key]) => allowed.has(key))) as CSSProperties;
}

function widgetTitle(kind: WidgetKind): string {
  return kind === 'spectrogram' ? 'Spectrogram' : kind === 'oscilloscope' ? 'Oscilloscope' : kind === 'spectrum' ? 'Spectrum' : kind === 'waveform' ? 'Waveform' : kind === 'lyrics' ? 'Lyrics' : kind === 'now-playing' ? 'Now Playing' : kind === 'track-stats' ? 'Track Stats' : 'Widget';
}
