import type { ReactNode } from 'react'
import { RemoteAppHeader } from './RemoteAppHeader'
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
  headerTitle?: ReactNode
  headerActions?: ReactNode
  headerClassName?: string
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
  headerTitle = title,
  headerActions,
  headerClassName,
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
        <RemoteAppHeader
          title={headerTitle != null && headerTitle !== false ? <h1 id="remote-app-title">{headerTitle}</h1> : undefined}
          actions={headerActions}
          className={headerClassName}
          backHref={backHref}
          onBack={onBack ? handleBack : undefined}
        />

        <main className="remote-app-shell__main" aria-labelledby="remote-app-title">
          {headerTitle == null || headerTitle === false ? (
            <section className="remote-app-shell__intro" aria-labelledby="remote-app-title">
              <p className="remote-app-shell__category">{category}</p>
              <h1 id="remote-app-title">{title}</h1>
              {description && <p className="remote-app-shell__description">{description}</p>}
            </section>
          ) : description && <p className="remote-app-shell__description">{description}</p>}
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