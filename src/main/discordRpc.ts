import { Client, type Presence } from 'discord-rpc';
import type { DiscordRpcSettings, PlaybackState, Track } from '../shared/types';

interface PresenceState {
  track?: Track;
  playback: PlaybackState;
}

const MIN_UPDATE_INTERVAL = 4_000;
const TIMELINE_DRIFT_TOLERANCE = 1_500;

export class DiscordRichPresence {
  private settings: DiscordRpcSettings = { enabled: false, applicationId: '', largeImageKey: 'auralis', showListenButton: true };
  private client?: Client;
  private ready = false;
  private latest?: PresenceState;
  private lastSignature = '';
  private lastSentAt = 0;
  private updateTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private generation = 0;
  private timelineRevision = 0;
  private previousTimeline?: { trackId: string; playing: boolean; currentTime: number; anchor: number };

  async configure(settings: DiscordRpcSettings): Promise<void> {
    const next = {
      enabled: settings.enabled === true,
      applicationId: settings.applicationId.trim(),
      largeImageKey: settings.largeImageKey.trim(),
      showListenButton: settings.showListenButton !== false
    };
    if (JSON.stringify(next) === JSON.stringify(this.settings)) return;
    this.settings = next;
    await this.disconnect();
    if (!next.enabled) return;
    if (!/^\d{17,20}$/.test(next.applicationId)) return;
    await this.connect();
  }

  update(track: Track | undefined, playback: PlaybackState): void {
    const now = Date.now();
    const nextTimeline = {
      trackId: String(track?.id ?? ''),
      playing: playback.playing,
      currentTime: playback.currentTime,
      anchor: now - playback.currentTime
    };
    const previous = this.previousTimeline;
    const timelineChanged = !previous || previous.trackId !== nextTimeline.trackId || previous.playing !== nextTimeline.playing ||
      (playback.playing
        ? Math.abs(previous.anchor - nextTimeline.anchor) > TIMELINE_DRIFT_TOLERANCE
        : Math.abs(previous.currentTime - nextTimeline.currentTime) > TIMELINE_DRIFT_TOLERANCE);
    if (timelineChanged) this.timelineRevision += 1;
    this.previousTimeline = nextTimeline;
    this.latest = { track, playback };
    void this.publish(false);
  }

  async destroy(): Promise<void> {
    this.settings = { ...this.settings, enabled: false };
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    const client = new Client({ transport: 'ipc' });
    this.client = client;
    client.on('ready', () => {
      if (generation !== this.generation) return;
      this.ready = true;
      void this.publish(true);
    });
    client.on('disconnected', () => {
      if (generation !== this.generation) return;
      this.ready = false;
      this.scheduleReconnect();
    });
    try {
      await client.login({ clientId: this.settings.applicationId });
    } catch {
      if (generation !== this.generation) return;
      this.ready = false;
      this.scheduleReconnect();
    }
  }

  private async disconnect(): Promise<void> {
    this.generation += 1;
    this.ready = false;
    this.lastSignature = '';
    if (this.updateTimer) clearTimeout(this.updateTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.updateTimer = undefined;
    this.reconnectTimer = undefined;
    const client = this.client;
    this.client = undefined;
    if (client) await client.destroy().catch(() => undefined);
  }

  private scheduleReconnect(): void {
    if (!this.settings.enabled || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.settings.enabled && !this.ready) void this.connect();
    }, 15_000);
    this.reconnectTimer.unref();
  }

  private async publish(force: boolean): Promise<void> {
    if (!this.ready || !this.client || !this.latest) return;
    const signature = presenceSignature(this.latest, this.timelineRevision);
    if (!force && signature === this.lastSignature) return;
    const elapsed = Date.now() - this.lastSentAt;
    if (!force && elapsed < MIN_UPDATE_INTERVAL) {
      if (!this.updateTimer) {
        this.updateTimer = setTimeout(() => {
          this.updateTimer = undefined;
          void this.publish(true);
        }, MIN_UPDATE_INTERVAL - elapsed);
        this.updateTimer.unref();
      }
      return;
    }
    const { track, playback } = this.latest;
    try {
      if (!track) {
        await this.client.clearActivity();
      } else {
        await this.client.setActivity(buildPresence(track, playback, this.settings));
      }
      this.lastSignature = signature;
      this.lastSentAt = Date.now();
    } catch {
      this.ready = false;
      this.scheduleReconnect();
    }
  }
}

export function buildPresence(track: Track, playback: PlaybackState, settings: DiscordRpcSettings): Presence {
  const activity: Presence = {
    details: presenceText(track.title || 'Unknown track'),
    state: presenceText(`by ${track.artist || 'Unknown artist'}`),
    largeImageText: truncate(`${track.title} — ${track.artist}`, 128),
    instance: false
  };
  const artwork = publicArtworkUrl(track.artworkUrl);
  if (artwork) activity.largeImageKey = artwork;
  else if (settings.largeImageKey) activity.largeImageKey = settings.largeImageKey;
  if (playback.playing) {
    const duration = playback.duration || track.duration;
    const start = Date.now() - Math.max(0, playback.currentTime);
    activity.startTimestamp = start;
    if (duration > playback.currentTime) activity.endTimestamp = start + duration;
  } else {
    activity.smallImageText = 'Paused';
  }
  if (settings.showListenButton && track.permalinkUrl?.startsWith('https://soundcloud.com/')) {
    activity.buttons = [{ label: 'Listen on SoundCloud', url: track.permalinkUrl }];
  }
  return activity;
}

function presenceSignature(state: PresenceState, timelineRevision: number): string {
  const { track, playback } = state;
  return `${track?.id ?? ''}|${playback.playing}|${timelineRevision}`;
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function presenceText(value: string): string {
  const trimmed = value.trim();
  return truncate(trimmed.length >= 2 ? trimmed : `${trimmed} ·`, 128);
}

function publicArtworkUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
