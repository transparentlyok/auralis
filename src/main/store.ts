import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { builtinThemes, validateTheme } from '../shared/theme';
import { defaultSettings } from '../shared/defaultSettings';
import type { AppSettings, CustomizationInfo, CustomWidgetDefinition, ThemeDefinition } from '../shared/types';
import { normalizeWidgetInstances, validateCustomWidget } from '../shared/widgets';
import type { SoundCloudCredentials, StoredSecretEnvelope, TokenSet } from './types';

const AUTH_FILE = 'auth.enc.json';
const CREDENTIALS_FILE = 'soundcloud-credentials.enc.json';
const SETTINGS_FILE = 'settings.json';

export class AppStore {
  readonly userData: string;
  readonly customizationRoot: string;
  readonly cacheRoot: string;

  constructor() {
    this.userData = app.getPath('userData');
    this.customizationRoot = path.join(this.userData, 'customization');
    this.cacheRoot = path.join(this.userData, 'cache');
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.userData, { recursive: true });
    await fs.mkdir(this.cacheRoot, { recursive: true });
    await fs.mkdir(path.join(this.customizationRoot, 'themes'), { recursive: true });
    await fs.mkdir(path.join(this.customizationRoot, 'widgets'), { recursive: true });
    await fs.mkdir(path.join(this.customizationRoot, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(this.customizationRoot, 'styles'), { recursive: true });
    await this.ensureExampleConfig();
    await this.seedThemes();
  }

  async getSettings(): Promise<AppSettings> {
    const file = path.join(this.userData, SETTINGS_FILE);
    const data = await readJson<Partial<AppSettings>>(file, {});
    return mergeSettings(data);
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const next = mergeSettings(settings);
    await writeJson(path.join(this.userData, SETTINGS_FILE), next);
    return next;
  }

  async getCustomizationInfo(): Promise<CustomizationInfo> {
    await this.ensure();
    const themes = await this.loadUserThemes();
    return {
      root: this.customizationRoot,
      themesPath: path.join(this.customizationRoot, 'themes'),
      widgetsPath: path.join(this.customizationRoot, 'widgets'),
      scriptsPath: path.join(this.customizationRoot, 'scripts'),
      stylesPath: path.join(this.customizationRoot, 'styles'),
      configPath: path.join(this.customizationRoot, 'config.json'),
      themes,
      widgets: await this.loadUserWidgets(),
      scripts: await this.loadTextExtensions('scripts', '.js', 'code'),
      styles: await this.loadTextExtensions('styles', '.css', 'css')
    };
  }

  async loadUserThemes(): Promise<ThemeDefinition[]> {
    const themesPath = path.join(this.customizationRoot, 'themes');
    const entries = await fs.readdir(themesPath, { withFileTypes: true }).catch(() => []);
    const themes: ThemeDefinition[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = await readJson<unknown>(path.join(themesPath, entry.name), null);
        if (raw) themes.push(validateTheme(raw));
      } catch {
        // Invalid user themes are ignored at load time and can be fixed live.
      }
    }
    return themes;
  }

  async loadUserWidgets(): Promise<CustomWidgetDefinition[]> {
    const widgetsPath = path.join(this.customizationRoot, 'widgets');
    const entries = await fs.readdir(widgetsPath, { withFileTypes: true }).catch(() => []);
    const widgets: CustomWidgetDefinition[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = await readJson<unknown>(path.join(widgetsPath, entry.name), undefined);
        widgets.push(validateCustomWidget(raw));
      } catch {
        // Invalid widgets remain editable on disk and are ignored until fixed.
      }
    }
    return widgets;
  }

  private async loadTextExtensions<T extends 'code' | 'css'>(folder: string, extension: string, field: T): Promise<Array<{ name: string } & Record<T, string>>> {
    const root = path.join(this.customizationRoot, folder);
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const results: Array<{ name: string } & Record<T, string>> = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(extension)) continue;
      try {
        const text = await fs.readFile(path.join(root, entry.name), 'utf8');
        if (text.length > 512_000) continue;
        results.push({ name: entry.name, [field]: text } as { name: string } & Record<T, string>);
      } catch {
        // A half-written extension will be retried by the customization watcher.
      }
    }
    return results;
  }

  async importTheme(themePath: string): Promise<ThemeDefinition> {
    const raw = await readJson<unknown>(themePath, null);
    const theme = validateTheme(raw);
    const target = path.join(this.customizationRoot, 'themes', `${theme.id}.json`);
    await writeJson(target, theme);
    return theme;
  }

  async exportTheme(theme: ThemeDefinition, targetPath: string): Promise<void> {
    await writeJson(targetPath, validateTheme(theme));
  }

  async getTokens(): Promise<TokenSet | undefined> {
    return this.readEncryptedJson<TokenSet>(AUTH_FILE);
  }

  async saveTokens(tokens: TokenSet): Promise<void> {
    await this.writeEncryptedJson(AUTH_FILE, tokens);
  }

  async clearTokens(): Promise<void> {
    await fs.rm(path.join(this.userData, AUTH_FILE), { force: true });
  }

  async getCredentials(): Promise<SoundCloudCredentials | undefined> {
    const envCreds = getEnvCredentials();
    if (envCreds) return envCreds;
    return this.readEncryptedJson<SoundCloudCredentials>(CREDENTIALS_FILE);
  }

  async saveCredentials(credentials: SoundCloudCredentials): Promise<void> {
    if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) {
      throw new Error('Client ID and client secret are required.');
    }
    await this.writeEncryptedJson(CREDENTIALS_FILE, {
      clientId: credentials.clientId.trim(),
      clientSecret: credentials.clientSecret.trim()
    });
  }

  private async readEncryptedJson<T>(fileName: string): Promise<T | undefined> {
    const file = path.join(this.userData, fileName);
    if (!fsSync.existsSync(file)) return undefined;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available, so secure secrets cannot be read.');
    }
    const envelope = await readJson<StoredSecretEnvelope | undefined>(file, undefined);
    if (!envelope?.data) return undefined;
    const buffer = Buffer.from(envelope.data, envelope.encoding);
    const text = safeStorage.decryptString(buffer);
    return JSON.parse(text) as T;
  }

  private async writeEncryptedJson(fileName: string, value: unknown): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available, so secure secrets cannot be saved.');
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(value));
    const envelope: StoredSecretEnvelope = {
      version: 1,
      encoding: 'base64',
      data: encrypted.toString('base64')
    };
    await writeJson(path.join(this.userData, fileName), envelope);
  }

  private async ensureExampleConfig(): Promise<void> {
    const file = path.join(this.customizationRoot, 'config.json');
    if (!fsSync.existsSync(file)) {
      await writeJson(file, {
        theme: 'classic-foobar',
        layout: defaultSettings.layout,
        notes: 'Drop themes, widgets, trusted renderer scripts, and styles into their matching customization folders.'
      });
    }
    const widget = path.join(this.customizationRoot, 'widgets', 'now-playing-details.json');
    if (!fsSync.existsSync(widget)) {
      await writeJson(widget, {
        id: 'now-playing-details',
        name: 'Now Playing Details',
        author: 'Auralis',
        version: '1.0.0',
        template: '{{track.title}}\n{{track.artist}}\n{{track.genre}}  {{playback.elapsed}} / {{playback.duration}}',
        defaultSpan: 1,
        defaultHeight: 92,
        style: { fontFamily: 'var(--font-mono)', whiteSpace: 'pre-line' }
      });
    }
  }

  private async seedThemes(): Promise<void> {
    const themesPath = path.join(this.customizationRoot, 'themes');
    for (const theme of builtinThemes) {
      const target = path.join(themesPath, `${theme.id}.json`);
      if (!fsSync.existsSync(target)) {
        await writeJson(target, theme);
      }
    }
  }
}

function getEnvCredentials(): SoundCloudCredentials | undefined {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID?.trim();
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret };
}

function mergeSettings(settings: Partial<AppSettings>): AppSettings {
  const widgets = normalizeWidgetInstances(settings.widgets, defaultSettings.widgets);
  if ((settings.schemaVersion ?? 1) < 2 && !widgets.some((widget) => widget.kind === 'lyrics')) {
    const lyrics = defaultSettings.widgets.find((widget) => widget.kind === 'lyrics');
    if (lyrics) widgets.push({ ...lyrics });
  }
  return {
    ...defaultSettings,
    ...settings,
    sourceMode: settings.sourceMode ?? (settings.mockMode ? 'mock' : 'web'),
    audioQuality: settings.audioQuality === 'high' || settings.audioQuality === 'standard' ? settings.audioQuality : 'best',
    discordRpc: {
      ...defaultSettings.discordRpc,
      ...(settings.discordRpc ?? {}),
      applicationId: settings.discordRpc?.applicationId?.trim() ?? '',
      largeImageKey: settings.discordRpc?.largeImageKey?.trim() ?? defaultSettings.discordRpc.largeImageKey
    },
    schemaVersion: defaultSettings.schemaVersion,
    widgets,
    layout: {
      ...defaultSettings.layout,
      ...(settings.layout ?? {}),
      showWidgetDock: settings.layout?.showWidgetDock ?? settings.layout?.showWaveform ?? defaultSettings.layout.showWidgetDock
    }
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
