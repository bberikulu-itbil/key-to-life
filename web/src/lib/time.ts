import type { Activity, ActivityStatus, ActivityType, Mark } from './api'

export const TYPE_LABEL: Record<ActivityType, string> = {
  olympiad_prep: 'Олимпиада', club: 'Үйірме', course: 'Курс', event: 'Іс-шара', competition: 'Жарыс', tournament: 'Турнир', challenge: 'Челлендж',
}
export const STATUS_LABEL: Record<ActivityStatus, string> = {
  pending_class_teacher: 'Сынып жетекшісінде', pending_deputy: 'Орынбасарда', approved: 'Расталды', rejected: 'Қайтарылды', cancelled: 'Тоқтатылды',
}
export const MARK_LABEL: Record<Mark, string> = { present: 'Келді', late: 'Кешікті', excused: 'Рұқсатпен', absent: 'Жоқ' }
export const WD_SHORT = ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс']   // ISO 1..7
const MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан']

// Dates are plain 'YYYY-MM-DD' strings in the school's local day; build them from local parts, never toISOString (UTC).
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => iso(new Date())
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
export const isoDow = (s: string) => ((parse(s).getDay() + 6) % 7) + 1
export const fmtDate = (s: string) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
export const hm = (t: string) => t.slice(0, 5)

type Sched = Pick<Activity, 'schedule' | 'on_date' | 'weekdays' | 'date_from' | 'date_to'>

export function isSession(a: Sched, d: string) {
  if (a.schedule === 'once') return d === a.on_date
  return !!a.date_from && !!a.date_to && d >= a.date_from && d <= a.date_to && (a.weekdays ?? []).includes(isoDow(d))
}

/** Session dates from `from` to `to` inclusive, newest first. */
export function sessions(a: Sched, from: string, to: string) {
  const out: string[] = []
  for (let d = to; d >= from; d = addDays(d, -1)) if (isSession(a, d)) out.push(d)
  return out
}

export const lastDay = (a: Sched) => (a.schedule === 'once' ? a.on_date! : a.date_to!)

export function scheduleLabel(a: Activity) {
  const time = `${hm(a.start_time)}–${hm(a.end_time)}`
  if (a.schedule === 'once') return `${fmtDate(a.on_date!)} · ${time}`
  return `${(a.weekdays ?? []).map((w) => WD_SHORT[w - 1]).join(', ')} · ${time}`
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
