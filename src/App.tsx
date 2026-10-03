import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { RemoteButton, RemoteLink, RemoteNavigationProvider } from '@kiosk/remote-ui'
import { appCatalog, type KioskApp } from './apps/registry'
import './App.css'

const today = new Intl.DateTimeFormat('en', {
  weekday: 'long', month: 'long', day: 'numeric',
}).format(new Date())
const formatClock = () => new Intl.DateTimeFormat('en', {
  hour: 'numeric', minute: '2-digit',
}).format(new Date())
const initialClock = formatClock()

function AppTile({ app, onSetup }: { app: KioskApp; onSetup: (app: KioskApp) => void }) {
  const Icon = app.icon
  const content = (
    <>
      <span className="app-tile__topline">
        <span className="app-tile__category">{app.category}</span>
        <span className="app-tile__status">{app.url ? 'READY' : 'IN SETUP'}</span>
      </span>
      <span className={`app-tile__art app-tile__art--${app.id}`} aria-hidden="true">
        {app.id === 'workout' ? (
          <span className="workout-clock"><strong>07</strong><small>MINUTES</small></span>
        ) : (
          <span className="app-tile__icon"><Icon size={76} strokeWidth={1.55} /></span>
        )}
        {app.id === 'workout' && <Icon className="workout-dumbbell" size={58} strokeWidth={1.5} />}
      </span>
      <span className="app-tile__bottomline">
        <span className="app-tile__copy">
          <strong className="app-tile__name">{app.name}</strong>
          <span className="app-tile__description">{app.description}</span>
        </span>
        <span className="app-tile__launch" aria-hidden="true"><ArrowUpRight size={25} /></span>
      </span>
    </>
  )

  return app.url ? (
    <RemoteLink className={`app-tile app-tile--${app.tone}`} href={app.url} aria-label={`Open ${app.name}`}>
      {content}
    </RemoteLink>
  ) : (
    <RemoteButton className={`app-tile app-tile--${app.tone}`} onClick={() => onSetup(app)} aria-label={`Open ${app.name}`}>
      {content}
    </RemoteButton>
  )
}

function App() {
  const [selectedApp, setSelectedApp] = useState<KioskApp | null>(null)
  const [clock, setClock] = useState(initialClock)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setClock(formatClock()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedApp) {
      document.querySelector<HTMLButtonElement>('.setup-modal__return')?.focus()
      return
    }

    previousFocus.current?.focus()
    previousFocus.current = null
  }, [selectedApp])

  const openSetup = (app: KioskApp) => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSelectedApp(app)
  }

  const handleBack = () => {
    if (!selectedApp) return false
    setSelectedApp(null)
    return true
  }

  return (
    <RemoteNavigationProvider initialFocusSelector=".app-tile" onBack={handleBack}>
    <div className="kiosk-shell">
      <header className="kiosk-header">
        <RemoteLink className="kiosk-brand" href="#home" aria-label="Kiosk home">
          <span className="kiosk-brand__mark">K</span>
          <span>KIOSK</span>
        </RemoteLink>
        <div className="kiosk-datetime">
          <time className="kiosk-time">{clock}</time>
          <time className="kiosk-date">{today}</time>
        </div>
      </header>

      <main className="kiosk-main" id="home">
        <section className="home-intro" aria-labelledby="home-title">
          <p className="home-intro__eyebrow"><span /> YOUR HOME SCREEN</p>
          <h1 id="home-title">What would you like to do?</h1>
          <p className="home-intro__description">Pick a place to begin.</p>
        </section>

        <section className="app-grid" aria-label="Choose an app">
          {appCatalog.map((app) => <AppTile key={app.id} app={app} onSetup={openSetup} />)}
        </section>
      </main>

      <footer className="kiosk-footer">
        <span>READY WHEN YOU ARE</span>
        <span>{appCatalog.length.toString().padStart(2, '0')} APPS</span>
      </footer>

      {selectedApp && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedApp(null) }}>
          <section className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <RemoteButton className="setup-modal__close" aria-label="Close dialog" onClick={() => setSelectedApp(null)}><X size={25} /></RemoteButton>
            <div className={`setup-modal__icon setup-modal__icon--${selectedApp.tone}`}>
              {renderIcon(selectedApp.icon)}
            </div>
            <p className="setup-modal__eyebrow">COMING SOON</p>
            <h2 id="modal-title">{selectedApp.name}</h2>
            <p className="setup-modal__description">This app is being prepared for the kiosk.</p>
            <div className="setup-modal__path"><span>PROJECT</span><code>{selectedApp.projectPath}</code></div>
            <RemoteButton className="setup-modal__return" data-remote-initial="" onClick={() => setSelectedApp(null)}>Return to apps</RemoteButton>
          </section>
        </div>
      )}
    </div>
    </RemoteNavigationProvider>
  )
}

function renderIcon(Icon: LucideIcon) {
  return <Icon size={48} strokeWidth={1.6} />
}

export default App
