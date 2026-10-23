import { useState } from 'react'
import { errText, listClasses, listStaff, setStaffInfo, updateStaff, type Staff } from '../lib/api'
import Avatar from './Avatar'
import { Button, Card, Empty, Field, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

export type StaffKind = NonNullable<Staff['staff_kind']>
export const KIND_LABEL: Record<StaffKind, string> = { teacher: tx('Мұғалімдер'), tutor: tx('Тәрбиешілер'), staff: tx('Қызметкерлер') }

/** Admin and deputies: teachers, tutors and other staff, each with their subject and classes; tap to edit. */
export default function StaffList({ kind }: { kind: StaffKind }) {
  const data = useLoad(() => Promise.all([listStaff(), listClasses()]), [])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Staff | null>(null)
  const [staff, classes] = data.data ?? [[], []]
  // not set yet: a class tutor counts as a tutor, everybody else as a teacher
  const kindOf = (s: Staff): StaffKind => s.staff_kind ?? (classes.some((c) => c.tutor_id === s.id) ? 'tutor' : 'teacher')
  const list = staff.filter((s) => kindOf(s) === kind && (s.full_name + (s.subject ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
  const classesOf = (id: string) => classes.filter((c) => c.teacher_id === id || c.tutor_id === id).map((c) => c.name).join(', ')
  if (data.loading && !data.data) return <Skeleton rows={3} />
  return (
    <div className="grid gap-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={tx('Іздеу')} placeholder={tx('Аты-жөні немесе пәні')} className={inputCls} />
      {!list.length ? <Card><Empty icon="users" title={tx('Әзірге ешкім жоқ')} text={kind === 'staff' ? tx('Мұғалімнің бетін ашып, түрін «Қызметкер» деп белгілеңіз.') : undefined} /></Card> : (
        <Card className="p-0 divide-y divide-line">
          {list.map((s) => (
            <button key={s.id} type="button" onClick={() => setOpen(s)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
              <Avatar name={s.full_name} size={40} />
              <span className="flex-1 min-w-0"><span className="block font-medium truncate">{s.full_name}</span>
                <span className="block text-xs text-muted truncate">{[s.subject, classesOf(s.id)].filter(Boolean).join(' · ')}</span></span>
            </button>
          ))}
        </Card>
      )}
      {open && <Sheet title={open.full_name} onClose={() => setOpen(null)}><StaffEdit s={open} kind={kindOf(open)} onDone={() => { setOpen(null); data.reload() }} /></Sheet>}
    </div>
  )
}

function StaffEdit({ s, kind, onDone }: { s: Staff; kind: StaffKind; onDone: () => void }) {
  const [f, setF] = useState({ full_name: s.full_name, title: s.title ?? '', subject: s.subject ?? '', kind })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await updateStaff(s.id, f.full_name, f.title); await setStaffInfo(s.id, f.kind, f.subject); toast(tx('Сақталды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Аты-жөні')}>{(id) => <input id={id} value={f.full_name} maxLength={120} onChange={(e) => setF({ ...f, full_name: e.target.value })} className={inputCls} />}</Field>
      <Field label={tx('Түрі')}>{(id) => <select id={id} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as StaffKind })} className={inputCls}>
        <option value="teacher">{tx('Мұғалім')}</option><option value="tutor">{tx('Тәрбиеші')}</option><option value="staff">{tx('Қызметкер')}</option></select>}</Field>
      <Field label={tx('Пәні')} hint={tx('Лентаға «пән атынан» жазғанда көрінеді')}>{(id, d) => <input id={id} aria-describedby={d} value={f.subject} maxLength={60} onChange={(e) => setF({ ...f, subject: e.target.value })} className={inputCls} placeholder={tx('Мысалы: Информатика')} />}</Field>
      <Field label={tx('Лауазымы')} hint={tx('Тек осы бетте көрінеді')}>{(id, d) => <input id={id} aria-describedby={d} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
    </div>
  )
}
