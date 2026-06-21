export type SourceMode = 'soundcloud' | 'web' | 'mock';
export type AppSourceMode = 'web' | 'api' | 'mock';
export type SearchCategory = 'tracks' | 'artists' | 'playlists' | 'albums';
export type AudioQuality = 'best' | 'high' | 'standard';
export type WidgetKind = 'waveform' | 'spectrum' | 'spectrogram' | 'oscilloscope' | 'lyrics' | 'now-playing' | 'track-stats' | 'custom';

export interface WidgetInstance {
  id: string;
  kind: WidgetKind;
  title?: string;
  enabled: boolean;
  span: 1 | 2 | 3;
  height: number;
  customWidgetId?: string;
}

export interface CustomWidgetDefinition {
  id: string;
  name: string;
  version?: string;
  author?: string;
  template: string;
  style?: Record<string, string>;
  defaultSpan?: 1 | 2 | 3;
  defaultHeight?: number;
}

export interface WebNowPlaying {
  title: string;
  artist?: string;
  artworkUrl?: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  ended?: boolean;
}

export interface WebStreamInfo {
  url: string;
  protocol: 'progressive' | 'hls';
  quality: string;
  mimeType?: string;
}

export interface WebSessionState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  visible: boolean;
  authenticated?: boolean;
  error?: string;
  nowPlaying?: WebNowPlaying;
}

export interface UserProfile {
  id: number | string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  permalinkUrl?: string;
  followersCount?: number;
  trackCount?: number;
}

export interface Track {
  id: number | string;
  title: string;
  artist: string;
  artistId?: number | string;
  duration: number;
  artworkUrl?: string;
  waveformUrl?: string;
  permalinkUrl?: string;
  streamUrl?: string;
  bpm?: number;
  genre?: string;
  album?: string;
  playbackCount?: number;
  likesCount?: number;
  access?: 'playable' | 'preview' | 'blocked' | string;
  description?: string;
  liked?: boolean;
  downloadable?: boolean;
  offline?: boolean;
  source: SourceMode;
  raw?: unknown;
}

export interface LyricsRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
  source: 'lrclib';
}

export interface Playlist {
  id: number | string;
  title: string;
  author: string;
  authorId?: number | string;
  trackCount: number;
  artworkUrl?: string;
  permalinkUrl?: string;
  duration?: number;
  kind?: 'playlist' | 'album' | string;
  tracks?: Track[];
  source: SourceMode;
  raw?: unknown;
}

export interface SearchResults {
  tracks: Track[];
  artists: UserProfile[];
  playlists: Playlist[];
  albums: Playlist[];
  mode: SourceMode;
  warning?: string;
  next?: Partial<Record<SearchCategory, string>>;
}

export interface QueueItem {
  id: string;
  track: Track;
  addedAt: number;
}

export interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
}

export interface ThemeDefinition {
  id: string;
  name: string;
  author?: string;
  version?: string;
  density?: 'compact' | 'comfortable' | 'dense';
  colors: Record<string, string>;
  fonts?: {
    ui?: string;
    mono?: string;
    size?: string;
  };
  spacing?: Record<string, string>;
  borders?: Record<string, string>;
  icons?: Record<string, string>;
  layout?: Partial<AppLayoutSettings>;
}

export interface AppLayoutSettings {
  showSidebar: boolean;
  showArtwork: boolean;
  showWaveform: boolean;
  showWidgetDock: boolean;
  showStatusBar: boolean;
  queuePanel: 'right' | 'bottom' | 'hidden';
  density: 'compact' | 'comfortable' | 'dense';
  sidebarWidth: number;
  queueWidth: number;
  artworkWidth: number;
  fontSize: number;
  rowHeight: number;
  widgetDockMaxHeight: number;
}

export interface AppSettings {
  schemaVersion: number;
  themeId: string;
  sourceMode: AppSourceMode;
  layout: AppLayoutSettings;
  volume: number;
  lastView: string;
  searchLimit: number;
  mockMode: boolean;
  cacheTtlHours: number;
  audioQuality: AudioQuality;
  discordRpc: DiscordRpcSettings;
  widgets: WidgetInstance[];
}

export interface DiscordRpcSettings {
  enabled: boolean;
  applicationId: string;
  largeImageKey: string;
  showListenButton: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  credentialsConfigured: boolean;
  mode: SourceMode;
  user?: UserProfile;
  expiresAt?: number;
  message?: string;
}

export interface PlaybackState {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeat: QueueState['repeat'];
  shuffle: boolean;
  loading: boolean;
  error?: string;
  streamQuality?: string;
}

export interface ContextMenuAction {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface CustomizationInfo {
  root: string;
  themesPath: string;
  widgetsPath: string;
  scriptsPath: string;
  stylesPath: string;
  configPath: string;
  themes: ThemeDefinition[];
  widgets: CustomWidgetDefinition[];
  scripts: Array<{ name: string; code: string }>;
  styles: Array<{ name: string; css: string }>;
}
