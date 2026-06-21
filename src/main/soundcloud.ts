import path from 'node:path';
import type { AuthService } from './auth';
import { mapUser, soundcloudHeaders } from './auth';
import type { MetadataCache } from './cache';
import { mockArtists, mockPlaylists, mockSearch, mockTracks } from '../shared/mockData';
import type { Playlist, SearchResults, Track, UserProfile } from '../shared/types';

const SC_API_BASE = 'https://api.soundcloud.com';

export class SoundCloudService {
  constructor(
    private readonly auth: AuthService,
    private readonly cache: MetadataCache
  ) {}

  async search(query: string, limit: number, forceMock = false): Promise<SearchResults> {
    if (forceMock) return mockSearch(query);
    try {
      const token = await this.auth.ensureAccessToken().catch(() => this.auth.getAppToken());
      const cacheKey = `search:${query}:${limit}`;
      const cached = await this.cache.get<SearchResults>('soundcloud', cacheKey);
      if (cached) return cached;
      const [tracks, artists, playlists] = await Promise.all([
        this.fetchCollection<Record<string, unknown>>(`/tracks?q=${encodeURIComponent(query)}&access=playable&linked_partitioning=true&limit=${limit}`, token),
        this.fetchCollection<Record<string, unknown>>(`/users?q=${encodeURIComponent(query)}&linked_partitioning=true&limit=${Math.min(limit, 30)}`, token),
        this.fetchCollection<Record<string, unknown>>(`/playlists?q=${encodeURIComponent(query)}&show_tracks=false&linked_partitioning=true&limit=${limit}`, token)
      ]);
      const mappedPlaylists = playlists.map(mapPlaylist);
      const result: SearchResults = {
        tracks: tracks.map(mapTrack),
        artists: artists.map(mapUser),
        playlists: mappedPlaylists.filter((playlist) => playlist.kind !== 'album'),
        albums: mappedPlaylists.filter((playlist) => playlist.kind === 'album'),
        mode: 'soundcloud'
      };
      await this.cache.set('soundcloud', cacheKey, result, 4);
      return result;
    } catch (error) {
      const fallback = mockSearch(query);
      fallback.warning = `${error instanceof Error ? error.message : 'SoundCloud search failed.'} Showing mock results.`;
      return fallback;
    }
  }

  async likedTracks(limit = 50): Promise<Track[]> {
    try {
      const token = await this.auth.ensureAccessToken();
      const likes = await this.fetchCollection<Record<string, unknown>>(`/me/likes/tracks?linked_partitioning=true&limit=${limit}`, token);
      return likes.map((item) => {
        const track = (item.track && typeof item.track === 'object') ? item.track as Record<string, unknown> : item;
        return mapTrack(track);
      });
    } catch {
      return mockTracks.slice(0, limit);
    }
  }

  async library(): Promise<{ tracks: Track[]; playlists: Playlist[] }> {
    try {
      const token = await this.auth.ensureAccessToken();
      const [tracks, playlists] = await Promise.all([
        this.fetchCollection<Record<string, unknown>>('/me/tracks?linked_partitioning=true&limit=50', token),
        this.fetchCollection<Record<string, unknown>>('/me/playlists?show_tracks=false&linked_partitioning=true&limit=50', token)
      ]);
      return {
        tracks: tracks.map(mapTrack),
        playlists: playlists.map(mapPlaylist)
      };
    } catch {
      return {
        tracks: mockTracks,
        playlists: mockPlaylists
      };
    }
  }

  async getTrack(trackId: string | number): Promise<Track> {
    if (String(trackId).startsWith('mock-')) {
      return mockTracks.find((track) => track.id === trackId) ?? mockTracks[0];
    }
    const token = await this.auth.ensureAccessToken().catch(() => this.auth.getAppToken());
    const data = await this.fetchJson<Record<string, unknown>>(`/tracks/${trackId}`, token);
    return mapTrack(data);
  }

  async getArtist(userId: string | number): Promise<{ artist: UserProfile; tracks: Track[]; playlists: Playlist[] }> {
    if (String(userId).startsWith('mock-')) {
      const artist = mockArtists.find((item) => item.id === userId) ?? mockArtists[0];
      return {
        artist,
        tracks: mockTracks.filter((track) => track.artistId === artist.id),
        playlists: mockPlaylists.filter((playlist) => playlist.authorId === artist.id)
      };
    }
    const token = await this.auth.ensureAccessToken().catch(() => this.auth.getAppToken());
    const [artistData, tracks, playlists] = await Promise.all([
      this.fetchJson<Record<string, unknown>>(`/users/${userId}`, token),
      this.fetchCollection<Record<string, unknown>>(`/users/${userId}/tracks?linked_partitioning=true&limit=50`, token),
      this.fetchCollection<Record<string, unknown>>(`/users/${userId}/playlists?show_tracks=false&linked_partitioning=true&limit=50`, token)
    ]);
    return {
      artist: mapUser(artistData),
      tracks: tracks.map(mapTrack),
      playlists: playlists.map(mapPlaylist)
    };
  }

  async getPlaylist(playlistId: string | number): Promise<Playlist> {
    if (String(playlistId).startsWith('mock-')) {
      return mockPlaylists.find((playlist) => playlist.id === playlistId) ?? mockPlaylists[0];
    }
    const token = await this.auth.ensureAccessToken().catch(() => this.auth.getAppToken());
    const data = await this.fetchJson<Record<string, unknown>>(`/playlists/${playlistId}?show_tracks=true`, token);
    return mapPlaylist(data);
  }

  async streamUrl(track: Track): Promise<string> {
    if (track.streamUrl?.startsWith('mock://')) return track.streamUrl;
    if (track.access === 'blocked') throw new Error('This track is not available for off-platform playback.');
    const token = await this.auth.ensureAccessToken().catch(() => this.auth.getAppToken());
    const fullTrack = track.raw ? track.raw as Record<string, unknown> : await this.fetchJson<Record<string, unknown>>(`/tracks/${track.id}`, token);
    const fromTranscoding = await this.resolveTranscoding(fullTrack, token);
    if (fromTranscoding) return fromTranscoding;
    const response = await fetch(`${SC_API_BASE}/tracks/${track.id}/stream`, {
      redirect: 'manual',
      headers: soundcloudHeaders(token)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) return location;
    }
    if (response.ok) return response.url;
    throw new Error(`Unable to resolve stream URL (${response.status}).`);
  }

  async cacheArtwork(url: string): Promise<string | undefined> {
    const file = await this.cache.cacheArtwork(url);
    return file ? `file://${path.resolve(file).replace(/\\/g, '/')}` : undefined;
  }

  private async resolveTranscoding(track: Record<string, unknown>, token: string): Promise<string | undefined> {
    const media = track.media as Record<string, unknown> | undefined;
    const transcodings = Array.isArray(media?.transcodings) ? media.transcodings as Record<string, unknown>[] : [];
    const playable = transcodings.find((item) => String(item.format && (item.format as Record<string, unknown>).protocol).includes('progressive'))
      ?? transcodings.find((item) => String(item.format && (item.format as Record<string, unknown>).protocol).includes('hls'))
      ?? transcodings[0];
    const url = playable?.url;
    if (typeof url !== 'string') return undefined;
    const response = await fetch(url, { headers: soundcloudHeaders(token) });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Transcoding request failed (${response.status}).`);
    return typeof data.url === 'string' ? data.url : undefined;
  }

  private async fetchJson<T>(pathName: string, token: string): Promise<T> {
    const response = await fetch(`${SC_API_BASE}${pathName}`, {
      headers: soundcloudHeaders(token)
    });
    const data = await response.json().catch(() => ({})) as T & { message?: string };
    if (!response.ok) {
      throw new Error(data.message ?? `SoundCloud API failed (${response.status}).`);
    }
    return data;
  }

  private async fetchCollection<T>(pathName: string, token: string): Promise<T[]> {
    const data = await this.fetchJson<T[] | { collection?: T[] }>(pathName, token);
    if (Array.isArray(data)) return data;
    return data.collection ?? [];
  }
}

export function mapTrack(data: Record<string, unknown>): Track {
  const user = (data.user && typeof data.user === 'object') ? data.user as Record<string, unknown> : {};
  const publisher = (data.publisher_metadata && typeof data.publisher_metadata === 'object') ? data.publisher_metadata as Record<string, unknown> : {};
  return {
    id: data.id as number | string,
    title: String(data.title ?? 'Untitled'),
    artist: String(user.username ?? data.user_username ?? 'Unknown artist'),
    artistId: user.id as number | string | undefined,
    duration: Number(data.duration ?? 0),
    artworkUrl: chooseArtwork(data),
    waveformUrl: typeof data.waveform_url === 'string' ? data.waveform_url : undefined,
    permalinkUrl: typeof data.permalink_url === 'string' ? data.permalink_url : undefined,
    streamUrl: typeof data.stream_url === 'string' ? data.stream_url : undefined,
    bpm: typeof data.bpm === 'number' ? data.bpm : undefined,
    genre: typeof data.genre === 'string' ? data.genre : undefined,
    album: typeof publisher.album_title === 'string' ? publisher.album_title : undefined,
    playbackCount: typeof data.playback_count === 'number' ? data.playback_count : undefined,
    likesCount: typeof data.likes_count === 'number' ? data.likes_count : undefined,
    access: data.policy === 'SNIP' ? 'preview' : typeof data.access === 'string' ? data.access : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    liked: data.user_favorite === true,
    downloadable: data.downloadable === true,
    source: 'soundcloud',
    raw: data
  };
}

export function mapPlaylist(data: Record<string, unknown>): Playlist {
  const user = (data.user && typeof data.user === 'object') ? data.user as Record<string, unknown> : {};
  const tracks = Array.isArray(data.tracks)
    ? (data.tracks as Record<string, unknown>[]).filter(Boolean).map(mapTrack)
    : undefined;
  const kind = normalizePlaylistKind(data);
  return {
    id: data.id as number | string,
    title: String(data.title ?? 'Untitled playlist'),
    author: String(user.username ?? 'Unknown user'),
    authorId: user.id as number | string | undefined,
    trackCount: Number(data.track_count ?? tracks?.length ?? 0),
    artworkUrl: chooseArtwork(data),
    permalinkUrl: typeof data.permalink_url === 'string' ? data.permalink_url : undefined,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    kind,
    tracks,
    source: 'soundcloud',
    raw: data
  };
}

function normalizePlaylistKind(data: Record<string, unknown>): Playlist['kind'] {
  const type = String(data.playlist_type ?? data.kind ?? '').toLowerCase();
  if (type.includes('album')) return 'album';
  return 'playlist';
}

function chooseArtwork(data: Record<string, unknown>): string | undefined {
  const artwork = typeof data.artwork_url === 'string' ? data.artwork_url : undefined;
  if (artwork) return artwork.replace('-large', '-t500x500');
  const user = (data.user && typeof data.user === 'object') ? data.user as Record<string, unknown> : {};
  return typeof user.avatar_url === 'string' ? user.avatar_url.replace('-large', '-t500x500') : undefined;
}
