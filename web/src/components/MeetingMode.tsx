import { useState, type ReactNode } from 'react'
import { closeMentorMeeting, errText, mentorAssign, type MentorItem, type MentorMeeting } from '../lib/api'
import { TEMPLATES } from '../lib/mentor'
import { fmtDate } from '../lib/time'
import { tx } from '../lib/i18n'
import { Button, Icon, Sheet, inputCls, toast } from './ui'

/** «Кездесу режимі»: one 1-on-1 done together with the student, top to bottom —
 *  1) what was agreed last time, 2) how the week went (1–5 and two questions), 3) new agreements that go
 *  straight into the student's plan. The closed note is hidden when «Оқушымен бірге» is on. */

type Draft = { title: string; kind: 'task' | 'habit'; due: string }
const GENERAL = [tx('Сыныптағы достарыңмен қалай?'), tx('Қай пән қиындатып жүр?'), tx('Саған не күш береді?'), tx('Менен қандай көмек керек?')]

export default function MeetingMode({ m, prev, prevItems, together, onClose, onDone }: {
  m: MentorMeeting
  prev: MentorMeeting | null
  prevItems: MentorItem[]
  together: boolean
  onClose: () => void
  onDone: () => void
}) {
  const tpl = TEMPLATES.find((t) => t.topic === m.topic)
  const [mood, setMood] = useState<number | null>(m.mood ?? null)
  const [well, setWell] = useState(m.went_well ?? '')
  const [hard, setHard] = useState(m.was_hard ?? '')
  const [items, setItems] = useState<Draft[]>(() => (tpl?.items ?? []).map(([title, kind]) => ({ title, kind, due: '' })))
  const [newTitle, setNewTitle] = useState('')
  const [newKind, setNewKind] = useState<'task' | 'habit'>('task')
  const [notes, setNotes] = useState(m.notes ?? '')
  const [busy, setBusy] = useState(false)
  const put = (k: number, v: Partial<Draft>) => setItems(items.map((x, j) => (j === k ? { ...x, ...v } : x)))
  const add = (title: string, kind: 'task' | 'habit') => { if (title.trim().length >= 2) setItems([...items, { title: title.trim(), kind, due: '' }]) }
  const prompts = tpl?.questions ?? GENERAL

  const finish = async () => {
    setBusy(true)
    try {
      const list = items.filter((i) => i.title.trim().length >= 2)
      for (const i of list) await mentorAssign(m.id, i.kind, i.title.trim(), i.kind === 'task' ? i.due || null : null)
      await closeMentorMeeting(m.id, { actions: list.map((i) => `• ${i.title.trim()}`).join('\n'), notes: notes.trim(), mood, went_well: well.trim(), was_hard: hard.trim() })
      toast(list.length ? tx('Сақталды, келісімдер оқушының жоспарына түсті') : tx('Сақталды'))
      onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }

  const step = (n: number, title: string, right?: ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <p className="font-bold flex items-center gap-2"><span className="size-6 rounded-full bg-accent text-on-accent text-xs grid place-items-center">{n}</span>{title}</p>
      {right}
    </div>
  )

  return (
    <Sheet title={tx('Кездесу · {0}', m.topic)} onClose={onClose}>
      <div className="grid grid-cols-1 gap-5">
        <section className="grid gap-2">
          {step(1, tx('Өткен жолғы келісімдер'), prevItems.length > 0 && <span className="text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded-full">{tx('{0} / {1} орындалды', prevItems.filter((i) => i.done).length, prevItems.length)}</span>)}
          {!prev ? <p className="text-sm text-muted">{tx('Бұл — алғашқы кездесу.')}</p>
            : prevItems.length ? prevItems.map((i) => (
              <div key={i.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${i.done ? 'bg-surface-2' : 'bg-warning-soft'}`}>
                <Icon n={i.done ? 'check' : i.kind === 'habit' ? 'clock' : 'target'} size={15} className={i.done ? 'text-success' : 'text-warning'} />
                <span className={`flex-1 min-w-0 text-sm ${i.done ? 'text-muted line-through' : 'font-semibold'}`}>{i.title}{i.kind === 'habit' && i.last7 != null ? ` · ${i.last7}/7` : ''}</span>
                {!i.done && <button type="button" onClick={() => add(i.title, i.kind)} className="h-8 px-2.5 rounded-md bg-surface text-xs font-semibold text-accent shrink-0">{tx('Қайта келісу')}</button>}
              </div>
            )) : <p className="text-sm whitespace-pre-line text-muted">{prev.actions || tx('Келісім жазылмаған')} · {fmtDate(prev.starts_at.slice(0, 10))}</p>}
        </section>

        <section className="grid gap-3">
          {step(2, tx('Аптаң қалай өтті?'))}
          <div role="radiogroup" aria-label={tx('Апта бағасы')} className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={mood === v} onClick={() => setMood(mood === v ? null : v)}
                className={`h-11 rounded-lg text-sm font-bold ${mood === v ? 'bg-accent-soft text-accent ring-2 ring-accent' : 'bg-surface-2 text-muted'}`}>{v}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-semibold">{tx('Не жақсы болды?')}
              <textarea value={well} onChange={(e) => setWell(e.target.value)} maxLength={2000} rows={3} className={`${inputCls} h-auto py-2 font-normal`} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">{tx('Не қиын болды?')}
              <textarea value={hard} onChange={(e) => setHard(e.target.value)} maxLength={2000} rows={3} className={`${inputCls} h-auto py-2 font-normal`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs font-semibold text-muted">{tx('Сұрақ ұсыныстары:')}</span>
            {prompts.map((q) => <span key={q} className="text-xs px-2.5 py-1 rounded-full bg-surface-2">{q}</span>)}
          </div>
        </section>

        <section className="grid gap-2">
          {step(3, tx('Жаңа келісімдер'))}
          <p className="text-xs text-muted">{tx('Кездесу аяқталғанда тапсырма оқушының Жоспарына, әдет — Әдеттеріне түседі.')}</p>
          {items.map((i, k) => (
            <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2">
              <input aria-label={tx('Келісім')} value={i.title} onChange={(e) => put(k, { title: e.target.value })} maxLength={200} className={`${inputCls} h-9 flex-1 min-w-40 text-sm`} />
              {(['task', 'habit'] as const).map((kind) => <button key={kind} type="button" aria-pressed={i.kind === kind} onClick={() => put(k, { kind })}
                className={`h-9 px-3 rounded-full text-xs font-semibold ${i.kind === kind ? (kind === 'habit' ? 'bg-success text-white' : 'bg-accent text-on-accent') : 'bg-surface'}`}>{kind === 'task' ? tx('Тапсырма') : tx('Әдет')}</button>)}
              {i.kind === 'task' && <input aria-label={tx('Дедлайн')} type="date" value={i.due} onChange={(e) => put(k, { due: e.target.value })} className={`${inputCls} h-9 w-36 text-sm`} />}
              <button type="button" aria-label={tx('Өшіру')} onClick={() => setItems(items.filter((_, j) => j !== k))} className="size-9 grid place-items-center rounded-md text-muted"><Icon n="x" size={16} /></button>
            </div>
          ))}
          <form className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2" onSubmit={(e) => { e.preventDefault(); add(newTitle, newKind); setNewTitle('') }}>
            <input aria-label={tx('Не келістік?')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={200} placeholder={tx('Не келістік?')} className={`${inputCls} h-10 text-sm`} />
            <select aria-label={tx('Түрі')} value={newKind} onChange={(e) => setNewKind(e.target.value as 'task' | 'habit')} className={`${inputCls} h-10 w-auto text-sm`}>
              <option value="task">{tx('Тапсырма')}</option><option value="habit">{tx('Әдет')}</option>
            </select>
            <Button kind="secondary" type="submit" disabled={newTitle.trim().length < 2}>{tx('Қосу')}</Button>
          </form>
        </section>

        {!together && (
          <label className="grid gap-1 text-sm rounded-lg border border-dashed border-line p-3">
            <span className="font-semibold flex items-center gap-1"><Icon n="lock" size={14} />{tx('Мұғалімнің жабық жазбасы')}</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} className={`${inputCls} h-auto py-2`} placeholder={tx('Оқушыға көрінбейді.')} />
          </label>
        )}

        <Button loading={busy} onClick={finish}>{tx('Кездесуді аяқтау')}</Button>
      </div>
    </Sheet>
  )
}
