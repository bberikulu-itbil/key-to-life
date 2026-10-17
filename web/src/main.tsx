import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTelegram } from './lib/telegram'
import { loadLang } from './lib/i18n'

initTelegram()

// the dictionary first, then the app: labels built at module load are translated too
loadLang().catch(() => {}).then(() => import('./App')).then(({ default: App }) =>
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>))
