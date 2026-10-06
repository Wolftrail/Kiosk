import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { RemoteButton, RemoteLink, RemoteNavigationProvider } from '@kiosk/remote-ui'
import { appCatalog, type KioskApp } from './apps/registry'
import './Home.css'
import Management from './management/Management'

const today = new Intl.DateTimeFormat('en', {
  weekday: 'long', month: 'long', day: 'numeric',
}).format(new Date())
const formatClock = () => new Intl.DateTimeFormat('en', {
  hour: 'numeric', minute: '2-digit',
}).format(new Date())
const initialClock = formatClock()
const appArtwork: Record<string, string> = {
  recite: '/images/recite.jpg',
  jukebox: '/images/jukebox.jpg',
  workout: '/images/workout.jpg',
  scripture: '/images/scripture.jpg',
}

function AppTile({ app, onSetup }: { app: KioskApp; onSetup: (app: KioskApp) => void }) {
  const Icon = app.icon
  const content = (
    <>
      <span className="app-tile__topline">
        <span className="app-tile__category">{app.category}</span>
        {!app.url && <span className="app-tile__status">IN SETUP</span>}
      </span>
      <span className={`app-tile__art app-tile__art--${app.id}`} aria-hidden="true">
        <img className="app-tile__image" src={appArtwork[app.id]} alt="" />
        <span className="app-tile__icon"><Icon size={76} strokeWidth={1.55} /></span>
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

function Home() {
  const [selectedApp, setSelectedApp] = useState<KioskApp | null>(null)
  const [clock, setClock] = useState(initialClock)
  const [version, setVersion] = useState('...')
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setClock(formatClock()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/version', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Version request failed')
        return response.json() as Promise<{ version?: string }>
      })
      .then((data) => setVersion(data.version || 'dev'))
      .catch(() => {
        if (!controller.signal.aborted) setVersion('dev')
      })
    return () => controller.abort()
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
          <h1 id="home-title">Make yourself at home.</h1>
        </section>

        <section className="app-grid" aria-label="Choose an app">
          {appCatalog.map((app) => <AppTile key={app.id} app={app} onSetup={openSetup} />)}
        </section>
      </main>

      <footer className="kiosk-footer">
        <span className="kiosk-footer__status"><span aria-hidden="true" />READY WHEN YOU ARE</span>
        <span className="kiosk-footer__version" aria-label={`Kiosk version ${version}`}>KIOSK {version}</span>
        <span className="kiosk-footer__apps">{appCatalog.length.toString().padStart(2, '0')} APPS</span>
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

export default function App() {
  return /^\/manage\/?$/.test(window.location.pathname) ? <Management /> : <Home />
}
