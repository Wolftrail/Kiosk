# @kiosk/remote-ui

Shared app framing and keyboard-remote-aware controls for the kiosk workspaces.

For standard app pages, import the shared stylesheet in the app entry point and use `RemoteAppShell`:

```tsx
import { RemoteAppShell } from '@kiosk/remote-ui'

<RemoteAppShell
  title="Jukebox"
  category="MEDIA"
  description="Browse and play music videos together."
  theme="jukebox"
>
  <YourAppContent />
</RemoteAppShell>
```

Available themes are `jukebox`, `workout`, `scripture`, and `recite`. The shell provides the full-viewport layout, common header and footer, Back navigation, initial focus, and D-pad movement. Its children remain app-specific.

## Shared App Header

Every shell uses `RemoteAppHeader` with the app's `title` centered by default.
The header owns the page's `h1`; the main content does not repeat the title or
category. Add `headerActions` and `headerClassName` without replacing the shell,
or override `headerTitle` with a title or current context. Set `headerTitle={null}`
to omit the header title and retain the original content introduction, as Jukebox
does for its immersive layout.

On wider screens, balanced side columns keep the title centered regardless of
the action count. At widths of 760px or less, the title occupies its own row above
navigation and actions. Apps still own compact action layouts at narrow widths.

Standard headers are 76px high with 32px horizontal insets and a 56px-high Kiosk
target containing a 40px logo. Narrow titled headers reserve 120px, with 20px
horizontal insets and a stable 56px navigation row. Longer titles may grow the
header rather than overlap controls. Keep shell frames flush to the viewport and
put app-specific padding on main content and footers, not around the header.
Themes can change colors and surfaces without overriding brand dimensions or
header offsets. Jukebox explicitly keeps its compact overlay geometry.

```tsx
import { RemoteAppShell, RemoteButton } from '@kiosk/remote-ui'
import { Settings } from 'lucide-react'

<RemoteAppShell
  title="My app"
  category="MEDIA"
  theme="jukebox"
  headerActions={
    <RemoteButton aria-label="Settings" title="Settings" onClick={openSettings}>
      <Settings aria-hidden="true" />
    </RemoteButton>
  }
>
  <YourAppContent />
</RemoteAppShell>
```

Actions are ordinary React content: apps own their handlers, state, disabled
conditions, tooltips, and button styling. Use `RemoteButton`/`RemoteLink` so actions
participate in D-pad navigation. Keep the action set compact; use an app-owned
menu for larger sets rather than crowding the header.

Custom layouts can render `RemoteAppHeader` inside their existing
`RemoteNavigationProvider`, using `title`, `actions`, `backHref`, `onBack`,
`className`, and `style`. The header does not mount another navigation provider.
Without `onBack`, the Kiosk link follows `backHref` (default `/`). With `onBack`,
ordinary activation is intercepted and the callback owns navigation, including
confirmation or closing a secondary view. Modified clicks retain native link
behavior. The shell supplies its existing `onBack` callback to the header; capture
handlers that prevent navigation are still respected.

Theme with `--remote-header-color`, `--remote-header-background`,
`--remote-header-border`, `--remote-header-height` (minimum height),
`--remote-header-padding`, `--remote-header-gap`, `--remote-header-action-gap`,
and `--remote-header-title-size`.
The existing `remote-app-shell__header` and brand selectors remain supported.
Reserve enough viewport space for the bar and focus outlines; verify long context
labels and action bounds at the app's supported sizes.

## Scheduled App Lifecycle

`RemoteNavigationProvider` (also used by `RemoteAppShell`) owns schedule reminders
and return navigation. Apps may independently opt into startup and completion
handling; neither hook is required. Without either hook an app opens normally and
stays open until the user leaves. Further reminders detected during a scheduled visit
or an open dialog are persisted and delivered one at a time afterward, with a fixed
expiry at the next local midnight. Explicit ten-minute snoozes can cross midnight.
Disabled or deleted schedules lose their pending reminders.

```tsx
import { useState } from 'react'
import { getScheduledLaunch, finishScheduledApp } from '@kiosk/remote-ui'

const [launch] = useState(() => getScheduledLaunch('scripture'))

function completeReading() {
  saveReadingProgress()
  finishScheduledApp('scripture')
}
```

`getScheduledLaunch(appId)` returns context only for that app's active scheduled
visit; use it to choose initial app state. `finishScheduledApp(appId)` is a completion
notification, not a navigation helper. It returns false for a normal visit. For a
scheduled visit it emits `kiosk:scheduled-completion`; the shared scheduler consumes
the notification, clears launch state, records the return marker, and navigates to
the interrupted page. Save essential progress before notifying, because navigation
can unload the page before React persistence effects run. Apps decide any completion
screen delay before notifying. Browser navigation away clears abandoned context.

Returning apps can use `isScheduledReturn()` and `consumeScheduledReturn()` to
restore activity. Jukebox uses these to resume only music that was playing before
the interruption, with an ordinary Play action if autoplay is blocked.

## Typography And Style

The shared stylesheet bundles Noto Sans for UI text, Noto Serif for reading
content, and Noto Sans Thai as a Thai-script fallback. Fontsource packages are
dependencies of this package, not of each app. Vite serves their WOFF2 assets
locally in development and includes them in each independent production build.
No external font service or system font installation is needed.

Use `var(--kiosk-font-ui)` for headings, labels, and controls, and
`var(--kiosk-font-reading)` for passages/flashcard text. The shared root sets
the default UI font and form controls inherit it. Technical text can use
`var(--kiosk-font-mono)`. Avoid hard-coded OS font families in app styles.

Import `@kiosk/remote-ui/typography.css` only when you want the font declarations
and tokens without the other shell styles. Normal apps already receive these
through `@kiosk/remote-ui/styles.css`; do not import both.

See the [Kiosk style guide](../../STYLEGUIDE.md) for the TV/management split,
type scale, spacing/target tokens, focus behavior, and validation requirements.

For custom layouts, the unstyled controls are also available independently.

```tsx
import { RemoteButton, RemoteLink, RemoteNavigationProvider } from '@kiosk/remote-ui'

<RemoteNavigationProvider
  initialFocusSelector=".home-action"
  onBack={() => {
    navigateHome()
    return true
  }}
>
  <RemoteButton className="home-action" onClick={start}>Start</RemoteButton>
  <RemoteLink href="/apps/jukebox/">Jukebox</RemoteLink>
</RemoteNavigationProvider>
```

The provider moves focus spatially with arrow keys. Enter and Space retain native button/link activation. It handles Escape, Backspace, GoBack, and BrowserBack only when `onBack` reports that it handled the action. It scopes arrow movement to an open `[role="dialog"]` when one exists.

`RemoteButton` and `RemoteLink` render native controls with a `data-remote-focus` marker. They do not add visual styles; each app owns its layout, colors, and `:focus-visible` treatment.

## Shared Dialogs

`ConfirmationDialog` provides modal framing, initial cancel focus, background inertness,
focus restoration, Tab trapping, and Back dismissal. It supports the usual confirm/cancel
pair plus an optional `secondaryAction` with `label`, `icon`, and `onClick`. Optional
`context` and `icon` props provide a compact header; `confirmIcon` and `cancelIcon` add
action icons. The scheduler uses this same component for No, Snooze, and Yes rather
than maintaining a separate dialog. `className` allows a surface-specific layout while
keeping shared modal behavior.

## Toasts

All current app entry points, including the kiosk, mount `ToastProvider`. Call `useToast()` from any component inside the provider:

```tsx
import { useToast } from '@kiosk/remote-ui'

function SaveButton() {
  const { toast } = useToast()

  async function save() {
    try {
      await saveChanges()
      toast('Changes saved.', { variant: 'success' })
    } catch {
      toast('Could not save changes.', { variant: 'error' })
    }
  }

  return <button onClick={save}>Save</button>
}
```

`toast(message, options)` returns a notification ID. Variants are `info` (default), `success`, `warning`, and `error`. Messages disappear after 5 seconds, or 8 seconds for errors. Set `duration` in milliseconds to override the timeout, or use `duration: 0` for a persistent notification. Timers pause while the toast is hovered or contains keyboard focus. Invalid durations fall back to the variant's default.

Use `dismissToast(id)` to remove a specific notification and `clearToasts()` to remove all notifications. Each toast also has a native dismiss button. At most four messages are displayed; newer messages replace the oldest when the stack is full. Toasts are announced as status messages (errors as alerts), never move focus on arrival, and render in a portal above app content.

For a new app or a custom layout, wrap the app once at its entry point and import the shared stylesheet:

```tsx
import { ToastProvider } from '@kiosk/remote-ui'
import '@kiosk/remote-ui/styles.css'

<ToastProvider>
  <App />
</ToastProvider>
```

Providers are independent. `useToast()` must be called inside a provider; mounting `RemoteAppShell` alone does not provide toasts.

## TV On-Screen Keyboard

`OnScreenKeyboard` provides English QWERTY and Thai Kedmanee layouts in a shared, TV-focused frame. It uses 60px-high keys, large character labels, stable key positions, and a high-contrast D-pad focus highlight. Language, Shift, Space, Backspace, Clear, and the optional return key use native buttons with accessible names and tooltips.

```tsx
import { useRef, useState } from 'react'
import { OnScreenKeyboard } from '@kiosk/remote-ui'

function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  return <form onSubmit={(event) => { event.preventDefault(); onSearch(query) }}>
    <input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} />
    <OnScreenKeyboard
      value={query}
      onChange={setQuery}
      inputRef={inputRef}
      maxLength={200}
      onSubmit={() => inputRef.current?.form?.requestSubmit()}
      submitLabel="Search"
    />
  </form>
}
```

Shift stays active until toggled off and includes each layout's shifted numbers and punctuation. Changing language resets Shift. Thai combining marks display with a dotted circle on the key but insert only the mark.

The optional `inputRef` enables caret insertion and selection replacement for selection-capable inputs such as `text` and `search`. Otherwise, editing happens at the end. The keyboard preserves the editing range while focus stays on its keys. Backspace deletes a selection or one complete grapheme, including attached Thai marks or emoji. `maxLength` follows native UTF-16 input limits and rejects whole insertions that exceed the limit. Empty-field and length-limit edits are no-ops, retaining focus; `disabled` disables the entire keyboard.

The optional `onSubmit` adds a return key named by `submitLabel`. Run the layout and editing tests with `npm test --workspace @kiosk/remote-ui` on a Node version supporting TypeScript stripping.
