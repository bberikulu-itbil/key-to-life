import { useEffect, useMemo, useState } from 'react'
import {
  cancelActivity, decideAbsence, decideActivity, getActivity, getAttendance, joinActivity, leaveActivity, listRequests, markAttendance,
  errText, listLeaves, setCurator, type ActivityFull, type Mark,
} from '../lib/api'
import { when } from './Leaves'
import { MARK_LABEL, STATUS_LABEL, TYPE_LABEL, fmtDate, lastDay, scheduleLabel, sessions, today } from '../lib/time'
import { useMe } from '../App'
import { needsMyDecision } from './Activities'
import { statusTone } from '../components/ActivityCard'
import AbsenceForm from './AbsenceForm'
import Syllabus from '../components/Syllabus'
import { Badge, Button, Card, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'

const CATEGORY: Record<string, string> = { illness: 'Денсаулық', school_exam: 'Мектеп емтиханы', family: 'Отбасылық жағдай', competition: 'Басқа жарыс', other: 'Басқа себеп' }

export default function ActivityDetail({ id }: { id: string }) {
  const { me } = useMe()
  const { data: a, error, loading, reload } = useLoad(() => getActivity(id), [id])
  const [busy, setBusy] = useState('')
  const [returning, setReturning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [note, setNote] = useState('')
  const [absence, setAbsence] = useState(false)

  if (loading && !a) return <><PageHead title="" back /><Skeleton rows={4} /></>
  if (error || !a) return <><PageHead title="Іс-шара" back /><ErrorBox text={error ?? 'Табылмады'} retry={reload} /></>

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try { await fn(); toast(done); setReturning(false); setCancelling(false); setNote(''); reload() } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }

  const mine = a.enrollments.find((e) => e.student_id === me.id)
  const joined = a.enrollments.filter((e) => !e.waitlisted)
  const ended = lastDay(a) < today()
  const isOwner = a.author_id === me.id || a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  const canKeepJournal = isOwner
  const decide = needsMyDecision(me, a)
  const isStaff = me.role !== 'student'

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="" back />
      <div className="flex gap-2 flex-wrap -mt-2">
        <Badge tone="accent">{TYPE_LABEL[a.type]}</Badge>
        <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
        {ended && a.status === 'approved' && <Badge tone="muted">Аяқталған</Badge>}
      </div>
      <h1 className="text-xl font-bold text-balance break-words">{a.title}</h1>

      <Card className="grid gap-2 text-sm">
        <Row icon="clock">{scheduleLabel(a)}{a.schedule === 'weekly' && <span className="text-muted"> · {fmtDate(a.date_from!)} – {fmtDate(a.date_to!)}</span>}</Row>
        <Row icon="pin">{a.place}</Row>
        <Row icon="user">Жауапты: {a.supervisor.full_name}{a.author_id !== a.supervisor_id && <span className="text-muted"> · ұсынған: {a.author.full_name}</span>}</Row>
        <Row icon="users">{a.audience_grades.length ? `${a.audience_grades.join(', ')}-сыныптар` : 'Барлық сыныптар'} · {a.capacity ? `${joined.length}/${a.capacity} орын` : `${joined.length} қатысушы`}</Row>
      </Card>
      <p className="whitespace-pre-line break-words">{a.description}</p>

      {/* student actions */}
      {me.role === 'student' && a.status === 'approved' && !ended && (
        mine ? (
          <Card className="grid gap-3">
            <p className="font-semibold">{mine.waitlisted ? 'Сіз күту тізіміндесіз. Орын босаса, хабарлама келеді.' : 'Сіз қатысушысыз'}</p>
            <div className="flex gap-2 flex-wrap">
              {!mine.waitlisted && <Button kind="secondary" onClick={() => setAbsence(true)}>Рұқсат сұрау</Button>}
              <Button kind="ghost" loading={busy === 'leave'} onClick={() => run('leave', () => leaveActivity(a.id), 'Тізімнен шықтыңыз')}>Шығу</Button>
            </div>
          </Card>
        ) : (
          <JoinButton a={a} grade={me.class?.grade} busy={busy === 'join'} onJoin={() => run('join', () => joinActivity(a.id).then((ok) => { if (!ok) toast('Орын толы — күту тізіміне жазылдыңыз') }), 'Жазылдыңыз')} />
        )
      )}

      {/* approval decision */}
      {decide && (
        <Card className="grid gap-3 border-warning">
          <p className="font-semibold">Бұл ұсыныс сіздің шешіміңізді күтуде</p>
          {returning ? (
            <>
              <Field label="Қайтару себебі" hint="Автор түзетіп, қайта жібере алады">
                {(fid, d) => <textarea id={fid} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} h-24 py-2`} />}
              </Field>
              <div className="flex gap-2"><Button kind="danger" loading={busy === 'rej'} disabled={note.trim().length < 5} onClick={() => run('rej', () => decideActivity(a.id, false, note), 'Авторға қайтарылды')}>Қайтару</Button>
                <Button kind="ghost" onClick={() => setReturning(false)}>Болдырмау</Button></div>
            </>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button loading={busy === 'ok'} onClick={() => run('ok', () => decideActivity(a.id, true), me.role === 'class_teacher' ? 'Расталды — енді орынбасарға жіберілді' : 'Расталды — барлығына көрінеді')}>Растау</Button>
              <Button kind="danger" onClick={() => setReturning(true)}>Қайтару</Button>
            </div>
          )}
        </Card>
      )}

      {a.author_id === me.id && (a.status === 'rejected' || a.status.startsWith('pending')) && (
        <Button kind="secondary" onClick={() => go(`/a/${a.id}/edit`)}>{a.status === 'rejected' ? 'Түзетіп, қайта жіберу' : 'Өңдеу'}</Button>
      )}

      {a.status === 'approved' && <Syllabus a={a} me={me} />}
      {canKeepJournal && a.status === 'approved' && <Journal a={a} />}
      {canKeepJournal && a.status === 'approved' && <Requests activityId={a.id} />}

      {(isStaff || a.author_id === me.id) && (
        <section className="grid gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Қатысушылар · {joined.length}</h2>
          {(a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin') && a.status === 'approved' && joined.length > 0 && (
            <Field label="Жауапты оқушы" hint="Іс-шарадан рұқсат сұрауларын мұғаліммен бірге алады">
              {(fid, d) => <select id={fid} aria-describedby={d} value={a.curator_id ?? ''} onChange={(e) => run('cur', () => setCurator(a.id, e.target.value || null), 'Жауапты оқушы сақталды')} className={inputCls}>
                <option value="">Тағайындалмаған</option>{joined.map((e) => <option key={e.student_id} value={e.student_id}>{e.student.full_name}</option>)}</select>}
            </Field>
          )}
          {a.enrollments.length === 0 ? <p className="text-sm text-muted">Әзірге ешкім жазылмаған.</p> : (
            <Card className="p-0 divide-y divide-line">
              {a.enrollments.map((e) => (
                <div key={e.student_id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0 truncate">{e.student.full_name} <span className="text-sm text-muted">{e.student.class?.name}</span></span>
                  {e.student_id === a.curator_id && <Badge tone="accent">Жауапты оқушы</Badge>}{e.waitlisted && <Badge tone="muted">Күту тізімі</Badge>}
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Растау тарихы</h2>
        <ol className="grid gap-3 border-l-2 border-line ml-1.5 pl-4">
          {a.approvals.slice().sort((x, y) => x.id - y.id).map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className={`absolute -left-[23px] top-1 size-3 rounded-full border-2 border-surface ${h.decision === 'rejected' ? 'bg-danger' : h.decision === 'approved' ? 'bg-success' : 'bg-accent'}`} aria-hidden />
              <b>{h.actor.full_name}</b> {h.decision === 'submitted' ? 'жіберді' : h.decision === 'approved' ? 'растады' : 'қайтарды'}
              <span className="text-muted"> · {new Date(h.created_at).toLocaleDateString('kk-KZ')}</span>
              {h.comment && <p className="mt-0.5 text-muted">«{h.comment}»</p>}
            </li>
          ))}
        </ol>
      </section>

      {isOwner && a.status === 'approved' && !ended && (
        cancelling ? (
          <Card className="grid gap-3">
            <Field label="Тоқтату себебі" hint="Қатысушыларға хабарлама барады">
              {(fid, d) => <input id={fid} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />}
            </Field>
            <div className="flex gap-2"><Button kind="danger" loading={busy === 'cancel'} disabled={!note.trim()} onClick={() => run('cancel', () => cancelActivity(a.id, note), 'Іс-шара тоқтатылды')}>Тоқтату</Button>
              <Button kind="ghost" onClick={() => setCancelling(false)}>Жоқ</Button></div>
          </Card>
        ) : <div><Button kind="ghost" onClick={() => setCancelling(true)}>Іс-шараны тоқтату</Button></div>
      )}

      {absence && <Sheet title="Рұқсат сұрау" onClose={() => setAbsence(false)}><AbsenceForm activityId={a.id} onDone={() => setAbsence(false)} /></Sheet>}
    </div>
  )
}

const Row = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <p className="flex gap-2 items-start tabular-nums"><Icon n={icon} size={18} className="text-muted mt-0.5" /><span className="min-w-0">{children}</span></p>
)

function JoinButton({ a, grade, busy, onJoin }: { a: ActivityFull; grade?: number; busy: boolean; onJoin: () => void }) {
  if (a.audience_grades.length && (!grade || !a.audience_grades.includes(grade)))
    return <p className="text-sm text-muted">Бұл іс-шара {a.audience_grades.join(', ')}-сыныптарға арналған.</p>
  const full = a.capacity !== null && a.enrollments.filter((e) => !e.waitlisted).length >= a.capacity
  return <Button block loading={busy} onClick={onJoin}>{full ? 'Күту тізіміне жазылу' : 'Қатысамын'}</Button>
}

/* ---------- journal ---------- */
const MARKS: Mark[] = ['present', 'late', 'excused', 'absent']
const MARK_ON: Record<Mark, string> = { present: 'bg-success-soft text-success', late: 'bg-late-soft text-late', excused: 'bg-warning-soft text-warning', absent: 'bg-danger-soft text-danger' }

function Journal({ a }: { a: ActivityFull }) {
  const start = a.schedule === 'once' ? a.on_date! : a.date_from!
  const end = [lastDay(a), today()].sort()[0]
  const dates = useMemo(() => sessions(a, start, end), [a, start, end])
  const [date, setDate] = useState(dates[0] ?? '')
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [saved, setSaved] = useState<Record<string, Mark>>({})
  const [busy, setBusy] = useState(false)
  const students = a.enrollments.filter((e) => !e.waitlisted)

  const [notes, setNotes] = useState<Record<string, { text: string; sick: boolean }>>({})
  useEffect(() => {
    if (!date) return
    getAttendance(a.id, date).then((rows) => { const m = Object.fromEntries(rows.map((r) => [r.student_id, r.status])); setMarks(m); setSaved(m) }, (e) => toast(errText(e)))
    // roll call: show approved leaves overlapping this session and absence requests for this date
    const s0 = new Date(`${date}T${a.start_time}`), s1 = new Date(`${date}T${a.end_time}`)
    Promise.all([listLeaves({ since: s0.toISOString(), until: s1.toISOString() }), listRequests(a.id)]).then(([leaves, reqs]) => {
      const n: Record<string, { text: string; sick: boolean }> = {}
      for (const l of leaves) if (l.status === 'approved') n[l.student_id] = { text: `Рұқсат: ${l.kind === 'outside' ? 'сыртта' : 'сабақтан'} ${when(l)}`, sick: l.category === 'illness' }
      for (const r of reqs) if (r.session_date === date && r.status !== 'rejected')
        n[r.student_id] = { text: r.status === 'approved' ? 'Рұқсат берілген' : 'Рұқсат сұраған (шешілмеген)', sick: r.category === 'illness' }
      setNotes(n)
    }, () => setNotes({}))
  }, [a.id, a.start_time, a.end_time, date])

  const dirty = students.some((s) => marks[s.student_id] !== saved[s.student_id])
  const save = async (all?: boolean) => {
    const fill = (id: string): Mark => (notes[id]?.text.startsWith('Рұқсат:') || notes[id]?.text === 'Рұқсат берілген' ? 'excused' : 'present')
    const next = all ? Object.fromEntries(students.map((s) => [s.student_id, marks[s.student_id] ?? fill(s.student_id)])) as Record<string, Mark> : marks
    const rows = Object.entries(next).filter(([, v]) => v).map(([student_id, status]) => ({ student_id, status }))
    setBusy(true)
    try { await markAttendance(a.id, date, rows); setMarks(next); setSaved(next); toast('Журнал сақталды') } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }

  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Қатысу журналы</h2>
      {!dates.length ? <Card><p className="text-sm text-muted">Бірінші сабақ әлі болған жоқ. Журнал сабақ күні ашылады.</p></Card>
        : !students.length ? <Card><p className="text-sm text-muted">Қатысушылар жоқ.</p></Card> : (
          <Card className="grid gap-3">
            <Field label="Сабақ күні">
              {(fid) => <select id={fid} value={date} onChange={(e) => (!dirty || confirmLeave()) && setDate(e.target.value)} className={inputCls}>
                {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}{d === today() ? ' (бүгін)' : ''}</option>)}
              </select>}
            </Field>
            <div className="grid divide-y divide-line">
              {students.map((s) => (
                <div key={s.student_id} className="grid gap-2 py-3">
                  <span className="font-medium">{s.student.full_name} <span className="text-sm text-muted">{s.student.class?.name}</span></span>
                  {notes[s.student_id] && <span className={`text-sm ${notes[s.student_id].sick ? 'text-danger' : 'text-warning'}`}>{notes[s.student_id].sick ? 'Ауырып қалған · ' : ''}{notes[s.student_id].text}</span>}
                  <div role="radiogroup" aria-label={s.student.full_name} className="grid grid-cols-4 gap-1 bg-surface-2 rounded-md p-1">
                    {MARKS.map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={marks[s.student_id] === m} onClick={() => setMarks({ ...marks, [s.student_id]: m })}
                        className={`h-10 rounded-sm text-[13px] font-semibold min-w-0 ${marks[s.student_id] === m ? MARK_ON[m] : 'text-muted'}`}>{MARK_LABEL[m]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button loading={busy} disabled={!dirty} onClick={() => save()}>Сақтау</Button>
              <Button kind="secondary" disabled={busy} onClick={() => save(true)}>Белгісіздерді «Келді» деп сақтау (рұқсаттылар — «Рұқсатпен»)</Button>
            </div>
          </Card>
        )}
    </section>
  )
}
// shortcut: native confirm() for unsaved journal changes; swap for an in-page dialog if it feels out of place.
const confirmLeave = () => window.confirm('Сақталмаған белгілер жоғалады. Жалғастырасыз ба?')

/* ---------- absence requests ---------- */
function Requests({ activityId }: { activityId: string }) {
  const { data, reload } = useLoad(() => listRequests(activityId), [activityId])
  const [busy, setBusy] = useState('')
  const pending = (data ?? []).filter((r) => r.status === 'pending')
  if (!pending.length) return null
  const act = async (id: string, ok: boolean) => {
    setBusy(id + ok)
    try { await decideAbsence(id, ok); toast(ok ? 'Рұқсат берілді' : 'Рұқсат берілмеді'); reload() } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Рұқсат сұраулар · {pending.length}</h2>
      {pending.map((r) => (
        <div key={r.id} className="rounded-lg bg-warning-soft p-4 grid gap-2">
          <p className="font-semibold">{r.student.full_name} · {fmtDate(r.session_date)}</p>
          <p className="text-sm"><b>{CATEGORY[r.category]}:</b> {r.reason}</p>
          <div className="flex gap-2"><Button loading={busy === r.id + true} onClick={() => act(r.id, true)}>Рұқсат беру</Button>
            <Button kind="danger" loading={busy === r.id + false} onClick={() => act(r.id, false)}>Бермеу</Button></div>
        </div>
      ))}
    </section>
  )
}

export { CATEGORY }
