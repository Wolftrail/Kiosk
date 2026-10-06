# Repository Guidance

## Project Structure

- This repository is an npm workspace. Keep the kiosk in the repository root, independent apps under `apps/<name>/`, and shared UI in `packages/`.
- Apps should remain independently runnable and build into the root `dist/apps/<name>/` tree.
- Keep each app's Vite `base`, output directory, root Vite proxy, and kiosk launch URL in `src/apps/registry.ts` aligned.
- Do not duplicate shared app framing or remote-navigation behavior inside individual apps when `@kiosk/remote-ui` already provides it.

## Shared Runtime Storage

- Resolve editable server data through `storage.ts` and `storagePath`, not app-relative paths or the working directory. `KIOSK_DATA_DIR` overrides the root; the default is the ignored repository `data/` directory. Production uses `/opt/kiosk/shared/data`, linked into each release.
- Keep data namespaced by owner: `kiosk/schedules.json`, `recite/library.json`, and Jukebox's `jukebox/library.json`, `jukebox/tags.json`, `jukebox/videos/`, and `jukebox/staging/`. Extend the shared resolver when adding another app with server persistence.
- Never commit or package editable libraries, schedules, downloaded media, backups, or temporary save files. Do not put runtime data in `public/` or `dist/`. Shipped read-only Scripture datasets and Workout assets remain with their apps.
- Browser state is separate: durable preferences/progress use `localStorage`; temporary playback/return state uses `sessionStorage`. Preserve existing keys unless a separately tested browser-state migration is needed. Server backups do not include browser state.
- Use atomic saves and honor the resolver's real path. Migration 1 retains flat schedule/Recite backing files with canonical compatibility links; renaming over a link rather than its resolved target would split old/new releases' data. Keep compatibility paths during the rollback window.

## App Data Migrations

- Add storage-layout or persisted-schema migrations to `scripts/migrate-storage.ts`; do not silently move or rewrite user data in app startup or builds. Keep supported-version checks in the migration and resolver aligned, and reject unsupported newer data.
- Stop all kiosk/app writers before migration. Local commands are `npm run storage:migrate` followed by `npm run storage:check`. Production migration runs as the service user with `KIOSK_DATA_DIR=/opt/kiosk/shared/data` and `KIOSK_LEGACY_ROOT=/opt/kiosk/shared`.
- Migrations must be versioned, repeatable, resumable after interruption, and protected against concurrent execution. Validate metadata and referenced media before writing the version marker. Refuse conflicting destinations or unexpected links rather than overwriting or merging them.
- Preserve metadata backups and rollback-compatible live paths without duplicating large media collections. Roll back code, not automatically to stale data snapshots. Incompatible schema changes require an explicit rollback/recovery policy; snapshots alone are not a complete media backup.
- Update `scripts/install-auto-updates.sh`, `scripts/kiosk-update.sh`, and `.github/workflows/release.yml` together when changing migration dependencies, data paths, or health checks. Packaged runtime imports must work without workspace dependencies. `GET /api/health` validates storage without exposing content or requiring management credentials.
- Test with temporary directories, never the user's real libraries. Cover repeated/interrupted runs, conflicts, live/dead locks, unsupported versions, atomic saves through compatibility paths, and missing media. Run `npm test` for migration/API/extracted-runtime tests and the full workspace suite for app regressions. Validate deployment scripts with `bash -n`; actual systemd activation/rollback needs Linux validation.
- Keep operational backup, migration, platform-permission, and rollback instructions in `README.md` aligned with implementation. Do not remove an active migration lock or bypass Windows symlink permissions/cross-filesystem safeguards.

## App UI and Remote Input

- Use `RemoteAppShell` from `@kiosk/remote-ui` for standard app pages. Import `@kiosk/remote-ui/styles.css` in the app entry point.
- Keep app-specific content and theme choices local to each app; the shared shell owns the common full-screen frame, Kiosk navigation, and remote focus behavior.
- For custom layouts, use `RemoteNavigationProvider`, `RemoteButton`, and `RemoteLink` as appropriate. The controls are intentionally unstyled; keep visual styling with the app that owns the UI.
- Preserve native button and link semantics so Enter/Space activation and browser accessibility continue to work.

## Screen-Filling Layouts: No Main-Screen Scrolling

- The kiosk and every app must fill the available viewport without horizontal or vertical page scrolling. Main screens, including start, active, paused, empty, and completion states, must keep their content and primary controls visible at once. Treat this as a requirement from the first implementation, not a final styling adjustment.
- This regression occurred in both Jukebox and Workout: the shared shell's `min-height: 100dvh` sets a minimum, not a maximum. Content, fixed image heights, margins, padding, and non-shrinking flex children can still expand the page beyond the screen. A layout that fits at 1920x1080 may overflow in a shorter window or at browser zoom.
- Bound the app frame to `height: 100dvh` and constrain the shell/navigation wrappers to that height. In the content chain, use shrinking flex children such as `flex: 1 1 0` with `min-height: 0` and `min-width: 0`, or grid tracks with `minmax(0, 1fr)`. Reserve space for the header and footer; let the main content use only the remaining space. Keep overrides scoped to the owning app unless intentionally changing the shared shell contract.
- Fit content into that space with responsive grid tracks, constrained media dimensions, and compact layouts for shorter screens. If a fixed composition needs fitting, Workout's `workout-fit-viewport` / `workout-fit-content` uses `ResizeObserver` to scale against the available space after resizing, asset loading, and state changes. Prefer responsive layout first; avoid shrinking text and remote targets unnecessarily.
- Do not fix overflow only by hiding it: `overflow: hidden` or `overflow: clip` is a frame boundary, not proof that content fits. Verify that text, media, focus outlines, and every primary control remain inside the visible area. Remote navigation calls `scrollIntoView`, so focus changes must not move the page or crop controls.
- Scrolling is allowed only inside deliberately bounded secondary surfaces, such as a long library list, filter menu, or dialog. It must not expand the main screen or introduce document scrolling.

## Validation

- Install dependencies from the repository root with `npm install`.
- Run `npm run dev:all` to develop the kiosk and all apps on the shared origin.
- Run `npm run build` to type-check/build the kiosk and every app.
- Run `npm run lint` after source changes.
- For app layout changes, use browser checks and screenshots at 1280x720, 1920x1080, and a smaller landscape window such as 1000x600. Also check narrow viewports if supported. Test all main-screen states and long labels, not only the initial screen.
- Assert `document.documentElement.scrollHeight <= window.innerHeight` and `document.documentElement.scrollWidth <= window.innerWidth`. Also check visible content/control bounds to catch clipping that overflow suppression hides. Exercise arrow-key focus and Enter/Back navigation; the document scroll position must remain zero.
