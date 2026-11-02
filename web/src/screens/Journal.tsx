import { useMemo, useState } from 'react'
import {
  addClassEvent, addClassHour, addClassPhoto, addParentContact, classEventsForMe, classStudents, errText, listClasses, listClassResources, listClassWallets, listJournal, listResources, listStaff, photoUrl, removeClassEvent, removeClassHour,
  removeClassPhoto, removeParentContact, setHourPlan, type ClassEvent, type ClassPhoto, type ClassHour, type ClassWallet, type EventTypeCode, type Media, type MentorMeeting, type Resource, type Staff, type Student,
} from '../lib/api'
import { WD_SHORT, addDays, fmtDate, iso, isoDow, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import ClassEventForm from '../components/ClassEventForm'
import ClassCalendarView, { type CalItem } from '../components/ClassCalendarView'
import { tx } from '../lib/i18n'

/* «Сынып күнтізбесі» — the class calendar (week and month), class hours with their plan, and parent involvement.
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
type Item = CalItem
type Tab = 'calendar' | 'hours' | 'parents' | 'week' | 'month'
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
  const rows = useMemo(() => list.data ?? [], [list.data])
  const [mode, setMode] = useState<'calendar' | 'list'>('calendar')
  const items = useMemo(() => rows.map((e) => eventItem(e)), [rows])
  const upcoming = useMemo(() => rows.filter((e) => e.on_date >= today()), [rows])

  return (
    <div className="grid gap-3 pb-6">
      <PageHead
        title={tx('Сынып күнтізбесі')}
        back
        right={
          <Chips
            label={tx('Көрініс')}
            value={mode}
            onChange={setMode}
            items={[['calendar', tx('Күнтізбе')], ['list', tx('Тізім')]]}
          />
        }
      />
      {list.loading && !list.data ? (
        <Skeleton />
      ) : list.error ? (
        <ErrorBox text={list.error} retry={list.reload} />
      ) : mode === 'calendar' ? (
        <ClassCalendarView
          items={items}
          photos={[]}
          onAdd={() => {}}
          onEdit={() => {}}
          classTitle={me.class?.name ?? tx('Сынып күнтізбесі')}
          typeLabels={TYPE_LABELS}
        />
      ) : !upcoming.length ? (
        <Empty
          icon="clock"
          title={tx('Алда оқиға жоқ')}
          text={tx('Сынып жетекшісі не тәрбиеші оқиға қосса, осында шығады және хабарлама келеді.')}
        />
      ) : (
        <ItemList items={upcoming.map((e) => eventItem(e))} />
      )}
    </div>
  )
}

const TYPE_COLORS: Record<string, string> = { sport: '#2563eb', food: '#f59e0b', game: '#8b5cf6', film: '#7c3aed', cleaning: '#0d9488', walk: '#16a34a', outing: '#16a34a', trip: '#0891b2', hour_lead: '#16a34a', hour_parent: '#9333ea', meeting: '#64748b', parent_activity: '#ec4899', visit: '#ec4899', mentor: '#2563eb', exam: '#dc2626', birthday: '#db2777', competition: '#dc2626', other: '#6b7280' }
const TYPE_LABELS: Record<EventTypeCode, string> = {
  sport: tx('Спорт'), food: tx('Тамақ'), game: tx('Ойын'), film: tx('Фильм'), cleaning: tx('Тазалық'), walk: tx('Серуен'), outing: tx('Қыдыру'), trip: tx('Саяхат'),
  hour_lead: tx('Жетекші тәрбие сағаты'), hour_parent: tx('Ата-ана тәрбие сағаты'), meeting: tx('Жиналыс'), parent_activity: tx('Ата-ана белсенділігі'),
  visit: tx('Қонаққа бару'), mentor: tx('Жеке кездесу'), exam: tx('Емтихан'), birthday: tx('Туған күн'), competition: tx('Жарыс'), other: tx('Басқа'),
}
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
  const time = e.at_time ? e.at_time.slice(0, 5) + (e.end_time ? '–' + e.end_time.slice(0, 5) : '') : ''
  const state = eventStatus(e)
  const audLabel = e.audience && e.audience !== 'all' ? (
    e.audience === 'students' ? ' · 🎓 ' + tx('Оқушылар')
    : e.audience === 'teachers' ? ' · 👨‍🏫 ' + tx('Мұғалімдер')
    : e.audience === 'tutors' ? ' · 🏠 ' + tx('Тәрбиешілер')
    : ' · 💼 ' + tx('Ұстаздар')
  ) : ''
  return {
    key: 'e' + e.id,
    date: e.on_date,
    kind: eventKind(e),
    title: (time ? time + ' · ' : '') + e.title + audLabel + (state ? ' · ' + state : ''),
    note: [e.place, e.note].filter(Boolean).join(' · ') || null,
    shown: e.visible,
    personal: eventPersonal(e),
    color: eventColor(e),
    status: e.status,
    types: e.type_codes ?? [],
    eventId: e.id,
    remove,
    edit,
    time: e.at_time ? e.at_time.slice(0, 5) : undefined,
    place: e.place,
    rawEvent: e,
    audience: e.audience,
  }
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
  const isSchool = classId === 'school'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = isSchool ? null : (options.find((c) => c.id === classId) ?? mine[0] ?? options[0])
  const [tab, setTab] = useState<Tab>('calendar')
  const [audFilter, setAudFilter] = useState<string>('all')
  const [day, setDay] = useState(today())
  const [add, setAdd] = useState<Add | null>(null)
  const [editing, setEditing] = useState<ClassEvent | null>(null)
  const [parentDefaultType, setParentDefaultType] = useState<EventTypeCode | undefined>(undefined)
  const data = useLoad(async () => {
    if (isSchool) {
      const [j, staff, places] = await Promise.all([listJournal('school'), listStaff(), listResources()])
      return { ...j, students: [] as Student[], staff, places, media: [] as Media[], wallets: [] as ClassWallet[] }
    }
    if (!cls) return null
    const [j, students, staff, places, resourceData, wallets] = await Promise.all([listJournal(cls.id), classStudents(cls.id), listStaff(), listResources(), listClassResources(cls.id), listClassWallets(cls.id)])
    return { ...j, students, staff, places, media: resourceData.media, wallets }
  }, [isSchool, cls?.id])
  const d = data.data
  const short = (id: string) => d?.students.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const editEvent = (e: ClassEvent) => setEditing(e)
  const items = useMemo(() => {
    if (!d) return []
    if (isSchool) {
      return d.events.map((e) => eventItem(e, deputy ? () => removeClassEvent(e.id) : undefined, deputy ? () => editEvent(e) : undefined))
    }
    const classItems = journalItems(d, short, editEvent)
    const schoolItems = (d.schoolEvents ?? []).map((e) => ({
      ...eventItem(e, deputy ? () => removeClassEvent(e.id) : undefined, deputy ? () => editEvent(e) : undefined),
      title: '🏛️ ' + e.title,
      isSchoolEvent: true,
    }))
    return [...classItems, ...schoolItems]
  }, [d, isSchool, deputy]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(() => {
    if (!isSchool || audFilter === 'all') return items
    return items.filter((i) => {
      const a = i.rawEvent?.audience ?? 'all'
      if (audFilter === 'students') return a === 'students' || a === 'all'
      if (audFilter === 'teachers') return a === 'teachers' || a === 'staff' || a === 'all'
      if (audFilter === 'tutors') return a === 'tutors' || a === 'staff' || a === 'all'
      if (audFilter === 'staff') return a === 'staff' || a === 'teachers' || a === 'tutors' || a === 'all'
      return true
    })
  }, [items, isSchool, audFilter])

  if (classes.loading && !classes.data) return <><PageHead title={isSchool ? tx('Мектеп күнтізбесі') : tx('Сынып күнтізбесі')} back /><Skeleton /></>
  if (!isSchool && !cls) return <><PageHead title={tx('Сынып күнтізбесі')} back /><Empty icon="file" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const staffName = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const closeForm = () => { setAdd(null); setEditing(null); setParentDefaultType(undefined) }
  const canAdd = isSchool ? deputy : true

  return (
    <div className="grid gap-3 pb-6">
      <PageHead
        title={isSchool ? tx('Мектеп күнтізбесі') : tx('Сынып күнтізбесі')}
        back
        right={
          <div className="flex items-center gap-2">
            <select
              aria-label={tx('Сынып немесе мектеп')}
              value={isSchool ? 'school' : cls?.id}
              onChange={(e) => go(`/journal/${e.target.value}`)}
              className={`${inputCls} w-auto font-medium`}
            >
              <option value="school">{tx('Мектеп күнтізбесі')}</option>
              {options.length > 0 && (
                <optgroup label={tx('Сыныптар')}>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {canAdd && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setParentDefaultType(tab === 'parents' ? 'parent_activity' : undefined)
                  setAdd({ what: !isSchool && tab === 'hours' ? 'hour' : 'event', date: day })
                }}
                aria-label={tx('Қосу')}
                className="size-11 rounded-full bg-accent text-on-accent grid place-items-center shadow-card"
              >
                <Icon n="plus" />
              </button>
            )}
          </div>
        }
      />

      {isSchool ? (
        <Chips
          label={tx('Аудитория')}
          value={audFilter}
          onChange={setAudFilter}
          items={[
            ['all', tx('Барлығы')],
            ['students', tx('Оқушылар')],
            ['teachers', tx('Мұғалімдер')],
            ['tutors', tx('Тәрбиешілер')],
            ['staff', tx('Ұстаздар')],
          ]}
        />
      ) : (
        <Chips
          label={tx('Бөлім')}
          value={tab === 'week' || tab === 'month' ? 'calendar' : tab}
          onChange={setTab}
          items={[
            ['calendar', tx('Күнтізбе')],
            ['hours', tx('Тәрбие сағаттары')],
            ['parents', tx('Ата-ана (қонақ, белсенділік)')],
          ]}
        />
      )}

      {data.loading && !d ? (
        <Skeleton />
      ) : data.error ? (
        <ErrorBox text={data.error} retry={data.reload} />
      ) : (
        d && (
          isSchool || tab === 'calendar' || tab === 'week' || tab === 'month' ? (
            <ClassCalendarView
              items={filteredItems}
              photos={d.photos}
              onAdd={canAdd ? (date) => { setEditing(null); setParentDefaultType(undefined); setDay(date); setAdd({ what: 'event', date }) } : () => {}}
              onEdit={canAdd ? editEvent : () => {}}
              classTitle={isSchool ? tx('Мектеп күнтізбесі') : `${cls?.name} ${tx('сыныбы')}`}
              typeLabels={TYPE_LABELS}
            />
          ) : tab === 'hours' && cls ? (
            <Hours classId={cls.id} d={d} staffName={staffName} reload={data.reload} />
          ) : cls ? (
            <ParentsTab
              classId={cls.id}
              d={d}
              staffName={staffName}
              onAddEvent={(defaultType) => {
                setEditing(null)
                setParentDefaultType(defaultType)
                setDay(today())
                setAdd({ what: 'event', date: today() })
              }}
              onEditEvent={editEvent}
              reload={data.reload}
            />
          ) : null
        )
      )}

      {(add?.what === 'event' || editing) && d && (
        <Sheet title={editing ? tx('Оқиғаны өзгерту') : (isSchool ? tx('Мектеп оқиғасын қосу') : tx('Оқиға қосу'))} onClose={closeForm}>
          <ClassEventForm
            classId={isSchool ? 'school' : cls?.id ?? ''}
            date={add?.date ?? editing?.on_date ?? day}
            existing={editing ?? undefined}
            defaultTypes={parentDefaultType ? [parentDefaultType] : undefined}
            students={d.students}
            staff={d.staff}
            places={d.places}
            media={d.media}
            meetings={d.meetings}
            hours={d.hours}
            wallets={d.wallets}
            meId={me.id}
            onDone={() => {
              closeForm()
              data.reload()
            }}
          />
        </Sheet>
      )}

      {add && add.what !== 'event' && d && cls && (
        <AddSheet
          classId={cls.id}
          init={add}
          students={d.students}
          events={d.events}
          people={[cls.teacher_id, cls.tutor_id].filter((x): x is string => !!x)}
          staffName={staffName}
          onClose={() => setAdd(null)}
          onDone={() => {
            setAdd(null)
            data.reload()
          }}
        />
      )}
    </div>
  )
}
type D = Awaited<ReturnType<typeof listJournal>> & { students: Student[]; staff: Staff[]; places: Resource[]; media: Media[]; wallets: ClassWallet[] }

/** Everything on the calendar, by date. */
function journalItems(d: Pick<D, 'hours' | 'events' | 'meetings' | 'contacts'>, studentName: (id: string) => string, edit?: (e: ClassEvent) => void): Item[] {
  return [
    ...d.hours.map((h) => ({
      key: 'h' + h.id,
      date: h.on_date,
      kind: 'hour' as Kind,
      title: (DIRECTION[h.direction] ?? h.direction) + ': ' + h.topic,
      color: '#16a34a',
      types: ['hour_lead' as EventTypeCode],
      remove: () => removeClassHour(h.id),
    })),
    ...d.events.map((e) => eventItem(e, () => removeClassEvent(e.id), () => edit?.(e))),
    ...d.meetings.map((m) => {
      const time = new Date(m.starts_at).toTimeString().slice(0, 5)
      return {
        key: 'm' + m.id,
        date: iso(new Date(m.starts_at)),
        kind: 'mentor' as Kind,
        title: studentName(m.student_id) + ': ' + m.topic,
        color: '#2563eb',
        types: ['mentor' as EventTypeCode],
        time,
        personal: true,
        place: m.place,
      }
    }),
    ...d.contacts.map((c) => ({
      key: 'c' + c.id,
      date: c.on_date,
      kind: 'parents' as Kind,
      title: studentName(c.student_id) + ': ' + c.summary,
      color: '#9333ea',
      types: ['visit' as EventTypeCode],
      personal: true,
    })),
  ]
}
const photoEventTitle = (p: ClassPhoto, events: ClassEvent[]) => p.event_id ? events.find((e) => e.id === p.event_id)?.title ?? null : null



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

/** Parents tab: home visits, parent activities, parent-led hours, and meetings. */
function ParentsTab({
  classId,
  d,
  staffName,
  onAddEvent,
  onEditEvent,
  reload,
}: {
  classId: string
  d: D
  staffName: (id: string | null) => string
  onAddEvent: (defaultType?: EventTypeCode) => void
  onEditEvent: (e: ClassEvent) => void
  reload: () => void
}) {
  const [filter, setFilter] = useState<string>('all')
  const [q, setQ] = useState('')
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState({
    student_id: d.students[0]?.id ?? '',
    on_date: today(),
    channel: 'visit' as 'visit' | 'meeting',
    summary: '',
  })
  const [contactBusy, setContactBusy] = useState(false)
  const [viewPhoto, setViewPhoto] = useState<ClassPhoto | null>(null)

  const studentName = (id: string | null) => d.students.find((s) => s.id === id)?.full_name ?? '—'

  // Parent events from class events
  const parentEvents = useMemo(() => {
    return d.events.filter((e) => {
      const codes = e.type_codes ?? []
      return e.kind === 'parents' || codes.some((x) => ['visit', 'parent_activity', 'hour_parent', 'meeting'].includes(x))
    })
  }, [d.events])

  // Statistics
  const visitCount = useMemo(() => {
    const evVisits = parentEvents.filter((e) => (e.type_codes ?? []).includes('visit')).length
    const ctVisits = d.contacts.filter((c) => c.channel === 'visit').length
    return evVisits + ctVisits
  }, [parentEvents, d.contacts])

  const activityCount = useMemo(() => {
    return parentEvents.filter((e) => (e.type_codes ?? []).includes('parent_activity')).length
  }, [parentEvents])

  const hourParentCount = useMemo(() => {
    return parentEvents.filter((e) => (e.type_codes ?? []).includes('hour_parent')).length
  }, [parentEvents])

  // Unique students covered across parent contacts and participants
  const coveredStudents = useMemo(() => {
    const ids = new Set<string>()
    for (const c of d.contacts) {
      if (c.student_id) ids.add(c.student_id)
    }
    for (const e of parentEvents) {
      for (const p of e.participants ?? []) {
        if (p.kind === 'student' && p.student_id) ids.add(p.student_id)
      }
    }
    return ids
  }, [d.contacts, parentEvents])

  const totalStudents = d.students.length

  // Combined list of entries (events + contacts)
  type ParentEntry =
    | { kind: 'event'; date: string; event: ClassEvent; id: string }
    | { kind: 'contact'; date: string; contact: typeof d.contacts[0]; id: string }

  const entries: ParentEntry[] = useMemo(() => {
    const list: ParentEntry[] = [
      ...parentEvents.map((e) => ({ kind: 'event' as const, date: e.on_date, event: e, id: 'e-' + e.id })),
      ...d.contacts.map((c) => ({ kind: 'contact' as const, date: c.on_date, contact: c, id: 'c-' + c.id })),
    ]
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [parentEvents, d.contacts])

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      // Type filter
      if (filter === 'visit') {
        if (item.kind === 'event') {
          if (!(item.event.type_codes ?? []).includes('visit')) return false
        } else {
          if (item.contact.channel !== 'visit') return false
        }
      } else if (filter === 'parent_activity') {
        if (item.kind !== 'event' || !(item.event.type_codes ?? []).includes('parent_activity')) return false
      } else if (filter === 'hour_parent') {
        if (item.kind !== 'event' || !(item.event.type_codes ?? []).includes('hour_parent')) return false
      } else if (filter === 'meeting') {
        if (item.kind === 'event') {
          if (!(item.event.type_codes ?? []).includes('meeting')) return false
        } else {
          if (item.contact.channel !== 'meeting') return false
        }
      }

      // Search query
      if (q.trim()) {
        const query = q.toLowerCase()
        if (item.kind === 'event') {
          const title = item.event.title.toLowerCase()
          const note = (item.event.note ?? '').toLowerCase()
          const place = (item.event.place ?? '').toLowerCase()
          const studentMatches = (item.event.participants ?? []).some((p) => p.label.toLowerCase().includes(query))
          if (!title.includes(query) && !note.includes(query) && !place.includes(query) && !studentMatches) return false
        } else {
          const sName = studentName(item.contact.student_id).toLowerCase()
          const summary = item.contact.summary.toLowerCase()
          if (!sName.includes(query) && !summary.includes(query)) return false
        }
      }

      return true
    })
  }, [entries, filter, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveContact = async () => {
    if (!contactForm.student_id || !contactForm.summary.trim()) {
      return toast(tx('Оқушыны таңдап, мазмұнын жазыңыз'))
    }
    setContactBusy(true)
    try {
      await addParentContact({
        class_id: classId,
        student_id: contactForm.student_id,
        on_date: contactForm.on_date,
        channel: contactForm.channel,
        summary: contactForm.summary.trim(),
      })
      toast(tx('Жазба сақталды'))
      setAddContactOpen(false)
      setContactForm({
        student_id: d.students[0]?.id ?? '',
        on_date: today(),
        channel: 'visit',
        summary: '',
      })
      reload()
    } catch (e) {
      toast(errText(e))
    } finally {
      setContactBusy(false)
    }
  }

  const deleteContact = async (id: string) => {
    try {
      await removeParentContact(id)
      toast(tx('Өшірілді'))
      reload()
    } catch (e) {
      toast(errText(e))
    }
  }

  const deleteEvent = async (id: string) => {
    try {
      await removeClassEvent(id)
      toast(tx('Өшірілді'))
      reload()
    } catch (e) {
      toast(errText(e))
    }
  }

  return (
    <div className="grid gap-4">
      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted flex items-center gap-1.5 font-medium">
            <span>🏠</span> {tx('Қонаққа бару')}
          </span>
          <span className="text-2xl font-bold font-display text-ink mt-1 tabular-nums">{visitCount}</span>
          <span className="text-[11px] text-muted mt-0.5">{tx('Үйге қонаққа бару саны')}</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted flex items-center gap-1.5 font-medium">
            <span>🤝</span> {tx('Ата-ана белсенділігі')}
          </span>
          <span className="text-2xl font-bold font-display text-ink mt-1 tabular-nums">{activityCount}</span>
          <span className="text-[11px] text-muted mt-0.5">{tx('Шаралар мен жобалар')}</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted flex items-center gap-1.5 font-medium">
            <span>📚</span> {tx('Тәрбие сағаттары')}
          </span>
          <span className="text-2xl font-bold font-display text-ink mt-1 tabular-nums">{hourParentCount}</span>
          <span className="text-[11px] text-muted mt-0.5">{tx('Ата-ана өткізген')}</span>
        </Card>

        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted flex items-center gap-1.5 font-medium">
            <span>👨‍👩‍👧</span> {tx('Қамтылған оқушылар')}
          </span>
          <span className="text-2xl font-bold font-display text-accent mt-1 tabular-nums">
            {coveredStudents.size} <span className="text-sm font-normal text-muted">/ {totalStudents}</span>
          </span>
          <span className="text-[11px] text-muted mt-0.5">
            {totalStudents ? `${Math.round((100 * coveredStudents.size) / totalStudents)}% ${tx('қамтылды')}` : ''}
          </span>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => onAddEvent('parent_activity')}>
          <span className="flex items-center justify-center gap-1.5">
            <Icon n="plus" size={16} />
            {tx('Шара / белсенділік қосу')}
          </span>
        </Button>
        <button
          type="button"
          onClick={() => setAddContactOpen(true)}
          className="flex-1 sm:flex-initial h-10 px-4 rounded-xl border border-line bg-surface hover:bg-surface-2 text-ink font-semibold text-sm flex items-center justify-center gap-1.5 shadow-2xs transition"
        >
          <span>🏠</span>
          {tx('Қонаққа бару / кездесуді тіркеу')}
        </button>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="grid gap-2">
        <Chips
          label={tx('Сүзгі')}
          value={filter}
          onChange={setFilter}
          items={[
            ['all', tx('Барлығы')],
            ['visit', tx('Қонаққа бару')],
            ['parent_activity', tx('Белсенділік')],
            ['hour_parent', tx('Тәрбие сағаты')],
            ['meeting', tx('Кездесу / Жиналыс')],
          ]}
        />
        <input
          type="search"
          aria-label={tx('Іздеу')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx('Оқушы аты, тақырып немесе мазмұны бойынша іздеу...')}
          className={`${inputCls} h-10 text-sm`}
        />
      </div>

      {/* Entries List */}
      {!filteredEntries.length ? (
        <Empty
          icon="heart"
          title={tx('Жазбалар табылмады')}
          text={tx('Ата-аналармен өткізілген шаралар, үйге қонаққа барулар мен кездесулерді тіркеңіз.')}
        />
      ) : (
        <div className="grid gap-2.5">
          {filteredEntries.map((item) => {
            if (item.kind === 'event') {
              const e = item.event
              const isVisit = (e.type_codes ?? []).includes('visit')
              const isAct = (e.type_codes ?? []).includes('parent_activity')
              const isHour = (e.type_codes ?? []).includes('hour_parent')
              const isMeeting = (e.type_codes ?? []).includes('meeting')
              const badgeLabel = isVisit
                ? '🏠 ' + tx('Қонаққа бару')
                : isAct
                ? '🤝 ' + tx('Ата-ана белсенділігі')
                : isHour
                ? '📚 ' + tx('Ата-ана тәрбие сағаты')
                : isMeeting
                ? '💼 ' + tx('Жиналыс')
                : tx('Ата-ана шарасы')
              const badgeColor = isVisit ? '#ec4899' : isAct ? '#ec4899' : isHour ? '#9333ea' : '#64748b'
              const attachedPhotos = d.photos.filter((p) => p.event_id === e.id || p.on_date === e.on_date)

              return (
                <div
                  key={item.id}
                  className="rounded-xl bg-surface border border-line p-3.5 sm:p-4 shadow-card grid gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-full text-white font-semibold"
                        style={{ backgroundColor: badgeColor }}
                      >
                        {badgeLabel}
                      </span>
                      <span className="text-xs text-muted tabular-nums font-medium">
                        {fmtDate(e.on_date)} {e.at_time ? `· ${e.at_time.slice(0, 5)}` : ''}
                      </span>
                      {e.place && (
                        <span className="text-xs text-muted flex items-center gap-1">
                          📍 {e.place}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditEvent(e)}
                        className="h-8 px-2.5 rounded-md text-xs font-semibold text-accent hover:bg-surface-2"
                      >
                        {tx('Өзгерту')}
                      </button>
                      <button
                        type="button"
                        aria-label={tx('Өшіру')}
                        onClick={() => deleteEvent(e.id)}
                        className="size-8 grid place-items-center rounded-md text-muted hover:bg-surface-2"
                      >
                        <Icon n="x" size={14} />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-ink">{e.title}</h3>

                  {e.participants && e.participants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs text-muted">{tx('Қатысушылар')}:</span>
                      {e.participants.map((p) => (
                        <span
                          key={p.id}
                          className="text-xs px-2 py-0.5 rounded-md bg-surface-2 text-ink font-medium"
                        >
                          {p.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {e.note && <p className="text-sm text-muted whitespace-pre-line">{e.note}</p>}

                  {attachedPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {attachedPhotos.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setViewPhoto(p)}
                          className="size-14 sm:size-16 rounded-lg overflow-hidden border border-line group relative"
                        >
                          <img
                            src={photoUrl(p.path)}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            } else {
              const c = item.contact
              const isVisit = c.channel === 'visit'
              const sName = studentName(c.student_id)
              return (
                <div
                  key={item.id}
                  className="rounded-xl bg-surface border border-line p-3.5 sm:p-4 shadow-card grid gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-full text-white font-semibold"
                        style={{ backgroundColor: isVisit ? '#ec4899' : '#64748b' }}
                      >
                        {isVisit ? '🏠 ' + tx('Үйге қонаққа бару') : '💬 ' + tx('Кездесу / Жиналыс')}
                      </span>
                      <span className="text-xs text-muted tabular-nums font-medium">
                        {fmtDate(c.on_date)}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={tx('Өшіру')}
                      onClick={() => deleteContact(c.id)}
                      className="size-8 grid place-items-center rounded-md text-muted hover:bg-surface-2"
                    >
                      <Icon n="x" size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-accent" />
                    <span className="font-bold text-sm text-ink">{sName}</span>
                    <span className="text-xs text-muted">({tx('оқушысының отбасы')})</span>
                  </div>

                  <p className="text-sm text-ink whitespace-pre-line bg-surface-2/40 p-2.5 rounded-lg border border-line/60">
                    {c.summary}
                  </p>

                  {c.staff_id && (
                    <p className="text-xs text-muted">
                      {tx('Тіркеген')}: {staffName(c.staff_id)}
                    </p>
                  )}
                </div>
              )
            }
          })}
        </div>
      )}

      {/* Sheet to Add Parent Contact (Visit or Meeting) */}
      {addContactOpen && (
        <Sheet
          title={tx('Қонаққа бару немесе кездесуді тіркеу')}
          onClose={() => setAddContactOpen(false)}
        >
          <div className="grid gap-3">
            <Field label={tx('Оқушы')}>
              {() => (
                <select
                  value={contactForm.student_id}
                  onChange={(e) => setContactForm({ ...contactForm, student_id: e.target.value })}
                  className={inputCls}
                >
                  {d.students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label={tx('Байланыс түрі')}>
              {() => (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setContactForm({ ...contactForm, channel: 'visit' })}
                    className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition ${
                      contactForm.channel === 'visit'
                        ? 'bg-accent text-on-accent border-transparent'
                        : 'bg-surface border-line text-ink'
                    }`}
                  >
                    🏠 {tx('Үйге қонаққа бару')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactForm({ ...contactForm, channel: 'meeting' })}
                    className={`flex-1 h-10 rounded-xl border text-sm font-semibold transition ${
                      contactForm.channel === 'meeting'
                        ? 'bg-accent text-on-accent border-transparent'
                        : 'bg-surface border-line text-ink'
                    }`}
                  >
                    💬 {tx('Мектептегі кездесу')}
                  </button>
                </div>
              )}
            </Field>

            <Field label={tx('Күні')}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={contactForm.on_date}
                  onChange={(e) => setContactForm({ ...contactForm, on_date: e.target.value })}
                  className={inputCls}
                />
              )}
            </Field>

            <Field
              label={tx('Мазмұны мен нәтижесі')}
              hint={tx('Кездесуде не талқыланды, қандай келісімдер жасалды?')}
            >
              {(id) => (
                <textarea
                  id={id}
                  value={contactForm.summary}
                  onChange={(e) => setContactForm({ ...contactForm, summary: e.target.value })}
                  rows={4}
                  className={`${inputCls} py-2`}
                  placeholder={tx('Мысалы: Оқушының оқу үлгерімі, тәртібі мен жатақхана өмірі талқыланды...')}
                />
              )}
            </Field>

            <Button onClick={saveContact} loading={contactBusy}>
              {tx('Сақтау')}
            </Button>
          </div>
        </Sheet>
      )}

      {/* Lightbox Photo Viewer */}
      {viewPhoto && (
        <Viewer
          p={viewPhoto}
          eventTitle={photoEventTitle(viewPhoto, d.events)}
          onClose={() => setViewPhoto(null)}
          onRemove={() =>
            removeClassPhoto(viewPhoto.id).then(
              () => {
                setViewPhoto(null)
                reload()
              },
              (e) => toast(errText(e))
            )
          }
        />
      )}
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
