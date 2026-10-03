import { RemoteAppShell } from '@kiosk/remote-ui'

function App() {
  return (
    <RemoteAppShell
      title="Jukebox"
      category="MEDIA"
      description="Browse and play music videos together."
      theme="jukebox"
    >
      <p className="remote-app-shell__placeholder">This project is ready for development.</p>
    </RemoteAppShell>
  )
}

export default App
