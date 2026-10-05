import type { ReactNode } from 'react'
import { RemoteLink } from './RemoteLink'
import { RemoteNavigationProvider } from './RemoteNavigationProvider'

export type RemoteAppTheme = 'jukebox' | 'workout' | 'scripture' | 'recite'

export type RemoteAppShellProps = {
  title: string
  category: string
  description?: string
  theme: RemoteAppTheme
  children: ReactNode
  backHref?: string
  onBack?: () => boolean | void
  initialFocusSelector?: string
}

export function RemoteAppShell({
  title,
  category,
  description,
  theme,
  children,
  backHref = '/',
  onBack,
  initialFocusSelector = '.remote-app-shell__brand',
}: RemoteAppShellProps) {
  const handleBack = () => {
    if (onBack) return onBack()
    window.location.assign(backHref)
    return true
  }

  return (
    <RemoteNavigationProvider
      className="remote-app-shell__navigation"
      initialFocusSelector={initialFocusSelector}
      onBack={handleBack}
    >
      <div className="remote-app-shell" data-theme={theme}>
        <header className="remote-app-shell__header">
          <RemoteLink className="remote-app-shell__brand" href={backHref} aria-label="Kiosk home">
            <span className="remote-app-shell__brand-mark" aria-hidden="true">K</span>
            <span>KIOSK</span>
          </RemoteLink>
        </header>

        <main className="remote-app-shell__main">
          <section className="remote-app-shell__intro" aria-labelledby="remote-app-title">
            <p className="remote-app-shell__category">{category}</p>
            <h1 id="remote-app-title">{title}</h1>
            {description && <p className="remote-app-shell__description">{description}</p>}
          </section>
          <div className="remote-app-shell__content">{children}</div>
        </main>

        <footer className="remote-app-shell__footer">
          <span>KIOSK</span>
          <span>{category}</span>
        </footer>
      </div>
    </RemoteNavigationProvider>
  )
}