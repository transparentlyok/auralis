import { app, BrowserWindow, Notification, WebContentsView, session, shell, type WebContents } from 'electron';
import type { AudioQuality, Playlist, SearchCategory, SearchResults, Track, UserProfile, WebNowPlaying, WebSessionState, WebStreamInfo } from '../shared/types';
import { extractSoundCloudWebApiContext, soundcloudTrackLikePath, type SoundCloudWebApiContext } from '../shared/soundcloudWeb';
import { mapUser } from './auth';
import { mapPlaylist, mapTrack } from './soundcloud';

const SOUNDCLOUD_ORIGIN = 'https://soundcloud.com';
const SOUNDCLOUD_HOME = `${SOUNDCLOUD_ORIGIN}/`;
const SOUNDCLOUD_API_V2 = 'https://api-v2.soundcloud.com';
const SESSION_PARTITION = 'persist:soundcloud';
const AUTH_HOSTS = new Set(['accounts.google.com', 'appleid.apple.com', 'www.facebook.com']);

export type WebMediaCommand = 'playPause' | 'next' | 'previous' | 'stop';

interface WebApiPage {
  collection: Record<string, unknown>[];
  nextHref?: string;
}

export class SoundCloudWebSession {
  private readonly browserSession = session.fromPartition(SESSION_PARTITION);
  private playerView?: WebContentsView;
  private scraperView?: WebContentsView;
  private loginWindow?: BrowserWindow;
  private loading = false;
  private error?: string;
  private authenticated?: boolean;
  private nowPlaying?: WebNowPlaying;
  private currentTrack?: Track;
  private ticker?: NodeJS.Timeout;
  private lastNotificationTitle?: string;
  private recognizedCurrentTrack = false;
  private readonly searchCache = new Map<string, { savedAt: number; value: SearchResults }>();
  private scraperChain: Promise<void> = Promise.resolve();
  private apiContext?: SoundCloudWebApiContext;
  private apiContextPromise?: Promise<SoundCloudWebApiContext>;
  private apiAuthorization?: string;

  constructor(private readonly window: BrowserWindow) {
    this.configureApiRequestCapture();
    void this.restoreApiAuthorization();

    this.browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
  }

  getState(): WebSessionState {
    const contents = this.playerView?.webContents;
    if (!contents || contents.isDestroyed()) {
      return {
        url: SOUNDCLOUD_HOME,
        title: 'SoundCloud bridge',
        canGoBack: false,
        canGoForward: false,
        loading: this.loading,
        visible: false,
        authenticated: this.authenticated,
        error: this.error,
        nowPlaying: this.nowPlaying
      };
    }
    const history = contents.navigationHistory;
    return {
      url: contents.getURL() || SOUNDCLOUD_HOME,
      title: contents.getTitle() || 'SoundCloud bridge',
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      loading: this.loading,
      visible: false,
      authenticated: this.authenticated,
      error: this.error,
      nowPlaying: this.nowPlaying
    };
  }

  async openLogin(): Promise<WebSessionState> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.focus();
      return this.getState();
    }
    this.loginWindow = new BrowserWindow({
      parent: this.window,
      width: 980,
      height: 760,
      minWidth: 720,
      minHeight: 560,
      title: 'Sign in to SoundCloud',
      autoHideMenuBar: true,
      webPreferences: browserPreferences()
    });
    this.configureNavigation(this.loginWindow.webContents, true);
    this.loginWindow.on('closed', () => {
      this.loginWindow = undefined;
      this.apiContext = undefined;
      this.apiContextPromise = undefined;
      void this.ensureWebApiContext().then((context) => {
        this.authenticated = context.userId !== undefined;
        this.emitState();
      }).catch(() => undefined);
    });
    await loadSoundCloudUrl(this.loginWindow.webContents, `${SOUNDCLOUD_ORIGIN}/signin`);
    return this.getState();
  }

  async search(query: string, limit = 30, category: SearchCategory = 'tracks'): Promise<SearchResults> {
    const normalized = query.trim();
    if (!normalized) return { tracks: [], artists: [], playlists: [], albums: [], mode: 'web' };
    const cacheKey = `${normalized.toLowerCase()}:${limit}:${category}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < 5 * 60_000) return cached.value;

    this.loading = true;
    this.error = undefined;
    this.emitState();
    try {
      const value = await this.fastSearch(normalized, limit, category);
      this.searchCache.set(cacheKey, { savedAt: Date.now(), value });
      return value;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'SoundCloud browser search failed.';
      throw error;
    } finally {
      this.loading = false;
      this.emitState();
    }
  }

  async searchMore(nextHref: string, category: SearchCategory): Promise<SearchResults> {
    const parsed = safeUrl(nextHref);
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'api-v2.soundcloud.com') {
      throw new Error('Invalid SoundCloud pagination cursor.');
    }
    const page = await this.fetchWebPage(parsed);
    return this.mapWebSearchPage(category, page);
  }

  async likedTracks(limit = 5000): Promise<Track[]> {
    const userId = await this.requireWebUserId();
    const page = await this.fetchAllCollectionPath(`/users/${userId}/likes`, Math.max(50, limit));
    return page.collection.flatMap((item) => {
      const track = item.track && typeof item.track === 'object' ? item.track as Record<string, unknown> : undefined;
      return track ? [mapWebTrack(track)] : [];
    });
  }

  async library(): Promise<{ tracks: Track[]; playlists: Playlist[] }> {
    const userId = await this.requireWebUserId();
    const [trackPage, playlistPage, albumPage] = await Promise.all([
      this.fetchCollectionPath(`/users/${userId}/tracks`, 100),
      this.fetchCollectionPath(`/users/${userId}/playlists_without_albums`, 100),
      this.fetchCollectionPath(`/users/${userId}/albums`, 100)
    ]);
    return {
      tracks: trackPage.collection.map(mapWebTrack),
      playlists: [
        ...playlistPage.collection.map((item) => ({ ...mapPlaylist(item), kind: 'playlist' as const, source: 'web' as const })),
        ...albumPage.collection.map((item) => ({ ...mapPlaylist(item), kind: 'album' as const, source: 'web' as const }))
      ]
    };
  }

  async getPlaylist(playlist: Playlist): Promise<Playlist> {
    const id = await this.resolveResourceId(playlist.id, playlist.permalinkUrl);
    const url = new URL(`/playlists/${id}`, SOUNDCLOUD_API_V2);
    url.searchParams.set('representation', 'full');
    const data = await this.fetchWebJson(url);
    const rawTracks = Array.isArray(data.tracks) ? data.tracks.filter(isRecord) : [];
    const tracks = await this.hydratePlaylistTracks(rawTracks);
    const mapped = mapPlaylist({ ...data, tracks });
    return {
      ...mapped,
      kind: playlist.kind ?? mapped.kind,
      tracks: mapped.tracks?.map((track) => ({ ...track, source: 'web' as const })),
      source: 'web'
    };
  }

  private async hydratePlaylistTracks(tracks: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const incomplete = tracks.filter((track) => track.id !== undefined && !hasTrackMetadata(track));
    if (!incomplete.length) return tracks;

    const hydrated = new Map<string, Record<string, unknown>>();
    const chunks = chunk(incomplete.map((track) => String(track.id)), 50);
    await Promise.all(chunks.map(async (ids) => {
      const url = new URL('/tracks', SOUNDCLOUD_API_V2);
      url.searchParams.set('ids', ids.join(','));
      try {
        const result = await this.fetchWebJson(url) as unknown;
        const collection = Array.isArray(result)
          ? result
          : isRecord(result) && Array.isArray(result.collection) ? result.collection : [];
        collection.filter(isRecord).forEach((track) => hydrated.set(String(track.id), track));
      } catch {
        // Keep the playlist usable when SoundCloud omits or blocks an individual track.
      }
    }));

    return tracks.map((track) => hydrated.get(String(track.id)) ?? track);
  }

  async getTrack(track: Track): Promise<Track> {
    const id = await this.resolveResourceId(track.id, track.permalinkUrl);
    const data = await this.fetchWebJson(new URL(`/tracks/${id}`, SOUNDCLOUD_API_V2));
    return { ...mapWebTrack(data), offline: track.offline, streamUrl: track.streamUrl };
  }

  async getArtist(userId: string | number): Promise<{ artist: UserProfile; tracks: Track[]; playlists: Playlist[] }> {
    const id = await this.resolveResourceId(userId, typeof userId === 'string' && userId.startsWith('/') ? absoluteUrl(userId) : undefined);
    const [profile, trackPage, playlistPage, albumPage] = await Promise.all([
      this.fetchWebJson(new URL(`/users/${id}`, SOUNDCLOUD_API_V2)),
      this.fetchCollectionPath(`/users/${id}/tracks`, 100),
      this.fetchCollectionPath(`/users/${id}/playlists_without_albums`, 100),
      this.fetchCollectionPath(`/users/${id}/albums`, 100)
    ]);
    return {
      artist: mapUser(profile),
      tracks: trackPage.collection.map(mapWebTrack),
      playlists: [
        ...playlistPage.collection.map((item) => ({ ...mapPlaylist(item), kind: 'playlist' as const, source: 'web' as const })),
        ...albumPage.collection.map((item) => ({ ...mapPlaylist(item), kind: 'album' as const, source: 'web' as const }))
      ]
    };
  }

  async streamUrl(track: Track, preference: AudioQuality = 'best'): Promise<WebStreamInfo> {
    const streams = await this.streamUrls(track, preference);
    return streams[0];
  }

  async streamUrls(track: Track, preference: AudioQuality = 'best'): Promise<WebStreamInfo[]> {
    if (preference !== 'standard') await this.waitForApiAuthorization(2500);
    const shouldRefresh = preference !== 'standard' && Boolean(this.apiAuthorization);
    const raw = !shouldRefresh && track.raw && typeof track.raw === 'object'
      ? track.raw as Record<string, unknown>
      : await this.fetchWebJson(new URL(`/tracks/${track.id}`, SOUNDCLOUD_API_V2));
    const media = raw.media && typeof raw.media === 'object' ? raw.media as Record<string, unknown> : {};
    const transcodings = Array.isArray(media.transcodings) ? media.transcodings as Record<string, unknown>[] : [];
    const ranked = [...transcodings].sort((left, right) => transcodingScore(right, preference) - transcodingScore(left, preference));
    const resolved = await Promise.all(ranked.map(async (selected): Promise<WebStreamInfo | undefined> => {
      if (typeof selected.url !== 'string') return undefined;
      const format = selected.format && typeof selected.format === 'object' ? selected.format as Record<string, unknown> : {};
      const protocol = format.protocol === 'hls' ? 'hls' : 'progressive';
      const url = new URL(selected.url);
      const authorization = raw.track_authorization;
      if (typeof authorization === 'string') url.searchParams.set('track_authorization', authorization);
      try {
        const data = await this.fetchWebJson(url);
        if (typeof data.url !== 'string') return undefined;
        return {
          url: data.url,
          protocol,
          quality: typeof selected.quality === 'string' ? selected.quality : 'sq',
          mimeType: typeof format.mime_type === 'string' ? format.mime_type : undefined
        };
      } catch {
        // A failed transcoding should not make the entire track unplayable.
        return undefined;
      }
    }));
    const streams = resolved.filter((stream): stream is WebStreamInfo => Boolean(stream))
      .filter((stream, index, all) => all.findIndex((item) => item.url === stream.url) === index);
    if (!streams.length) throw new Error('SoundCloud did not return a playable audio stream.');
    return streams;
  }

  async likeTrack(track: Track): Promise<Track> {
    if (track.liked) return track;
    const [userId, trackId] = await Promise.all([
      this.requireWebUserId(),
      this.resolveResourceId(track.id, track.permalinkUrl)
    ]);
    await this.fetchWebMutation(new URL(soundcloudTrackLikePath(userId, trackId), SOUNDCLOUD_API_V2), 'PUT');
    return {
      ...track,
      liked: true,
      likesCount: typeof track.likesCount === 'number' ? track.likesCount + 1 : track.likesCount
    };
  }

  async waveform(track: Track): Promise<number[]> {
    if (!track.waveformUrl) return [];
    const parsed = safeUrl(track.waveformUrl);
    if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname.endsWith('sndcdn.com')) return [];
    const response = await this.browserSession.fetch(parsed.toString());
    const data = await response.json().catch(() => ({})) as { samples?: number[] };
    if (!response.ok || !Array.isArray(data.samples)) return [];
    return downsampleWaveform(data.samples, 256);
  }

  async playTrack(track: Track): Promise<WebSessionState> {
    const playerView = this.ensurePlayerView();
    const target = requireSoundCloudPath(track.permalinkUrl || String(track.id));
    this.currentTrack = track;
    this.recognizedCurrentTrack = false;
    this.nowPlaying = {
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      playing: false,
      currentTime: 0,
      duration: track.duration,
      volume: this.nowPlaying?.volume ?? 0.78
    };
    this.emitState();
    await loadSoundCloudUrl(playerView.webContents, absoluteUrl(target));
    await waitForSelector(playerView.webContents, '#content .playButton, #content [title="Play"]', 12_000);
    const played = await playerView.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('#content .playButton, #content [title="Play"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`, true) as boolean;
    if (!played) throw new Error('SoundCloud did not expose a playable control for this track.');
    await this.refreshNowPlaying(true);
    return this.getState();
  }

  async command(command: WebMediaCommand): Promise<WebSessionState> {
    if (!this.playerView) return this.getState();
    const labels: Record<WebMediaCommand, string[]> = {
      playPause: ['Pause current', 'Play current'],
      next: ['Skip to next'],
      previous: ['Skip to previous'],
      stop: ['Pause current']
    };
    const serialized = JSON.stringify(labels[command]);
    await this.playerView.webContents.executeJavaScript(`(() => {
      for (const label of ${serialized}) {
        const button = document.querySelector('button[aria-label="' + label + '"]');
        if (button instanceof HTMLElement) { button.click(); return true; }
      }
      return false;
    })()`, true).catch(() => false);
    await this.refreshNowPlaying();
    return this.getState();
  }

  async seek(milliseconds: number): Promise<WebSessionState> {
    if (!this.playerView) return this.getState();
    const seconds = Math.max(0, milliseconds / 1000);
    await this.playerView.webContents.executeJavaScript(`(() => {
      const audio = document.querySelector('audio');
      if (!(audio instanceof HTMLAudioElement)) return false;
      audio.currentTime = Math.min(audio.duration || ${seconds}, ${seconds});
      return true;
    })()`, true).catch(() => false);
    await this.refreshNowPlaying();
    return this.getState();
  }

  async setVolume(volume: number): Promise<WebSessionState> {
    if (!this.playerView) return this.getState();
    const next = Math.max(0, Math.min(1, volume));
    await this.playerView.webContents.executeJavaScript(`(() => {
      const audio = document.querySelector('audio');
      if (!(audio instanceof HTMLAudioElement)) return false;
      audio.volume = ${next};
      return true;
    })()`, true).catch(() => false);
    await this.refreshNowPlaying();
    return this.getState();
  }

  async openExternal(): Promise<void> {
    await shell.openExternal(this.currentTrack?.permalinkUrl || SOUNDCLOUD_HOME);
  }

  destroy(): void {
    if (this.ticker) clearInterval(this.ticker);
    if (this.playerView) this.window.contentView.removeChildView(this.playerView);
    if (this.scraperView) this.window.contentView.removeChildView(this.scraperView);
    if (this.playerView && !this.playerView.webContents.isDestroyed()) this.playerView.webContents.close();
    if (this.scraperView && !this.scraperView.webContents.isDestroyed()) this.scraperView.webContents.close();
    this.loginWindow?.close();
  }

  private createHiddenView(): WebContentsView {
    const view = new WebContentsView({ webPreferences: browserPreferences() });
    view.setVisible(false);
    this.window.contentView.addChildView(view);
    this.configureNavigation(view.webContents, false);
    return view;
  }

  private ensurePlayerView(): WebContentsView {
    if (this.playerView && !this.playerView.webContents.isDestroyed()) return this.playerView;
    this.playerView = this.createHiddenView();
    this.configurePlayerEvents(this.playerView);
    return this.playerView;
  }

  private ensureScraperView(): WebContentsView {
    if (this.scraperView && !this.scraperView.webContents.isDestroyed()) return this.scraperView;
    this.scraperView = this.createHiddenView();
    return this.scraperView;
  }

  private get scraperContents(): WebContents {
    return this.ensureScraperView().webContents;
  }

  private async releaseScraperView(contents: WebContents): Promise<void> {
    await releaseWebContents(contents);
    if (!this.scraperView || this.scraperView.webContents !== contents) return;
    this.window.contentView.removeChildView(this.scraperView);
    if (!contents.isDestroyed()) contents.close();
    this.scraperView = undefined;
  }

  private configureNavigation(contents: WebContents, allowAuthWindows: boolean): void {
    contents.setWindowOpenHandler(({ url }) => {
      const parsed = safeUrl(url);
      if (allowAuthWindows && parsed && (isSoundCloudHost(parsed.hostname) || AUTH_HOSTS.has(parsed.hostname))) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: this.loginWindow || this.window,
            autoHideMenuBar: true,
            webPreferences: browserPreferences()
          }
        };
      }
      if (parsed?.protocol === 'https:') void shell.openExternal(parsed.toString());
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      const parsed = safeUrl(url);
      if ((!parsed || parsed.protocol !== 'https:') && url !== 'about:blank') event.preventDefault();
    });
    contents.on('before-input-event', (event, input) => {
      if (app.isPackaged && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) event.preventDefault();
    });
  }

  private configureApiRequestCapture(): void {
    this.browserSession.webRequest.onBeforeSendHeaders(
      { urls: [`${SOUNDCLOUD_API_V2}/*`] },
      (details, callback) => {
        for (const [name, value] of Object.entries(details.requestHeaders)) {
          if (name.toLowerCase() !== 'authorization') continue;
          const authorization = Array.isArray(value) ? value[0] : value;
          if (typeof authorization === 'string') this.apiAuthorization = authorization;
        }
        callback({ requestHeaders: details.requestHeaders });
      }
    );
  }

  private async restoreApiAuthorization(): Promise<void> {
    const cookies = await this.browserSession.cookies.get({ domain: '.soundcloud.com' });
    const token = cookies.find((cookie) => cookie.name.toLowerCase() === 'oauth_token')
      ?? cookies.find((cookie) => /oauth.*token/i.test(cookie.name));
    if (!token?.value) return;
    const value = decodeURIComponent(token.value).replace(/^"|"$/g, '');
    if (value.length > 20) {
      this.apiAuthorization = value.startsWith('OAuth ') ? value : `OAuth ${value}`;
      this.authenticated = true;
      this.emitState();
    }
  }

  private configurePlayerEvents(view: WebContentsView): void {
    view.webContents.on('media-started-playing', () => {
      this.startTicker();
      void this.refreshNowPlaying(true);
    });
    view.webContents.on('media-paused', () => {
      void this.refreshNowPlaying();
      if (this.ticker) clearInterval(this.ticker);
      this.ticker = undefined;
    });
    view.webContents.on('did-fail-load', (_event, code, description) => {
      if (code === -3) return;
      this.error = description || `SoundCloud playback page failed (${code}).`;
      this.emitState();
    });
  }

  private startTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = setInterval(() => void this.refreshNowPlaying(), 750);
  }

  private async refreshNowPlaying(notify = false): Promise<void> {
    if (!this.playerView || this.playerView.webContents.isDestroyed()) return;
    const fallback = this.currentTrack;
    const metadata = await this.playerView.webContents.executeJavaScript(`(() => {
      const audio = document.querySelector('audio');
      const title = document.querySelector('.playbackSoundBadge__titleLink')?.textContent?.trim();
      const artist = document.querySelector('.playbackSoundBadge__lightLink')?.textContent?.trim();
      const artwork = document.querySelector('.playbackSoundBadge__avatar span')?.getAttribute('style') || '';
      const match = artwork.match(/url\\(["']?(.*?)["']?\\)/);
      const duration = audio instanceof HTMLAudioElement && Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
      const currentTime = audio instanceof HTMLAudioElement ? audio.currentTime * 1000 : 0;
      const playing = audio instanceof HTMLAudioElement ? !audio.paused : Boolean(document.querySelector('button[aria-label="Pause current"]'));
      return {
        title: title || ${JSON.stringify(fallback?.title || 'SoundCloud')},
        artist: artist || ${JSON.stringify(fallback?.artist || '')},
        artworkUrl: match?.[1] || ${JSON.stringify(fallback?.artworkUrl || '')},
        playing,
        currentTime,
        duration: duration || ${fallback?.duration || 0},
        volume: audio instanceof HTMLAudioElement ? audio.volume : 0.78,
        ended: Boolean(duration && !playing && currentTime >= duration - 350)
      };
    })()`, true).catch(() => undefined) as WebNowPlaying | undefined;
    if (!metadata) return;
    const expectedTitle = this.currentTrack?.title.trim().toLowerCase();
    const actualTitle = metadata.title.trim().toLowerCase();
    if (expectedTitle && actualTitle === expectedTitle) {
      this.recognizedCurrentTrack = true;
    } else if (this.recognizedCurrentTrack && expectedTitle && actualTitle !== expectedTitle) {
      metadata.ended = true;
      metadata.playing = false;
      await this.playerView.webContents.executeJavaScript(`document.querySelector('button[aria-label="Pause current"]')?.click()`, true).catch(() => undefined);
    }
    this.nowPlaying = metadata;
    this.emitState();
    if (notify && metadata.title && metadata.title !== this.lastNotificationTitle && Notification.isSupported()) {
      this.lastNotificationTitle = metadata.title;
      new Notification({ title: metadata.title, body: metadata.artist || 'SoundCloud', silent: true }).show();
    }
  }

  private async fastSearch(query: string, limit: number, category: SearchCategory): Promise<SearchResults> {
    const endpoints: Record<SearchCategory, string> = {
      tracks: '/search/tracks',
      artists: '/search/users',
      playlists: '/search/playlists_without_albums',
      albums: '/search/albums'
    };
    const url = new URL(endpoints[category], SOUNDCLOUD_API_V2);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(Math.max(1, Math.min(200, limit))));
    url.searchParams.set('offset', '0');
    url.searchParams.set('linked_partitioning', '1');
    const page = await this.fetchWebPage(url);
    return this.mapWebSearchPage(category, page);
  }

  private mapWebSearchPage(category: SearchCategory, page: WebApiPage): SearchResults {
    const { collection } = page;
    return {
      tracks: category === 'tracks' ? collection.map(mapWebTrack) : [],
      artists: category === 'artists' ? collection.map(mapUser) : [],
      playlists: category === 'playlists' ? collection.map((item) => ({ ...mapPlaylist(item), kind: 'playlist' as const, source: 'web' as const })) : [],
      albums: category === 'albums' ? collection.map((item) => ({ ...mapPlaylist(item), kind: 'album' as const, source: 'web' as const })) : [],
      mode: 'web',
      next: page.nextHref ? { [category]: page.nextHref } : undefined
    };
  }

  private async fetchWebPage(url: URL): Promise<WebApiPage> {
    const data = await this.fetchWebJson(url) as { collection?: Record<string, unknown>[]; next_href?: string };
    return {
      collection: Array.isArray(data.collection) ? data.collection : [],
      nextHref: typeof data.next_href === 'string' ? data.next_href : undefined
    };
  }

  private async fetchCollectionPath(path: string, limit: number): Promise<WebApiPage> {
    const url = new URL(path, SOUNDCLOUD_API_V2);
    url.searchParams.set('limit', String(Math.max(1, Math.min(200, limit))));
    url.searchParams.set('offset', '0');
    url.searchParams.set('linked_partitioning', '1');
    return this.fetchWebPage(url);
  }

  private async fetchAllCollectionPath(path: string, limit: number): Promise<WebApiPage> {
    const target = Math.max(1, Math.min(5000, limit));
    const first = new URL(path, SOUNDCLOUD_API_V2);
    first.searchParams.set('limit', String(Math.min(200, target)));
    first.searchParams.set('offset', '0');
    first.searchParams.set('linked_partitioning', '1');
    const collection: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let next: URL | undefined = first;
    let pages = 0;
    while (next && collection.length < target && pages < 30) {
      const page = await this.fetchWebPage(next);
      for (const item of page.collection) {
        const key = String(item.track && typeof item.track === 'object' ? (item.track as Record<string, unknown>).id : item.id ?? collection.length);
        if (seen.has(key)) continue;
        seen.add(key);
        collection.push(item);
        if (collection.length >= target) break;
      }
      const parsed = page.nextHref ? safeUrl(page.nextHref) : undefined;
      next = parsed?.protocol === 'https:' && parsed.hostname === 'api-v2.soundcloud.com' ? parsed : undefined;
      pages += 1;
    }
    return { collection, nextHref: next?.toString() };
  }

  private async fetchWebJson(url: URL): Promise<Record<string, unknown>> {
    const context = await this.ensureWebApiContext();
    url.searchParams.set('client_id', context.clientId);
    url.searchParams.set('app_version', context.appVersion);
    url.searchParams.set('app_locale', 'en');
    const headers: Record<string, string> = { Accept: 'application/json; charset=utf-8' };
    if (this.apiAuthorization) headers.Authorization = this.apiAuthorization;
    const response = await this.browserSession.fetch(url.toString(), {
      headers
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown> & { message?: string };
    if (!response.ok) throw new Error(data.message ?? `SoundCloud web data request failed (${response.status}).`);
    return data;
  }

  private async fetchWebMutation(url: URL, method: 'PUT' | 'DELETE'): Promise<void> {
    const context = await this.ensureWebApiContext();
    await this.restoreApiAuthorization();
    if (!this.apiAuthorization) {
      throw new Error('SoundCloud login was not detected. Open Web Login, sign in, then retry.');
    }
    url.searchParams.set('client_id', context.clientId);
    url.searchParams.set('app_version', context.appVersion);
    url.searchParams.set('app_locale', 'en');
    let response = await this.sendWebMutation(url, method);
    if (response.status === 401 || response.status === 403) {
      await this.refreshWebAuthorization();
      response = await this.sendWebMutation(url, method);
    }
    if (response.ok) return;
    const body = (await response.text()).slice(0, 500);
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      message = parsed.message ?? message;
    } catch {
      // SoundCloud sometimes returns an empty or plain-text write error.
    }
    throw new Error(message || `SoundCloud refused the Like request (${response.status}).`);
  }

  private sendWebMutation(url: URL, method: 'PUT' | 'DELETE'): Promise<Response> {
    return this.browserSession.fetch(url.toString(), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json; charset=utf-8',
        Authorization: this.apiAuthorization ?? '',
        Origin: SOUNDCLOUD_ORIGIN,
        Referer: `${SOUNDCLOUD_ORIGIN}/`
      }
    });
  }

  private async refreshWebAuthorization(): Promise<void> {
    this.apiAuthorization = undefined;
    await this.withScraper(async () => {
      const contents = this.scraperContents;
      try {
        await loadSoundCloudDom(contents, SOUNDCLOUD_HOME);
        await this.waitForApiAuthorization(3_000);
      } finally {
        await this.releaseScraperView(contents);
      }
    });
    if (!this.apiAuthorization) await this.restoreApiAuthorization();
    if (!this.apiAuthorization) {
      throw new Error('SoundCloud has no usable web authorization token even though the page is signed in. Sign out in Web Login, then sign in again.');
    }
  }

  private async waitForApiAuthorization(timeoutMs: number): Promise<void> {
    if (this.apiAuthorization) return;
    const startedAt = Date.now();
    while (!this.apiAuthorization && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async requireWebUserId(): Promise<string | number> {
    const context = await this.ensureWebApiContext();
    if (context.userId !== undefined) return context.userId;
    if (this.apiAuthorization) {
      const me = await this.fetchWebJson(new URL('/me', SOUNDCLOUD_API_V2));
      if (typeof me.id === 'number' || typeof me.id === 'string') {
        context.userId = me.id;
        this.authenticated = true;
        this.emitState();
        return me.id;
      }
    }
    throw new Error('SoundCloud login was not detected. Open Web Login, sign in, then close the window.');
  }

  private async resolveResourceId(value: string | number, permalinkUrl?: string): Promise<string | number> {
    if (/^\d+$/.test(String(value))) return value;
    const target = permalinkUrl || (String(value).startsWith('/') ? absoluteUrl(String(value)) : undefined);
    if (!target) throw new Error('SoundCloud resource URL is unavailable.');
    const url = new URL('/resolve', SOUNDCLOUD_API_V2);
    url.searchParams.set('url', target);
    const resource = await this.fetchWebJson(url);
    if (typeof resource.id !== 'number' && typeof resource.id !== 'string') throw new Error('SoundCloud resource could not be resolved.');
    return resource.id;
  }

  private async ensureWebApiContext(): Promise<SoundCloudWebApiContext> {
    if (this.apiContext) return this.apiContext;
    if (!this.apiContextPromise) {
      const pending = this.withScraper(() => this.discoverWebApiContext());
      this.apiContextPromise = pending.catch((error) => {
        this.apiContextPromise = undefined;
        throw error;
      });
    }
    return this.apiContextPromise;
  }

  private async discoverWebApiContext(): Promise<SoundCloudWebApiContext> {
    await this.restoreApiAuthorization();
    const contents = this.scraperContents;
    await loadSoundCloudDom(contents, SOUNDCLOUD_HOME);
    const source = await contents.executeJavaScript(`(() => {
      const script = Array.from(document.scripts).find((item) => (item.textContent || '').includes('window.__sc_hydration'));
      return script?.textContent || '';
    })()`, true) as string;
    const context = extractSoundCloudWebApiContext(source);
    if (!context) throw new Error('SoundCloud web client context was not found.');
    this.apiContext = context;
    this.authenticated = context.userId !== undefined;
    this.emitState();
    await this.releaseScraperView(contents);
    return context;
  }

  private async scrapeSearchPage(query: string, limit: number, category: SearchCategory): Promise<SearchResults> {
    const encoded = encodeURIComponent(query);
    const tracks = category === 'tracks' ? await this.scrapeTracks(`/search/sounds?q=${encoded}`, limit) : [];
    const artists = category === 'artists' ? await this.scrapeArtists(`/search/people?q=${encoded}`, Math.min(limit, 30)) : [];
    const playlists = category === 'playlists' ? await this.scrapePlaylists(`/search/sets?q=${encoded}`, limit, 'playlist') : [];
    const albums = category === 'albums' ? await this.scrapePlaylists(`/search/albums?q=${encoded}`, limit, 'album') : [];
    return { tracks, artists, playlists, albums, mode: 'web' };
  }

  private async scrapeTracks(path: string, limit: number): Promise<Track[]> {
    await this.loadScraper(path, '#content .sound.track, #content .compactTrackList__item, #content .trackItem, #content span[style*="background-image"], #content img[src]');
    const tracks = await this.extractTracks(false);
    return tracks.slice(0, limit);
  }

  private async scrapeArtists(path: string, limit: number): Promise<UserProfile[]> {
    await this.loadScraper(path, '#content .userItem');
    const users = await this.scraperContents.executeJavaScript(SCRAPE_ARTISTS, true) as UserProfile[];
    return users.slice(0, limit);
  }

  private async scrapePlaylists(path: string, limit: number, kind: 'playlist' | 'album'): Promise<Playlist[]> {
    await this.loadScraper(path, '#content .sound.playlist');
    const playlists = await this.extractPlaylists(kind);
    return playlists.slice(0, limit);
  }

  private async extractTracks(compactOnly: boolean): Promise<Track[]> {
    const script = compactOnly ? SCRAPE_COMPACT_TRACKS : SCRAPE_TRACKS;
    return this.scraperContents.executeJavaScript(script, true) as Promise<Track[]>;
  }

  private async extractPlaylists(kind: 'playlist' | 'album'): Promise<Playlist[]> {
    return this.scraperContents.executeJavaScript(`(${SCRAPE_PLAYLISTS})(${JSON.stringify(kind)})`, true) as Promise<Playlist[]>;
  }

  private async loadScraper(path: string, waitSelector: string): Promise<void> {
    const contents = this.scraperContents;
    await loadSoundCloudUrl(contents, absoluteUrl(requireSoundCloudPath(path)));
    await waitForSelector(contents, waitSelector, 6_000);
    await contents.executeJavaScript(`new Promise((resolve) => setTimeout(resolve, 350))`, true);
    const blocked = await contents.executeJavaScript(`document.body?.innerText?.includes('You have been blocked')`, true) as boolean;
    if (blocked) throw new Error('SoundCloud blocked the browser bridge for this network or session. Open login and retry later.');
  }

  private async refreshAuthentication(): Promise<void> {
    const contents = this.scraperContents;
    if (!contents.getURL()) await loadSoundCloudUrl(contents, SOUNDCLOUD_HOME);
    this.authenticated = await contents.executeJavaScript(`!document.querySelector('.loginButton, button[aria-label="Sign in"]')`, true).catch(() => false) as boolean;
    this.emitState();
  }

  private emitState(): void {
    if (!this.window.isDestroyed()) this.window.webContents.send('web:state', this.getState());
  }

  private withScraper<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.scraperChain.then(operation, operation);
    this.scraperChain = result.then(() => undefined, () => undefined);
    return result;
  }
}

function mapWebTrack(data: Record<string, unknown>): Track {
  const track = mapTrack(data);
  return {
    ...track,
    source: 'web',
    raw: {
      media: data.media,
      track_authorization: data.track_authorization,
      policy: data.policy
    }
  };
}

function hasTrackMetadata(track: Record<string, unknown>): boolean {
  return typeof track.title === 'string' && track.title.trim().length > 0 &&
    Boolean(track.user && typeof track.user === 'object');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function browserPreferences() {
  return {
    partition: SESSION_PARTITION,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    devTools: !app.isPackaged
  } as const;
}

async function releaseWebContents(contents: WebContents): Promise<void> {
  if (contents.isDestroyed()) return;
  contents.stop();
  await contents.loadURL('about:blank').catch(() => undefined);
}

async function waitForSelector(contents: WebContents, selector: string, timeoutMs: number): Promise<void> {
  const serialized = JSON.stringify(selector);
  await contents.executeJavaScript(`new Promise((resolve) => {
    const selector = ${serialized};
    if (document.querySelector(selector)) { resolve(true); return; }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) { observer.disconnect(); resolve(true); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(false); }, ${timeoutMs});
  })`, true);
}

async function loadSoundCloudDom(contents: WebContents, url: string, timeoutMs = 10_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      contents.removeListener('dom-ready', ready);
      reject(new Error('SoundCloud page bootstrap timed out.'));
    }, timeoutMs);
    const ready = () => {
      clearTimeout(timer);
      resolve();
    };
    contents.once('dom-ready', ready);
    void loadSoundCloudUrl(contents, url).catch((error) => {
      clearTimeout(timer);
      contents.removeListener('dom-ready', ready);
      reject(error);
    });
  });
}

async function loadSoundCloudUrl(contents: WebContents, url: string): Promise<void> {
  try {
    await contents.loadURL(url);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code !== -3 && !message.includes('(-3)') && !message.includes('ERR_ABORTED')) throw error;
    await contents.executeJavaScript(`new Promise((resolve) => setTimeout(resolve, 350))`, true).catch(() => undefined);
  }
}

const SCRAPE_TRACKS = `(() => {
  const parseCount = (value) => {
    const text = String(value || '').replace(/,/g, '').trim();
    const number = Number.parseFloat(text) || 0;
    if (/k/i.test(text)) return Math.round(number * 1000);
    if (/m/i.test(text)) return Math.round(number * 1000000);
    return Math.round(number);
  };
  const absolute = (href) => href ? new URL(href, location.origin).toString() : undefined;
  const art = (element) => {
    if (element?.tagName === 'IMG') return element.getAttribute('src') || undefined;
    const style = element?.getAttribute('style') || '';
    return style.match(/url\\(["']?(.*?)["']?\\)/)?.[1];
  };
  const seen = new Set();
  const tracks = [];
  const add = (track) => {
    if (!track?.id || seen.has(track.id)) return;
    seen.add(track.id);
    tracks.push(track);
  };

  Array.from(document.querySelectorAll('#content .sound.track, #content .searchItem__trackItem.track')).forEach((group) => {
    const titleLink = group.querySelector('.soundTitle__title');
    const href = titleLink?.getAttribute('href')?.split('?')[0];
    if (!href) return;
    const artistLink = group.querySelector('.soundTitle__username');
    const playTitle = group.querySelector('[title$=" plays"]')?.getAttribute('title') || '';
    const likeText = group.querySelector('button[aria-label="Like"], button[title="Like"]')?.textContent || '';
    add({
      id: href,
      title: titleLink?.textContent?.trim() || 'Untitled',
      artist: artistLink?.textContent?.trim() || 'Unknown artist',
      artistId: artistLink?.getAttribute('href') || undefined,
      duration: 0,
      artworkUrl: art(group.querySelector('.sound__coverArt span')),
      permalinkUrl: absolute(href),
      genre: group.querySelector('.sc-tagContent')?.textContent?.trim() || undefined,
      playbackCount: parseCount(playTitle),
      likesCount: parseCount(likeText),
      access: 'playable',
      source: 'web'
    });
  });

  const reservedPaths = new Set([
    'charts', 'discover', 'feed', 'jobs', 'messages', 'notifications', 'pages',
    'people', 'search', 'settings', 'signin', 'stream', 'tags', 'terms-of-use',
    'upload', 'you'
  ]);
  const pathParts = (href) => {
    try {
      return new URL(String(href || '').split('?')[0], location.origin).pathname.split('/').filter(Boolean);
    } catch {
      return [];
    }
  };

  Array.from(document.querySelectorAll('#content a[href^="/"]')).forEach((titleLink) => {
    const href = titleLink.getAttribute('href')?.split('?')[0];
    const parts = pathParts(href);
    const title = titleLink.textContent?.trim() || titleLink.getAttribute('title')?.trim();
    if (!href || parts.length !== 2 || reservedPaths.has(parts[0]) || !title || seen.has(href)) return;

    let container = titleLink.parentElement;
    let artistLink;
    let artworkElement;
    for (let depth = 0; container && depth < 8; depth += 1, container = container.parentElement) {
      artworkElement = container.querySelector('span[style*="background-image"], img[src]');
      artistLink = Array.from(container.querySelectorAll('a[href^="/"]')).find((link) => {
        const artistParts = pathParts(link.getAttribute('href'));
        return artistParts.length === 1 && artistParts[0] === parts[0] && Boolean(link.textContent?.trim());
      });
      if (artistLink && artworkElement) break;
    }
    if (!artistLink || !artworkElement) return;

    add({
      id: href,
      title,
      artist: artistLink.textContent?.trim() || parts[0],
      artistId: artistLink.getAttribute('href')?.split('?')[0] || '/' + parts[0],
      duration: 0,
      artworkUrl: art(artworkElement),
      permalinkUrl: absolute(href),
      access: 'playable',
      source: 'web'
    });
  });

  return tracks;
})()`;

const SCRAPE_COMPACT_TRACKS = `(() => {
  const absolute = (href) => href ? new URL(href, location.origin).toString() : undefined;
  const seen = new Set();
  return Array.from(document.querySelectorAll('#content .compactTrackList__item, #content .trackItem')).map((item) => {
    const links = Array.from(item.querySelectorAll('a[href]'));
    const titleLink = item.querySelector('.trackItem__trackTitle') || links.find((link) => /\\?in=|\\/[^/]+\\/[^/]+/.test(link.getAttribute('href') || ''));
    const href = titleLink?.getAttribute('href')?.split('?')[0];
    if (!href || seen.has(href)) return undefined;
    seen.add(href);
    const artistLink = item.querySelector('.trackItem__username') || links.find((link) => (link.getAttribute('href') || '').split('/').filter(Boolean).length === 1);
    const artwork = item.querySelector('span[style*="background-image"]')?.getAttribute('style') || '';
    return {
      id: href,
      title: titleLink?.textContent?.trim() || titleLink?.getAttribute('title') || 'Untitled',
      artist: artistLink?.textContent?.trim() || 'Unknown artist',
      artistId: artistLink?.getAttribute('href') || undefined,
      duration: 0,
      artworkUrl: artwork.match(/url\\(["']?(.*?)["']?\\)/)?.[1],
      permalinkUrl: absolute(href),
      access: 'playable',
      source: 'web'
    };
  }).filter(Boolean);
})()`;

const SCRAPE_ARTISTS = `(() => {
  const parseCount = (value) => Number(String(value || '').replace(/[^0-9]/g, '')) || undefined;
  const art = (element) => (element?.getAttribute('style') || '').match(/url\\(["']?(.*?)["']?\\)/)?.[1];
  return Array.from(document.querySelectorAll('#content .userItem')).map((item) => {
    const link = item.querySelector('.userItem__title a');
    const href = link?.getAttribute('href');
    if (!href) return undefined;
    return {
      id: href,
      username: link?.textContent?.trim() || 'Unknown user',
      avatarUrl: art(item.querySelector('.userItem__coverArt span')),
      permalinkUrl: new URL(href, location.origin).toString(),
      followersCount: parseCount(item.querySelector('[title$=" followers"]')?.getAttribute('title'))
    };
  }).filter(Boolean);
})()`;

const SCRAPE_PLAYLISTS = `(kind) => {
  const art = (element) => (element?.getAttribute('style') || '').match(/url\\(["']?(.*?)["']?\\)/)?.[1];
  const seen = new Set();
  return Array.from(document.querySelectorAll('#content .sound.playlist')).map((group) => {
    const titleLink = group.querySelector('.soundTitle__title');
    const href = titleLink?.getAttribute('href');
    if (!href || seen.has(href)) return undefined;
    seen.add(href);
    const artistLink = group.querySelector('.soundTitle__username');
    const moreText = Array.from(group.querySelectorAll('a')).map((link) => link.textContent || '').find((text) => /View \\d+ tracks/.test(text)) || '';
    const trackCount = Number(moreText.match(/\\d+/)?.[0]) || group.querySelectorAll('.compactTrackList__item').length;
    return {
      id: href,
      title: titleLink?.textContent?.trim() || 'Untitled playlist',
      author: artistLink?.textContent?.trim() || 'Unknown user',
      authorId: artistLink?.getAttribute('href') || undefined,
      trackCount,
      artworkUrl: art(group.querySelector('.sound__coverArt span')),
      permalinkUrl: new URL(href, location.origin).toString(),
      kind,
      source: 'web'
    };
  }).filter(Boolean);
}`;

function requireSoundCloudPath(value: string): string {
  const parsed = safeUrl(value.startsWith('/') ? `${SOUNDCLOUD_ORIGIN}${value}` : value);
  if (!parsed || parsed.protocol !== 'https:' || !isSoundCloudHost(parsed.hostname)) throw new Error('SoundCloud browser navigation is limited to SoundCloud URLs.');
  return `${parsed.pathname}${parsed.search}`;
}

function absoluteUrl(path: string): string {
  return new URL(path, SOUNDCLOUD_ORIGIN).toString();
}

function safeUrl(value: string): URL | undefined {
  try { return new URL(value); } catch { return undefined; }
}

function isSoundCloudHost(hostname: string): boolean {
  return hostname === 'soundcloud.com' || hostname.endsWith('.soundcloud.com');
}

function downsampleWaveform(samples: number[], targetLength: number): number[] {
  if (samples.length <= targetLength) return samples.map((sample) => Math.max(0, Number(sample) || 0));
  const result: number[] = [];
  for (let index = 0; index < targetLength; index += 1) {
    const start = Math.floor((index * samples.length) / targetLength);
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / targetLength));
    result.push(Math.max(...samples.slice(start, end).map((sample) => Math.max(0, Number(sample) || 0))));
  }
  return result;
}

function transcodingScore(item: Record<string, unknown>, preference: AudioQuality): number {
  const format = item.format && typeof item.format === 'object' ? item.format as Record<string, unknown> : {};
  const quality = String(item.quality ?? 'sq');
  const protocol = String(format.protocol ?? '');
  const mime = String(format.mime_type ?? '');
  const qualityScore = quality === 'hq' ? 300 : quality === 'sq' ? 200 : 100;
  if (preference === 'standard') return (protocol === 'progressive' ? 80 : 0) + (quality === 'sq' ? 30 : 0) + qualityScore / 10;
  const protocolScore = protocol === 'hls' ? 40 : 25;
  const codecScore = mime.includes('mp4a') ? 20 : mime.includes('mpeg') ? 10 : 0;
  return qualityScore + protocolScore + codecScore;
}
