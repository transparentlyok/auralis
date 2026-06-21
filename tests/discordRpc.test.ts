import { describe, expect, it } from 'vitest';
import { buildPresence } from '../src/main/discordRpc';
import type { DiscordRpcSettings, PlaybackState, Track } from '../src/shared/types';

const settings: DiscordRpcSettings = {
  enabled: true,
  applicationId: '123456789012345678',
  largeImageKey: 'auralis',
  showListenButton: true
};

const track: Track = {
  id: 1,
  title: 'A Floating Garden',
  artist: 'nyri',
  duration: 180_000,
  artworkUrl: 'https://i1.sndcdn.com/artworks-example-t500x500.jpg',
  permalinkUrl: 'https://soundcloud.com/nyri/a-floating-garden',
  source: 'web'
};

const playback: PlaybackState = {
  playing: true,
  currentTime: 30_000,
  duration: 180_000,
  volume: 0.8,
  repeat: 'off',
  shuffle: false,
  loading: false
};

describe('Discord Rich Presence', () => {
  it('builds Spotify-style track details, timing, artwork, and link', () => {
    const presence = buildPresence(track, playback, settings);
    expect(presence).toMatchObject({
      details: 'A Floating Garden',
      state: 'by nyri',
      largeImageKey: track.artworkUrl,
      buttons: [{ label: 'Listen on SoundCloud', url: track.permalinkUrl }]
    });
    expect(Number(presence.endTimestamp) - Number(presence.startTimestamp)).toBe(180_000);
  });

  it('removes the timer while paused', () => {
    const presence = buildPresence(track, { ...playback, playing: false }, settings);
    expect(presence.startTimestamp).toBeUndefined();
    expect(presence.endTimestamp).toBeUndefined();
    expect(presence.smallImageText).toBe('Paused');
  });
});
