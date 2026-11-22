import { listClassResources, type Media, type MentorItem, type MentorMeeting } from '../lib/api'
import { calcGoalProgress, type StudentRoadmap } from '../lib/mentor'
import { addDays, fmtDate, today } from '../lib/time'
import { lang, tx } from '../lib/i18n'
import { Card, Icon, useLoad } from './ui'
import MediaCover from './MediaCover'

/** «Шолу»: the student's picture on one screen — next meeting and what was agreed last time, goals,
 *  this week's habits, the book being read, strengths, and (staff only) the closed notes. */

const isoDow = (d: string) => { const n = new Date(d + 'T00:00:00').getDay(); return n === 0 ? 7 : n }
const LETTERS: Record<string, string[]> = { kk: ['Д', 'С', 'С', 'Б', 'Ж', 'С', 'Ж'], ru: ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'], tr: ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }
const dayLetter = (d: string) => (LETTERS[lang] ?? LETTERS.kk)[isoDow(d) - 1]

export default function DossierHome({
  studentId, classId, meetings, items, roadmap, strengths, notes, together, onTab, onPlanMeeting, onStartMeeting,
}: {
  studentId: string
  classId?: string
  meetings: MentorMeeting[]
  items: MentorItem[]
  roadmap: StudentRoadmap
  strengths: string[]
  notes: { id: string; body: string; created_at: string }[]
  together: boolean
  onTab: (t: 'plan' | 'tests' | 'resources' | 'meetings') => void
  onPlanMeeting: () => void
  onStartMeeting: () => void
}) {
  const next = meetings.filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const last = meetings.filter((m) => m.done_at).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]
  const agreed = last ? items.filter((i) => i.meeting_id === last.id) : []
  const goals = roadmap.goals.filter((g) => !g.done)
  const habits = roadmap.habits.filter((h) => !h.archived).slice(0, 4)
  const t0 = today()
  const monday = addDays(t0, 1 - isoDow(t0))
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const privateNote = !together ? (notes[0] ?? null) : null
  const lastClosed = !together ? meetings.find((m) => m.done_at && m.notes) : undefined

  return (
    <div className="grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 gap-4">
      <Card className="grid gap-3 content-start">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{tx('Келесі кездесу')}</p>
          {next && next.starts_at.slice(0, 10) <= addDays(t0, 1) && <span className="text-xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full">{next.starts_at.slice(0, 10) <= t0 ? tx('бүгін') : tx('ертең')}</span>}
        </div>
        {next ? (
          <p className="text-sm"><b>{fmtDate(next.starts_at.slice(0, 10))} · {new Date(next.starts_at).toTimeString().slice(0, 5)}</b><br /><span className="text-muted">{next.topic}</span></p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted">{tx('Жоспарланбаған')}</span>
            {!together && <button type="button" onClick={onPlanMeeting} className="text-sm font-semibold text-accent hover:underline">{tx('Белгілеу')}</button>}
          </div>
        )}
        {last && (
          <div className="border-t border-line pt-3 grid gap-2">
            <p className="text-xs font-semibold text-muted">{tx('Өткен жолы келісілді ({0})', fmtDate(last.starts_at.slice(0, 10)))}</p>
            {agreed.length ? agreed.map((i) => (
              <p key={i.id} className={`flex gap-2 items-start text-sm ${i.done ? 'text-muted line-through' : ''}`}>
                <Icon n={i.done ? 'check' : i.kind === 'habit' ? 'clock' : 'target'} size={15} className={`mt-0.5 shrink-0 ${i.done ? 'text-success' : 'text-accent'}`} />
                <span>{i.title}{i.kind === 'habit' && i.last7 != null ? ` · ${i.last7}/7` : ''}</span>
              </p>
            )) : last.actions ? <p className="text-sm whitespace-pre-line">{last.actions}</p> : <p className="text-sm text-muted">{tx('Келісім жазылмаған')}</p>}
          </div>
        )}
        <button type="button" onClick={onStartMeeting} className="h-10 rounded-lg bg-accent text-on-accent text-sm font-bold flex items-center justify-center gap-2"><Icon n="chat" size={16} />{tx('Кездесуді бастау')}</button>
      </Card>

      <Card className="grid gap-3 content-start">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold">{tx('Мақсаттар')}</p>
          <button type="button" onClick={() => onTab('plan')} className="text-xs font-semibold text-accent hover:underline">{tx('Жоспар →')}</button>
        </div>
        {goals.length ? goals.slice(0, 4).map((g) => {
          const pct = calcGoalProgress(g, roadmap.tasks)
          return (
            <div key={g.id} className="grid gap-1.5">
              <div className="flex justify-between gap-2 text-sm"><span className="font-semibold min-w-0 truncate">{g.title}</span><span className="text-muted tabular-nums">{pct}%</span></div>
              <span className="h-2 rounded-full bg-surface-2 overflow-hidden"><span className={`block h-full ${pct < 30 ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></span>
              {g.due_on && <span className="text-xs text-muted">{tx('{0} дейін', fmtDate(g.due_on))}</span>}
            </div>
          )
        }) : <p className="text-sm text-muted">{tx('Белсенді мақсат жоқ')}</p>}
      </Card>

      <Card className="grid gap-2.5 content-start">
        <p className="font-bold">{tx('Әдеттер · осы апта')}</p>
        {habits.length ? (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,18px)] gap-1.5 text-[11px] text-muted text-center"><span />{week.map((d) => <span key={d}>{dayLetter(d)}</span>)}</div>
            {habits.map((h) => {
              const checks = new Set(h.checks ?? [])
              return (
                <div key={h.id} className="grid grid-cols-[minmax(0,1fr)_repeat(7,18px)] gap-1.5 items-center">
                  <span className="text-sm truncate">{h.title}</span>
                  {week.map((d) => <span key={d} title={fmtDate(d)} className={`size-[18px] rounded-md ${checks.has(d) ? 'bg-accent' : d > t0 ? 'ring-1 ring-inset ring-line' : 'bg-surface-2'}`} />)}
                </div>
              )
            })}
          </>
        ) : <p className="text-sm text-muted">{tx('Әдет қосылмаған')}</p>}
      </Card>

      {classId && <Reading classId={classId} studentId={studentId} onOpen={() => onTab('resources')} />}

      <Card className="grid gap-2.5 content-start">
        <p className="font-bold">{tx('Күшті жақтары')}</p>
        {strengths.length ? <div className="flex flex-wrap gap-1.5">{strengths.map((s) => <span key={s} className="h-8 px-2.5 rounded-lg bg-accent-soft text-accent text-xs font-semibold flex items-center">{s}</span>)}</div>
          : <p className="text-sm text-muted">{tx('Gallup таңдалмаған')}</p>}
        <button type="button" onClick={() => onTab('tests')} className="text-sm font-semibold text-accent hover:underline justify-self-start">{tx('Бағытты ашу →')}</button>
      </Card>

      {!together && (
        <section className="rounded-xl border border-dashed border-line bg-surface-2/60 p-4 grid gap-2 content-start">
          <p className="font-bold flex items-center gap-2"><Icon n="lock" size={15} className="text-muted" />{tx('Мұғалім жазбалары')}</p>
          {privateNote && <p className="text-sm whitespace-pre-line line-clamp-3"><span className="text-xs text-muted block">{fmtDate(privateNote.created_at.slice(0, 10))}</span>{privateNote.body}</p>}
          {lastClosed && <p className="text-sm whitespace-pre-line line-clamp-3"><span className="text-xs text-muted block">{tx('Кездесу')} · {fmtDate(lastClosed.starts_at.slice(0, 10))}</span>{lastClosed.notes}</p>}
          {!privateNote && !lastClosed && <p className="text-sm text-muted">{tx('Жабық жазба жоқ')}</p>}
          <p className="text-xs text-muted">{tx('Тек мұғалімге көрінеді. «Оқушымен бірге» қосылғанда жасырылады.')}</p>
        </section>
      )}
    </div>
  )
}

function Reading({ classId, studentId, onOpen }: { classId: string; studentId: string; onOpen: () => void }) {
  const data = useLoad(() => listClassResources(classId), [classId])
  const media = (data.data?.media ?? []) as Media[]
  const mine = (st: string) => media.filter((m) => m.kind === 'book' && m.progress.some((p) => p.user_id === studentId && p.state === st))
  const doing = mine('doing')
  const done = mine('done').length
  const b = doing[0]
  const p = b?.progress.find((x) => x.user_id === studentId)
  const pct = b?.pages && p?.pages_read ? Math.min(100, Math.round((p.pages_read / b.pages) * 100)) : 0
  return (
    <Card className="grid gap-2.5 content-start">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{tx('Оқып жатыр')}</p>
        <button type="button" onClick={onOpen} className="text-xs font-semibold text-accent hover:underline">{tx('Медиатека →')}</button>
      </div>
      {b ? (
        <div className="flex gap-3">
          <div className="w-14 shrink-0"><MediaCover m={b} className="text-xl" /></div>
          <div className="flex-1 min-w-0 grid gap-1.5 content-start">
            <span className="text-sm font-bold truncate">{b.title}</span>
            {b.pages ? <>
              <span className="h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full bg-accent" style={{ width: `${pct}%` }} /></span>
              <span className="text-xs text-muted">{tx('{0} / {1} бет', p?.pages_read ?? 0, b.pages)}</span>
            </> : b.author && <span className="text-xs text-muted">{b.author}</span>}
            <span className="text-xs text-muted">{tx('{0} кітап оқыды', done)}{doing.length > 1 ? ' · ' + tx('тағы {0} оқып жатыр', doing.length - 1) : ''}</span>
          </div>
        </div>
      ) : <p className="text-sm text-muted">{done ? tx('{0} кітап оқыды · қазір ештеңе оқымайды', done) : tx('Әзірге кітап жоқ')}</p>}
    </Card>
  )
}
