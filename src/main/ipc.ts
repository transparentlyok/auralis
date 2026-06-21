import { BrowserWindow, Notification, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import type { AppStore } from './store';
import type { AuthService } from './auth';
import type { SoundCloudService } from './soundcloud';
import type { SoundCloudWebSession, WebMediaCommand } from './webSession';
import type { MetadataCache } from './cache';
import type { LyricsService } from './lyrics';
import type { DiscordRichPresence } from './discordRpc';
import type { AppSettings, AudioQuality, PlaybackState, Playlist, SearchCategory, ThemeDefinition, Track } from '../shared/types';
import { validateTheme } from '../shared/theme';

export function registerIpc(
  window: BrowserWindow,
  store: AppStore,
  auth: AuthService,
  soundcloud: SoundCloudService,
  webSession: SoundCloudWebSession,
  cache: MetadataCache,
  lyrics: LyricsService,
  discordRpc: DiscordRichPresence
): void {
  for (const channel of IPC_CHANNELS) ipcMain.removeHandler(channel);

  ipcMain.handle('app:getSettings', () => store.getSettings());
  ipcMain.handle('app:saveSettings', async (_event, settings: AppSettings) => {
    const saved = await store.saveSettings(settings);
    await discordRpc.configure(saved.discordRpc);
    return saved;
  });
  ipcMain.handle('app:getCustomizationInfo', () => store.getCustomizationInfo());
  ipcMain.handle('app:openCustomizationFolder', async () => {
    const info = await store.getCustomizationInfo();
    await shell.openPath(info.root);
    return info.root;
  });
  ipcMain.handle('app:offlineTracks', () => cache.offlineTracks());
  ipcMain.handle('app:removeOffline', (_event, trackId: string | number) => cache.removeOffline(trackId));
  ipcMain.handle('app:getLyrics', (_event, track: Track) => lyrics.get(track));
  ipcMain.handle('discord:updatePresence', (_event, track: Track | undefined, playback: PlaybackState) => discordRpc.update(track, playback));

  ipcMain.handle('auth:status', () => auth.status());
  ipcMain.handle('auth:login', () => auth.login(window));
  ipcMain.handle('auth:logout', () => auth.logout());
  ipcMain.handle('auth:saveCredentials', (_event, credentials) => auth.saveCredentials(credentials));

  ipcMain.handle('sc:search', (_event, query: string, limit: number, forceMock?: boolean) => soundcloud.search(query, limit, forceMock));
  ipcMain.handle('sc:likedTracks', (_event, limit: number) => soundcloud.likedTracks(limit));
  ipcMain.handle('sc:library', () => soundcloud.library());
  ipcMain.handle('sc:getTrack', (_event, trackId: string | number) => soundcloud.getTrack(trackId));
  ipcMain.handle('sc:getArtist', (_event, userId: string | number) => soundcloud.getArtist(userId));
  ipcMain.handle('sc:getPlaylist', (_event, playlistId: string | number) => soundcloud.getPlaylist(playlistId));
  ipcMain.handle('sc:streamUrl', (_event, track: Track) => soundcloud.streamUrl(track));
  ipcMain.handle('sc:cacheArtwork', (_event, url: string) => soundcloud.cacheArtwork(url));

  ipcMain.handle('theme:import', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Import Auralis Theme',
      properties: ['openFile'],
      filters: [{ name: 'Auralis theme', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return store.importTheme(result.filePaths[0]);
  });

  ipcMain.handle('theme:export', async (_event, theme: ThemeDefinition) => {
    const valid = validateTheme(theme);
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Auralis Theme',
      defaultPath: `${valid.id}.json`,
      filters: [{ name: 'Auralis theme', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return undefined;
    await store.exportTheme(valid, result.filePath);
    return result.filePath;
  });

  ipcMain.handle('theme:loadFromFile', async (_event, filePath: string) => {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    return validateTheme(raw);
  });

  ipcMain.handle('notify:track', (_event, track: Track) => {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({
      title: track.title,
      body: track.artist,
      silent: true
    });
    notification.on('click', () => window.focus());
    notification.show();
    return true;
  });

  ipcMain.handle('web:getState', () => webSession.getState());
  ipcMain.handle('web:login', () => webSession.openLogin());
  ipcMain.handle('web:search', (_event, query: string, limit: number, category?: SearchCategory) => webSession.search(query, limit, category));
  ipcMain.handle('web:searchMore', (_event, nextHref: string, category: SearchCategory) => webSession.searchMore(nextHref, category));
  ipcMain.handle('web:likedTracks', (_event, limit: number, nextHref?: string) => webSession.likedTracks(limit, nextHref));
  ipcMain.handle('web:likeTrack', (_event, track: Track) => webSession.likeTrack(track));
  ipcMain.handle('web:library', () => webSession.library());
  ipcMain.handle('web:getTrack', (_event, track: Track) => webSession.getTrack(track));
  ipcMain.handle('web:getArtist', (_event, userId: string | number) => webSession.getArtist(userId));
  ipcMain.handle('web:getPlaylist', (_event, playlist: Playlist) => webSession.getPlaylist(playlist));
  ipcMain.handle('web:playTrack', (_event, track: Track) => webSession.playTrack(track));
  ipcMain.handle('web:streamUrl', (_event, track: Track, quality?: AudioQuality) => webSession.streamUrl(track, quality));
  ipcMain.handle('web:streamUrls', (_event, track: Track, quality?: AudioQuality) => webSession.streamUrls(track, quality));
  ipcMain.handle('web:saveOffline', async (_event, track: Track) => {
    if (track.offline) return track;
    const stream = await webSession.streamUrl(track, 'standard');
    return cache.saveOffline(track, stream.url);
  });
  ipcMain.handle('web:waveform', (_event, track: Track) => webSession.waveform(track));
  ipcMain.handle('web:seek', (_event, milliseconds: number) => webSession.seek(milliseconds));
  ipcMain.handle('web:setVolume', (_event, volume: number) => webSession.setVolume(volume));
  ipcMain.handle('web:openExternal', () => webSession.openExternal());
  ipcMain.handle('web:command', (_event, command: WebMediaCommand) => webSession.command(command));
}

const IPC_CHANNELS = [
  'app:getSettings',
  'app:saveSettings',
  'app:getCustomizationInfo',
  'app:openCustomizationFolder',
  'app:offlineTracks',
  'app:removeOffline',
  'app:getLyrics',
  'discord:updatePresence',
  'auth:status',
  'auth:login',
  'auth:logout',
  'auth:saveCredentials',
  'sc:search',
  'sc:likedTracks',
  'sc:library',
  'sc:getTrack',
  'sc:getArtist',
  'sc:getPlaylist',
  'sc:streamUrl',
  'sc:cacheArtwork',
  'theme:import',
  'theme:export',
  'theme:loadFromFile',
  'notify:track',
  'web:getState',
  'web:login',
  'web:search',
  'web:searchMore',
  'web:likedTracks',
  'web:likeTrack',
  'web:library',
  'web:getTrack',
  'web:getArtist',
  'web:getPlaylist',
  'web:playTrack',
  'web:streamUrl',
  'web:streamUrls',
  'web:saveOffline',
  'web:waveform',
  'web:seek',
  'web:setVolume',
  'web:openExternal',
  'web:command'
] as const;
