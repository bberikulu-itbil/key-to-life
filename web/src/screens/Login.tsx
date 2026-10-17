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
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm grid gap-5" noValidate>
        <LangChips signedIn={false} />
        <div className="grid gap-1">
          <div className="size-12 rounded-md bg-accent text-on-accent grid place-items-center text-lg font-bold" aria-hidden>KL</div>
          <h1 className="text-display font-bold mt-3">Key To Life</h1>
          <p className="text-muted">{tx('Үйірмелер, курстар, жарыстар және олимпиадаға дайындық бір жерде.')}</p>
        </div>
        <Field label={tx('ЖСН')} error={err && !/^\d{12}$/.test(iin) ? err : undefined}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" autoComplete="username" maxLength={12} value={iin}
            onChange={(e) => setIin(e.target.value.replace(/\D/g, ''))} className={`${inputCls} tabular-nums`} placeholder={tx('12 сан')} />}
        </Field>
        <Field label={tx('Құпия сөз')} hint={tx('Құпия сөзді сынып жетекшісі немесе орынбасар береді')}>
          {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />}
        </Field>
        {inTelegram && <p className="text-sm rounded-md bg-accent-soft text-accent p-3">{tx('Бір рет ЖСН-мен кіріңіз. Telegram аккаунтыңыз байланысады да, келесі жолы өзі кіреді.')}</p>}
        {err && /^\d{12}$/.test(iin) && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" block loading={busy}>{tx('Кіру')}</Button>
        <Button kind="ghost" onClick={() => setSignup(true)}>{tx('Аккаунтым жоқ — тіркелу')}</Button>
      </form>
    </main>
  )
}
