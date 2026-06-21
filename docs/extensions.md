# Auralis Extension Authoring

Auralis loads trusted JavaScript and CSS from its live customization folder:

```text
customization/
  scripts/*.js
  styles/*.css
  themes/*.json
  widgets/*.json
```

Open this folder from Auralis using the folder button. Changes reload automatically. Files larger than 512 KB are ignored.

## Security Model

Custom scripts run as browser modules in the context-isolated renderer. They do not receive Node.js, `require`, Electron internals, or direct filesystem access. They can access the DOM, browser APIs, `window.auralisPluginApi`, and the restricted `window.auralis` preload API.

Extensions are code. Only install scripts you trust. A malicious script can alter Auralis's UI and invoke exposed app commands on your behalf.

## Plugin API

```js
const api = window.auralisPluginApi;

api.version;
api.getState();
api.registerCommand('extension.command', () => {});
api.addStyle('extension.style', '.now-title { color: hotpink; }');
api.on('trackchange', ({ track, playback }) => {});
api.on('playback', ({ track, playback }) => {});
api.on('settings', (settings) => {});
```

`addStyle` and `on` return cleanup functions. All extension registrations are cleared before scripts reload.

Events:

- `trackchange`: emitted when the current queue track changes.
- `playback`: emitted as playback time, volume, state, and quality change.
- `settings`: emitted when saved settings change.

## CSS Themes And Overrides

CSS files are inserted after the built-in stylesheet, so normal cascade rules apply. Prefer Auralis tokens:

```css
:root {
  --color-accent: #ff3b30;
  --color-selected: #183a52;
  --font-ui: "Segoe UI", sans-serif;
  --space-row: 24px;
  --border-radius: 2px;
}
```

Useful stable surfaces include `.app-shell`, `.sidebar`, `.track-table`, `.table-row`, `.artwork-panel`, `.widget-dock`, `.widget-panel`, `.player-bar`, `.now-title`, and `.status-bar`.

## Example Script

```js
const api = window.auralisPluginApi;
const removeStyle = api.addStyle('example-playing', `
  .app-shell[data-extension-playing="true"] .now-title {
    color: var(--color-accent);
  }
`);

api.on('playback', ({ playback }) => {
  document.querySelector('.app-shell')?.setAttribute(
    'data-extension-playing',
    String(Boolean(playback?.playing)),
  );
});
```

## Declarative Widgets

Use `widgets/*.json` when markup and text substitution are sufficient. JSON widgets are safer and easier to share than JavaScript. Use scripts for behavior, event handling, or coordinated DOM changes.

Widget schema:

```json
{
  "id": "playback-details",
  "name": "Playback Details",
  "version": "1.0.0",
  "author": "Your Name",
  "template": "{{track.title}}\n{{track.artist}}\n{{playback.elapsed}} / {{playback.duration}}",
  "defaultSpan": 1,
  "defaultHeight": 100,
  "style": {
    "fontFamily": "var(--font-mono)",
    "padding": "8px",
    "whiteSpace": "pre-line"
  }
}
```

Supported fields are `track.title`, `track.artist`, `track.genre`, `track.duration`, `playback.elapsed`, `playback.duration`, and `playback.volume`. `defaultSpan` accepts `1`, `2`, or `3`; heights are clamped between 58 and 360 pixels.

## JSON Themes

Themes live in `themes/*.json` and reload without restarting:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "author": "Your Name",
  "density": "compact",
  "colors": {
    "background": "#101214",
    "surface": "#171a1d",
    "surfaceAlt": "#22262a",
    "text": "#f4f4f4",
    "textMuted": "#9ca3aa",
    "border": "#343a40",
    "accent": "#ff5500",
    "selected": "#28445a"
  },
  "fonts": {
    "ui": "Segoe UI, sans-serif",
    "mono": "Cascadia Mono, monospace",
    "size": "12px"
  },
  "spacing": { "row": "24px", "panel": "8px" },
  "borders": { "radius": "2px", "width": "1px" }
}
```

Theme IDs must contain only letters, numbers, dashes, or underscores. The required color fields are `background`, `surface`, `surfaceAlt`, `text`, `textMuted`, `border`, `accent`, and `selected`.

## Current Limits

- JavaScript extensions cannot import Node packages.
- Registered commands are available to other extensions, but Auralis does not yet expose a command-palette UI.
- `registerPanel` is reserved for the future panel SDK; use JSON widgets for dock panels today.
