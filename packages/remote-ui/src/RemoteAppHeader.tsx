import type { CSSProperties, ReactNode } from 'react'
import { RemoteLink } from './RemoteLink'

export type RemoteAppHeaderProps = {
  title?: ReactNode
  actions?: ReactNode
  backHref?: string
  onBack?: () => boolean | void
  className?: string
  style?: CSSProperties
}

export function RemoteAppHeader({
  title,
  actions,
  backHref = '/',
  onBack,
  className,
  style,
}: RemoteAppHeaderProps) {
  return (
    <header className={`remote-app-shell__header remote-app-header${title != null && title !== false ? ' remote-app-header--with-title' : ''}${className ? ` ${className}` : ''}`} style={style}>
      <RemoteLink className="remote-app-shell__brand" href={backHref} aria-label="Kiosk home" onClick={(event) => {
        if (!onBack || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        onBack()
      }}>
        <span className="remote-app-shell__brand-mark" aria-hidden="true">K</span>
        <span>KIOSK</span>
      </RemoteLink>
      {title != null && title !== false && <div className="remote-app-header__title">{title}</div>}
      {actions != null && actions !== false && <div className="remote-app-header__actions" role="group" aria-label="App actions">{actions}</div>}
    </header>
  )
}