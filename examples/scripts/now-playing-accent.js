const api = window.auralisPluginApi;

api.addStyle('example.now-playing-accent', `
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
