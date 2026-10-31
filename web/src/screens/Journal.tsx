import { useMemo, useState } from 'react'
import {
  addClassEvent, addClassHour, addClassPhoto, classEventsForMe, classStudents, errText, listClasses, listJournal, listStaff, photoUrl, removeClassEvent, removeClassHour,
  removeClassPhoto, setHourPlan, type ClassEvent, type ClassPhoto, type Student,
} from '../lib/api'
import { MONTHS, WD_SHORT, addDays, fmtDate, iso, isoDow, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

/* «Сынып күнтізбесі» — the class calendar (week and month), class hours with their plan, and the photo album.
   Staff see everything; students see only the events shown to them. */

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
type Item = { key: string; date: string; kind: Kind; title: string; note?: string | null; shown?: boolean; remove?: () => Promise<unknown> }
type Tab = 'week' | 'month' | 'hours' | 'album'
type Add = { what: 'event' | 'hour' | 'photo'; date: string }

const Dot = ({ k, size = 8 }: { k: Kind; size?: number }) => <span className="block shrink-0 rounded-full" style={{ background: KIND[k][0], width: size, height: size }} />
const dayLabel = (d: string) => `${WD_SHORT[isoDow(d) - 1]}, ${fmtDate(d)}`

export default function Journal({ classId }: { classId?: string }) {
  const { me } = useMe()
  if (me.role === 'student') return <StudentCalendar />
  return <StaffCalendar classId={classId} />
}

/** Students: what is coming up for the class. */
function StudentCalendar() {
  const { me } = useMe()
  const list = useLoad(async () => (me.class ? classEventsForMe(me.class.id) : []), [me.class?.id])
  const rows = list.data ?? []
  const upcoming = rows.filter((e) => e.on_date >= today())
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сынып күнтізбесі')} back />
      {list.loading && !list.data ? <Skeleton /> : list.error ? <ErrorBox text={list.error} retry={list.reload} /> : !upcoming.length
        ? <Empty icon="clock" title={tx('Алда оқиға жоқ')} text={tx('Сынып жетекшісі не тәрбиеші оқиға қосса, осында шығады және хабарлама келеді.')} />
        : <ItemList items={upcoming.map((e) => eventItem(e))} />}
    </div>
  )
}

const eventItem = (e: ClassEvent, remove?: () => Promise<unknown>): Item =>
  ({ key: 'e' + e.id, date: e.on_date, kind: e.kind as Kind, title: (e.at_time ? e.at_time.slice(0, 5) + ' · ' : '') + e.title, note: e.note, shown: e.visible, remove })

/** Items grouped under their dates. */
function ItemList({ items, onRemove, flat }: { items: Item[]; onRemove?: (i: Item) => void; flat?: boolean }) {
  const days = [...new Set(items.map((i) => i.date))].sort()
  return (
    <div className="grid gap-3">{days.map((d) => (
      <section key={d} className="grid gap-1.5">
        {!flat && <h3 className={`text-xs font-semibold uppercase tracking-wider ${d === today() ? 'text-accent' : 'text-muted'}`}>{d === today() ? tx('Бүгін') : d === addDays(today(), 1) ? tx('Ертең') : dayLabel(d)}</h3>}
        {items.filter((i) => i.date === d).map((i) => (
          <div key={i.key} className="flex items-start gap-3 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-3 py-2.5">
            <span className="mt-1.5"><Dot k={i.kind} size={10} /></span>
            <span className="flex-1 min-w-0 text-sm"><span className="block break-words font-medium">{i.title}</span>
              {i.note && <span className="block text-muted whitespace-pre-line">{i.note}</span>}
              {i.shown && onRemove && <span className="block text-xs text-accent">{tx('Оқушыларға көрінеді')}</span>}</span>
            {onRemove && i.remove && <button type="button" aria-label={tx('Өшіру')} onClick={() => onRemove(i)} className="size-8 grid place-items-center rounded-md text-muted hover:bg-surface-2"><Icon n="x" size={14} /></button>}
          </div>
        ))}
      </section>
    ))}</div>
  )
}

function StaffCalendar({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const [tab, setTab] = useState<Tab>('week')
  const [day, setDay] = useState(today())
  const [add, setAdd] = useState<Add | null>(null)
  const data = useLoad(async () => {
    if (!cls) return null
    const [j, students, staff] = await Promise.all([listJournal(cls.id), classStudents(cls.id), listStaff()])
    return { ...j, students, staff }
  }, [cls?.id])
  const d = data.data
  const short = (id: string) => d?.students.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const items = useMemo(() => (d ? journalItems(d, short) : []), [d]) // eslint-disable-line react-hooks/exhaustive-deps
  if (classes.loading && !classes.data) return <><PageHead title={tx('Сынып күнтізбесі')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Сынып күнтізбесі')} back /><Empty icon="file" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const staffName = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const remove = (i: Item) => i.remove?.().then(data.reload, (e) => toast(errText(e)))
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сынып күнтізбесі')} back right={<div className="flex items-center gap-2">
        {options.length > 1 && <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/journal/${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>}
        <button type="button" onClick={() => setAdd({ what: tab === 'hours' ? 'hour' : tab === 'album' ? 'photo' : 'event', date: day })} aria-label={tx('Қосу')}
          className="size-11 rounded-full bg-accent text-on-accent grid place-items-center shadow-card"><Icon n="plus" /></button>
      </div>} />
      <Chips label={tx('Бөлім')} value={tab} onChange={setTab} items={[['week', tx('Апта')], ['month', tx('Ай')], ['hours', tx('Тәрбие сағаттары')], ['album', tx('Альбом')]]} />
      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (
        tab === 'week' ? <Week items={items} photos={d.photos} day={day} setDay={setDay} onRemove={remove} />
        : tab === 'month' ? <Month items={items} photos={d.photos} onPick={(x) => { setDay(x); setTab('week') }} />
        : tab === 'hours' ? <Hours classId={cls.id} d={d} staffName={staffName} reload={data.reload} />
        : <Album photos={d.photos} reload={data.reload} />
      )}
      {add && d && <AddSheet classId={cls.id} init={add} students={d.students} people={[cls.teacher_id, cls.tutor_id].filter((x): x is string => !!x)} staffName={staffName}
        onClose={() => setAdd(null)} onDone={() => { setAdd(null); data.reload() }} />}
    </div>
  )
}

type D = Awaited<ReturnType<typeof listJournal>> & { students: Student[] }

/** Everything on the calendar, by date. */
function journalItems(d: Pick<D, 'hours' | 'events' | 'meetings' | 'contacts'>, studentName: (id: string) => string): Item[] {
  return [
    ...d.hours.map((h) => ({ key: 'h' + h.id, date: h.on_date, kind: 'hour' as Kind, title: `${DIRECTION[h.direction] ?? h.direction}: ${h.topic}`, remove: () => removeClassHour(h.id) })),
    ...d.events.map((e) => eventItem(e, () => removeClassEvent(e.id))),
    ...d.meetings.map((m) => ({ key: 'm' + m.id, date: iso(new Date(m.starts_at)), kind: 'mentor' as Kind, title: `${new Date(m.starts_at).toTimeString().slice(0, 5)} · ${studentName(m.student_id)}: ${m.topic}` })),
    ...d.contacts.map((c) => ({ key: 'c' + c.id, date: c.on_date, kind: 'parents' as Kind, title: `${studentName(c.student_id)}: ${c.summary}` })),
  ]
}

/** A week strip with the chosen day below it, then the next two weeks. */
function Week({ items, photos, day, setDay, onRemove }: { items: Item[]; photos: ClassPhoto[]; day: string; setDay: (d: string) => void; onRemove: (i: Item) => void }) {
  const mon = addDays(day, 1 - isoDow(day))
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const todays = items.filter((i) => i.date === day)
  const pics = photos.filter((p) => p.on_date === day)
  const ahead = items.filter((i) => i.date > day && i.date <= addDays(today() > day ? today() : day, 14))
  const [big, setBig] = useState<ClassPhoto | null>(null)
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] items-start">
      <div className="grid gap-3">
        <Card className="grid gap-2 p-3">
          <div className="flex items-center gap-1">
            <button type="button" aria-label={tx('Алдыңғы апта')} onClick={() => setDay(addDays(day, -7))} className="size-9 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="back" size={18} /></button>
            <p className="flex-1 text-center text-sm font-semibold">{fmtDate(week[0])} – {fmtDate(week[6])}</p>
            {day !== today() && <button type="button" onClick={() => setDay(today())} className="h-8 px-3 rounded-full bg-accent-soft text-accent text-xs font-semibold">{tx('Бүгін')}</button>}
            <button type="button" aria-label={tx('Келесі апта')} onClick={() => setDay(addDays(day, 7))} className="size-9 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="chev" size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1">{week.map((w, k) => {
            const kinds = [...new Set(items.filter((i) => i.date === w).map((i) => i.kind))]
            const on = w === day
            return (
              <button key={w} type="button" aria-pressed={on} onClick={() => setDay(w)} aria-label={dayLabel(w)}
                className={`grid justify-items-center gap-1 rounded-lg py-2 ${on ? 'bg-accent text-on-accent' : w === today() ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                <span className={`text-[11px] ${on ? '' : 'text-muted'}`}>{WD_SHORT[k]}</span>
                <span className="text-base font-semibold tabular-nums">{Number(w.slice(8))}</span>
                <span className="flex h-2 gap-0.5">{kinds.slice(0, 3).map((x) => <Dot key={x} k={x} size={6} />)}</span>
              </button>
            )
          })}</div>
        </Card>
        <h2 className="text-sm font-semibold">{day === today() ? tx('Бүгін') : dayLabel(day)}</h2>
        {!todays.length && !pics.length ? <p className="text-sm text-muted">{tx('Бұл күні жазба жоқ.')}</p> : <ItemList items={todays} onRemove={onRemove} flat />}
        {pics.length > 0 && <div className="grid grid-cols-4 gap-1.5">{pics.map((p) => (
          <button key={p.id} type="button" onClick={() => setBig(p)}><img src={photoUrl(p.path)} alt={p.caption ?? tx('{0} күнгі сурет', fmtDate(p.on_date))} className="aspect-square w-full rounded-md object-cover" loading="lazy" /></button>
        ))}</div>}
      </div>
      <div className="grid gap-2">
        <h2 className="text-sm font-semibold">{tx('Алда')}</h2>
        {!ahead.length ? <p className="text-sm text-muted">{tx('Алдағы екі аптада ештеңе жоқ.')}</p> : <ItemList items={ahead} onRemove={onRemove} />}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(Object.keys(KIND) as Kind[]).map((k) => <li key={k} className="flex items-center gap-1.5"><Dot k={k} />{KIND[k][1]}</li>)}
        </ul>
      </div>
      {big && <Viewer p={big} onClose={() => setBig(null)} />}
    </div>
  )
}

function Month({ items, photos, onPick }: { items: Item[]; photos: ClassPhoto[]; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = new Date(y, m - 1, 1 - ((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  const shift = (k: number) => setMonth(iso(new Date(y, m - 1 + k, 1)).slice(0, 7))
  return (
    <Card className="grid gap-3">
      <div className="flex items-center gap-2">
        <button type="button" aria-label={tx('Алдыңғы ай')} onClick={() => shift(-1)} className="size-10 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="back" /></button>
        <h2 className="flex-1 text-center font-semibold capitalize">{MONTHS[m - 1]} {y}</h2>
        <button type="button" aria-label={tx('Келесі ай')} onClick={() => shift(1)} className="size-10 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="chev" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{WD_SHORT.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const its = items.filter((i) => i.date === c), pic = photos.find((p) => p.on_date === c)
          const kinds = [...new Set(its.map((i) => i.kind))]
          return (
            <button key={c} type="button" onClick={() => onPick(c)} aria-label={`${fmtDate(c)}${its.length ? ' · ' + tx('{0} жазба', its.length) : ''}`}
              className={`relative min-h-14 lg:min-h-20 overflow-hidden rounded-md p-1 grid content-start justify-items-center gap-1 text-sm ${c.slice(0, 7) !== month ? 'opacity-40' : ''} ${c === today() ? 'ring-2 ring-accent' : ''} hover:bg-surface-2`}>
              {pic && <img src={photoUrl(pic.path)} alt="" className="absolute inset-0 size-full object-cover opacity-30" loading="lazy" />}
              <span className="relative tabular-nums font-medium">{Number(c.slice(8))}</span>
              <span className="relative flex flex-wrap justify-center gap-0.5">{kinds.map((k) => <Dot key={k} k={k} size={7} />)}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** Class hours: the plan per direction, attendance per student, the log. */
function Hours({ classId, d, staffName, reload }: { classId: string; d: D; staffName: (id: string | null) => string; reload: () => void }) {
  const [dir, setDir] = useState('')
  const [q, setQ] = useState('')
  const [editPlan, setEditPlan] = useState(false)
  const target = (k: string) => d.plan.find((p) => p.direction === k)?.target ?? 0
  const done = (k: string) => d.hours.filter((h) => h.direction === k).length
  const dirs = Object.keys(DIRECTION).filter((k) => editPlan || target(k) > 0 || done(k) > 0)
  const total = d.hours.length, planned = Object.keys(DIRECTION).reduce((s, k) => s + target(k), 0)
  const name = (id: string) => d.students.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const step = (k: string, by: number) => setHourPlan(classId, k, Math.max(0, Math.min(100, target(k) + by))).then(reload, (e) => toast(errText(e)))
  // each student's share of the class hours they attended
  const rate = d.students.map((s) => ({ s, n: d.hours.filter((h) => !h.absent.includes(s.id)).length })).sort((a, b) => a.n - b.n)
  const shown = d.hours.filter((h) => (!dir || h.direction === dir) && (!q || h.topic.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr] items-start">
      <div className="grid gap-3">
        <Card className="grid gap-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-semibold">{tx('Жоспар · {0} / {1}', total, planned || '—')}</p>
            <button type="button" onClick={() => setEditPlan(!editPlan)} className="h-8 px-3 rounded-full bg-surface-2 text-xs font-semibold">{editPlan ? tx('Дайын') : tx('Өзгерту')}</button>
          </div>
          {!dirs.length ? <p className="text-sm text-muted">{tx('Әр бағыт бойынша неше тәрбие сағаты өтетінін белгілеңіз — «Өзгерту».')}</p> : dirs.map((k) => {
            const t = target(k), n = done(k)
            return (
              <div key={k} className="grid gap-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{DIRECTION[k]}</span>
                  {editPlan ? <span className="flex items-center gap-1">
                    <button type="button" aria-label={tx('Азайту')} onClick={() => step(k, -1)} className="size-8 rounded-md bg-surface-2 font-bold">−</button>
                    <span className="w-8 text-center tabular-nums">{t}</span>
                    <button type="button" aria-label={tx('Көбейту')} onClick={() => step(k, 1)} className="size-8 rounded-md bg-surface-2 font-bold">+</button>
                  </span> : <span className={`tabular-nums ${t && n >= t ? 'text-success font-semibold' : 'text-muted'}`}>{n} / {t || '—'}</span>}
                </div>
                {!editPlan && <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-success" style={{ width: `${t ? Math.min(100, (100 * n) / t) : n ? 100 : 0}%` }} /></div>}
              </div>
            )
          })}
        </Card>
        {total > 0 && (
          <details className="rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-4 py-3">
            <summary className="font-semibold cursor-pointer">{tx('Оқушылардың қатысуы')}</summary>
            <ul className="mt-2 grid gap-1.5">{rate.map(({ s, n }) => (
              <li key={s.id} className="grid grid-cols-[1fr_6rem_3rem] items-center gap-2 text-sm">
                <span className="truncate">{s.full_name}</span>
                <span className="h-2 rounded-full bg-surface-2 overflow-hidden"><span className={`block h-full rounded-full ${n / total < 0.7 ? 'bg-danger' : 'bg-success'}`} style={{ width: `${(100 * n) / total}%` }} /></span>
                <span className="text-right tabular-nums text-muted">{Math.round((100 * n) / total)}%</span>
              </li>
            ))}</ul>
          </details>
        )}
      </div>
      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={tx('Бағыты')} value={dir} onChange={(e) => setDir(e.target.value)} className={`${inputCls} h-10 text-sm`}>
            <option value="">{tx('Барлық бағыт')}</option>
            {Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input aria-label={tx('Тақырып бойынша іздеу')} value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} h-10 text-sm`} placeholder={tx('Тақырып бойынша іздеу')} />
        </div>
        {!shown.length ? <Empty icon="file" title={tx('Тәрбие сағаты жоқ')} text={tx('Жоғарыдағы «+» арқылы өткізілген тәрбие сағатын тіркеңіз.')} /> : shown.map((h) => (
          <div key={h.id} className="grid gap-1 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="flex-1 min-w-0"><span className="block text-xs font-semibold text-success">{DIRECTION[h.direction]}</span><span className="block font-semibold break-words">{h.topic}</span></span>
              <button type="button" aria-label={tx('Өшіру')} onClick={() => removeClassHour(h.id).then(reload, (e) => toast(errText(e)))} className="size-8 grid place-items-center rounded-md text-muted hover:bg-surface-2"><Icon n="x" size={14} /></button>
            </div>
            <p className="text-xs text-muted">{fmtDate(h.on_date)} · {staffName(h.led_by)}{h.grp ? ` · ${h.grp}` : ''} · {h.absent.length ? tx('қатыспады: {0}', h.absent.map(name).join(', ')) : tx('бәрі қатысты')}</p>
            {h.note && <p className="text-sm whitespace-pre-line">{h.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Every photo of the class, by month. */
function Album({ photos, reload }: { photos: ClassPhoto[]; reload: () => void }) {
  const [big, setBig] = useState<ClassPhoto | null>(null)
  const months = [...new Set(photos.map((p) => p.on_date.slice(0, 7)))].sort().reverse()
  if (!photos.length) return <Empty icon="heart" title={tx('Альбом бос')} text={tx('Шаралардың суретін «+» арқылы қосыңыз — күнтізбеде сол күнге байланады.')} />
  return (
    <div className="grid gap-4">
      {months.map((mo) => {
        const list = photos.filter((p) => p.on_date.startsWith(mo)).sort((a, b) => b.on_date.localeCompare(a.on_date))
        return (
          <section key={mo} className="grid gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{MONTHS[Number(mo.slice(5)) - 1]} {mo.slice(0, 4)} · {list.length}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">{list.map((p) => (
              <button key={p.id} type="button" onClick={() => setBig(p)} className="relative">
                <img src={photoUrl(p.path)} alt={p.caption ?? tx('{0} күнгі сурет', fmtDate(p.on_date))} className="aspect-square w-full rounded-md object-cover" loading="lazy" />
                {p.caption && <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-black/50 px-1.5 py-0.5 text-left text-[11px] text-white truncate">{p.caption}</span>}
              </button>
            ))}</div>
          </section>
        )
      })}
      {big && <Viewer p={big} onClose={() => setBig(null)} onRemove={() => removeClassPhoto(big.id).then(() => { setBig(null); reload() }, (e) => toast(errText(e)))} />}
    </div>
  )
}

function Viewer({ p, onClose, onRemove }: { p: ClassPhoto; onClose: () => void; onRemove?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 grid grid-rows-[1fr_auto] p-4 gap-3" onClick={onClose} role="dialog" aria-label={tx('Сурет')}>
      <img src={photoUrl(p.path)} alt={p.caption ?? ''} className="m-auto max-h-full max-w-full rounded-md" />
      <div className="flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="flex-1 min-w-0"><span className="block text-sm">{p.caption}</span><span className="block text-xs opacity-70">{dayLabel(p.on_date)}</span></span>
        {onRemove && <button type="button" onClick={onRemove} className="h-10 px-4 rounded-md bg-white/15 text-sm font-semibold">{tx('Өшіру')}</button>}
        <button type="button" onClick={onClose} aria-label={tx('Жабу')} className="size-10 grid place-items-center rounded-md bg-white/15"><Icon n="x" /></button>
      </div>
    </div>
  )
}

/** One sheet for adding anything: an event, a class hour or photos. */
function AddSheet({ classId, init, students, people, staffName, onClose, onDone }: {
  classId: string; init: Add; students: Student[]; people: string[]; staffName: (id: string | null) => string; onClose: () => void; onDone: () => void
}) {
  const { me } = useMe()
  const [what, setWhat] = useState(init.what)
  const [date, setDate] = useState(init.date)
  const [ev, setEv] = useState({ title: '', kind: 'school' as ClassEvent['kind'], time: '', note: '', visible: false })
  const [h, setH] = useState({ direction: 'moral', topic: '', led_by: people.includes(me.id) ? me.id : people[0] ?? '', grp: '', note: '', absent: [] as string[] })
  const [caption, setCaption] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const short = (s: Student) => s.full_name.split(' ').slice(0, 2).join(' ')
  const ready = what === 'event' ? ev.title.trim().length >= 2 : what === 'hour' ? h.topic.trim().length >= 2 : files.length > 0
  const save = async () => {
    setBusy(true)
    try {
      if (what === 'event') await addClassEvent({ class_id: classId, on_date: date, at_time: ev.time || null, kind: ev.kind, title: ev.title.trim(), note: ev.note.trim() || null, visible: ev.visible })
      else if (what === 'hour') await addClassHour({ class_id: classId, on_date: date, direction: h.direction, topic: h.topic.trim(), led_by: h.led_by || null, absent: h.absent, grp: h.grp.trim() || null, note: h.note.trim() || null })
      // photos go to the same day; an event's or class hour's photos are captioned with its title
      const cap = what === 'event' ? ev.title.trim() : what === 'hour' ? h.topic.trim() : caption.trim()
      for (const f of files) await addClassPhoto(classId, date, me.id, f, cap || null)
      toast(what === 'event' && ev.visible ? tx('Сақталды, оқушыларға хабарлама жіберілді') : tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet title={tx('Қосу')} onClose={onClose}>
      <div className="grid gap-3">
        <Chips label={tx('Не қосасыз')} value={what} onChange={setWhat} items={[['event', tx('Оқиға')], ['hour', tx('Тәрбие сағаты')], ['photo', tx('Фото')]]} />
        <input aria-label={tx('Күні')} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} min-w-0`} />
        {what === 'event' && <>
          <input aria-label={tx('Атауы')} value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} maxLength={200} className={inputCls} placeholder={tx('Мысалы: БЖБ, киноклуб, ата-аналар жиналысы')} />
          <Chips label={tx('Түрі')} value={ev.kind} onChange={(kind) => setEv({ ...ev, kind })} items={[['school', KIND.school[1]], ['fun', KIND.fun[1]], ['parents', KIND.parents[1]]]} />
          <input aria-label={tx('Уақыты')} type="time" value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} className={`${inputCls} min-w-0`} />
          <input aria-label={tx('Ескертпе')} value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} maxLength={1000} className={inputCls} placeholder={tx('Ескертпе (міндетті емес): не алып келу керек, қайда')} />
          <label className="flex items-start gap-3 rounded-md bg-surface-2 p-3">
            <input type="checkbox" checked={ev.visible} onChange={(e) => setEv({ ...ev, visible: e.target.checked })} className="mt-0.5 size-5 accent-[var(--accent)]" />
            <span className="text-sm"><span className="block font-semibold">{tx('Оқушыларға көрсету')}</span><span className="block text-muted">{tx('Оқушыларға қазір хабарлама барады, алдыңғы күні кешке еске салынады.')}</span></span>
          </label>
        </>}
        {what === 'hour' && <>
          <select aria-label={tx('Бағыты')} value={h.direction} onChange={(e) => setH({ ...h, direction: e.target.value })} className={inputCls}>
            {Object.entries(DIRECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input aria-label={tx('Тақырыбы')} value={h.topic} onChange={(e) => setH({ ...h, topic: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Тақырыбы')} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label={tx('Кім өткізді')} value={h.led_by} onChange={(e) => setH({ ...h, led_by: e.target.value })} className={inputCls}>
              {people.map((p) => <option key={p} value={p}>{staffName(p)}</option>)}
            </select>
            <input aria-label={tx('Топ (міндетті емес)')} value={h.grp} onChange={(e) => setH({ ...h, grp: e.target.value })} maxLength={100} className={inputCls} placeholder={tx('Топ (міндетті емес)')} />
          </div>
          <Field label={tx('Қатыспағандар · {0}', h.absent.length)}>{() => (
            <div className="flex flex-wrap gap-1.5">{students.map((s) => {
              const on = h.absent.includes(s.id)
              return <button key={s.id} type="button" aria-pressed={on} onClick={() => setH({ ...h, absent: on ? h.absent.filter((x) => x !== s.id) : [...h.absent, s.id] })}
                className={`h-8 px-3 rounded-full text-xs font-semibold ${on ? 'bg-danger-soft text-danger' : 'bg-surface-2'}`}>{short(s)}</button>
            })}</div>
          )}</Field>
          <textarea aria-label={tx('Ескертпе')} value={h.note} onChange={(e) => setH({ ...h, note: e.target.value })} maxLength={2000} className={`${inputCls} h-20 py-2`} placeholder={tx('Ескертпе')} />
        </>}
        {what === 'photo' && <input aria-label={tx('Сипаттама')} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} className={inputCls} placeholder={tx('Сипаттама (міндетті емес): қай шара')} />}
        <label className={`${what === 'photo' ? 'h-24' : 'h-14'} rounded-md border-2 border-dashed border-line grid place-items-center text-sm text-muted cursor-pointer`}>
            <span className="flex items-center gap-2"><Icon n="plus" size={18} />{files.length ? tx('{0} сурет таңдалды', files.length) : what === 'photo' ? tx('Суреттерді таңдау') : tx('Фото қосу (міндетті емес)')}</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          </label>
        <Button onClick={save} loading={busy} disabled={!ready}>{tx('Сақтау')}</Button>
      </div>
    </Sheet>
  )
}
