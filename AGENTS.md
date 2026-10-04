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
