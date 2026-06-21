import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Track } from '../shared/types';

interface CacheEntry<T> {
  savedAt: number;
  ttlMs: number;
  value: T;
}

interface OfflineIndex {
  version: 1;
  tracks: Track[];
}

export class MetadataCache {
  constructor(private readonly cacheRoot: string) {}

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const file = this.pathFor(namespace, key);
    try {
      const entry = JSON.parse(await fs.readFile(file, 'utf8')) as CacheEntry<T>;
      if (Date.now() - entry.savedAt > entry.ttlMs) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(namespace: string, key: string, value: T, ttlHours: number): Promise<void> {
    const file = this.pathFor(namespace, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const entry: CacheEntry<T> = {
      savedAt: Date.now(),
      ttlMs: ttlHours * 60 * 60 * 1000,
      value
    };
    await fs.writeFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async cacheArtwork(url: string): Promise<string | undefined> {
    if (!url) return undefined;
    const ext = extensionFor(url);
    const file = path.join(this.cacheRoot, 'artwork', `${hash(url)}${ext}`);
    try {
      await fs.access(file);
      return file;
    } catch {
      // Continue and fetch below.
    }
    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
      return file;
    } catch {
      return undefined;
    }
  }

  async saveOffline(track: Track, streamUrl: string): Promise<Track> {
    const file = path.join(this.cacheRoot, 'offline', `${hash(String(track.id))}.mp3`);
    const response = await fetch(streamUrl);
    if (!response.ok) throw new Error(`Offline download failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1024) throw new Error('SoundCloud returned an empty offline audio file.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);

    const offlineTrack: Track = {
      ...track,
      streamUrl: pathToFileURL(file).toString(),
      offline: true,
      raw: undefined
    };
    const index = await this.readOfflineIndex();
    index.tracks = [offlineTrack, ...index.tracks.filter((item) => String(item.id) !== String(track.id))];
    await this.writeOfflineIndex(index);
    return offlineTrack;
  }

  async offlineTracks(): Promise<Track[]> {
    const index = await this.readOfflineIndex();
    const available: Track[] = [];
    for (const track of index.tracks) {
      if (!track.streamUrl?.startsWith('file:')) continue;
      try {
        await fs.access(new URL(track.streamUrl));
        available.push({ ...track, offline: true });
      } catch {
        // Missing files are removed from the returned library.
      }
    }
    if (available.length !== index.tracks.length) await this.writeOfflineIndex({ version: 1, tracks: available });
    return available;
  }

  async removeOffline(trackId: string | number): Promise<void> {
    const index = await this.readOfflineIndex();
    const existing = index.tracks.find((track) => String(track.id) === String(trackId));
    if (existing?.streamUrl?.startsWith('file:')) {
      await fs.unlink(new URL(existing.streamUrl)).catch(() => undefined);
    }
    index.tracks = index.tracks.filter((track) => String(track.id) !== String(trackId));
    await this.writeOfflineIndex(index);
  }

  private async readOfflineIndex(): Promise<OfflineIndex> {
    try {
      const value = JSON.parse(await fs.readFile(this.offlineIndexPath, 'utf8')) as Partial<OfflineIndex>;
      return { version: 1, tracks: Array.isArray(value.tracks) ? value.tracks : [] };
    } catch {
      return { version: 1, tracks: [] };
    }
  }

  private async writeOfflineIndex(index: OfflineIndex): Promise<void> {
    await fs.mkdir(path.dirname(this.offlineIndexPath), { recursive: true });
    await fs.writeFile(this.offlineIndexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }

  private get offlineIndexPath(): string {
    return path.join(this.cacheRoot, 'offline', 'index.json');
  }

  private pathFor(namespace: string, key: string): string {
    return path.join(this.cacheRoot, 'metadata', namespace, `${hash(key)}.json`);
  }
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extensionFor(url: string): string {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    return ext && ext.length <= 6 ? ext : '.jpg';
  } catch {
    return '.jpg';
  }
}
