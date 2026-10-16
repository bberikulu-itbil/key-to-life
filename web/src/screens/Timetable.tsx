import { useState } from 'react'
import { addLesson, errText, listClasses, listLessons, listStaff, removeLesson } from '../lib/api'
import { hm, isoDow, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Empty, Field, Icon, PageHead, Sheet, Skeleton, inputCls, toast, useLoad } from '../components/ui'

const DAYS = ['Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі']

export default function Timetable({ classId: initial }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const ownClasses = (classes.data ?? []).filter((c) => deputy || c.teacher_id === me.id || c.tutor_id === me.id)
  // students see their class; class teachers and deputies pick a class they run; other teachers see their own lessons
  const [view, setView] = useState<string>(me.role === 'student' ? me.class?.id ?? '' : initial || 'mine')
  const classId = view === 'mine' ? undefined : view
  const lessons = useLoad(() => (view === 'mine' ? listLessons({ teacher: me.id }) : view ? listLessons({ classId: view }) : Promise.resolve([])), [view])
  const [wd, setWd] = useState(isoDow(today()))
  const [adding, setAdding] = useState(false)
  const canEdit = !!classId && (deputy || ownClasses.some((c) => c.id === classId))
  const day = (lessons.data ?? []).filter((l) => l.weekday === wd)

  const del = async (id: string) => { try { await removeLesson(id); lessons.reload() } catch (e) { toast(errText(e)) } }

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Сабақ кестесі" back />
      {me.role !== 'student' && (
        <Field label="Кесте">{(id) => (
          <select id={id} value={view} onChange={(e) => setView(e.target.value)} className={inputCls}>
            <option value="mine">Менің сабақтарым</option>
            {(deputy ? classes.data ?? [] : ownClasses).map((c) => <option key={c.id} value={c.id}>{c.name} сыныбы</option>)}
          </select>
        )}</Field>
      )}
      <div role="tablist" aria-label="Апта күні" className="grid grid-cols-7 gap-1 bg-surface-2 rounded-md p-1">
        {DAYS.map((d, i) => <button key={d} type="button" role="tab" aria-selected={wd === i + 1} aria-label={d} onClick={() => setWd(i + 1)}
          className={`h-10 rounded-sm text-sm font-semibold ${wd === i + 1 ? 'bg-surface shadow-card' : 'text-muted'}`}>{d.slice(0, 2)}</button>)}
      </div>
      {lessons.loading && !lessons.data ? <Skeleton /> : !view ? <Empty title="Сыныпқа тіркелмегенсіз" /> : !day.length ? (
        <Card><Empty icon="clock" title={`${DAYS[wd - 1]} — сабақ жоқ`} text={canEdit ? 'Кестеге сабақ қосыңыз.' : undefined} /></Card>
      ) : (
        <Card className="p-0 divide-y divide-line">
          {day.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3">
              <span className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center text-sm font-bold shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{l.subject}{view === 'mine' && <span className="text-muted font-normal"> · {l.class.name}</span>}</span>
                <span className="block text-sm text-muted tabular-nums">{hm(l.start_time)}–{hm(l.end_time)}{l.room ? ` · ${l.room}-каб.` : ''}{l.teacher || l.teacher_name ? ` · ${l.teacher?.full_name ?? l.teacher_name}` : ''}</span>
              </span>
              {canEdit && <button type="button" onClick={() => del(l.id)} aria-label={`${l.subject} — өшіру`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
            </div>
          ))}
        </Card>
      )}
      {canEdit && <Button kind="secondary" onClick={() => setAdding(true)}>Сабақ қосу</Button>}
      {adding && classId && <Sheet title={`Сабақ қосу · ${DAYS[wd - 1]}`} onClose={() => setAdding(false)}><AddLesson classId={classId} wd={wd} onDone={() => { setAdding(false); lessons.reload() }} /></Sheet>}
    </div>
  )
}

function AddLesson({ classId, wd, onDone }: { classId: string; wd: number; onDone: () => void }) {
  const staff = useLoad(listStaff, [])
  const [f, setF] = useState({ subject: '', start: '08:30', end: '09:15', teacher: '', room: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.subject.trim()) return toast('Пән атауын жазыңыз')
    if (f.end <= f.start) return toast('Аяқталу уақыты басталудан кейін болуы керек')
    setBusy(true)
    try { await addLesson({ class_id: classId, weekday: wd, start_time: f.start, end_time: f.end, subject: f.subject.trim(), teacher_id: f.teacher || null, room: f.room.trim() || null }); toast('Қосылды'); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label="Пән">{(id) => <input id={id} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className={inputCls} placeholder="Алгебра" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Басталуы">{(id) => <input id={id} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inputCls} />}</Field>
        <Field label="Аяқталуы">{(id) => <input id={id} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className={inputCls} />}</Field>
      </div>
      <Field label="Мұғалім">{(id) => <select id={id} value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })} className={inputCls}><option value="">Көрсетілмеген</option>{(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}</Field>
      <Field label="Кабинет">{(id) => <input id={id} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} className={inputCls} placeholder="204" />}</Field>
      <Button block loading={busy} onClick={save}>Қосу</Button>
    </div>
  )
}
