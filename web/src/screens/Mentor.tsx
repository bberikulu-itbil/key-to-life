import { useState } from 'react'
import {
  addMentorMeeting, classMentorMeetings, classStudents, errText, finishMentorMeeting, listClasses, listStaff, myMentorMeetings, removeMentorMeeting, studentMentor,
  type MentorMeeting,
} from '../lib/api'
import { mbtiScore } from '../lib/mbti'
import { MI_KINDS, miScore } from '../lib/mi'
import { RIASEC, hollandScore } from '../lib/holland'
import { chatTime, fmtDate } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'

/* «Жеке кездесулер» — one-on-one meetings of the class teacher or tutor with a student. */

const at = (s: string) => new Date(s).toLocaleString(lang === 'kk' ? 'kk-KZ' : lang, { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' })
const upcoming = (m: { done_at: string | null }) => !m.done_at
const CHANNEL: Record<string, string> = { phone: tx('Телефон'), meeting: tx('Кездесу'), chat: tx('Чат'), visit: tx('Үйіне бару') }

export default function Mentor({ studentId, classId }: { studentId?: string; classId?: string }) {
  const { me } = useMe()
  if (me.role === 'student') return <MyMeetings />
  return studentId ? <StudentPage id={studentId} /> : <ClassList classId={classId} />
}

/** The student: meetings meant for them and what was agreed. */
function MyMeetings() {
  const list = useLoad(myMentorMeetings, [])
  const rows = list.data ?? []
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Жеке кездесулерім')} back />
      {list.loading && !list.data ? <Skeleton /> : list.error ? <ErrorBox text={list.error} retry={list.reload} /> : !rows.length
        ? <Empty icon="user" title={tx('Кездесу жоқ')} text={tx('Сынып жетекшісі не тәрбиеші сенімен жеке кездесу белгілесе, осында шығады.')} />
        : rows.map((m) => (
          <Card key={m.id} className="grid gap-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{m.topic}</span>
              {upcoming(m) ? <Badge tone="accent">{tx('Алда')}</Badge> : <Badge tone="ok">{tx('Өтті')}</Badge>}
            </div>
            <p className="text-sm text-muted">{at(m.starts_at)}{m.staff_name ? ` · ${m.staff_name}` : ''}</p>
            {m.actions && <div className="rounded-md bg-accent-soft p-3"><p className="text-xs font-semibold text-accent">{tx('Келісілген міндеттер')}</p><p className="text-sm whitespace-pre-line">{m.actions}</p></div>}
          </Card>
        ))}
    </div>
  )
}

/** Staff: the class's students with their next and last meeting. */
function ClassList({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const data = useLoad(async () => (cls ? Promise.all([classStudents(cls.id), classMentorMeetings(cls.id)]) : null), [cls?.id])
  if (classes.loading && !classes.data) return <><PageHead title={tx('Жеке кездесулер')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Жеке кездесулер')} back /><Empty icon="user" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const [students, meetings] = data.data ?? [[], []]
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Жеке кездесулер')} back right={options.length > 1 ? (
        <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/mentor?class=${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>) : undefined} />
      {data.loading && !data.data ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-line">{students.map((s) => {
            const mine = meetings.filter((m) => m.student_id === s.id)
            const next = mine.filter(upcoming).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
            const last = mine.find((m) => m.done_at)
            return (
              <li key={s.id}><a href={`#/mentor/${s.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={s.full_name} photo={s.photo} size={40} />
                <span className="flex-1 min-w-0"><span className="block font-medium truncate">{s.full_name}</span>
                  <span className="block text-xs text-muted truncate">{next ? tx('Келесі: {0}', at(next.starts_at)) : last ? tx('Соңғы: {0}', fmtDate(last.starts_at.slice(0, 10))) : tx('Кездесу болмаған')}</span></span>
                {next && <span className="size-2.5 rounded-full bg-accent" aria-hidden />}<Icon n="chev" className="text-muted" />
              </a></li>
            )
          })}</ul>
        </Card>
      )}
    </div>
  )
}

/** Staff: one student — test results, meetings, and everything noted about them. */
function StudentPage({ id }: { id: string }) {
  const data = useLoad(async () => Promise.all([studentMentor(id), listStaff()]), [id])
  const [f, setF] = useState({ when: '', topic: '', show: 'show' as 'show' | 'staff' })
  const [busy, setBusy] = useState(false)
  if (data.loading && !data.data) return <><PageHead title={tx('Жеке кездесу')} back /><Skeleton /></>
  if (data.error || !data.data) return <><PageHead title={tx('Жеке кездесу')} back /><ErrorBox text={data.error ?? tx('Табылмады')} retry={data.reload} /></>
  const [d, staff] = data.data
  const s = d.student
  const staffName = (sid: string | null) => staff.find((x) => x.id === sid)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const add = async () => {
    setBusy(true)
    try {
      await addMentorMeeting({ class_id: s.class_id, student_id: s.id, starts_at: new Date(f.when).toISOString(), topic: f.topic.trim(), visible: f.show === 'show' })
      setF({ ...f, when: '', topic: '' }); toast(f.show === 'show' ? tx('Оқушыға хабарлама жіберілді') : tx('Сақталды')); data.reload()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  // the newest answer of each test
  const test = (t: string) => d.tests.find((x) => x.type === t)
  const history = [
    ...d.notes.map((n) => ({ key: 'n' + n.id, when: n.created_at, icon: 'lock', title: tx('Сынып кеңесі · {0}', staffName(n.author_id)), body: n.body })),
    ...d.contacts.map((c) => ({ key: 'c' + c.id, when: c.on_date, icon: 'chat', title: tx('Ата-анамен · {0} · {1}', CHANNEL[c.channel], staffName(c.staff_id)), body: c.summary })),
  ].sort((a, b) => b.when.localeCompare(a.when))
  const mbti = test('mbti'), mi = test('mi'), hol = test('holland')
  const ru = lang === 'ru'
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Жеке кездесу')} back />
      <Card className="flex items-center gap-3">
        <Avatar name={s.full_name} photo={s.photo} size={56} />
        <span className="flex-1 min-w-0"><span className="block text-lg font-bold">{s.full_name}</span>
          <span className="block text-sm text-muted">{[s.olympiad, s.club].filter(Boolean).join(' · ') || '—'}</span></span>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr] items-start">
        <div className="grid gap-3">
          <Card className="grid gap-2">
            <p className="font-semibold">{tx('Тест нәтижелері')}</p>
            {!d.tests.length ? <p className="text-sm text-muted">{tx('Оқушы әлі тест тапсырмаған. Сауалнама → «Дайын тесттер» арқылы жіберуге болады.')}</p> : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                {mbti && <><dt className="text-muted">MBTI</dt><dd className="font-bold tracking-wider text-accent">{mbtiScore(mbti.answers).type}</dd></>}
                {mi && <><dt className="text-muted">{tx('Интеллект')}</dt><dd>{miScore(mi.answers).map((v, k) => [k, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${MI_KINDS[k][ru ? 1 : 0]} ${v}%`).join(' · ')}</dd></>}
                {hol && (() => { const h = hollandScore(hol.answers); return <><dt className="text-muted">{tx('Холланд')}</dt><dd><b className="tracking-wider text-accent">{h.code}</b>{' · '}{h.code.split('').map((l) => RIASEC.find((x) => x[0] === l)![ru ? 2 : 1]).join(', ')}</dd></> })()}
              </dl>
            )}
          </Card>

          <Card className="grid gap-3">
            <p className="font-semibold">{tx('Кездесу жоспарлау')}</p>
            <input aria-label={tx('Тақырыбы')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Тақырыбы: олимпиада жоспары, үлгерім…')} />
            <input aria-label={tx('Күні мен уақыты')} type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} className={`${inputCls} min-w-0`} />
            <Chips label={tx('Кім көреді')} value={f.show} onChange={(show) => setF({ ...f, show })} items={[['show', tx('Оқушыға көрсету')], ['staff', tx('Тек ұстаздарға')]]} />
            <p className="text-xs text-muted">{f.show === 'show' ? tx('Оқушыға хабарлама барады, кездесуден 1 сағат бұрын еске салынады.') : tx('Оқушы бұл жазбаны көрмейді.')}</p>
            <Button onClick={add} loading={busy} disabled={!f.when || f.topic.trim().length < 2}>{tx('Белгілеу')}</Button>
          </Card>

          {d.meetings.map((m) => <MeetingCard key={m.id + (m.done_at ?? '')} m={m} staffName={staffName} reload={data.reload} />)}
        </div>

        <Card className="grid gap-3">
          <p className="font-semibold">{tx('Тарих')}</p>
          {!history.length ? <p className="text-sm text-muted">{tx('Сынып кеңесінде @{0} деп белгіленген жазбалар мен ата-анамен сөйлесулер осында жиналады.', s.full_name.split(' ').slice(0, 2).join(' '))}</p>
            : <ol className="grid gap-3">{history.map((h) => (
              <li key={h.key} className="flex gap-3">
                <span className="size-8 shrink-0 rounded-sm bg-surface-2 text-muted grid place-items-center"><Icon n={h.icon} size={16} /></span>
                <span className="min-w-0 text-sm"><span className="block text-xs text-muted">{h.title} · {h.when.length > 10 ? chatTime(h.when) : fmtDate(h.when)}</span>
                  <span className="block whitespace-pre-line break-words">{h.body}</span></span>
              </li>
            ))}</ol>}
        </Card>
      </div>
    </div>
  )
}

function MeetingCard({ m, staffName, reload }: { m: MentorMeeting; staffName: (id: string | null) => string; reload: () => void }) {
  const [actions, setActions] = useState(m.actions ?? '')
  const [notes, setNotes] = useState(m.notes ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await finishMentorMeeting(m.id, actions.trim(), notes.trim()); setOpen(false); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Card className="grid gap-2">
      <div className="flex items-start gap-2">
        <span className="flex-1 min-w-0"><span className="block font-semibold break-words">{m.topic}</span>
          <span className="block text-xs text-muted">{at(m.starts_at)} · {staffName(m.staff_id)}</span></span>
        {m.visible ? <Badge tone="accent">{tx('Оқушыға көрінеді')}</Badge> : <Badge tone="muted">{tx('Тек ұстаздарға')}</Badge>}
      </div>
      {m.done_at && !open && <>
        {m.actions && <div className="rounded-md bg-accent-soft p-3"><p className="text-xs font-semibold text-accent">{tx('Оқушыға міндеттер')}</p><p className="text-sm whitespace-pre-line">{m.actions}</p></div>}
        {m.notes && <div className="rounded-md bg-surface-2 p-3"><p className="text-xs font-semibold text-muted flex items-center gap-1"><Icon n="lock" size={12} />{tx('Жабық жазба')}</p><p className="text-sm whitespace-pre-line">{m.notes}</p></div>}
      </>}
      {open ? (
        <div className="grid gap-2">
          <Field label={tx('Оқушыға міндеттер')} hint={m.visible ? tx('Оқушы көреді.') : tx('Кездесу жабық: оқушы мұны да көрмейді.')}>{(fid, dsc) => (
            <textarea id={fid} aria-describedby={dsc} value={actions} onChange={(e) => setActions(e.target.value)} maxLength={3000} className={`${inputCls} h-20 py-2`} placeholder={tx('Мысалы: күніне 20 бет оқу, жұмаға дейін эссе')} />
          )}</Field>
          <Field label={tx('Жабық жазба')} hint={tx('Тек ұстаздар көреді.')}>{(fid, dsc) => (
            <textarea id={fid} aria-describedby={dsc} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className={`${inputCls} h-20 py-2`} />
          )}</Field>
          <div className="grid grid-cols-2 gap-2"><Button kind="ghost" onClick={() => setOpen(false)}>{tx('Болдырмау')}</Button><Button onClick={save} loading={busy}>{tx('Сақтау')}</Button></div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button kind="secondary" onClick={() => setOpen(true)}>{m.done_at ? tx('Өзгерту') : tx('Қорытынды жазу')}</Button>
          <span className="flex-1" />
          <button type="button" aria-label={tx('Өшіру')} onClick={() => removeMentorMeeting(m.id).then(reload, (e) => toast(errText(e)))} className="size-11 grid place-items-center rounded-md hover:bg-surface-2 text-muted"><Icon n="x" size={18} /></button>
        </div>
      )}
    </Card>
  )
}
