import type { Playlist, SearchResults, Track, UserProfile } from './types';

export const mockArtists: UserProfile[] = [
  {
    id: 'mock-artist-1',
    username: 'Signal Workshop',
    fullName: 'Signal Workshop',
    avatarUrl: '',
    followersCount: 28400,
    trackCount: 42
  },
  {
    id: 'mock-artist-2',
    username: 'Lowpass District',
    fullName: 'Lowpass District',
    avatarUrl: '',
    followersCount: 9100,
    trackCount: 18
  },
  {
    id: 'mock-artist-3',
    username: 'Granular Rooms',
    fullName: 'Granular Rooms',
    avatarUrl: '',
    followersCount: 15100,
    trackCount: 29
  }
];

export const mockTracks: Track[] = [
  {
    id: 'mock-track-1',
    title: 'Loopback Login',
    artist: 'Signal Workshop',
    artistId: 'mock-artist-1',
    duration: 212000,
    genre: 'Electronic',
    bpm: 124,
    playbackCount: 125000,
    likesCount: 9100,
    artworkUrl: '',
    waveformUrl: '',
    streamUrl: 'mock://tone/246?shape=sawtooth',
    permalinkUrl: 'https://soundcloud.com/mock/loopback-login',
    access: 'playable',
    source: 'mock'
  },
  {
    id: 'mock-track-2',
    title: 'Panel Splitter',
    artist: 'Lowpass District',
    artistId: 'mock-artist-2',
    duration: 188000,
    genre: 'House',
    bpm: 118,
    playbackCount: 76000,
    likesCount: 5200,
    streamUrl: 'mock://tone/174?shape=triangle',
    permalinkUrl: 'https://soundcloud.com/mock/panel-splitter',
    access: 'playable',
    source: 'mock'
  },
  {
    id: 'mock-track-3',
    title: 'Theme Folder Watching',
    artist: 'Granular Rooms',
    artistId: 'mock-artist-3',
    duration: 265000,
    genre: 'Ambient',
    bpm: 92,
    playbackCount: 41100,
    likesCount: 3700,
    streamUrl: 'mock://tone/329?shape=sine',
    permalinkUrl: 'https://soundcloud.com/mock/theme-folder-watching',
    access: 'playable',
    source: 'mock'
  },
  {
    id: 'mock-track-4',
    title: 'Context Menu Dub',
    artist: 'Signal Workshop',
    artistId: 'mock-artist-1',
    duration: 231000,
    genre: 'Dub Techno',
    bpm: 122,
    playbackCount: 98000,
    likesCount: 6400,
    streamUrl: 'mock://tone/196?shape=square',
    permalinkUrl: 'https://soundcloud.com/mock/context-menu-dub',
    access: 'playable',
    source: 'mock'
  },
  {
    id: 'mock-track-5',
    title: 'Expired Token Recovery',
    artist: 'Lowpass District',
    artistId: 'mock-artist-2',
    duration: 201000,
    genre: 'Breaks',
    bpm: 132,
    playbackCount: 33400,
    likesCount: 1900,
    streamUrl: 'mock://tone/220?shape=sawtooth',
    permalinkUrl: 'https://soundcloud.com/mock/expired-token-recovery',
    access: 'playable',
    source: 'mock'
  }
];

export const mockPlaylists: Playlist[] = [
  {
    id: 'mock-playlist-1',
    title: 'Power User Setup',
    author: 'Auralis',
    trackCount: 4,
    duration: 896000,
    kind: 'playlist',
    tracks: [mockTracks[0], mockTracks[1], mockTracks[3], mockTracks[4]],
    source: 'mock'
  },
  {
    id: 'mock-album-1',
    title: 'Compact Mode Studies',
    author: 'Granular Rooms',
    authorId: 'mock-artist-3',
    trackCount: 3,
    duration: 766000,
    kind: 'album',
    tracks: [mockTracks[2], mockTracks[1], mockTracks[4]],
    source: 'mock'
  }
];

export function mockSearch(query: string): SearchResults {
  const term = query.trim().toLowerCase();
  const matches = (value: string | undefined) => !term || value?.toLowerCase().includes(term);
  return {
    tracks: mockTracks.filter((track) => matches(track.title) || matches(track.artist) || matches(track.genre)),
    artists: mockArtists.filter((artist) => matches(artist.username) || matches(artist.fullName)),
    playlists: mockPlaylists.filter((playlist) => playlist.kind !== 'album' && (matches(playlist.title) || matches(playlist.author))),
    albums: mockPlaylists.filter((playlist) => playlist.kind === 'album' && (matches(playlist.title) || matches(playlist.author))),
    mode: 'mock',
    warning: 'Mock mode is active. Add SoundCloud credentials and log in for real search and playback.'
  };
}

