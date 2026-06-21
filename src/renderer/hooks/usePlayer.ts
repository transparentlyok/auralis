import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import { emptyQueue, enqueue, moveQueueItem, nextIndex, playNext, previousIndex, removeFromQueue, setCurrentIndex } from '../../shared/queue';
import type { AudioQuality, PlaybackState, QueueState, Track, WebStreamInfo } from '../../shared/types';

const initialPlayback: PlaybackState = {
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.78,
  repeat: 'off',
  shuffle: false,
  loading: false
};

export function usePlayer(initialVolume: number, audioQuality: AudioQuality) {
  const [queue, setQueue] = useState<QueueState>(emptyQueue);
  const [playback, setPlayback] = useState<PlaybackState>({ ...initialPlayback, volume: initialVolume });
  const [playNonce, setPlayNonce] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const toneRef = useRef<MockToneEngine | null>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickerRef = useRef<number>();
  const queueRef = useRef(queue);
  const volumeRef = useRef(initialVolume);
  queueRef.current = queue;
  const currentItem = queue.currentIndex >= 0 ? queue.items[queue.currentIndex] : undefined;
  const currentTrack = currentItem?.track;

  const playTracks = useCallback((tracks: Track[], startIndex = 0) => {
    setQueue((state) => setCurrentIndex(
      enqueue({ ...state, items: [], currentIndex: -1 }, tracks, true),
      Math.max(0, Math.min(tracks.length - 1, startIndex))
    ));
  }, []);

  const addToQueue = useCallback((tracks: Track[]) => {
    setQueue((state) => enqueue(state, tracks));
  }, []);

  const addNext = useCallback((tracks: Track[]) => {
    setQueue((state) => playNext(state, tracks));
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setQueue((state) => removeFromQueue(state, itemId));
  }, []);

  const clear = useCallback(() => {
    audioRef.current?.pause();
    toneRef.current?.stop();
    setQueue(emptyQueue);
    setPlayback((state) => ({ ...state, playing: false, currentTime: 0 }));
  }, []);

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((state) => moveQueueItem(state, fromIndex, toIndex));
  }, []);

  const jumpTo = useCallback((index: number) => {
    const next = setCurrentIndex(queueRef.current, index);
    if (next.currentIndex === queueRef.current.currentIndex) setPlayNonce((value) => value + 1);
    queueRef.current = next;
    setQueue(next);
  }, []);

  const advance = useCallback(() => {
    const state = queueRef.current;
    const index = nextIndex(state);
    if (index === -1) {
      setPlayback((playbackState) => ({ ...playbackState, playing: false, currentTime: 0 }));
      return;
    }
    if (index === state.currentIndex) setPlayNonce((value) => value + 1);
    const next = { ...state, currentIndex: index };
    queueRef.current = next;
    setQueue(next);
  }, []);

  const previous = useCallback(() => {
    const state = queueRef.current;
    const index = previousIndex(state);
    if (index === state.currentIndex) setPlayNonce((value) => value + 1);
    const next = { ...state, currentIndex: index };
    queueRef.current = next;
    setQueue(next);
  }, []);

  const startToneTicker = useCallback(() => {
    if (tickerRef.current) window.clearTimeout(tickerRef.current);
    const tick = () => {
      const tone = toneRef.current;
      if (!tone) return;
      setPlayback((state) => ({
        ...state,
        currentTime: tone.currentTime,
        playing: tone.playing,
        duration: tone.duration
      }));
      if (tone.playing) tickerRef.current = window.setTimeout(tick, 250);
    };
    tickerRef.current = window.setTimeout(tick, 250);
  }, []);

  const resume = useCallback(async () => {
    if (!currentTrack) return;
    if (toneRef.current) {
      await toneRef.current.play();
      setPlayback((state) => ({ ...state, playing: true }));
      startToneTicker();
      return;
    }
    await audioRef.current?.play();
  }, [currentTrack, startToneTicker]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    toneRef.current?.pause();
    setPlayback((state) => ({ ...state, playing: false }));
  }, []);

  const toggle = useCallback(() => {
    if (playback.playing) pause();
    else void resume();
  }, [pause, playback.playing, resume]);

  const seek = useCallback((ms: number) => {
    if (toneRef.current) {
      toneRef.current.seek(ms);
      setPlayback((state) => ({ ...state, currentTime: ms }));
      return;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000;
      setPlayback((state) => ({ ...state, currentTime: ms }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    setPlayback((state) => ({ ...state, volume: Math.max(0, Math.min(1, volume)) }));
  }, []);

  const setRepeat = useCallback((repeat: QueueState['repeat']) => {
    setQueue((state) => ({ ...state, repeat }));
    setPlayback((state) => ({ ...state, repeat }));
  }, []);

  const setShuffle = useCallback((shuffle: boolean) => {
    setQueue((state) => ({ ...state, shuffle }));
    setPlayback((state) => ({ ...state, shuffle }));
  }, []);

  const resolveTrackStreams = useCallback(async (track: Track): Promise<WebStreamInfo[]> => {
    if (track.offline && track.streamUrl?.startsWith('file:')) {
      return [{ url: track.streamUrl, protocol: 'progressive', quality: 'offline', mimeType: 'audio/mpeg' }];
    }
    if (track.source === 'web') return window.auralis.webStreamUrls(track, audioQuality);
    return [{ url: await window.auralis.streamUrl(track), protocol: 'progressive', quality: 'source' }];
  }, [audioQuality]);

  const loadAndPlay = useCallback(async (track: Track) => {
    setPlayback((state) => ({ ...state, loading: true, error: undefined, duration: track.duration, currentTime: 0, streamQuality: undefined }));
    try {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const streams = await resolveTrackStreams(track);
      const url = streams[0]?.url;
      if (!url) throw new Error('No playable stream was returned.');
      if (url.startsWith('mock://')) {
        audioRef.current?.pause();
        toneRef.current?.stop();
        toneRef.current = new MockToneEngine(url, track.duration, advance);
        toneRef.current.setVolume(volumeRef.current);
        await toneRef.current.play();
        setPlayback((state) => ({ ...state, loading: false, playing: true, duration: track.duration, streamQuality: 'MOCK' }));
        startToneTicker();
      } else {
        toneRef.current?.stop();
        const audio = audioRef.current;
        if (!audio) return;
        await audioContextRef.current?.resume();
        let lastError: unknown;
        let streamQuality: string | undefined;
        for (const stream of streams) {
          try {
            hlsRef.current = await attachAndPlay(audio, stream);
            streamQuality = describeStream(stream, track);
            break;
          } catch (error) {
            lastError = error;
            hlsRef.current?.destroy();
            hlsRef.current = null;
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          }
        }
        if (!streamQuality) throw lastError instanceof Error ? lastError : new Error('Every SoundCloud stream variant failed.');
        setPlayback((state) => ({ ...state, loading: false, playing: true, duration: track.duration, streamQuality, error: undefined }));
      }
      window.auralis.notifyTrack(track).catch(() => undefined);
    } catch (error) {
      setPlayback((state) => ({
        ...state,
        loading: false,
        playing: false,
        error: error instanceof Error ? error.message : 'Playback failed.'
      }));
    }
  }, [advance, resolveTrackStreams, startToneTicker]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    audio.volume = initialVolume;
    audioRef.current = audio;

    const update = () => setPlayback((state) => ({
      ...state,
      currentTime: audio.currentTime * 1000,
      duration: Number.isFinite(audio.duration) ? audio.duration * 1000 : state.duration,
      playing: !audio.paused,
      loading: false
    }));
    const onError = () => setPlayback((state) => ({
      ...state,
      playing: false,
      loading: false,
      error: 'Playback failed. The track may be unavailable or the stream URL expired.'
    }));
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('loadedmetadata', update);
    audio.addEventListener('play', update);
    audio.addEventListener('pause', update);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', advance);
    return () => {
      audio.pause();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('loadedmetadata', update);
      audio.removeEventListener('play', update);
      audio.removeEventListener('pause', update);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', advance);
      if (tickerRef.current) window.clearTimeout(tickerRef.current);
      toneRef.current?.stop();
      audioSourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      void audioContextRef.current?.close();
      audioSourceRef.current = null;
      analyserRef.current = null;
      audioContextRef.current = null;
    };
  }, [advance]);

  useEffect(() => {
    if (!currentTrack) return;
    void loadAndPlay(currentTrack);
  }, [currentItem?.id, playNonce, loadAndPlay]);

  useEffect(() => {
    volumeRef.current = playback.volume;
    if (audioRef.current) audioRef.current.volume = playback.volume;
    toneRef.current?.setVolume(playback.volume);
  }, [playback.volume]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = currentTrack ? new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      artwork: currentTrack.artworkUrl ? [{ src: currentTrack.artworkUrl }] : []
    }) : null;
    navigator.mediaSession.setActionHandler('play', () => void resume());
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('nexttrack', advance);
    navigator.mediaSession.setActionHandler('previoustrack', previous);
  }, [advance, currentTrack, pause, previous, resume]);

  useEffect(() => {
    const offPlayPause = window.auralis.onMediaCommand('playPause', toggle);
    const offNext = window.auralis.onMediaCommand('next', advance);
    const offPrev = window.auralis.onMediaCommand('previous', previous);
    const offStop = window.auralis.onMediaCommand('stop', pause);
    return () => {
      offPlayPause();
      offNext();
      offPrev();
      offStop();
    };
  }, [advance, pause, previous, toggle]);

  const getAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      audioSourceRef.current = source;
      analyserRef.current = analyser;
    }
    if (!audio.paused) void audioContextRef.current.resume();
    return analyserRef.current;
  }, []);

  return useMemo(() => ({
    queue,
    playback,
    currentTrack,
    playTracks,
    addToQueue,
    addNext,
    removeItem,
    clear,
    moveItem,
    jumpTo,
    resume,
    pause,
    toggle,
    seek,
    setVolume,
    setRepeat,
    setShuffle,
    next: advance,
    previous,
    getAnalyser
  }), [queue, playback, currentTrack, playTracks, addToQueue, addNext, removeItem, clear, moveItem, jumpTo, resume, pause, toggle, seek, setVolume, setRepeat, setShuffle, advance, previous, getAnalyser]);
}

async function attachAndPlay(audio: HTMLAudioElement, stream: WebStreamInfo): Promise<HlsType | null> {
  if (stream.protocol !== 'hls') {
    audio.src = stream.url;
    audio.currentTime = 0;
    await audio.play();
    return null;
  }
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) {
    audio.src = stream.url;
    audio.currentTime = 0;
    await audio.play();
    return null;
  }
  const hls = new Hls({
    enableWorker: true,
    startLevel: -1,
    maxBufferLength: 20,
    maxMaxBufferLength: 40,
    backBufferLength: 10,
    maxBufferSize: 30 * 1000 * 1000
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const parsed = () => { cleanup(); resolve(); };
      const failed = (_event: string, data: { fatal: boolean; details?: string }) => {
        if (!data.fatal) return;
        cleanup();
        reject(new Error(data.details || 'HLS stream failed.'));
      };
      const cleanup = () => {
        hls.off(Hls.Events.MANIFEST_PARSED, parsed);
        hls.off(Hls.Events.ERROR, failed);
      };
      hls.on(Hls.Events.MANIFEST_PARSED, parsed);
      hls.on(Hls.Events.ERROR, failed);
      hls.loadSource(stream.url);
      hls.attachMedia(audio);
    });
    audio.currentTime = 0;
    await audio.play();
    return hls;
  } catch (error) {
    hls.destroy();
    throw error;
  }
}

function describeStream(stream: WebStreamInfo, track: Track): string {
  const codec = stream.mimeType?.includes('opus') ? 'OPUS' : stream.mimeType?.includes('mp4') ? 'AAC' : stream.protocol === 'hls' ? 'HLS' : 'MP3';
  const preview = track.access === 'preview' ? ' PREVIEW' : '';
  return stream.quality === 'offline' ? 'OFFLINE MP3' : `${stream.quality.toUpperCase()} ${codec}${preview}`;
}

class MockToneEngine {
  private context?: AudioContext;
  private oscillator?: OscillatorNode;
  private gain?: GainNode;
  private startedAt = 0;
  private offset = 0;
  private endTimer?: number;
  playing = false;
  readonly duration: number;

  constructor(
    private readonly url: string,
    duration: number,
    private readonly onEnded: () => void
  ) {
    this.duration = duration || 180000;
  }

  get currentTime(): number {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.offset + (performance.now() - this.startedAt));
  }

  async play(): Promise<void> {
    this.stopOscillator();
    this.context ??= new AudioContext();
    await this.context.resume();
    const parsed = parseMockUrl(this.url);
    this.gain = this.context.createGain();
    this.gain.gain.value = 0.2;
    this.oscillator = this.context.createOscillator();
    this.oscillator.type = parsed.shape;
    this.oscillator.frequency.value = parsed.frequency;
    this.oscillator.connect(this.gain);
    this.gain.connect(this.context.destination);
    this.oscillator.start();
    this.startedAt = performance.now();
    this.playing = true;
    const remaining = Math.max(0, this.duration - this.offset);
    this.endTimer = window.setTimeout(() => {
      this.pause();
      this.seek(0);
      this.onEnded();
    }, remaining);
  }

  pause(): void {
    this.offset = this.currentTime;
    this.playing = false;
    this.stopOscillator();
  }

  stop(): void {
    this.offset = 0;
    this.playing = false;
    this.stopOscillator();
  }

  seek(ms: number): void {
    this.offset = Math.max(0, Math.min(this.duration, ms));
    if (this.playing) void this.play();
  }

  setVolume(volume: number): void {
    if (this.gain) this.gain.gain.value = volume * 0.35;
  }

  private stopOscillator(): void {
    if (this.endTimer) window.clearTimeout(this.endTimer);
    this.endTimer = undefined;
    try {
      this.oscillator?.stop();
      this.oscillator?.disconnect();
      this.gain?.disconnect();
    } catch {
      // Already stopped.
    }
    this.oscillator = undefined;
    this.gain = undefined;
  }
}

function parseMockUrl(url: string): { frequency: number; shape: OscillatorType } {
  const parsed = new URL(url);
  const frequency = Number(parsed.pathname.replace('/', '') || parsed.hostname) || 220;
  const shape = parsed.searchParams.get('shape') as OscillatorType | null;
  return {
    frequency,
    shape: shape && ['sine', 'square', 'sawtooth', 'triangle'].includes(shape) ? shape : 'sine'
  };
}
