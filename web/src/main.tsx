import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTelegram } from './lib/telegram'
import { loadLang } from './lib/i18n'

initTelegram()

addEventListener('error', (e) => import('./components/Crash').then((m) => m.reportError(e.error ?? e.message)))
addEventListener('unhandledrejection', (e) => import('./components/Crash').then((m) => m.reportError(e.reason)))

// the dictionary first, then the app: labels built at module load are translated too
const root = createRoot(document.getElementById('root')!)
loadLang().catch(() => {}).then(() => Promise.all([import('./App'), import('./components/Crash')])).then(([{ default: App }, { Crash }]) =>
  root.render(<StrictMode><Crash><App /></Crash></StrictMode>),
  // a cached page asking for files of an older version: load the current one
  () => { if (!sessionStorage.getItem('reloaded')) { sessionStorage.setItem('reloaded', '1'); location.reload() } })
