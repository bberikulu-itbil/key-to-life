// Interface language. Kazakh is the source text; en/tr/ru dictionaries are keyed by it and loaded
// before the app's modules run (main.tsx), so module-level labels are translated too.
export type Lang = 'kk' | 'en' | 'tr' | 'ru'
export const LANGS: [Lang, string][] = [['kk', 'Қазақша'], ['en', 'English'], ['tr', 'Türkçe'], ['ru', 'Русский']]

const isLang = (v: unknown): v is Lang => LANGS.some(([l]) => l === v)
const saved = (): Lang | null => { try { const v = localStorage.getItem('lang'); return isLang(v) ? v : null } catch { return null } }
// the language of the person's Telegram app, when opened as a Mini App
const tgLang = () => {
  const c = (globalThis as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.slice(0, 2)
  return isLang(c) ? c : null
}

/** null until the person picks a language on this device */
export const chosen = saved()
export const lang: Lang = chosen ?? tgLang() ?? 'kk'

let dict: Record<string, string> = {}
export async function loadLang() {
  document.documentElement.lang = lang
  if (lang !== 'kk') dict = (await import(`../i18n/${lang}.json`)).default
}

/** Translate Kazakh source text; {0}, {1}… are filled from the arguments (null/false → empty). */
export function tx(s: string, ...v: unknown[]) {
  const out = dict[s] || s
  return v.length ? out.replace(/\{(\d+)\}/g, (_, i) => { const x = v[+i]; return x == null || x === false ? '' : String(x) }) : out
}

// notification titles come from the database: an exact text, or a known start followed by a name or title
const STARTS = ['Сіз енді қатысушысыз: ', 'Ұсынысыңызға жауап: ', 'Рұқсат сұрауы · сынып жетекшісі ', 'Сабақтан сұрану ']
export function txTitle(s: string) {
  if (dict[s]) return dict[s]
  const p = STARTS.find((x) => s.startsWith(x))
  return p ? tx(p) + s.slice(p.length) : s
}

/** Saves the choice and reloads, so every label (module constants included) is rebuilt in the new language. */
export function rememberLang(l: Lang) {
  try { localStorage.setItem('lang', l) } catch { /* storage blocked: the choice cannot be kept */ }
}
export function setLang(l: Lang) {
  rememberLang(l)
  location.reload()
}
