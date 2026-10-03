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
