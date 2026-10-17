import { useEffect, useMemo, useState } from 'react'
import {
  decideAbsence, decideActivity, getActivity, getAttendance, joinActivity, leaveActivity, listRequests, markAttendance,
  errText, listLeaves, activityChatId, myAttendance, setActivityFeatures, activityAttendance, addSessions, removeSession, tgSendRollcall, type ActivityFull, type Feature, type Mark, type MarkRow,
} from '../lib/api'
import { when } from './Leaves'
import { IMPORTANCE, MARK_LABEL, STATUS_LABEL, TYPE_LABEL, WD_SHORT, addDays, fmtDate, hm, isoDow, lastDay, parse, rate, scheduleLabel, sessionTime, sessionType, sessions, today, planDates } from '../lib/time'
import Tasks from '../components/Tasks'
import Avatar from '../components/Avatar'
import ActivityFeed from '../components/ActivityFeed'
import { useMe } from '../App'
import { needsMyDecision } from './Activities'
import { statusTone } from '../components/ActivityCard'
import AbsenceForm from './AbsenceForm'
import Syllabus from '../components/Syllabus'
import { Badge, Button, Card, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, TypeBadge, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

const CATEGORY: Record<string, string> = { illness: tx('Денсаулық'), school_exam: tx('Мектеп емтиханы'), family: tx('Отбасылық жағдай'), competition: tx('Басқа жарыс'), other: tx('Басқа себеп') }

export default function ActivityDetail({ id }: { id: string }) {
  const { me } = useMe()
  const { data: a, error, loading, reload } = useLoad(() => getActivity(id), [id])
  const [busy, setBusy] = useState('')
  const [returning, setReturning] = useState(false)
  const [note, setNote] = useState('')
  const [absence, setAbsence] = useState(false)
  const [tab, setTab] = useState<'about' | 'feed' | Feature>('about')

  if (loading && !a) return <><PageHead title="" back /><Skeleton rows={4} /></>
  if (error || !a) return <><PageHead title={tx('Іс-шара')} back /><ErrorBox text={error ?? tx('Табылмады')} retry={reload} /></>

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try { await fn(); toast(done); setReturning(false); setNote(''); reload() } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }

  const mine = a.enrollments.find((e) => e.student_id === me.id)
  const joined = a.enrollments.filter((e) => !e.waitlisted)
  const ended = lastDay(a) < today()
  const isOwner = a.author_id === me.id || a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  const decide = needsMyDecision(me, a)
  const isStaff = me.role !== 'student'
  const manager = a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  const curatorIds = [...new Set([...(a.curators ?? []).map((x) => x.student_id), ...(a.curator_id ? [a.curator_id] : [])])]
  const insider = (!!mine && !mine.waitlisted) || isOwner || curatorIds.includes(me.id)
  // the student in charge takes the roll call too
  const canKeepJournal = isOwner || curatorIds.includes(me.id)
  const tabs = a.status === 'approved'
    ? [['about', tx('Шолу')] as const, ['feed', tx('Лента')] as const, ...TABS.filter(([f]) => a.features.includes(f) && (f !== 'tasks' || insider))]
    : []
  const chatOn = a.status === 'approved' && a.features.includes('chat') && insider
  const stats = canKeepJournal && a.status === 'approved' && a.features.includes('attendance')
  const shown = tabs.some(([k]) => k === tab) ? tab : 'about'

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="" back right={<div className="flex gap-1">
        {chatOn && <ChatButton a={a} />}
        {manager && a.status === 'approved' && <button type="button" onClick={() => go(`/a/${a.id}/settings`)} aria-label={tx('Баптаулар')} className="size-11 grid place-items-center rounded-md text-muted"><Icon n="settings" size={23} /></button>}
      </div>} />
      <div className="flex gap-2 flex-wrap -mt-2">
        <Badge tone="accent">{TYPE_LABEL[a.type]}</Badge>
        <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>
        {ended && a.status === 'approved' && <Badge tone="muted">{tx('Аяқталған')}</Badge>}
        {a.archived_at && <Badge tone="muted">{tx('Архивте')}</Badge>}
        {!a.enrollment_open && a.status === 'approved' && <Badge tone="warn">{tx('Тіркелу жабық')}</Badge>}
      </div>
      <h1 className="text-xl font-bold text-balance break-words">{a.title}</h1>

      <Card className="grid gap-2 text-sm">
        <Row icon="clock">{scheduleLabel(a)}{a.schedule === 'weekly' && <span className="text-muted"> · {fmtDate(a.date_from!)} – {fmtDate(a.date_to!)}</span>}</Row>
        <Row icon="pin">{a.place}</Row>
        <Row icon="user">{tx('Жауапты:')}{' '}{a.supervisor.full_name}{a.author_id !== a.supervisor_id && <span className="text-muted">{' '}{tx('· ұсынған: {0}', a.author.full_name)}</span>}</Row>
        <Row icon="users">{a.audience_grades.length ? tx('{0}-сыныптар', a.audience_grades.join(', ')) : tx('Барлық сыныптар')} · {a.capacity ? tx('{0}/{1} орын', joined.length, a.capacity) : tx('{0} қатысушы', joined.length)}</Row>
      </Card>
      {tabs.length > 1 && (
        <div role="tablist" aria-label={tx('Іс-шара бөлімдері')} className="flex gap-5 overflow-x-auto -mx-4 px-4 border-b border-line [scrollbar-width:none]">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={shown === k} onClick={() => setTab(k)}
              className={`relative h-11 whitespace-nowrap text-[15px] ${shown === k ? 'font-semibold text-fg' : 'text-muted'}`}>
              {label}{shown === k && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-accent" />}
            </button>
          ))}
        </div>
      )}
      {shown === 'feed' && <ActivityFeed a={a} me={me} />}
      {shown === 'tasks' && <Tasks me={me} activity={a} canGive={manager || curatorIds.includes(me.id)} />}
      {shown === 'syllabus' && <Syllabus a={a} me={me} />}
      {shown === 'schedule' && <ActivityCalendar a={a} canEdit={manager} journal={canKeepJournal && a.features.includes('attendance')} onChange={reload} />}
      {shown === 'about' && (
        <>
          <p className="whitespace-pre-line break-words">{a.description}</p>
          {stats && <>{isOwner && <Requests activityId={a.id} />}<Journal a={a} /><Analytics a={a} /></>}
          {!canKeepJournal && mine && !mine.waitlisted && a.status === 'approved' && a.features.includes('attendance') && <MyMarks a={a} onAsk={() => setAbsence(true)} />}

          {/* student actions */}
          {me.role === 'student' && a.status === 'approved' && !ended && (
            mine ? (
              <Card className="grid gap-3">
                <p className="font-semibold">{mine.waitlisted ? tx('Сіз күту тізіміндесіз. Орын босаса, хабарлама келеді.') : tx('Сіз қатысушысыз')}</p>
                <div className="flex gap-2 flex-wrap">
                  {!mine.waitlisted && a.features.includes('attendance') && <Button kind="secondary" onClick={() => setAbsence(true)}>{tx('Рұқсат сұрау')}</Button>}
                  <Button kind="ghost" loading={busy === 'leave'} onClick={() => run('leave', () => leaveActivity(a.id), tx('Тізімнен шықтыңыз'))}>{tx('Шығу')}</Button>
                </div>
              </Card>
            ) : (
              <JoinButton a={a} grade={me.class?.grade} busy={busy === 'join'} onJoin={() => run('join', () => joinActivity(a.id).then((ok) => { if (!ok) toast(tx('Орын толы — күту тізіміне жазылдыңыз')) }), tx('Жазылдыңыз'))} />
            )
          )}

          {/* approval decision */}
          {decide && (
            <Card className="grid gap-3 border-warning">
              <p className="font-semibold">{tx('Бұл ұсыныс сіздің шешіміңізді күтуде')}</p>
              {returning ? (
                <>
                  <Field label={tx('Қайтару себебі')} hint={tx('Автор түзетіп, қайта жібере алады')}>
                    {(fid, d) => <textarea id={fid} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} h-24 py-2`} />}
                  </Field>
                  <div className="flex gap-2"><Button kind="danger" loading={busy === 'rej'} disabled={note.trim().length < 5} onClick={() => run('rej', () => decideActivity(a.id, false, note), tx('Авторға қайтарылды'))}>{tx('Қайтару')}</Button>
                    <Button kind="ghost" onClick={() => setReturning(false)}>{tx('Болдырмау')}</Button></div>
                </>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <Button loading={busy === 'ok'} onClick={() => run('ok', () => decideActivity(a.id, true), me.role === 'class_teacher' ? tx('Расталды — енді орынбасарға жіберілді') : tx('Расталды — барлығына көрінеді'))}>{tx('Растау')}</Button>
                  <Button kind="danger" onClick={() => setReturning(true)}>{tx('Қайтару')}</Button>
                </div>
              )}
            </Card>
          )}

          {a.author_id === me.id && (a.status === 'rejected' || a.status.startsWith('pending')) && (
            <Button kind="secondary" onClick={() => go(`/a/${a.id}/edit`)}>{a.status === 'rejected' ? tx('Түзетіп, қайта жіберу') : tx('Өңдеу')}</Button>
          )}


          {(isStaff || a.author_id === me.id) && (
            <section className="grid gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Қатысушылар · {0}', joined.length)}</h2>
              {a.enrollments.length === 0 ? <p className="text-sm text-muted">{tx('Әзірге ешкім жазылмаған.')}</p> : stats ? null : (
                <Card className="p-0 divide-y divide-line">
                  {a.enrollments.map((e) => (
                    <div key={e.student_id} className="flex items-center justify-between gap-2 px-4 py-3">
                      <Avatar name={e.student.full_name} photo={e.student.photo} size={36} />
                      <span className="min-w-0 truncate flex-1">{e.student.full_name} <span className="text-sm text-muted">{e.student.class?.name}</span></span>
                      {e.waitlisted && <Badge tone="muted">{tx('Күту тізімі')}</Badge>}
                    </div>
                  ))}
                </Card>
              )}
            </section>
          )}

          <section className="grid gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Растау тарихы')}</h2>
            <ol className="grid gap-3 border-l-2 border-line ml-1.5 pl-4">
              {a.approvals.slice().sort((x, y) => x.id - y.id).map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className={`absolute -left-[23px] top-1 size-3 rounded-full border-2 border-surface ${h.decision === 'rejected' ? 'bg-danger' : h.decision === 'approved' ? 'bg-success' : 'bg-accent'}`} aria-hidden />
                  <b>{h.actor.full_name}</b> {h.decision === 'submitted' ? tx('жіберді') : h.decision === 'approved' ? tx('растады') : tx('қайтарды')}
                  <span className="text-muted"> · {new Date(h.created_at).toLocaleDateString('kk-KZ')}</span>
                  {h.comment && <p className="mt-0.5 text-muted">«{h.comment}»</p>}
                </li>
              ))}
            </ol>
          </section>


        </>
      )}
      {absence && <Sheet title={tx('Рұқсат сұрау')} onClose={() => setAbsence(false)}><AbsenceForm activityId={a.id} onDone={() => setAbsence(false)} /></Sheet>}
    </div>
  )
}

const Row = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <p className="flex gap-2 items-start tabular-nums"><Icon n={icon} size={18} className="text-muted mt-0.5" /><span className="min-w-0">{children}</span></p>
)

function JoinButton({ a, grade, busy, onJoin }: { a: ActivityFull; grade?: number; busy: boolean; onJoin: () => void }) {
  if (!a.enrollment_open || a.archived_at) return <p className="text-sm text-muted">{tx('Тіркелу жабық. Қосылғыңыз келсе, жетекшіге жазыңыз.')}</p>
  if (a.audience_grades.length && (!grade || !a.audience_grades.includes(grade)))
    return <p className="text-sm text-muted">{tx('Бұл іс-шара {0}-сыныптарға арналған.', a.audience_grades.join(', '))}</p>
  const full = a.capacity !== null && a.enrollments.filter((e) => !e.waitlisted).length >= a.capacity
  return <Button block loading={busy} onClick={onJoin}>{full ? tx('Күту тізіміне жазылу') : tx('Қатысамын')}</Button>
}

/* ---------- journal ---------- */
const MARKS: Mark[] = ['present', 'late', 'excused', 'absent']
const MARK_ON: Record<Mark, string> = { present: 'bg-success-soft text-success', late: 'bg-late-soft text-late', excused: 'bg-warning-soft text-warning', absent: 'bg-danger-soft text-danger' }
const MARK_ICON: Record<Mark, string> = { present: 'check', late: 'clock', excused: 'file', absent: 'x' }
const LATE_MIN = [5, 10, 15, 20]
const EXCUSE: [NonNullable<MarkRow['excuse']>, string][] = [['sick', tx('Ауырып қалды')], ['other', tx('Басқа себеп')]]
const same = (x?: MarkRow, y?: MarkRow) => x?.status === y?.status && (x?.late_min ?? null) === (y?.late_min ?? null) && (x?.excuse ?? null) === (y?.excuse ?? null)

function Journal({ a, fixed }: { a: ActivityFull; fixed?: string }) {
  const start = [a.schedule === 'once' ? a.on_date! : a.date_from!, ...a.extra.map((x) => x.on_date)].sort()[0]
  const end = [lastDay(a), today()].sort()[0]
  const dates = useMemo(() => sessions(a, start, end), [a, start, end])
  const initialDate = dates.includes(today()) ? today() : dates.filter((d) => d <= today()).slice(-1)[0] ?? dates[0] ?? ''
  const [date, setDate] = useState(fixed ?? initialDate)
  const [marks, setMarks] = useState<Record<string, MarkRow>>({})
  const [saved, setSaved] = useState<Record<string, MarkRow>>({})
  const [busy, setBusy] = useState<'' | 'save' | 'all' | 'send'>('')
  const students = a.enrollments.filter((e) => !e.waitlisted)

  const [notes, setNotes] = useState<Record<string, { text: string; sick: boolean; ok: boolean }>>({})
  useEffect(() => {
    if (!date) return
    getAttendance(a.id, date).then((rows) => { const m = Object.fromEntries(rows.map(({ student_id, ...r }) => [student_id, r])); setMarks(m); setSaved(m) }, (e) => toast(errText(e)))
    // roll call: show approved leaves overlapping this session and absence requests for this date
    const tm = sessionTime(a, date)
    const s0 = new Date(`${date}T${tm.start}`), s1 = new Date(`${date}T${tm.end}`)
    Promise.all([listLeaves({ since: s0.toISOString(), until: s1.toISOString() }), listRequests(a.id)]).then(([leaves, reqs]) => {
      const n: Record<string, { text: string; sick: boolean; ok: boolean }> = {}
      for (const l of leaves) if (l.status === 'approved') n[l.student_id] = { text: tx('Рұқсат: {0} {1}', l.kind === 'outside' ? tx('сыртта') : tx('сабақтан'), when(l)), sick: l.category === 'illness', ok: true }
      for (const r of reqs) if (r.session_date === date && r.status !== 'rejected')
        n[r.student_id] = { text: r.status === 'approved' ? tx('Рұқсат берілген') : tx('Рұқсат сұраған (шешілмеген)'), sick: r.category === 'illness', ok: r.status === 'approved' }
      setNotes(n)
    }, () => setNotes({}))
  }, [a, date])

  const allowed = (id: string) => !!notes[id]?.ok
  // a known reason fills the excuse: an approved sick leave → «ауырып қалды»
  const mark = (id: string, status: Mark): MarkRow => status === 'excused' ? { status, excuse: notes[id]?.sick ? 'sick' : allowed(id) ? 'other' : null } : { status }
  const put = (id: string, r: MarkRow) => setMarks({ ...marks, [id]: r })
  const dirty = students.some((s) => !same(marks[s.student_id], saved[s.student_id]))
  const save = async (all?: boolean) => {
    const next = all ? Object.fromEntries(students.map((s) => [s.student_id, marks[s.student_id] ?? mark(s.student_id, allowed(s.student_id) ? 'excused' : 'present')])) : marks
    const rows = Object.entries(next).map(([student_id, r]) => ({ student_id, ...r }))
    setBusy(all ? 'all' : 'save')
    try { await markAttendance(a.id, date, rows); setMarks(next); setSaved(next); toast(tx('Журнал сақталды')); return true } catch (e) { toast(errText(e)); return false } finally { setBusy('') }
  }
  const send = async () => {
    if (dirty && !(await save())) return
    setBusy('send')
    try { await tgSendRollcall(a.id, date); toast(tx('«{0}» тобына жіберілді', a.tg_chat_title)) } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }

  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Қатысу журналы')}</h2>
      {!dates.length ? <Card><p className="text-sm text-muted">{tx('Бірінші сабақ әлі болған жоқ. Журнал сабақ күні ашылады.')}</p></Card>
        : !students.length ? <Card><p className="text-sm text-muted">{tx('Қатысушылар жоқ.')}</p></Card> : (
          <Card className="grid gap-3">
            {!fixed && <Field label={tx('Сабақ күні')}>
              {(fid) => <select id={fid} value={date} onChange={(e) => (!dirty || confirmLeave()) && setDate(e.target.value)} className={inputCls}>
                {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}{d === today() ? tx(' (бүгін)') : ''}</option>)}
              </select>}
            </Field>}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-hidden>
              {MARKS.map((m) => <span key={m} className="inline-flex items-center gap-1"><span className={`size-5 rounded-sm grid place-items-center ${MARK_ON[m]}`}><Icon n={MARK_ICON[m]} size={13} /></span>{MARK_LABEL[m]}</span>)}
            </p>
            <div className="grid divide-y divide-line">
              {students.map((s) => {
                const r = marks[s.student_id]
                return (
                  <div key={s.student_id} className="grid grid-cols-[48px_1fr] gap-x-3 gap-y-2 py-3">
                    <Avatar name={s.student.full_name} photo={s.student.photo} size={48} />
                    <div className="grid gap-2 min-w-0">
                      <span className="font-medium leading-snug">{s.student.full_name} <span className="text-sm text-muted">{s.student.class?.name}</span></span>
                      {notes[s.student_id] && <span className={`text-sm ${notes[s.student_id].sick ? 'text-danger' : 'text-warning'}`}>{notes[s.student_id].sick ? tx('Ауырып қалған · ') : ''}{notes[s.student_id].text}</span>}
                      <div role="radiogroup" aria-label={s.student.full_name} className="grid grid-cols-4 gap-1 bg-surface-2 rounded-md p-1">
                        {MARKS.map((m) => (
                          <button key={m} type="button" role="radio" aria-checked={r?.status === m} aria-label={MARK_LABEL[m]} title={MARK_LABEL[m]}
                            onClick={() => r?.status !== m && put(s.student_id, mark(s.student_id, m))}
                            className={`h-11 rounded-sm grid place-items-center ${r?.status === m ? MARK_ON[m] : 'text-muted'}`}><Icon n={MARK_ICON[m]} size={20} /></button>
                        ))}
                      </div>
                      {r?.status === 'late' && <Chips label={tx('Қанша минут кешікті')} items={LATE_MIN.map((n) => [n, tx('{0} мин', n)] as const)} value={r.late_min ?? null} onPick={(v) => put(s.student_id, { ...r, late_min: v })} />}
                      {r?.status === 'excused' && <Chips label={tx('Себебі')} items={EXCUSE} value={r.excuse ?? null} onPick={(v) => put(s.student_id, { ...r, excuse: v })} />}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button loading={busy === 'save'} disabled={!dirty || !!busy} onClick={() => save()}>{tx('Сақтау')}</Button>
              {a.tg_chat_title && <Button kind="secondary" loading={busy === 'send'} disabled={!!busy || (!dirty && !Object.keys(saved).length)} onClick={send}><Icon n="send" size={18} />{tx('Топқа жіберу')}</Button>}
              <Button kind="ghost" loading={busy === 'all'} disabled={!!busy} onClick={() => save(true)}>{tx('Белгісіздерді «Келді» деп сақтау')}</Button>
            </div>
            {a.tg_chat_title && <p className="text-xs text-muted -mt-1">{tx('Telegram тобы: {0}', a.tg_chat_title)}</p>}
          </Card>
        )}
    </section>
  )
}

/** One choice under a mark (late minutes, excuse); tapping the chosen one clears it. */
function Chips<T extends string | number>({ label, items, value, onPick }: { label: string; items: readonly (readonly [T, string])[]; value: T | null; onPick: (v: T | null) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(value === v ? null : v)}
          className={`min-h-11 px-3 rounded-full text-sm font-semibold border ${value === v ? 'bg-accent text-on-accent border-transparent' : 'border-input text-muted'}`}>{text}</button>
      ))}
    </div>
  )
}

const confirmLeave = () => window.confirm(tx('Сақталмаған белгілер жоғалады. Жалғастырасыз ба?'))

/* ---------- absence requests ---------- */
function Requests({ activityId }: { activityId: string }) {
  const { data, reload } = useLoad(() => listRequests(activityId), [activityId])
  const [busy, setBusy] = useState('')
  const pending = (data ?? []).filter((r) => r.status === 'pending')
  if (!pending.length) return null
  const act = async (id: string, ok: boolean) => {
    setBusy(id + ok)
    try { await decideAbsence(id, ok); toast(ok ? tx('Рұқсат берілді') : tx('Рұқсат берілмеді')); reload() } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Рұқсат сұраулар · {0}', pending.length)}</h2>
      {pending.map((r) => (
        <div key={r.id} className="rounded-lg bg-warning-soft p-4 grid gap-2">
          <p className="font-semibold">{r.student.full_name} · {fmtDate(r.session_date)}</p>
          <p className="text-sm"><b>{CATEGORY[r.category]}:</b> {r.reason}</p>
          <div className="flex gap-2"><Button loading={busy === r.id + true} onClick={() => act(r.id, true)}>{tx('Рұқсат беру')}</Button>
            <Button kind="danger" loading={busy === r.id + false} onClick={() => act(r.id, false)}>{tx('Бермеу')}</Button></div>
        </div>
      ))}
    </section>
  )
}

export { CATEGORY }

const FEATURES: [Feature, string][] = [['chat', tx('Чат')], ['tasks', tx('Тапсырмалар')], ['syllabus', tx('Силабус')], ['schedule', tx('Күнтізбе')], ['attendance', tx('Келу есебі')]]
const TABS = FEATURES.filter(([f]) => f === 'tasks' || f === 'syllabus' || f === 'schedule')
const FEATURE_HINT: Record<Feature, string> = {
  chat: tx('Жетекші мен қатысушылардың ортақ чаты'),
  syllabus: tx('Тақырыптар мен есептер, оқушы меңгергенін белгілейді'),
  schedule: tx('Сабақ күндері, қосымша сабақ қосу, әр сабақтың журналы'),
  tasks: tx('Барлығына немесе бір оқушыға тапсырма'),
  attendance: tx('Шолуда қатысу анализі, журнал мен рұқсат сұраулары'),
}

export function Modules({ a, onDone }: { a: ActivityFull; onDone: () => void }) {
  const [on, setOn] = useState<Feature[]>(a.features)
  const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); try { await setActivityFeatures(a.id, on); toast(tx('Сақталды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">{tx('Қатысушыларға қай бөлімдер көрінетінін таңдаңыз. Өшірілген бөлімнің деректері сақталады, қайта қосқанда оралады.')}</p>
      <div className="grid divide-y divide-line">
        {FEATURES.map(([f, label]) => (
          <label key={f} className="flex items-center gap-3 min-h-14 py-2">
            <span className="flex-1"><span className="block font-semibold">{label}</span><span className="block text-sm text-muted">{FEATURE_HINT[f]}</span></span>
            <input type="checkbox" checked={on.includes(f)} onChange={(e) => setOn(e.target.checked ? [...on, f] : on.filter((x) => x !== f))} className="size-5 accent-[var(--accent)]" />
          </label>
        ))}
      </div>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
    </div>
  )
}

function MyMarks({ a, onAsk }: { a: ActivityFull; onAsk: () => void }) {
  const { me } = useMe()
  const rows = useLoad(async () => (await myAttendance(me.id)).filter((r) => r.activity_id === a.id), [a.id, me.id])
  const list = rows.data ?? []
  const r = rate(list.map((x) => x.status))
  return (
    <section className="grid gap-2">
      <Card className="flex items-center gap-3">
        <div className="flex-1"><p className="text-2xl font-bold tabular-nums">{r === null ? '—' : `${r}%`}</p><p className="text-xs text-muted">{tx('қатысу · {0} белгі', list.length)}</p></div>
        {a.features.includes('attendance') && lastDay(a) >= today() && <Button kind="secondary" onClick={onAsk}>{tx('Рұқсат сұрау')}</Button>}
      </Card>
      {list.length > 0 && (
        <Card className="p-0 divide-y divide-line">
          {list.map((x) => <div key={x.session_date} className="flex justify-between px-4 py-2.5"><span>{fmtDate(x.session_date)}</span><span className="text-sm font-semibold">{MARK_LABEL[x.status]}</span></div>)}
        </Card>
      )}
    </section>
  )
}

function ChatButton({ a }: { a: ActivityFull }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try { const id = await activityChatId(a.id); if (id) go(`/c/${id}`); else toast(tx('Чат табылмады')) } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return <Button kind="secondary" loading={busy} onClick={open}><Icon n="chat" size={18} />{tx('Чат')}</Button>
}

/* ---------- overview: attendance analytics for the leader ---------- */
function Analytics({ a }: { a: ActivityFull }) {
  const att = useLoad(() => activityAttendance(a.id), [a.id])
  const rows = att.data ?? []
  const held = new Set(rows.map((r) => r.session_date)).size
  const overall = rate(rows.map((r) => r.status))
  const people = a.enrollments.filter((e) => !e.waitlisted).map((e) => {
    const mine = rows.filter((r) => r.student_id === e.student_id)
    return { e, pct: rate(mine.map((r) => r.status)), absent: mine.filter((r) => r.status === 'absent').length, late: mine.filter((r) => r.status === 'late').length }
  }).sort((x, y) => (x.pct ?? 101) - (y.pct ?? 101))
  const last = [...new Set(rows.map((r) => r.session_date))].sort().slice(-8)
  return (
    <section className="grid gap-2">
      <div className="grid grid-cols-3 gap-2">
        <Card className="py-3"><p className="text-2xl font-bold tabular-nums">{overall === null ? '—' : `${overall}%`}</p><p className="text-xs text-muted">{tx('орташа қатысу')}</p></Card>
        <Card className="py-3"><p className="text-2xl font-bold tabular-nums">{held}</p><p className="text-xs text-muted">{tx('белгіленген сабақ')}</p></Card>
        <Card className="py-3"><p className="text-2xl font-bold tabular-nums">{people.filter((p) => p.pct !== null && p.pct < 70).length}</p><p className="text-xs text-muted">{tx('70%-дан төмен')}</p></Card>
      </div>
      {last.length > 1 && (
        <Card className="grid gap-2">
          <p className="text-sm font-semibold">{tx('Соңғы сабақтар')}</p>
          <div className="flex items-end gap-1.5 h-20" role="img" aria-label={tx('Соңғы сабақтардағы қатысу пайызы')}>
            {last.map((d) => {
              const p = rate(rows.filter((r) => r.session_date === d).map((r) => r.status)) ?? 0
              return <div key={d} className="flex-1 grid gap-1 justify-items-center"><span className="text-[10px] tabular-nums text-muted">{p}</span>
                <span className={`w-full rounded-t-sm ${p < 70 ? 'bg-danger' : 'bg-accent'}`} style={{ height: `${Math.max(4, p * 0.5)}px` }} /></div>
            })}
          </div>
          <div className="flex gap-1.5">{last.map((d) => <span key={d} className="flex-1 text-center text-[10px] text-muted tabular-nums">{d.slice(8)}.{d.slice(5, 7)}</span>)}</div>
        </Card>
      )}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Қатысушылар · {0}', people.length)}</h2>
      {!people.length ? <Card><p className="text-sm text-muted">{tx('Әзірге ешкім жазылмаған.')}</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {people.map(({ e, pct, absent, late }) => (
            <div key={e.student_id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={e.student.full_name} photo={e.student.photo} size={40} />
              <span className="flex-1 min-w-0"><span className="block truncate font-medium">{e.student.full_name}{e.student_id === a.curator_id ? tx(' · жауапты') : ''}</span>
                <span className="block text-xs text-muted">{e.student.class?.name ?? ''}{absent ? tx(' · {0} рет жоқ', absent) : ''}{late ? tx(' · {0} рет кешікті', late) : ''}</span></span>
              <span className={`text-sm font-semibold tabular-nums ${pct !== null && pct < 70 ? 'text-danger' : ''}`}>{pct === null ? '—' : `${pct}%`}</span>
            </div>
          ))}
        </Card>
      )}
    </section>
  )
}

/* ---------- calendar: every session, extra sessions, journal per session ---------- */
function ActivityCalendar({ a, canEdit, journal, onChange }: { a: ActivityFull; canEdit: boolean; journal: boolean; onChange: () => void }) {
  const t = today()
  const start = [a.schedule === 'once' ? a.on_date! : a.date_from!, ...a.extra.map((x) => x.on_date)].sort()[0]
  const all = sessions(a, start, lastDay(a)).reverse()
  const att = useLoad(() => (journal ? activityAttendance(a.id) : Promise.resolve([])), [a.id, journal])
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const del = async (id: string) => { try { await removeSession(id); toast(tx('Сабақ алынды')); onChange() } catch (e) { toast(errText(e)) } }
  const list = showPast ? all : all.filter((d) => d >= t)
  const past = all.length - all.filter((d) => d >= t).length
  const months = [...new Set(list.map((d) => d.slice(0, 7)))]
  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted">{tx('{0} · барлығы {1} сабақ', scheduleLabel(a), all.length)}</p>
        {canEdit && <Button kind="secondary" onClick={() => setAdding(true)}>{tx('Жоспар қосу')}</Button>}
      </div>
      {past > 0 && <button type="button" onClick={() => setShowPast(!showPast)} className="text-sm text-accent font-semibold text-left min-h-11">{showPast ? tx('Өткендерді жасыру') : tx('Өткен {0} сабақты көрсету', past)}</button>}
      {!list.length ? <Card><p className="text-sm text-muted">{tx('Алда сабақ жоқ.')}</p></Card> : months.map((m) => (
        <div key={m} className="grid gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{fmtDate(`${m}-01`).split(' ')[1]}</h3>
          <Card className="p-0 divide-y divide-line">
            {list.filter((d) => d.startsWith(m)).map((d) => {
              const tm = sessionTime(a, d)
              const x = a.extra.find((e) => e.on_date === d)
              const ty = sessionType(a, d)
              const marks = (att.data ?? []).filter((r) => r.session_date === d)
              const body = (
                <>
                  <span className={`w-11 h-11 rounded-md grid content-center justify-items-center shrink-0 ${d === t ? 'bg-accent text-on-accent' : ty?.importance === 3 ? 'bg-danger text-on-accent' : 'bg-surface-2'}`}>
                    <span className="font-bold leading-none tabular-nums">{parse(d).getDate()}</span><span className="text-[10px]">{WD_SHORT[isoDow(d) - 1]}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap"><span className="tabular-nums">{tm.start}–{tm.end}</span>
                      {ty && <TypeBadge t={ty} />}{x && !ty && <span className="text-xs text-accent font-semibold">{tx('қосымша')}</span>}</span>
                    <span className="block text-xs text-muted truncate">{x?.note ?? a.place}{journal && d <= t ? (marks.length ? tx(' · {0}% келді', rate(marks.map((r) => r.status)) ?? 0) : tx(' · журнал толтырылмаған')) : ''}</span>
                  </span>
                </>
              )
              return (
                <div key={d} className={`flex items-center gap-2 pr-2 ${ty?.importance === 3 ? 'bg-danger-soft' : ''}`}>
                  {journal && d <= t
                    ? <button type="button" onClick={() => setOpen(d)} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">{body}<Icon n="chev" className="text-muted" /></button>
                    : <div className="flex-1 flex items-center gap-3 px-4 py-2.5">{body}</div>}
                  {canEdit && x && d >= t && <button type="button" onClick={() => del(x.id)} aria-label={tx('{0} қосымша сабағын алу', fmtDate(d))} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
                </div>
              )
            })}
          </Card>
        </div>
      ))}
      {open && <Sheet title={tx('Журнал · {0}', fmtDate(open))} onClose={() => { setOpen(null); att.reload() }}><Journal a={a} fixed={open} /></Sheet>}
      {adding && <Sheet title={tx('Жоспар қосу')} onClose={() => setAdding(false)}><AddSession a={a} onDone={() => { setAdding(false); onChange() }} /></Sheet>}
    </section>
  )
}

const REPEAT: [0 | 7 | 14, string][] = [[0, tx('Бір рет')], [7, tx('Апта сайын')], [14, tx('2 апта сайын')]]

function AddSession({ a, onDone }: { a: ActivityFull; onDone: () => void }) {
  const [f, setF] = useState({ date: today(), start: hm(a.start_time), end: hm(a.end_time), note: '', type: a.default_type_id ?? '', every: 0 as 0 | 7 | 14, wds: [isoDow(today())], until: addDays(today(), 60) })
  const [busy, setBusy] = useState(false)
  const dates = planDates(f.date, f.until, f.every, f.wds)
  const toggleWd = (w: number) => setF({ ...f, wds: f.wds.includes(w) ? f.wds.filter((x) => x !== w) : [...f.wds, w].sort() })
  const save = async () => {
    if (!f.date || f.end <= f.start) return toast(tx('Күн мен уақытты тексеріңіз'))
    if (f.every && f.until < f.date) return toast(tx('«Қашанға дейін» күні басталу күнінен кейін болуы керек'))
    if (!dates.length) return toast(tx('Кемінде бір күн таңдаңыз'))
    setBusy(true)
    // a repeating plan shares one series id, so it can be edited or removed in the activity settings
    const series_id = f.every ? crypto.randomUUID() : null
    try {
      await addSessions(dates.map((d) => ({ activity_id: a.id, on_date: d, start_time: f.start, end_time: f.end, note: f.note.trim() || null, type_id: f.type || null, series_id })))
      toast(tx('{0} жоспар қосылды, қатысушылардың күнтізбесінде шығады', dates.length)); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      {a.types.length > 0 && <Field label={tx('Түрі')} hint={tx('Түрлерді баптауларда қосасыз')}>{(id, d) => <select id={id} aria-describedby={d} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>
        <option value="">{tx('Түрсіз')}</option>
        {a.types.map((t) => <option key={t.id} value={t.id}>{t.name} · {IMPORTANCE[t.importance].label.toLowerCase()}</option>)}</select>}</Field>}
      <div role="radiogroup" aria-label={tx('Қайталау')} className="grid grid-cols-3 gap-1 bg-surface-2 rounded-md p-1">
        {REPEAT.map(([n, label]) => (
          <button key={n} type="button" role="radio" aria-checked={f.every === n} onClick={() => setF({ ...f, every: n })}
            className={`h-10 rounded-sm text-sm font-semibold ${f.every === n ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</button>
        ))}
      </div>
      {f.every > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="text-sm font-semibold mb-1.5">{tx('Апта күндері')}</legend>
          <div className="grid grid-cols-7 gap-1">
            {WD_SHORT.map((w, i) => (
              <button key={w} type="button" aria-pressed={f.wds.includes(i + 1)} onClick={() => toggleWd(i + 1)}
                className={`h-11 rounded-sm text-sm font-semibold ${f.wds.includes(i + 1) ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{w}</button>
            ))}
          </div>
        </fieldset>
      )}
      <Field label={f.every ? tx('Басталу күні') : tx('Күні')}>{(id) => <input id={id} type="date" value={f.date} min={today()} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />}</Field>
      {f.every > 0 && <Field label={tx('Қашанға дейін')} hint={tx('{0} жоспар қосылады', dates.length)}>{(id, d) => <input id={id} aria-describedby={d} type="date" value={f.until} min={f.date} onChange={(e) => setF({ ...f, until: e.target.value })} className={inputCls} />}</Field>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx('Басталуы')}>{(id) => <input id={id} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Аяқталуы')}>{(id) => <input id={id} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className={inputCls} />}</Field>
      </div>
      <Field label={tx('Ескерту')} hint={tx('Мысалы: басқа кабинет, лагерь орны')}>{(id, d) => <input id={id} aria-describedby={d} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{dates.length > 1 ? tx('{0} жоспар қосу', dates.length) : tx('Қосу')}</Button>
    </div>
  )
}
