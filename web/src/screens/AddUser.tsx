import { useState, type FormEvent } from 'react'
import { addUser, errText, listClasses, type Role } from '../lib/api'
import { useMe } from '../App'
import { Button, Card, Field, inputCls, toast, useLoad } from '../components/ui'

const ROLES: [Role, string][] = [['student', 'Оқушы'], ['teacher', 'Мұғалім'], ['class_teacher', 'Сынып жетекшісі'], ['deputy', 'Орынбасар']]

export default function AddUser() {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const myClasses = (classes.data ?? []).filter((c) => deputy || c.teacher_id === me.id)
  const [f, setF] = useState({ full_name: '', iin: '', role: 'student' as Role, class_id: '', title: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ full_name: string; iin: string; password: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (f.full_name.trim().length < 2) return setErr('Аты-жөнін жазыңыз')
    if (!/^\d{12}$/.test(f.iin)) return setErr('ЖСН 12 саннан тұрады')
    const class_id = f.class_id || myClasses[0]?.id
    if (f.role === 'student' && !class_id) return setErr('Сыныпты таңдаңыз')
    setBusy(true); setErr('')
    try { setDone(await addUser({ ...f, class_id })); setF({ ...f, full_name: '', iin: '' }) } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Көшірілді'), () => toast('Көшіру мүмкін болмады — қолмен белгілеңіз'))

  if (done) return (
    <div className="grid gap-4">
      <Card className="grid gap-2 bg-success-soft">
        <p className="font-semibold">{done.full_name} тіркелді</p>
        <p className="text-sm">Кіру деректерін иесіне жеке беріңіз. Құпия сөз қайта көрсетілмейді.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums select-all">
          <dt className="text-muted">ЖСН</dt><dd>{done.iin}</dd>
          <dt className="text-muted">Құпия сөз</dt><dd className="font-semibold">{done.password}</dd>
        </dl>
        <div><Button kind="secondary" onClick={() => copy(`ЖСН: ${done.iin}\nҚұпия сөз: ${done.password}`)}>Көшіру</Button></div>
      </Card>
      <Button kind="ghost" onClick={() => setDone(null)}>Тағы біреуін қосу</Button>
    </div>
  )

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {deputy && (
        <Field label="Рөлі">
          {(id) => <select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} className={inputCls}>
            {ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        </Field>
      )}
      <Field label="Аты-жөні">{(id) => <input id={id} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} className={inputCls} placeholder="Тегі Аты" />}</Field>
      <Field label="ЖСН" hint="Кіру логині болады. Басқа пайдаланушыларға көрінбейді.">
        {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" maxLength={12} value={f.iin} onChange={(e) => setF({ ...f, iin: e.target.value.replace(/\D/g, '') })} className={`${inputCls} tabular-nums`} />}
      </Field>
      {f.role === 'student' ? (
        <Field label="Сыныбы">
          {(id) => <select id={id} value={f.class_id || myClasses[0]?.id || ''} onChange={(e) => setF({ ...f, class_id: e.target.value })} className={inputCls}>
            {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        </Field>
      ) : (
        <Field label="Лауазымы / пәні">{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder="Физика пәнінің мұғалімі" />}</Field>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Button type="submit" block loading={busy}>Тіркеу және құпия сөз жасау</Button>
    </form>
  )
}
