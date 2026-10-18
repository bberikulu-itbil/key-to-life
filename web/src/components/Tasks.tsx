import { useState } from 'react'
import { addTask, errText, listActivities, listClasses, listTasks, removeTask, setTaskDone, type ActivityFull, type Me, type Task } from '../lib/api'
import { fmtDate, today } from '../lib/time'
import { Button, Card, Field, Icon, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

const source = (t: Task, me: Me) =>
  t.assignee ? (t.author_id === me.id ? tx('Жеке · {0}', t.assignee.full_name) : tx('{0} · сізге жеке', t.author.full_name)) : t.class ? tx('{0} сыныбына · {1}', t.class.name, t.author.full_name) : t.activity ? `${t.activity.title} · ${t.author.full_name}` : t.author_id === me.id ? tx('Жеке') : t.author.full_name

export default function Tasks({ me, activity, canGive, noTopic }: { me: Me; activity?: ActivityFull; canGive?: boolean; noTopic?: boolean }) {
  const tasks = useLoad(listTasks, [])
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const t = today()
  const all = (tasks.data ?? []).filter((x) => (!activity || x.activity_id === activity.id) && (!noTopic || !x.topic_id))
  const isDone = (x: Task) => x.done.some((d) => d.user_id === me.id)
  // tasks I gave to a class/activity are tracked by count, not ticked by me
  const given = (x: Task) => x.author_id === me.id && !!(x.class_id || x.activity_id || x.assignee_id)
  const open = all.filter((x) => given(x) || !isDone(x))
  const done = all.filter((x) => !given(x) && isDone(x))

  const toggle = async (x: Task, v: boolean) => { try { await setTaskDone(x.id, v); tasks.reload() } catch (e) { toast(errText(e)) } }
  const del = async (x: Task) => { try { await removeTask(x.id); toast(tx('Өшірілді')); tasks.reload() } catch (e) { toast(errText(e)) } }

  const row = (x: Task) => {
    const late = x.due_on && x.due_on < t && !isDone(x) && !given(x)
    return (
      <div key={x.id} className="flex gap-3 px-4 py-3 items-start">
        {given(x) ? <span className="mt-0.5 size-6 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n="users" size={14} /></span>
          : <input type="checkbox" checked={isDone(x)} onChange={(e) => toggle(x, e.target.checked)} aria-label={tx('{0} — орындадым', x.title)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />}
        <div className="flex-1 min-w-0">
          <p className={`font-semibold break-words ${isDone(x) && !given(x) ? 'line-through text-muted' : ''}`}>{x.title}</p>
          {x.notes && <p className="text-sm text-muted break-words whitespace-pre-line">{x.notes}</p>}
          <p className="text-xs text-muted mt-0.5">
            {x.due_on && <span className={late ? 'text-danger font-semibold' : ''}>{late ? tx('Мерзімі өтті · ') : ''}{x.due_on === t ? tx('Бүгін') : fmtDate(x.due_on)} · </span>}
            {source(x, me)}{given(x) ? (x.assignee_id ? (x.done.length ? tx(' · орындады') : tx(' · орындалмаған')) : tx(' · {0} орындады', x.done.length)) : ''}
          </p>
        </div>
        {x.author_id === me.id && <button type="button" onClick={() => del(x)} aria-label={tx('{0} — өшіру', x.title)} className="size-11 -my-2 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
      </div>
    )
  }

  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between mt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Тапсырмалар{0}', open.length ? ` · ${open.length}` : '')}</h2>
        {(!activity || canGive) && <button type="button" onClick={() => setAdding(true)} className="text-sm text-accent font-semibold min-h-11 px-1">{activity ? tx('Тапсырма беру') : tx('Қосу')}</button>}
      </div>
      {tasks.loading && !tasks.data ? <Skeleton rows={1} /> : !open.length ? (
        <Card><p className="text-sm text-muted">{done.length ? tx('Барлығы орындалды.') : me.role === 'student' ? tx('Тапсырма жоқ. Өзіңізге жоспар жазыңыз немесе мұғалім берген тапсырмалар осында шығады.') : tx('Сыныпқа немесе бастама қатысушыларына тапсырма беріңіз.')}</p></Card>
      ) : <Card className="p-0 divide-y divide-line">{open.map(row)}</Card>}
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone(!showDone)} aria-expanded={showDone} className="text-sm text-muted text-left min-h-11">
            {showDone ? tx('Орындалғандарды жасыру') : tx('Орындалғандар · {0}', done.length)}
          </button>
          {showDone && <Card className="p-0 divide-y divide-line">{done.map(row)}</Card>}
        </>
      )}
      {adding && <Sheet title={tx('Жаңа тапсырма')} onClose={() => setAdding(false)}><AddTask me={me} activity={activity} onDone={() => { setAdding(false); tasks.reload() }} /></Sheet>}
    </section>
  )
}

export function AddTask({ me, activity, topic, onDone }: { me: Me; activity?: ActivityFull; topic?: string; onDone: () => void }) {
  const staff = me.role !== 'student'
  // shortcut: lists every class to staff; the database refuses classes they do not teach (can_assign)
  const targets = useLoad(async () => {
    if (activity) return { classes: [], acts: [] }
    const [classes, acts] = await Promise.all([staff ? listClasses() : Promise.resolve([]), listActivities()])
    return { classes, acts: acts.filter((a) => a.status === 'approved' && (a.supervisor_id === me.id || a.curator_id === me.id || me.role === 'deputy' || me.role === 'admin')) }
  }, [me.id])
  const [f, setF] = useState({ title: '', notes: '', due: '', target: activity ? `a:${activity.id}` : 'me' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Тапсырманы жазыңыз'))
    const [kind, id] = f.target.split(':')
    setBusy(true)
    try {
      await addTask({ title: f.title.trim(), notes: f.notes.trim() || null, due_on: f.due || null, class_id: kind === 'c' ? id : null,
        activity_id: kind === 'a' ? id : kind === 'p' ? activity?.id ?? null : null, assignee_id: kind === 'p' ? id : null, topic_id: topic ?? null })
      toast(kind === 'me' ? tx('Қосылды') : tx('Тапсырма берілді, оқушыларға хабар кетті')); onDone()
    } catch (e) { toast(errText(e).includes('row-level') ? tx('Бұл сыныпқа тапсырма бере алмайсыз') : errText(e)) } finally { setBusy(false) }
  }
  const classes = targets.data?.classes ?? []
  const acts = targets.data?.acts ?? []
  return (
    <div className="grid gap-4">
      <Field label={tx('Тапсырма')}>{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Мысалы: 5 есеп шығару')} />}</Field>
      <Field label={tx('Түсіндірме')}>{(id) => <textarea id={id} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} h-20 py-2`} />}</Field>
      <Field label={tx('Мерзімі')}>{(id) => <input id={id} type="date" value={f.due} min={today()} onChange={(e) => setF({ ...f, due: e.target.value })} className={inputCls} />}</Field>
      {activity ? (
        <Field label={tx('Кімге')} hint={tx('Жеке тапсырманы тек сол оқушы көреді')}>
          {(id, d) => <select id={id} aria-describedby={d} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className={inputCls}>
            <option value={`a:${activity.id}`}>{tx('Барлық қатысушыларға')}</option>
            <optgroup label={tx('Бір оқушыға')}>{activity.enrollments.filter((e) => !e.waitlisted).map((e) => <option key={e.student_id} value={`p:${e.student_id}`}>{e.student.full_name}</option>)}</optgroup>
          </select>}
        </Field>
      ) : (classes.length > 0 || acts.length > 0) && (
        <Field label={tx('Кімге')} hint={tx('Сыныпқа немесе бастамаға берілсе, әр оқушыға хабар барады')}>
          {(id, d) => <select id={id} aria-describedby={d} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className={inputCls}>
            <option value="me">{tx('Өзіме')}</option>
            {classes.length > 0 && <optgroup label={tx('Сыныпқа')}>{classes.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>}
            {acts.length > 0 && <optgroup label={tx('Бастама қатысушыларына')}>{acts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.title}</option>)}</optgroup>}
          </select>}
        </Field>
      )}
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}
