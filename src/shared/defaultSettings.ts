import type { AppSettings } from './types';

export const defaultSettings: AppSettings = {
  schemaVersion: 3,
  themeId: 'classic-foobar',
  sourceMode: 'web',
  layout: {
    showSidebar: true,
    showArtwork: true,
    showWaveform: true,
    showWidgetDock: true,
    showStatusBar: true,
    queuePanel: 'right',
    density: 'compact',
    sidebarWidth: 196,
    queueWidth: 356,
    artworkWidth: 220,
    fontSize: 12,
    rowHeight: 24,
    widgetDockMaxHeight: 320
  },
  volume: 0.78,
  lastView: 'search',
  searchLimit: 50,
  mockMode: false,
  cacheTtlHours: 24,
  audioQuality: 'best',
  discordRpc: {
    enabled: false,
    applicationId: '',
    largeImageKey: 'auralis',
    showListenButton: true
  },
  widgets: [
    { id: 'waveform-main', kind: 'waveform', title: 'Waveform', enabled: true, span: 2, height: 76 },
    { id: 'spectrum-main', kind: 'spectrum', title: 'Spectrum', enabled: true, span: 1, height: 76 },
    { id: 'lyrics-main', kind: 'lyrics', title: 'Lyrics', enabled: true, span: 1, height: 180 }
  ]
};
