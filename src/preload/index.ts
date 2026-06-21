import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, AudioQuality, AuthStatus, CustomizationInfo, LyricsRecord, PlaybackState, Playlist, SearchCategory, SearchResults, ThemeDefinition, Track, UserProfile, WebSessionState, WebStreamInfo } from '../shared/types';
import type { WebMediaCommand } from '../main/webSession';
import type { SoundCloudCredentials } from '../main/types';

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('app:getSettings'),
  saveSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('app:saveSettings', settings),
  getCustomizationInfo: (): Promise<CustomizationInfo> => ipcRenderer.invoke('app:getCustomizationInfo'),
  openCustomizationFolder: (): Promise<string> => ipcRenderer.invoke('app:openCustomizationFolder'),
  offlineTracks: (): Promise<Track[]> => ipcRenderer.invoke('app:offlineTracks'),
  removeOffline: (trackId: string | number): Promise<void> => ipcRenderer.invoke('app:removeOffline', trackId),
  getLyrics: (track: Track): Promise<LyricsRecord | undefined> => ipcRenderer.invoke('app:getLyrics', track),
  updateDiscordPresence: (track: Track | undefined, playback: PlaybackState): Promise<void> => ipcRenderer.invoke('discord:updatePresence', track, playback),
  authStatus: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:status'),
  login: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:login'),
  logout: (): Promise<AuthStatus> => ipcRenderer.invoke('auth:logout'),
  saveCredentials: (credentials: SoundCloudCredentials): Promise<AuthStatus> => ipcRenderer.invoke('auth:saveCredentials', credentials),
  search: (query: string, limit: number, forceMock?: boolean): Promise<SearchResults> => ipcRenderer.invoke('sc:search', query, limit, forceMock),
  likedTracks: (limit: number): Promise<Track[]> => ipcRenderer.invoke('sc:likedTracks', limit),
  library: (): Promise<{ tracks: Track[]; playlists: Playlist[] }> => ipcRenderer.invoke('sc:library'),
  getTrack: (trackId: string | number): Promise<Track> => ipcRenderer.invoke('sc:getTrack', trackId),
  getArtist: (userId: string | number): Promise<{ artist: UserProfile; tracks: Track[]; playlists: Playlist[] }> => ipcRenderer.invoke('sc:getArtist', userId),
  getPlaylist: (playlistId: string | number): Promise<Playlist> => ipcRenderer.invoke('sc:getPlaylist', playlistId),
  streamUrl: (track: Track): Promise<string> => ipcRenderer.invoke('sc:streamUrl', track),
  cacheArtwork: (url: string): Promise<string | undefined> => ipcRenderer.invoke('sc:cacheArtwork', url),
  importTheme: (): Promise<ThemeDefinition | undefined> => ipcRenderer.invoke('theme:import'),
  exportTheme: (theme: ThemeDefinition): Promise<string | undefined> => ipcRenderer.invoke('theme:export', theme),
  notifyTrack: (track: Track): Promise<boolean> => ipcRenderer.invoke('notify:track', track),
  webGetState: (): Promise<WebSessionState> => ipcRenderer.invoke('web:getState'),
  webLogin: (): Promise<WebSessionState> => ipcRenderer.invoke('web:login'),
  webSearch: (query: string, limit: number, category: SearchCategory = 'tracks'): Promise<SearchResults> => ipcRenderer.invoke('web:search', query, limit, category),
  webSearchMore: (nextHref: string, category: SearchCategory): Promise<SearchResults> => ipcRenderer.invoke('web:searchMore', nextHref, category),
  webLikedTracks: (limit: number): Promise<Track[]> => ipcRenderer.invoke('web:likedTracks', limit),
  webLikeTrack: (track: Track): Promise<Track> => ipcRenderer.invoke('web:likeTrack', track),
  webLibrary: (): Promise<{ tracks: Track[]; playlists: Playlist[] }> => ipcRenderer.invoke('web:library'),
  webGetTrack: (track: Track): Promise<Track> => ipcRenderer.invoke('web:getTrack', track),
  webGetArtist: (userId: string | number): Promise<{ artist: UserProfile; tracks: Track[]; playlists: Playlist[] }> => ipcRenderer.invoke('web:getArtist', userId),
  webGetPlaylist: (playlist: Playlist): Promise<Playlist> => ipcRenderer.invoke('web:getPlaylist', playlist),
  webPlayTrack: (track: Track): Promise<WebSessionState> => ipcRenderer.invoke('web:playTrack', track),
  webStreamUrl: (track: Track, quality?: AudioQuality): Promise<WebStreamInfo> => ipcRenderer.invoke('web:streamUrl', track, quality),
  webStreamUrls: (track: Track, quality?: AudioQuality): Promise<WebStreamInfo[]> => ipcRenderer.invoke('web:streamUrls', track, quality),
  webSaveOffline: (track: Track): Promise<Track> => ipcRenderer.invoke('web:saveOffline', track),
  webWaveform: (track: Track): Promise<number[]> => ipcRenderer.invoke('web:waveform', track),
  webSeek: (milliseconds: number): Promise<WebSessionState> => ipcRenderer.invoke('web:seek', milliseconds),
  webSetVolume: (volume: number): Promise<WebSessionState> => ipcRenderer.invoke('web:setVolume', volume),
  webOpenExternal: (): Promise<void> => ipcRenderer.invoke('web:openExternal'),
  webCommand: (command: WebMediaCommand): Promise<WebSessionState> => ipcRenderer.invoke('web:command', command),
  onWebState: (callback: (state: WebSessionState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WebSessionState) => callback(state);
    ipcRenderer.on('web:state', listener);
    return () => ipcRenderer.removeListener('web:state', listener);
  },
  onThemeChanged: (callback: () => void): (() => void) => {
    ipcRenderer.on('theme:changed', callback);
    return () => ipcRenderer.removeListener('theme:changed', callback);
  },
  onCustomizationChanged: (callback: () => void): (() => void) => {
    ipcRenderer.on('customization:changed', callback);
    return () => ipcRenderer.removeListener('customization:changed', callback);
  },
  onMediaCommand: (command: 'playPause' | 'next' | 'previous' | 'stop', callback: () => void): (() => void) => {
    const channel = `media:${command}`;
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeListener(channel, callback);
  }
};

contextBridge.exposeInMainWorld('auralis', api);

export type AuralisApi = typeof api;
