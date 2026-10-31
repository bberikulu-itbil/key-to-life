import { useMemo, useState } from 'react'
import {
  addCouncilMeeting, addCouncilNote, addCouncilTask, addParentContact, classStudents, errText, finishCouncilMeeting, listClasses, listCouncil, listStaff,
  removeCouncilMeeting, removeCouncilNote, removeCouncilTask, resolveCouncilNotes, setCouncilTask, setNoteUrgent, photoUrl, uploadPhoto, type CouncilNote, type CouncilTask, type ParentContact, type Student,
} from '../lib/api'
import { chatTime, fmtDate, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'

/* «Сынып кеңесі» — the class teacher and tutor's closed workspace: notes, meetings, a task board, talks with parents. */

type Tab = 'notes' | 'meeting' | 'board' | 'parents'
const COLS: [CouncilTask['status'], string][] = [['todo', tx('Күтілуде')], ['doing', tx('Орындалуда')], ['done', tx('Аяқталды')]]
const CHANNEL: Record<ParentContact['channel'], string> = { phone: tx('Телефон'), meeting: tx('Кездесу'), chat: tx('Чат'), visit: tx('Үйіне бару') }

export default function Council({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const [tab, setTab] = useState<Tab>('notes')
  const data = useLoad(async () => {
    if (!cls) return null
    const [c, students, staff] = await Promise.all([listCouncil(cls.id), classStudents(cls.id), listStaff()])
    return { ...c, students, staff }
  }, [cls?.id])

  if (classes.loading && !classes.data) return <><PageHead title={tx('Сынып кеңесі')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Сынып кеңесі')} back /><Empty icon="lock" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const d = data.data
  const staffName = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сынып кеңесі')} back right={options.length > 1 ? (
        <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/council/${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>) : undefined} />
      <p className="flex items-center gap-2 text-sm text-muted -mt-1"><Icon n="lock" size={16} />{tx('{0} · тек сынып жетекшісі мен тәрбиешіге көрінеді', cls.name)}</p>
      <Chips label={tx('Бөлім')} value={tab} onChange={setTab} items={[['notes', tx('Жазбалар')], ['meeting', tx('Жиналыс')], ['board', tx('Тапсырмалар')], ['parents', tx('Ата-аналар')]]} />
      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (
        tab === 'notes' ? <Notes classId={cls.id} notes={d.notes} students={d.students} staffName={staffName} reload={data.reload} />
        : tab === 'meeting' ? <Meeting key={d.notes.length} classId={cls.id} d={d} staffName={staffName} reload={data.reload} />
        : tab === 'board' ? <Board classId={cls.id} tasks={d.tasks} people={[cls.teacher_id, cls.tutor_id].filter((x): x is string => !!x)} staffName={staffName} reload={data.reload} />
        : <Parents classId={cls.id} contacts={d.contacts} students={d.students} staffName={staffName} reload={data.reload} />
      )}
    </div>
  )
}

/** The "@name" being typed at the end of the text, if any. */
const mentionAt = (text: string) => text.match(/(^|\s)@([^\s@]*)$/)?.[2] ?? null

const TAGS: [string, string, string][] = [
  ['grades', tx('Үлгерім'), '#2563eb'], ['conduct', tx('Тәртіп'), '#dc2626'], ['health', tx('Денсаулық'), '#16a34a'], ['dorm', tx('Жатақхана'), '#9333ea'],
  ['family', tx('Отбасы'), '#ea580c'], ['social', tx('Қарым-қатынас'), '#0891b2'], ['win', tx('Жетістік'), '#ca8a04'],
]
const tagOf = (k: string) => TAGS.find((t) => t[0] === k)

function Notes({ classId, notes, students, staffName, reload }: { classId: string; notes: CouncilNote[]; students: Student[]; staffName: (id: string | null) => string; reload: () => void }) {
  const { me } = useMe()
  const [body, setBody] = useState('')
  const [tagged, setTagged] = useState<Student[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [urgent, setUrgent] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [who, setWho] = useState('')
  const [tagF, setTagF] = useState('')
  const [big, setBig] = useState<string | null>(null)
  const q = mentionAt(body)
  const hits = q == null ? [] : students.filter((s) => s.full_name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
  const short = (s: Student) => s.full_name.split(' ').slice(0, 2).join(' ')
  const tag = (s: Student) => {
    setBody(body.replace(/@([^\s@]*)$/, `@${short(s)} `))
    if (!tagged.some((t) => t.id === s.id)) setTagged([...tagged, s])
  }
  const save = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      const photo = file ? await uploadPhoto(me.id, file) : null
      // a tag counts only while its name is still in the text
      await addCouncilNote(classId, body.trim(), tagged.filter((s) => body.includes(`@${short(s)}`)).map((s) => s.id), { tags, urgent, photo })
      setBody(''); setTagged([]); setTags([]); setUrgent(false); setFile(null); reload()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const name = (id: string) => students.find((s) => s.id === id)
  const shown = notes.filter((n) => (show === 'all' || !n.resolved_at) && (!who || n.student_ids.includes(who)) && (!tagF || n.tags.includes(tagF)))
    .sort((a, b) => Number(b.urgent && !b.resolved_at) - Number(a.urgent && !a.resolved_at))
  const used = TAGS.filter(([k]) => notes.some((n) => n.tags.includes(k)))
  return (
    <div className="grid gap-3">
      <Card className="grid gap-2">
        <textarea aria-label={tx('Жаңа жазба')} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} className={`${inputCls} ${body ? 'h-24' : 'h-12'} py-2 transition-[height]`}
          placeholder={tx('Не байқадыңыз? Оқушыны белгілеу үшін @ деп жазыңыз')} />
        {hits.length > 0 && (
          <div className="flex flex-wrap gap-2">{hits.map((s) => (
            <button key={s.id} type="button" onClick={() => tag(s)} className="h-9 px-3 rounded-full bg-accent-soft text-accent text-sm font-semibold">@{short(s)}</button>
          ))}</div>
        )}
        {body && <>
          <div className="flex flex-wrap gap-1.5">{TAGS.map(([k, l, c]) => {
            const on = tags.includes(k)
            return <button key={k} type="button" aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== k) : [...tags, k])}
              className="h-8 px-3 rounded-full text-xs font-semibold border" style={on ? { background: c, borderColor: c, color: '#fff' } : { borderColor: c + '55', color: c }}>#{l}</button>
          })}</div>
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={urgent} onClick={() => setUrgent(!urgent)} className={`h-10 px-3 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 ${urgent ? 'bg-danger text-white' : 'bg-surface-2'}`}><Icon n="flag" size={16} />{tx('Шұғыл')}</button>
            <label className={`h-10 px-3 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer ${file ? 'bg-accent-soft text-accent' : 'bg-surface-2'}`}>
              <Icon n="plus" size={16} />{file ? tx('Сурет тіркелді') : tx('Сурет')}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <span className="flex-1" />
            <Button onClick={save} loading={busy}>{tx('Жазу')}</Button>
          </div>
        </>}
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Chips label={tx('Сүзгі')} value={show} onChange={setShow} items={[['open', tx('Шешілмеген')], ['all', tx('Барлығы')]]} />
        <select aria-label={tx('Оқушы')} value={who} onChange={(e) => setWho(e.target.value)} className={`${inputCls} w-auto h-9 text-sm`}>
          <option value="">{tx('Барлық оқушы')}</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </div>
      {used.length > 0 && <div className="flex flex-wrap gap-1.5">{used.map(([k, l, c]) => (
        <button key={k} type="button" aria-pressed={tagF === k} onClick={() => setTagF(tagF === k ? '' : k)} className="h-8 px-3 rounded-full text-xs font-semibold"
          style={tagF === k ? { background: c, color: '#fff' } : { background: c + '1a', color: c }}>#{l} · {notes.filter((n) => n.tags.includes(k) && (show === 'all' || !n.resolved_at)).length}</button>
      ))}</div>}
      {!shown.length ? <Empty icon="file" title={tx('Жазба жоқ')} text={tx('Апта бойы байқағаныңызды осында жазыңыз. Шешілмеген жазбалар келесі жиналыстың күн тәртібіне түседі.')} /> : shown.map((n) => (
        <Card key={n.id} className={`grid gap-2 ${n.resolved_at ? 'opacity-70' : ''} ${n.urgent && !n.resolved_at ? 'border-l-4 border-l-danger' : ''}`}>
          {(n.urgent || n.tags.length > 0) && <div className="flex flex-wrap gap-1.5">
            {n.urgent && <span className="h-6 px-2 rounded-full bg-danger text-white text-[11px] font-semibold inline-flex items-center gap-1"><Icon n="flag" size={12} />{tx('Шұғыл')}</span>}
            {n.tags.map((k) => tagOf(k) && <span key={k} className="h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center" style={{ background: tagOf(k)![2] + '1a', color: tagOf(k)![2] }}>#{tagOf(k)![1]}</span>)}
          </div>}
          <p className="whitespace-pre-line break-words">{n.body}</p>
          {n.photo && <button type="button" onClick={() => setBig(n.photo)} className="justify-self-start"><img src={photoUrl(n.photo)} alt="" className="h-28 rounded-md object-cover" loading="lazy" /></button>}
          {n.student_ids.length > 0 && <div className="flex flex-wrap gap-1.5">{n.student_ids.map((id) => name(id) && (
            <a key={id} href={`#/mentor/${id}`} className="h-7 px-2.5 rounded-full bg-surface-2 text-xs font-semibold inline-flex items-center">@{short(name(id)!)}</a>
          ))}</div>}
          <div className="flex items-center gap-1 text-xs text-muted">
            <span className="flex-1">{staffName(n.author_id)} · {chatTime(n.created_at)}{n.resolved_at ? tx(' · шешілді') : ''}</span>
            {!n.resolved_at && <button type="button" aria-label={n.urgent ? tx('Шұғыл белгісін алу') : tx('Шұғыл деп белгілеу')} onClick={() => setNoteUrgent(n.id, !n.urgent).then(reload, (e) => toast(errText(e)))} className={`size-9 grid place-items-center rounded-md hover:bg-surface-2 ${n.urgent ? 'text-danger' : ''}`}><Icon n="flag" size={16} /></button>}
            {!n.resolved_at && <button type="button" onClick={() => resolveCouncilNotes([n.id], null).then(reload, (e) => toast(errText(e)))} className="h-9 px-3 rounded-md bg-surface-2 font-semibold text-ink">{tx('Шешілді')}</button>}
            <button type="button" aria-label={tx('Өшіру')} onClick={() => removeCouncilNote(n.id).then(reload, (e) => toast(errText(e)))} className="size-9 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="x" size={16} /></button>
          </div>
        </Card>
      ))}
      {big && <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setBig(null)} role="dialog" aria-label={tx('Сурет')}><img src={photoUrl(big)} alt="" className="max-h-full max-w-full rounded-md" /></div>}
    </div>
  )
}

type Data = Awaited<ReturnType<typeof listCouncil>> & { students: Student[] }
function Meeting({ classId, d, staffName, reload }: { classId: string; d: Data; staffName: (id: string | null) => string; reload: () => void }) {
  const next = d.meetings.filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const past = d.meetings.filter((m) => m.done_at)
  const agenda = d.notes.filter((n) => !n.resolved_at).reverse().sort((a, b) => Number(b.urgent) - Number(a.urgent))
  const [when, setWhen] = useState('')
  const [minutes, setMinutes] = useState('')
  const [settled, setSettled] = useState<Set<string>>(() => new Set(agenda.map((n) => n.id)))
  const [busy, setBusy] = useState(false)
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  const at = (s: string) => new Date(s).toLocaleString(lang === 'kk' ? 'kk-KZ' : lang, { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="grid gap-3">
      {!next ? (
        <Card className="grid gap-3">
          <p className="font-semibold">{tx('Келесі жиналыс')}</p>
          <Field label={tx('Күні мен уақыты')}>{(id) => <input id={id} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />}</Field>
          <p className="text-xs text-muted">{tx('Екеуіңізге 1 күн және 1 сағат бұрын еске салу келеді.')}</p>
          <Button disabled={!when} loading={busy} onClick={() => run(() => addCouncilMeeting(classId, new Date(when).toISOString()))}>{tx('Жиналыс белгілеу')}</Button>
        </Card>
      ) : (
        <Card className="grid gap-3">
          <div className="flex items-center gap-2">
            <span className="size-10 rounded-md bg-accent-soft text-accent grid place-items-center"><Icon n="clock" /></span>
            <span className="flex-1"><span className="block font-semibold">{at(next.starts_at)}</span><span className="block text-xs text-muted">{tx('Келесі жиналыс')}</span></span>
            <button type="button" aria-label={tx('Жиналысты өшіру')} onClick={() => run(() => removeCouncilMeeting(next.id))} className="size-10 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="x" size={18} /></button>
          </div>
          <p className="font-semibold">{tx('Күн тәртібі · {0}', agenda.length)}</p>
          {!agenda.length ? <p className="text-sm text-muted">{tx('Шешілмеген жазба жоқ.')}</p> : (
            <ul className="grid gap-1.5">{agenda.map((n) => (
              <li key={n.id}><label className="flex gap-3 rounded-md bg-surface-2 p-3">
                <input type="checkbox" checked={settled.has(n.id)} onChange={() => { const s = new Set(settled); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); setSettled(s) }} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
                <span className="text-sm"><span className="block whitespace-pre-line break-words">{n.body}</span><span className="block text-xs text-muted">{staffName(n.author_id)} · {chatTime(n.created_at)}</span></span>
              </label></li>
            ))}</ul>
          )}
          <Field label={tx('Хаттама')} hint={tx('Белгіленген жазбалар «шешілді» болады, қалғаны келесі жиналысқа ауысады.')}>{(id, dsc) => (
            <textarea id={id} aria-describedby={dsc} value={minutes} onChange={(e) => setMinutes(e.target.value)} maxLength={10000} className={`${inputCls} h-32 py-2`} placeholder={tx('Не шештіңіздер?')} />
          )}</Field>
          <Button loading={busy} disabled={!minutes.trim()} onClick={() => run(async () => {
            await finishCouncilMeeting(next.id, minutes.trim())
            const ids = agenda.filter((n) => settled.has(n.id)).map((n) => n.id)
            if (ids.length) await resolveCouncilNotes(ids, next.id)
            setMinutes(''); toast(tx('Хаттама мұрағатқа сақталды'))
          })}>{tx('Жиналысты аяқтау')}</Button>
        </Card>
      )}
      {past.length > 0 && <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Мұрағат')}</h2>}
      {past.map((m) => {
        const items = d.notes.filter((n) => n.meeting_id === m.id)
        return (
          <details key={m.id} className="rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-4 py-3">
            <summary className="font-semibold cursor-pointer">{at(m.starts_at)}<span className="text-muted font-normal">{' · '}{tx('{0} мәселе', items.length)}</span></summary>
            <p className="mt-2 whitespace-pre-line text-sm">{m.minutes}</p>
            {items.length > 0 && <ul className="mt-2 grid gap-1 text-sm text-muted list-disc pl-5">{items.map((n) => <li key={n.id}>{n.body}</li>)}</ul>}
          </details>
        )
      })}
    </div>
  )
}

function Board({ classId, tasks, people, staffName, reload }: { classId: string; tasks: CouncilTask[]; people: string[]; staffName: (id: string | null) => string; reload: () => void }) {
  const [f, setF] = useState({ title: '', assignee: people[0] ?? '', due: '' })
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true)
    try { await addCouncilTask({ class_id: classId, title: f.title.trim(), assignee_id: f.assignee || null, due_on: f.due || null }); setF({ ...f, title: '', due: '' }); reload() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const move = (t: CouncilTask, step: number) => setCouncilTask(t.id, COLS[COLS.findIndex(([s]) => s === t.status) + step][0]).then(reload, (e) => toast(errText(e)))
  const late = (t: CouncilTask) => t.status !== 'done' && t.due_on != null && t.due_on < today()
  return (
    <div className="grid gap-3">
      <Card className="grid gap-2">
        <input aria-label={tx('Жаңа тапсырма')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Жаңа тапсырма')} />
        <div className="grid grid-cols-2 gap-2 [&_input]:min-w-0">
          <select aria-label={tx('Жауапты')} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} className={inputCls}>
            <option value="">{tx('Жауапты жоқ')}</option>
            {people.map((p) => <option key={p} value={p}>{staffName(p)}</option>)}
          </select>
          <input aria-label={tx('Дедлайн')} type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className={inputCls} />
        </div>
        <Button onClick={add} loading={busy} disabled={f.title.trim().length < 2}>{tx('Қосу')}</Button>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {COLS.map(([s, label], k) => {
          const list = tasks.filter((t) => t.status === s)
          return (
            <section key={s} aria-label={label} className="grid gap-2 rounded-lg bg-surface-2 p-2">
              <h2 className="px-1 pt-1 text-sm font-semibold flex justify-between">{label}<span className="text-muted tabular-nums">{list.length}</span></h2>
              {list.map((t) => (
                <div key={t.id} className="grid gap-1.5 rounded-md bg-surface p-3 shadow-card">
                  <p className={`text-sm font-medium break-words ${s === 'done' ? 'line-through text-muted' : ''}`}>{t.title}</p>
                  <p className="text-xs text-muted">{t.assignee_id ? staffName(t.assignee_id) : tx('Жауапты жоқ')}{t.due_on && <span className={late(t) ? 'text-danger font-semibold' : ''}>{' · '}{fmtDate(t.due_on)}</span>}</p>
                  <div className="flex gap-1">
                    {k > 0 && <button type="button" aria-label={tx('Артқа')} onClick={() => move(t, -1)} className="size-9 grid place-items-center rounded-md bg-surface-2"><Icon n="back" size={16} /></button>}
                    {k < 2 && <button type="button" aria-label={tx('Алға')} onClick={() => move(t, 1)} className="size-9 grid place-items-center rounded-md bg-accent-soft text-accent"><Icon n="chev" size={16} /></button>}
                    <span className="flex-1" />
                    <button type="button" aria-label={tx('Өшіру')} onClick={() => removeCouncilTask(t.id).then(reload, (e) => toast(errText(e)))} className="size-9 grid place-items-center rounded-md hover:bg-surface-2 text-muted"><Icon n="x" size={16} /></button>
                  </div>
                </div>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Parents({ classId, contacts, students, staffName, reload }: { classId: string; contacts: ParentContact[]; students: Student[]; staffName: (id: string | null) => string; reload: () => void }) {
  const [f, setF] = useState({ student: '', date: today(), channel: 'phone' as ParentContact['channel'], summary: '' })
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const name = useMemo(() => new Map(students.map((s) => [s.id, s.full_name])), [students])
  const add = async () => {
    setBusy(true)
    try { await addParentContact({ class_id: classId, student_id: f.student, on_date: f.date, channel: f.channel, summary: f.summary.trim() }); setF({ ...f, summary: '' }); reload() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const shown = contacts.filter((c) => !who || c.student_id === who)
  return (
    <div className="grid gap-3">
      <Card className="grid gap-2">
        <p className="font-semibold">{tx('Ата-анамен сөйлесу')}</p>
        <div className="grid grid-cols-2 gap-2 [&_input]:min-w-0">
          <select aria-label={tx('Оқушы')} value={f.student} onChange={(e) => setF({ ...f, student: e.target.value })} className={inputCls}>
            <option value="">{tx('Оқушыны таңдаңыз')}</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <input aria-label={tx('Күні')} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />
        </div>
        <Chips label={tx('Байланыс түрі')} value={f.channel} onChange={(channel) => setF({ ...f, channel })} items={Object.entries(CHANNEL) as [ParentContact['channel'], string][]} />
        <textarea aria-label={tx('Не туралы сөйлестіңіз?')} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={2000} className={`${inputCls} h-20 py-2`} placeholder={tx('Не туралы сөйлестіңіз?')} />
        <Button onClick={add} loading={busy} disabled={!f.student || f.summary.trim().length < 2}>{tx('Сақтау')}</Button>
      </Card>
      <select aria-label={tx('Оқушы')} value={who} onChange={(e) => setWho(e.target.value)} className={`${inputCls} h-9 text-sm`}>
        <option value="">{tx('Барлық оқушы')}</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>
      {!shown.length ? <Empty icon="chat" title={tx('Әзірге жазба жоқ')} text={tx('Ата-анамен кім, қашан, не туралы сөйлескені осында сақталады — бір сұрақты екі рет қоймау үшін.')} /> : shown.map((c) => (
        <Card key={c.id} className="grid gap-1">
          <p className="font-semibold">{name.get(c.student_id) ?? '—'}</p>
          <p className="text-sm whitespace-pre-line break-words">{c.summary}</p>
          <p className="text-xs text-muted">{fmtDate(c.on_date)} · {CHANNEL[c.channel]} · {staffName(c.staff_id)}</p>
        </Card>
      ))}
    </div>
  )
}
