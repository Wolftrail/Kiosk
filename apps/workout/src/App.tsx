import { RemoteAppShell } from '@kiosk/remote-ui'

function App() {
  return (
    <RemoteAppShell
      title="Workout"
      category="FITNESS"
      description="Follow a guided seven-minute workout."
      theme="workout"
    >
      <p className="remote-app-shell__placeholder">This project is ready for development.</p>
    </RemoteAppShell>
  )
}

export default App
