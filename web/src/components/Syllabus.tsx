import { useState } from 'react'
import { addTopic, errText, listTopics, myProgress, removeTopic, setProgress, type ActivityFull, type Me } from '../lib/api'
import { Button, Card, Field, Icon, Sheet, inputCls, toast, useLoad } from './ui'

const linkify = (line: string) => (/^https?:\/\//.test(line) ? <a href={line} target="_blank" rel="noreferrer" className="text-accent underline break-all">{line}</a> : line)

export default function Syllabus({ a, me }: { a: ActivityFull; me: Me }) {
  const topics = useLoad(() => listTopics([a.id]), [a.id])
  const enrolled = a.enrollments.some((e) => e.student_id === me.id && !e.waitlisted)
  const done = useLoad(() => (enrolled ? myProgress(me.id) : Promise.resolve([])), [enrolled, me.id])
  const canEdit = a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  const [adding, setAdding] = useState(false)
  const list = topics.data ?? []
  if (!list.length && !canEdit) return null
  const dn = list.filter((t) => done.data?.includes(t.id)).length

  const toggle = async (id: string, v: boolean) => { try { await setProgress(id, v); done.reload() } catch (e) { toast(errText(e)) } }
  const del = async (id: string) => { try { await removeTopic(id); topics.reload() } catch (e) { toast(errText(e)) } }

  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Силабус{enrolled && list.length ? ` · ${dn}/${list.length} меңгерілді` : ''}</h2>
      {!list.length ? <Card><p className="text-sm text-muted">Тақырыптар әлі қосылмаған.</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {list.map((t, i) => {
            const on = !!done.data?.includes(t.id)
            return (
              <div key={t.id} className="flex gap-3 px-4 py-3 items-start">
                {enrolled ? (
                  <input type="checkbox" checked={on} onChange={(e) => toggle(t.id, e.target.checked)} aria-label={`${t.title} — меңгердім`} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
                ) : <span className="size-6 rounded-full bg-accent-soft text-accent grid place-items-center text-xs font-bold shrink-0">{i + 1}</span>}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${on ? 'line-through text-muted' : ''}`}>{t.title}</p>
                  {t.body && <p className="text-sm text-muted">{t.body}</p>}
                  {t.problems && <ul className="mt-1 text-sm grid gap-0.5">{t.problems.split('\n').filter(Boolean).map((p) => <li key={p}>• {linkify(p.trim())}</li>)}</ul>}
                </div>
                {canEdit && <button type="button" onClick={() => del(t.id)} aria-label={`${t.title} — өшіру`} className="size-11 -my-2 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
              </div>
            )
          })}
        </Card>
      )}
      {canEdit && <Button kind="secondary" onClick={() => setAdding(true)}>Тақырып қосу</Button>}
      {adding && <Sheet title="Силабусқа тақырып" onClose={() => setAdding(false)}><AddTopic activityId={a.id} next={list.length + 1} onDone={() => { setAdding(false); topics.reload() }} /></Sheet>}
    </section>
  )
}

function AddTopic({ activityId, next, onDone }: { activityId: string; next: number; onDone: () => void }) {
  const [f, setF] = useState({ title: '', body: '', problems: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast('Тақырып атауын жазыңыз')
    setBusy(true)
    try { await addTopic({ activity_id: activityId, sort: next, title: f.title.trim(), body: f.body.trim() || null, problems: f.problems.trim() || null }); toast('Қосылды'); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label="Тақырып">{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder="Префикс қосындылар" />}</Field>
      <Field label="Қысқаша түсіндірме">{(id) => <textarea id={id} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} className={`${inputCls} h-20 py-2`} />}</Field>
      <Field label="Есептер" hint="Әр жолға бір есеп немесе сілтеме">{(id, d) => <textarea id={id} aria-describedby={d} value={f.problems} onChange={(e) => setF({ ...f, problems: e.target.value })} className={`${inputCls} h-24 py-2`} placeholder={'ACMP #114\nhttps://codeforces.com/problemset/problem/4/C'} />}</Field>
      <Button block loading={busy} onClick={save}>Қосу</Button>
    </div>
  )
}
