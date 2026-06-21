import { describe, expect, it } from 'vitest';
import { parseSyncedLyrics } from '../src/shared/lyrics';

describe('synced lyrics parser', () => {
  it('parses and orders LRC timestamps', () => {
    expect(parseSyncedLyrics('[00:12.50]Second\n[00:01.25]First')).toEqual([
      { time: 1250, text: 'First' },
      { time: 12500, text: 'Second' }
    ]);
  });

  it('supports multiple timestamps on one line', () => {
    expect(parseSyncedLyrics('[00:01.00][00:02.5]Again')).toEqual([
      { time: 1000, text: 'Again' },
      { time: 2500, text: 'Again' }
    ]);
  });
});
