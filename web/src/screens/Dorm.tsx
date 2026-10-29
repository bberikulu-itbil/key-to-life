import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import QRCode from 'qrcode'
import {
  addDormItem, addDormRoom, answerBedSwap, answerLinen, approveBedSwap, claimDormItem, dormChecks, dormClean, dormResidents, errText, getDormSettings,
  lastLinenRound, linenAnswers, listClasses, listDormAssignments, listDormHolders, listDormItems, listDormReports, listDormRooms, listDormSwaps,
  markDormCheck, publishDorm, removeDormItem, reportDormItem, requestBedSwap, resolveDormReport, saveDormSettings, sendLinen, setDormClean,
  setDormResident, setItemState, setRoomHead, updateDormRoom,
  type DormAssign, type DormItem, type DormKind, type DormResident, type DormRoom, type DormSettings, type LinenAnswer, type CleanCriterion,
} from '../lib/api'
import { allocate, dormCodeFrom, flagsFor, historyFrom, itemUrl, nextTerm, prevTerm, termLabel, termOf, type Place } from '../lib/dorm'
import { addDays, fmtDate, today } from '../lib/time'
import { printPage } from '../lib/telegram'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import Scanner from '../components/Scanner'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, Switch, go, inputCls, toast, useLoad, type Tone } from '../components/ui'
import { tx } from '../lib/i18n'

const KIND: Record<DormKind, string> = { bed: tx('Төсек'), wardrobe: tx('Шкаф'), nightstand: tx('Тумбочка') }
const KINDS: DormKind[] = ['bed', 'wardrobe', 'nightstand']
const ANSWER: Record<LinenAnswer, string> = { done: tx('Ауыстырдым'), later: tx('Кейін ауыстырамын'), no: tx('Ауыстырмаймын') }
const ANSWER_TONE: Record<LinenAnswer, Tone> = { done: 'ok', later: 'warn', no: 'bad' }
const CHECK = { present: tx('Бар'), absent: tx('Жоқ'), leave: tx('Рұқсатпен') } as const
type Check = keyof typeof CHECK
const itemName = (i: DormItem) => `${KIND[i.kind]} ${i.no}`
const query = () => new URLSearchParams(location.hash.split('?')[1] ?? '')
/** Options that wrap onto new lines instead of scrolling sideways. */
function Pick<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map(([v, t]) => <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
        className={`min-h-9 px-3 rounded-full text-sm border ${v === value ? 'bg-accent text-on-accent border-accent font-semibold' : 'bg-surface border-line'}`}>{t}</button>)}
    </div>
  )
}
const H2 = ({ children }: { children: ReactNode }) => <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{children}</h2>

export default function Dorm({ sub, arg }: { sub?: string; arg?: string }) {
  const { me } = useMe()
  if (sub === 'item' && arg) return <ItemPage code={arg.toUpperCase()} />
  if (sub === 'qr') return <QrSheet room={arg} />
  if (sub === 'door' && me.role !== 'student') return <DoorSheet room={arg} />
  if (me.role === 'student') return <StudentDorm />
  if (sub === 'place') return <PlaceWizard />
  return <TutorDorm />
}

/* ---------- shared data ---------- */
function useDormData(classId: string | undefined) {
  return useLoad(async () => {
    if (!classId) return null
    const [rooms, items, assigns, holders, residents, settings] = await Promise.all([
      listDormRooms(), listDormItems(), listDormAssignments(), listDormHolders(), dormResidents(classId), getDormSettings(classId)])
    return { rooms, items, assigns, holders, residents, settings }
  }, [classId])
}
type Data = NonNullable<ReturnType<typeof useDormData>['data']>

/** Who sits in a room this term, and which things each one holds now. */
function roomView(d: Pick<Data, 'assigns' | 'items' | 'holders'>, term: string, room: string) {
  const people = d.assigns.filter((a) => a.term === term && a.room_id === room)
  const items = d.items.filter((i) => i.room_id === room)
  const holding = (sid: string) => d.holders.filter((h) => h.student_id === sid).map((h) => items.find((i) => i.id === h.item_id)).filter(Boolean) as DormItem[]
  return { people, items, holding, noBed: people.filter((p) => !holding(p.student_id).some((i) => i.kind === 'bed')).length }
}

const isHead = (me: ReturnType<typeof useMe>['me']) => me.role === 'deputy' || me.role === 'admin' || me.staff_kind === 'dorm_head'

/** Tutor (or the dorm head): the class picker shared by the tutor screens. */
function useMyClass() {
  const { me } = useMe()
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = isHead(me) ? classes.data ?? [] : mine
  const want = query().get('class')
  return { classes, options, cls: options.find((c) => c.id === want) ?? mine[0] ?? options[0] }
}

/* ---------- tutor ---------- */
function TutorDorm() {
  const { classes, options, cls } = useMyClass()
  const [tab, setTab] = useState<'over' | 'mon' | 'set'>('over')
  const now = termOf(today())
  const [term, setTerm] = useState(query().get('term') ?? now)
  const d = useDormData(cls?.id)
  if (classes.loading && !classes.data) return <><PageHead title={tx('Жатақхана')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Жатақхана')} back /><Card><Empty icon="home" title={tx('Сынып бекітілмеген')} text={tx('Тәрбиеші болып белгіленгенде, сыныбыңыздың жатақханасы осында шығады.')} /></Card></>
  return (
    <div className="grid grid-cols-1 gap-3 pb-6">
      <PageHead title={tx('Жатақхана · {0}', cls.name)} back />
      {options.length > 1 && <Chips label={tx('Сынып')} value={cls.id} onChange={(v) => go(`/dorm?class=${v}`)} items={options.map((c) => [c.id, c.name] as [string, string])} />}
      <div role="tablist" aria-label={tx('Бөлім')} className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
        {([['over', tx('Шолу')], ['mon', tx('Мониторинг')], ['set', tx('Баптаулар')]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`h-10 rounded-md text-sm ${tab === k ? 'bg-surface shadow-card font-semibold' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      {tab !== 'set' && <Chips label={tx('Тоқсан')} value={term} onChange={setTerm} items={[prevTerm(now), now, nextTerm(now)].map((t) => [t, termLabel(t)] as [string, string])} />}
      {d.loading && !d.data ? <Skeleton /> : d.error ? <ErrorBox text={d.error} retry={d.reload} /> : d.data && (
        tab === 'over' ? <Overview cls={cls} term={term} d={d.data} reload={d.reload} />
          : tab === 'mon' ? <Monitoring cls={cls} term={term} d={d.data} />
            : <Settings key={cls.id} d={d.data} reload={d.reload} />
      )}
    </div>
  )
}

type Cls = { id: string; name: string }

function Overview({ cls, term, d, reload }: { cls: Cls; term: string; d: Data; reload: () => void }) {
  const { me } = useMe()
  const [room, setRoom] = useState<DormRoom | null>(null)
  const [roll, setRoll] = useState(false)
  const swaps = useLoad(listDormSwaps, [])
  const residents = d.residents.filter((s) => s.dorm)
  const mine = new Set(d.residents.map((s) => s.id))
  const placed = new Set(d.assigns.filter((a) => a.term === term && a.room_id && mine.has(a.student_id)).map((a) => a.student_id))
  const unplaced = residents.filter((s) => !placed.has(s.id))
  const roomIds = new Set(d.assigns.filter((a) => a.term === term && a.room_id && (isHead(me) || mine.has(a.student_id))).map((a) => a.room_id))
  const rooms = d.rooms.filter((r) => roomIds.has(r.id))
  const waiting = (swaps.data ?? []).filter((s) => s.status === 'accepted' && (mine.has(s.from_id) || isHead(me)))
  const decide = async (id: string, yes: boolean) => { try { await approveBedSwap(id, yes); swaps.reload(); reload() } catch (e) { toast(errText(e)) } }
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={residents.length} label={tx('Жатақханада')} />
        <Stat value={placed.size} label={tx('Орналасқан')} />
        <Stat value={unplaced.length} label={tx('Бөлмесіз')} warn={unplaced.length > 0} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button kind="gold" onClick={() => go(`/dorm/place?class=${cls.id}&term=${term}`)}><Icon n="users" size={18} />{tx('Орналастыру')}</Button>
        <Button kind="secondary" disabled={!rooms.length} onClick={() => setRoll(true)}><Icon n="check" size={18} />{tx('Түгендеу')}</Button>
      </div>
      {waiting.map((s) => (
        <Card key={s.id} className="grid gap-2 bg-warning-soft">
          <p className="text-sm"><span className="font-semibold">{tx('Төсек алмасу')}</span>{' · '}{s.from.full_name} ↔ {s.to.full_name}</p>
          <div className="grid grid-cols-2 gap-2"><Button onClick={() => decide(s.id, true)}>{tx('Растау')}</Button><Button kind="ghost" onClick={() => decide(s.id, false)}>{tx('Қабылдамау')}</Button></div>
        </Card>
      ))}
      <H2>{tx('Бөлмелер · {0}', rooms.length)}</H2>
      {!rooms.length ? <Card><Empty icon="home" title={tx('Бұл тоқсанға әлі орналастырылмаған')} text={tx('«Орналастыру» батырмасын басыңыз.')} /></Card> : (
        <div className="grid grid-cols-2 gap-2">
          {rooms.map((r) => {
            const v = roomView(d, term, r.id)
            return (
              <button key={r.id} type="button" onClick={() => setRoom(r)} className="rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] p-3 text-left grid gap-1">
                <span className="flex items-baseline gap-2"><span className="text-lg font-bold font-display">{r.name}</span><span className="text-sm text-muted tabular-nums">{v.people.length}/{r.capacity}</span></span>
                {v.noBed > 0 ? <span className="text-xs text-warning font-semibold">⚠ {tx('{0} орын таңдалмаған', v.noBed)}</span> : <span className="text-xs text-success">{tx('Орындар таңдалған')}</span>}
              </button>
            )
          })}
        </div>
      )}
      {unplaced.length > 0 && <><H2>{tx('Бөлмеге бөлінбегендер · {0}', unplaced.length)}</H2><Card><p className="text-sm">{unplaced.map((s) => s.full_name).join(', ')}</p></Card></>}
      <H2>{tx('Жатақханада тұрмайтындар · {0}', d.residents.length - residents.length)}</H2>
      <Card><p className="text-sm">{d.residents.filter((s) => !s.dorm).map((s) => s.full_name).join(', ') || '—'}</p></Card>
      {room && <Sheet title={tx('Бөлме {0}', room.name)} onClose={() => setRoom(null)}><RoomPeople room={room} term={term} d={d} mine={mine} onChanged={reload} /></Sheet>}
      {roll && <Sheet title={tx('Кешкі түгендеу · {0}', today().slice(5).split('-').reverse().join('.'))} onClose={() => setRoll(false)}><RollCall rooms={rooms} term={term} d={d} onDone={() => setRoll(false)} /></Sheet>}
    </>
  )
}

const Stat = ({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) => (
  <div className={`rounded-md px-3 py-2.5 ${warn ? 'bg-warning-soft text-warning' : 'bg-surface-2'}`}><span className="block text-xl font-bold tabular-nums">{value}</span><span className="block text-xs leading-tight break-words">{label}</span></div>
)

function RoomPeople({ room, term, d, mine, onChanged }: { room: DormRoom; term: string; d: Data; mine: Set<string>; onChanged: () => void }) {
  const v = roomView(d, term, room.id)
  const head = async (sid: string) => { try { await setRoomHead(term, room.id, sid); toast(tx('Бөлме жауаптысы белгіленді')); onChanged() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid grid-cols-1 gap-3">
      <Card className="p-0 divide-y divide-line">
        {v.people.map((p) => (
          <div key={p.student_id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={p.student.full_name} photo={p.student.photo} size={40} />
            <span className="flex-1 min-w-0"><span className="block font-medium truncate">{p.student.full_name}{p.is_head && <span className="ml-1 text-gold" aria-label={tx('бөлме жауаптысы')}>★</span>}</span>
              <span className="block text-xs text-muted truncate">{[p.student.class?.name, v.holding(p.student_id).map(itemName).join(', ') || tx('орын таңдамаған')].filter(Boolean).join(' · ')}</span></span>
            {mine.has(p.student_id) && !p.is_head && <button type="button" onClick={() => head(p.student_id)} aria-label={tx('{0} — бөлме жауаптысы ету', p.student.full_name)} className="size-11 grid place-items-center text-xl text-muted">☆</button>}
          </div>
        ))}
      </Card>
      <CleanForm room={room.id} criteria={d.settings.clean_criteria} />
    </div>
  )
}

/** Today's cleanliness: points for every criterion set in the settings; saving again the same day replaces it. */
function CleanForm({ room, criteria }: { room: string; criteria: CleanCriterion[] }) {
  const old = useLoad(() => dormClean(today()), [])
  const [pts, setPts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { const x = old.data?.find((c) => c.room_id === room); if (x?.details) setPts(x.details) }, [old.data, room])
  const total = criteria.reduce((n, c) => n + Math.min(c.max, pts[c.name] ?? 0), 0), max = criteria.reduce((n, c) => n + c.max, 0)
  const save = async () => {
    setBusy(true)
    try { await setDormClean(room, today(), criteria, pts); toast(tx('Тазалық ұпайы сақталды')) } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Card className="grid grid-cols-1 gap-3">
      <p className="font-semibold">{tx('Бүгінгі тазалық ұпайы')}</p>
      {criteria.map((c) => (
        <div key={c.name} className="grid gap-1.5">
          <p className="text-sm">{c.name} <span className="text-muted">· {pts[c.name] ?? 0}/{c.max}</span></p>
          <div role="group" aria-label={c.name} className="flex flex-wrap gap-1.5">{Array.from({ length: c.max + 1 }, (_, n) => (
            <button key={n} type="button" aria-pressed={(pts[c.name] ?? 0) === n} onClick={() => setPts({ ...pts, [c.name]: n })}
              className={`size-10 rounded-md font-bold tabular-nums ${(pts[c.name] ?? 0) === n ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{n}</button>
          ))}</div>
        </div>
      ))}
      <Button loading={busy} onClick={save}>{tx('Сақтау · {0}/{1}', total, max)}</Button>
    </Card>
  )
}

function RollCall({ rooms, term, d, onDone }: { rooms: DormRoom[]; term: string; d: Data; onDone: () => void }) {
  const marks = useLoad(() => dormChecks(today()), [])
  const [m, setM] = useState<Record<string, Check>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (marks.data) setM(Object.fromEntries(marks.data.map((x) => [x.student_id, x.status]))) }, [marks.data])
  const people = rooms.flatMap((r) => roomView(d, term, r.id).people.map((p) => ({ ...p, room: r.name })))
  const next: Record<Check, Check> = { present: 'absent', absent: 'leave', leave: 'present' }
  const tone: Record<Check, string> = { present: 'bg-success-soft text-success', absent: 'bg-danger-soft text-danger', leave: 'bg-warning-soft text-warning' }
  const save = async () => {
    setBusy(true)
    try { await markDormCheck(today(), people.map((p) => ({ student: p.student_id, status: m[p.student_id] ?? 'present' }))); toast(tx('Түгендеу сақталды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  if (marks.loading) return <Skeleton />
  return (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-sm text-muted">{tx('Бөлмеге кіріп, жоқ баланы басыңыз: Бар → Жоқ → Рұқсатпен.')}</p>
      {rooms.map((r) => (
        <div key={r.id} className="grid gap-1">
          <p className="font-semibold">{tx('Бөлме {0}', r.name)}</p>
          {people.filter((p) => p.room === r.name).map((p) => {
            const s = m[p.student_id] ?? 'present'
            return (
              <button key={p.student_id} type="button" onClick={() => setM({ ...m, [p.student_id]: next[s] })} className="flex items-center gap-3 min-h-12 rounded-md bg-surface-2 px-3 text-left">
                <span className="flex-1 min-w-0 truncate">{p.student.full_name}</span>
                <span className={`h-7 px-3 rounded-full text-xs font-semibold grid place-items-center ${tone[s]}`}>{CHECK[s]}</span>
              </button>
            )
          })}
        </div>
      ))}
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
    </div>
  )
}

function Monitoring({ cls, term, d }: { cls: Cls; term: string; d: Data }) {
  const linen = useLoad(async () => {
    const r = await lastLinenRound(cls.id)
    return { round: r, answers: r ? await linenAnswers(r.id) : [] }
  }, [cls.id])
  const clean = useLoad(() => dormClean(addDays(today(), -30)), [])
  const [busy, setBusy] = useState('')
  const residents = d.residents.filter((s) => s.dorm)
  const mine = new Set(d.residents.map((s) => s.id))
  const rooms = d.rooms.filter((r) => d.assigns.some((a) => a.term === term && a.room_id === r.id && mine.has(a.student_id)))
  const answerOf = (id: string) => linen.data?.answers.find((a) => a.student_id === id)?.answer
  const count = (a: LinenAnswer | undefined) => residents.filter((s) => answerOf(s.id) === a).length
  const send = async (resend: boolean) => {
    setBusy(resend ? 'resend' : 'new')
    try { await sendLinen(cls.id, resend); toast(resend ? tx('Жауап бермегендерге қайта жіберілді') : tx('Хабарлама жіберілді')); linen.reload() } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }
  return (
    <>
      <H2>{tx('Тазалық ұпайы · соңғы 30 күн')}</H2>
      {!rooms.length ? <Card><p className="text-sm text-muted">{tx('Бөлмелер әлі жоқ.')}</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {rooms.map((r) => {
            const s = (clean.data ?? []).filter((c) => c.room_id === r.id)
            const sum = s.reduce((n, c) => n + c.max, 0)
            const avg = sum ? `${Math.round((s.reduce((n, c) => n + c.score, 0) / sum) * 100)}%` : '—'
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-14 font-bold font-display">{r.name}</span>
                <span className="flex-1 text-xs text-muted truncate">{s.slice(0, 5).map((c) => `${c.score}/${c.max}`).join(' · ') || tx('ұпай қойылмаған')}</span>
                <span className="text-lg font-bold tabular-nums">{avg}</span>
              </div>
            )
          })}
        </Card>
      )}
      <H2>{tx('Постель ауыстыру')}{linen.data?.round ? ` · ${new Date(linen.data.round.sent_at).toLocaleDateString()}` : ''}</H2>
      {linen.loading ? <Skeleton rows={1} /> : !linen.data?.round ? <Card><Empty icon="bell" title={tx('Әлі хабарлама жіберілмеген')} text={tx('Баптауларда кестені қойыңыз немесе қазір жіберіңіз.')} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat value={count('done')} label={tx('Ауыстырды')} />
            <Stat value={count('later')} label={tx('Кейін')} />
            <Stat value={count('no')} label={tx('Ауыстырмайды')} />
            <Stat value={count(undefined)} label={tx('Жауап жоқ')} warn={count(undefined) > 0} />
          </div>
          <Card className="p-0 divide-y divide-line">
            {rooms.map((r) => (
              <div key={r.id} className="px-4 py-2.5 grid gap-1.5">
                <p className="font-semibold">{tx('Бөлме {0}', r.name)}</p>
                {roomView(d, term, r.id).people.filter((p) => mine.has(p.student_id)).map((p) => {
                  const a = answerOf(p.student_id)
                  return <div key={p.student_id} className="flex items-center gap-2 text-sm"><span className="flex-1 min-w-0 truncate">{p.student.full_name}</span>{a ? <Badge tone={ANSWER_TONE[a]}>{ANSWER[a]}</Badge> : <Badge tone="muted">{tx('Жауап жоқ')}</Badge>}</div>
                })}
              </div>
            ))}
          </Card>
        </>
      )}
      <div className="grid gap-2">
        <Button kind="secondary" disabled={!linen.data?.round} loading={busy === 'resend'} onClick={() => send(true)}>{tx('Қайта жіберу')}</Button>
        <Button loading={busy === 'new'} onClick={() => send(false)}>{tx('Жаңа хабарлама')}</Button>
      </div>
    </>
  )
}

function Settings({ d, reload }: { d: Data; reload: () => void }) {
  const { me } = useMe()
  const [s, setS] = useState<DormSettings>(d.settings)
  const [busy, setBusy] = useState(false)
  const [room, setRoom] = useState<DormRoom | 'new' | null>(null)
  const history = useLoad(() => Promise.all([listDormHolders(true), listDormReports()]), [])
  const save = async () => {
    const names = s.clean_criteria.map((c) => c.name.trim())
    if (names.some((n) => !n) || new Set(names).size !== names.length) return toast(tx('Критерий атаулары бос болмауы және қайталанбауы керек'))
    setBusy(true)
    try { await saveDormSettings({ ...s, clean_criteria: s.clean_criteria.map((c) => ({ ...c, name: c.name.trim() })) }); toast(tx('Сақталды')); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const damaged = d.items.filter((i) => i.state === 'damaged')
  const reports = (history.data?.[1] ?? []).filter((r) => !r.resolved_at)
  const roomOf = (i: DormItem) => d.rooms.find((r) => r.id === i.room_id)?.name ?? ''
  const lastHolders = (item: string) => (history.data?.[0] ?? []).filter((h) => h.item_id === item).slice(0, 3)
  return (
    <>
      <Card className="grid grid-cols-1 gap-3">
        <p className="font-semibold">{tx('Орын беру')}</p>
        <Pick label={tx('Орын беру')} value={s.mode} onChange={(mode) => setS({ ...s, mode })} items={[['self', tx('Оқушы QR арқылы таңдайды')], ['auto', tx('Автоматты')]]} />
        <p className="font-semibold">{tx('Төсек алмасу')}</p>
        <Pick label={tx('Төсек алмасу')} value={s.swap} onChange={(swap) => setS({ ...s, swap })} items={[['off', tx('Рұқсат жоқ')], ['confirm', tx('Тәрбиеші растайды')], ['free', tx('Еркін')]]} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx('Постель, әр … күн')}>{(id) => <input id={id} type="number" min={1} max={60} value={s.linen_days ?? ''} onChange={(e) => setS({ ...s, linen_days: e.target.value ? Math.min(60, Math.max(1, +e.target.value)) : null })} className={inputCls} />}</Field>
          <Field label={tx('Уақыты')}>{(id) => <input id={id} type="time" value={s.linen_time.slice(0, 5)} onChange={(e) => setS({ ...s, linen_time: e.target.value })} className={inputCls} />}</Field>
        </div>
        <p className="text-sm text-muted -mt-1">{tx('Бос қалса — тек қолмен')}</p>
        <p className="font-semibold">{tx('Тазалық критерийлері')}</p>
        {s.clean_criteria.map((c, i) => {
          const set = (v: Partial<CleanCriterion>) => setS({ ...s, clean_criteria: s.clean_criteria.map((x, j) => (j === i ? { ...x, ...v } : x)) })
          return (
            <div key={i} className="grid grid-cols-[1fr_5rem_auto] gap-2 items-center">
              <input aria-label={tx('Критерий атауы')} value={c.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
              <input aria-label={tx('Ең жоғары балл')} type="number" min={1} max={10} value={c.max} onChange={(e) => set({ max: Math.max(1, Math.min(10, Math.floor(+e.target.value) || 1)) })} className={inputCls} />
              <button type="button" aria-label={tx('{0} өшіру', c.name)} disabled={s.clean_criteria.length < 2}
                onClick={() => setS({ ...s, clean_criteria: s.clean_criteria.filter((_, j) => j !== i) })} className="size-11 grid place-items-center text-muted disabled:opacity-30"><Icon n="x" size={18} /></button>
            </div>
          )
        })}
        <p className="text-sm text-muted -mt-1">{tx('Атауы және ең жоғары балы (1–10). Барлығы: {0} балл', s.clean_criteria.reduce((n, c) => n + c.max, 0))}</p>
        {s.clean_criteria.length < 12 && <Button kind="ghost" onClick={() => setS({ ...s, clean_criteria: [...s.clean_criteria, { name: '', max: 5 }] })}><Icon n="plus" size={18} />{tx('Критерий қосу')}</Button>}
        <Button loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      </Card>

      <div className="flex items-center gap-2 mt-1"><span className="flex-1"><H2>{tx('Бөлмелер · {0}', d.rooms.length)}</H2></span>
        <Button kind="ghost" onClick={() => go('/dorm/qr/all')}><Icon n="file" size={18} />{tx('QR')}</Button>
        <Button kind="ghost" onClick={() => go('/dorm/door/all')}><Icon n="list" size={18} />{tx('Есікке тізім')}</Button></div>
      <Card className="p-0 divide-y divide-line">
        {d.rooms.map((r) => {
          const items = d.items.filter((i) => i.room_id === r.id)
          return (
            <button key={r.id} type="button" onClick={() => setRoom(r)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${r.active ? '' : 'opacity-50'}`}>
              <span className="w-14 font-bold font-display">{r.name}</span>
              <span className="flex-1 min-w-0 text-xs text-muted truncate">{tx('{0} орын', r.capacity)} · {KINDS.map((k) => `${KIND[k]} ${items.filter((i) => i.kind === k).length}`).join(' · ')}</span>
              {items.some((i) => i.state === 'damaged') && <Badge tone="bad">{tx('Ақау')}</Badge>}
              <Icon n="chev" className="text-muted" />
            </button>
          )
        })}
        <button type="button" onClick={() => setRoom('new')} className="w-full flex items-center gap-3 px-4 min-h-12 text-accent font-semibold"><Icon n="plus" size={18} />{tx('Бөлме қосу')}</button>
      </Card>

      {(damaged.length > 0 || reports.length > 0) && <H2>{tx('Бүлінген заттар мен ақаулар')}</H2>}
      {damaged.length > 0 && (
        <Card className="p-0 divide-y divide-line">
          {damaged.map((i) => (
            <div key={i.id} className="px-4 py-2.5">
              <p className="font-medium">{roomOf(i)} · {itemName(i)}{i.note ? ` — ${i.note}` : ''}</p>
              <p className="text-xs text-muted">{tx('Соңғы иелері:')} {lastHolders(i.id).map((h) => `${h.student.full_name} (${termLabel(h.term)})`).join(', ') || '—'}</p>
            </div>
          ))}
        </Card>
      )}
      {reports.length > 0 && (
        <Card className="p-0 divide-y divide-line">
          {reports.map((r) => {
            const i = d.items.find((x) => x.id === r.item_id)
            return (
              <div key={r.id} className="px-4 py-2.5 flex items-start gap-3">
                <span className="flex-1 min-w-0"><span className="block font-medium">{i ? `${roomOf(i)} · ${itemName(i)}` : ''}</span>
                  <span className="block text-sm">{r.body}</span><span className="block text-xs text-muted">{r.student.full_name} · {new Date(r.created_at).toLocaleDateString()}</span></span>
                <Button kind="ghost" onClick={async () => { try { await resolveDormReport(r.id); history.reload() } catch (e) { toast(errText(e)) } }}>{tx('Шешілді')}</Button>
              </div>
            )
          })}
        </Card>
      )}
      {room === 'new' && <Sheet title={tx('Бөлме қосу')} onClose={() => setRoom(null)}><NewRoom onDone={() => { setRoom(null); reload() }} /></Sheet>}
      {room && room !== 'new' && <Sheet title={tx('Бөлме {0}', room.name)} onClose={() => setRoom(null)}>
        <RoomEdit room={room} d={d} canEdit={room.created_by === me.id || isHead(me)} onChanged={() => { reload(); history.reload() }} /></Sheet>}
    </>
  )
}

function NewRoom({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', floor: '', capacity: '4', bed: '4', wardrobe: '4', nightstand: '4' })
  const [busy, setBusy] = useState(false)
  const n = (v: string, max = 40) => Math.max(0, Math.min(max, Math.floor(+v || 0)))
  const save = async () => {
    if (!f.name.trim()) return toast(tx('Бөлме нөмірін жазыңыз'))
    setBusy(true)
    try {
      await addDormRoom({ name: f.name.trim(), floor: f.floor ? n(f.floor, 30) : null, capacity: Math.max(1, n(f.capacity, 20)) }, { bed: n(f.bed), wardrobe: n(f.wardrobe), nightstand: n(f.nightstand) })
      toast(tx('Бөлме қосылды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const num = (k: keyof typeof f, label: string) => <Field label={label}>{(id) => <input id={id} type="number" inputMode="numeric" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inputCls} />}</Field>
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2"><Field label={tx('Бөлме нөмірі')}>{(id) => <input id={id} value={f.name} maxLength={20} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder="312" />}</Field></div>
        {num('floor', tx('Қабат'))}
      </div>
      {num('capacity', tx('Қанша бала тұрады'))}
      <div className="grid grid-cols-3 gap-2">{num('bed', KIND.bed)}{num('wardrobe', KIND.wardrobe)}{num('nightstand', KIND.nightstand)}</div>
      <p className="text-sm text-muted">{tx('Әр затқа жеке QR жасалады: «Төсек 1», «Шкаф 1»…')}</p>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}

function RoomEdit({ room, d, canEdit, onChanged }: { room: DormRoom; d: Data; canEdit: boolean; onChanged: () => void }) {
  const [f, setF] = useState({ name: room.name, capacity: String(room.capacity), active: room.active })
  const [items, setItems] = useState(d.items.filter((i) => i.room_id === room.id))
  const [note, setNote] = useState<DormItem | null>(null)
  const holder = (i: DormItem) => d.holders.find((h) => h.item_id === i.id)?.student.full_name
  const run = async (p: Promise<unknown>, after?: () => void) => { try { await p; after?.(); onChanged() } catch (e) { toast(errText(e)) } }
  const reloadItems = async () => setItems((await listDormItems()).filter((i) => i.room_id === room.id))
  return (
    <div className="grid grid-cols-1 gap-3">
      {canEdit && (
        <Card className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx('Бөлме нөмірі')}>{(id) => <input id={id} value={f.name} maxLength={20} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />}</Field>
            <Field label={tx('Орын саны')}>{(id) => <input id={id} type="number" min={1} max={20} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} className={inputCls} />}</Field>
          </div>
          <Switch label={tx('Бөлме қолданыста')} on={f.active} onChange={(active) => setF({ ...f, active })} />
          <Button kind="secondary" onClick={() => run(updateDormRoom(room.id, { name: f.name.trim(), capacity: Math.max(1, Math.min(20, +f.capacity || 1)), active: f.active }), () => toast(tx('Сақталды')))}>{tx('Сақтау')}</Button>
        </Card>
      )}
      <Card className="p-0 divide-y divide-line">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-2 px-4 py-2">
            <span className="flex-1 min-w-0"><span className="block font-medium">{itemName(i)}</span><span className="block text-xs text-muted truncate">{holder(i) ?? tx('бос')}{i.note ? ` · ${i.note}` : ''}</span></span>
            <button type="button" onClick={() => i.state === 'ok' ? setNote(i) : run(setItemState(i.id, 'ok', ''), reloadItems)}
              className={`h-8 px-3 rounded-full text-xs font-semibold ${i.state === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>{i.state === 'ok' ? tx('Жақсы') : tx('Бүлінген')}</button>
            {canEdit && <button type="button" aria-label={tx('{0} өшіру', itemName(i))} onClick={() => run(removeDormItem(i.id), reloadItems)} className="size-9 grid place-items-center text-muted"><Icon n="x" size={16} /></button>}
          </div>
        ))}
      </Card>
      {canEdit && <div className="grid grid-cols-3 gap-2">{KINDS.map((k) => (
        <Button key={k} kind="ghost" onClick={() => run(addDormItem(room.id, k, Math.max(0, ...items.filter((i) => i.kind === k).map((i) => i.no)) + 1), reloadItems)}><Icon n="plus" size={16} />{KIND[k]}</Button>
      ))}</div>}
      <div className="grid grid-cols-2 gap-2"><Button kind="secondary" onClick={() => go(`/dorm/qr/${room.id}`)}><Icon n="file" size={18} />{tx('QR парағы')}</Button>
        <Button kind="secondary" onClick={() => go(`/dorm/door/${room.id}`)}><Icon n="list" size={18} />{tx('Есікке тізім')}</Button></div>
      {note && <DamageNote item={note} onDone={() => { setNote(null); reloadItems(); onChanged() }} />}
    </div>
  )
}

function DamageNote({ item, onDone }: { item: DormItem; onDone: () => void }) {
  const [t, setT] = useState('')
  const save = async () => { try { await setItemState(item.id, 'damaged', t); onDone() } catch (e) { toast(errText(e)) } }
  return (
    <Card className="grid gap-2 bg-danger-soft">
      <Field label={tx('{0}: не бүлінген?', itemName(item))}>{(id) => <input id={id} value={t} maxLength={300} onChange={(e) => setT(e.target.value)} className={inputCls} placeholder={tx('Мысалы: есігі сынған')} />}</Field>
      <Button kind="danger" onClick={save}>{tx('Бүлінген деп белгілеу')}</Button>
    </Card>
  )
}

/* ---------- placement wizard: who lives here → pin → beds → random → publish ---------- */
function PlaceWizard() {
  const { classes, cls } = useMyClass()
  const term = query().get('term') ?? termOf(today())
  const d = useDormData(cls?.id)
  const [step, setStep] = useState(1)
  const [res, setRes] = useState<DormResident[] | null>(null)
  const [pinned, setPinned] = useState<Place>({})
  const [mode, setMode] = useState<DormSettings['mode']>('self')
  const [place, setPlace] = useState<Place>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!d.data) return
    setRes(d.data.residents); setMode(d.data.settings.mode)
    setPinned(Object.fromEntries(d.data.assigns.filter((a) => a.term === term && a.pinned).map((a) => [a.student_id, a.room_id])))
  }, [d.data, term])
  const ids = useMemo(() => new Set((d.data?.residents ?? []).map((s) => s.id)), [d.data])
  const rooms = useMemo(() => (d.data?.rooms ?? []).filter((r) => r.active).map((r) => ({
    id: r.id, capacity: r.capacity, others: d.data!.assigns.filter((a) => a.term === term && a.room_id === r.id && !ids.has(a.student_id)).map((a) => a.student_id),
  })), [d.data, term, ids])
  const history = useMemo(() => historyFrom(d.data?.assigns ?? [], term), [d.data, term])
  const living = (res ?? []).filter((s) => s.dorm)
  const shuffle = () => setPlace(allocate(living.map((s) => s.id), rooms, Object.fromEntries(Object.entries(pinned).filter(([s, r]) => r && living.some((x) => x.id === s))), history))
  const flags = flagsFor(place, rooms, history)
  const free = rooms.reduce((n, r) => n + r.capacity - r.others.length, 0)

  if (classes.loading || d.loading || !res || !d.data) return <><PageHead title={tx('Орналастыру')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Орналастыру')} back /><Card><Empty title={tx('Сынып бекітілмеген')} /></Card></>
  const dd = d.data
  const roomName = (id: string | null | undefined) => dd.rooms.find((r) => r.id === id)?.name ?? '—'
  const nameOf = (id: string) => res.find((s) => s.id === id)?.full_name ?? dd.assigns.find((a) => a.student_id === id)?.student.full_name ?? ''
  const toggle = async (s: DormResident, on: boolean) => {
    setRes(res.map((x) => (x.id === s.id ? { ...x, dorm: on } : x)))
    try { await setDormResident(s.id, on) } catch (e) { toast(errText(e)); setRes(res) }
  }
  const nextStep = async () => {
    if (step === 3) {
      try { await saveDormSettings({ ...dd.settings, mode }) } catch (e) { return toast(errText(e)) }
      shuffle()
    }
    setStep(step + 1)
  }
  const publish = async () => {
    setBusy(true)
    try {
      await publishDorm(term, cls.id, living.map((s) => ({ student: s.id, room: place[s.id] ?? null, pinned: !!pinned[s.id] })))
      toast(tx('Жарияланды, балаларға хабарлама кетті')); go(`/dorm?class=${cls.id}&term=${term}`)
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const select = (sid: string, value: string | null | undefined, onChange: (v: string | null) => void) => (
    <select aria-label={tx('{0} бөлмесі', nameOf(sid))} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="h-10 rounded-md border border-input bg-surface px-2 text-sm">
      <option value="">—</option>{dd.rooms.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  )
  const titles = [tx('Кім жатақханада тұрады?'), tx('Қолмен қою (міндетті емес)'), tx('Орын қалай беріледі?'), tx('Рандом бөлу'), tx('Жариялау')]
  return (
    <div className="grid grid-cols-1 gap-3 pb-6">
      <PageHead title={tx('Орналастыру · {0}', cls.name)} back />
      <p className="text-sm text-muted">{termLabel(term)} · {tx('{0}-қадам / 5', step)}</p>
      <div className="grid grid-cols-5 gap-1" aria-hidden>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-1.5 rounded-full ${n <= step ? 'bg-accent' : 'bg-line'}`} />)}</div>
      <h2 className="text-lg font-bold">{titles[step - 1]}</h2>

      {step === 1 && <Card className="py-1 divide-y divide-line">{res.map((s) => <Switch key={s.id} label={s.full_name} on={s.dorm} onChange={(on) => toggle(s, on)} />)}</Card>}

      {step === 2 && (
        <>
          <p className="text-sm text-muted">{tx('1–2 баланы өзіңіз бөлмеге қойыңыз, қалғанын рандом бөледі.')}</p>
          <Card className="p-0 divide-y divide-line">{living.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2"><span className="flex-1 min-w-0 truncate">{s.full_name}</span>{select(s.id, pinned[s.id], (v) => setPinned({ ...pinned, [s.id]: v }))}</div>
          ))}</Card>
        </>
      )}

      {step === 3 && (
        <Card className="grid gap-2">
          {([['self', tx('Оқушы QR арқылы таңдайды'), tx('Бала төсек, шкаф, тумбочкадағы QR-ды сканерлеп, өзі алады. Бүлінсе — сол баладан сұралады.')],
            ['auto', tx('Автоматты'), tx('Жариялағанда әр балаға бос төсек, шкаф, тумбочка беріледі.')]] as const).map(([k, t, h]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded-md border p-3 text-left ${mode === k ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <span className="block font-semibold">{t}</span><span className="block text-sm text-muted">{h}</span>
            </button>
          ))}
        </Card>
      )}

      {step === 4 && (
        <>
          <p className="text-sm text-muted">{tx('Бос орын: {0} · бала: {1}', free, living.length)}</p>
          <div className="flex flex-wrap gap-2 text-xs"><Badge tone="warn">{tx('бұрын бірге тұрған')}</Badge><Badge tone="late">{tx('бұрынғы бөлмесі')}</Badge></div>
          {rooms.filter((r) => r.others.length || Object.values(place).includes(r.id)).map((r) => (
            <Card key={r.id} className="grid gap-1.5">
              <p className="font-bold font-display">{roomName(r.id)} <span className="text-sm font-normal text-muted">{r.others.length + Object.values(place).filter((x) => x === r.id).length}/{r.capacity}</span></p>
              {r.others.map((o) => <p key={o} className="text-sm text-muted">{nameOf(o)} · {tx('басқа сынып')}</p>)}
              {living.filter((s) => place[s.id] === r.id).map((s) => (
                <div key={s.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-0 text-sm">{s.full_name}{pinned[s.id] ? ' 📌' : ''}</span>
                  {flags[s.id]?.pair.length > 0 && <Badge tone="warn">{flags[s.id].pair.map(nameOf).join(', ')}</Badge>}
                  {flags[s.id]?.room && <Badge tone="late">{tx('бұрынғы бөлмесі')}</Badge>}
                  {select(s.id, place[s.id], (v) => setPlace({ ...place, [s.id]: v }))}
                </div>
              ))}
            </Card>
          ))}
          {living.some((s) => !place[s.id]) && <Card className="bg-warning-soft text-warning"><p className="text-sm font-semibold">{tx('Орын жетпеді: {0}', living.filter((s) => !place[s.id]).map((s) => s.full_name).join(', '))}</p></Card>}
          <Button kind="secondary" onClick={shuffle}><Icon n="repeat" size={18} />{tx('Қайта бөлу')}</Button>
        </>
      )}

      {step === 5 && (
        <Card className="grid gap-2">
          <p>{tx('{0} бала {1} бөлмеге орналасады.', living.filter((s) => place[s.id]).length, new Set(Object.values(place).filter(Boolean)).size)}</p>
          <p className="text-sm text-muted">{mode === 'self' ? tx('Жариялағанда балаларға хабарлама барады: бөлмесі және орнын QR арқылы таңдау.') : tx('Жариялағанда балаларға бөлмесі мен орны туралы хабарлама барады.')}</p>
          <Button kind="gold" block loading={busy} onClick={publish}>{tx('Жариялау')}</Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button kind="ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>{tx('Артқа')}</Button>
        {step < 5 && <Button disabled={step === 1 && !living.length} onClick={nextStep}>{tx('Келесі')}</Button>}
      </div>
    </div>
  )
}

/* ---------- printing: QR stickers and door lists, paper size and look chosen by the tutor ---------- */
const PAPER: Record<string, [number, number]> = { A4: [210, 297], A5: [148, 210], A6: [105, 148] }
type PrintOpts = { paper: string; w: number; h: number; qr: number; look: 'navy' | 'plain' | 'gold' }
const PRINT_DEFAULT: PrintOpts = { paper: 'A4', w: 210, h: 297, qr: 45, look: 'navy' }
function usePrintOpts() {
  const [o, setO] = useState<PrintOpts>(() => { try { return { ...PRINT_DEFAULT, ...JSON.parse(localStorage.getItem('dorm-print') ?? '{}') } } catch { return PRINT_DEFAULT } })
  const set = (v: Partial<PrintOpts>) => { const n = { ...o, ...v }; setO(n); try { localStorage.setItem('dorm-print', JSON.stringify(n)) } catch { /* private mode */ } }
  return [o, set] as const
}
const mm = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(+v) || lo))

function PrintBar({ o, set, title, qr, looks }: { o: PrintOpts; set: (v: Partial<PrintOpts>) => void; title: string; qr?: boolean; looks?: boolean }) {
  const num = (label: string, v: number, lo: number, hi: number, on: (n: number) => void) => (
    <Field label={label}>{(id) => <input id={id} type="number" inputMode="numeric" min={lo} max={hi} value={v} onChange={(e) => on(mm(e.target.value, lo, hi))} className={inputCls} />}</Field>
  )
  return (
    <div className="grid grid-cols-1 gap-3 print:hidden">
      <PageHead title={title} back right={<Button onClick={printPage}><Icon n="file" size={18} />{tx('Басып шығару')}</Button>} />
      <style>{`@page { size: ${o.w}mm ${o.h}mm; margin: 6mm } @media print { body { background: #fff } #root > div { min-height: 0 !important; padding-bottom: 0 !important } main { padding-top: 0 !important } * { -webkit-print-color-adjust: exact; print-color-adjust: exact } }`}</style>
      <Card className="grid grid-cols-1 gap-3">
        <p className="font-semibold">{tx('Қағаз өлшемі')}</p>
        <Pick label={tx('Қағаз өлшемі')} value={o.paper} onChange={(paper) => set(PAPER[paper] ? { paper, w: PAPER[paper][0], h: PAPER[paper][1] } : { paper })}
          items={[['A4', 'A4'], ['A5', 'A5'], ['A6', 'A6'], ['custom', tx('Өз өлшемім')]]} />
        {o.paper === 'custom' && <div className="grid grid-cols-2 gap-2">{num(tx('Ені, мм'), o.w, 50, 420, (w) => set({ w }))}{num(tx('Биіктігі, мм'), o.h, 50, 600, (h) => set({ h }))}</div>}
        {qr && num(tx('QR жапсырма өлшемі, мм'), o.qr, 20, 120, (q) => set({ qr: q }))}
        {looks && <><p className="font-semibold">{tx('Дизайн')}</p>
          <Pick label={tx('Дизайн')} value={o.look} onChange={(look) => set({ look })} items={[['navy', tx('Лицей (көк)')], ['gold', tx('Алтын жиек')], ['plain', tx('Қарапайым')]]} /></>}
      </Card>
    </div>
  )
}

function ItemQr({ code, label, size }: { code: string; label: string; size: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => { QRCode.toString(itemUrl(code), { type: 'svg', margin: 0, color: { dark: '#000000', light: '#ffffff' } }).then(setSvg) }, [code])
  return (
    <figure style={{ width: `${size}mm`, fontSize: `${Math.max(2.2, size / 14)}mm` }} className="grid justify-items-center gap-[1mm] rounded-md border border-line p-[2mm] bg-white text-black break-inside-avoid">
      <div role="img" aria-label={tx('{0} QR коды', label)} className="w-full aspect-square [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="text-center leading-tight"><span className="block font-bold">{label}</span><span className="block text-[0.7em] tracking-wider">{code}</span></figcaption>
    </figure>
  )
}

function QrSheet({ room }: { room?: string }) {
  const d = useLoad(() => Promise.all([listDormRooms(), listDormItems()]), [])
  const [o, set] = usePrintOpts()
  if (!d.data) return <><PageHead title={tx('QR парақтары')} back /><Skeleton /></>
  const [rooms, items] = d.data
  const list = rooms.filter((r) => r.active && (!room || room === 'all' || r.id === room))
  return (
    <div className="grid grid-cols-1 gap-3 pb-6 print:pb-0">
      <PrintBar o={o} set={set} title={tx('QR парақтары')} qr />
      {list.map((r) => (
        <section key={r.id} className="grid gap-3 break-after-page last:break-after-auto">
          <h2 className="text-2xl font-bold font-display">{tx('Бөлме {0}', r.name)}</h2>
          <div className="flex flex-wrap gap-[3mm]">{items.filter((i) => i.room_id === r.id).map((i) => <ItemQr key={i.id} code={i.code} label={`${r.name} · ${itemName(i)}`} size={o.qr} />)}</div>
        </section>
      ))}
      {!list.length && <Card><Empty icon="home" title={tx('Бөлмелер жоқ')} /></Card>}
    </div>
  )
}

/** A list for the room's door: who lives here this term. One paper per room. */
function DoorSheet({ room }: { room?: string }) {
  const term = termOf(today())
  const d = useLoad(() => Promise.all([listDormRooms(), listDormAssignments()]), [])
  const [o, set] = usePrintOpts()
  if (!d.data) return <><PageHead title={tx('Есікке тізім')} back /><Skeleton /></>
  const [rooms, assigns] = d.data
  const list = rooms.filter((r) => r.active && (!room || room === 'all' || r.id === room))
    .map((r) => ({ r, people: assigns.filter((a) => a.term === term && a.room_id === r.id).sort((a, b) => a.student.full_name.localeCompare(b.student.full_name)) }))
    .filter((x) => x.people.length)
  const u = Math.min(o.w, o.h * 0.75) / 100   // 1u ≈ 1% of the paper's short side
  const look = { navy: { band: '#16264f', num: '#c9a23c', ink: '#16264f', frame: 'none' }, gold: { band: 'transparent', num: '#16264f', ink: '#16264f', frame: `${u * 1.6}mm solid #c9a23c` }, plain: { band: 'transparent', num: '#000', ink: '#000', frame: `${u * 0.4}mm solid #000` } }[o.look]
  // on screen the paper is shrunk to fit the phone; printed at its real size
  const zoom = Math.min(1, (window.innerWidth - 32) / (o.w * 3.78))
  return (
    <div className="grid grid-cols-1 gap-3 pb-6 print:pb-0 print:gap-0">
      <PrintBar o={o} set={set} title={tx('Есікке тізім')} looks />
      {!list.length && <Card><Empty icon="home" title={tx('Бұл тоқсанға әлі орналастырылмаған')} /></Card>}
      {list.map(({ r, people }) => (
        <section key={r.id} style={{ '--z': zoom, width: `${o.w - 12}mm`, height: `${o.h - 14}mm`, border: look.frame, color: look.ink, fontFamily: 'Inter, sans-serif' } as CSSProperties}
          className="[zoom:var(--z)] print:[zoom:1] bg-white break-after-page last:break-after-auto overflow-hidden flex flex-col rounded-[2mm] print:rounded-none shadow-card print:shadow-none">
          <div style={{ background: look.band, padding: `${u * 5}mm ${u * 6}mm`, color: o.look === 'navy' ? '#fff' : look.ink }} className="flex items-end justify-between gap-[2mm]">
            <span style={{ fontSize: `${u * 4}mm` }} className="font-semibold uppercase tracking-wider">{tx('Бөлме')}</span>
            <span style={{ fontSize: `${u * 22}mm`, color: look.num, lineHeight: 0.9 }} className="font-display font-bold">{r.name}</span>
          </div>
          <ol style={{ padding: `${u * 5}mm ${u * 6}mm`, fontSize: `${u * 5.2}mm`, gap: `${u * 2.6}mm` }} className="grid flex-1 content-start">
            {people.map((p, i) => (
              <li key={p.student_id} style={{ borderBottom: `${u * 0.2}mm solid #d8dce6`, paddingBottom: `${u * 2}mm` }} className="flex items-baseline gap-[2mm]">
                <span style={{ width: `${u * 6}mm` }} className="tabular-nums opacity-60">{i + 1}.</span>
                <span className="flex-1 font-semibold">{p.student.full_name}{p.is_head ? ' ★' : ''}</span>
                <span className="opacity-70">{p.student.class?.name}</span>
              </li>
            ))}
          </ol>
          <p style={{ padding: `0 ${u * 6}mm ${u * 4}mm`, fontSize: `${u * 3}mm` }} className="opacity-70">
            {[r.floor != null && tx('{0}-қабат', r.floor), termLabel(term), people.some((p) => p.is_head) && tx('★ — бөлме жауаптысы')].filter(Boolean).join(' · ')}</p>
        </section>
      ))}
    </div>
  )
}

/* ---------- a scanned item: a boy takes it, staff see whose it is ---------- */
function ItemPage({ code }: { code: string }) {
  const { me } = useMe()
  const term = termOf(today())
  const d = useLoad(async () => {
    const [rooms, items, holders] = await Promise.all([listDormRooms(), listDormItems(), listDormHolders()])
    const item = items.find((i) => i.code === code)
    const past = me.role === 'student' || !item ? [] : (await listDormHolders(true)).filter((h) => h.item_id === item.id && h.to_at)
    return { item, room: rooms.find((r) => r.id === item?.room_id), holder: holders.find((h) => h.item_id === item?.id), past }
  }, [code])
  const [busy, setBusy] = useState(false)
  const claim = async () => {
    setBusy(true)
    try { const r = await claimDormItem(code, term); toast(tx('{0} {1} сіздікі', KIND[r.kind], r.no)); go('/dorm') } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  if (d.loading) return <><PageHead title={tx('Жатақхана')} back /><Skeleton rows={1} /></>
  const v = d.data
  if (!v?.item) return <><PageHead title={tx('Жатақхана')} back /><Card><Empty icon="search" title={tx('Мұндай QR табылмады')} text={code} /></Card></>
  const mine = v.holder?.student_id === me.id
  return (
    <div className="grid grid-cols-1 gap-3 pb-6">
      <PageHead title={tx('Жатақхана')} back />
      <Card className="grid gap-3 text-center justify-items-center">
        <span className="size-16 rounded-lg bg-accent-soft text-accent grid place-items-center"><Icon n="home" size={30} /></span>
        <p className="text-2xl font-bold font-display">{v.room?.name} · {itemName(v.item)}</p>
        <Badge tone={v.item.state === 'ok' ? 'ok' : 'bad'}>{v.item.state === 'ok' ? tx('Жақсы') : tx('Бүлінген')}{v.item.note ? ` · ${v.item.note}` : ''}</Badge>
        <p className="text-sm text-muted">{mine ? tx('Бұл сіздің орныңыз') : v.holder ? tx('Иесі: {0}', v.holder.student.full_name) : tx('Бос')}</p>
        {me.role === 'student' && !v.holder && <><p className="text-sm">{tx('Алған соң бұл затқа сіз жауаптысыз: бүлінсе, сізден сұралады.')}</p><Button kind="gold" block loading={busy} onClick={claim}>{tx('Осы орынды аламын')}</Button></>}
      </Card>
      {me.role !== 'student' && <>
        <H2>{tx('Бұрынғы иелері · {0}', v.past.length)}</H2>
        <Card className="p-0 divide-y divide-line">
          {v.past.map((h) => <div key={h.id} className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1 min-w-0 truncate font-medium">{h.student.full_name}</span>
            <span className="text-xs text-muted tabular-nums">{termLabel(h.term)} · {fmtDate(h.from_at.slice(0, 10))}–{fmtDate(h.to_at!.slice(0, 10))}</span></div>)}
          {!v.past.length && <p className="px-4 py-3 text-sm text-muted">{tx('Бұрын ешкім алмаған')}</p>}
        </Card>
      </>}
    </div>
  )
}

/* ---------- student ---------- */
function StudentDorm() {
  const { me } = useMe()
  const term = termOf(today())
  const classId = me.class?.id
  const d = useLoad(async () => {
    const [rooms, items, assigns, holders, swaps, settings, round] = await Promise.all([listDormRooms(), listDormItems(), listDormAssignments(), listDormHolders(),
      listDormSwaps(), classId ? getDormSettings(classId) : null, classId ? lastLinenRound(classId) : null])
    return { rooms, items, assigns, holders, swaps, settings, round, answers: round ? await linenAnswers(round.id) : [] }
  }, [me.id])
  const [scan, setScan] = useState(false)
  const [busy, setBusy] = useState('')
  const [report, setReport] = useState({ item: '', body: '' })
  const [swapTo, setSwapTo] = useState('')
  if (d.loading && !d.data) return <><PageHead title={tx('Жатақхана')} back /><Skeleton /></>
  if (d.error) return <><PageHead title={tx('Жатақхана')} back /><ErrorBox text={d.error} retry={d.reload} /></>
  const v = d.data!
  const my = v.assigns.find((a) => a.term === term && a.student_id === me.id)
  const room = v.rooms.find((r) => r.id === my?.room_id)
  if (!room) return <><PageHead title={tx('Жатақхана')} back /><Card><Empty icon="home" title={tx('Бөлмеге әлі орналастырылмағансыз')} text={tx('Тәрбиеші орналастырғанда хабарлама келеді.')} /></Card></>
  const rv = roomView(v, term, room.id)
  const mine = rv.holding(me.id)
  const missing = KINDS.filter((k) => rv.items.some((i) => i.kind === k) && !mine.some((i) => i.kind === k))
  const answer = v.answers.find((a) => a.student_id === me.id)?.answer
  const incoming = v.swaps.filter((s) => s.to_id === me.id && s.status === 'pending')
  const act = async (key: string, p: () => Promise<unknown>, msg: string) => { setBusy(key); try { await p(); toast(msg); d.reload() } catch (e) { toast(errText(e)) } finally { setBusy('') } }
  const onText = (text: string) => {
    const code = dormCodeFrom(text)
    if (!code) return
    setScan(false)
    act('claim', () => claimDormItem(code, term), tx('Орын сіздікі'))
  }
  return (
    <div className="grid grid-cols-1 gap-3 pb-6">
      <PageHead title={tx('Жатақхана')} back />
      <div className="rounded-lg p-4 bg-hero text-on-hero shadow-card">
        <div className="flex items-center gap-3">
          <span className="size-14 rounded-lg bg-gold text-on-gold grid place-items-center text-lg font-bold font-display">{room.name}</span>
          <div className="min-w-0"><p className="text-lg font-bold">{tx('Бөлме {0}', room.name)}</p><p className="text-sm opacity-80">{termLabel(term)}{room.floor != null ? tx(' · {0}-қабат', room.floor) : ''}</p></div>
        </div>
      </div>
      <H2>{tx('Бөлмелестер')}</H2>
      <Card className="p-0 divide-y divide-line">
        {rv.people.map((p: DormAssign) => (
          <div key={p.student_id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={p.student.full_name} photo={p.student.photo} size={40} />
            <span className="flex-1 min-w-0"><span className="block font-medium truncate">{p.student.full_name}{p.student_id === me.id ? tx(' (сіз)') : ''}</span>
              <span className="block text-xs text-muted">{[p.student.class?.name, p.is_head && tx('бөлме жауаптысы')].filter(Boolean).join(' · ')}</span></span>
          </div>
        ))}
      </Card>
      <H2>{tx('Менің заттарым')}</H2>
      <Card className="p-0 divide-y divide-line">
        {KINDS.map((k) => {
          const i = mine.find((x) => x.kind === k)
          return (
            <div key={k} className="flex items-center gap-3 px-4 min-h-12">
              <span className="flex-1">{i ? itemName(i) : KIND[k]}</span>
              {i ? <Badge tone={i.state === 'ok' ? 'ok' : 'bad'}>{i.state === 'ok' ? tx('Жақсы') : tx('Бүлінген')}</Badge> : <Badge tone="muted">{tx('Таңдалмаған')}</Badge>}
            </div>
          )
        })}
      </Card>
      {missing.length > 0 && v.settings?.mode !== 'auto' && <Button kind="gold" loading={busy === 'claim'} onClick={() => setScan(true)}><Icon n="search" size={18} />{tx('QR сканерлеп орын таңдау')}</Button>}

      {v.round && (
        <>
          <H2>{tx('Постель ауыстыру · {0}', new Date(v.round.sent_at).toLocaleDateString())}</H2>
          <div className="grid gap-2">{(Object.keys(ANSWER) as LinenAnswer[]).map((a) => (
            <button key={a} type="button" aria-pressed={answer === a} disabled={!!busy} onClick={() => act('linen', () => answerLinen(v.round!.id, a), tx('Жауап жіберілді'))}
              className={`h-12 rounded-md font-semibold ${answer === a ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{ANSWER[a]}</button>
          ))}</div>
        </>
      )}

      {incoming.map((s) => (
        <Card key={s.id} className="grid gap-2 bg-accent-soft">
          <p>{tx('{0} төсекпен алмасуды ұсынады', s.from.full_name)}</p>
          <div className="grid grid-cols-2 gap-2"><Button onClick={() => act('swap', () => answerBedSwap(s.id, true), tx('Келістіңіз'))}>{tx('Келісемін')}</Button><Button kind="ghost" onClick={() => act('swap', () => answerBedSwap(s.id, false), tx('Бас тарттыңыз'))}>{tx('Жоқ')}</Button></div>
        </Card>
      ))}
      {v.settings && v.settings.swap !== 'off' && rv.people.length > 1 && (
        <>
          <H2>{tx('Төсек алмасу')}</H2>
          <Card className="grid gap-2">
            <select aria-label={tx('Кіммен алмасасыз')} value={swapTo} onChange={(e) => setSwapTo(e.target.value)} className={inputCls}>
              <option value="">{tx('Кіммен алмасасыз?')}</option>{rv.people.filter((p) => p.student_id !== me.id).map((p) => <option key={p.student_id} value={p.student_id}>{p.student.full_name}</option>)}
            </select>
            <Button kind="secondary" disabled={!swapTo} loading={busy === 'req'} onClick={() => act('req', () => requestBedSwap(swapTo, term), tx('Ұсыныс жіберілді'))}>{tx('Ұсыныс жіберу')}</Button>
            {v.settings.swap === 'confirm' && <p className="text-xs text-muted">{tx('Бөлмелесіңіз келіскен соң тәрбиеші растайды.')}</p>}
          </Card>
        </>
      )}

      {mine.length > 0 && (
        <>
          <H2>{tx('Ақау туралы хабарлау')}</H2>
          <Card className="grid gap-2">
            <select aria-label={tx('Зат')} value={report.item} onChange={(e) => setReport({ ...report, item: e.target.value })} className={inputCls}>
              <option value="">{tx('Қай зат?')}</option>{rv.items.map((i) => <option key={i.id} value={i.id}>{itemName(i)}</option>)}
            </select>
            <textarea value={report.body} maxLength={500} onChange={(e) => setReport({ ...report, body: e.target.value })} aria-label={tx('Не болды?')} placeholder={tx('Не болды?')} className={`${inputCls} h-24 py-2`} />
            <Button kind="secondary" disabled={!report.item || report.body.trim().length < 2} loading={busy === 'rep'}
              onClick={() => act('rep', async () => { await reportDormItem(report.item, report.body.trim()); setReport({ item: '', body: '' }) }, tx('Тәрбиешіге жіберілді'))}>{tx('Жіберу')}</Button>
          </Card>
        </>
      )}
      {scan && <Sheet title={tx('QR сканерлеу')} onClose={() => setScan(false)}><Scanner onText={onText} /></Sheet>}
    </div>
  )
}

