import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '@kiosk/remote-ui'
import '@kiosk/remote-ui/styles.css'
import App from './App'
import './App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><ToastProvider><App /></ToastProvider></StrictMode>,
)