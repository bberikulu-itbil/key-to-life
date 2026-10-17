import { tx } from './i18n'
// Minimal iCalendar (.ics) reader/writer: enough for Google Calendar, Apple Calendar and Outlook exports.

export type IcsEvent = { uid: string; title: string; start: Date; end: Date; allDay: boolean; location?: string; notes?: string }

const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

/** 20261020 → local midnight; 20261020T093000Z → UTC; 20261020T093000 → local time. */
// shortcut: TZID parameters are ignored (floating times are read in the device's zone); fine for one-country schools.
export function parseIcsDate(v: string): { d: Date; allDay: boolean } {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) throw new Error(tx('Күн форматы танылмады: {0}', v))
  const [, y, mo, d, h, mi, s, z] = m
  if (h === undefined) return { d: new Date(+y, +mo - 1, +d), allDay: true }
  const args = [+y, +mo - 1, +d, +h, +mi, +(s ?? 0)] as const
  return { d: z ? new Date(Date.UTC(...args)) : new Date(...args), allDay: false }
}

const WD: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Expands DAILY / WEEKLY / MONTHLY rules with INTERVAL, COUNT, UNTIL and (weekly) BYDAY, up to a year ahead. */
export function expand(start: Date, rrule: string | undefined, horizon = new Date(Date.now() + 366 * 864e5), cap = 400): Date[] {
  if (!rrule) return [start]
  const r = Object.fromEntries(rrule.split(';').map((p) => p.split('=')))
  const interval = +(r.INTERVAL ?? 1)
  const count = r.COUNT ? +r.COUNT : Infinity
  const until = r.UNTIL ? parseIcsDate(r.UNTIL).d : horizon
  const stop = until < horizon ? until : horizon
  const out: Date[] = []
  const days = r.BYDAY ? r.BYDAY.split(',').map((x: string) => WD[x.slice(-2)]) : [start.getDay()]
  for (let i = 0; out.length < Math.min(count, cap); i++) {
    if (r.FREQ === 'WEEKLY') {
      const weekStart = new Date(start); weekStart.setDate(start.getDate() - start.getDay() + i * 7 * interval)
      if (weekStart > stop) break
      for (const wd of [...days].sort()) {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + wd)
        if (d >= start && d <= stop && out.length < Math.min(count, cap)) out.push(d)
      }
    } else {
      const d = new Date(start)
      if (r.FREQ === 'DAILY') d.setDate(start.getDate() + i * interval)
      else if (r.FREQ === 'MONTHLY') d.setMonth(start.getMonth() + i * interval)
      else return [start]                     // YEARLY and others: keep the first occurrence only
      if (d > stop) break
      out.push(d)
    }
  }
  return out
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const out: IcsEvent[] = []
  let cur: Record<string, string> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT' && cur) {
      if (cur.DTSTART && cur.SUMMARY !== undefined) {
        const s = parseIcsDate(cur.DTSTART)
        const e = cur.DTEND ? parseIcsDate(cur.DTEND).d : new Date(s.d.getTime() + (s.allDay ? 864e5 : 36e5))
        const len = e.getTime() - s.d.getTime()
        const base = cur.UID || `${cur.SUMMARY}-${cur.DTSTART}`
        for (const d of expand(s.d, cur.RRULE)) {
          out.push({ uid: cur.RRULE ? `${base}#${d.toISOString()}` : base, title: unescape(cur.SUMMARY).slice(0, 200) || tx('Атаусыз'),
            start: d, end: new Date(d.getTime() + len), allDay: s.allDay,
            location: cur.LOCATION ? unescape(cur.LOCATION) : undefined, notes: cur.DESCRIPTION ? unescape(cur.DESCRIPTION) : undefined })
        }
      }
      cur = null; continue
    }
    if (!cur) continue
    const i = line.indexOf(':'); if (i < 0) continue
    const key = line.slice(0, i).split(';')[0].toUpperCase()
    if (!(key in cur)) cur[key] = line.slice(i + 1)
  }
  return out
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const day = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
const fold = (l: string) => l.length <= 74 ? l : l.match(/.{1,74}/g)!.join('\r\n ')

export function toIcs(name: string, events: IcsEvent[]): string {
  const rows = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lyceum Life//KK', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escape(name)}`]
  const stamp = utc(new Date())
  for (const e of events) {
    rows.push('BEGIN:VEVENT', `UID:${e.uid}@lyceum-life`, `DTSTAMP:${stamp}`,
      e.allDay ? `DTSTART;VALUE=DATE:${day(e.start)}` : `DTSTART:${utc(e.start)}`,
      e.allDay ? `DTEND;VALUE=DATE:${day(new Date(e.end.getTime() + 1))}` : `DTEND:${utc(e.end)}`,
      `SUMMARY:${escape(e.title)}`)
    if (e.location) rows.push(`LOCATION:${escape(e.location)}`)
    if (e.notes) rows.push(`DESCRIPTION:${escape(e.notes)}`)
    rows.push('END:VEVENT')
  }
  rows.push('END:VCALENDAR')
  return rows.map(fold).join('\r\n') + '\r\n'
}
