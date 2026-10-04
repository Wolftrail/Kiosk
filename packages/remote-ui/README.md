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

Available themes are `jukebox`, `workout`, and `bible`. The shell provides the full-viewport layout, common header and footer, Back navigation, initial focus, and D-pad movement. Its children remain app-specific.

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
