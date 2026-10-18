import { useState } from 'react'
import { addTopic, errText, listTasks, listTopics, myProgress, removeTopic, setProgress, setTaskDone, type ActivityFull, type Me } from '../lib/api'
import { fmtDate, today } from '../lib/time'
import { AddTask } from './Tasks'
import { Button, Card, Field, Icon, Sheet, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

const linkify = (line: string) => (/^https?:\/\//.test(line) ? <a href={line} target="_blank" rel="noreferrer" className="text-accent underline break-all">{line}</a> : line)

/** With `hub`, each topic carries its own tasks: read the topic, then do its problems and homework in the same place. */
export default function Syllabus({ a, me, hub }: { a: ActivityFull; me: Me; hub?: { canGive: boolean } }) {
  const tasks = useLoad(() => (hub ? listTasks() : Promise.resolve([])), [!!hub])
  const [taskFor, setTaskFor] = useState<string | null>(null)
  const topics = useLoad(() => listTopics([a.id]), [a.id])
  const enrolled = a.enrollments.some((e) => e.student_id === me.id && !e.waitlisted)
  const done = useLoad(() => (enrolled ? myProgress(me.id) : Promise.resolve([])), [enrolled, me.id])
  const canEdit = a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  const [adding, setAdding] = useState(false)
  const list = topics.data ?? []
  if (!list.length && !canEdit) return null
  const dn = list.filter((t) => done.data?.includes(t.id)).length
  const d0 = today()
  const ofTopic = (id: string) => (tasks.data ?? []).filter((x) => x.topic_id === id)
  const doneTask = (x: { done: { user_id: string }[] }) => x.done.some((d) => d.user_id === me.id)
  const tick = async (id: string, v: boolean) => { try { await setTaskDone(id, v); tasks.reload() } catch (e) { toast(errText(e)) } }

  const toggle = async (id: string, v: boolean) => { try { await setProgress(id, v); done.reload() } catch (e) { toast(errText(e)) } }
  const del = async (id: string) => { try { await removeTopic(id); topics.reload() } catch (e) { toast(errText(e)) } }

  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Силабус{0}', enrolled && list.length ? tx(' · {0}/{1} меңгерілді', dn, list.length) : '')}</h2>
      {!list.length ? <Card><p className="text-sm text-muted">{tx('Тақырыптар әлі қосылмаған.')}</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {list.map((t, i) => {
            const on = !!done.data?.includes(t.id)
            const now = t.on_date === d0
            return (
              <div key={t.id} className={`flex gap-3 px-4 py-3 items-start ${now ? 'bg-accent-soft' : ''}`}>
                {enrolled ? (
                  <input type="checkbox" checked={on} onChange={(e) => toggle(t.id, e.target.checked)} aria-label={tx('{0} — меңгердім', t.title)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
                ) : <span className="size-6 rounded-full bg-accent-soft text-accent grid place-items-center text-xs font-bold shrink-0">{i + 1}</span>}
                <div className="flex-1 min-w-0">
                  {t.on_date && <p className={`text-xs font-semibold ${now ? 'text-accent' : 'text-muted'}`}>{now ? tx('Бүгінгі тақырып') : fmtDate(t.on_date)}</p>}
                  <p className={`font-semibold ${on ? 'line-through text-muted' : ''}`}>{t.title}</p>
                  {t.body && <p className="text-sm text-muted">{t.body}</p>}
                  {t.problems && <ul className="mt-1 text-sm grid gap-0.5">{t.problems.split('\n').filter(Boolean).map((p) => <li key={p}>• {linkify(p.trim())}</li>)}</ul>}
                  {hub && ofTopic(t.id).map((x) => {
                    const given = x.author_id === me.id
                    return (
                      <label key={x.id} className="mt-2 flex items-start gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-sm">
                        {given ? <Icon n="users" size={16} className="mt-0.5 text-accent shrink-0" />
                          : <input type="checkbox" checked={doneTask(x)} onChange={(e) => tick(x.id, e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />}
                        <span className="flex-1 min-w-0"><span className={`font-semibold ${!given && doneTask(x) ? 'line-through text-muted' : ''}`}>{x.title}</span>
                          {x.due_on && <span className="text-xs text-muted"> · {fmtDate(x.due_on)}</span>}
                          {given && <span className="text-xs text-muted">{tx(' · {0} орындады', x.done.length)}</span>}
                          {x.notes && <span className="block text-muted break-words">{x.notes}</span>}</span>
                      </label>
                    )
                  })}
                  {hub?.canGive && <button type="button" onClick={() => setTaskFor(t.id)} className="mt-1 text-sm text-accent font-semibold min-h-9">{tx('+ Тапсырма')}</button>}
                </div>
                {canEdit && <button type="button" onClick={() => del(t.id)} aria-label={tx('{0} — өшіру', t.title)} className="size-11 -my-2 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
              </div>
            )
          })}
        </Card>
      )}
      {canEdit && <Button kind="secondary" onClick={() => setAdding(true)}>{tx('Тақырып қосу')}</Button>}
      {taskFor && <Sheet title={tx('Тақырыпқа тапсырма')} onClose={() => setTaskFor(null)}><AddTask me={me} activity={a} topic={taskFor} onDone={() => { setTaskFor(null); tasks.reload() }} /></Sheet>}
      {adding && <Sheet title={tx('Силабусқа тақырып')} onClose={() => setAdding(false)}><AddTopic activityId={a.id} next={list.length + 1} onDone={() => { setAdding(false); topics.reload() }} /></Sheet>}
    </section>
  )
}

function AddTopic({ activityId, next, onDone }: { activityId: string; next: number; onDone: () => void }) {
  const [f, setF] = useState({ title: '', body: '', problems: '', date: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Тақырып атауын жазыңыз'))
    setBusy(true)
    try { await addTopic({ activity_id: activityId, sort: next, title: f.title.trim(), body: f.body.trim() || null, problems: f.problems.trim() || null, on_date: f.date || null }); toast(tx('Қосылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Тақырып')}>{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Префикс қосындылар')} />}</Field>
      <Field label={tx('Қысқаша түсіндірме')}>{(id) => <textarea id={id} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className={`${inputCls} h-20 py-2`} />}</Field>
      <Field label={tx('Есептер')} hint={tx('Әр жолға бір есеп немесе сілтеме')}>{(id, d) => <textarea id={id} aria-describedby={d} value={f.problems} onChange={(e) => setF({ ...f, problems: e.target.value })} className={`${inputCls} h-24 py-2`} placeholder={'ACMP #114\nhttps://codeforces.com/problemset/problem/4/C'} />}</Field>
      <Field label={tx('Өтілетін күні')} hint={tx('Міндетті емес: сол күні «Бүгінгі тақырып» болып белгіленеді')}>{(id, d) => <input id={id} aria-describedby={d} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}
