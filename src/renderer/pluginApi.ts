type Command = () => void;
type PluginEvent = 'trackchange' | 'playback' | 'settings';
type Listener = (payload: unknown) => void;

const panels = new Map<string, unknown>();
const commands = new Map<string, Command>();
const listeners = new Map<PluginEvent, Set<Listener>>();
const pluginStyles = new Map<string, HTMLStyleElement>();
let pluginState: Record<string, unknown> = {};

export function installPluginApi(): void {
  if (window.auralisPluginApi) return;
  window.auralisPluginApi = {
    version: '0.1.0',
    registerPanel(id: string, factory: unknown) {
      panels.set(id, factory);
    },
    registerCommand(id: string, callback: Command) {
      commands.set(id, callback);
    },
    addStyle(id: string, css: string) {
      pluginStyles.get(id)?.remove();
      const element = document.createElement('style');
      element.dataset.auralisExtensionStyle = id;
      element.textContent = css;
      document.head.appendChild(element);
      pluginStyles.set(id, element);
      return () => {
        element.remove();
        pluginStyles.delete(id);
      };
    },
    on(event: PluginEvent, callback: Listener) {
      const callbacks = listeners.get(event) ?? new Set<Listener>();
      callbacks.add(callback);
      listeners.set(event, callbacks);
      return () => callbacks.delete(callback);
    },
    getState() {
      return pluginState;
    }
  };
}

export function emitPluginEvent(event: PluginEvent, payload: unknown): void {
  pluginState = event === 'settings'
    ? { ...pluginState, settings: payload }
    : { ...pluginState, ...(payload && typeof payload === 'object' ? payload as Record<string, unknown> : { [event]: payload }) };
  for (const listener of listeners.get(event) ?? []) {
    try { listener(payload); } catch (error) { console.error(`[Auralis extension] ${event}`, error); }
  }
}

export function resetPluginExtensions(): void {
  commands.clear();
  panels.clear();
  listeners.clear();
  for (const style of pluginStyles.values()) style.remove();
  pluginStyles.clear();
}

export function runPluginCommand(id: string): boolean {
  const command = commands.get(id);
  if (!command) return false;
  command();
  return true;
}
