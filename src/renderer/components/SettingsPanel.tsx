import { useState } from 'react';
import { ArrowDown, ArrowUp, FolderOpen, LayoutDashboard, Palette, PanelsTopLeft, Plus, Puzzle, Search, Settings2, Trash2, Upload } from 'lucide-react';
import { safeId } from '../../shared/format';
import type { AppSettings, AuthStatus, CustomWidgetDefinition, ThemeDefinition, WidgetKind } from '../../shared/types';
import type { LoadedExtensions } from '../hooks/useCustomExtensions';

interface SettingsPanelProps {
  settings: AppSettings;
  auth: AuthStatus | undefined;
  themes: ThemeDefinition[];
  customWidgets: CustomWidgetDefinition[];
  loadedExtensions: LoadedExtensions;
  onSettings: (settings: AppSettings) => void;
  onSaveCredentials: (clientId: string, clientSecret: string) => Promise<void>;
  onOpenCustomization: () => void;
  onImportTheme: () => void;
  onTheme: (themeId: string) => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [section, setSection] = useState<'marketplace' | 'layout' | 'widgets' | 'extensions' | 'advanced'>('marketplace');
  const [catalogQuery, setCatalogQuery] = useState('');
  const themes = props.themes.filter((theme) => `${theme.name} ${theme.id} ${theme.author ?? ''}`.toLowerCase().includes(catalogQuery.toLowerCase()));
  const sections = [
    { id: 'marketplace' as const, label: 'Marketplace', icon: Palette },
    { id: 'layout' as const, label: 'Layout', icon: LayoutDashboard },
    { id: 'widgets' as const, label: 'Widgets', icon: PanelsTopLeft },
    { id: 'extensions' as const, label: 'Extensions', icon: Puzzle },
    { id: 'advanced' as const, label: 'Advanced', icon: Settings2 }
  ];
  return (
    <section className="settings-panel">
      <header className="customize-header">
        <strong>Customization Hub</strong>
        <div className="customize-tabs">
          {sections.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><Icon size={14} /><span>{item.label}</span></button>;
          })}
        </div>
      </header>

      {section === 'marketplace' && <div className="customize-page">
        <div className="marketplace-toolbar">
          <label className="marketplace-search"><Search size={14} /><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search themes" /></label>
          <button className="command-button" onClick={props.onImportTheme}><Upload size={15} /><span>Import</span></button>
          <button className="command-button" onClick={props.onOpenCustomization}><FolderOpen size={15} /><span>Folder</span></button>
        </div>
        <div className="theme-list">
          {themes.map((theme) => (
            <button className={props.settings.themeId === theme.id ? 'theme-card active' : 'theme-card'} key={theme.id} onClick={() => props.onTheme(theme.id)}>
              <span className="theme-swatches" aria-hidden="true">{[theme.colors.background, theme.colors.surface, theme.colors.accent, theme.colors.selected].map((color, index) => <i key={index} style={{ background: color }} />)}</span>
              <strong>{theme.name}</strong><span>{theme.author ?? 'Unknown'} · {theme.id}</span>
            </button>
          ))}
        </div>
      </div>}

      {section === 'layout' && <div className="customize-page settings-grid">
        <label><span>Density</span><select value={props.settings.layout.density} onChange={(event) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, density: event.target.value as AppSettings['layout']['density'] } })}><option value="dense">Dense</option><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
        <label><span>Audio Quality</span><select value={props.settings.audioQuality} onChange={(event) => props.onSettings({ ...props.settings, audioQuality: event.target.value as AppSettings['audioQuality'] })}><option value="best">Best Available</option><option value="high">Prefer High</option><option value="standard">Standard MP3</option></select></label>
        <label><span>Queue Panel</span><select value={props.settings.layout.queuePanel} onChange={(event) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, queuePanel: event.target.value as AppSettings['layout']['queuePanel'] } })}><option value="right">Right</option><option value="bottom">Bottom</option><option value="hidden">Hidden</option></select></label>
        <Toggle label="Sidebar" checked={props.settings.layout.showSidebar} onChange={(showSidebar) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, showSidebar } })} />
        <Toggle label="Artwork" checked={props.settings.layout.showArtwork} onChange={(showArtwork) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, showArtwork } })} />
        <Toggle label="Widget Dock" checked={props.settings.layout.showWidgetDock} onChange={(showWidgetDock) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, showWidgetDock } })} />
        <Toggle label="Status Bar" checked={props.settings.layout.showStatusBar} onChange={(showStatusBar) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, showStatusBar } })} />
        <RangeSetting label="Font Size" value={props.settings.layout.fontSize} min={10} max={18} unit="px" onChange={(fontSize) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, fontSize } })} />
        <RangeSetting label="Track Row Height" value={props.settings.layout.rowHeight} min={19} max={42} unit="px" onChange={(rowHeight) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, rowHeight } })} />
        <RangeSetting label="Sidebar Width" value={props.settings.layout.sidebarWidth} min={130} max={360} unit="px" onChange={(sidebarWidth) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, sidebarWidth } })} />
        <RangeSetting label="Artwork Width" value={props.settings.layout.artworkWidth} min={150} max={440} unit="px" onChange={(artworkWidth) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, artworkWidth } })} />
        <RangeSetting label="Queue Width" value={props.settings.layout.queueWidth} min={220} max={600} unit="px" onChange={(queueWidth) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, queueWidth } })} />
        <RangeSetting label="Widget Dock Height" value={props.settings.layout.widgetDockMaxHeight} min={100} max={560} unit="px" onChange={(widgetDockMaxHeight) => props.onSettings({ ...props.settings, layout: { ...props.settings.layout, widgetDockMaxHeight } })} />
      </div>}

      {section === 'widgets' && <div className="customize-page"><WidgetManager settings={props.settings} customWidgets={props.customWidgets} onSettings={props.onSettings} /></div>}
      {section === 'extensions' && <div className="customize-page"><div className="extension-summary"><div><strong>Scripts</strong><span>{props.loadedExtensions.scripts.join(', ') || 'None loaded'}</span></div><div><strong>Styles</strong><span>{props.loadedExtensions.styles.join(', ') || 'None loaded'}</span></div></div><div className="settings-actions"><button className="command-button" onClick={props.onOpenCustomization}><FolderOpen size={15} /><span>Open Extensions Folder</span></button></div></div>}
      {section === 'advanced' && <div className="customize-page advanced-settings">
        <DiscordRpcForm settings={props.settings} onSettings={props.onSettings} />
        <CredentialForm auth={props.auth} onSave={props.onSaveCredentials} />
      </div>}
    </section>
  );
}

function WidgetManager(props: {
  settings: AppSettings;
  customWidgets: CustomWidgetDefinition[];
  onSettings: (settings: AppSettings) => void;
}) {
  const commit = (widgets: AppSettings['widgets']) => props.onSettings({ ...props.settings, widgets });
  const add = (kind: WidgetKind, custom?: CustomWidgetDefinition) => {
    commit([...props.settings.widgets, {
      id: safeId('widget'),
      kind,
      title: custom?.name ?? widgetLabel(kind),
      enabled: true,
      span: custom?.defaultSpan ?? (kind === 'waveform' ? 2 : 1),
      height: custom?.defaultHeight ?? 92,
      customWidgetId: custom?.id
    }]);
  };
  const update = (id: string, patch: Partial<AppSettings['widgets'][number]>) => {
    commit(props.settings.widgets.map((widget) => widget.id === id ? { ...widget, ...patch } : widget));
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= props.settings.widgets.length) return;
    const next = [...props.settings.widgets];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };
  return (
    <div className="widget-manager">
      <div className="settings-actions widget-add-actions">
        {(['waveform', 'spectrum', 'spectrogram', 'oscilloscope', 'lyrics', 'now-playing', 'track-stats'] as const).map((kind) => (
          <button className="command-button" key={kind} onClick={() => add(kind)}><Plus size={14} /><span>{widgetLabel(kind)}</span></button>
        ))}
        {props.customWidgets.map((widget) => (
          <button className="command-button" key={widget.id} onClick={() => add('custom', widget)}><Plus size={14} /><span>{widget.name}</span></button>
        ))}
      </div>
      <div className="widget-settings-list">
        {props.settings.widgets.map((widget, index) => (
          <div className="widget-settings-row" key={widget.id}>
            <input type="checkbox" checked={widget.enabled} onChange={(event) => update(widget.id, { enabled: event.target.checked })} />
            <input value={widget.title || ''} onChange={(event) => update(widget.id, { title: event.target.value })} aria-label="Widget title" />
            <select value={widget.span} onChange={(event) => update(widget.id, { span: Number(event.target.value) as 1 | 2 | 3 })} aria-label="Widget width">
              <option value={1}>1 column</option>
              <option value={2}>2 columns</option>
              <option value={3}>Full width</option>
            </select>
            <input type="number" min={58} max={360} value={widget.height} onChange={(event) => update(widget.id, { height: Number(event.target.value) })} aria-label="Widget height" />
            <button className="icon-inline" title="Move up" onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
            <button className="icon-inline" title="Move down" onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
            <button className="icon-inline" title="Remove widget" onClick={() => commit(props.settings.widgets.filter((item) => item.id !== widget.id))}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function widgetLabel(kind: WidgetKind): string {
  return kind === 'waveform' ? 'Waveform' : kind === 'spectrum' ? 'Spectrum' : kind === 'spectrogram' ? 'Spectrogram' : kind === 'oscilloscope' ? 'Oscilloscope' : kind === 'lyrics' ? 'Lyrics' : kind === 'now-playing' ? 'Now Playing' : kind === 'track-stats' ? 'Track Stats' : 'Custom';
}

function Toggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-line">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
    </label>
  );
}

function RangeSetting(props: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return (
    <label className="range-setting">
      <span>{props.label} <strong>{props.value}{props.unit}</strong></span>
      <input type="range" min={props.min} max={props.max} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  );
}

function DiscordRpcForm(props: { settings: AppSettings; onSettings: (settings: AppSettings) => void }) {
  const [enabled, setEnabled] = useState(props.settings.discordRpc.enabled);
  const [applicationId, setApplicationId] = useState(props.settings.discordRpc.applicationId);
  const [largeImageKey, setLargeImageKey] = useState(props.settings.discordRpc.largeImageKey);
  const [showListenButton, setShowListenButton] = useState(props.settings.discordRpc.showListenButton);
  const validId = /^\d{17,20}$/.test(applicationId.trim());
  return (
    <section className="integration-card">
      <div className="integration-heading">
        <div><strong>Discord Rich Presence</strong><span>Show the current Auralis track on your Discord profile.</span></div>
        <label className="toggle-line"><span>Enabled</span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /></label>
      </div>
      <div className="integration-fields">
        <label><span>Discord Application ID</span><input value={applicationId} onChange={(event) => setApplicationId(event.target.value.replace(/\D/g, ''))} placeholder="123456789012345678" /></label>
        <label><span>Fallback image asset key</span><input value={largeImageKey} onChange={(event) => setLargeImageKey(event.target.value)} placeholder="auralis" /></label>
        <Toggle label="Listen on SoundCloud button" checked={showListenButton} onChange={setShowListenButton} />
      </div>
      <div className="integration-footer">
        <small className={enabled && !validId ? 'form-error' : ''}>{enabled && !validId ? 'Enter the Application ID from Discord Developer Portal.' : 'Track cover art is automatic; this uploaded Discord asset is used only when a track has no artwork.'}</small>
        <button className="command-button" disabled={enabled && !validId} onClick={() => props.onSettings({
          ...props.settings,
          discordRpc: { enabled, applicationId: applicationId.trim(), largeImageKey: largeImageKey.trim(), showListenButton }
        })}>Apply Discord RPC</button>
      </div>
    </section>
  );
}

function CredentialForm(props: {
  auth: AuthStatus | undefined;
  onSave: (clientId: string, clientSecret: string) => Promise<void>;
}) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="credentials-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
          await props.onSave(clientId, clientSecret);
          setClientSecret('');
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to save credentials.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <label>
        <span>Client ID</span>
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Optional SoundCloud client_id" />
      </label>
      <label>
        <span>Client Secret</span>
        <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Optional; stored with OS encryption" />
      </label>
      <button className="command-button" type="submit" disabled={saving}>{saving ? 'Saving' : 'Save Credentials'}</button>
      <small className={error ? 'form-error' : ''}>{error ?? props.auth?.message ?? 'Not needed for Web mode. API secrets are encrypted by the OS.'}</small>
    </form>
  );
}
