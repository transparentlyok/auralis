import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import fs, { type FSWatcher } from 'node:fs';
import { is } from '@electron-toolkit/utils';
import { AppStore } from './store';
import { AuthService } from './auth';
import { MetadataCache } from './cache';
import { SoundCloudService } from './soundcloud';
import { registerIpc } from './ipc';
import { registerMediaKeys, unregisterMediaKeys } from './mediaKeys';
import { SoundCloudWebSession } from './webSession';
import { LyricsService } from './lyrics';
import { DiscordRichPresence } from './discordRpc';

let mainWindow: BrowserWindow | undefined;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function createWindow(): Promise<void> {
  const store = new AppStore();
  await store.ensure();
  const auth = new AuthService(store);
  const cache = new MetadataCache(store.cacheRoot);
  const soundcloud = new SoundCloudService(auth, cache);
  const lyrics = new LyricsService(cache);
  const discordRpc = new DiscordRichPresence();
  await discordRpc.configure((await store.getSettings()).discordRpc);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    title: 'Auralis',
    backgroundColor: '#ece9d8',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: is.dev
    }
  });

  const webSession = new SoundCloudWebSession(mainWindow);
  registerIpc(mainWindow, store, auth, soundcloud, webSession, cache, lyrics, discordRpc);
  registerMediaKeys(mainWindow);
  const customizationWatcher = watchCustomization(store.customizationRoot, mainWindow);
  mainWindow.once('closed', () => {
    customizationWatcher.close();
    webSession.destroy();
    void discordRpc.destroy();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function watchCustomization(root: string, window: BrowserWindow): FSWatcher {
  fs.mkdirSync(join(root, 'themes'), { recursive: true });
  fs.mkdirSync(join(root, 'widgets'), { recursive: true });
  return fs.watch(root, { persistent: false, recursive: true }, () => {
    window.webContents.send('theme:changed');
    window.webContents.send('customization:changed');
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(createWindow);
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(console.error);
  }
});

app.on('window-all-closed', () => {
  unregisterMediaKeys();
  if (process.platform !== 'darwin') app.quit();
});
