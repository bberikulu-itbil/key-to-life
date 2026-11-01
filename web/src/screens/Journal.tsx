import { useMemo, useState } from 'react'
import {
  addClassEvent, addClassHour, addClassPhoto, classEventsForMe, classStudents, errText, listClasses, listClassResources, listClassWallets, listJournal, listResources, listStaff, photoUrl, removeClassEvent, removeClassHour,
  removeClassPhoto, setHourPlan, type ClassEvent, type ClassEventStatus, type ClassPhoto, type ClassHour, type ClassWallet, type EventTypeCode, type Media, type MentorMeeting, type Resource, type Staff, type Student,
} from '../lib/api'
import { MONTHS, WD_SHORT, addDays, fmtDate, iso, isoDow, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import ClassEventForm from '../components/ClassEventForm'
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
type Item = { key: string; date: string; kind: Kind; title: string; note?: string | null; shown?: boolean; personal?: boolean; color?: string; status?: ClassEventStatus; types?: EventTypeCode[]; eventId?: string; edit?: () => void; remove?: () => Promise<unknown> }
type Tab = 'week' | 'month' | 'hours' | 'album'
type Add = { what: 'event' | 'hour' | 'photo'; date: string }

const Dot = ({ k, size = 8, color }: { k: Kind; size?: number; color?: string }) => <span className="block shrink-0 rounded-full" style={{ background: color ?? KIND[k][0], width: size, height: size }} />
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

const TYPE_COLORS: Record<string, string> = { sport: '#2563eb', food: '#f59e0b', game: '#8b5cf6', film: '#7c3aed', cleaning: '#0d9488', walk: '#16a34a', outing: '#16a34a', trip: '#0891b2', hour_lead: '#16a34a', hour_parent: '#9333ea', meeting: '#64748b', parent_activity: '#ec4899', visit: '#ec4899', mentor: '#2563eb', exam: '#dc2626', birthday: '#db2777', competition: '#dc2626', other: '#6b7280' }
const TYPE_LABELS: Record<EventTypeCode, string> = {
  sport: tx('Спорт'), food: tx('Тамақ'), game: tx('Ойын'), film: tx('Фильм'), cleaning: tx('Тазалық'), walk: tx('Серуен'), outing: tx('Қыдыру'), trip: tx('Саяхат'),
  hour_lead: tx('Жетекші тәрбие сағаты'), hour_parent: tx('Ата-ана тәрбие сағаты'), meeting: tx('Жиналыс'), parent_activity: tx('Ата-ана белсенділігі'),
  visit: tx('Қонаққа бару'), mentor: tx('Жеке кездесу'), exam: tx('Емтихан'), birthday: tx('Туған күн'), competition: tx('Жарыс'), other: tx('Басқа'),
}
const TYPE_ORDER: EventTypeCode[] = ['sport', 'food', 'game', 'film', 'cleaning', 'walk', 'outing', 'trip', 'hour_lead', 'hour_parent', 'meeting', 'parent_activity', 'visit', 'mentor', 'exam', 'birthday', 'competition', 'other']
const typeLabel = (code: EventTypeCode) => TYPE_LABELS[code] ?? code
const eventKind = (e: ClassEvent): Kind => {
  const codes = e.type_codes ?? []
  if (codes.some((x) => ['mentor', 'meeting'].includes(x))) return 'mentor'
  if (codes.some((x) => ['visit', 'parent_activity', 'hour_parent'].includes(x))) return 'parents'
  if (codes.some((x) => ['film', 'sport', 'food', 'game', 'cleaning', 'walk', 'outing', 'trip'].includes(x))) return 'fun'
  if (codes.some((x) => ['hour_lead'].includes(x))) return 'hour'
  return e.kind as Kind
}
const eventColor = (e: ClassEvent) => TYPE_COLORS[(e.type_codes ?? [])[0]] ?? KIND[eventKind(e)][0]
const eventPersonal = (e: ClassEvent) => (e.type_codes ?? []).some((x) => ['mentor', 'visit'].includes(x))
const eventStatus = (e: ClassEvent) => e.status === 'postponed' ? tx('Кейінге қалдырылды') : e.status === 'passed' ? tx('Өтті') : e.status === 'archived' ? tx('Мұрағатта') : ''

const eventItem = (e: ClassEvent, remove?: () => Promise<unknown>, edit?: () => void): Item => {
  const time = e.at_time ? e.at_time.slice(0, 5) + (e.end_time ? '–' + e.end_time.slice(0, 5) : '') + ' · ' : ''
  const state = eventStatus(e)
  return { key: 'e' + e.id, date: e.on_date, kind: eventKind(e), title: time + e.title + (state ? ' · ' + state : ''), note: [e.place, e.note].filter(Boolean).join(' · ') || null, shown: e.visible, personal: eventPersonal(e), color: eventColor(e), status: e.status, types: e.type_codes ?? [], eventId: e.id, remove, edit }
}
/** Items grouped under their dates. */
function ItemList({ items, onRemove, flat }: { items: Item[]; onRemove?: (i: Item) => void; flat?: boolean }) {
  const days = [...new Set(items.map((i) => i.date))].sort()
  return (
    <div className="grid gap-3">{days.map((d) => (
      <section key={d} className="grid gap-1.5">
        {!flat && <h3 className={`text-xs font-semibold uppercase tracking-wider ${d === today() ? 'text-accent' : 'text-muted'}`}>{d === today() ? tx('Бүгін') : d === addDays(today(), 1) ? tx('Ертең') : dayLabel(d)}</h3>}
        {items.filter((i) => i.date === d).map((i) => (
          <div key={i.key} className="flex items-start gap-3 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-3 py-2.5">
            <span className="mt-1.5"><Dot k={i.kind} color={i.color} size={10} /></span>
            <span className="flex-1 min-w-0 text-sm"><span className="block break-words font-medium">{i.title}</span>
              {i.note && <span className="block text-muted whitespace-pre-line">{i.note}</span>}
              {i.shown && onRemove && <span className="block text-xs text-accent">{tx('Оқушыларға көрінеді')}</span>}</span>
            {i.edit && <button type="button" onClick={i.edit} className="h-8 px-2 rounded-md text-xs font-semibold text-accent hover:bg-surface-2">{tx('Өзгерту')}</button>}
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
  const [filter, setFilter] = useState<'all' | 'personal' | 'archive'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | EventTypeCode>('all')
  const [showPhotos, setShowPhotos] = useState(true)
  const [add, setAdd] = useState<Add | null>(null)
  const [editing, setEditing] = useState<ClassEvent | null>(null)
  const data = useLoad(async () => {
    if (!cls) return null
    const [j, students, staff, places, resourceData, wallets] = await Promise.all([listJournal(cls.id), classStudents(cls.id), listStaff(), listResources(), listClassResources(cls.id), listClassWallets(cls.id)])
    return { ...j, students, staff, places, media: resourceData.media, wallets }
  }, [cls?.id])
  const d = data.data
  const short = (id: string) => d?.students.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const editEvent = (e: ClassEvent) => setEditing(e)
  const items = useMemo(() => (d ? journalItems(d, short, editEvent) : []), [d]) // eslint-disable-line react-hooks/exhaustive-deps
  const typeOptions = useMemo(() => TYPE_ORDER.filter((code) => d?.events.some((e) => (e.type_codes ?? []).includes(code))), [d])
  const visibleItems = useMemo(() => {
    const base = filter === 'archive' ? items.filter((x) => x.status === 'archived') : filter === 'personal' ? items.filter((x) => x.personal && x.status !== 'archived') : items.filter((x) => x.status !== 'archived')
    return typeFilter === 'all' ? base : base.filter((x) => x.types?.includes(typeFilter))
  }, [items, filter, typeFilter])
  const visiblePhotos = useMemo(() => {
    if (!showPhotos || !d) return []
    if (typeFilter === 'all') return d.photos
    return d.photos.filter((p) => !!p.event_id && d.events.some((e) => e.id === p.event_id && (e.type_codes ?? []).includes(typeFilter)))
  }, [d, showPhotos, typeFilter])
  if (classes.loading && !classes.data) return <><PageHead title={tx('Сынып күнтізбесі')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Сынып күнтізбесі')} back /><Empty icon="file" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const staffName = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const remove = (i: Item) => i.remove?.().then(data.reload, (e) => toast(errText(e)))
  const closeForm = () => { setAdd(null); setEditing(null) }
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сынып күнтізбесі')} back right={<div className="flex items-center gap-2">
        {options.length > 1 && <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/journal/${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>}
        <button type="button" onClick={() => { setEditing(null); setAdd({ what: tab === 'hours' ? 'hour' : tab === 'album' ? 'photo' : 'event', date: day }) }} aria-label={tx('Қосу')} className="size-11 rounded-full bg-accent text-on-accent grid place-items-center shadow-card"><Icon n="plus" /></button>
      </div>} />
      <Chips label={tx('Бөлім')} value={tab} onChange={setTab} items={[['week', tx('Апта')], ['month', tx('Ай')], ['hours', tx('Тәрбие сағаттары')], ['album', tx('Альбом')]]} />
      {tab !== 'hours' && tab !== 'album' && <Chips label={tx('Сүзгі')} value={filter} onChange={setFilter} items={[['all', tx('Барлығы')], ['personal', tx('Жеке оқиғалар')], ['archive', tx('Мұрағат')]]} />}
      {tab !== 'hours' && <>
        {tab !== 'album' && <button type="button" role="switch" aria-checked={showPhotos} onClick={() => setShowPhotos(!showPhotos)} className={`h-10 rounded-md text-sm font-semibold ${showPhotos ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>{showPhotos ? tx('Суреттер көрсетілуде') : tx('Суреттер жасырылды')}</button>}
        <div className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Іс-шара типі')}</span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setTypeFilter('all')} className={`h-9 px-3 rounded-full text-sm ${typeFilter === 'all' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Барлығы')}</button>
            {typeOptions.map((code) => <button key={code} type="button" onClick={() => setTypeFilter(code)} className={`h-9 px-3 rounded-full text-sm ${typeFilter === code ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{typeLabel(code)}</button>)}
          </div>
        </div>
      </>}

      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (
        tab === 'week' ? <Week items={visibleItems} photos={visiblePhotos} events={d.events} day={day} setDay={setDay} onRemove={remove} />
        : tab === 'month' ? <Month items={visibleItems} photos={visiblePhotos} onPick={(x) => { setDay(x); setTab('week') }} />
        : tab === 'hours' ? <Hours classId={cls.id} d={d} staffName={staffName} reload={data.reload} />
        : <Album photos={visiblePhotos} events={d.events} reload={data.reload} />
      )}
      {(add?.what === 'event' || editing) && d && <Sheet title={editing ? tx('Оқиғаны өзгерту') : tx('Оқиға қосу')} onClose={closeForm}>
        <ClassEventForm classId={cls.id} date={add?.date ?? editing?.on_date ?? day} existing={editing ?? undefined} students={d.students} staff={d.staff} places={d.places} media={d.media} meetings={d.meetings} hours={d.hours} wallets={d.wallets} meId={me.id} onDone={() => { closeForm(); data.reload() }} />
      </Sheet>}
      {add && add.what !== 'event' && d && <AddSheet classId={cls.id} init={add} students={d.students} events={d.events} people={[cls.teacher_id, cls.tutor_id].filter((x): x is string => !!x)} staffName={staffName}
        onClose={() => setAdd(null)} onDone={() => { setAdd(null); data.reload() }} />}
    </div>
  )
}
type D = Awaited<ReturnType<typeof listJournal>> & { students: Student[]; staff: Staff[]; places: Resource[]; media: Media[]; wallets: ClassWallet[] }

/** Everything on the calendar, by date. */
function journalItems(d: Pick<D, 'hours' | 'events' | 'meetings' | 'contacts'>, studentName: (id: string) => string, edit?: (e: ClassEvent) => void): Item[] {
  return [
    ...d.hours.map((h) => ({ key: 'h' + h.id, date: h.on_date, kind: 'hour' as Kind, title: (DIRECTION[h.direction] ?? h.direction) + ': ' + h.topic, remove: () => removeClassHour(h.id) })),
    ...d.events.map((e) => eventItem(e, () => removeClassEvent(e.id), () => edit?.(e))),
    ...d.meetings.map((m) => ({ key: 'm' + m.id, date: iso(new Date(m.starts_at)), kind: 'mentor' as Kind, title: new Date(m.starts_at).toTimeString().slice(0, 5) + ' · ' + studentName(m.student_id) + ': ' + m.topic, personal: true })),
    ...d.contacts.map((c) => ({ key: 'c' + c.id, date: c.on_date, kind: 'parents' as Kind, title: studentName(c.student_id) + ': ' + c.summary, personal: true })),
  ]
}
const photoEventTitle = (p: ClassPhoto, events: ClassEvent[]) => p.event_id ? events.find((e) => e.id === p.event_id)?.title ?? null : null

/** A week strip with the chosen day below it, then the next two weeks. */
function Week({ items, photos, events, day, setDay, onRemove }: { items: Item[]; photos: ClassPhoto[]; events: ClassEvent[]; day: string; setDay: (d: string) => void; onRemove: (i: Item) => void }) {
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
        {pics.length > 0 && <div className="grid grid-cols-4 gap-1.5">{pics.map((p) => {
          const linked = photoEventTitle(p, events)
          return <button key={p.id} type="button" onClick={() => setBig(p)} className="relative">
            <img src={photoUrl(p.path)} alt={linked ?? p.caption ?? tx('{0} күнгі сурет', fmtDate(p.on_date))} className="aspect-square w-full rounded-md object-cover" loading="lazy" />
            {(linked || p.caption) && <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-black/55 px-1 py-0.5 text-left text-[10px] text-white truncate">{linked ?? p.caption}</span>}
          </button>
        })}</div>}
      </div>
      <div className="grid gap-2">
        <h2 className="text-sm font-semibold">{tx('Алда')}</h2>
        {!ahead.length ? <p className="text-sm text-muted">{tx('Алдағы екі аптада ештеңе жоқ.')}</p> : <ItemList items={ahead} onRemove={onRemove} />}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(Object.keys(KIND) as Kind[]).map((k) => <li key={k} className="flex items-center gap-1.5"><Dot k={k} />{KIND[k][1]}</li>)}
        </ul>
      </div>
      {big && <Viewer p={big} eventTitle={photoEventTitle(big, events)} onClose={() => setBig(null)} />}
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
function Album({ photos, events, reload }: { photos: ClassPhoto[]; events: ClassEvent[]; reload: () => void }) {
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
                <img src={photoUrl(p.path)} alt={photoEventTitle(p, events) ?? p.caption ?? tx('{0} күнгі сурет', fmtDate(p.on_date))} className="aspect-square w-full rounded-md object-cover" loading="lazy" />
                {(photoEventTitle(p, events) || p.caption) && <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-black/50 px-1.5 py-0.5 text-left text-[11px] text-white truncate">{photoEventTitle(p, events) ?? p.caption}</span>}
              </button>
            ))}</div>
          </section>
        )
      })}
      {big && <Viewer p={big} eventTitle={photoEventTitle(big, events)} onClose={() => setBig(null)} onRemove={() => removeClassPhoto(big.id).then(() => { setBig(null); reload() }, (e) => toast(errText(e)))} />}
    </div>
  )
}

function Viewer({ p, eventTitle, onClose, onRemove }: { p: ClassPhoto; eventTitle?: string | null; onClose: () => void; onRemove?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 grid grid-rows-[1fr_auto] p-4 gap-3" onClick={onClose} role="dialog" aria-label={tx('Сурет')}>
      <img src={photoUrl(p.path)} alt={p.caption ?? ''} className="m-auto max-h-full max-w-full rounded-md" />
      <div className="flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="flex-1 min-w-0">{eventTitle && <span className="block text-sm font-semibold">{tx('Іс-шара')}: {eventTitle}</span>}{p.caption && p.caption !== eventTitle && <span className="block text-sm">{p.caption}</span>}<span className="block text-xs opacity-70">{dayLabel(p.on_date)}</span></span>
        {onRemove && <button type="button" onClick={onRemove} className="h-10 px-4 rounded-md bg-white/15 text-sm font-semibold">{tx('Өшіру')}</button>}
        <button type="button" onClick={onClose} aria-label={tx('Жабу')} className="size-10 grid place-items-center rounded-md bg-white/15"><Icon n="x" /></button>
      </div>
    </div>
  )
}

/** One sheet for adding anything: an event, a class hour or photos. */
function AddSheet({ classId, init, students, events, people, staffName, onClose, onDone }: {
  classId: string; init: Add; students: Student[]; events: ClassEvent[]; people: string[]; staffName: (id: string | null) => string; onClose: () => void; onDone: () => void
  existing?: ClassEvent; staff?: Staff[]; places?: Resource[]; media?: Media[]; meetings?: MentorMeeting[]; hours?: ClassHour[]; wallets?: ClassWallet[]
}) {
  const { me } = useMe()
  const [what, setWhat] = useState(init.what)
  const [date, setDate] = useState(init.date)
  const [ev] = useState({ title: '', kind: 'school' as ClassEvent['kind'], time: '', note: '', visible: false })
  const [h, setH] = useState({ direction: 'moral', topic: '', led_by: people.includes(me.id) ? me.id : people[0] ?? '', grp: '', note: '', absent: [] as string[] })
  const [caption, setCaption] = useState('')
  const [eventId, setEventId] = useState('')
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
      for (const f of files) await addClassPhoto(classId, date, me.id, f, cap || null, what === 'photo' ? eventId || null : null)
      toast(what === 'event' && ev.visible ? tx('Сақталды, оқушыларға хабарлама жіберілді') : tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet title={tx('Қосу')} onClose={onClose}>
      <div className="grid gap-3">
        <Chips label={tx('Не қосасыз')} value={what} onChange={setWhat} items={[['event', tx('Оқиға')], ['hour', tx('Тәрбие сағаты')], ['photo', tx('Фото')]]} />
        <input aria-label={tx('Күні')} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} min-w-0`} />
        {what === 'event' && <p className="text-sm text-muted">{tx('Оқиға формасы бөлек ашылды.')}</p>}
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
        {what === 'photo' && <>
          <input aria-label={tx('Сипаттама')} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} className={inputCls} placeholder={tx('Сипаттама (міндетті емес): қай шара')} />
          <select aria-label={tx('Іс-шара')} value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputCls}>
            <option value="">{tx('Іс-шарамен байланыстырмау')}</option>
            {events.filter((e) => e.on_date === date && e.status !== 'archived').map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </>}
{what !== 'event' && (
        <label className={`${what === 'photo' ? 'h-24' : 'h-14'} rounded-md border-2 border-dashed border-line grid place-items-center text-sm text-muted cursor-pointer`}>
            <span className="flex items-center gap-2"><Icon n="plus" size={18} />{files.length ? tx('{0} сурет таңдалды', files.length) : what === 'photo' ? tx('Суреттерді таңдау') : tx('Фото қосу (міндетті емес)')}</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          </label>
        )}
        {what !== 'event' && <Button onClick={save} loading={busy} disabled={!ready}>{tx('Сақтау')}</Button>}
      </div>
    </Sheet>
  )
}
