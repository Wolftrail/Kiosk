# Repository Guidance

## Project Structure

- This repository is an npm workspace. Keep the kiosk in the repository root, independent apps under `apps/<name>/`, and shared UI in `packages/`.
- Apps should remain independently runnable and build into the root `dist/apps/<name>/` tree.
- Keep each app's Vite `base`, output directory, root Vite proxy, and kiosk launch URL in `src/apps/registry.ts` aligned.
- Do not duplicate shared app framing or remote-navigation behavior inside individual apps when `@kiosk/remote-ui` already provides it.

## App UI and Remote Input

- Use `RemoteAppShell` from `@kiosk/remote-ui` for standard app pages. Import `@kiosk/remote-ui/styles.css` in the app entry point.
- Keep app-specific content and theme choices local to each app; the shared shell owns the common full-screen frame, Kiosk navigation, and remote focus behavior.
- For custom layouts, use `RemoteNavigationProvider`, `RemoteButton`, and `RemoteLink` as appropriate. The controls are intentionally unstyled; keep visual styling with the app that owns the UI.
- Preserve native button and link semantics so Enter/Space activation and browser accessibility continue to work.

## Validation

- Install dependencies from the repository root with `npm install`.
- Run `npm run dev:all` to develop the kiosk and all apps on the shared origin.
- Run `npm run build` to type-check/build the kiosk and every app.
- Run `npm run lint` after source changes.
