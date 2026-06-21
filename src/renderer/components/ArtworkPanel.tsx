import { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import type { Track } from '../../shared/types';

interface ArtworkPanelProps {
  track?: Track;
}

export function ArtworkPanel(props: ArtworkPanelProps) {
  const [artworkSrc, setArtworkSrc] = useState(props.track?.artworkUrl);

  useEffect(() => {
    const remote = props.track?.artworkUrl;
    let active = true;
    setArtworkSrc(remote);
    if (remote) {
      window.auralis.cacheArtwork(remote)
        .then((cached) => {
          if (active && cached) setArtworkSrc(cached);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [props.track?.artworkUrl]);

  return (
    <aside className="artwork-panel">
      <div className="panel-header">Artwork</div>
      <div className="artwork-box">
        {artworkSrc ? (
          <img src={artworkSrc} alt="" onError={() => setArtworkSrc(props.track?.artworkUrl)} />
        ) : (
          <div className="artwork-placeholder">
            <Disc3 size={44} strokeWidth={1.4} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="details-list">
        <div><span>Title</span><strong>{props.track?.title ?? '-'}</strong></div>
        <div><span>Artist</span><strong>{props.track?.artist ?? '-'}</strong></div>
        <div><span>Genre</span><strong>{props.track?.genre ?? '-'}</strong></div>
        <div><span>Source</span><strong>{props.track?.source ?? '-'}</strong></div>
      </div>
      {props.track?.description && (
        <details className="track-description">
          <summary>Description</summary>
          <p>{props.track.description}</p>
        </details>
      )}
    </aside>
  );
}
