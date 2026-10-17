import { listActivities, listCalendars, listEvents, listHidden, listLessons, type Activity, type CalEvent, type Calendar, type Lesson, type Me, type SessionType } from './api'
import { IMPORTANCE, addDays, isSession, isoDow, parse, sessionTime, sessionType } from './time'
import { tx } from './i18n'

export type Item = { key: string; src: string; color: string; title: string; start: Date; end: Date; allDay: boolean; place?: string | null; responsible?: string | null; link?: string; kind: 'activity' | 'event' | 'lesson'; stype?: SessionType }
export type Source = { key: string; name: string; color: string; editable?: boolean; cal?: Calendar }

export const ACT_COLOR = '#1d5bd8'
export const LESSON_COLOR = '#0e7490'

/** Activities that belong on this person's calendar automatically. */
export const myActivity = (me: Me, a: Activity) =>
  a.status === 'approved' && (
    me.role === 'student' ? a.enrollments.some((e) => e.student_id === me.id && !e.waitlisted)
    : me.role === 'deputy' || me.role === 'admin' || a.supervisor_id === me.id || a.author_id === me.id)

const at = (d: string, t: string) => new Date(`${d}T${t.slice(0, 5)}`)

export function buildItems(from: string, to: string, me: Me, d: { activities: Activity[]; events: CalEvent[]; calendars: Calendar[]; lessons: Lesson[] }): Item[] {
  const items: Item[] = []
  const mine = d.activities.filter((a) => myActivity(me, a))
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const a of mine) if (isSession(a, day)) {
      const t = sessionTime(a, day), stype = sessionType(a, day)
      items.push({ key: `a${a.id}${day}`, src: 'activities', color: stype ? IMPORTANCE[stype.importance].color : ACT_COLOR, title: a.title, start: at(day, t.start), end: at(day, t.end), allDay: false, place: a.place, link: `/a/${a.id}`, kind: 'activity', stype })
    }
    for (const l of d.lessons) if (l.weekday === isoDow(day))
      items.push({ key: `l${l.id}${day}`, src: 'timetable', color: LESSON_COLOR, title: me.role === 'student' ? l.subject : `${l.subject} · ${l.class.name}`, start: at(day, l.start_time), end: at(day, l.end_time), allDay: false, place: l.room, kind: 'lesson' })
  }
  const color = Object.fromEntries(d.calendars.map((c) => [c.id, c.color]))
  for (const e of d.events) items.push({ key: `e${e.id}`, src: e.calendar_id, color: color[e.calendar_id] ?? ACT_COLOR, title: e.title, start: new Date(e.starts_at), end: new Date(e.ends_at), allDay: e.all_day, place: e.location, responsible: e.responsible_name, kind: 'event' })
  return items.sort((x, y) => x.start.getTime() - y.start.getTime())
}

/** Everything the calendar views need, for a date range (inclusive). */
export async function loadAgenda(me: Me, from: string, to: string) {
  const [activities, events, calendars, lessons, hidden] = await Promise.all([
    listActivities(),
    listEvents(parse(from).toISOString(), parse(addDays(to, 1)).toISOString()),
    listCalendars(),
    me.role === 'student' ? (me.class ? listLessons({ classId: me.class.id }) : Promise.resolve([])) : listLessons({ teacher: me.id }),
    listHidden(),
  ])
  const sources: Source[] = [
    { key: 'activities', name: tx('Менің бастамаларым'), color: ACT_COLOR },
    { key: 'timetable', name: tx('Сабақ кестесі'), color: LESSON_COLOR },
    ...calendars.map((c) => ({ key: c.id, name: c.name, color: c.color, cal: c })),
  ]
  const all = buildItems(from, to, me, { activities, events, calendars, lessons })
  return { items: all.filter((i) => !hidden.includes(i.src)), all, sources, hidden, activities }
}

/** Does the item fall on this local day? */
export const onDay = (i: Item, day: string) => i.start < parse(addDays(day, 1)) && i.end > parse(day) || (i.start.getTime() === i.end.getTime() && i.start >= parse(day) && i.start < parse(addDays(day, 1)))
