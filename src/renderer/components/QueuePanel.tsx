import { ArrowDown, ArrowUp, ListX, Play, Trash2 } from 'lucide-react';
import { formatDuration } from '../../shared/format';
import type { QueueItem } from '../../shared/types';

interface QueuePanelProps {
  items: QueueItem[];
  currentIndex: number;
  onJump: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function QueuePanel(props: QueuePanelProps) {
  return (
    <aside className="queue-panel">
      <div className="panel-header">
        <span>Queue</span>
        <button className="tool-button" onClick={props.onClear} title="Clear queue">
          <ListX size={14} />
        </button>
      </div>
      <div className="queue-list">
        {props.items.map((item, index) => (
          <div key={item.id} className={index === props.currentIndex ? 'queue-item active' : 'queue-item'}>
            <button className="icon-inline" onClick={() => props.onJump(index)} title="Play this item">
              <Play size={13} />
            </button>
            <div className="queue-meta">
              <span>{item.track.title}</span>
              <small>{item.track.artist} - {formatDuration(item.track.duration)}</small>
            </div>
            <button className="icon-inline" onClick={() => props.onMove(index, index - 1)} disabled={index === 0} title="Move up">
              <ArrowUp size={13} />
            </button>
            <button className="icon-inline" onClick={() => props.onMove(index, index + 1)} disabled={index === props.items.length - 1} title="Move down">
              <ArrowDown size={13} />
            </button>
            <button className="icon-inline" onClick={() => props.onRemove(item.id)} title="Remove">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

