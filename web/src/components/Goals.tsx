import { useState } from 'react'
import { addGoal, addHabit, addTask, archiveHabit, checkHabit, errText, listGoals, listHabits, listTasks, removeGoal, setGoalDone, setTaskDone, type Goal, type Habit, type Me, type Task } from '../lib/api'
import { addDays, fmtDate, streak, today } from '../lib/time'
import { Button, Card, Field, Icon, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

/* ---------- goals → plans → daily tasks ---------- */

const Bar = ({ done, all }: { done: number; all: number }) => (
  <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
    <span className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full bg-accent" style={{ width: `${all ? (100 * done) / all : 0}%` }} /></span>
    {done}/{all}
  </span>
)

export function Goals({ me }: { me: Me }) {
  const data = useLoad(() => Promise.all([listGoals(), listTasks()]), [])
  const [form, setForm] = useState<null | { parent: Goal | null }>(null)
  const [taskFor, setTaskFor] = useState<Goal | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [goals, tasks] = data.data ?? [[], []]
  const isDone = (t: Task) => t.done.some((d) => d.user_id === me.id)
  const tasksOf = (ids: string[]) => tasks.filter((t) => t.goal_id && ids.includes(t.goal_id))
  const top = goals.filter((g) => !g.parent_id)
  const run = async (f: () => Promise<unknown>) => { try { await f(); data.reload() } catch (e) { toast(errText(e)) } }

  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between mt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Мақсаттар')}</h2>
        <button type="button" onClick={() => setForm({ parent: null })} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Мақсат қою')}</button>
      </div>
      {data.loading && !data.data ? <Skeleton rows={1} /> : !top.length ? (
        <Card><p className="text-sm text-muted">{tx('Үлкен мақсат қойыңыз, оны апталық жоспарларға, жоспарды күнделікті тапсырмаларға бөліңіз.')}</p></Card>
      ) : top.map((g) => {
        const plans = goals.filter((p) => p.parent_id === g.id)
        const all = tasksOf([g.id, ...plans.map((p) => p.id)])
        return (
          <Card key={g.id} className={`grid grid-cols-1 gap-2 ${g.done_at ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={!!g.done_at} onChange={(e) => run(() => setGoalDone(g.id, e.target.checked))} aria-label={tx('{0} — орындалды', g.title)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
              <div className="flex-1 min-w-0">
                <p className={`font-bold break-words ${g.done_at ? 'line-through' : ''}`}>{g.title}</p>
                {g.due_on && <p className="text-xs text-muted">{tx('Мерзімі: {0}', fmtDate(g.due_on))}</p>}
              </div>
              <button type="button" onClick={() => confirm(tx('«{0}» мақсатын өшіресіз бе?', g.title)) && run(() => removeGoal(g.id))} aria-label={tx('{0} — өшіру', g.title)} className="size-11 -my-2 -mr-2 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
            </div>
            <Bar done={all.filter(isDone).length} all={all.length} />
            <ul className="grid grid-cols-1 gap-1">
              {plans.map((p) => {
                const pt = tasksOf([p.id])
                const expanded = open === p.id
                return (
                  <li key={p.id} className="rounded-md bg-surface-2">
                    <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} className="w-full flex items-center gap-2 min-h-11 px-3 text-left">
                      <span className="flex-1 min-w-0 truncate font-semibold text-sm">{p.title}</span>
                      <span className="text-xs text-muted tabular-nums">{pt.filter(isDone).length}/{pt.length}</span>
                      <Icon n="chev" size={16} className={`text-muted transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                    {expanded && (
                      <div className="grid gap-1 px-3 pb-2">
                        {pt.map((t) => (
                          <label key={t.id} className="flex items-center gap-3 min-h-10">
                            <input type="checkbox" checked={isDone(t)} onChange={(e) => run(() => setTaskDone(t.id, e.target.checked))} className="size-5 shrink-0 accent-[var(--accent)]" />
                            <span className={`flex-1 text-sm ${isDone(t) ? 'line-through text-muted' : ''}`}>{t.title}</span>
                            {t.due_on && <span className="text-xs text-muted">{t.due_on === today() ? tx('Бүгін') : fmtDate(t.due_on)}</span>}
                          </label>
                        ))}
                        <div className="flex gap-3">
                          <button type="button" onClick={() => setTaskFor(p)} className="text-sm text-accent font-semibold min-h-10">{tx('+ Тапсырма')}</button>
                          <button type="button" onClick={() => confirm(tx('«{0}» жоспарын өшіресіз бе?', p.title)) && run(() => removeGoal(p.id))} className="text-sm text-muted min-h-10 ml-auto">{tx('Өшіру')}</button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <button type="button" onClick={() => setForm({ parent: g })} className="justify-self-start text-sm text-accent font-semibold min-h-10">{tx('+ Жоспар')}</button>
          </Card>
        )
      })}
      {form && <Sheet title={form.parent ? tx('Жаңа жоспар · {0}', form.parent.title) : tx('Жаңа мақсат')} onClose={() => setForm(null)}>
        <GoalForm parent={form.parent} onDone={() => { setForm(null); data.reload() }} />
      </Sheet>}
      {taskFor && <Sheet title={tx('Тапсырма · {0}', taskFor.title)} onClose={() => setTaskFor(null)}>
        <PlanTask plan={taskFor} onDone={() => { setTaskFor(null); data.reload() }} />
      </Sheet>}
    </section>
  )
}

/** A goal (no parent) or a plan under one. With goals given and no parent, the person may pick the goal for a plan. */
export function GoalForm({ parent, onDone, pick }: { parent: Goal | null; onDone: () => void; pick?: boolean }) {
  const goals = useLoad(() => (pick ? listGoals() : Promise.resolve([])), [pick])
  const [f, setF] = useState({ title: '', due: '', parent: parent?.id ?? '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Атауын жазыңыз'))
    setBusy(true)
    try { await addGoal({ title: f.title.trim(), parent_id: f.parent || null, due_on: f.due || null }); toast(tx('Қосылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const tops = (goals.data ?? []).filter((g) => !g.parent_id && !g.done_at)
  return (
    <div className="grid gap-4">
      {pick && tops.length > 0 && (
        <Field label={tx('Қай мақсатқа')} hint={tx('Бос қалдырсаңыз — жаңа мақсат болады')}>{(id, d) => (
          <select id={id} aria-describedby={d} value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })} className={inputCls}>
            <option value="">{tx('Жаңа мақсат')}</option>
            {tops.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>)}</Field>
      )}
      <Field label={f.parent ? tx('Жоспар') : tx('Мақсат')}>{(id) => <input id={id} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls}
        placeholder={f.parent ? tx('Мысалы: осы аптада динамикалық бағдарламалау') : tx('Мысалы: облыстық олимпиадада жүлде алу')} />}</Field>
      <Field label={tx('Мерзімі')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} type="date" value={f.due} min={today()} onChange={(e) => setF({ ...f, due: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}

function PlanTask({ plan, onDone }: { plan: Goal; onDone: () => void }) {
  const [f, setF] = useState({ title: '', due: today() })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Тапсырманы жазыңыз'))
    setBusy(true)
    try { await addTask({ title: f.title.trim(), notes: null, due_on: f.due || null, class_id: null, activity_id: null, goal_id: plan.id }); toast(tx('Қосылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Тапсырма')}>{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Мысалы: 5 есеп шығару')} />}</Field>
      <Field label={tx('Күні')}>{(id) => <input id={id} type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}

/* ---------- habits: a daily tick, the run of days and the last 30 days ---------- */

const last30 = (t: string) => Array.from({ length: 30 }, (_, i) => addDays(t, i - 29))

export function Habits() {
  const list = useLoad(listHabits, [])
  const [adding, setAdding] = useState(false)
  const t = today()
  const days = last30(t)
  const run = async (f: () => Promise<unknown>) => { try { await f(); list.reload() } catch (e) { toast(errText(e)) } }
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between mt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Әдеттер')}</h2>
        <button type="button" onClick={() => setAdding(true)} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Әдет қосу')}</button>
      </div>
      {list.loading && !list.data ? <Skeleton rows={1} /> : !list.data?.length ? (
        <Card><p className="text-sm text-muted">{tx('Күн сайын қайталайтын ісіңізді қосыңыз: кітап оқу, 3 есеп, спорт. Белгілеп отырсаңыз, қанша күн қатарынан жасағаныңыз көрінеді.')}</p></Card>
      ) : (
        <Card className="p-0 divide-y divide-line">
          {list.data.map((h: Habit) => {
            const done = new Set(h.checks.map((c) => c.on_date))
            const s = streak(done, t)
            const n = days.filter((d) => done.has(d)).length
            return (
              <div key={h.id} className="grid gap-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={done.has(t)} onChange={(e) => run(() => checkHabit(h.id, t, e.target.checked))} aria-label={tx('{0} — бүгін жасадым', h.title)} className="size-6 shrink-0 accent-[var(--accent)]" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{h.title}</p>
                    <p className="text-xs text-muted">{s ? tx('{0} күн қатарынан', s) : tx('Бүгін бастаңыз')} · {tx('30 күнде {0}', n)}</p>
                  </div>
                  <button type="button" onClick={() => confirm(tx('«{0}» әдетін тоқтатасыз ба?', h.title)) && run(() => archiveHabit(h.id))} aria-label={tx('{0} — тоқтату', h.title)} className="size-11 -my-2 -mr-2 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
                </div>
                {/* 30-day map: older days on the left, today on the right */}
                <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]" role="img" aria-label={tx('Соңғы 30 күн: {0} күн белгіленген', n)}>
                  {days.map((d) => <span key={d} title={fmtDate(d)} className={`h-3 rounded-[2px] ${done.has(d) ? 'bg-accent' : 'bg-surface-2'} ${d === t ? 'ring-1 ring-accent' : ''}`} />)}
                </div>
              </div>
            )
          })}
        </Card>
      )}
      {adding && <Sheet title={tx('Жаңа әдет')} onClose={() => setAdding(false)}><HabitForm onDone={() => { setAdding(false); list.reload() }} /></Sheet>}
    </section>
  )
}

export function HabitForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (title.trim().length < 2) return toast(tx('Атауын жазыңыз'))
    setBusy(true)
    try { await addHabit(title.trim()); toast(tx('Қосылды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Әдет')} hint={tx('Күн сайын белгілейсіз')}>{(id, d) => <input id={id} aria-describedby={d} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder={tx('Мысалы: 30 минут кітап оқу')} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}
