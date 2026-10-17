import { useEffect, useMemo, useState } from 'react'
import { classStudents, errText, listClasses, listWeekendMeals, setWeekendMeal, type Student, type WeekendMealKey } from '../lib/api'
import { addDays, fmtDate, isoDow, today } from '../lib/time'
import { useMe } from '../App'
import { Badge, Card, Empty, ErrorBox, Icon, PageHead, Skeleton, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

/** Saturday is the anchor date for one weekend. On Sunday, keep the weekend just ending. */
const defaultWeekend = () => {
  const t = today()
  const d = isoDow(t)
  return addDays(t, d === 7 ? -1 : 6 - d)
}

const MEALS: { key: WeekendMealKey; label: string; date: (start: string) => string }[] = [
  { key: 'fri_dinner', label: tx('Жұма · кешкі ас'), date: (s) => addDays(s, -1) },
  { key: 'sat_breakfast', label: tx('Сенбі · таңғы ас'), date: (s) => s },
  { key: 'sat_lunch', label: tx('Сенбі · түскі ас'), date: (s) => s },
  { key: 'sat_dinner', label: tx('Сенбі · кешкі ас'), date: (s) => s },
  { key: 'sun_breakfast', label: tx('Жексенбі · таңғы ас'), date: (s) => addDays(s, 1) },
  { key: 'sun_lunch', label: tx('Жексенбі · түскі ас'), date: (s) => addDays(s, 1) },
  { key: 'sun_dinner', label: tx('Жексенбі · кешкі ас'), date: (s) => addDays(s, 1) },
]

export default function Weekend() {
  const { me } = useMe()
  return me.role === 'student' ? <StudentView /> : <StaffView />
}

function WeekendHead({ start, onChange }: { start: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(addDays(start, -7))} aria-label={tx('Алдыңғы демалыс аптасы')} className="size-11 grid place-items-center"><Icon n="back" /></button>
        <div className="flex-1 text-center">
          <p className="font-semibold">{fmtDate(addDays(start, -1))} – {fmtDate(addDays(start, 1))}</p>
          <p className="text-xs text-muted">{tx('Демалыс күндері · сенбі {0}', fmtDate(start))}</p>
        </div>
        <button type="button" onClick={() => onChange(addDays(start, 7))} aria-label={tx('Келесі демалыс аптасы')} className="size-11 grid place-items-center"><Icon n="chev" /></button>
      </div>
    </div>
  )
}

function StudentView() {
  const { me } = useMe()
  const [start, setStart] = useState(defaultWeekend)
  const data = useLoad(() => listWeekendMeals(start), [start, me.id])
  const selected = useMemo(() => new Set((data.data ?? []).filter((x) => x.will_eat).map((x) => x.meal)), [data.data])
  const [busy, setBusy] = useState<WeekendMealKey | null>(null)

  const toggle = async (meal: WeekendMealKey) => {
    setBusy(meal)
    try {
      await setWeekendMeal(start, meal, !selected.has(meal))
      toast(tx('Тамақтану жоспары сақталды'))
      data.reload()
    } catch (e) { toast(errText(e)) } finally { setBusy(null) }
  }

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Hafta Sonu" back />
      <Card className="grid gap-1">
        <WeekendHead start={start} onChange={setStart} />
        <p className="text-sm text-muted">{tx('Қай уақытта асханаға баратыныңызды белгілеңіз. Белгі өзгерсе, батырманы қайта басыңыз.')}</p>
      </Card>
      {data.error ? <ErrorBox text={data.error} retry={data.reload} /> : data.loading && !data.data ? <Skeleton rows={2} /> : (
        <Card className="grid gap-2">
          {MEALS.map((m) => {
            const on = selected.has(m.key)
            return (
              <button key={m.key} type="button" aria-pressed={on} disabled={busy !== null} onClick={() => toggle(m.key)}
                className={`w-full flex items-center gap-3 rounded-md border px-3 py-3 text-left transition ${on ? 'border-accent bg-accent-soft' : 'border-input bg-surface'}`}>
                <span className={`size-10 rounded-full grid place-items-center shrink-0 ${on ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}>
                  <Icon n={on ? 'check' : 'utensils'} size={20} />
                </span>
                <span className="flex-1 min-w-0"><span className="block font-semibold">{m.label}</span><span className="block text-xs text-muted">{fmtDate(m.date(start))}</span></span>
                <Badge tone={on ? 'ok' : 'muted'}>{on ? tx('Барамын') : tx('Бармаймын')}</Badge>
              </button>
            )
          })}
        </Card>
      )}
    </div>
  )
}

function StaffView() {
  const { me } = useMe()
  const [start, setStart] = useState(defaultWeekend)
  const classes = useLoad(listClasses, [me.id])
  const managed = useMemo(() => {
    const all = classes.data ?? []
    return me.role === 'deputy' || me.role === 'admin' ? all : all.filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  }, [classes.data, me.id, me.role])
  const [classId, setClassId] = useState('')
  useEffect(() => {
    if (!classId && managed[0]) setClassId(managed[0].id)
  }, [classId, managed])
  const roster = useLoad(async () => {
    if (!classId) return { students: [] as Student[], rows: [] as Awaited<ReturnType<typeof listWeekendMeals>> }
    const [students, rows] = await Promise.all([classStudents(classId), listWeekendMeals(start)])
    return { students, rows: rows.filter((r) => r.class_id === classId) }
  }, [classId, start])
  const selected = useMemo(() => new Set((roster.data?.rows ?? []).filter((x) => x.will_eat).map((x) => `${x.student_id}:${x.meal}`)), [roster.data])
  const counts = useMemo(() => Object.fromEntries(MEALS.map((m) => [m.key, (roster.data?.rows ?? []).filter((x) => x.meal === m.key && x.will_eat).length])), [roster.data])

  if (classes.error) return <div className="grid gap-3 pb-6"><PageHead title={'Hafta Sonu'} back /><ErrorBox text={classes.error} retry={classes.reload} /></div>
  if (classes.loading && !classes.data) return <div className="grid gap-3 pb-6"><PageHead title="Hafta Sonu" back /><Skeleton rows={3} /></div>
  if (!managed.length) return <div className="grid gap-3 pb-6"><PageHead title="Hafta Sonu" back /><Card><Empty icon="users" title={tx('Сынып табылмады')} text={tx('Бұл бөлім сынып жетекші мен тәрбиешіге арналған.')} /></Card></div>

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Hafta Sonu" back />
      <Card className="grid gap-3">
        {managed.length > 1 && <select aria-label={tx('Сынып')} value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}>{managed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <WeekendHead start={start} onChange={setStart} />
        <p className="text-sm text-muted">{tx('Келетін оқушылардың белгіленген тамақ уақыттары. Мұғалімдер мен тәрбиешілер бұл тізімді көре алады.')}</p>
      </Card>
      {roster.error ? <ErrorBox text={roster.error} retry={roster.reload} /> : roster.loading && !roster.data ? <Skeleton rows={4} /> : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <th className="sticky left-0 bg-surface-2 px-3 py-3 text-left font-semibold">{tx('Оқушы')}</th>
                  {MEALS.map((m) => <th key={m.key} className="px-2 py-3 text-center font-semibold whitespace-nowrap">{m.label.replace(' · ', ' / ')}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(roster.data?.students ?? []).map((student) => (
                  <tr key={student.id}>
                    <th className="sticky left-0 bg-surface px-3 py-3 text-left font-medium whitespace-nowrap">{student.full_name}</th>
                    {MEALS.map((m) => {
                      const on = selected.has(`${student.id}:${m.key}`)
                      return <td key={m.key} className="px-2 py-3 text-center"><span className={`inline-grid place-items-center size-7 rounded-full ${on ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted'}`} aria-label={on ? tx('Барады') : tx('Белгіленбеген')}><Icon n={on ? 'check' : 'x'} size={16} /></span></td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-t border-line">
            {MEALS.map((m) => <div key={m.key} className="rounded-md bg-surface-2 px-3 py-2"><p className="text-xs text-muted">{m.label}</p><p className="font-bold">{tx('{0} оқушы', counts[m.key] ?? 0)}</p></div>)}
          </div>
        </Card>
      )}
    </div>
  )
}
