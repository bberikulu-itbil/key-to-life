// Run: npx tsx src/lib/ics.test.ts
import assert from 'node:assert/strict'
import { expand, parseIcs, parseIcsDate, toIcs } from './ics'

process.env.TZ = 'Asia/Almaty'

assert.equal(parseIcsDate('20261020').allDay, true)
assert.equal(parseIcsDate('20261020T093000Z').d.toISOString(), '2026-10-20T09:30:00.000Z')
assert.equal(parseIcsDate('20261020T093000').d.getHours(), 9)

// weekly on Mon+Wed, 4 times
const w = expand(new Date(2026, 9, 19, 15, 0), 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4')
assert.deepEqual(w.map((d) => `${d.getDate()}/${d.getHours()}`), ['19/15', '21/15', '26/15', '28/15'])
// until is inclusive, interval 2
assert.equal(expand(new Date(2026, 9, 1), 'FREQ=DAILY;INTERVAL=2;UNTIL=20261007T235959Z').length, 4)

const sample = [
  'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:abc', 'DTSTART:20261020T040000Z', 'DTEND:20261020T050000Z',
  'SUMMARY:Физика\\, зертханалық', 'LOCATION:301', 'DESCRIPTION:1-жол\\n2-жол', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:r1', 'DTSTART;TZID=Asia/Almaty:20261019T150000', 'DTEND;TZID=Asia/Almaty:20261019T163000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3', 'SUMMARY:Шахмат үйірмесі ұзақ атау', ' жалғасы', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261027', 'DTEND;VALUE=DATE:20261103', 'SUMMARY:Каникул', 'END:VEVENT', 'END:VCALENDAR',
].join('\r\n')
const ev = parseIcs(sample)
assert.equal(ev.length, 1 + 3 + 1)
assert.equal(ev[0].title, 'Физика, зертханалық')
assert.equal(ev[0].notes, '1-жол\n2-жол')
assert.equal(ev[1].title, 'Шахмат үйірмесі ұзақ атаужалғасы')       // folded line joined
assert.equal(ev[1].end.getTime() - ev[1].start.getTime(), 90 * 60e3)
assert.notEqual(ev[1].uid, ev[2].uid)                                 // each occurrence imports once
assert.equal(ev[4].allDay, true)

// round trip keeps titles, times and all-day spans
const back = parseIcs(toIcs('Тест', ev))
assert.equal(back.length, ev.length)
assert.equal(back[0].title, ev[0].title)
assert.equal(back[0].start.getTime(), ev[0].start.getTime())
assert.equal(back[4].start.getTime(), ev[4].start.getTime())
assert.equal(back[4].allDay, true)
console.log('ics ok')
