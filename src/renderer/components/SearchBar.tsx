import { Library, Search, ThumbsUp } from 'lucide-react';
import type { AppSourceMode } from '../../shared/types';

interface SearchBarProps {
  query: string;
  loading: boolean;
  sourceMode: AppSourceMode;
  onQuery: (query: string) => void;
  onSearch: () => void;
  onLibrary: () => void;
  onLikes: () => void;
  onSourceMode: (mode: AppSourceMode) => void;
}

export function SearchBar(props: SearchBarProps) {
  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSearch();
      }}
    >
      <div className="search-input">
        <Search size={15} />
        <input
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          placeholder="Search SoundCloud"
        />
      </div>
      <button className="command-button" type="submit" disabled={props.loading}>
        <Search size={15} />
        <span>{props.loading ? 'Searching' : 'Search'}</span>
      </button>
      <button className="command-button" type="button" onClick={props.onLibrary}>
        <Library size={15} />
        <span>Library</span>
      </button>
      <button className="command-button" type="button" onClick={props.onLikes}>
        <ThumbsUp size={15} />
        <span>Likes</span>
      </button>
      <div className="mode-switch" role="group" aria-label="SoundCloud source">
        {(['web', 'api', 'mock'] as const).map((mode) => (
          <button
            key={mode}
            className={props.sourceMode === mode ? 'mode-button active' : 'mode-button'}
            type="button"
            onClick={() => props.onSourceMode(mode)}
            title={mode === 'web' ? 'Use the persistent SoundCloud browser session' : mode === 'api' ? 'Use optional SoundCloud API credentials' : 'Use offline mock data'}
          >
            {mode === 'web' ? 'Web' : mode === 'api' ? 'API' : 'Mock'}
          </button>
        ))}
      </div>
    </form>
  );
}
