import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { formatDuration } from '../../shared/format';
import type { PlaybackState, QueueState, Track } from '../../shared/types';

interface PlayerBarProps {
  track?: Track;
  playback: PlaybackState;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (ms: number) => void;
  onVolume: (volume: number) => void;
  onShuffle: (enabled: boolean) => void;
  onRepeat: (repeat: QueueState['repeat']) => void;
}

export function PlayerBar(props: PlayerBarProps) {
  const duration = props.playback.duration || props.track?.duration || 0;
  const repeatIcon = props.playback.repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />;
  const nextRepeat: QueueState['repeat'] =
    props.playback.repeat === 'off' ? 'all' : props.playback.repeat === 'all' ? 'one' : 'off';

  return (
    <div className="player-bar">
      <div className="transport">
        <button className="transport-button" onClick={props.onPrevious} title="Previous">
          <SkipBack size={17} />
        </button>
        <button className="transport-button primary" onClick={props.onToggle} title={props.playback.playing ? 'Pause' : 'Play'}>
          {props.playback.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="transport-button" onClick={props.onNext} title="Next">
          <SkipForward size={17} />
        </button>
        <button
          className={props.playback.shuffle ? 'transport-button active' : 'transport-button'}
          onClick={() => props.onShuffle(!props.playback.shuffle)}
          title="Shuffle"
        >
          <Shuffle size={15} />
        </button>
        <button
          className={props.playback.repeat !== 'off' ? 'transport-button active' : 'transport-button'}
          onClick={() => props.onRepeat(nextRepeat)}
          title={`Repeat: ${props.playback.repeat}`}
        >
          {repeatIcon}
        </button>
      </div>
      <div className="now-playing">
        <MarqueeText text={props.track?.title ?? 'No track selected'} />
        <div className="now-artist">
          {props.track?.artist ?? 'Search, open your library, or use mock mode'}
          {props.playback.streamQuality ? ` - ${props.playback.streamQuality}` : ''}
        </div>
      </div>
      <div className="seek-area">
        <span className="mono">{formatDuration(props.playback.currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={Math.min(props.playback.currentTime, duration || 1)}
          onChange={(event) => props.onSeek(Number(event.target.value))}
        />
        <span className="mono">{formatDuration(duration)}</span>
      </div>
      <div className="volume">
        <Volume2 size={15} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.playback.volume}
          onChange={(event) => props.onVolume(Number(event.target.value))}
        />
      </div>
    </div>
  );
}

function MarqueeText(props: { text: string }) {
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const update = () => setOverflowing(Boolean(container.current && measure.current && measure.current.scrollWidth > container.current.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [props.text]);

  return (
    <div className={overflowing ? 'now-title marquee active' : 'now-title marquee'} ref={container} title={props.text}>
      <div className="marquee-track">
        <span ref={measure}>{props.text}</span>
        {overflowing && <span aria-hidden="true">{props.text}</span>}
      </div>
    </div>
  );
}
