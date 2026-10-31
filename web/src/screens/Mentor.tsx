import { useState } from 'react'
import {
  addMentorMeeting, classMentorMeetings, classStudents, errText, finishMentorMeeting, listClasses, listStaff, mentorAssign, mentorEvery, mentorItems, myMentorMeetings,
  removeMentorMeeting, saveMyForm, setMentorEvery, studentForm, studentMentor, type MentorItem, type MentorMeeting,
} from '../lib/api'
import { mbtiScore } from '../lib/mbti'
import { MI_KINDS, miScore } from '../lib/mi'
import { RIASEC, hollandScore } from '../lib/holland'
import { FORM, TEMPLATES, mentorStatus } from '../lib/mentor'
import { chatTime, fmtDate, today } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'

/* «Жеке кездесулер» — one-on-ones of the class teacher or tutor with a student: plan, outcome as tasks and habits in the
   student's Plan, the student's own questionnaire, how often each student is met. */

const at = (s: string) => new Date(s).toLocaleString(lang === 'kk' ? 'kk-KZ' : lang, { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' })
const CHANNEL: Record<string, string> = { phone: tx('Телефон'), meeting: tx('Кездесу'), chat: tx('Чат'), visit: tx('Үйіне бару') }
const EVERY: [string, string][] = [['14', tx('2 апта')], ['30', tx('1 ай')], ['60', tx('2 ай')]]

export default function Mentor({ studentId, classId }: { studentId?: string; classId?: string }) {
  const { me } = useMe()
  if (me.role === 'student') return <MyMeetings />
  return studentId ? <StudentPage id={studentId} /> : <ClassList classId={classId} />
}

/* ---------- the student's side ---------- */

function MyMeetings() {
  const { me } = useMe()
  const data = useLoad(() => Promise.all([myMentorMeetings(), mentorItems(me.id), studentForm(me.id)]), [me.id])
  const [editing, setEditing] = useState(false)
  if (data.loading && !data.data) return <><PageHead title={tx('Жеке кездесулерім')} back /><Skeleton /></>
  if (data.error || !data.data) return <><PageHead title={tx('Жеке кездесулерім')} back /><ErrorBox text={data.error ?? ''} retry={data.reload} /></>
  const [meetings, items, form] = data.data
  const open = items.filter((i) => i.kind === 'habit' || !i.done)
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Жеке кездесулерім')} back />
      {!form || editing ? <FormCard initial={form?.answers ?? {}} onSaved={() => { setEditing(false); data.reload() }} />
        : <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-3 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-4 min-h-14 text-left">
          <span className="size-9 rounded-md bg-success-soft text-success grid place-items-center"><Icon n="check" size={18} /></span>
          <span className="flex-1"><span className="block font-semibold">{tx('Анкетам толтырылған')}</span><span className="block text-xs text-muted">{tx('Өзгерту үшін басыңыз')}</span></span><Icon n="chev" className="text-muted" />
        </button>}
      {open.length > 0 && <Card className="grid gap-2">
        <p className="font-semibold">{tx('Міндеттерім')}</p>
        <Items items={open} />
        <a href="#/plan" className="text-sm font-semibold text-accent">{tx('Жоспарда белгілеу →')}</a>
      </Card>}
      {!meetings.length ? <Empty icon="user" title={tx('Кездесу жоқ')} text={tx('Сынып жетекшісі не тәрбиеші сенімен жеке кездесу белгілесе, осында шығады.')} /> : meetings.map((m) => (
        <Card key={m.id} className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 font-semibold">{m.topic}</span>
            {m.done_at ? <Badge tone="ok">{tx('Өтті')}</Badge> : <Badge tone="accent">{tx('Алда')}</Badge>}
          </div>
          <p className="text-sm text-muted">{at(m.starts_at)}{m.staff_name ? ` · ${m.staff_name}` : ''}</p>
          {m.actions && <p className="text-sm whitespace-pre-line rounded-md bg-accent-soft p-3">{m.actions}</p>}
        </Card>
      ))}
    </div>
  )
}

function FormCard({ initial, onSaved }: { initial: Record<string, string>; onSaved: () => void }) {
  const { me } = useMe()
  const [a, setA] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  return (
    <Card className="grid gap-3">
      <div><p className="font-semibold">{tx('Менің анкетам')}</p><p className="text-xs text-muted">{tx('Жауаптарыңды тек сынып жетекшің мен тәрбиешің көреді. Бұл саған жақсырақ көмектесуге керек.')}</p></div>
      {FORM.map(([k, q, hint]) => (
        <label key={k} className="grid gap-1 text-sm"><span className="font-medium">{q}</span>
          <textarea value={a[k] ?? ''} onChange={(e) => setA({ ...a, [k]: e.target.value })} maxLength={600} rows={2} className={`${inputCls} py-2 h-auto`} placeholder={hint} />
        </label>
      ))}
      <Button loading={busy} disabled={!Object.values(a).some((v) => v.trim())} onClick={async () => {
        setBusy(true)
        try { await saveMyForm(me.id, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))); toast(tx('Сақталды')); onSaved() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
      }}>{tx('Сақтау')}</Button>
    </Card>
  )
}

/** Tasks and habits given at meetings, with how they are going. */
function Items({ items }: { items: MentorItem[] }) {
  return (
    <ul className="grid gap-1.5">{items.map((i) => (
      <li key={i.id} className="flex items-center gap-3 rounded-md bg-surface-2 px-3 min-h-11 text-sm">
        <span className={`size-6 shrink-0 rounded-full grid place-items-center ${i.kind === 'habit' ? 'bg-accent-soft text-accent' : i.done ? 'bg-success text-white' : 'border-2 border-line'}`}>
          {i.kind === 'habit' ? <Icon n="clock" size={14} /> : i.done ? <Icon n="check" size={14} /> : null}</span>
        <span className={`flex-1 min-w-0 ${i.done && i.kind === 'task' ? 'line-through text-muted' : ''}`}>{i.title}</span>
        <span className={`text-xs tabular-nums ${i.kind === 'task' && !i.done && i.due_on && i.due_on < today() ? 'text-danger font-semibold' : 'text-muted'}`}>
          {i.kind === 'habit' ? tx('{0}/7 күн', i.last7 ?? 0) : i.due_on ? fmtDate(i.due_on) : ''}</span>
      </li>
    ))}</ul>
  )
}

/* ---------- staff: the class ---------- */

function ClassList({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const data = useLoad(async () => (cls ? Promise.all([classStudents(cls.id), classMentorMeetings(cls.id), mentorEvery(cls.id)]) : null), [cls?.id])
  if (classes.loading && !classes.data) return <><PageHead title={tx('Жеке кездесулер')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Жеке кездесулер')} back /><Empty icon="user" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const [students, meetings, every] = data.data ?? [[], [], 30]
  const rows = students.map((s) => ({ s, st: mentorStatus(meetings.filter((m) => m.student_id === s.id), every) }))
    .sort((a, b) => Number(b.st.due) - Number(a.st.due) || (b.st.days ?? 9999) - (a.st.days ?? 9999))
  const covered = rows.filter((r) => !r.st.due).length
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Жеке кездесулер')} back right={options.length > 1 ? (
        <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/mentor?class=${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>) : undefined} />
      {data.loading && !data.data ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : <>
        <Card className="grid gap-2">
          <div className="flex items-end justify-between gap-3">
            <span><span className="block text-3xl font-bold tabular-nums">{students.length ? Math.round((100 * covered) / students.length) : 0}%</span>
              <span className="block text-sm text-muted">{tx('{0} / {1} оқушымен уақытында кездестіңіз', covered, students.length)}</span></span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-success" style={{ width: `${students.length ? (100 * covered) / students.length : 0}%` }} /></div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{tx('Әр оқушымен:')}</span>
            <Chips label={tx('Кездесу жиілігі')} value={String(every)} onChange={(v) => setMentorEvery(cls.id, Number(v)).then(data.reload, (e) => toast(errText(e)))} items={EVERY} />
          </div>
        </Card>
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-line">{rows.map(({ s, st }) => (
            <li key={s.id}><a href={`#/mentor/${s.id}`} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={s.full_name} photo={s.photo} size={40} />
              <span className="flex-1 min-w-0"><span className="block font-medium truncate">{s.full_name}</span>
                <span className={`block text-xs ${st.due ? 'text-danger font-semibold' : 'text-muted'}`}>
                  {st.next ? tx('Кездесу белгіленген') : st.days == null ? tx('Кездесу болмаған') : tx('{0} күн бұрын', st.days)}</span></span>
              {st.next ? <span className="size-2.5 rounded-full bg-accent" aria-hidden /> : st.due ? <span className="size-2.5 rounded-full bg-danger" aria-hidden /> : null}
              <Icon n="chev" className="text-muted" />
            </a></li>
          ))}</ul>
        </Card>
      </>}
    </div>
  )
}

/* ---------- staff: one student ---------- */

function StudentPage({ id }: { id: string }) {
  const data = useLoad(async () => Promise.all([studentMentor(id), listStaff()]), [id])
  const [plan, setPlan] = useState(false)
  const [finish, setFinish] = useState<MentorMeeting | null>(null)
  if (data.loading && !data.data) return <><PageHead title={tx('Жеке кездесу')} back /><Skeleton /></>
  if (data.error || !data.data) return <><PageHead title={tx('Жеке кездесу')} back /><ErrorBox text={data.error ?? tx('Табылмады')} retry={data.reload} /></>
  const [d, staff] = data.data
  const s = d.student
  const staffName = (sid: string | null) => staff.find((x) => x.id === sid)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const next = d.meetings.filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const past = d.meetings.filter((m) => m.done_at)
  const test = (t: string) => d.tests.find((x) => x.type === t)
  const mbti = test('mbti'), mi = test('mi'), hol = test('holland')
  const ru = lang === 'ru'
  const history = [
    ...d.notes.map((n) => ({ key: 'n' + n.id, when: n.created_at, icon: 'lock', title: tx('Сынып кеңесі · {0}', staffName(n.author_id)), body: n.body })),
    ...d.contacts.map((c) => ({ key: 'c' + c.id, when: c.on_date, icon: 'chat', title: tx('Ата-анамен · {0} · {1}', CHANNEL[c.channel], staffName(c.staff_id)), body: c.summary })),
  ].sort((a, b) => b.when.localeCompare(a.when))
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Жеке кездесу')} back right={<Button onClick={() => setPlan(true)}><Icon n="plus" size={18} />{tx('Кездесу')}</Button>} />
      <Card className="flex items-center gap-3">
        <Avatar name={s.full_name} photo={s.photo} size={56} />
        <span className="flex-1 min-w-0"><span className="block text-lg font-bold">{s.full_name}</span>
          <span className="block text-sm text-muted">{[s.olympiad, s.club].filter(Boolean).join(' · ') || '—'}</span></span>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2 items-start">
        <div className="grid gap-3">
          {next.map((m) => (
            <Card key={m.id} className="grid gap-2 border-accent/40">
              <div className="flex items-start gap-2">
                <span className="size-10 shrink-0 rounded-md bg-accent-soft text-accent grid place-items-center"><Icon n="clock" /></span>
                <span className="flex-1 min-w-0"><span className="block font-semibold break-words">{m.topic}</span><span className="block text-xs text-muted">{at(m.starts_at)} · {m.visible ? tx('Оқушыға көрінеді') : tx('Тек ұстаздарға')}</span></span>
                <button type="button" aria-label={tx('Өшіру')} onClick={() => removeMentorMeeting(m.id).then(data.reload, (e) => toast(errText(e)))} className="size-9 grid place-items-center rounded-md text-muted hover:bg-surface-2"><Icon n="x" size={16} /></button>
              </div>
              <Button onClick={() => setFinish(m)}><Icon n="check" size={18} />{tx('Қорытынды жазу')}</Button>
            </Card>
          ))}

          <Card className="grid gap-2">
            <p className="font-semibold">{tx('Міндеттер')}</p>
            {d.items.length ? <Items items={d.items} /> : <p className="text-sm text-muted">{tx('Кездесу қорытындысында берілген тапсырмалар мен әдеттер осында бақыланады.')}</p>}
          </Card>

          {past.length > 0 && <Card className="grid gap-2">
            <p className="font-semibold">{tx('Өткен кездесулер · {0}', past.length)}</p>
            {past.map((m) => (
              <details key={m.id} className="rounded-md bg-surface-2 px-3 py-2">
                <summary className="cursor-pointer text-sm"><b>{m.topic}</b> · <span className="text-muted">{fmtDate(m.starts_at.slice(0, 10))} · {staffName(m.staff_id)}</span></summary>
                {m.actions && <p className="mt-2 text-sm whitespace-pre-line">{m.actions}</p>}
                {m.notes && <p className="mt-2 text-sm whitespace-pre-line text-muted"><Icon n="lock" size={12} className="inline mr-1" />{m.notes}</p>}
              </details>
            ))}
          </Card>}
        </div>

        <div className="grid gap-3">
          <Card className="grid gap-2">
            <p className="font-semibold">{tx('Оқушы анкетасы')}</p>
            {!d.form ? <p className="text-sm text-muted">{tx('Оқушы әлі толтырмаған. Ол Профиль → Жеке кездесулерім бөлімінен толтырады.')}</p> : (
              <dl className="grid gap-2 text-sm">{FORM.filter(([k]) => d.form!.answers[k]).map(([k, q]) => (
                <div key={k}><dt className="text-xs text-muted">{q}</dt><dd className="whitespace-pre-line">{d.form!.answers[k]}</dd></div>
              ))}</dl>
            )}
            {(mbti || mi || hol) && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm border-t border-line pt-2">
              {mbti && <><dt className="text-muted">MBTI</dt><dd className="font-bold tracking-wider text-accent">{mbtiScore(mbti.answers).type}</dd></>}
              {mi && <><dt className="text-muted">{tx('Интеллект')}</dt><dd>{miScore(mi.answers).map((v, k) => [k, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => MI_KINDS[k][ru ? 1 : 0]).join(', ')}</dd></>}
              {hol && (() => { const h = hollandScore(hol.answers); return <><dt className="text-muted">{tx('Холланд')}</dt><dd><b className="tracking-wider text-accent">{h.code}</b>{' · '}{h.code.split('').map((l) => RIASEC.find((x) => x[0] === l)![ru ? 2 : 1]).join(', ')}</dd></> })()}
            </dl>}
          </Card>
          {history.length > 0 && <Card className="grid gap-3">
            <p className="font-semibold">{tx('Тарих')}</p>
            <ol className="grid gap-3">{history.map((h) => (
              <li key={h.key} className="flex gap-3">
                <span className="size-8 shrink-0 rounded-sm bg-surface-2 text-muted grid place-items-center"><Icon n={h.icon} size={16} /></span>
                <span className="min-w-0 text-sm"><span className="block text-xs text-muted">{h.title} · {h.when.length > 10 ? chatTime(h.when) : fmtDate(h.when)}</span>
                  <span className="block whitespace-pre-line break-words">{h.body}</span></span>
              </li>
            ))}</ol>
          </Card>}
        </div>
      </div>
      {plan && <PlanSheet student={s} onClose={() => setPlan(false)} onDone={() => { setPlan(false); data.reload() }} />}
      {finish && <FinishSheet m={finish} onClose={() => setFinish(null)} onDone={() => { setFinish(null); data.reload() }} />}
    </div>
  )
}

function PlanSheet({ student, onClose, onDone }: { student: { id: string; class_id: string }; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ when: '', topic: '', show: 'show' as 'show' | 'staff' })
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={tx('Кездесу жоспарлау')} onClose={onClose}>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">{TEMPLATES.map((t) => (
          <button key={t.key} type="button" aria-pressed={f.topic === t.topic} onClick={() => setF({ ...f, topic: t.topic })}
            className={`h-9 px-3 rounded-full text-sm font-semibold ${f.topic === t.topic ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{t.topic}</button>
        ))}</div>
        <input aria-label={tx('Тақырыбы')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Тақырыбы — не үлгіні таңдаңыз')} />
        <input aria-label={tx('Күні мен уақыты')} type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} className={`${inputCls} min-w-0`} />
        <Chips label={tx('Кім көреді')} value={f.show} onChange={(show) => setF({ ...f, show })} items={[['show', tx('Оқушыға көрсету')], ['staff', tx('Тек ұстаздарға')]]} />
        <p className="text-xs text-muted">{f.show === 'show' ? tx('Оқушыға хабарлама барады, кездесуден 1 сағат бұрын еске салынады.') : tx('Оқушы бұл жазбаны көрмейді.')}</p>
        <Button loading={busy} disabled={!f.when || f.topic.trim().length < 2} onClick={async () => {
          setBusy(true)
          try { await addMentorMeeting({ class_id: student.class_id, student_id: student.id, starts_at: new Date(f.when).toISOString(), topic: f.topic.trim(), visible: f.show === 'show' }); onDone() }
          catch (e) { toast(errText(e)) } finally { setBusy(false) }
        }}>{tx('Белгілеу')}</Button>
      </div>
    </Sheet>
  )
}

/** After the meeting: the template's questions as a guide, action items that go to the student's Plan, a closed note. */
function FinishSheet({ m, onClose, onDone }: { m: MentorMeeting; onClose: () => void; onDone: () => void }) {
  const tpl = TEMPLATES.find((t) => t.topic === m.topic)
  const [items, setItems] = useState<{ title: string; kind: 'task' | 'habit'; due: string }[]>(() => (tpl?.items ?? []).map(([title, kind]) => ({ title, kind, due: '' })))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const put = (k: number, v: Partial<(typeof items)[number]>) => setItems(items.map((x, j) => (j === k ? { ...x, ...v } : x)))
  const save = async () => {
    setBusy(true)
    try {
      const list = items.filter((i) => i.title.trim().length >= 2)
      for (const i of list) await mentorAssign(m.id, i.kind, i.title.trim(), i.kind === 'task' ? i.due || null : null)
      await finishMentorMeeting(m.id, list.map((i) => `• ${i.title.trim()}`).join('\n'), notes.trim())
      toast(list.length ? tx('Сақталды, міндеттер оқушының жоспарына түсті') : tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet title={m.topic} onClose={onClose}>
      <div className="grid gap-4">
        {tpl && <div className="rounded-md bg-accent-soft p-3 text-sm"><p className="font-semibold text-accent mb-1">{tx('Сұрақтар')}</p>
          <ul className="list-disc pl-5 grid gap-0.5">{tpl.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>}
        <div className="grid gap-2">
          <p className="font-semibold">{tx('Оқушыға міндеттер')}</p>
          <p className="text-xs text-muted">{m.visible ? tx('Тапсырма оқушының Жоспарына, әдет — Әдеттеріне түседі. Орындалғанын осы беттен көресіз.') : tx('Кездесу жабық болса да, міндеттер оқушының жоспарына түседі.')}</p>
          {items.map((i, k) => (
            <div key={k} className="grid gap-2 rounded-md bg-surface-2 p-2">
              <div className="flex gap-2">
                <input aria-label={tx('Міндет')} value={i.title} onChange={(e) => put(k, { title: e.target.value })} maxLength={200} className={`${inputCls} flex-1 min-w-0`} placeholder={tx('Міндет')} />
                <button type="button" aria-label={tx('Өшіру')} onClick={() => setItems(items.filter((_, j) => j !== k))} className="size-11 grid place-items-center rounded-md text-muted"><Icon n="x" size={16} /></button>
              </div>
              <div className="flex gap-2 items-center">
                {(['task', 'habit'] as const).map((kind) => <button key={kind} type="button" aria-pressed={i.kind === kind} onClick={() => put(k, { kind })}
                  className={`h-9 px-3 rounded-full text-sm font-semibold ${i.kind === kind ? 'bg-accent text-on-accent' : 'bg-surface'}`}>{kind === 'task' ? tx('Тапсырма') : tx('Әдет')}</button>)}
                {i.kind === 'task' && <input aria-label={tx('Дедлайн')} type="date" value={i.due} onChange={(e) => put(k, { due: e.target.value })} className={`${inputCls} h-9 flex-1 min-w-0 text-sm`} />}
              </div>
            </div>
          ))}
          <Button kind="secondary" onClick={() => setItems([...items, { title: '', kind: 'task', due: '' }])}><Icon n="plus" size={18} />{tx('Міндет қосу')}</Button>
        </div>
        <label className="grid gap-1 text-sm"><span className="font-semibold flex items-center gap-1"><Icon n="lock" size={14} />{tx('Жабық жазба')}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className={`${inputCls} h-24 py-2`} placeholder={tx('Тек ұстаздар көреді.')} />
        </label>
        <Button loading={busy} onClick={save}>{tx('Кездесуді аяқтау')}</Button>
      </div>
    </Sheet>
  )
}
