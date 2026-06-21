import { describe, expect, it } from 'vitest';
import { extractSoundCloudWebApiContext, soundcloudTrackLikePath } from '../src/shared/soundcloudWeb';

describe('SoundCloud web bootstrap parser', () => {
  it('extracts the dynamic API client and app version', () => {
    const source = 'window.__sc_hydration = [{"hydratable":"config","data":{"appVersion":"1781789404"}},{"hydratable":"me","data":{"id":12345}},{"hydratable":"apiClient","data":{"id":"iErh0hlIS7lC1NEeRzcimBG8NFFF045C","isExpiring":false}}];';
    expect(extractSoundCloudWebApiContext(source)).toEqual({
      clientId: 'iErh0hlIS7lC1NEeRzcimBG8NFFF045C',
      appVersion: '1781789404',
      userId: 12345
    });
  });

  it('rejects malformed bootstrap data', () => {
    expect(extractSoundCloudWebApiContext('window.__sc_hydration = [];')).toBeUndefined();
  });

  it('builds the authenticated track-like path', () => {
    expect(soundcloudTrackLikePath(12345, 98765)).toBe('/users/12345/track_likes/98765');
  });
});
