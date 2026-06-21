import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArtworkPanel } from './components/ArtworkPanel';
import { MenuBar } from './components/MenuBar';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { ResultsTabs } from './components/ResultsTabs';
import { SearchBar } from './components/SearchBar';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { WidgetDock } from './components/WidgetDock';
import { usePlayer } from './hooks/usePlayer';
import { useCustomizationWidgets } from './hooks/useCustomizationWidgets';
import { useCustomExtensions } from './hooks/useCustomExtensions';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { emitPluginEvent, installPluginApi } from './pluginApi';
import { mockSearch } from '../shared/mockData';
import { prefetchLyrics, requestLyrics } from './lyricsClient';
import type { AppSettings, AppSourceMode, AuthStatus, Playlist, SearchCategory, SearchResults, Track, WebSessionState } from '../shared/types';

export default function App() {
  const { settings, updateSettings, loading } = useSettings();
  if (!settings) {
    return <div className="app-loading">{loading ? 'Loading Auralis' : 'Unable to load settings'}</div>;
  }
  return <AuralisWorkspace settings={settings} updateSettings={updateSettings} />;
}

function AuralisWorkspace(props: {
  settings: AppSettings;
  updateSettings: (settings: AppSettings) => void;
}) {
  const { settings, updateSettings } = props;
  installPluginApi();
  const { themes, selectedTheme, selectTheme, refreshThemes } = useTheme(settings, updateSettings);
  const { customWidgets } = useCustomizationWidgets();
  const loadedExtensions = useCustomExtensions();
  const player = usePlayer(settings.volume, settings.audioQuality);
  const [auth, setAuth] = useState<AuthStatus>();
  const [query, setQuery] = useState('electronic');
  const [results, setResults] = useState<SearchResults>(() => settings.sourceMode === 'web'
    ? { tracks: [], artists: [], playlists: [], albums: [], mode: 'web' }
    : mockSearch(''));
  const [activeTab, setActiveTab] = useState('tracks');
  const [view, setView] = useState(settings.lastView === 'web' ? 'search' : settings.lastView);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [details, setDetails] = useState<Track | Playlist | undefined>();
  const [webState, setWebState] = useState<WebSessionState>();
  const [loadingMore, setLoadingMore] = useState(false);
  const viewResults = useRef<Partial<Record<'library' | 'likes' | 'offline', SearchResults>>>({});
  const searchResults = useRef(new Map<string, SearchResults>());
  const loadedSearchCategories = useRef(new Map<string, Set<SearchCategory>>());
  const navigationRequest = useRef(0);

  useEffect(() => {
    window.auralis.authStatus().then(setAuth).catch((error) => setStatus(String(error)));
    window.auralis.webGetState().then(setWebState).catch(() => undefined);
    return window.auralis.onWebState(setWebState);
  }, []);

  useEffect(() => emitPluginEvent('trackchange', { track: player.currentTrack, playback: player.playback }), [player.currentTrack?.id]);
  useEffect(() => emitPluginEvent('playback', { track: player.currentTrack, playback: player.playback }), [player.playback]);
  useEffect(() => {
    void window.auralis.updateDiscordPresence(player.currentTrack, player.playback).catch(() => undefined);
  }, [player.currentTrack?.id, player.playback]);
  useEffect(() => emitPluginEvent('settings', settings), [settings]);

  useEffect(() => {
    const upcoming = player.queue.items
      .slice(player.queue.currentIndex + 1, player.queue.currentIndex + 2)
      .map((item) => item.track);
    prefetchLyrics(upcoming);
  }, [player.queue.currentIndex, player.queue.items]);

  useEffect(() => {
    if (Math.abs(settings.volume - player.playback.volume) > 0.001) {
      updateSettings({ ...settings, volume: player.playback.volume });
    }
  }, [player.playback.volume, settings, updateSettings]);

  useEffect(() => {
    if (settings.lastView !== view) updateSettings({ ...settings, lastView: view });
  }, [settings, updateSettings, view]);

  const search = useCallback(async () => {
    const requestId = ++navigationRequest.current;
    const searchQuery = query.trim() || 'music';
    setView('search');
    setActiveTab('tracks');
    if (settings.sourceMode === 'web') {
      setLoading(true);
      setStatus(`Reading SoundCloud tracks for ${searchQuery}`);
      try {
        const next = await window.auralis.webSearch(searchQuery, Math.max(50, settings.searchLimit), 'tracks');
        if (requestId !== navigationRequest.current) return;
        searchResults.current.set(searchQuery, next);
        loadedSearchCategories.current.set(searchQuery, new Set(['tracks']));
        setResults(next);
        setStatus(`Browser bridge loaded ${next.tracks.length} tracks`);
      } catch (error) {
        if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : 'SoundCloud browser search failed');
      } finally {
        if (requestId === navigationRequest.current) setLoading(false);
      }
      return;
    }
    setLoading(true);
    setStatus('Searching SoundCloud');
    try {
      const next = await window.auralis.search(query, settings.searchLimit, settings.sourceMode === 'mock');
      if (requestId !== navigationRequest.current) return;
      searchResults.current.set(searchQuery, next);
      setResults(next);
      setStatus(next.mode === 'mock' ? 'Mock results loaded' : 'SoundCloud API results loaded');
    } catch (error) {
      if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : 'Search failed');
    } finally {
      if (requestId === navigationRequest.current) setLoading(false);
    }
  }, [query, settings.searchLimit, settings.sourceMode]);

  useEffect(() => {
    if (settings.sourceMode !== 'web') void search();
  }, []);

  const loadLibrary = useCallback(async (force = false, tab: SearchCategory = 'tracks') => {
    const requestId = ++navigationRequest.current;
    setView(tab === 'tracks' ? 'library' : tab);
    setActiveTab(tab);
    const cached = viewResults.current.library;
    if (cached && !force) {
      setResults(cached);
      setLoading(false);
      setStatus('Library restored');
      return;
    }
    if (settings.sourceMode === 'web') {
      setLoading(true);
      setStatus('Reading your SoundCloud library');
      try {
        const library = await window.auralis.webLibrary();
        const next: SearchResults = {
          tracks: library.tracks,
          artists: [],
          playlists: library.playlists.filter((item) => item.kind !== 'album'),
          albums: library.playlists.filter((item) => item.kind === 'album'),
          mode: 'web'
        };
        viewResults.current.library = next;
        if (requestId !== navigationRequest.current) return;
        setResults(next);
        setStatus('Browser-backed library loaded');
      } catch (error) {
        if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : 'SoundCloud browser library failed');
      } finally {
        if (requestId === navigationRequest.current) setLoading(false);
      }
      return;
    }
    setLoading(true);
    setStatus('Loading library');
    try {
      const library = await window.auralis.library();
      const next: SearchResults = {
        tracks: library.tracks,
        artists: [],
        playlists: library.playlists.filter((item) => item.kind !== 'album'),
        albums: library.playlists.filter((item) => item.kind === 'album'),
        mode: auth?.authenticated ? 'soundcloud' : 'mock'
      };
      viewResults.current.library = next;
      if (requestId !== navigationRequest.current) return;
      setResults(next);
      setStatus('Library loaded');
    } catch (error) {
      if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : 'Library failed');
    } finally {
      if (requestId === navigationRequest.current) setLoading(false);
    }
  }, [auth?.authenticated, settings.sourceMode]);

  const loadLikes = useCallback(async (force = false) => {
    const requestId = ++navigationRequest.current;
    setView('likes');
    setActiveTab('tracks');
    const cached = viewResults.current.likes;
    if (cached && !force) {
      setResults(cached);
      setLoading(false);
      setStatus('Liked tracks restored');
      return;
    }
    if (settings.sourceMode === 'web') {
      setLoading(true);
      setStatus('Reading your liked tracks');
      try {
        const tracks = await window.auralis.webLikedTracks(5000);
        const next: SearchResults = { tracks, artists: [], playlists: [], albums: [], mode: 'web' };
        viewResults.current.likes = next;
        if (requestId !== navigationRequest.current) return;
        setResults(next);
        setStatus('Browser-backed likes loaded');
      } catch (error) {
        if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : 'SoundCloud browser likes failed');
      } finally {
        if (requestId === navigationRequest.current) setLoading(false);
      }
      return;
    }
    setLoading(true);
    setStatus('Loading liked tracks');
    try {
      const tracks = await window.auralis.likedTracks(settings.searchLimit);
      const next: SearchResults = { tracks, artists: [], playlists: [], albums: [], mode: auth?.authenticated ? 'soundcloud' : 'mock' };
      viewResults.current.likes = next;
      if (requestId !== navigationRequest.current) return;
      setResults(next);
      setStatus('Liked tracks loaded');
    } catch (error) {
      if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : 'Liked tracks failed');
    } finally {
      if (requestId === navigationRequest.current) setLoading(false);
    }
  }, [auth?.authenticated, settings.searchLimit, settings.sourceMode]);

  const loadOffline = useCallback(async (force = false) => {
    navigationRequest.current += 1;
    setView('offline');
    setActiveTab('tracks');
    const cached = viewResults.current.offline;
    if (cached && !force) {
      setResults(cached);
      setStatus(`${cached.tracks.length} offline tracks ready`);
      return;
    }
    setLoading(true);
    try {
      const tracks = await window.auralis.offlineTracks();
      const next: SearchResults = { tracks, artists: [], playlists: [], albums: [], mode: 'web' };
      viewResults.current.offline = next;
      setResults(next);
      setStatus(`${tracks.length} offline tracks ready`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Offline library failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectResultsTab = useCallback((tab: string) => {
    setActiveTab(tab);
    if (settings.sourceMode !== 'web' || view !== 'search' || tab === 'tracks') return;
    const category = tab as SearchCategory;
    const searchQuery = query.trim() || 'music';
    const loaded = loadedSearchCategories.current.get(searchQuery) ?? new Set<SearchCategory>(['tracks']);
    if (loaded.has(category)) return;
    loaded.add(category);
    loadedSearchCategories.current.set(searchQuery, loaded);
    const requestId = navigationRequest.current;
    setStatus(`Loading SoundCloud ${category}`);
    void window.auralis.webSearch(searchQuery, Math.max(50, settings.searchLimit), category).then((next) => {
      const current = searchResults.current.get(searchQuery) ?? { tracks: [], artists: [], playlists: [], albums: [], mode: 'web' };
      const merged = { ...current, [category]: next[category], next: { ...current.next, ...next.next } } as SearchResults;
      searchResults.current.set(searchQuery, merged);
      if (requestId === navigationRequest.current) {
        setResults(merged);
        setStatus(`Loaded ${next[category].length} ${category}`);
      }
    }).catch((error) => {
      loaded.delete(category);
      if (requestId === navigationRequest.current) setStatus(error instanceof Error ? error.message : `SoundCloud ${category} search failed`);
    });
  }, [query, settings.searchLimit, settings.sourceMode, view]);

  const loadMoreResults = useCallback(async () => {
    if (settings.sourceMode !== 'web' || view !== 'search' || loadingMore) return;
    const category = activeTab as SearchCategory;
    const nextHref = results.next?.[category];
    if (!nextHref) return;
    setLoadingMore(true);
    try {
      const page = await window.auralis.webSearchMore(nextHref, category);
      setResults((current) => {
        const merged = appendSearchPage(current, page, category);
        searchResults.current.set(query.trim() || 'music', merged);
        return merged;
      });
      setStatus(`Loaded more ${category}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'SoundCloud pagination failed');
    } finally {
      setLoadingMore(false);
    }
  }, [activeTab, loadingMore, query, results.next, settings.sourceMode, view]);

  const changeSourceMode = useCallback((sourceMode: AppSourceMode) => {
    navigationRequest.current += 1;
    setLoading(false);
    updateSettings({ ...settings, sourceMode, mockMode: sourceMode === 'mock' });
    setView('search');
    setStatus(sourceMode === 'web' ? 'Browser bridge selected' : sourceMode === 'api' ? 'Official API mode selected' : 'Mock mode selected');
  }, [settings, updateSettings]);

  const playSingle = useCallback((track: Track) => {
    const startIndex = results.tracks.findIndex((item) => String(item.id) === String(track.id));
    player.playTracks(results.tracks.length ? results.tracks : [track], startIndex >= 0 ? startIndex : 0);
    setDetails(track);
  }, [player, results.tracks]);

  const openPlaylist = useCallback(async (playlist: Playlist) => {
    setLoading(true);
    try {
      const full = playlist.source === 'web'
        ? await window.auralis.webGetPlaylist(playlist)
        : await window.auralis.getPlaylist(playlist.id);
      setDetails(full);
      setResults({ tracks: full.tracks ?? [], artists: [], playlists: [full], albums: [], mode: full.source });
      setActiveTab('tracks');
      setView('playlist');
      setStatus(`Opened ${full.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Playlist failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const openTrack = useCallback(async (track: Track) => {
    setDetails(track);
    setStatus(`Loading details for ${track.title}`);
    try {
      const full = track.source === 'web'
        ? await window.auralis.webGetTrack(track)
        : await window.auralis.getTrack(track.id);
      setDetails(full);
      setStatus(`Track: ${full.title}`);
    } catch {
      setStatus(`Track: ${track.title}`);
    }
  }, []);

  const patchTrack = useCallback((track: Track) => {
    const patchResults = (value: SearchResults): SearchResults => ({
      ...value,
      tracks: value.tracks.map((item) => String(item.id) === String(track.id) ? track : item)
    });
    setResults((current) => patchResults(current));
    for (const [key, value] of searchResults.current) searchResults.current.set(key, patchResults(value));
    for (const key of ['library', 'likes', 'offline'] as const) {
      const value = viewResults.current[key];
      if (value) viewResults.current[key] = patchResults(value);
    }
    setDetails((current) => current && 'artist' in current && String(current.id) === String(track.id) ? track : current);
  }, []);

  const likeTrack = useCallback(async (track: Track) => {
    if (track.liked) return;
    setStatus(`Liking ${track.title}`);
    try {
      const liked = await window.auralis.webLikeTrack(track);
      patchTrack(liked);
      const likes = viewResults.current.likes;
      if (likes && !likes.tracks.some((item) => String(item.id) === String(liked.id))) {
        viewResults.current.likes = { ...likes, tracks: [liked, ...likes.tracks] };
      }
      setStatus(`Liked ${track.title}`);
    } catch (error) {
      setStatus(friendlyError(error, 'Like failed'));
    }
  }, [patchTrack]);

  const saveOffline = useCallback(async (track: Track) => {
    if (track.offline) return;
    setStatus(`Downloading ${track.title} for offline playback`);
    try {
      const offline = await window.auralis.webSaveOffline(track);
      patchTrack(offline);
      const cached = viewResults.current.offline;
      if (cached) viewResults.current.offline = { ...cached, tracks: [offline, ...cached.tracks.filter((item) => String(item.id) !== String(offline.id))] };
      setStatus(`${track.title} is available offline`);
    } catch (error) {
      setStatus(friendlyError(error, 'Offline download failed'));
    }
  }, [patchTrack]);

  const removeOffline = useCallback(async (track: Track) => {
    try {
      await window.auralis.removeOffline(track.id);
      const online = { ...track, offline: false, streamUrl: undefined };
      patchTrack(online);
      const cached = viewResults.current.offline;
      if (cached) viewResults.current.offline = { ...cached, tracks: cached.tracks.filter((item) => String(item.id) !== String(track.id)) };
      if (view === 'offline') setResults((current) => ({ ...current, tracks: current.tracks.filter((item) => String(item.id) !== String(track.id)) }));
      setStatus(`Removed offline copy of ${track.title}`);
    } catch (error) {
      setStatus(friendlyError(error, 'Could not remove offline copy'));
    }
  }, [patchTrack, view]);

  const openArtist = useCallback(async (track: Track) => {
    if (!track.artistId) return;
    setLoading(true);
    try {
      const artist = track.source === 'web'
        ? await window.auralis.webGetArtist(track.artistId)
        : await window.auralis.getArtist(track.artistId);
      setResults({
        tracks: artist.tracks,
        artists: [artist.artist],
        playlists: artist.playlists.filter((item) => item.kind !== 'album'),
        albums: artist.playlists.filter((item) => item.kind === 'album'),
        mode: track.source
      });
      setActiveTab('tracks');
      setView('artist');
      setStatus(`Artist: ${artist.artist.username}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Artist failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const openUser = useCallback(async (artistProfile: SearchResults['artists'][number]) => {
    setLoading(true);
    try {
      const artist = settings.sourceMode === 'web'
        ? await window.auralis.webGetArtist(artistProfile.id)
        : await window.auralis.getArtist(artistProfile.id);
      setResults({
        tracks: artist.tracks,
        artists: [artist.artist],
        playlists: artist.playlists.filter((item) => item.kind !== 'album'),
        albums: artist.playlists.filter((item) => item.kind === 'album'),
        mode: settings.sourceMode === 'web' ? 'web' : 'soundcloud'
      });
      setActiveTab('tracks');
      setView('artist');
      setStatus(`Artist: ${artist.artist.username}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Artist failed');
    } finally {
      setLoading(false);
    }
  }, [settings.sourceMode]);

  const login = useCallback(async () => {
    if (settings.sourceMode === 'web') {
      setStatus('Opening SoundCloud login window');
      const next = await window.auralis.webLogin();
      setWebState(next);
      return;
    }
    setStatus('Opening SoundCloud API login');
    try {
      const next = await window.auralis.login();
      setAuth(next);
      setStatus(next.authenticated ? `Logged in as ${next.user?.username}` : next.message ?? 'Login unavailable');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Login failed');
    }
  }, [settings.sourceMode]);

  const logout = useCallback(async () => {
    const next = await window.auralis.logout();
    setAuth(next);
    setStatus('Logged out');
  }, []);

  const importTheme = useCallback(async () => {
    const theme = await window.auralis.importTheme();
    if (theme) {
      await refreshThemes();
      selectTheme(theme.id);
      setStatus(`Imported ${theme.name}`);
    }
  }, [refreshThemes, selectTheme]);

  const refresh = useCallback(() => {
    if (view === 'likes') {
      void loadLikes(true);
    } else if (view === 'offline') {
      void loadOffline(true);
    } else if (view === 'library' || view === 'playlists' || view === 'albums') {
      void loadLibrary(true, view === 'playlists' || view === 'albums' ? view : 'tracks');
    } else {
      void search();
    }
  }, [loadLibrary, loadLikes, loadOffline, search, view]);

  const layoutClass = useMemo(() => {
    return `app-shell queue-${settings.layout.queuePanel}`;
  }, [settings.layout.queuePanel]);

  const gridTemplateColumns = `${settings.layout.showSidebar ? settings.layout.sidebarWidth : 0}px minmax(0, 1fr) ${settings.layout.showArtwork ? settings.layout.artworkWidth : 0}px ${settings.layout.queuePanel === 'right' ? settings.layout.queueWidth : 0}px`;

  return (
    <div className={layoutClass}>
      <MenuBar
        auth={auth}
        webMode={settings.sourceMode === 'web'}
        themes={themes}
        themeId={selectedTheme?.id ?? settings.themeId}
        onTheme={selectTheme}
        onLogin={login}
        onLogout={logout}
        onImportTheme={importTheme}
        onOpenCustomization={() => window.auralis.openCustomizationFolder()}
        onRefresh={refresh}
        onSettings={() => setView('customize')}
      />
      <SearchBar
        query={query}
        loading={loading}
        sourceMode={settings.sourceMode}
        onQuery={setQuery}
        onSearch={() => void search()}
        onLibrary={() => void loadLibrary()}
        onLikes={() => void loadLikes()}
        onSourceMode={changeSourceMode}
      />
      <div className="main-grid" style={{ gridTemplateColumns }}>
        {settings.layout.showSidebar && <Sidebar active={view} onView={(next) => {
          if (next === 'likes') {
            void loadLikes();
          } else if (next === 'offline') {
            void loadOffline();
          } else if (next === 'library') {
            void loadLibrary();
          } else if (next === 'playlists' || next === 'albums') {
            void loadLibrary(false, next);
          } else if (next === 'search') {
            navigationRequest.current += 1;
            setLoading(false);
            setView('search');
            setActiveTab('tracks');
            const cached = searchResults.current.get(query.trim() || 'music');
            if (cached) setResults(cached);
          } else {
            navigationRequest.current += 1;
            setLoading(false);
            setView(next);
          }
        }} />}
        <main className="workspace">
          {view === 'customize' ? (
            <SettingsPanel
              settings={settings}
              auth={auth}
              themes={themes}
              customWidgets={customWidgets}
              loadedExtensions={loadedExtensions}
              onSettings={updateSettings}
              onOpenCustomization={() => window.auralis.openCustomizationFolder()}
              onImportTheme={importTheme}
              onTheme={selectTheme}
              onSaveCredentials={async (clientId, clientSecret) => {
                const next = await window.auralis.saveCredentials({ clientId, clientSecret });
                setAuth(next);
                setStatus('Optional SoundCloud API credentials saved');
              }}
            />
          ) : (
            <ResultsTabs
              activeTab={activeTab}
              results={results}
              activeTrackId={player.currentTrack?.id}
              onTab={selectResultsTab}
              onPlay={playSingle}
              onAdd={(track) => player.addToQueue([track])}
              onLike={(track) => void likeTrack(track)}
              onSaveOffline={(track) => void saveOffline(track)}
              onRemoveOffline={(track) => void removeOffline(track)}
              onPrefetchLyrics={(track) => void requestLyrics(track).catch(() => undefined)}
              onNext={(track) => player.addNext([track])}
              onOpenTrack={openTrack}
              onOpenArtist={openArtist}
              onOpenUser={openUser}
              onOpenPlaylist={openPlaylist}
              onLoadMore={() => void loadMoreResults()}
              loadingMore={loadingMore}
            />
          )}
        </main>
        {settings.layout.showArtwork && (
          <ArtworkPanel track={player.currentTrack ?? (details && 'artist' in details ? details : undefined)} />
        )}
        {settings.layout.queuePanel === 'right' && (
          <QueuePanel
            items={player.queue.items}
            currentIndex={player.queue.currentIndex}
            onJump={player.jumpTo}
            onMove={player.moveItem}
            onRemove={player.removeItem}
            onClear={player.clear}
          />
        )}
      </div>
      {settings.layout.showWidgetDock && (
        <WidgetDock
          widgets={settings.widgets}
          customWidgets={customWidgets}
          track={player.currentTrack}
          playback={player.playback}
          getAnalyser={player.getAnalyser}
          onSeek={player.seek}
          onWidgets={(widgets) => updateSettings({ ...settings, widgets })}
        />
      )}
      {settings.layout.queuePanel === 'bottom' && (
        <QueuePanel
          items={player.queue.items}
          currentIndex={player.queue.currentIndex}
          onJump={player.jumpTo}
          onMove={player.moveItem}
          onRemove={player.removeItem}
          onClear={player.clear}
        />
      )}
      <PlayerBar
          track={player.currentTrack}
          playback={player.playback}
          onToggle={player.toggle}
          onNext={player.next}
          onPrevious={player.previous}
          onSeek={player.seek}
          onVolume={player.setVolume}
          onShuffle={player.setShuffle}
          onRepeat={player.setRepeat}
      />
      {settings.layout.showStatusBar && (
        <footer className="status-bar">
          <span>{status}</span>
          <span>{settings.sourceMode === 'web' ? `Browser bridge: ${webState?.authenticated ? 'signed in' : 'session ready'}` : auth?.authenticated ? `SoundCloud API: ${auth.user?.username}` : 'SoundCloud API: optional'}</span>
          <span>{results.tracks.length} tracks</span>
          <span>{player.queue.items.length} queued</span>
        </footer>
      )}
    </div>
  );
}

function appendSearchPage(current: SearchResults, page: SearchResults, category: SearchCategory): SearchResults {
  const merge = <T extends { id: string | number }>(items: T[], incoming: T[]) => {
    const seen = new Set(items.map((item) => String(item.id)));
    return [...items, ...incoming.filter((item) => !seen.has(String(item.id)))];
  };
  const next = { ...current.next, [category]: page.next?.[category] };
  if (category === 'tracks') return { ...current, tracks: merge(current.tracks, page.tracks), next };
  if (category === 'artists') return { ...current, artists: merge(current.artists, page.artists), next };
  if (category === 'playlists') return { ...current, playlists: merge(current.playlists, page.playlists), next };
  return { ...current, albums: merge(current.albums, page.albums), next };
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || fallback;
}
