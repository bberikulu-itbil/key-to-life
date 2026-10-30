import { useMemo, useState } from 'react'
import {
  addClassEvent, addClassHour, addClassPhoto, classStudents, errText, listClasses, listJournal, listStaff, photoUrl, removeClassEvent, removeClassHour, removeClassPhoto,
  type ClassEvent, type Student,
} from '../lib/api'
import { MONTHS, WD_SHORT, fmtDate, iso, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

/* «Журнал және күнтізбе» — class hours log and the class calendar with a photo view, for the class teacher and tutor. */

const DIRECTION: Record<string, string> = {
  moral: tx('Адамгершілік'), safety: tx('Қауіпсіздік'), national: tx('Ұлттық құндылықтар'), patriotic: tx('Патриоттық'),
  health: tx('Салауатты өмір'), family: tx('Отбасы'), career: tx('Кәсіптік бағдар'), other: tx('Басқа'),
}
// colour of each kind of day on the calendar
const KIND = {
  school: ['#dc2626', tx('Емтихан, мектеп шарасы')], mentor: ['#2563eb', tx('Жеке кездесу')], hour: ['#16a34a', tx('Тәрбие сағаты')],
  fun: ['#eab308', tx('Фильм, спорт')], parents: ['#9333ea', tx('Ата-ана, қонаққа бару')],
} as const
type Kind = keyof typeof KIND
type Item = { key: string; date: string; kind: Kind; title: string; remove?: () => Promise<unknown> }

export default function Journal({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const [tab, setTab] = useState<'calendar' | 'hours'>('calendar')
  const data = useLoad(async () => {
    if (!cls) return null
    const [j, students, staff] = await Promise.all([listJournal(cls.id), classStudents(cls.id), listStaff()])
    return { ...j, students, staff }
  }, [cls?.id])
  if (classes.loading && !classes.data) return <><PageHead title={tx('Журнал және күнтізбе')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Журнал және күнтізбе')} back /><Empty icon="file" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const d = data.data
  const staffName = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Журнал және күнтізбе')} back right={options.length > 1 ? (
        <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/journal/${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>) : undefined} />
      <p className="flex items-center gap-2 text-sm text-muted -mt-1"><Icon n="lock" size={16} />{tx('{0} · оқушыларға көрінбейді', cls.name)}</p>
      <Chips label={tx('Бөлім')} value={tab} onChange={setTab} items={[['calendar', tx('Күнтізбе')], ['hours', tx('Тәрбие сағаттары')]]} />
      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (tab === 'calendar'
        ? <Calendar classId={cls.id} d={d} reload={data.reload} />
        : <Hours classId={cls.id} d={d} people={[cls.teacher_id, cls.tutor_id].filter((x): x is string => !!x)} staffName={staffName} reload={data.reload} />)}
    </div>
  )
}

type D = Awaited<ReturnType<typeof listJournal>> & { students: Student[] }

/** Everything on the calendar, by date. */
function journalItems(d: Pick<D, 'hours' | 'events' | 'meetings' | 'contacts'>, studentName: (id: string) => string): Item[] {
  return [
    ...d.hours.map((h) => ({ key: 'h' + h.id, date: h.on_date, kind: 'hour' as Kind, title: `${DIRECTION[h.direction] ?? h.direction}: ${h.topic}`, remove: () => removeClassHour(h.id) })),
    ...d.events.map((e) => ({ key: 'e' + e.id, date: e.on_date, kind: e.kind as Kind, title: (e.at_time ? e.at_time.slice(0, 5) + ' · ' : '') + e.title, remove: () => removeClassEvent(e.id) })),
    ...d.meetings.map((m) => ({ key: 'm' + m.id, date: iso(new Date(m.starts_at)), kind: 'mentor' as Kind, title: `${new Date(m.starts_at).toTimeString().slice(0, 5)} · ${studentName(m.student_id)}: ${m.topic}` })),
    ...d.contacts.map((c) => ({ key: 'c' + c.id, date: c.on_date, kind: 'parents' as Kind, title: `${studentName(c.student_id)}: ${c.summary}` })),
  ]
}

function Calendar({ classId, d, reload }: { classId: string; d: D; reload: () => void }) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [day, setDay] = useState<string | null>(null)
  const name = (id: string) => d.students.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const items = useMemo(() => journalItems(d, name), [d]) // eslint-disable-line react-hooks/exhaustive-deps
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  const shift = (k: number) => { const t = new Date(y, m - 1 + k, 1); setMonth(iso(t).slice(0, 7)) }
  return (
    <div className="grid gap-3">
      <Card className="grid gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={tx('Алдыңғы ай')} onClick={() => shift(-1)} className="size-10 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="back" /></button>
          <h2 className="flex-1 text-center font-semibold capitalize">{MONTHS[m - 1]} {y}</h2>
          <button type="button" aria-label={tx('Келесі ай')} onClick={() => shift(1)} className="size-10 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="chev" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{WD_SHORT.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const its = items.filter((i) => i.date === c), pics = d.photos.some((p) => p.on_date === c)
            const kinds = [...new Set(its.map((i) => i.kind))]
            return (
              <button key={c} type="button" onClick={() => setDay(c)} aria-label={`${fmtDate(c)}${its.length ? ' · ' + tx('{0} жазба', its.length) : ''}`}
                className={`min-h-14 lg:min-h-20 rounded-md p-1 grid content-start justify-items-center gap-1 text-sm ${c.slice(0, 7) !== month ? 'text-muted/50' : ''} ${c === today() ? 'ring-2 ring-accent' : ''} hover:bg-surface-2`}>
                <span className="tabular-nums">{Number(c.slice(8))}</span>
                <span className="flex flex-wrap justify-center gap-0.5">{kinds.map((k) => <span key={k} className="size-2 rounded-full" style={{ background: KIND[k][0] }} />)}</span>
                {pics && <Icon n="heart" size={12} className="text-muted" />}
              </button>
            )
          })}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(Object.keys(KIND) as Kind[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: KIND[k][0] }} />{KIND[k][1]}</li>)}
        </ul>
      </Card>
      {day && <Day classId={classId} day={day} items={items.filter((i) => i.date === day)} photos={d.photos.filter((p) => p.on_date === day)} onClose={() => setDay(null)} reload={reload} />}
    </div>
  )
}

/** One day: what happened or is planned, its photos, adding an event or photos. */
function Day({ classId, day, items, photos, onClose, reload }: { classId: string; day: string; items: Item[]; photos: D['photos']; onClose: () => void; reload: () => void }) {
  const { me } = useMe()
  const [f, setF] = useState({ title: '', kind: 'school' as ClassEvent['kind'], time: '' })
  const [busy, setBusy] = useState(false)
  const [big, setBig] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  return (
    <Sheet title={fmtDate(day)} onClose={onClose}>
      <div className="grid gap-4">
        {!items.length ? <p className="text-sm text-muted">{tx('Бұл күні жазба жоқ.')}</p> : (
          <ul className="grid gap-2">{items.map((i) => (
            <li key={i.key} className="flex items-start gap-3 rounded-md bg-surface-2 p-3">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: KIND[i.kind][0] }} />
              <span className="flex-1 min-w-0 text-sm"><span className="block text-xs text-muted">{KIND[i.kind][1]}</span><span className="block break-words">{i.title}</span></span>
              {i.remove && <button type="button" aria-label={tx('Өшіру')} onClick={() => run(i.remove!)} className="size-9 grid place-items-center rounded-md text-muted hover:bg-surface"><Icon n="x" size={16} /></button>}
            </li>
          ))}</ul>
        )}

        <div className="grid gap-2">
          <p className="font-semibold">{tx('Фотосуреттер')}</p>
          {photos.length > 0 && <div className="grid grid-cols-3 gap-2">{photos.map((p) => (
            <div key={p.id} className="relative">
              <button type="button" onClick={() => setBig(p.path)} className="block w-full"><img src={photoUrl(p.path)} alt={tx('{0} күнгі сурет', fmtDate(day))} className="aspect-square w-full rounded-md object-cover" loading="lazy" /></button>
              <button type="button" aria-label={tx('Суретті өшіру')} onClick={() => run(() => removeClassPhoto(p.id))} className="absolute top-1 right-1 size-8 grid place-items-center rounded-full bg-black/50 text-white"><Icon n="x" size={14} /></button>
            </div>
          ))}</div>}
          <label className={`h-11 rounded-md bg-accent-soft text-accent font-semibold inline-flex items-center justify-center gap-2 cursor-pointer ${busy ? 'opacity-50' : ''}`}>
            <Icon n="plus" size={18} />{busy ? tx('Жүктелуде…') : tx('Фото қосу')}
            <input type="file" accept="image/*" multiple className="sr-only" disabled={busy}
              onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) run(async () => { for (const file of files) await addClassPhoto(classId, day, me.id, file) }) }} />
          </label>
        </div>

        <div className="grid gap-2">
          <p className="font-semibold">{tx('Оқиға қосу')}</p>
          <input aria-label={tx('Атауы')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} className={inputCls} placeholder={tx('Мысалы: БЖБ, киноклуб, ата-аналар жиналысы')} />
          <Chips label={tx('Түрі')} value={f.kind} onChange={(kind) => setF({ ...f, kind })} items={[['school', KIND.school[1]], ['fun', KIND.fun[1]], ['parents', KIND.parents[1]]]} />
          <input aria-label={tx('Уақыты')} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={`${inputCls} min-w-0`} />
          <Button loading={busy} disabled={f.title.trim().length < 2} onClick={() => run(async () => { await addClassEvent({ class_id: classId, on_date: day, at_time: f.time || null, kind: f.kind, title: f.title.trim() }); setF({ ...f, title: '', time: '' }) })}>{tx('Қосу')}</Button>
          <p className="text-xs text-muted">{tx('Тәрбие сағаттары «Тәрбие сағаттары» бөлімінен, жеке кездесулер мен ата-анамен кездесулер өз бөлімдерінен өзі түседі.')}</p>
        </div>
      </div>
      {big && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setBig(null)} role="dialog" aria-label={tx('Сурет')}>
          <img src={photoUrl(big)} alt="" className="max-h-full max-w-full rounded-md" />
        </div>
      )}
    </Sheet>
  )
}

function Hours({ classId, d, people, staffName, reload }: { classId: string; d: D; people: string[]; staffName: (id: string | null) => string; reload: () => void }) {
  const blank = { on_date: today(), direction: 'moral', topic: '', led_by: people[0] ?? '', grp: '', note: '', absent: [] as string[] }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [dir, setDir] = useState('')
  const [q, setQ] = useState('')
  const name = (id: string) => d.students.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const save = async () => {
    setBusy(true)
    try {
      await addClassHour({ class_id: classId, on_date: f.on_date, direction: f.direction, topic: f.topic.trim(), led_by: f.led_by || null, absent: f.absent, grp: f.grp.trim() || null, note: f.note.trim() || null })
      setF(blank); toast(tx('Сақталды')); reload()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const shown = d.hours.filter((h) => (!dir || h.direction === dir) && (!q || h.topic.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr] items-start">
      <Card className="grid gap-3">
        <p className="font-semibold">{tx('Тәрбие сағатын тіркеу')}</p>
        <div className="grid grid-cols-2 gap-2 [&_input]:min-w-0">
          <input aria-label={tx('Күні')} type="date" value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} className={inputCls} />
          <select aria-label={tx('Бағыты')} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })} className={inputCls}>
            {Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <input aria-label={tx('Тақырыбы')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Тақырыбы')} />
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={tx('Кім өткізді')} value={f.led_by} onChange={(e) => setF({ ...f, led_by: e.target.value })} className={inputCls}>
            {people.map((p) => <option key={p} value={p}>{staffName(p)}</option>)}
          </select>
          <input aria-label={tx('Топ (міндетті емес)')} value={f.grp} onChange={(e) => setF({ ...f, grp: e.target.value })} maxLength={100} className={inputCls} placeholder={tx('Топ (міндетті емес)')} />
        </div>
        <Field label={tx('Қатыспағандар · {0}', f.absent.length)}>{() => (
          <div className="flex flex-wrap gap-1.5">{d.students.map((s) => {
            const on = f.absent.includes(s.id)
            return <button key={s.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, absent: on ? f.absent.filter((x) => x !== s.id) : [...f.absent, s.id] })}
              className={`h-8 px-3 rounded-full text-xs font-semibold ${on ? 'bg-danger-soft text-danger' : 'bg-surface-2'}`}>{name(s.id)}</button>
          })}</div>
        )}</Field>
        <textarea aria-label={tx('Ескертпе')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={2000} className={`${inputCls} h-20 py-2`} placeholder={tx('Ескертпе')} />
        <Button onClick={save} loading={busy} disabled={f.topic.trim().length < 2}>{tx('Сақтау')}</Button>
      </Card>

      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={tx('Бағыты')} value={dir} onChange={(e) => setDir(e.target.value)} className={`${inputCls} h-10 text-sm`}>
            <option value="">{tx('Барлық бағыт')}</option>
            {Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input aria-label={tx('Тақырып бойынша іздеу')} value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} h-10 text-sm`} placeholder={tx('Тақырып бойынша іздеу')} />
        </div>
        {!shown.length ? <Empty icon="file" title={tx('Тәрбие сағаты жоқ')} text={tx('Өткізілген тәрбие сағаттары осында тізіледі және күнтізбеде жасылмен белгіленеді.')} /> : shown.map((h) => (
          <Card key={h.id} className="grid gap-1.5">
            <div className="flex items-start gap-2">
              <span className="flex-1 min-w-0"><span className="block text-xs font-semibold text-success">{DIRECTION[h.direction]}</span><span className="block font-semibold break-words">{h.topic}</span></span>
              <button type="button" aria-label={tx('Өшіру')} onClick={() => removeClassHour(h.id).then(reload, (e) => toast(errText(e)))} className="size-9 grid place-items-center rounded-md text-muted hover:bg-surface-2"><Icon n="x" size={16} /></button>
            </div>
            <p className="text-xs text-muted">{fmtDate(h.on_date)} · {staffName(h.led_by)}{h.grp ? ` · ${h.grp}` : ''} · {h.absent.length ? tx('қатыспады: {0}', h.absent.map(name).join(', ')) : tx('бәрі қатысты')}</p>
            {h.note && <p className="text-sm whitespace-pre-line">{h.note}</p>}
          </Card>
        ))}
      </div>
    </div>
  )
}
