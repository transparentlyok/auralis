import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Clock, Hash, MoreHorizontal, Play, Plus, UserRound } from 'lucide-react';
import { compactNumber, formatDuration } from '../../shared/format';
import type { ContextMenuAction, Track } from '../../shared/types';
import { ContextMenu } from './contextMenu';

interface TrackTableProps {
  tracks: Track[];
  activeTrackId?: string | number;
  onPlay: (track: Track) => void;
  onAdd: (track: Track) => void;
  onLike: (track: Track) => void;
  onSaveOffline: (track: Track) => void;
  onRemoveOffline: (track: Track) => void;
  onPrefetchLyrics?: (track: Track) => void;
  onNext: (track: Track) => void;
  onOpenTrack: (track: Track) => void;
  onOpenArtist: (track: Track) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

const defaultColumns = {
  index: 42,
  title: 420,
  artist: 220,
  duration: 92,
  genre: 120,
  plays: 110,
  likes: 92
};

export function TrackTable(props: TrackTableProps) {
  const [columns, setColumns] = useState(defaultColumns);
  const [menu, setMenu] = useState<{ x: number; y: number; track: Track }>();
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0, rowHeight: 24 });
  const tableRef = useRef<HTMLDivElement>(null);
  const template = useMemo(() => {
    return `${columns.index}px minmax(180px, ${columns.title}px) ${columns.artist}px ${columns.duration}px ${columns.genre}px ${columns.plays}px ${columns.likes}px minmax(46px, 1fr)`;
  }, [columns]);
  const tableWidth = Object.values(columns).reduce((sum, width) => sum + width, 34);
  const virtualized = props.tracks.length > 200;
  const overscan = 10;
  const firstRow = virtualized ? Math.max(0, Math.floor(Math.max(0, viewport.scrollTop - 26) / viewport.rowHeight) - overscan) : 0;
  const lastRow = virtualized
    ? Math.min(props.tracks.length, Math.ceil((viewport.scrollTop + viewport.height) / viewport.rowHeight) + overscan)
    : props.tracks.length;
  const visibleTracks = props.tracks.slice(firstRow, lastRow);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const measure = () => {
      const rowHeight = Number.parseFloat(getComputedStyle(element).getPropertyValue('--space-row')) || 24;
      setViewport((current) => ({ ...current, height: element.clientHeight, rowHeight }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resize = (key: keyof typeof defaultColumns, startX: number, startWidth: number) => {
    const onMove = (event: MouseEvent) => {
      setColumns((current) => ({
        ...current,
        [key]: Math.max(54, startWidth + event.clientX - startX)
      }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const menuActions = (track: Track): ContextMenuAction[] => [
    { id: 'play', label: 'Play' },
    { id: 'next', label: 'Play Next' },
    { id: 'queue', label: 'Add To Queue' },
    { id: 'like', label: track.liked ? 'Liked' : 'Like On SoundCloud', disabled: track.liked },
    { id: track.offline ? 'removeOffline' : 'offline', label: track.offline ? 'Remove Offline Copy' : 'Download For Offline' },
    { id: 'track', label: 'Show Track Details' },
    { id: 'artist', label: 'Open Artist' }
  ];

  return (
    <div
      ref={tableRef}
      className="track-table"
      role="grid"
      onScroll={(event) => {
        const element = event.currentTarget;
        setViewport((current) => current.scrollTop === element.scrollTop ? current : { ...current, scrollTop: element.scrollTop });
        if (!props.loadingMore && element.scrollHeight - element.scrollTop - element.clientHeight < 320) props.onLoadMore?.();
      }}
    >
      <div className="table-row table-head" style={{ gridTemplateColumns: template, minWidth: tableWidth }}>
        <HeaderCell icon={<Hash size={13} />} label="" column="index" width={columns.index} onResize={resize} />
        <HeaderCell label="Title" column="title" width={columns.title} onResize={resize} />
        <HeaderCell icon={<UserRound size={13} />} label="Artist" column="artist" width={columns.artist} onResize={resize} />
        <HeaderCell icon={<Clock size={13} />} label="Time" column="duration" width={columns.duration} onResize={resize} />
        <HeaderCell label="Genre" column="genre" width={columns.genre} onResize={resize} />
        <HeaderCell label="Plays" column="plays" width={columns.plays} onResize={resize} />
        <HeaderCell label="Likes" column="likes" width={columns.likes} onResize={resize} />
        <div />
      </div>
      <div
        className={virtualized ? 'table-body virtualized' : 'table-body'}
        style={virtualized ? { height: props.tracks.length * viewport.rowHeight, minWidth: tableWidth } : { minWidth: tableWidth }}
      >
        {visibleTracks.map((track, visibleIndex) => {
          const index = firstRow + visibleIndex;
          const virtualStyle: CSSProperties | undefined = virtualized
            ? { gridTemplateColumns: template, position: 'absolute', top: index * viewport.rowHeight, minWidth: tableWidth }
            : { gridTemplateColumns: template };
          return (
          <div
            key={track.id}
            className={props.activeTrackId === track.id ? 'table-row active' : 'table-row'}
            style={virtualStyle}
            onDoubleClick={() => props.onPlay(track)}
            onPointerEnter={() => props.onPrefetchLyrics?.(track)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, track });
            }}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter') props.onPlay(track);
            }}
          >
            <div className="cell muted">{index + 1}</div>
            <div className="cell title-cell">
              <button className="icon-inline" onClick={() => props.onPlay(track)} title="Play">
                <Play size={13} />
              </button>
              <span className="track-title">{track.title}</span>
              {track.access === 'preview' && <span className="track-badge">Preview</span>}
            </div>
            <button className="cell text-button" onClick={() => props.onOpenArtist(track)}>{track.artist}</button>
            <div className="cell mono">{formatDuration(track.duration)}</div>
            <div className="cell muted">{track.genre ?? ''}</div>
            <div className="cell mono muted">{compactNumber(track.playbackCount)}</div>
            <div className="cell mono muted">{compactNumber(track.likesCount)}</div>
            <div className="cell row-actions">
              <button className={track.liked ? 'icon-inline liked-action' : 'icon-inline'} onClick={() => props.onLike(track)} title={track.liked ? 'Liked on SoundCloud' : 'Like on SoundCloud'} disabled={track.liked}>
                <Plus size={13} />
              </button>
              <button className="icon-inline" onClick={(event) => setMenu({ x: event.clientX, y: event.clientY, track })} title="More">
                <MoreHorizontal size={13} />
              </button>
            </div>
          </div>
          );
        })}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          actions={menuActions(menu.track)}
          onClose={() => setMenu(undefined)}
          onAction={(id) => {
            if (id === 'play') props.onPlay(menu.track);
            if (id === 'next') props.onNext(menu.track);
            if (id === 'queue') props.onAdd(menu.track);
            if (id === 'like') props.onLike(menu.track);
            if (id === 'offline') props.onSaveOffline(menu.track);
            if (id === 'removeOffline') props.onRemoveOffline(menu.track);
            if (id === 'track') props.onOpenTrack(menu.track);
            if (id === 'artist') props.onOpenArtist(menu.track);
            setMenu(undefined);
          }}
        />
      )}
    </div>
  );
}

function HeaderCell(props: {
  label: string;
  icon?: ReactNode;
  column: keyof typeof defaultColumns;
  width: number;
  onResize: (key: keyof typeof defaultColumns, startX: number, startWidth: number) => void;
}) {
  return (
    <div className="cell header-cell">
      {props.icon}
      <span>{props.label}</span>
      <button
        className="column-resizer"
        onMouseDown={(event) => props.onResize(props.column, event.clientX, props.width)}
        aria-label={`Resize ${props.label || props.column}`}
      />
    </div>
  );
}
