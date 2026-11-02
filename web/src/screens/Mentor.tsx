import { useEffect, useState } from 'react'
import {
  addMentorMeeting, classMentorMeetings, classStudents, errText, finishMentorMeeting, listClasses, listStaff,
  loadStudentRoadmap, mentorAssign, mentorEvery, mentorItems, myMentorMeetings, removeMentorMeeting, saveMyForm,
  saveStudentRoadmap, setMentorEvery, studentForm, studentMentor, type MentorItem, type MentorMeeting, type Staff,
} from '../lib/api'
import { mbtiScore } from '../lib/mbti'
import { MI_KINDS, miScore } from '../lib/mi'
import { RIASEC, hollandScore } from '../lib/holland'
import {
  calcGoalProgress, FORM, FREQUENCY_LABELS, getCategoryMeta, mentorStatus, PLAN_CATEGORIES, PLAN_PRESETS,
  PRIORITY_LABELS, TEMPLATES, TIME_OF_DAY_LABELS, type PlanCategory, type PlanPreset, type RoadmapGoal,
  type RoadmapHabit, type RoadmapTask, type StudentRoadmap,
} from '../lib/mentor'
import { addDays, chatTime, fmtDate, today } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import LocationPicker from '../components/LocationPicker'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'

/* «Анкета және жеке даму жоспары» — 1-on-1 mentor meetings, student questionnaire, and rich roadmap (Goals, Habits, Tasks). */

const at = (s: string) => new Date(s).toLocaleString(lang === 'kk' ? 'kk-KZ' : lang, { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' })
const CHANNEL: Record<string, string> = { phone: tx('Телефон'), meeting: tx('Кездесу'), chat: tx('Чат'), visit: tx('Үйіне бару') }
const EVERY: [string, string][] = [['14', tx('2 апта')], ['30', tx('1 ай')], ['60', tx('2 ай')]]

export default function Mentor({ studentId, classId }: { studentId?: string; classId?: string }) {
  const { me } = useMe()
  if (me.role === 'student') return <MyMeetings />
  return studentId ? <StudentPage id={studentId} /> : <ClassList classId={classId} />
}

/* ==========================================================================
   Оқушының жеке парақшасы (Менің анкетам және даму жоспарым)
   ========================================================================== */

function MyMeetings() {
  const { me } = useMe()
  const data = useLoad(() => Promise.all([myMentorMeetings(), mentorItems(me.id), studentForm(me.id), loadStudentRoadmap(me.id)]), [me.id])
  if (data.loading && !data.data) return <><PageHead title={tx('Менің анкетам')} back /><Skeleton /></>
  if (data.error || !data.data) return <><PageHead title={tx('Менің анкетам')} back /><ErrorBox text={data.error ?? ''} retry={data.reload} /></>
  const [meetings, items, form, roadmap] = data.data
  return <MyMeetingsLoaded meetings={meetings} items={items} form={form} initialRoadmap={roadmap} reload={data.reload} />
}

function MyMeetingsLoaded({
  meetings,
  items,
  form,
  initialRoadmap,
  reload,
}: {
  meetings: Awaited<ReturnType<typeof myMentorMeetings>>
  items: MentorItem[]
  form: { answers: Record<string, string>; updated_at: string } | null
  initialRoadmap: StudentRoadmap
  reload: () => void
}) {
  const { me } = useMe()
  const [editing, setEditing] = useState(false)
  const [roadmap, setRoadmap] = useState<StudentRoadmap>(initialRoadmap)
  const [addPlan, setAddPlan] = useState(false)

  const openLegacy = items.filter((i) => i.kind === 'habit' || !i.done)

  return (
    <div className="grid gap-3 pb-6">
      <PageHead
        title={tx('Менің анкетам')}
        back
        right={
          <Button onClick={() => setAddPlan(true)}>
            <Icon n="plus" size={18} />
            {tx('Жоспар құру')}
          </Button>
        }
      />

      {!form || editing ? (
        <FormCard initial={form?.answers ?? {}} onSaved={() => { setEditing(false); reload() }} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-3 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-4 min-h-14 text-left"
        >
          <span className="size-9 rounded-md bg-success-soft text-success grid place-items-center"><Icon n="check" size={18} /></span>
          <span className="flex-1">
            <span className="block font-semibold">{tx('Анкетам толтырылған')}</span>
            <span className="block text-xs text-muted">{tx('Өзгерту үшін басыңыз')}</span>
          </span>
          <Icon n="chev" className="text-muted" />
        </button>
      )}

      {/* Оқушының бай Даму жоспары (Мақсаттар, Әдеттер, Тапсырмалар) */}
      <RoadmapSection
        studentId={me.id}
        roadmap={roadmap}
        onUpdate={setRoadmap}
        onOpenAdd={() => setAddPlan(true)}
      />

      {openLegacy.length > 0 && (
        <Card className="grid gap-2">
          <p className="font-semibold">{tx('Кездесуде берілген тапсырмалар')}</p>
          <Items items={openLegacy} />
          <a href="#/plan" className="text-sm font-semibold text-accent">{tx('Жоспарда белгілеу →')}</a>
        </Card>
      )}

      {!meetings.length ? (
        <Empty icon="user" title={tx('Кездесу жоқ')} text={tx('Сынып жетекшісі не тәрбиеші сенімен жеке кездесу белгілесе, осында шығады.')} />
      ) : (
        meetings.map((m) => (
          <Card key={m.id} className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{m.topic}</span>
              {m.done_at ? <Badge tone="ok">{tx('Өтті')}</Badge> : <Badge tone="accent">{tx('Алда')}</Badge>}
            </div>
            <p className="text-sm text-muted">{at(m.starts_at)}{m.staff_name ? ` · ${m.staff_name}` : ''}{m.place ? ` · ${m.place}` : ''}</p>
            {m.actions && <p className="text-sm whitespace-pre-line rounded-md bg-accent-soft p-3">{m.actions}</p>}
          </Card>
        ))
      )}

      {addPlan && (
        <RoadmapBuilderSheet
          student={{ id: me.id, class_id: me.class?.id ?? '', full_name: me.full_name }}
          currentRoadmap={roadmap}
          meetings={[]}
          onClose={() => setAddPlan(false)}
          onDone={(newR) => {
            setRoadmap(newR)
            setAddPlan(false)
            reload()
          }}
        />
      )}
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

/* ==========================================================================
   Мұғалімдер үшін: Сынып тізімі
   ========================================================================== */

function ClassList({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const data = useLoad(async () => (cls ? Promise.all([classStudents(cls.id), classMentorMeetings(cls.id), mentorEvery(cls.id)]) : null), [cls?.id])
  if (classes.loading && !classes.data) return <><PageHead title={tx('Оқушылар анкетасы')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Оқушылар анкетасы')} back /><Empty icon="user" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const [students, meetings, every] = data.data ?? [[], [], 30]
  const rows = students.map((s) => ({ s, st: mentorStatus(meetings.filter((m) => m.student_id === s.id), every) }))
    .sort((a, b) => Number(b.st.due) - Number(a.st.due) || (b.st.days ?? 9999) - (a.st.days ?? 9999))
  const covered = rows.filter((r) => !r.st.due).length
  return (
    <div className="grid gap-3 pb-6">
      <PageHead
        title={tx('Оқушылар анкетасы')}
        back
        right={
          <div className="flex items-center gap-2">
            {options.length > 1 && (
              <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/mentor?class=${e.target.value}`)} className={`${inputCls} w-auto font-medium`}>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Button kind="secondary" onClick={() => go(`/journal/${cls.id}?tab=mentor`)}>
              <Icon n="calendar" size={16} />
              {tx('Күнтізбе')}
            </Button>
          </div>
        }
      />
      {data.loading && !data.data ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : <>
        <Card className="grid gap-2">
          <div className="flex items-end justify-between gap-3">
            <span>
              <span className="block text-3xl font-bold tabular-nums">
                {students.length ? Math.round((100 * covered) / students.length) : 0}%
              </span>
              <span className="block text-sm text-muted">
                {tx('{0} / {1} оқушымен жұмыс жүргізілді', covered, students.length)}
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${students.length ? (100 * covered) / students.length : 0}%` }} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{tx('Әр оқушымен:')}</span>
            <Chips label={tx('Кездесу жиілігі')} value={String(every)} onChange={(v) => setMentorEvery(cls.id, Number(v)).then(data.reload, (e) => toast(errText(e)))} items={EVERY} />
          </div>
        </Card>
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-line">{rows.map(({ s, st }) => (
            <li key={s.id}><a href={`#/mentor/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition">
              <Avatar name={s.full_name} photo={s.photo} size={40} />
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{s.full_name}</span>
                <span className={`block text-xs ${st.due ? 'text-danger font-semibold' : 'text-muted'}`}>
                  {st.next ? tx('Кездесу белгіленген') : st.days == null ? tx('Кездесу болмаған') : tx('{0} күн бұрын', st.days)}
                </span>
              </span>
              {st.next ? <span className="size-2.5 rounded-full bg-accent" aria-hidden /> : st.due ? <span className="size-2.5 rounded-full bg-danger" aria-hidden /> : null}
              <Icon n="chev" className="text-muted" />
            </a></li>
          ))}</ul>
        </Card>
      </>}
    </div>
  )
}

/* ==========================================================================
   Мұғалімдер үшін: Оқушының жеке парақшасы
   ========================================================================== */

function StudentPage({ id }: { id: string }) {
  const data = useLoad(async () => Promise.all([studentMentor(id), listStaff()]), [id])
  if (data.loading && !data.data) return <><PageHead title={tx('Оқушы анкетасы')} back /><Skeleton /></>
  if (data.error || !data.data) return <><PageHead title={tx('Оқушы анкетасы')} back /><ErrorBox text={data.error ?? tx('Табылмады')} retry={data.reload} /></>
  const [d, staff] = data.data
  return <StudentLoaded key={d.student.id} d={d} staff={staff} reload={data.reload} />
}

function StudentLoaded({
  d,
  staff,
  reload,
}: {
  d: Awaited<ReturnType<typeof studentMentor>>
  staff: Staff[]
  reload: () => void
}) {
  const s = d.student
  const [roadmap, setRoadmap] = useState<StudentRoadmap>(d.roadmap ?? { goals: [], habits: [], tasks: [] })
  const [plan, setPlan] = useState(false)
  const [finish, setFinish] = useState<MentorMeeting | null>(null)
  const [editForm, setEditForm] = useState(false)
  const [addPlan, setAddPlan] = useState(false)

  useEffect(() => {
    if (d.roadmap) setRoadmap(d.roadmap)
  }, [d.roadmap])

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
      <PageHead
        title={tx('Оқушы анкетасы')}
        back
        right={
          <div className="flex items-center gap-2">
            <Button onClick={() => setAddPlan(true)}>
              <Icon n="plus" size={18} />
              {tx('Жоспар құру')}
            </Button>
            <Button kind="secondary" onClick={() => go(`/journal/${s.class_id}?tab=mentor&add=mentor&student=${s.id}`)}>
              <Icon n="calendar" size={18} />
              {tx('Кездесу қою')}
            </Button>
          </div>
        }
      />

      <Card className="flex items-center gap-3">
        <Avatar name={s.full_name} photo={s.photo} size={56} />
        <span className="flex-1 min-w-0">
          <span className="block text-lg font-bold">{s.full_name}</span>
          <span className="block text-sm text-muted">{[s.olympiad, s.club].filter(Boolean).join(' · ') || '—'}</span>
        </span>
      </Card>

      {/* Негізгі бөлім: Жоспар (Мақсаттар, Әдеттер, Тапсырмалар) және Кездесулер */}
      <div className="grid gap-3 lg:grid-cols-2 items-start">
        {/* Сол жақ: Даму Жоспары және Кездесулер */}
        <div className="grid gap-3">
          <RoadmapSection
            studentId={s.id}
            roadmap={roadmap}
            onUpdate={setRoadmap}
            onOpenAdd={() => setAddPlan(true)}
          />

          {next.map((m) => (
            <Card key={m.id} className="grid gap-2 border-accent/40">
              <div className="flex items-start gap-2">
                <span className="size-10 shrink-0 rounded-md bg-accent-soft text-accent grid place-items-center">
                  <Icon n="clock" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold break-words">{m.topic}</span>
                  <span className="block text-xs text-muted">
                    {at(m.starts_at)} · {m.visible ? tx('Оқушыға көрінеді') : tx('Тек ұстаздарға')}
                    {m.place ? ` · ${m.place}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={tx('Өшіру')}
                  onClick={() => removeMentorMeeting(m.id).then(reload, (e) => toast(errText(e)))}
                  className="size-9 grid place-items-center rounded-md text-muted hover:bg-surface-2"
                >
                  <Icon n="x" size={16} />
                </button>
              </div>
              <Button onClick={() => setFinish(m)}>
                <Icon n="check" size={18} />
                {tx('Қорытынды жазу')}
              </Button>
            </Card>
          ))}

          <Card className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{tx('Кездесу уақыттары')}</p>
              <button
                type="button"
                onClick={() => go(`/journal/${s.class_id}?tab=mentor&add=mentor&student=${s.id}`)}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
              >
                <Icon n="calendar" size={14} />
                {tx('Күнтізбеде қою →')}
              </button>
            </div>
            {!next.length && !past.length ? (
              <p className="text-sm text-muted">
                {tx('Жоспарланған кездесу жоқ. «Кездесу қою» батырмасы арқылы күнтізбеге оқиға ретінде белгілеңіз.')}
              </p>
            ) : null}
            {past.length > 0 && (
              <div className="grid gap-1.5 mt-1">
                <p className="text-xs text-muted font-semibold uppercase">{tx('Өткен кездесулер · {0}', past.length)}</p>
                {past.map((m) => (
                  <details key={m.id} className="rounded-md bg-surface-2 px-3 py-2">
                    <summary className="cursor-pointer text-sm">
                      <b>{m.topic}</b> ·{' '}
                      <span className="text-muted">
                        {fmtDate(m.starts_at.slice(0, 10))} · {staffName(m.staff_id)}
                        {m.place ? ` · ${m.place}` : ''}
                      </span>
                    </summary>
                    {m.actions && <p className="mt-2 text-sm whitespace-pre-line">{m.actions}</p>}
                    {m.notes && (
                      <p className="mt-2 text-sm whitespace-pre-line text-muted">
                        <Icon n="lock" size={12} className="inline mr-1" />
                        {m.notes}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Оң жақ: Анкета, Тесттер және Тарих */}
        <div className="grid gap-3">
          <Card className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{tx('Оқушы анкетасы')}</p>
              <Button kind="ghost" onClick={() => setEditForm(true)}>
                <Icon n="file" size={15} />
                {d.form ? tx('Өңдеу') : tx('Толтыру')}
              </Button>
            </div>
            {!d.form ? (
              <p className="text-sm text-muted">
                {tx('Оқушы әлі толтырмаған. «Толтыру» батырмасы арқылы ақпаратты бірге жазуға болады.')}
              </p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {FORM.filter(([k]) => d.form!.answers[k]).map(([k, q]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{q}</dt>
                    <dd className="whitespace-pre-line font-medium">{d.form!.answers[k]}</dd>
                  </div>
                ))}
              </dl>
            )}
            {(mbti || mi || hol) && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm border-t border-line pt-2">
                {mbti && (
                  <>
                    <dt className="text-muted">MBTI</dt>
                    <dd className="font-bold tracking-wider text-accent">{mbtiScore(mbti.answers).type}</dd>
                  </>
                )}
                {mi && (
                  <>
                    <dt className="text-muted">{tx('Интеллект')}</dt>
                    <dd>
                      {miScore(mi.answers)
                        .map((v, k) => [k, v])
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([k]) => MI_KINDS[k][ru ? 1 : 0])
                        .join(', ')}
                    </dd>
                  </>
                )}
                {hol &&
                  (() => {
                    const h = hollandScore(hol.answers)
                    return (
                      <>
                        <dt className="text-muted">{tx('Холланд')}</dt>
                        <dd>
                          <b className="tracking-wider text-accent">{h.code}</b>
                          {' · '}
                          {h.code
                            .split('')
                            .map((l) => RIASEC.find((x) => x[0] === l)![ru ? 2 : 1])
                            .join(', ')}
                        </dd>
                      </>
                    )
                  })()}
              </dl>
            )}
          </Card>

          {history.length > 0 && (
            <Card className="grid gap-3">
              <p className="font-semibold">{tx('Тарих')}</p>
              <ol className="grid gap-3">
                {history.map((h) => (
                  <li key={h.key} className="flex gap-3">
                    <span className="size-8 shrink-0 rounded-sm bg-surface-2 text-muted grid place-items-center">
                      <Icon n={h.icon} size={16} />
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="block text-xs text-muted">
                        {h.title} · {h.when.length > 10 ? chatTime(h.when) : fmtDate(h.when)}
                      </span>
                      <span className="block whitespace-pre-line break-words">{h.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>

      {editForm && (
        <StudentFormEditSheet
          student={s}
          initial={d.form?.answers ?? {}}
          onClose={() => setEditForm(false)}
          onSaved={() => {
            setEditForm(false)
            reload()
          }}
        />
      )}

      {addPlan && (
        <RoadmapBuilderSheet
          student={s}
          currentRoadmap={roadmap}
          meetings={d.meetings}
          onClose={() => setAddPlan(false)}
          onDone={(newR) => {
            setRoadmap(newR)
            setAddPlan(false)
            reload()
          }}
        />
      )}

      {plan && <PlanSheet student={s} onClose={() => setPlan(false)} onDone={() => { setPlan(false); reload() }} />}
      {finish && <FinishSheet m={finish} onClose={() => setFinish(null)} onDone={() => { setFinish(null); reload() }} />}
    </div>
  )
}

/* ==========================================================================
   Күрделендірілген Даму Жоспары бөлімі (RoadmapSection)
   ========================================================================== */

function RoadmapSection({
  studentId,
  roadmap,
  onUpdate,
  onOpenAdd,
}: {
  studentId: string
  roadmap: StudentRoadmap
  onUpdate: (r: StudentRoadmap) => void
  onOpenAdd?: () => void
}) {
  const [tab, setTab] = useState<'all' | 'goals' | 'habits' | 'tasks'>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [newStepInputs, setNewStepInputs] = useState<Record<string, string>>({})
  const t = today()

  const goals = roadmap.goals ?? []
  const habits = roadmap.habits ?? []
  const tasks = roadmap.tasks ?? []

  const update = (fn: (prev: StudentRoadmap) => StudentRoadmap) => {
    const next = fn({
      goals: [...goals],
      habits: [...habits],
      tasks: [...tasks],
    })
    onUpdate(next)
    saveStudentRoadmap(studentId, next).catch((e) => toast(errText(e)))
  }

  const toggleGoal = (id: string) => {
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
    }))
  }

  const toggleStep = (goalId: string, stepId: string) => {
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => {
        if (g.id !== goalId) return g
        const nextSteps = g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))
        const allDone = nextSteps.length > 0 && nextSteps.every((s) => s.done)
        return { ...g, steps: nextSteps, done: allDone ? true : g.done }
      }),
    }))
  }

  const addStep = (goalId: string) => {
    const text = (newStepInputs[goalId] ?? '').trim()
    if (text.length < 2) return
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) =>
        g.id === goalId
          ? { ...g, steps: [...g.steps, { id: 's_' + Date.now(), title: text, done: false }] }
          : g
      ),
    }))
    setNewStepInputs({ ...newStepInputs, [goalId]: '' })
  }

  const removeGoal = (id: string, title: string) => {
    if (!confirm(tx('«{0}» мақсатын өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
    }))
  }

  const toggleHabit = (id: string) => {
    update((prev) => ({
      ...prev,
      habits: prev.habits.map((h) => {
        if (h.id !== id) return h
        const checks = new Set(h.checks ?? [])
        if (checks.has(t)) checks.delete(t)
        else checks.add(t)
        return { ...h, checks: Array.from(checks) }
      }),
    }))
  }

  const removeHabit = (id: string, title: string) => {
    if (!confirm(tx('«{0}» әдетін өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
    }))
  }

  const toggleTask = (id: string) => {
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.map((tk) => (tk.id === id ? { ...tk, done: !tk.done } : tk)),
    }))
  }

  const removeTask = (id: string, title: string) => {
    if (!confirm(tx('«{0}» тапсырмасын өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((tk) => tk.id !== id),
    }))
  }

  const filterCat = (itemCat: string) => catFilter === 'all' || itemCat === catFilter

  const filteredGoals = goals.filter((g) => filterCat(g.category))
  const filteredHabits = habits.filter((h) => filterCat(h.category))
  const filteredTasks = tasks.filter((tk) => filterCat(tk.category))

  const totalVisible =
    (tab === 'all' || tab === 'goals' ? filteredGoals.length : 0) +
    (tab === 'all' || tab === 'habits' ? filteredHabits.length : 0) +
    (tab === 'all' || tab === 'tasks' ? filteredTasks.length : 0)

  // Last 7 days for habit tracker
  const last7Days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))

  return (
    <Card className="grid gap-3 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-base flex items-center gap-2">
            <span className="size-2 rounded-full bg-accent" aria-hidden />
            {tx('Жеке даму жоспары')}
          </h2>
          <p className="text-xs text-muted">
            {tx('Мақсаттар, күнделікті әдеттер және нақты тапсырмалар')}
          </p>
        </div>
        {onOpenAdd && (
          <Button kind="secondary" onClick={onOpenAdd}>
            <Icon n="plus" size={16} />
            {tx('Жоспар құру')}
          </Button>
        )}
      </div>

      {/* KPI көрсеткіштері */}
      <div className="grid grid-cols-3 gap-2 py-1">
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Мақсаттар')}</span>
          <span className="text-lg font-bold tabular-nums text-accent">
            {goals.filter((g) => g.done).length} / {goals.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Әдеттер')}</span>
          <span className="text-lg font-bold tabular-nums text-success">
            {habits.filter((h) => (h.checks ?? []).includes(t)).length} / {habits.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Тапсырмалар')}</span>
          <span className="text-lg font-bold tabular-nums text-purple-600 dark:text-purple-400">
            {tasks.filter((tk) => !tk.done).length} {tx('ашық')}
          </span>
        </div>
      </div>

      {/* Түрлері бойынша сүзгі */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'all' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          {tx('Барлығы ({0})', goals.length + habits.length + tasks.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('goals')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'goals' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          🎯 {tx('Мақсаттар ({0})', goals.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('habits')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'habits' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          🔄 {tx('Әдеттер ({0})', habits.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('tasks')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'tasks' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          ✅ {tx('Тапсырмалар ({0})', tasks.length)}
        </button>
      </div>

      {/* Санаттар чиптері */}
      <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setCatFilter('all')}
          className={`px-2.5 py-1 rounded-md transition ${catFilter === 'all' ? 'bg-accent/20 text-accent font-semibold' : 'text-muted hover:bg-surface-2'}`}
        >
          {tx('Барлық санат')}
        </button>
        {PLAN_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatFilter(c.id)}
            className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${catFilter === c.id ? `${c.bg} ${c.color} font-semibold` : 'text-muted hover:bg-surface-2'}`}
          >
            <Icon n={c.icon} size={12} />
            {c.label}
          </button>
        ))}
      </div>

      {totalVisible === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-center grid gap-2">
          <p className="text-sm text-muted">
            {tx('Бұл санатта немесе сүзгіде жазбалар жоқ.')}
          </p>
          {onOpenAdd && (
            <div>
              <Button kind="secondary" onClick={onOpenAdd}>
                <Icon n="plus" size={16} />
                {tx('+ Жоспар құру')}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* 1. Мақсаттар (Goals) */}
      {(tab === 'all' || tab === 'goals') && filteredGoals.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">🎯 {tx('Мақсаттар мен қадамдар')}</p>
          {filteredGoals.map((g) => {
            const cat = getCategoryMeta(g.category)
            const prog = calcGoalProgress(g, tasks)
            const prio = PRIORITY_LABELS[g.priority ?? 'normal']
            const linkedH = habits.filter((h) => h.goal_id === g.id)
            const linkedT = tasks.filter((tk) => tk.goal_id === g.id)

            return (
              <div
                key={g.id}
                className={`rounded-lg border bg-surface p-3.5 grid gap-2.5 shadow-sm transition ${cat.border} ${g.done ? 'opacity-70 bg-surface-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                      <Icon n={cat.icon} size={12} />
                      {cat.label}
                    </span>
                    {g.priority && g.priority !== 'normal' && (
                      <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${prio.badge}`}>
                        {prio.label}
                      </span>
                    )}
                    {g.due_on && (
                      <span className="text-muted text-[11px] flex items-center gap-1">
                        <Icon n="calendar" size={11} />
                        {fmtDate(g.due_on)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGoal(g.id, g.title)}
                    className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={tx('Өшіру')}
                  >
                    <Icon n="x" size={14} />
                  </button>
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={g.done}
                    onChange={() => toggleGoal(g.id)}
                    aria-label={tx('{0} орындалды', g.title)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm leading-snug break-words ${g.done ? 'line-through text-muted' : ''}`}>
                      {g.title}
                    </p>
                    {g.metric && (
                      <p className="text-xs text-accent mt-1 flex items-center gap-1 font-medium">
                        🎯 {tx('Нәтиже:')} {g.metric}
                      </p>
                    )}
                  </div>
                </div>

                {/* Прогресс сызығы */}
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-xs text-muted tabular-nums">
                    <span>{tx('Прогресс')}</span>
                    <span className="font-semibold text-foreground">{prog}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${prog === 100 ? 'bg-success' : 'bg-accent'}`}
                      style={{ width: `${prog}%` }}
                    />
                  </div>
                </div>

                {/* Қадамдар тізімі (Milestones checklist) */}
                {g.steps.length > 0 && (
                  <div className="rounded-md bg-surface-2/60 p-2.5 grid gap-1.5 text-xs">
                    <p className="font-semibold text-muted text-[11px] uppercase tracking-wider">{tx('Қадамдары')}:</p>
                    {g.steps.map((st) => (
                      <label key={st.id} className="flex items-center gap-2 cursor-pointer hover:bg-surface-2 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={st.done}
                          onChange={() => toggleStep(g.id, st.id)}
                          className="size-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className={`flex-1 break-words ${st.done ? 'line-through text-muted' : ''}`}>
                          {st.title}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Қадам қосу inline */}
                <div className="flex gap-1.5 pt-0.5">
                  <input
                    value={newStepInputs[g.id] ?? ''}
                    onChange={(e) => setNewStepInputs({ ...newStepInputs, [g.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addStep(g.id)
                      }
                    }}
                    placeholder={tx('+ Қадам қосу...')}
                    className={`${inputCls} h-8 text-xs py-1 flex-1 min-w-0`}
                  />
                  <Button kind="secondary" onClick={() => addStep(g.id)}>
                    {tx('Қосу')}
                  </Button>
                </div>

                {/* Байланысты әдеттер мен тапсырмалар */}
                {(linkedH.length > 0 || linkedT.length > 0) && (
                  <div className="flex gap-1 flex-wrap pt-1 border-t border-line/50 text-[11px]">
                    {linkedH.map((lh) => (
                      <span key={lh.id} className="px-2 py-0.5 rounded bg-surface-2 text-muted flex items-center gap-1">
                        🔄 {lh.title}
                      </span>
                    ))}
                    {linkedT.map((lt) => (
                      <span key={lt.id} className="px-2 py-0.5 rounded bg-surface-2 text-muted flex items-center gap-1">
                        ✅ {lt.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 2. Әдеттер (Habits) */}
      {(tab === 'all' || tab === 'habits') && filteredHabits.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">🔄 {tx('Күнделікті әдеттер трекері')}</p>
          {filteredHabits.map((h) => {
            const cat = getCategoryMeta(h.category)
            const checks = new Set(h.checks ?? [])
            const isToday = checks.has(t)
            const timeLabel = TIME_OF_DAY_LABELS[h.time_of_day ?? 'any']
            const freqLabel = FREQUENCY_LABELS[h.frequency ?? 'daily']

            return (
              <div
                key={h.id}
                className={`rounded-lg border bg-surface p-3.5 grid gap-2 shadow-sm transition ${cat.border}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                      <Icon n={cat.icon} size={12} />
                      {cat.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium text-[11px]">
                      {timeLabel.icon} {timeLabel.label}
                    </span>
                    <span className="text-muted text-[11px]">
                      {freqLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeHabit(h.id, h.title)}
                    className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={tx('Өшіру')}
                  >
                    <Icon n="x" size={14} />
                  </button>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-sm break-words flex-1">
                    {h.title}
                  </p>
                  {h.target_val && (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-accent-soft text-accent font-bold text-xs">
                      ⚡ {h.target_val}
                    </span>
                  )}
                </div>

                {h.motivation && (
                  <p className="text-xs text-muted italic">
                    «{h.motivation}»
                  </p>
                )}

                {/* 7 күндік визуалды трекер */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40">
                  <div className="flex items-center gap-1">
                    {last7Days.map((d) => {
                      const done = checks.has(d)
                      const isT = d === t
                      return (
                        <span
                          key={d}
                          title={fmtDate(d)}
                          className={`size-5 rounded-full grid place-items-center text-[10px] font-bold ${
                            done
                              ? 'bg-success text-white'
                              : isT
                              ? 'border-2 border-accent text-accent'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {done ? '✓' : ''}
                        </span>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleHabit(h.id)}
                    className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1 transition ${
                      isToday
                        ? 'bg-success text-white'
                        : 'bg-accent-soft text-accent hover:bg-accent hover:text-on-accent'
                    }`}
                  >
                    <Icon n="check" size={14} />
                    {isToday ? tx('Бүгін жасалды') : tx('Бүгін белгілеу')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 3. Тапсырмалар (Tasks) */}
      {(tab === 'all' || tab === 'tasks') && filteredTasks.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">✅ {tx('Нақты тапсырмалар')}</p>
          {filteredTasks.map((tk) => {
            const cat = getCategoryMeta(tk.category)
            const prio = PRIORITY_LABELS[tk.priority ?? 'normal']
            const overdue = tk.due_on && tk.due_on < t && !tk.done
            const linkedG = goals.find((g) => g.id === tk.goal_id)

            return (
              <div
                key={tk.id}
                className={`rounded-lg border bg-surface p-3 grid gap-2 shadow-sm transition ${cat.border} ${tk.done ? 'opacity-70 bg-surface-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                      <Icon n={cat.icon} size={12} />
                      {cat.label}
                    </span>
                    {tk.priority === 'high' && (
                      <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${prio.badge}`}>
                        ⚡ {prio.label}
                      </span>
                    )}
                    {tk.due_on && (
                      <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-danger font-bold' : 'text-muted'}`}>
                        <Icon n="calendar" size={11} />
                        {fmtDate(tk.due_on)}
                        {overdue && ` (${tx('мерзімі өтті!')})`}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTask(tk.id, tk.title)}
                    className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={tx('Өшіру')}
                  >
                    <Icon n="x" size={14} />
                  </button>
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={tk.done}
                    onChange={() => toggleTask(tk.id)}
                    aria-label={tx('{0} орындалды', tk.title)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm break-words ${tk.done ? 'line-through text-muted' : ''}`}>
                      {tk.title}
                    </p>
                    {tk.notes && (
                      <p className="text-xs text-muted whitespace-pre-line mt-1 bg-surface-2 p-2 rounded-md">
                        {tk.notes}
                      </p>
                    )}
                    {linkedG && (
                      <p className="text-[11px] text-accent mt-1 flex items-center gap-1">
                        🎯 {linkedG.title}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ==========================================================================
   Күрделендірілген Жоспар Құру Шебері (RoadmapBuilderSheet)
   ========================================================================== */

function RoadmapBuilderSheet({
  student,
  currentRoadmap,
  meetings,
  onClose,
  onDone,
}: {
  student: { id: string; class_id: string; full_name: string }
  currentRoadmap: StudentRoadmap
  meetings: MentorMeeting[]
  onClose: () => void
  onDone: (r: StudentRoadmap) => void
}) {
  const [tab, setTab] = useState<'presets' | 'goal' | 'habit' | 'task'>('presets')
  const [presetCat, setPresetCat] = useState<string>('all')
  const [selectedPreset, setSelectedPreset] = useState<PlanPreset | null>(null)

  // Custom Goal form state
  const [goalCat, setGoalCat] = useState<PlanCategory>('study')
  const [goalTitle, setGoalTitle] = useState('')
  const [goalMetric, setGoalMetric] = useState('')
  const [goalDue, setGoalDue] = useState('')
  const [goalPriority, setGoalPriority] = useState<'high' | 'medium' | 'normal'>('high')
  const [goalSteps, setGoalSteps] = useState<string[]>([''])
  const [addLinkedHabit, setAddLinkedHabit] = useState(false)
  const [linkedHabitTitle, setLinkedHabitTitle] = useState('')
  const [linkedHabitTarget, setLinkedHabitTarget] = useState('')
  const [addLinkedTask, setAddLinkedTask] = useState(false)
  const [linkedTaskTitle, setLinkedTaskTitle] = useState('')
  const [linkedTaskDue, setLinkedTaskDue] = useState('')

  // Custom Habit form state
  const [habitCat, setHabitCat] = useState<PlanCategory>('discipline')
  const [habitTitle, setHabitTitle] = useState('')
  const [habitTarget, setHabitTarget] = useState('')
  const [habitTime, setHabitTime] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('evening')
  const [habitFreq, setHabitFreq] = useState<'daily' | 'weekdays' | '3x_week'>('daily')
  const [habitMotivation, setHabitMotivation] = useState('')
  const [habitGoalId, setHabitGoalId] = useState<string>('')

  // Custom Task form state
  const [taskCat, setTaskCat] = useState<PlanCategory>('study')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState<'high' | 'normal'>('high')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskGoalId, setTaskGoalId] = useState<string>('')

  const [busy, setBusy] = useState(false)

  // Sync to standard mentorAssign
  const syncMeetingItem = async (kind: 'task' | 'habit', title: string, due: string | null) => {
    try {
      let mId = meetings[0]?.id
      if (!mId) {
        const res = await addMentorMeeting({
          class_id: student.class_id,
          student_id: student.id,
          starts_at: new Date().toISOString(),
          topic: tx('Даму жоспары мен әдеттер'),
          visible: false,
        })
        mId = res.id
      }
      await mentorAssign(mId, kind, title, due)
    } catch {
      // ignore sync errors
    }
  }

  // 1. Preset Apply
  const applyPreset = async (p: PlanPreset) => {
    setBusy(true)
    try {
      const gid = 'g_' + Date.now()
      const newGoal: RoadmapGoal = {
        id: gid,
        title: p.goal.title,
        category: p.category,
        metric: p.goal.metric,
        priority: p.goal.priority,
        due_on: addDays(today(), p.goal.due_days),
        done: false,
        steps: p.goal.steps.map((st, i) => ({ id: `s_${Date.now()}_${i}`, title: st, done: false })),
        created_at: new Date().toISOString(),
      }

      const newHabits: RoadmapHabit[] = p.habits.map((h, i) => ({
        id: `h_${Date.now()}_${i}`,
        title: h.title,
        category: p.category,
        target_val: h.target_val,
        time_of_day: h.time_of_day,
        frequency: h.frequency,
        motivation: h.motivation,
        goal_id: gid,
        archived: false,
        checks: [],
        created_at: new Date().toISOString(),
      }))

      const newTasks: RoadmapTask[] = p.tasks.map((tk, i) => ({
        id: `t_${Date.now()}_${i}`,
        title: tk.title,
        category: p.category,
        due_on: addDays(today(), tk.due_days),
        priority: tk.priority,
        notes: tk.notes,
        goal_id: gid,
        done: false,
        created_at: new Date().toISOString(),
      }))

      const updatedRoadmap: StudentRoadmap = {
        goals: [newGoal, ...(currentRoadmap.goals ?? [])],
        habits: [...newHabits, ...(currentRoadmap.habits ?? [])],
        tasks: [...newTasks, ...(currentRoadmap.tasks ?? [])],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)

      // Sync habits & tasks to standard mentor tables
      for (const h of newHabits) await syncMeetingItem('habit', h.title, null)
      for (const tk of newTasks) await syncMeetingItem('task', tk.title, tk.due_on ?? null)

      toast(tx('Кешенді жоспар оқушыға бекітілді!'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  // 2. Custom Goal Save
  const saveCustomGoal = async () => {
    if (goalTitle.trim().length < 2) return toast(tx('Мақсат атауын жазыңыз'))
    setBusy(true)
    try {
      const gid = 'g_' + Date.now()
      const steps = goalSteps
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((st, i) => ({ id: `s_${Date.now()}_${i}`, title: st, done: false }))

      const newGoal: RoadmapGoal = {
        id: gid,
        title: goalTitle.trim(),
        category: goalCat,
        metric: goalMetric.trim() || undefined,
        due_on: goalDue || null,
        priority: goalPriority,
        done: false,
        steps,
        created_at: new Date().toISOString(),
      }

      const extraHabits: RoadmapHabit[] = []
      if (addLinkedHabit && linkedHabitTitle.trim().length >= 2) {
        extraHabits.push({
          id: 'h_' + Date.now(),
          title: linkedHabitTitle.trim(),
          category: goalCat,
          target_val: linkedHabitTarget.trim() || undefined,
          time_of_day: 'evening',
          frequency: 'daily',
          goal_id: gid,
          archived: false,
          checks: [],
          created_at: new Date().toISOString(),
        })
        await syncMeetingItem('habit', linkedHabitTitle.trim(), null)
      }

      const extraTasks: RoadmapTask[] = []
      if (addLinkedTask && linkedTaskTitle.trim().length >= 2) {
        extraTasks.push({
          id: 't_' + Date.now(),
          title: linkedTaskTitle.trim(),
          category: goalCat,
          due_on: linkedTaskDue || null,
          priority: 'high',
          goal_id: gid,
          done: false,
          created_at: new Date().toISOString(),
        })
        await syncMeetingItem('task', linkedTaskTitle.trim(), linkedTaskDue || null)
      }

      const updatedRoadmap: StudentRoadmap = {
        goals: [newGoal, ...(currentRoadmap.goals ?? [])],
        habits: [...extraHabits, ...(currentRoadmap.habits ?? [])],
        tasks: [...extraTasks, ...(currentRoadmap.tasks ?? [])],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)
      toast(tx('Мақсат сақталды'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  // 3. Custom Habit Save
  const saveCustomHabit = async () => {
    if (habitTitle.trim().length < 2) return toast(tx('Әдет атауын жазыңыз'))
    setBusy(true)
    try {
      const newHabit: RoadmapHabit = {
        id: 'h_' + Date.now(),
        title: habitTitle.trim(),
        category: habitCat,
        target_val: habitTarget.trim() || undefined,
        time_of_day: habitTime,
        frequency: habitFreq,
        motivation: habitMotivation.trim() || undefined,
        goal_id: habitGoalId || null,
        archived: false,
        checks: [],
        created_at: new Date().toISOString(),
      }

      const updatedRoadmap: StudentRoadmap = {
        goals: currentRoadmap.goals ?? [],
        habits: [newHabit, ...(currentRoadmap.habits ?? [])],
        tasks: currentRoadmap.tasks ?? [],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)
      await syncMeetingItem('habit', habitTitle.trim(), null)
      toast(tx('Әдет сақталды'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  // 4. Custom Task Save
  const saveCustomTask = async () => {
    if (taskTitle.trim().length < 2) return toast(tx('Тапсырма атауын жазыңыз'))
    setBusy(true)
    try {
      const newTask: RoadmapTask = {
        id: 't_' + Date.now(),
        title: taskTitle.trim(),
        category: taskCat,
        due_on: taskDue || null,
        priority: taskPriority,
        notes: taskNotes.trim() || null,
        goal_id: taskGoalId || null,
        done: false,
        created_at: new Date().toISOString(),
      }

      const updatedRoadmap: StudentRoadmap = {
        goals: currentRoadmap.goals ?? [],
        habits: currentRoadmap.habits ?? [],
        tasks: [newTask, ...(currentRoadmap.tasks ?? [])],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)
      await syncMeetingItem('task', taskTitle.trim(), taskDue || null)
      toast(tx('Тапсырма сақталды'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const existingGoals = currentRoadmap.goals ?? []

  return (
    <Sheet title={tx('Жеке даму жоспарын құру')} onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-xs text-muted">
          {tx('{0} үшін мақсат қою, күнделікті пайдалы әдеттерді енгізу немесе нақты тапсырмалар беру.', student.full_name)}
        </p>

        {/* Режим таңдау */}
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1 text-xs text-center font-semibold">
          <button
            type="button"
            onClick={() => { setTab('presets'); setSelectedPreset(null) }}
            className={`py-2 px-1 rounded-md transition ${tab === 'presets' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            🌟 {tx('Дайын үлгілер')}
          </button>
          <button
            type="button"
            onClick={() => setTab('goal')}
            className={`py-2 px-1 rounded-md transition ${tab === 'goal' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            🎯 {tx('Мақсат')}
          </button>
          <button
            type="button"
            onClick={() => setTab('habit')}
            className={`py-2 px-1 rounded-md transition ${tab === 'habit' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            🔄 {tx('Әдет')}
          </button>
          <button
            type="button"
            onClick={() => setTab('task')}
            className={`py-2 px-1 rounded-md transition ${tab === 'task' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            ✅ {tx('Тапсырма')}
          </button>
        </div>

        {/* 1. ДАЙЫН ҮЛГІЛЕР БАНКІ */}
        {tab === 'presets' && !selectedPreset && (
          <div className="grid gap-3">
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setPresetCat('all')}
                className={`px-3 py-1 rounded-full transition ${presetCat === 'all' ? 'bg-accent text-on-accent font-semibold' : 'bg-surface-2 text-muted'}`}
              >
                {tx('Барлығы')}
              </button>
              {PLAN_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPresetCat(c.id)}
                  className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${presetCat === c.id ? `${c.bg} ${c.color} font-bold` : 'bg-surface-2 text-muted'}`}
                >
                  <Icon n={c.icon} size={12} />
                  {c.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              {PLAN_PRESETS.filter((p) => presetCat === 'all' || p.category === presetCat).map((p) => {
                const cat = getCategoryMeta(p.category)
                return (
                  <div
                    key={p.key}
                    className={`rounded-lg border p-3.5 grid gap-2.5 bg-surface transition hover:shadow-md ${cat.border}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                          <Icon n={cat.icon} size={12} />
                          {cat.label}
                        </span>
                        <h3 className="font-bold text-sm text-foreground mt-1">{p.title}</h3>
                        <p className="text-xs text-muted">{p.desc}</p>
                      </div>
                    </div>

                    <div className="rounded-md bg-surface-2/70 p-2.5 grid gap-1.5 text-xs">
                      <p className="font-semibold text-foreground">🎯 {p.goal.title}</p>
                      <p className="text-accent text-[11px] font-medium">✨ {tx('Нәтиже:')} {p.goal.metric}</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {p.habits.map((h, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface text-muted text-[11px]">
                            🔄 {h.title} ({h.target_val})
                          </span>
                        ))}
                        {p.tasks.map((tk, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface text-muted text-[11px]">
                            ✅ {tk.title}
                          </span>
                        ))}
                      </div>
                    </div>

                    <Button loading={busy} onClick={() => applyPreset(p)}>
                      {tx('Осы кешенді жоспарды бекіту')}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 2. МАҚСАТ ҚҰРУ (Custom Goal) */}
        {tab === 'goal' && (
          <div className="grid gap-3">
            <Field label={tx('Санаты / Бағыты')}>
              {() => (
                <div className="flex gap-1.5 flex-wrap">
                  {PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setGoalCat(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                        goalCat === c.id ? `${c.bg} ${c.color} ring-2 ring-accent font-bold` : 'bg-surface-2 text-muted'
                      }`}
                    >
                      <Icon n={c.icon} size={13} />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={tx('Мақсат атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder={tx('Мысалы: Алгебрадан БЖБ/ТЖБ нәтижесін 85%-ға жеткізу')}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label={tx('Күтілетін нәтиже / Өлшем')} hint={tx('Міндетті емес, SMART-өлшемі')}>
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  value={goalMetric}
                  onChange={(e) => setGoalMetric(e.target.value)}
                  placeholder={tx('Мысалы: БЖБ кемінде 17 балл, тоқсанда 5 алу')}
                  className={inputCls}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('Мерзімі (дедлайн)')}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={goalDue}
                    min={today()}
                    onChange={(e) => setGoalDue(e.target.value)}
                    className={inputCls}
                  />
                )}
              </Field>
              <Field label={tx('Басымдығы')}>
                {() => (
                  <Chips
                    label={tx('Басымдық')}
                    value={goalPriority}
                    onChange={(v) => setGoalPriority(v as 'high' | 'medium' | 'normal')}
                    items={[
                      ['high', tx('Жоғары')],
                      ['medium', tx('Орташа')],
                      ['normal', tx('Қалыпты')],
                    ]}
                  />
                )}
              </Field>
            </div>

            {/* Қадамдарды қосу */}
            <div className="grid gap-2 border-t border-line pt-3">
              <p className="font-semibold text-xs text-muted uppercase tracking-wider">
                {tx('Мақсатқа жету қадамдары (кезеңдер)')}
              </p>
              {goalSteps.map((st, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={st}
                    onChange={(e) => {
                      const next = [...goalSteps]
                      next[i] = e.target.value
                      setGoalSteps(next)
                    }}
                    placeholder={tx('{0}-қадам...', i + 1)}
                    className={`${inputCls} text-xs flex-1`}
                  />
                  {goalSteps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setGoalSteps(goalSteps.filter((_, idx) => idx !== i))}
                      className="size-10 grid place-items-center text-muted hover:text-danger rounded-md bg-surface-2"
                      aria-label={tx('Өшіру')}
                    >
                      <Icon n="x" size={16} />
                    </button>
                  )}
                </div>
              ))}
              <Button kind="secondary" onClick={() => setGoalSteps([...goalSteps, ''])}>
                <Icon n="plus" size={16} />
                {tx('+ Қадам қосу')}
              </Button>
            </div>

            {/* Осы мақсат үшін әдет те қосу */}
            <div className="grid gap-2 border-t border-line pt-3">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                <input
                  type="checkbox"
                  checked={addLinkedHabit}
                  onChange={(e) => setAddLinkedHabit(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                {tx('Осы мақсат үшін күнделікті әдет те қосу')}
              </label>
              {addLinkedHabit && (
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <input
                    value={linkedHabitTitle}
                    onChange={(e) => setLinkedHabitTitle(e.target.value)}
                    placeholder={tx('Әдет: мысалы күнде 30 мин қайталау')}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                  <input
                    value={linkedHabitTarget}
                    onChange={(e) => setLinkedHabitTarget(e.target.value)}
                    placeholder={tx('Нысана: 30 мин / 20 бет')}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                </div>
              )}
            </div>

            {/* Осы мақсат үшін тапсырма да қосу */}
            <div className="grid gap-2 border-t border-line pt-3">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                <input
                  type="checkbox"
                  checked={addLinkedTask}
                  onChange={(e) => setAddLinkedTask(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                {tx('Осы мақсат үшін нақты тапсырма да қосу')}
              </label>
              {addLinkedTask && (
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <input
                    value={linkedTaskTitle}
                    onChange={(e) => setLinkedTaskTitle(e.target.value)}
                    placeholder={tx('Тапсырма: мысалы Мұғалімнен консультация алу')}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                  <input
                    type="date"
                    value={linkedTaskDue}
                    min={today()}
                    onChange={(e) => setLinkedTaskDue(e.target.value)}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                </div>
              )}
            </div>

            <Button loading={busy} disabled={goalTitle.trim().length < 2} onClick={saveCustomGoal}>
              {tx('Мақсатты сақтау')}
            </Button>
          </div>
        )}

        {/* 3. ӘДЕТ ҚОСУ (Custom Habit) */}
        {tab === 'habit' && (
          <div className="grid gap-3">
            <Field label={tx('Санаты')}>
              {() => (
                <div className="flex gap-1.5 flex-wrap">
                  {PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setHabitCat(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                        habitCat === c.id ? `${c.bg} ${c.color} ring-2 ring-accent font-bold` : 'bg-surface-2 text-muted'
                      }`}
                    >
                      <Icon n={c.icon} size={13} />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={tx('Әдет атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  placeholder={tx('Мысалы: 22:30-да гаджеттерді өшіріп ұйықтау')}
                  className={inputCls}
                />
              )}
            </Field>

            {/* Дайын жылдам ұсыныстар */}
            <div className="flex gap-1 overflow-x-auto text-[11px] pb-1">
              {[
                tx('Күн сайын 20 бет кітап оқу'),
                tx('22:30-да ұйықтау'),
                tx('Күніне 3 олимпиадалық есеп'),
                tx('15 жаңа ағылшын сөзі'),
                tx('Таңғы 15 мин бой жазу'),
                tx('Күніне 1.5 литр су ішу'),
              ].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setHabitTitle(sug)}
                  className="px-2.5 py-1 rounded-full bg-surface-2 text-muted hover:text-accent whitespace-nowrap"
                >
                  + {sug}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('Көлемі / Нысанасы')} hint={tx('Мысалы: 20 бет, 30 мин, 5 есеп')}>
                {(id, d) => (
                  <input
                    id={id}
                    aria-describedby={d}
                    value={habitTarget}
                    onChange={(e) => setHabitTarget(e.target.value)}
                    placeholder={tx('20 бет / 30 мин')}
                    className={inputCls}
                  />
                )}
              </Field>

              <Field label={tx('Күн мезгілі')}>
                {() => (
                  <Chips
                    label={tx('Мезгілі')}
                    value={habitTime}
                    onChange={(v) => setHabitTime(v as 'morning' | 'afternoon' | 'evening' | 'any')}
                    items={[
                      ['morning', '🌅 ' + tx('Таңертең')],
                      ['evening', '🌙 ' + tx('Кешке')],
                      ['any', '⏱️ ' + tx('Кез келген')],
                    ]}
                  />
                )}
              </Field>
            </div>

            <Field label={tx('Жиілігі')}>
              {() => (
                <Chips
                  label={tx('Жиілік')}
                  value={habitFreq}
                  onChange={(v) => setHabitFreq(v as 'daily' | 'weekdays' | '3x_week')}
                  items={[
                    ['daily', tx('Күн сайын')],
                    ['weekdays', tx('Дс-Жм')],
                    ['3x_week', tx('Аптасына 3 рет')],
                  ]}
                />
              )}
            </Field>

            <Field label={tx('Мотивациясы')} hint={tx('Не үшін қажет? (қысқаша түсіндірме)')}>
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  value={habitMotivation}
                  onChange={(e) => setHabitMotivation(e.target.value)}
                  placeholder={tx('Мысалы: Сергек ояну және сабақта зейінді ұстау үшін')}
                  className={inputCls}
                />
              )}
            </Field>

            {existingGoals.length > 0 && (
              <Field label={tx('Қай мақсатқа байланысты?')}>
                {(id) => (
                  <select
                    id={id}
                    value={habitGoalId}
                    onChange={(e) => setHabitGoalId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{tx('Жеке әдет (мақсатпен байланыссыз)')}</option>
                    {existingGoals.map((g) => (
                      <option key={g.id} value={g.id}>🎯 {g.title}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            <Button loading={busy} disabled={habitTitle.trim().length < 2} onClick={saveCustomHabit}>
              {tx('Әдетті қосу')}
            </Button>
          </div>
        )}

        {/* 4. ТАПСЫРМА БЕРУ (Custom Task) */}
        {tab === 'task' && (
          <div className="grid gap-3">
            <Field label={tx('Санаты')}>
              {() => (
                <div className="flex gap-1.5 flex-wrap">
                  {PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTaskCat(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                        taskCat === c.id ? `${c.bg} ${c.color} ring-2 ring-accent font-bold` : 'bg-surface-2 text-muted'
                      }`}
                    >
                      <Icon n={c.icon} size={13} />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={tx('Тапсырма атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={tx('Мысалы: Пән мұғалімінен консультация алып, қателерді талдау')}
                  className={inputCls}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('Мерзімі (дедлайн)')}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={taskDue}
                    min={today()}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className={inputCls}
                  />
                )}
              </Field>

              <Field label={tx('Басымдығы')}>
                {() => (
                  <Chips
                    label={tx('Басымдық')}
                    value={taskPriority}
                    onChange={(v) => setTaskPriority(v as 'high' | 'normal')}
                    items={[
                      ['high', '⚡ ' + tx('Шұғыл')],
                      ['normal', tx('Қалыпты')],
                    ]}
                  />
                )}
              </Field>
            </div>

            <Field label={tx('Мұғалім нұсқаулығы / Ескертпе')}>
              {(id) => (
                <textarea
                  id={id}
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder={tx('Мысалы: Дәптерге нақты 5 қиын сұрақты жазып бару, шешімін тексерту.')}
                  rows={2}
                  className={`${inputCls} py-2 h-auto text-xs`}
                />
              )}
            </Field>

            {existingGoals.length > 0 && (
              <Field label={tx('Қай мақсатқа байланысты?')}>
                {(id) => (
                  <select
                    id={id}
                    value={taskGoalId}
                    onChange={(e) => setTaskGoalId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{tx('Жеке тапсырма (мақсатпен байланыссыз)')}</option>
                    {existingGoals.map((g) => (
                      <option key={g.id} value={g.id}>🎯 {g.title}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            <Button loading={busy} disabled={taskTitle.trim().length < 2} onClick={saveCustomTask}>
              {tx('Тапсырманы қосу')}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/* ==========================================================================
   Анкета өңдеу, Кездесу жоспарлау және Қорытынды жазу
   ========================================================================== */

function StudentFormEditSheet({
  student,
  initial,
  onClose,
  onSaved,
}: {
  student: { id: string; full_name: string }
  initial: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const [a, setA] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={tx('Анкета толтыру / өңдеу')} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-xs text-muted">
          {tx('{0} үшін анкета ақпараты. Сұрақтарға жауаптарды оқушымен бірге немесе жеке толтыруға болады.', student.full_name.split(' ').slice(0, 2).join(' '))}
        </p>
        {FORM.map(([k, q, hint]) => (
          <label key={k} className="grid gap-1 text-sm">
            <span className="font-medium">{q}</span>
            <textarea
              value={a[k] ?? ''}
              onChange={(e) => setA({ ...a, [k]: e.target.value })}
              maxLength={600}
              rows={2}
              className={`${inputCls} py-2 h-auto`}
              placeholder={hint}
            />
          </label>
        ))}
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await saveMyForm(
                student.id,
                Object.fromEntries(
                  Object.entries(a)
                    .map(([k, v]) => [k, v.trim()])
                    .filter(([, v]) => v)
                )
              )
              toast(tx('Сақталды'))
              onSaved()
            } catch (e) {
              toast(errText(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {tx('Сақтау')}
        </Button>
      </div>
    </Sheet>
  )
}

function PlanSheet({ student, onClose, onDone }: { student: { id: string; class_id: string }; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ when: '', topic: '', place: '', show: 'show' as 'show' | 'staff' })
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
        <Field label={tx('Өтетін орны')} hint={tx('Жатақхана орындары немесе мектеп кабинеттері')}>
          {(id) => <LocationPicker id={id} value={f.place} onChange={(place) => setF({ ...f, place })} />}
        </Field>
        <Chips label={tx('Кім көреді')} value={f.show} onChange={(show) => setF({ ...f, show })} items={[['show', tx('Оқушыға көрсету')], ['staff', tx('Тек ұстаздарға')]]} />
        <p className="text-xs text-muted">{f.show === 'show' ? tx('Оқушыға хабарлама барады, кездесуден 1 сағат бұрын еске салынады.') : tx('Оқушы бұл жазбаны көрмейді.')}</p>
        <Button loading={busy} disabled={!f.when || f.topic.trim().length < 2} onClick={async () => {
          setBusy(true)
          try { await addMentorMeeting({ class_id: student.class_id, student_id: student.id, starts_at: new Date(f.when).toISOString(), topic: f.topic.trim(), visible: f.show === 'show', place: f.place.trim() || null }); onDone() }
          catch (e) { toast(errText(e)) } finally { setBusy(false) }
        }}>{tx('Белгілеу')}</Button>
      </div>
    </Sheet>
  )
}

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
