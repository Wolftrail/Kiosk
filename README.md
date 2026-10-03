# Commonroom Kiosk

A React and TypeScript launcher for a workspace of focused, independently built apps.

## Run locally

```sh
npm install
npm run dev:all
```

Open `http://localhost:5173/`. The kiosk proxies `/apps/jukebox/`, `/apps/workout/`, and `/apps/bible/` to the app dev servers, so the browser stays on one origin. `npm run dev` starts only the kiosk; `npm run dev --workspace @kiosk/jukebox` starts an individual app.

`npm run build` builds the kiosk and all three apps into one `dist/` tree. `npm run lint` runs Oxlint across the workspace.

On a TV, use the remote's arrow keys to move focus, Enter to activate a control, and Escape or Back to close an app setup dialog.

## Shared remote controls

Use `RemoteAppShell` from `@kiosk/remote-ui` for a full-viewport app frame with shared Kiosk branding, Back navigation, and remote focus handling. Set its title, category, description, and theme; put app-specific UI in its children. Import `@kiosk/remote-ui/styles.css` in the app entry point for the shared layout and viewport reset. For custom screens, `RemoteButton`, `RemoteLink`, and `RemoteNavigationProvider` are also available independently; the controls themselves remain unstyled.

## Add an app

Each app is an independent npm workspace under `apps/`. The kiosk catalog lives in `src/apps/registry.ts`; add the app's name, description, category, icon, project path, and launch URL there.

The initial workspaces are Jukebox, Workout, and Bible. Each builds to `dist/apps/<name>/` and is served under `/apps/<name>/` on the same origin as the kiosk. See `apps/README.md` for the project conventions.

## Project layout

```text
src/                 Kiosk React application
src/apps/registry.ts App directory and launch URL registry
packages/remote-ui/  Shared controls and Bluetooth-remote navigation
apps/jukebox/        Jukebox React/TypeScript workspace
apps/workout/        Workout React/TypeScript workspace
apps/bible/          Bible React/TypeScript workspace
```
