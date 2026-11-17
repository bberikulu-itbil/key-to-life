import { useState } from 'react'
import { listReadingLog, type Media, type Student } from '../lib/api'
import { fmtDate, today } from '../lib/time'
import { pagesByDay } from '../lib/stars'
import { Card, Chips, ErrorBox, Skeleton, useLoad } from './ui'
import Avatar from './Avatar'
import MediaCover from './MediaCover'
import { tx } from '../lib/i18n'

/* «Оқу аналитикасы»: pages per day, finished books and watched films for the class over a period.
   Staff see every student; a student sees the class totals and their own line. */

const back = (days: number) => new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10)

export default function ReadingStats({ classId, media, students, staff, meId }: { classId: string; media: Media[]; students: Student[]; staff: boolean; meId: string }) {
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const from = back(Number(days))
  const logs = useLoad(() => listReadingLog(classId, from), [classId, from])
  if (logs.loading && !logs.data) return <Skeleton />
  if (logs.error) return <ErrorBox text={logs.error} retry={logs.reload} />
  const rows = logs.data ?? []
  const ids = new Set(students.map((s) => s.id))
  const mine = rows.filter((l) => ids.has(l.user_id))
  const total = mine.reduce((a, l) => a + l.pages, 0)
  const byDay = pagesByDay(mine, Number(days), today())
  const max = Math.max(1, ...byDay.map((d) => d.pages))
  const finished = (kind: Media['kind'], uid?: string) => media.filter((m) => m.kind === kind).reduce((a, m) => a + m.progress.filter((p) => p.state === 'done' && p.finished_on && p.finished_on >= from && ids.has(p.user_id) && (!uid || p.user_id === uid)).length, 0)
  const per = students.map((s) => ({ s, pages: mine.filter((l) => l.user_id === s.id).reduce((a, l) => a + l.pages, 0), books: finished('book', s.id), films: finished('film', s.id) }))
    .sort((a, b) => b.pages - a.pages || b.books - a.books || b.films - a.films)
  const readers = per.filter((p) => p.pages > 0).length
  const topBooks = media.filter((m) => m.kind === 'book').map((m) => ({ m, pages: mine.filter((l) => l.media_id === m.id).reduce((a, l) => a + l.pages, 0), people: new Set(mine.filter((l) => l.media_id === m.id).map((l) => l.user_id)).size }))
    .filter((x) => x.pages > 0).sort((a, b) => b.pages - a.pages).slice(0, 6)
  const shown = staff ? per : per.filter((p) => p.s.id === meId)
  const tiles: [string, string | number, string][] = [
    ['📖', total, tx('бет оқылды')],
    ['👥', `${readers}/${students.length}`, tx('оқушы оқыды')],
    ['📅', Math.round(total / Number(days)), tx('бет / күн (сынып)')],
    ['✅', finished('book'), tx('кітап оқылып бітті')],
    ['🎬', finished('film'), tx('фильм көрілді')],
  ]
  return (
    <div className="grid grid-cols-1 gap-3">
      <Chips label={tx('Кезең')} value={days} onChange={setDays} items={[['7', tx('7 күн')], ['30', tx('30 күн')], ['90', tx('90 күн')]]} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tiles.map(([e, v, l]) => <Card key={l} className="p-3 grid gap-0.5"><span className="text-lg font-bold tabular-nums">{e} {v}</span><span className="text-xs text-muted">{l}</span></Card>)}
      </div>
      <Card className="grid gap-2">
        <p className="font-semibold text-sm">{tx('Күн сайын оқылған бет')}</p>
        <div className="flex items-end gap-px h-28" role="img" aria-label={tx('{0} күнде {1} бет', days, total)}>
          {byDay.map((d) => <span key={d.day} title={`${fmtDate(d.day)} · ${d.pages}`} className="flex-1 rounded-t-sm bg-accent/80 min-h-px" style={{ height: `${(100 * d.pages) / max}%`, opacity: d.pages ? 1 : 0.15 }} />)}
        </div>
        <div className="flex justify-between text-[11px] text-muted"><span>{fmtDate(byDay[0].day)}</span><span>{tx('ең көбі: {0} бет', max === 1 && !total ? 0 : max)}</span><span>{fmtDate(byDay[byDay.length - 1].day)}</span></div>
      </Card>
      <Card className="p-0 overflow-hidden">
        <p className="font-semibold text-sm px-4 pt-3">{staff ? tx('Оқушылар') : tx('Менің нәтижем')}</p>
        <ul className="divide-y divide-line">{shown.map(({ s, pages, books, films }, i) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2">
            {staff && <span className="w-5 text-xs text-muted tabular-nums">{i + 1}</span>}
            <Avatar name={s.full_name} photo={s.photo} size={28} />
            <span className="flex-1 min-w-0 truncate text-sm">{s.full_name.split(' ').slice(0, 2).join(' ')}</span>
            <span className="text-xs text-muted tabular-nums whitespace-nowrap">📖 {pages} · ✅ {books} · 🎬 {films}</span>
          </li>
        ))}</ul>
      </Card>
      {topBooks.length > 0 && (
        <Card className="grid gap-2">
          <p className="font-semibold text-sm">{tx('Ең көп оқылған кітаптар')}</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{topBooks.map(({ m, pages, people }) => (
            <div key={m.id} className="grid gap-1 min-w-0"><MediaCover m={m} className="text-2xl" /><span className="text-xs font-semibold leading-tight line-clamp-2">{m.title}</span><span className="text-[11px] text-muted">{tx('{0} бет · {1} оқушы', pages, people)}</span></div>
          ))}</div>
        </Card>
      )}
    </div>
  )
}
