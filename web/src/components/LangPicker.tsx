import { LANGS, lang, setLang, type Lang } from '../lib/i18n'
import { setMyLang } from '../lib/api'

/** Saves the language on the account too (signed in), so the Telegram bot writes in it. */
export const pickLang = async (l: Lang, signedIn: boolean) => {
  if (signedIn) await setMyLang(l).catch(() => {})
  setLang(l)
}

export function LangChips({ signedIn }: { signedIn: boolean }) {
  return (
    <div role="radiogroup" aria-label="Тіл · Language" className="grid grid-cols-4 gap-1 bg-surface-2 rounded-md p-1">
      {LANGS.map(([l, name]) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} lang={l} onClick={() => l !== lang && pickLang(l, signedIn)}
          className={`min-h-10 rounded-sm text-sm font-semibold ${lang === l ? 'bg-accent text-on-accent shadow-card' : 'text-muted'}`}>{name}</button>
      ))}
    </div>
  )
}

/** First visit on this device (Telegram included): ask once, in every language. */
export function FirstRunLang({ signedIn }: { signedIn: boolean }) {
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm grid gap-4">
        <h1 className="text-xl font-bold leading-snug">Тілді таңдаңыз<br /><span className="text-muted font-semibold text-base">Choose language · Dil seçin · Выберите язык</span></h1>
        {LANGS.map(([l, name]) => (
          <button key={l} type="button" lang={l} onClick={() => pickLang(l, signedIn)}
            className={`min-h-14 rounded-lg px-4 text-left text-lg font-semibold border ${lang === l ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>{name}</button>
        ))}
      </div>
    </main>
  )
}
