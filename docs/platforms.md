# Platform Builds

Auralis is built with Electron and supports Windows, macOS, and Linux at the source level. Packaging must normally run on the target operating system.

## macOS

Run on macOS:

```bash
npm install
npm test
npm run dist
```

Electron Builder produces the configured macOS application package. Distribution outside local testing requires Apple code signing and notarization credentials. Global media-key behavior and persistent SoundCloud login still need validation on Intel and Apple Silicon hardware.

## Linux

Run on Linux:

```bash
npm install
npm test
npm run dist
```

The current targets are AppImage and Debian package. Desktop notifications and media keys depend on the desktop environment and may behave differently across GNOME, KDE, and Wayland sessions.

## Windows

`npm run dist` creates the configured NSIS package. The unpacked development build can be created with:

```powershell
npx electron-builder --dir --config.win.signAndEditExecutable=false
```

The Windows build is the only platform currently smoke-tested in this repository.
