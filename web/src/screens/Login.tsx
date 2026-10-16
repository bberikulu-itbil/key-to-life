import { useState, type FormEvent } from 'react'
import { errText, signIn } from '../lib/api'
import { Button, Field, inputCls } from '../components/ui'

export default function Login() {
  const [iin, setIin] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{12}$/.test(iin)) return setErr('ЖСН 12 саннан тұрады')
    setBusy(true); setErr('')
    try { await signIn(iin, pw) } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm grid gap-5" noValidate>
        <div className="grid gap-1">
          <div className="size-12 rounded-md bg-accent text-on-accent grid place-items-center text-lg font-bold" aria-hidden>LL</div>
          <h1 className="text-display font-bold mt-3">Lyceum Life</h1>
          <p className="text-muted">Үйірмелер, курстар, жарыстар және олимпиадаға дайындық бір жерде.</p>
        </div>
        <Field label="ЖСН" error={err && !/^\d{12}$/.test(iin) ? err : undefined}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" autoComplete="username" maxLength={12} value={iin}
            onChange={(e) => setIin(e.target.value.replace(/\D/g, ''))} className={`${inputCls} tabular-nums`} placeholder="12 сан" />}
        </Field>
        <Field label="Құпия сөз" hint="Құпия сөзді сынып жетекшісі немесе орынбасар береді">
          {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />}
        </Field>
        {err && /^\d{12}$/.test(iin) && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" block loading={busy}>Кіру</Button>
      </form>
    </main>
  )
}
