# Kiosk Style Guide

Keep the kiosk and apps recognizably related without making every screen identical.
Shared conventions live in `@kiosk/remote-ui`; app themes, artwork, and domain layouts
stay with the app that owns them. This is a practical guide, not a separate UI framework.

## Two Contexts

- **TV:** readable at a distance, obvious remote focus, generous primary controls,
  and an immediately usable screen. The launcher can be vivid and expressive.
- **Management:** quieter colors, denser information, native form semantics, and
  efficient mouse/keyboard workflows. Do not copy the launcher's decorative tiles.

## Typography

Import `@kiosk/remote-ui/styles.css` once in every app entry point. It loads the
shared font assets and tokens automatically. A surface that needs typography but
not the shell/reset styles can import `@kiosk/remote-ui/typography.css` instead.

| Token | Family | Use |
| --- | --- | --- |
| `--kiosk-font-ui` | Noto Sans, Noto Sans Thai fallback | Navigation, buttons, headings, forms, status text |
| `--kiosk-font-reading` | Noto Serif, Noto Sans Thai fallback | Scripture passages and flashcard content |
| `--kiosk-font-mono` | Platform monospace | Paths, code, technical identifiers only |

These are self-hosted variable fonts from Fontsource, declared and owned by the
shared package. Vite copies WOFF2 files into each independent app build. There
are no Google Fonts/CDN requests or required system font installations. Unicode
subsets are downloaded by the browser only when their characters are used.
English, Dutch, and Thai are covered; additional scripts need deliberate font
coverage checks. Do not assume the fallback covers every possible language.

The fonts use the SIL Open Font License. Notices are preserved in
`public/font-licenses/noto.txt` and included in the root production build.
Retain this notice when distributing standalone app/font files as well.

Use `font-family: var(--kiosk-font-ui)` or inherit it; do not introduce another
OS-specific font stack in an app. Controls inherit the surrounding font.
Prefer 400 for regular text and 600-700 for emphasis. Use zero letter spacing,
tabular numerals for timers/counters, and normal sentence case for primary labels.

TV sizing starting points, adjusted through explicit layout breakpoints:

| Role | Typical Size |
| --- | --- |
| Primary body/control text | 20-24px |
| App/section headings | 28-42px |
| Launcher headline | 38-58px |
| Reading content | 24-36px, user-adjustable where appropriate |
| Secondary information | 14-18px; smaller only for nonessential metadata |
| Management body text | 14-16px |

Avoid viewport-width-based font sizing. Wrap long labels and reserve space for
them. Paginate long reading/card content instead of making it unreadably small.
Measured text layouts must refit after fonts load, resizing, and content changes.

## Color And Artwork

Keep each app's accent local. The current launcher palette is yellow for Recite,
coral for Jukebox, lime for Workout, and cyan for Scripture on a charcoal frame.
App interiors may use calmer light surfaces. Typography and behavior provide
consistency; identical backgrounds are not required.

Use strong text/background contrast: aim for WCAG AA (4.5:1 for normal text,
3:1 for large text and essential control boundaries). Selected, focused, and
disabled are distinct states. Never rely on color alone to communicate state.

Use Lucide icons for familiar tools. Icon-only controls need an accessible name
and a tooltip. Keep launcher icons in the same frame and size; app artwork may
vary. Bundle artwork locally and record its source/license. Text must remain
legible without darkening the entire screen or depending on an image loading.

## Spacing And Controls

Shared tokens are defined in `packages/remote-ui/src/typography.css`:

- `--kiosk-space-1/2/3/4/6/8`: 4, 8, 12, 16, 24, 32px.
- `--kiosk-radius-control`: 6px. `--kiosk-radius-tile`: 8px.
- `--kiosk-target-tv`: 56px. `--kiosk-target-pointer`: 44px.
- `--kiosk-focus-width`: 3px. `--kiosk-focus-offset`: 4px.

Use these defaults in new/shared styles; do not mechanically replace every
app-specific measurement. Primary TV targets should be at least 56px high;
compact secondary and pointer controls should aim for 44px. Existing dense
management layouts can be improved incrementally rather than forced into TV sizing.

Use buttons for commands, links for navigation, checkboxes/toggles for binary
choices, segmented controls for modes, and menus for option sets. Preserve native
semantics, disabled states, and visible focus. Use cards only for repeated items
or genuinely framed tools, not as wrappers around entire pages or other cards.

## Remote And Layout

Use `RemoteAppShell` for standard app pages. Custom layouts use the shared
`RemoteNavigationProvider`, `RemoteButton`, and `RemoteLink` rather than new
navigation implementations. Arrows move focus; Enter activates native controls;
Space activates native buttons. Back closes the current secondary view or returns
one level. Do not require physical-keyboard shortcuts for a primary TV workflow.

Focus should be predictable on entry and after transitions. Restore it when a
dialog closes; move it to an enabled control if the current control disappears.
Use a visible outline, not just a subtle hover effect. Keep room for outlines
and any focus transforms so they cannot be cropped by the frame.

The main TV screen must fit within `100dvh`: bound the frame, use shrinking flex
children with `min-height: 0`, or grid tracks with `minmax(0, 1fr)`. Reserve header,
footer, and primary-control space. `overflow: hidden` alone is not a fitting strategy.
Only deliberately bounded secondary surfaces such as library lists may scroll.

Use brief 150-250ms transitions and restrained entrance motion. Respect
`prefers-reduced-motion`. Loading, empty, error, paused, and completion screens
must follow the same layout and focus rules as the happy path.

## Validation

Run `npm run build` and `npm run lint` after shared styling changes. Check
1920x1080, 1280x720, 1000x600, and a narrow viewport where supported. Include
long labels, every main-screen state, and a cold font load, not only cached fonts.
Exercise arrows, Enter, and Back, and confirm the document does not move.

Assert document width/height do not exceed the viewport, and separately inspect
text, media, controls, and focus-outline bounds to catch hidden clipping. Verify
the actual font has loaded with `document.fonts`, not just a CSS family string.