import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTelegram } from './lib/telegram'
import { loadLang } from './lib/i18n'
import Splash from './components/Splash'

initTelegram()
// iOS Safari ignores user-scalable=no: stop the pinch here
addEventListener('gesturestart', (e) => e.preventDefault())

addEventListener('error', (e) => import('./components/Crash').then((m) => m.reportError(e.error ?? e.message)))
addEventListener('unhandledrejection', (e) => import('./components/Crash').then((m) => m.reportError(e.reason)))

// the BIL logo animation plays at once, over the loading app (…/?splash=fly shows the other version)
const splash = document.body.appendChild(document.createElement('div'))
createRoot(splash).render(<Splash kind={new URLSearchParams(location.search).get('splash') === 'fly' ? 'fly' : 'books'} />)

// the dictionary first, then the app: labels built at module load are translated too
const root = createRoot(document.getElementById('root')!)
loadLang().catch(() => {}).then(() => Promise.all([import('./App'), import('./components/Crash')])).then(([{ default: App }, { Crash }]) =>
  root.render(<StrictMode><Crash><App /></Crash></StrictMode>),
  // a cached page asking for files of an older version: load the current one
  () => { if (!sessionStorage.getItem('reloaded')) { sessionStorage.setItem('reloaded', '1'); location.reload() } })
