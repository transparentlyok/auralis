import type { AuralisApi } from '../preload';

declare global {
  interface Window {
    auralis: AuralisApi;
    auralisPluginApi?: {
      registerPanel: (id: string, factory: unknown) => void;
      registerCommand: (id: string, callback: () => void) => void;
      addStyle: (id: string, css: string) => () => void;
      on: (event: 'trackchange' | 'playback' | 'settings', callback: (payload: unknown) => void) => () => void;
      getState: () => unknown;
      version: string;
    };
  }
}

export {};
