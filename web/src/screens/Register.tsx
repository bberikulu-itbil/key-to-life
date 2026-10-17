import { useState, type FormEvent } from 'react'
import { errText, registerAccount, signIn, signupOptions } from '../lib/api'
import { tx } from '../lib/i18n'
import { Button, ErrorBox, Field, Skeleton, inputCls, useLoad } from '../components/ui'

/** Sign-up: login is the ЖСН. The account waits until the class teacher or the admin (teachers: admin only) approves it. */
export default function Register({ onBack }: { onBack: () => void }) {
  const opts = useLoad(signupOptions, [])
  const [f, setF] = useState({ role: 'student' as 'student' | 'teacher', full_name: '', iin: '', password: '', school_id: '', class_id: '', title: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  const schools = opts.data?.schools ?? []
  const school = f.school_id || (schools.length === 1 ? schools[0].id : '')
  const classes = (opts.data?.classes ?? []).filter((c) => c.school_id === school)

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (f.full_name.trim().length < 2) return setErr(tx('Аты-жөнін жазыңыз'))
    if (!/^\d{12}$/.test(f.iin)) return setErr(tx('ЖСН 12 саннан тұрады'))
    if (f.password.length < 6) return setErr(tx('Құпия сөз кемінде 6 таңба'))
    if (!school) return setErr(tx('Мектепті таңдаңыз'))
    if (f.role === 'student' && !f.class_id) return setErr(tx('Сыныпты таңдаңыз'))
    setBusy(true)
    try {
      await registerAccount({ ...f, school_id: school, class_id: f.role === 'student' ? f.class_id : undefined })
      await signIn(f.iin, f.password)   // the app then shows «өтініш қаралуда» until it is approved
    } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm grid gap-4" noValidate>
        <h1 className="text-2xl font-bold">{tx('Тіркелу')}</h1>
        <p className="text-sm text-muted -mt-2">{tx('Оқушыны сынып жетекшісі немесе әкімші, мұғалімді әкімші растайды. Растағаннан кейін ЖСН мен құпия сөзбен кіресіз.')}</p>
        {opts.loading && !opts.data ? <Skeleton rows={2} /> : opts.error ? <ErrorBox text={opts.error} retry={opts.reload} /> : (
          <>
            <div role="radiogroup" aria-label={tx('Рөлі')} className="grid grid-cols-2 gap-1 bg-surface-2 rounded-md p-1">
              {(['student', 'teacher'] as const).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={f.role === r} onClick={() => set('role', r)}
                  className={`h-10 rounded-sm text-sm font-semibold ${f.role === r ? 'bg-surface shadow-card' : 'text-muted'}`}>{r === 'student' ? tx('Оқушы') : tx('Мұғалім')}</button>
              ))}
            </div>
            <Field label={tx('Аты-жөні')}>{(id) => <input id={id} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="name" className={inputCls} placeholder={tx('Тегі Аты')} />}</Field>
            <Field label={tx('ЖСН')} hint={tx('Кіру логині болады. Басқа пайдаланушыларға көрінбейді.')}>{(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" maxLength={12} autoComplete="username" value={f.iin}
              onChange={(e) => set('iin', e.target.value.replace(/\D/g, ''))} className={`${inputCls} tabular-nums`} placeholder={tx('12 сан')} />}</Field>
            <Field label={tx('Құпия сөз')} hint={tx('Кемінде 6 таңба')}>{(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} className={inputCls} />}</Field>
            {schools.length > 1 && <Field label={tx('Мектеп')}>{(id) => <select id={id} value={f.school_id} onChange={(e) => setF({ ...f, school_id: e.target.value, class_id: '' })} className={inputCls}>
              <option value="">{tx('Таңдаңыз')}</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</Field>}
            {f.role === 'student'
              ? <Field label={tx('Сыныбы')}>{(id) => <select id={id} value={f.class_id} onChange={(e) => set('class_id', e.target.value)} className={inputCls}>
                  <option value="">{tx('Таңдаңыз')}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
              : <Field label={tx('Лауазымы / пәні')}>{(id) => <input id={id} value={f.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder={tx('Физика пәнінің мұғалімі')} />}</Field>}
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Button type="submit" block loading={busy}>{tx('Өтініш жіберу')}</Button>
          </>
        )}
        <Button kind="ghost" onClick={onBack}>{tx('Аккаунтым бар — кіру')}</Button>
      </form>
    </main>
  )
}

/** Signed in, but the account is not approved yet (or was refused). */
export function Pending({ name, status, note, onCheck, onSignOut }: { name: string; status: 'pending' | 'rejected' | 'approved'; note: string | null; onCheck: () => void; onSignOut: () => void }) {
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm grid gap-4 text-center">
        <h1 className="text-xl font-bold">{name}</h1>
        {status === 'rejected'
          ? <p className="text-danger">{tx('Тіркелу өтінішіңіз қабылданбады.')}{note ? ` ${tx('Себебі')}: ${note}` : ''}</p>
          : <p className="text-muted">{tx('Өтінішіңіз қаралуда. Сынып жетекшісі немесе әкімші растағанда кіре аласыз.')}</p>}
        {status !== 'rejected' && <Button block onClick={onCheck}>{tx('Тексеру')}</Button>}
        <Button kind="ghost" onClick={onSignOut}>{tx('Шығу')}</Button>
      </div>
    </main>
  )
}
