import { Disc3, Download, Heart, Library, ListMusic, Radio, Search, SlidersHorizontal } from 'lucide-react';

interface SidebarProps {
  active: string;
  onView: (view: string) => void;
}

const sections = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'likes', label: 'Liked Tracks', icon: Heart },
  { id: 'offline', label: 'Offline', icon: Download },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'albums', label: 'Albums', icon: Disc3 },
  { id: 'radio', label: 'Artist Radio', icon: Radio },
  { id: 'customize', label: 'Customize', icon: SlidersHorizontal }
];

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-title">Views</div>
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <button
            key={section.id}
            className={props.active === section.id ? 'sidebar-item active' : 'sidebar-item'}
            onClick={() => props.onView(section.id)}
          >
            <Icon size={15} />
            <span>{section.label}</span>
          </button>
        );
      })}
    </aside>
  );
}
