import type { Playlist, SearchResults, Track, UserProfile } from '../../shared/types';
import { TrackTable } from './TrackTable';
import { compactNumber } from '../../shared/format';
import { Disc3, ListMusic, UserRound } from 'lucide-react';

interface ResultsTabsProps {
  activeTab: string;
  results: SearchResults;
  activeTrackId?: string | number;
  onTab: (tab: string) => void;
  onPlay: (track: Track) => void;
  onAdd: (track: Track) => void;
  onLike: (track: Track) => void;
  onSaveOffline: (track: Track) => void;
  onRemoveOffline: (track: Track) => void;
  onPrefetchLyrics?: (track: Track) => void;
  onNext: (track: Track) => void;
  onOpenTrack: (track: Track) => void;
  onOpenArtist: (track: Track) => void;
  onOpenUser: (artist: UserProfile) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function ResultsTabs(props: ResultsTabsProps) {
  const tabs = [
    { id: 'tracks', label: `Tracks (${props.results.tracks.length})` },
    { id: 'artists', label: `Artists (${props.results.artists.length})` },
    { id: 'playlists', label: `Playlists (${props.results.playlists.length})` },
    { id: 'albums', label: `Albums (${props.results.albums.length})` }
  ];

  return (
    <section className="results-panel">
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={props.activeTab === tab.id ? 'tab active' : 'tab'}
            onClick={() => props.onTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {props.results.warning && <div className="warning-line">{props.results.warning}</div>}
      {props.activeTab === 'tracks' && (
        <TrackTable
          tracks={props.results.tracks}
          activeTrackId={props.activeTrackId}
          onPlay={props.onPlay}
          onAdd={props.onAdd}
          onLike={props.onLike}
          onSaveOffline={props.onSaveOffline}
          onRemoveOffline={props.onRemoveOffline}
          onPrefetchLyrics={props.onPrefetchLyrics}
          onNext={props.onNext}
          onOpenTrack={props.onOpenTrack}
          onOpenArtist={props.onOpenArtist}
          onLoadMore={props.onLoadMore}
          loadingMore={props.loadingMore}
        />
      )}
      {props.activeTab === 'artists' && (
        <EntityGrid
          artists={props.results.artists}
          playlists={[]}
          onOpenUser={props.onOpenUser}
          onOpenPlaylist={props.onOpenPlaylist}
          onLoadMore={props.onLoadMore}
          loadingMore={props.loadingMore}
        />
      )}
      {props.activeTab === 'playlists' && (
        <EntityGrid
          artists={[]}
          playlists={props.results.playlists}
          onOpenUser={props.onOpenUser}
          onOpenPlaylist={props.onOpenPlaylist}
          onLoadMore={props.onLoadMore}
          loadingMore={props.loadingMore}
        />
      )}
      {props.activeTab === 'albums' && (
        <EntityGrid
          artists={[]}
          playlists={props.results.albums}
          onOpenUser={props.onOpenUser}
          onOpenPlaylist={props.onOpenPlaylist}
          onLoadMore={props.onLoadMore}
          loadingMore={props.loadingMore}
        />
      )}
    </section>
  );
}

function EntityGrid(props: {
  artists: UserProfile[];
  playlists: Playlist[];
  onOpenUser: (artist: UserProfile) => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  return (
    <div
      className="entity-grid"
      onScroll={(event) => {
        const element = event.currentTarget;
        if (!props.loadingMore && element.scrollHeight - element.scrollTop - element.clientHeight < 320) props.onLoadMore?.();
      }}
    >
      {props.artists.map((artist) => (
        <button className="entity-card" key={artist.id} onClick={() => props.onOpenUser(artist)}>
          <div className="entity-icon"><UserRound size={22} /></div>
          <strong>{artist.username}</strong>
          <span>{compactNumber(artist.followersCount)} followers</span>
        </button>
      ))}
      {props.playlists.map((playlist) => (
        <button className="entity-card" key={playlist.id} onClick={() => props.onOpenPlaylist(playlist)}>
          <div className="entity-icon">{playlist.kind === 'album' ? <Disc3 size={22} /> : <ListMusic size={22} />}</div>
          <strong>{playlist.title}</strong>
          <span>{playlist.author} - {playlist.trackCount} tracks</span>
        </button>
      ))}
      {props.loadingMore && <div className="loading-more">Loading more...</div>}
    </div>
  );
}
