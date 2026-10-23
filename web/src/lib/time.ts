import type { Activity, ActivityStatus, ActivityType, Mark, SessionType } from './api'
import { tx } from './i18n'

export const TYPE_LABEL: Record<ActivityType, string> = {
  competition: tx('Жарыс'), league: tx('Лига'), tournament: tx('Турнир'), challenge: tx('Челлендж'),
  olympiad_prep: tx('Олимпиада'), course: tx('Үйірме'), club: tx('Клуб'),
  community: tx('Қауымдастық'), team: tx('Команда'),
  event: tx('Мектеп іс-шарасы'),
}
/** Initiatives (бастамалар) in four groups, in this order everywhere. */
export const TYPE_GROUPS: [string, ActivityType[]][] = [
  [tx('Сайыстар мен жарыстар'), ['competition', 'league', 'tournament', 'challenge']],
  [tx('Өзін-өзі дамыту және үйірмелер'), ['olympiad_prep', 'course', 'club']],
  [tx('Байланыс және қауымдастық'), ['community', 'team']],
  [tx('Мектеп іс-шаралары'), ['event']],
]
/** Contest kinds get a «Нәтиже» tab: matches by round and the final places. */
export const CONTEST: ActivityType[] = ['competition', 'league', 'tournament', 'challenge', 'team']
export const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending_class_teacher: tx('Сынып жетекшісінде'), pending_deputy: tx('Орынбасарда'), approved: tx('Расталды'), rejected: tx('Қайтарылды'), cancelled: tx('Тоқтатылды'),
}
export const MARK_LABEL: Record<Mark, string> = { present: tx('Келді'), late: tx('Кешікті'), excused: tx('Себепті'), absent: tx('Келмеді') }
/** Plan categories for the overview: camps, Çalışma study sessions, olympiad (KBO) stages. */
export const PLAN_CAT: Record<'camp' | 'calisma' | 'olympiad' | 'other', string> = { camp: tx('Camp'), calisma: tx('Çalışma'), olympiad: tx('КБО / Олимпиада'), other: tx('Басқа') }
export const WD_SHORT = [tx('Дс'), tx('Сс'), tx('Ср'), tx('Бс'), tx('Жм'), tx('Сн'), tx('Жс')]   // ISO 1..7
const MONTHS = [tx('қаңтар'), tx('ақпан'), tx('наурыз'), tx('сәуір'), tx('мамыр'), tx('маусым'), tx('шілде'), tx('тамыз'), tx('қыркүйек'), tx('қазан'), tx('қараша'), tx('желтоқсан')]

// Dates are plain 'YYYY-MM-DD' strings in the school's local day; build them from local parts, never toISOString (UTC).
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => iso(new Date())
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
export const isoDow = (s: string) => ((parse(s).getDay() + 6) % 7) + 1
export const fmtDate = (s: string) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
export const hm = (t: string) => t.slice(0, 5)

export type TimeSlot = { wd: number; start: string; end: string }
export type Extra = { id: string; on_date: string; start_time: string; end_time: string; note: string | null; type_id?: string | null; series_id?: string | null }
type Sched = Pick<Activity, 'schedule' | 'on_date' | 'weekdays' | 'date_from' | 'date_to'> & { slots?: TimeSlot[] | null; extra?: Extra[] }

/** Same rule as is_session() in the database: regular day (per slot when set) in range, or an added extra date. */
export function isSession(a: Sched, d: string) {
  if (a.extra?.some((x) => x.on_date === d)) return true
  if (a.schedule === 'once') return d === a.on_date
  if (!a.date_from || !a.date_to || d < a.date_from || d > a.date_to) return false
  return a.slots?.length ? a.slots.some((s) => s.wd === isoDow(d)) : (a.weekdays ?? []).includes(isoDow(d))
}

/** The canteen's 10-day cycle: 'A1'…'B5' for a school day, counted in weeks from a Monday of week A; null on weekends. */
export function cycleCode(d: string, weekA: string) {
  const dow = isoDow(d)
  if (dow > 5) return null
  const weeks = Math.round((parse(addDays(d, 1 - dow)).getTime() - parse(weekA).getTime()) / (7 * 86400000))
  return `${weeks % 2 === 0 ? 'A' : 'B'}${dow}`
}

/** Is day d inside a school break? */
export const inBreak = (d: string, breaks: { from_date: string; to_date: string }[]) => breaks.some((b) => d >= b.from_date && d <= b.to_date)
/** A timetable lesson takes place on day d: its weekday, inside its term, outside breaks. */
export const lessonOn = (l: { weekday: number; valid_from: string | null; valid_to: string | null }, d: string, breaks: { from_date: string; to_date: string }[]) =>
  l.weekday === isoDow(d) && (!l.valid_from || d >= l.valid_from) && (!l.valid_to || d <= l.valid_to) && !inBreak(d, breaks)

/** Start and end of the session on day d. */
export function sessionTime(a: Sched & { start_time: string; end_time: string }, d: string) {
  const x = a.extra?.find((e) => e.on_date === d)
  if (x) return { start: hm(x.start_time), end: hm(x.end_time) }
  const s = a.schedule === 'weekly' ? a.slots?.find((t) => t.wd === isoDow(d)) : undefined
  return s ? { start: s.start, end: s.end } : { start: hm(a.start_time), end: hm(a.end_time) }
}

/** Session dates from `from` to `to` inclusive, newest first. */
export function sessions(a: Sched, from: string, to: string) {
  const out: string[] = []
  for (let d = to; d >= from; d = addDays(d, -1)) if (isSession(a, d)) out.push(d)
  return out
}

/** Type of the session on day d: the added session's own type, else the activity's default for regular days. */
export const sessionType = (a: { extra?: Extra[]; types?: SessionType[]; default_type_id?: string | null }, d: string) => {
  const id = a.extra?.find((x) => x.on_date === d)?.type_id ?? a.default_type_id
  return a.types?.find((t) => t.id === id)
}
export const IMPORTANCE: Record<1 | 2 | 3, { label: string; color: string }> = {
  1: { label: tx('Орташа'), color: '#3b5bab' }, 2: { label: tx('Маңызды'), color: '#d97706' }, 3: { label: tx('Өте маңызды'), color: '#dc2626' },
}

export const lastDay = (a: Sched) => [a.schedule === 'once' ? a.on_date! : a.date_to!, ...(a.extra ?? []).map((x) => x.on_date)].sort().reverse()[0]

export function scheduleLabel(a: Activity) {
  const time = a.no_time ? tx('күні бойы') : `${hm(a.start_time)}–${hm(a.end_time)}`
  const extra = a.extra?.length ? tx(' · +{0} күн', a.extra.length) : ''
  if (a.schedule === 'once') return `${fmtDate(a.on_date!)} · ${time}${extra}`
  if (a.slots?.length && !a.no_time) return [...a.slots].sort((x, y) => x.wd - y.wd).map((s) => `${WD_SHORT[s.wd - 1]} ${s.start}–${s.end}`).join(', ') + extra
  if (!a.weekdays?.length) return a.extra?.length ? tx('Күнтізбе бойынша · {0} сабақ', a.extra.length) : tx('Уақыты күнтізбеде қойылады')
  return `${a.weekdays.map((w) => WD_SHORT[w - 1]).join(', ')} · ${time}${extra}`
}

export function weekOf(s: string) {
  const mon = addDays(s, 1 - isoDow(s))
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

/** Same formula as attendance_rate() in the database. */
export function rate(marks: Mark[]) {
  const counted = marks.filter((m) => m !== 'excused').length
  return counted ? Math.round((100 * marks.filter((m) => m === 'present' || m === 'late').length) / counted) : null
}

/* ---------- booking slots ---------- */
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export type Slot = { start: string; end: string; state: 'free' | 'pending' | 'busy' | 'past' }

/** Slots of one day for a resource, each marked from the live bookings of that day. */
export function daySlots(r: { open_from: string; open_to: string; slot_minutes: number }, taken: { start_time: string; end_time: string; status: string }[], isToday: boolean, nowHm: string): Slot[] {
  const out: Slot[] = []
  for (let s = toMin(r.open_from); s + r.slot_minutes <= toMin(r.open_to); s += r.slot_minutes) {
    const e = s + r.slot_minutes
    const hit = taken.filter((b) => toMin(b.start_time) < e && toMin(b.end_time) > s)
    const state = hit.some((b) => b.status === 'approved') ? 'busy' : hit.length ? 'pending' : isToday && s < toMin(nowHm) ? 'past' : 'free'
    out.push({ start: toHm(s), end: toHm(e), state })
  }
  return out
}

/** Tap logic: first tap picks a slot, a later tap extends the range if every slot between is free. */
export function pickRange(slots: Slot[], sel: [number, number] | null, i: number): [number, number] | null {
  if (slots[i].state !== 'free') return sel
  if (!sel || sel[0] !== sel[1] || i < sel[0]) return [i, i]
  if (i === sel[0]) return null
  return slots.slice(sel[0], i + 1).every((s) => s.state === 'free') ? [sel[0], i] : [i, i]
}

/* ---------- chats ---------- */
/** Chat list stamp: time today, «кеше» yesterday, otherwise the date. */
export function chatTime(ts: string, now = new Date()) {
  const d = new Date(ts)
  const day = iso(d), t = iso(now)
  return day === t ? d.toTimeString().slice(0, 5) : day === addDays(t, -1) ? tx('кеше') : fmtDate(day)
}

/** First session on or after `from`, looking `days` ahead; null when there is none. */
export function nextSession(a: Sched, from: string, days = 60) {
  const s = sessions(a, from, addDays(from, days))
  return s.length ? s.reduce((m, d) => (d < m ? d : m)) : null
}

/** Dates of a plan: once (every 0), or on the chosen weekdays every 7 or 14 days from start to until; at most `max`. */
export function planDates(start: string, until: string, every: 0 | 7 | 14, wds: number[], max = 200) {
  if (!every) return start ? [start] : []
  const monday = parse(addDays(start, 1 - isoDow(start))).getTime()
  const out: string[] = []
  for (let d = start; d <= until && out.length < max; d = addDays(d, 1)) {
    const week = Math.floor(Math.round((parse(d).getTime() - monday) / 864e5) / 7)   // 0-based week from the start's week
    if (wds.includes(isoDow(d)) && (every === 7 || week % 2 === 0)) out.push(d)
  }
  return out
}

/** Days in a row ending today, or yesterday when today is not ticked yet. */
export function streak(done: Set<string>, t: string) {
  let d = done.has(t) ? t : addDays(t, -1), n = 0
  while (done.has(d)) { n++; d = addDays(d, -1) }
  return n
}

/** Overview by plan category: how many sessions were held and the attendance rate in each. */
export function byCategory(a: { extra?: Extra[]; types?: SessionType[]; default_type_id?: string | null }, rows: { session_date: string; status: Mark }[]) {
  const cats = new Map<string, { held: Set<string>; marks: Mark[] }>()
  for (const r of rows) {
    const c = sessionType(a, r.session_date)?.category ?? 'other'
    const v = cats.get(c) ?? { held: new Set(), marks: [] }
    v.held.add(r.session_date); v.marks.push(r.status); cats.set(c, v)
  }
  return [...cats].map(([cat, v]) => ({ cat: cat as keyof typeof PLAN_CAT, held: v.held.size, pct: rate(v.marks) }))
}
