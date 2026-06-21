# Auralis

[![CI](https://github.com/transparentlyok/auralis/actions/workflows/ci.yml/badge.svg)](https://github.com/transparentlyok/auralis/actions/workflows/ci.yml)
[![Releases](https://img.shields.io/github/v/release/transparentlyok/auralis?display_name=tag)](https://github.com/transparentlyok/auralis/releases)

Auralis is a desktop SoundCloud client inspired by foobar2000's compact power-user workflow and Spicetify-style customization. Its default Web mode uses a hidden, authenticated SoundCloud browser as a data and playback bridge while all everyday interaction stays in Auralis's native tables, queue, artwork panel, and player. No developer API key is required. Optional API and mock modes remain available.

[https://i.imgur.com/y01oJIv.png](7https://i.imgur.com/y01oJIv.png)

## Stack Choice

Auralis uses Electron, React, TypeScript, and Vite. Electron is heavier than Tauri, but it is the pragmatic choice because Chromium provides compatible HLS/audio playback, persistent SoundCloud browser sessions, Media Session support, native notifications, encrypted optional secret storage through `safeStorage`, and global media shortcuts in one cross-platform shell. A hidden, sandboxed SoundCloud view establishes the normal-user session while React owns the visible UI and native audio element.

SoundCloud currently documents OAuth 2.1 with PKCE, token refresh, `Authorization: OAuth ACCESS_TOKEN`, custom/desktop redirect handling, search endpoints, and stream URL playback through track stream resources. Auralis follows that model and keeps secrets out of source control.

## Features

- No-key browser-bridge mode with a normal sign-in window and persistent cookies.
- Browser-backed SoundCloud search, profiles, playlists, albums, likes, library, and playback rendered in native Auralis panels.
- Optional SoundCloud OAuth login with PKCE and loopback callback for API mode.
- Encrypted persistent SoundCloud tokens and saved credentials using Electron `safeStorage`.
- Search for tracks, artists, playlists, and albums where SoundCloud returns playlist album types.
- Library, liked tracks, track detail, artist, and playlist loading.
- One-click SoundCloud Likes from the `+` row action.
- App-managed offline track downloads with a dedicated Offline library.
- HTML5/HLS audio playback with Best Available, Prefer High, and Standard MP3 quality selection.
- Ranked transcoding fallback: if one legitimate SoundCloud stream fails, Auralis tries the remaining variants.
- LRCLIB synced and plain lyrics with timestamp following and click-to-seek.
- Mock mode with synthesized local playback when API access is unavailable.
- Queue: play now, play next, reorder, remove, clear, previous, next.
- Playback: play, pause, seek, volume, repeat, shuffle.
- Global media shortcuts bridged to both the custom player and SoundCloud's web miniplayer.
- Desktop notifications for custom-player and web-session tracks.
- Persistent app settings.
- Local metadata, artwork, and offline audio cache.
- Compact table UI with resizable columns, optional sidebar, artwork, widget dock, queue, and status bar.
- Right-click menus on track rows.
- Live JSON theme reloading from a customization folder.
- Drag-reorderable and vertically resizable widget dock with waveform, spectrum, spectrogram, and oscilloscope panels.
- Live declarative JSON widgets from the customization folder.
- Live renderer extensions from `scripts/*.js` and custom styles from `styles/*.css`.

## Setup

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Prebuilt Windows, macOS, and Linux packages are published on the [GitHub Releases page](https://github.com/transparentlyok/auralis/releases). Release artifacts are currently unsigned, so Windows SmartScreen and macOS Gatekeeper may warn on first launch.

Build the app:

```bash
npm run build
```

Create desktop packages:

```bash
npm run dist
```

Run tests:

```bash
npm test
```

## Playback Modes

- **Web** is the default browser bridge. SoundCloud stays hidden during normal use; click **Web Login** only when the account session needs authentication.
- **API** uses the compact native tables, custom queue, and custom audio player. It requires optional SoundCloud developer credentials.
- **Mock** exercises the native player and customization system entirely offline.

## Optional API Authentication

Web mode does not require API credentials. Only configure these values if you specifically want the structured API mode. Do not commit credentials.

1. Register a SoundCloud app.
2. Add this redirect URI to the app:

```text
http://127.0.0.1:42871/soundcloud/callback
```

3. Either set environment variables before launching:

```bash
SOUNDCLOUD_CLIENT_ID=your_client_id
SOUNDCLOUD_CLIENT_SECRET=your_client_secret
AURALIS_AUTH_PORT=42871
npm run dev
```

On PowerShell:

```powershell
$env:SOUNDCLOUD_CLIENT_ID="your_client_id"
$env:SOUNDCLOUD_CLIENT_SECRET="your_client_secret"
$env:AURALIS_AUTH_PORT="42871"
npm run dev
```

You can also save credentials inside the app under Customize. They are encrypted with the operating system through Electron `safeStorage`.

SoundCloud may restrict new developer-app registration. This does not affect Web mode. SoundCloud treats API clients as confidential, so API mode needs a client secret for token exchange; Auralis never hardcodes it.

## Mock/Fallback Mode

If API credentials are missing, expired, or unavailable, API searches fall back to mock data. Mock playback uses a Web Audio tone engine so the player, queue, seek, repeat, shuffle, notifications, and UI customization can be tested without network access.

Use the Web/API/Mock segmented control in the search toolbar to switch modes.

## Windows Packaging Note

`npm run dist` creates the normal installer. On Windows machines that cannot extract symbolic links from electron-builder's signing helper, enable Windows Developer Mode or run an elevated terminal. An unsigned unpacked test build can be produced without that helper:

```powershell
.\node_modules\.bin\electron-builder.cmd --dir --config.win.signAndEditExecutable=false
```

## Customization

On first launch, Auralis creates a customization folder in the app user-data directory:

```text
customization/
  config.json
  themes/
  widgets/
  scripts/
  styles/
```

Open it from the folder button in the top toolbar. Drop JSON themes into `themes/`; Auralis watches the folder and reloads themes live. Font size, table row height, sidebar/artwork/queue widths, panel visibility, density, and widget-dock height can also be tuned live under **Customize**.

The Widget Dock is configured under **Customize**. Panels can be added, hidden, reordered, resized vertically, and cycled between one, two, or three columns. Built-in panels include Waveform, Spectrum, Spectrogram, Oscilloscope, and Lyrics. The Lyrics panel uses LRCLIB, follows synchronized timestamps when available, and falls back to plain lyrics.

Drop declarative widget files into `widgets/`. They reload live and can use current playback fields without executing arbitrary desktop code:

```json
{
  "id": "now-playing-details",
  "name": "Now Playing Details",
  "template": "{{track.title}}\n{{track.artist}}\n{{playback.elapsed}} / {{playback.duration}}",
  "defaultSpan": 1,
  "defaultHeight": 92,
  "style": {
    "fontFamily": "var(--font-mono)",
    "whiteSpace": "pre-line",
    "padding": "8px"
  }
}
```

Available template fields are `track.title`, `track.artist`, `track.genre`, `track.duration`, `playback.elapsed`, `playback.duration`, and `playback.volume`. Example widgets live in `examples/widgets/`.

Trusted JavaScript extensions and CSS overrides reload live from `scripts/` and `styles/`. JavaScript runs in the isolated renderer and cannot directly access Node or the filesystem. See [Extension Authoring](docs/extensions.md) for the API, lifecycle, security model, tokens, and examples.

See [Platform Builds](docs/platforms.md) for macOS, Linux, and Windows packaging notes.

### Audio Quality

**Best Available** waits briefly for the signed-in browser authorization, refetches the full track, then prefers SoundCloud `hq` transcodings and HLS/AAC playback where the account exposes them. **Prefer High** uses the same quality-first ranking. **Standard MP3** prefers the progressive MP3 transcoding. Tracks and accounts without an `hq` entitlement still fall back to SoundCloud's best available standard stream; Auralis cannot manufacture a bitrate that SoundCloud does not return.

Use the row `...` menu to download a track into Auralis's private offline cache. Offline copies appear in the sidebar's **Offline** view and are removed from the same menu. This is app playback storage, not a general-purpose file exporter.

Theme files are JSON:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "colors": {
    "background": "#101010",
    "surface": "#171717",
    "surfaceAlt": "#222222",
    "text": "#f4f4f4",
    "textMuted": "#999999",
    "border": "#333333",
    "accent": "#ff5500",
    "selected": "#2a3b4c"
  },
  "fonts": {
    "ui": "\"Segoe UI\", sans-serif",
    "mono": "\"Cascadia Mono\", monospace",
    "size": "12px"
  },
  "spacing": {
    "row": "24px"
  },
  "borders": {
    "radius": "2px",
    "width": "1px"
  }
}
```

Built-in themes:

- Classic Foobar
- Dark Compact
- Modern SoundCloud
- Minimal
- Graphite Red
- Studio Light
- Windows 98
- Terminal Amber
- High Contrast

Example theme files live in `themes/`, and an example user config lives in `examples/user-config.json`.

## Project Structure

```text
src/main/       Electron main process: web session, auth, API, cache, IPC, media keys
src/preload/    Secure bridge exposed to the renderer
src/renderer/   React UI, playback hook, panels, theme application
src/shared/     Shared types, theme validation, queue logic, mock data
themes/         Built-in editable theme examples
examples/       Example user config
tests/          Vitest logic tests
```

## Notes And Limitations

- Web mode follows the same availability, ads, subscriptions, and regional restrictions as SoundCloud's website.
- Region-restricted `SNIP` tracks are labeled as previews. Auralis does not route around SoundCloud licensing restrictions.
- SoundCloud can block embedded browser sessions or flagged IP addresses. Auralis does not bypass anti-bot challenges.
- Some API-mode tracks are blocked, geo-restricted, previews only, or unavailable off platform. Auralis reports those playback errors and keeps the queue usable.
- If an access token expires, Auralis refreshes it and stores the new single-use refresh token.
- Media keys can be reserved by the OS or another player. Auralis registers Electron global shortcuts and also uses the Media Session API in the renderer.
- The extension system is intentionally minimal in v1. `window.auralisPluginApi` exposes panel and command registration placeholders so custom panels/widgets can be added without changing the main architecture.
