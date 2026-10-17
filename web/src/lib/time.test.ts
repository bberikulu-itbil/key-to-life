// Run: npx tsx src/lib/time.test.ts
import assert from 'node:assert/strict'
import { addDays, isSession, isoDow, rate, sessions, weekOf } from './time'

const weekly = { schedule: 'weekly' as const, on_date: null, weekdays: [1, 3], date_from: '2026-10-01', date_to: '2026-10-31' }
const once = { schedule: 'once' as const, on_date: '2026-10-25', weekdays: null, date_from: null, date_to: null }

assert.equal(isoDow('2026-10-12'), 1)                 // Monday
assert.equal(isoDow('2026-10-18'), 7)                 // Sunday
assert.equal(addDays('2026-10-31', 1), '2026-11-01')
assert.ok(isSession(weekly, '2026-10-14'))            // Wednesday in range
assert.ok(!isSession(weekly, '2026-10-15'))           // Thursday
assert.ok(!isSession(weekly, '2026-11-02'))           // Monday after range
assert.ok(isSession(once, '2026-10-25') && !isSession(once, '2026-10-26'))
assert.deepEqual(sessions(weekly, '2026-10-12', '2026-10-19'), ['2026-10-19', '2026-10-14', '2026-10-12'])
assert.deepEqual(weekOf('2026-10-16'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
assert.equal(rate(['present', 'late', 'absent', 'excused']), 67)
assert.equal(rate(['excused']), null)
assert.equal(rate([]), null)
console.log('time.ts ok')

import { daySlots, pickRange } from './time'
const res = { open_from: '08:00:00', open_to: '10:00:00', slot_minutes: 30 }
const sl = daySlots(res, [{ start_time: '08:30:00', end_time: '09:00:00', status: 'approved' }, { start_time: '09:30:00', end_time: '10:00:00', status: 'pending' }], false, '00:00')
assert.deepEqual(sl.map((s) => s.state), ['free', 'busy', 'free', 'pending'])
assert.deepEqual(sl.map((s) => s.start), ['08:00', '08:30', '09:00', '09:30'])
assert.equal(daySlots(res, [], true, '08:45')[0].state, 'past')
assert.deepEqual(pickRange(sl, null, 2), [2, 2])
assert.deepEqual(pickRange(sl, [0, 0], 2), [2, 2])          // range would cross a busy slot → restart
assert.deepEqual(pickRange(sl, [2, 2], 3), [2, 2])               // pending slot is not selectable
const free = daySlots(res, [], false, '00:00')
assert.deepEqual(pickRange(free, [0, 0], 2), [0, 2])
assert.equal(pickRange(free, [1, 1], 1), null)               // tap again to clear
console.log('slots ok')

import { chatTime } from './time'
const now = new Date(2026, 9, 16, 15, 0)
assert.equal(chatTime(new Date(2026, 9, 16, 9, 5).toISOString(), now), '09:05')
assert.equal(chatTime(new Date(2026, 9, 15, 23, 0).toISOString(), now), 'кеше')
assert.equal(chatTime(new Date(2026, 9, 1, 12, 0).toISOString(), now), '1 қазан')
console.log('chatTime ok')

import { nextSession } from './time'
assert.equal(nextSession(weekly, '2026-10-15'), '2026-10-19')
assert.equal(nextSession(once, '2026-10-20'), '2026-10-25')
assert.equal(nextSession(once, '2026-10-26'), null)
console.log('nextSession ok')

import { sessionTime, sessionType, scheduleLabel, planDates } from './time'
const multi = { ...weekly, slots: [{ wd: 1, start: '15:00', end: '16:30' }, { wd: 3, start: '17:00', end: '18:00' }], extra: [{ id: 'x', on_date: '2026-10-17', start_time: '10:00:00', end_time: '12:00:00', note: null }], start_time: '15:00:00', end_time: '16:30:00' }
assert.ok(isSession(multi, '2026-10-12') && isSession(multi, '2026-10-14') && isSession(multi, '2026-10-17'))   // Mon, Wed, extra Sat
assert.ok(!isSession(multi, '2026-10-13'))
assert.deepEqual(sessionTime(multi, '2026-10-14'), { start: '17:00', end: '18:00' })
assert.deepEqual(sessionTime(multi, '2026-10-17'), { start: '10:00', end: '12:00' })
console.log('slots+extra ok')

// calendar-only activity: no weekdays, sessions only from the calendar; type from the session, else the default
{
  const types = [{ id: 't1', name: 'Çalışma', importance: 1 as const }, { id: 't3', name: 'KBO', importance: 3 as const }]
  const cal = { schedule: 'weekly' as const, on_date: null, weekdays: null, date_from: '2026-10-01', date_to: '2026-12-31', start_time: '15:00', end_time: '16:30', types, default_type_id: 't1',
    extra: [{ id: 'x', on_date: '2026-11-20', start_time: '09:00', end_time: '13:00', note: null, type_id: 't3' }] }
  assert.ok(!isSession(cal, '2026-10-14') && isSession(cal, '2026-11-20'))
  assert.equal(sessionType(cal, '2026-11-20')?.name, 'KBO')
  assert.equal(sessionType(cal, '2026-10-14')?.name, 'Çalışma')
  assert.equal(scheduleLabel(cal as never), 'Күнтізбе бойынша · 1 сабақ')
  console.log('calendar types ok')
}

assert.deepEqual(planDates('2026-10-19', '2026-10-31', 7, [1, 3]), ['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28'])
assert.deepEqual(planDates('2026-10-21', '2026-11-08', 14, [1, 7]), ['2026-10-25', '2026-11-02', '2026-11-08'])
assert.deepEqual(planDates('2026-10-21', '2026-11-08', 0, [1]), ['2026-10-21'])
console.log('planDates ok')
