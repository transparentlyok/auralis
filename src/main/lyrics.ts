import type { LyricsRecord, Track } from '../shared/types';
import type { MetadataCache } from './cache';

const LRCLIB_ORIGIN = 'https://lrclib.net';
const CLIENT = 'Auralis v0.1.0 (https://github.com/)';

type LrclibRecord = Omit<LyricsRecord, 'source'>;

export class LyricsService {
  private readonly inFlight = new Map<string, Promise<LyricsRecord | undefined>>();

  constructor(private readonly cache: MetadataCache) {}

  async get(track: Track): Promise<LyricsRecord | undefined> {
    const key = `${track.artist}\n${track.title}\n${track.album ?? ''}\n${Math.round(track.duration / 1000)}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const request = this.lookup(track, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async lookup(track: Track, key: string): Promise<LyricsRecord | undefined> {
    const cached = await this.cache.get<LyricsRecord | null>('lyrics-v4', key);
    if (cached !== undefined) return cached ?? undefined;

    const signatures = candidateSignatures(track);
    const exact = this.exact(track, signatures[0]).catch(() => undefined);
    const searched = this.search(track, signatures).catch(() => undefined);
    const [exactRecord, searchedRecord] = await Promise.all([exact, searched]);
    const record = exactRecord ?? searchedRecord;
    const result = record ? { ...record, source: 'lrclib' as const } : undefined;
    await this.cache.set('lyrics-v4', key, result ?? null, result ? 24 * 30 : 0.25);
    return result;
  }

  private async exact(track: Track, signature: LyricsSignature): Promise<LrclibRecord | undefined> {
    const url = new URL('/api/get', LRCLIB_ORIGIN);
    url.searchParams.set('track_name', signature.title);
    url.searchParams.set('artist_name', signature.artist);
    url.searchParams.set('album_name', track.album ?? '');
    url.searchParams.set('duration', String(Math.round(track.duration / 1000)));
    const response = await fetch(url, { headers: requestHeaders(), signal: AbortSignal.timeout(8_000) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`LRCLIB lookup failed (${response.status}).`);
    return response.json() as Promise<LrclibRecord>;
  }

  private async search(track: Track, signatures: LyricsSignature[]): Promise<LrclibRecord | undefined> {
    const requests = signatures.slice(0, 3).map((signature) => this.searchSignature(signature).catch(() => []));
    const queryUrl = new URL('/api/search', LRCLIB_ORIGIN);
    queryUrl.searchParams.set('q', `${signatures[0].artist} ${signatures[0].title}`);
    requests.push(fetch(queryUrl, { headers: requestHeaders(), signal: AbortSignal.timeout(15_000) })
      .then((response) => response.ok ? response.json() as Promise<LrclibRecord[]> : [])
      .catch(() => []));
    return bestLyricsMatch((await Promise.all(requests)).flat(), signatures, track.duration);
  }

  private async searchSignature(signature: LyricsSignature): Promise<LrclibRecord[]> {
      const url = new URL('/api/search', LRCLIB_ORIGIN);
      url.searchParams.set('track_name', signature.title);
      url.searchParams.set('artist_name', signature.artist);
      const response = await fetch(url, { headers: requestHeaders(), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`LRCLIB search failed (${response.status}).`);
      return response.json() as Promise<LrclibRecord[]>;
  }
}

interface LyricsSignature {
  title: string;
  artist: string;
}

function requestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': CLIENT,
    'X-User-Agent': CLIENT,
    'Lrclib-Client': CLIENT
  };
}

function lyricsScore(record: LrclibRecord, signatures: LyricsSignature[], duration: number): number {
  const durationDifference = Math.abs(Number(record.duration) - duration / 1000);
  let score = Math.max(0, 40 - durationDifference * 4);
  for (const signature of signatures) {
    const title = normalize(signature.title);
    const artist = normalize(signature.artist);
    let match = 0;
    if (normalize(record.trackName) === title) match += 100;
    else if (normalize(record.trackName).includes(title) || title.includes(normalize(record.trackName))) match += 45;
    if (normalize(record.artistName) === artist) match += 70;
    else if (normalize(record.artistName).includes(artist) || artist.includes(normalize(record.artistName))) match += 30;
    score = Math.max(score, Math.max(0, 40 - durationDifference * 4) + match);
  }
  if (record.syncedLyrics) score += 12;
  return score;
}

function bestLyricsMatch(records: LrclibRecord[], signatures: LyricsSignature[], duration: number): LrclibRecord | undefined {
  const ranked = records
    .filter((record) => record.plainLyrics || record.syncedLyrics || record.instrumental)
    .filter((record, index, all) => all.findIndex((item) => item.id === record.id) === index)
    .sort((left, right) => lyricsScore(right, signatures, duration) - lyricsScore(left, signatures, duration));
  return ranked[0] && lyricsScore(ranked[0], signatures, duration) >= 65 ? ranked[0] : undefined;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\.(mp3|wav|flac|m4a)$/i, '')
    .replace(/\s*[[(](?:prod\.?|produced by|official|audio|video|visuali[sz]er)[^\])]*[\])]/gi, '')
    .replace(/\s+(?:prod\.?|produced by)\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateSignatures(track: Track): LyricsSignature[] {
  const signatures: LyricsSignature[] = [{ title: cleanTitle(track.title), artist: track.artist.trim() }];
  const split = cleanTitle(track.title).match(/^(.+?)\s+-\s+(.+)$/);
  if (split) signatures.push({ artist: split[1].trim(), title: split[2].trim() });
  const withoutFeatures = cleanTitle(track.title)
    .replace(/\s*[[(][^\])]*(?:feat\.?|ft\.?|remix|mix)[^\])]*[\])]/gi, '')
    .replace(/\s+(?:feat\.?|ft\.?)\s+.+$/i, '')
    .trim();
  if (withoutFeatures && withoutFeatures !== signatures[0].title) signatures.push({ title: withoutFeatures, artist: track.artist.trim() });
  return signatures.filter((signature, index, all) => all.findIndex((item) => normalize(item.title) === normalize(signature.title) && normalize(item.artist) === normalize(signature.artist)) === index);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
