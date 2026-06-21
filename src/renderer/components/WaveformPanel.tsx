import { useEffect, useMemo, useState } from 'react';
import type { PlaybackState, Track } from '../../shared/types';

interface WaveformPanelProps {
  track?: Track;
  playback: PlaybackState;
  onSeek: (ms: number) => void;
}

export function WaveformPanel(props: WaveformPanelProps) {
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    let active = true;
    setSamples([]);
    if (!props.track?.waveformUrl || props.track.source !== 'web') return;
    void window.auralis.webWaveform(props.track).then((next) => {
      if (active) setSamples(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [props.track?.id, props.track?.source, props.track?.waveformUrl]);

  const duration = props.playback.duration || props.track?.duration || 1;
  const progress = Math.max(0, Math.min(1, props.playback.currentTime / duration));
  const bars = useMemo(() => {
    if (!samples.length) return Array.from({ length: 96 }, () => 8);
    const peak = Math.max(...samples, 1);
    return samples.map((sample) => Math.max(8, (sample / peak) * 100));
  }, [samples]);

  return (
    <div
      className="waveform-panel"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        props.onSeek(((event.clientX - rect.left) / rect.width) * duration);
      }}
      title="Seek"
    >
      {bars.map((height, index) => (
        <span
          key={index}
          className={index / bars.length <= progress ? 'played' : ''}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}
