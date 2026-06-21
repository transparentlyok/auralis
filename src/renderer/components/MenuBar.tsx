import { FolderOpen, LogIn, LogOut, RefreshCcw, Settings, Upload } from 'lucide-react';
import type { AuthStatus, ThemeDefinition } from '../../shared/types';

interface MenuBarProps {
  auth: AuthStatus | undefined;
  webMode: boolean;
  themes: ThemeDefinition[];
  themeId: string;
  onTheme: (id: string) => void;
  onLogin: () => void;
  onLogout: () => void;
  onImportTheme: () => void;
  onOpenCustomization: () => void;
  onRefresh: () => void;
  onSettings: () => void;
}

export function MenuBar(props: MenuBarProps) {
  return (
    <div className="menu-bar">
      <div className="menu-group">
        <span className="brand">Auralis</span>
        <button className="tool-button" onClick={props.onRefresh} title="Refresh current view">
          <RefreshCcw size={15} />
        </button>
        {props.webMode ? (
          <button className="tool-button with-label" onClick={props.onLogin} title="Sign in through SoundCloud Web">
            <LogIn size={15} />
            <span>Web Login</span>
          </button>
        ) : props.auth?.authenticated ? (
          <button className="tool-button with-label" onClick={props.onLogout} title="Log out">
            <LogOut size={15} />
            <span>{props.auth.user?.username ?? 'Logout'}</span>
          </button>
        ) : (
          <button className="tool-button with-label" onClick={props.onLogin} title="Log in with SoundCloud">
            <LogIn size={15} />
            <span>Login</span>
          </button>
        )}
      </div>
      <div className="menu-group grow">
        <label className="select-label">
          <span>Theme</span>
          <select value={props.themeId} onChange={(event) => props.onTheme(event.target.value)}>
            {props.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </label>
        <button className="tool-button" onClick={props.onImportTheme} title="Import theme">
          <Upload size={15} />
        </button>
        <button className="tool-button" onClick={props.onOpenCustomization} title="Open customization folder">
          <FolderOpen size={15} />
        </button>
        <button className="tool-button" onClick={props.onSettings} title="Settings and customization">
          <Settings size={15} />
        </button>
      </div>
    </div>
  );
}
