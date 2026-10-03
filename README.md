# Commonroom Kiosk

A React and TypeScript launcher for a workspace of focused, independently built apps.

## Tested platform

The current release of Linux Mint with the Xfce desktop environment is the development platform this product is tested on.

## Run locally

```sh
npm install
npm run dev:all
```

Open `http://localhost:5173/`. The kiosk proxies `/apps/jukebox/`, `/apps/workout/`, and `/apps/bible/` to the app dev servers, so the browser stays on one origin. `npm run dev` starts only the kiosk; `npm run dev --workspace @kiosk/jukebox` starts an individual app.

`npm run build` builds the kiosk and all three apps into one `dist/` tree. `npm run lint` runs Oxlint across the workspace.

## Jukebox downloader requirements

The Jukebox downloader requires the Jukebox Vite server to be running. Install both tools below on the machine running that server, and make them callable from `PATH` before starting `npm run dev:all`:

- [yt-dlp](https://github.com/yt-dlp/yt-dlp), invoked as `yt-dlp`.
- [FFmpeg](https://github.com/BtbN/FFmpeg-Builds/releases), invoked as `ffmpeg`, to merge separate video and audio streams, which is typical for higher resolutions. Download a build matching the server OS and architecture (for example, Linux x86_64 for most Mint PCs or Windows x86_64), then make its `ffmpeg` executable available on `PATH`.

A static build by itself cannot launch the downloader. Downloads are saved locally under `apps/jukebox/public/videos/` and listed in `apps/jukebox/data/library.json`.

Downloads default to H.264/AAC for broad Linux playback compatibility, preferring the best match up to 1440p. If that codec pair is unavailable, the selector falls back to a pre-merged MP4 and then the best available format up to 1440p; actual resolution and codec depend on the source video.
YouTube URLs are normalized to a watch URL containing only the video ID (`?v=...`), dropping playlist, tracking, timestamp, and fragment parameters.

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
