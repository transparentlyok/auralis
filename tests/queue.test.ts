import { describe, expect, it } from 'vitest';
import { clearQueue, emptyQueue, enqueue, moveQueueItem, nextIndex, playNext, previousIndex, removeFromQueue, setCurrentIndex } from '../src/shared/queue';
import type { Track } from '../src/shared/types';

const tracks: Track[] = [
  { id: 'a', title: 'A', artist: 'Artist', duration: 1, source: 'mock' },
  { id: 'b', title: 'B', artist: 'Artist', duration: 1, source: 'mock' },
  { id: 'c', title: 'C', artist: 'Artist', duration: 1, source: 'mock' }
];

describe('queue logic', () => {
  it('seeds a full playback context at the clicked track', () => {
    const queue = setCurrentIndex(enqueue(emptyQueue, tracks, true), 1);
    expect(queue.items.map((item) => item.track.id)).toEqual(['a', 'b', 'c']);
    expect(queue.currentIndex).toBe(1);
    expect(nextIndex(queue)).toBe(2);
  });

  it('starts playback when enqueueing into an empty queue', () => {
    const queue = enqueue(emptyQueue, [tracks[0]]);
    expect(queue.items).toHaveLength(1);
    expect(queue.currentIndex).toBe(0);
  });

  it('inserts play-next items after the current index', () => {
    const queue = playNext(enqueue(emptyQueue, [tracks[0], tracks[2]]), [tracks[1]]);
    expect(queue.items.map((item) => item.track.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps current track stable while moving earlier items', () => {
    const queue = enqueue(emptyQueue, tracks);
    const moved = moveQueueItem({ ...queue, currentIndex: 2 }, 0, 1);
    expect(moved.currentIndex).toBe(2);
  });

  it('adjusts current index when removing preceding items', () => {
    const queue = enqueue(emptyQueue, tracks);
    const removed = removeFromQueue({ ...queue, currentIndex: 2 }, queue.items[0].id);
    expect(removed.currentIndex).toBe(1);
  });

  it('honors repeat-all boundaries', () => {
    const queue = { ...enqueue(emptyQueue, tracks), currentIndex: 2, repeat: 'all' as const };
    expect(nextIndex(queue)).toBe(0);
    expect(previousIndex({ ...queue, currentIndex: 0 })).toBe(2);
  });

  it('clears queue state', () => {
    expect(clearQueue()).toEqual(emptyQueue);
  });
});
