import { useEffect, useState, type FormEvent } from 'react'
import { errText, signIn, supabase, tgLogin } from '../lib/api'
import { inTelegram, tg } from '../lib/telegram'
import { Button, Field, inputCls } from '../components/ui'
import { tx } from '../lib/i18n'
import { LangChips } from '../components/LangPicker'
import Register from './Register'

export default function Login() {
  const [iin, setIin] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(inTelegram)
  const [signup, setSignup] = useState(false)

  // inside Telegram: a linked account signs in by itself
  useEffect(() => {
    if (!inTelegram || !tg) return
    tgLogin(tg.initData)
      .then(async (r) => { if (r.token_hash) { const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' }); if (error) throw error } else setAuto(false) })
      .catch(() => setAuto(false))
  }, [])

  if (signup) return <Register onBack={() => setSignup(false)} />
  if (auto) return <div className="min-h-dvh grid place-items-center text-muted">{tx('Telegram арқылы кіру…')}</div>

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{12}$/.test(iin)) return setErr(tx('ЖСН 12 саннан тұрады'))
    setBusy(true); setErr('')
    try { await signIn(iin, pw) } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  return (
    <main className="min-h-dvh grid grid-rows-[auto_1fr] bg-hero">
      {/* navy hero with the logo; the form sits on a white sheet below */}
      <header className="relative overflow-hidden px-6 pt-[max(40px,env(safe-area-inset-top))] pb-10 text-on-hero">
        <span aria-hidden className="absolute -right-24 -top-24 size-72 rounded-full border border-white/10" />
        <span aria-hidden className="absolute -right-10 top-10 size-44 rounded-full border border-white/10" />
        <div className="relative mx-auto max-w-sm grid gap-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo-192.png`} alt="" className="size-12 rounded-[12px] ring-1 ring-gold/60" />
            <span className="text-xs font-semibold tracking-[0.14em] uppercase text-gold">{tx('Білім-инновация лицейі')}</span>
          </div>
          <h1 className="text-[34px] leading-[40px] font-bold">Key To Life</h1>
          <p className="text-white/80">{tx('Үйірмелер, курстар, жарыстар және олимпиадаға дайындық бір жерде.')}</p>
        </div>
      </header>
      <form onSubmit={submit} className="rounded-t-[28px] bg-surface px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]" noValidate>
        <div className="mx-auto max-w-sm grid gap-5">
          <LangChips signedIn={false} />
          <Field label={tx('ЖСН')} error={err && !/^\d{12}$/.test(iin) ? err : undefined}>
            {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" autoComplete="username" maxLength={12} value={iin}
              onChange={(e) => setIin(e.target.value.replace(/\D/g, ''))} className={`${inputCls} tabular-nums`} placeholder={tx('12 сан')} />}
          </Field>
          <Field label={tx('Құпия сөз')} hint={tx('Құпия сөзді сынып жетекшісі немесе орынбасар береді')}>
            {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />}
          </Field>
          {inTelegram && <p className="text-sm rounded-md bg-accent-soft text-accent p-3">{tx('Бір рет ЖСН-мен кіріңіз. Telegram аккаунтыңыз байланысады да, келесі жолы өзі кіреді.')}</p>}
          {err && /^\d{12}$/.test(iin) && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" block loading={busy}>{tx('Кіру')} →</Button>
          <p className="flex items-center gap-3 text-xs text-muted" aria-hidden><span className="flex-1 h-px bg-line" />{tx('немесе')}<span className="flex-1 h-px bg-line" /></p>
          <button type="button" onClick={() => setSignup(true)} className="h-[52px] rounded-md border border-line font-semibold">{tx('Аккаунтым жоқ — тіркелу')}</button>
        </div>
      </form>
    </main>
  )
}
