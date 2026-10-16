import { useState } from 'react'
import { createLeave, errText, listStaff } from '../lib/api'
import { iso } from '../lib/time'
import { useMe } from '../App'
import AbsenceForm from './AbsenceForm'
import Qr from '../components/Qr'
import { Button, Card, Field, PageHead, Sheet, go, inputCls, useLoad } from '../components/ui'

export const LEAVE_CATEGORY: Record<string, string> = { illness: 'Денсаулық (ауырып қалдым)', family: 'Отбасылық жағдай', documents: 'Құжат, ресми іс', competition: 'Жарыс, олимпиада', other: 'Басқа себеп' }
type Kind = 'outside' | 'lesson' | 'activity'
const KINDS: [Kind, string, string][] = [
  ['outside', 'Сыртқа шығу', 'Лицей аумағынан белгілі уақытқа шығу. Алдымен сынып жетекшісі, кейін кезекші орынбасар шешеді.'],
  ['lesson', 'Сабақтан', 'Бір сабақтан сұрану. Пән мұғалімі шешеді, сынып жетекшісі хабардар болады.'],
  ['activity', 'Іс-шарадан', 'Олимпиада дайындығы, үйірме немесе курстан. Жауапты мұғалім мен жауапты оқушыға барады.'],
]

const pad = (n: number) => String(n).padStart(2, '0')
const localDT = (d: Date) => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export default function LeaveForm() {
  const { me } = useMe()
  const staff = useLoad(listStaff, [])
  const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0)
  const [kind, setKind] = useState<Kind>('outside')
  const [from, setFrom] = useState(localDT(now))
  const [to, setTo] = useState(localDT(new Date(now.getTime() + 2 * 3600e3)))
  const [cat, setCat] = useState('documents')
  const [reason, setReason] = useState('')
  const [teacher, setTeacher] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [code, setCode] = useState('')

  if (me.role !== 'student') return <><PageHead title="Рұқсат сұрау" back /><Card><p className="text-muted">Рұқсатты оқушылар сұрайды. Келген сұрауларды «Рұқсаттар» бөлімінен көресіз.</p></Card></>

  async function submit() {
    const s = new Date(from), e = new Date(to)
    if (!(e > s)) return setErr('Қайту уақыты шығу уақытынан кейін болуы керек')
    if (kind === 'lesson' && !teacher) return setErr('Пән мұғалімін таңдаңыз')
    if (reason.trim().length < 5) return setErr('Себебін қысқаша жазыңыз')
    setBusy(true); setErr('')
    try { setCode(await createLeave(kind as 'outside' | 'lesson', s.toISOString(), e.toISOString(), cat, reason, kind === 'lesson' ? teacher : undefined)) }
    catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 pb-6">
      <PageHead title="Рұқсат сұрау" back />
      <div role="radiogroup" aria-label="Түрі" className="grid grid-cols-3 gap-1 bg-surface-2 rounded-md p-1">
        {KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setErr('') }}
          className={`h-10 rounded-sm text-sm font-semibold ${kind === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{l}</button>)}
      </div>
      <p className="text-sm text-muted -mt-2">{KINDS.find((k) => k[0] === kind)![2]}</p>

      {kind === 'activity' ? <Card><AbsenceForm onDone={() => go('/leaves')} /></Card> : (
        <Card className="grid gap-4">
          {kind === 'lesson' && (
            <Field label="Пән мұғалімі">{(id) => <select id={id} value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inputCls}>
              <option value="">Таңдаңыз</option>{(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.title ? ` · ${s.title}` : ''}</option>)}</select>}</Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={kind === 'outside' ? 'Шығу уақыты' : 'Басталуы'}>{(id) => <input id={id} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />}</Field>
            <Field label={kind === 'outside' ? 'Қайту уақыты' : 'Аяқталуы'}>{(id) => <input id={id} type="datetime-local" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />}</Field>
          </div>
          <Field label="Себеп">{(id) => <select id={id} value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>{Object.entries(LEAVE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
          <Field label="Толығырақ">{(id) => <textarea id={id} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className={`${inputCls} h-24 py-2`} placeholder={kind === 'outside' ? 'Қайда, кіммен барасыз' : 'Неге сұранып тұрсыз'} />}</Field>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button block loading={busy} onClick={submit}>Өтінішті жіберу</Button>
        </Card>
      )}

      {code && (
        <Sheet title="Өтініш жіберілді" onClose={() => go('/leaves')}>
          <div className="grid gap-3 justify-items-center text-center">
            <Qr code={code} label="Рұқсат" />
            <p className="text-sm text-muted max-w-[36ch]">QR рұқсат берілгеннен кейін ғана жарамды болады. Шешім хабарламаға келеді, күйін «Рұқсаттар» бөлімінен қараңыз.</p>
            <Button kind="secondary" onClick={() => go('/leaves')}>Рұқсаттарым</Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
