import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetadataCache } from '../src/main/cache';
import type { Track } from '../src/shared/types';

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('offline cache', () => {
  it('stores, restores, and removes an offline track', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auralis-cache-'));
    roots.push(root);
    const cache = new MetadataCache(root);
    const track: Track = {
      id: 42,
      title: 'Cached Track',
      artist: 'Artist',
      duration: 1000,
      source: 'web',
      raw: { media: 'not persisted' }
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(2048), { status: 200 })));

    const saved = await cache.saveOffline(track, 'https://media.example/track.mp3');
    expect(saved.offline).toBe(true);
    expect(saved.streamUrl).toMatch(/^file:/);
    expect(saved.raw).toBeUndefined();
    expect(await cache.offlineTracks()).toHaveLength(1);

    await cache.removeOffline(track.id);
    expect(await cache.offlineTracks()).toEqual([]);
  });
});
