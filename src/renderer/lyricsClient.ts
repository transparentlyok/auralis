import type { LyricsRecord, Track } from '../shared/types';

interface LyricsTask {
  key: string;
  track: Track;
  promise: Promise<LyricsRecord | undefined>;
  resolve: (value: LyricsRecord | undefined) => void;
  reject: (reason: unknown) => void;
  priority: boolean;
}

const tasks = new Map<string, LyricsTask>();
const foregroundQueue: LyricsTask[] = [];
const backgroundQueue: LyricsTask[] = [];
let active = 0;
let activeBackground = 0;
const concurrency = 4;
const backgroundConcurrency = 1;

export function requestLyrics(track: Track, priority = false): Promise<LyricsRecord | undefined> {
  const key = String(track.id);
  const existing = tasks.get(key);
  if (existing) {
    if (priority && !existing.priority) {
      const index = backgroundQueue.indexOf(existing);
      if (index >= 0) {
        backgroundQueue.splice(index, 1);
        existing.priority = true;
        foregroundQueue.unshift(existing);
      }
    }
    return existing.promise;
  }
  let resolve!: LyricsTask['resolve'];
  let reject!: LyricsTask['reject'];
  const promise = new Promise<LyricsRecord | undefined>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  const task = { key, track, promise, resolve, reject, priority };
  tasks.set(key, task);
  if (priority) foregroundQueue.unshift(task); else backgroundQueue.push(task);
  pump();
  return promise;
}

export function prefetchLyrics(tracks: Track[]): void {
  tracks.slice(0, 1).forEach((track) => void requestLyrics(track).catch(() => undefined));
}

function pump(): void {
  while (active < concurrency) {
    const task = foregroundQueue.shift() ?? (activeBackground < backgroundConcurrency ? backgroundQueue.shift() : undefined);
    if (!task) return;
    active += 1;
    if (!task.priority) activeBackground += 1;
    void window.auralis.getLyrics(task.track)
      .then(task.resolve, task.reject)
      .finally(() => {
        tasks.delete(task.key);
        active -= 1;
        if (!task.priority) activeBackground -= 1;
        pump();
      });
  }
}
