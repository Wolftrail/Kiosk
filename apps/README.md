# App Projects

Each subdirectory is an independent React/TypeScript npm workspace with its own entry point and Vite config. Keep app-specific source and assets inside that app; keep the kiosk shell in the repository root.

Use `RemoteAppShell` from `@kiosk/remote-ui` for the shared full-screen frame, Kiosk branding, Back link, and remote navigation. Import `@kiosk/remote-ui/styles.css` in `src/main.tsx`. The shell accepts app-specific title, category, description, and theme props; keep app content in its children. For custom layouts, the unstyled `RemoteButton`, `RemoteLink`, and `RemoteNavigationProvider` exports are available separately.

The initial kiosk catalog reserves destinations for `jukebox`, `workout`, and `bible`.

Use `src/assets/` for imported assets and `public/` for files that need stable paths. The kiosk Vite server proxies app paths to the matching workspace dev server. Run all four projects with `npm run dev:all`, or an individual app with `npm run dev --workspace @kiosk/<name>`.

Each app builds into the root `dist/apps/<name>/` directory with its base path set to `/apps/<name>/`. Keep that base path and the matching URL in `src/apps/registry.ts` aligned when adding an app.
