import { safeId } from './format';
import type { QueueItem, QueueState, Track } from './types';

export const emptyQueue: QueueState = {
  items: [],
  currentIndex: -1,
  shuffle: false,
  repeat: 'off'
};

export function createQueueItem(track: Track): QueueItem {
  return {
    id: safeId('queue'),
    track,
    addedAt: Date.now()
  };
}

export function enqueue(state: QueueState, tracks: Track[], startPlaying = false): QueueState {
  const nextItems = [...state.items, ...tracks.map(createQueueItem)];
  const currentIndex = state.currentIndex === -1 && (startPlaying || state.items.length === 0) && nextItems.length > 0
    ? 0
    : state.currentIndex;
  return { ...state, items: nextItems, currentIndex };
}

export function playNext(state: QueueState, tracks: Track[]): QueueState {
  const insertAt = state.currentIndex < 0 ? 0 : state.currentIndex + 1;
  const items = [...state.items];
  items.splice(insertAt, 0, ...tracks.map(createQueueItem));
  return {
    ...state,
    items,
    currentIndex: state.currentIndex < 0 && items.length > 0 ? 0 : state.currentIndex
  };
}

export function removeFromQueue(state: QueueState, itemId: string): QueueState {
  const index = state.items.findIndex((item) => item.id === itemId);
  if (index === -1) return state;
  const items = state.items.filter((item) => item.id !== itemId);
  let currentIndex = state.currentIndex;
  if (index < currentIndex) currentIndex -= 1;
  if (index === currentIndex) currentIndex = Math.min(index, items.length - 1);
  if (items.length === 0) currentIndex = -1;
  return { ...state, items, currentIndex };
}

export function clearQueue(): QueueState {
  return { ...emptyQueue };
}

export function moveQueueItem(state: QueueState, fromIndex: number, toIndex: number): QueueState {
  if (fromIndex === toIndex) return state;
  if (fromIndex < 0 || fromIndex >= state.items.length) return state;
  if (toIndex < 0 || toIndex >= state.items.length) return state;
  const items = [...state.items];
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
  let currentIndex = state.currentIndex;
  if (currentIndex === fromIndex) {
    currentIndex = toIndex;
  } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
    currentIndex -= 1;
  } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
    currentIndex += 1;
  }
  return { ...state, items, currentIndex };
}

export function setCurrentIndex(state: QueueState, index: number): QueueState {
  if (index < 0 || index >= state.items.length) return { ...state, currentIndex: -1 };
  return { ...state, currentIndex: index };
}

export function nextIndex(state: QueueState): number {
  if (state.items.length === 0) return -1;
  if (state.repeat === 'one' && state.currentIndex >= 0) return state.currentIndex;
  if (state.shuffle) {
    if (state.items.length === 1) return 0;
    let next = state.currentIndex;
    while (next === state.currentIndex) {
      next = Math.floor(Math.random() * state.items.length);
    }
    return next;
  }
  const next = state.currentIndex + 1;
  if (next < state.items.length) return next;
  return state.repeat === 'all' ? 0 : -1;
}

export function previousIndex(state: QueueState): number {
  if (state.items.length === 0) return -1;
  if (state.currentIndex <= 0) return state.repeat === 'all' ? state.items.length - 1 : 0;
  return state.currentIndex - 1;
}

