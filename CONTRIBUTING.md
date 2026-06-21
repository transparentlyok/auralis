# Contributing

1. Create a focused branch from `main`.
2. Install dependencies with `npm ci`.
3. Run `npm test`, `npm run typecheck`, and `npm run build` before opening a pull request.
4. Do not commit `.env` files, SoundCloud credentials, login cookies, caches, or packaged builds.

Keep changes focused and include tests for shared logic. Platform-specific playback or packaging changes should state which operating systems were exercised.
