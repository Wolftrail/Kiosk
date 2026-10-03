import { RemoteAppShell } from '@kiosk/remote-ui'

function App() {
  return (
    <RemoteAppShell
      title="Bible"
      category="READING"
      description="Read, search, and follow along with Scripture."
      theme="bible"
    >
      <p className="remote-app-shell__placeholder">This project is ready for development.</p>
    </RemoteAppShell>
  )
}

export default App
