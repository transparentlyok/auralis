import { BrowserWindow, globalShortcut } from 'electron';
import type { WebMediaCommand } from './webSession';

const shortcuts = [
  ['MediaPlayPause', 'media:playPause'],
  ['MediaNextTrack', 'media:next'],
  ['MediaPreviousTrack', 'media:previous'],
  ['MediaStop', 'media:stop']
] as const;

export function registerMediaKeys(window: BrowserWindow, onCommand?: (command: WebMediaCommand) => void): void {
  for (const [accelerator, eventName] of shortcuts) {
    try {
      globalShortcut.register(accelerator, () => {
        window.webContents.send(eventName);
        onCommand?.(eventName.replace('media:', '') as WebMediaCommand);
      });
    } catch {
      // Some platforms reserve media keys. The renderer also uses Media Session.
    }
  }
}

export function unregisterMediaKeys(): void {
  globalShortcut.unregisterAll();
}
