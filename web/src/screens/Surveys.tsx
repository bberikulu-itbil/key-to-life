import { useState } from 'react'
import { answerSurvey, closeSurvey, createSurvey, errText, getSurvey, listActivities, listClasses, listSurveys, surveyResults, type Question, type Survey } from '../lib/api'
import { chatTime, fmtDate } from '../lib/time'
import { useMe } from '../App'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'

const AUD: Record<Survey['audience'], string> = { all: 'Бүкіл мектеп', students: 'Барлық оқушылар', staff: 'Мұғалімдер', class: 'Сынып', activity: 'Іс-шара' }
const isOpen = (s: Survey) => !s.closed && (!s.closes_at || new Date(s.closes_at) > new Date())
const audLabel = (s: Survey) => s.audience === 'class' ? `${s.class?.name ?? ''} сыныбы` : s.audience === 'activity' ? s.activity?.title ?? 'Іс-шара' : AUD[s.audience]

/* ---------- list ---------- */
export default function Surveys() {
  const { me } = useMe()
  const list = useLoad(listSurveys, [])
  const [f, setF] = useState<'todo' | 'done' | 'mine'>('todo')
  const canCreate = me.role !== 'student' || me.parliament
  const all = list.data ?? []
  const shown = all.filter((s) => f === 'mine' ? s.author_id === me.id : f === 'todo' ? s.author_id !== me.id && isOpen(s) && !s.mine.length : s.author_id !== me.id && (s.mine.length > 0 || !isOpen(s)))
  return (
    <div className="grid gap-3 pb-4">
      <PageHead title="Сауалнамалар" back right={canCreate ? <Button kind="secondary" onClick={() => go('/surveys/new')}>Жасау</Button> : undefined} />
      <Chips label="Сүзгі" value={f} onChange={setF} items={[['todo', 'Жауап күтеді'], ['done', 'Жауап бердім'], ...(canCreate ? [['mine', 'Менікі'] as ['mine', string]] : [])]} />
      {list.loading && !list.data ? <Skeleton /> : list.error ? <ErrorBox text={list.error} retry={list.reload} /> : !shown.length ? (
        <Card><Empty icon="poll" title={f === 'todo' ? 'Жаңа сауалнама жоқ' : 'Әзірге бос'} text={f === 'mine' ? 'Сыныпқа, іс-шараға немесе бүкіл мектепке сауалнама жасаңыз.' : undefined} /></Card>
      ) : shown.map((s) => (
        <a key={s.id} href={`#/surveys/${s.id}`} className="block rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] p-4">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge tone={isOpen(s) ? 'accent' : 'muted'}>{isOpen(s) ? 'Ашық' : 'Жабық'}</Badge>
            {s.mine.length > 0 && <Badge tone="ok">Жауап бердіңіз</Badge>}
            {s.anonymous && <span className="text-muted">Анонимді</span>}
          </div>
          <h3 className="mt-2 font-semibold text-lg break-words">{s.title}</h3>
          <p className="text-sm text-muted">{audLabel(s)} · {s.questions.length} сұрақ · {s.author.full_name}{s.closes_at ? ` · ${fmtDate(s.closes_at.slice(0, 10))} дейін` : ''}</p>
        </a>
      ))}
    </div>
  )
}

/* ---------- answer / results ---------- */
export function SurveyView({ id }: { id: string }) {
  const { me } = useMe()
  const s = useLoad(() => getSurvey(id), [id])
  if (s.loading && !s.data) return <><PageHead title="Сауалнама" back /><Skeleton /></>
  if (s.error || !s.data) return <><PageHead title="Сауалнама" back /><ErrorBox text={s.error ?? 'Табылмады'} /></>
  const v = s.data
  const owner = v.author_id === me.id || me.role === 'deputy' || me.role === 'admin'
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Сауалнама" back />
      <Card className="grid gap-1">
        <h1 className="text-xl font-bold break-words">{v.title}</h1>
        {v.description && <p className="whitespace-pre-line text-sm">{v.description}</p>}
        <p className="text-xs text-muted">{audLabel(v)} · {v.author.full_name}{v.anonymous ? ' · анонимді: автор аттарды көрмейді' : ''}</p>
      </Card>
      {owner ? <Results s={v} onChange={s.reload} /> : <Answer s={v} onDone={s.reload} />}
    </div>
  )
}

function Answer({ s, onDone }: { s: Survey; onDone: () => void }) {
  const prev = (s.mine[0]?.answers ?? []) as unknown[]
  const [a, setA] = useState<unknown[]>(s.questions.map((q, i) => prev[i] ?? (q.type === 'multi' ? [] : q.type === 'text' ? '' : null)))
  const [busy, setBusy] = useState(false)
  const open = isOpen(s)
  const put = (i: number, v: unknown) => setA(a.map((x, j) => (j === i ? v : x)))
  const send = async () => {
    const miss = s.questions.findIndex((q, i) => (q.type === 'single' ? a[i] === null : q.type === 'multi' ? !(a[i] as number[]).length : !(a[i] as string).trim()))
    if (miss >= 0) return toast(`${miss + 1}-сұраққа жауап беріңіз`)
    setBusy(true)
    try { await answerSurvey(s.id, a); toast('Жауабыңыз қабылданды'); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-3">
      {prev.length > 0 && <p className="text-sm rounded-md bg-success-soft text-success p-3">Жауап бердіңіз.{open ? ' Сауалнама жабылғанша өзгертуге болады.' : ''}</p>}
      {s.questions.map((q, i) => (
        <Card key={i} className="grid gap-2">
          <p className="font-semibold">{i + 1}. {q.q}</p>
          {q.type === 'text' ? (
            <textarea aria-label={q.q} disabled={!open} value={a[i] as string} onChange={(e) => put(i, e.target.value)} className={`${inputCls} h-24 py-2`} maxLength={1000} />
          ) : (q.options ?? []).map((o, k) => {
            const on = q.type === 'single' ? a[i] === k : (a[i] as number[]).includes(k)
            return (
              <label key={k} className={`flex items-center gap-3 min-h-11 rounded-md px-3 ${on ? 'bg-accent-soft' : 'bg-surface-2'}`}>
                <input type={q.type === 'single' ? 'radio' : 'checkbox'} name={`q${i}`} disabled={!open} checked={on} className="size-5 accent-[var(--accent)]"
                  onChange={() => put(i, q.type === 'single' ? k : on ? (a[i] as number[]).filter((x) => x !== k) : [...(a[i] as number[]), k])} />
                <span>{o}</span>
              </label>
            )
          })}
        </Card>
      ))}
      {open ? <Button block loading={busy} onClick={send}>{prev.length ? 'Жауапты жаңарту' : 'Жіберу'}</Button> : <p className="text-sm text-muted text-center">Сауалнама жабылған.</p>}
    </div>
  )
}

function Results({ s, onChange }: { s: Survey; onChange: () => void }) {
  const r = useLoad(() => surveyResults(s.id), [s.id])
  const rows = r.data ?? []
  const toggle = async () => { try { await closeSurvey(s.id, isOpen(s)); toast(isOpen(s) ? 'Жабылды' : 'Қайта ашылды'); onChange() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-3">
      <Card className="flex items-center gap-3">
        <div className="flex-1"><p className="text-2xl font-bold tabular-nums">{rows.length}</p><p className="text-xs text-muted">жауап</p></div>
        <Button kind="secondary" onClick={toggle}>{isOpen(s) ? 'Жабу' : 'Қайта ашу'}</Button>
      </Card>
      {r.loading && !r.data ? <Skeleton /> : r.error ? <ErrorBox text={r.error} /> : s.questions.map((q, i) => (
        <Card key={i} className="grid gap-2">
          <p className="font-semibold">{i + 1}. {q.q}</p>
          {q.type === 'text' ? (
            rows.filter((x) => String(x.answers[i] ?? '').trim()).length ? (
              <ul className="grid gap-1.5">{rows.filter((x) => String(x.answers[i] ?? '').trim()).map((x, k) => (
                <li key={k} className="rounded-md bg-surface-2 px-3 py-2 text-sm"><span className="whitespace-pre-line break-words">{String(x.answers[i])}</span>
                  {x.respondent && <span className="block text-xs text-muted mt-0.5">{x.respondent}{x.class_name ? ` · ${x.class_name}` : ''}</span>}</li>))}</ul>
            ) : <p className="text-sm text-muted">Жауап жоқ</p>
          ) : (q.options ?? []).map((o, k) => {
            const who = rows.filter((x) => (q.type === 'single' ? x.answers[i] === k : ((x.answers[i] as number[]) ?? []).includes(k)))
            const pct = rows.length ? Math.round((100 * who.length) / rows.length) : 0
            return (
              <div key={k} className="grid gap-1">
                <div className="flex justify-between text-sm"><span>{o}</span><span className="tabular-nums font-semibold">{who.length} · {pct}%</span></div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                {!s.anonymous && who.length > 0 && <p className="text-xs text-muted">{who.map((x) => x.respondent).join(', ')}</p>}
              </div>
            )
          })}
        </Card>
      ))}
      {rows.length > 0 && <p className="text-xs text-muted text-center">Соңғы жауап: {chatTime(rows[rows.length - 1].answered_at)}</p>}
    </div>
  )
}

/* ---------- create ---------- */
export function SurveyNew() {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const opts = useLoad(async () => {
    const [classes, acts] = await Promise.all([listClasses(), listActivities()])
    return { classes: classes.filter((c) => deputy || c.teacher_id === me.id || c.tutor_id === me.id), acts: acts.filter((a) => a.status === 'approved' && (deputy || a.supervisor_id === me.id || a.curator_id === me.id)) }
  }, [me.id])
  const [f, setF] = useState({ title: '', description: '', audience: me.role === 'student' ? 'students' : 'class', target: '', anonymous: false, closes: '' })
  const [qs, setQs] = useState<Question[]>([{ q: '', type: 'single', options: ['', ''] }])
  const [busy, setBusy] = useState(false)
  const putQ = (i: number, v: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...v } : q)))
  const save = async () => {
    if (f.title.trim().length < 3) return toast('Атауын жазыңыз')
    const questions = qs.map((q) => ({ q: q.q.trim(), type: q.type, ...(q.type === 'text' ? {} : { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }) }))
    if (questions.some((q) => q.q.length < 2 || (q.type !== 'text' && (q.options?.length ?? 0) < 2))) return toast('Әр сұрақты және кемінде 2 жауап нұсқасын толтырыңыз')
    const target = f.target || (f.audience === 'class' ? opts.data?.classes[0]?.id : f.audience === 'activity' ? opts.data?.acts[0]?.id : '')
    if ((f.audience === 'class' || f.audience === 'activity') && !target) return toast('Кімге жіберетініңізді таңдаңыз')
    setBusy(true)
    try {
      const id = await createSurvey({ title: f.title, description: f.description, audience: f.audience, questions, anonymous: f.anonymous,
        class_id: f.audience === 'class' ? target : null, activity_id: f.audience === 'activity' ? target : null,
        closes_at: f.closes ? new Date(`${f.closes}T23:59`).toISOString() : null })
      toast('Сауалнама жіберілді'); go(`/surveys/${id}`)
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const classes = opts.data?.classes ?? [], acts = opts.data?.acts ?? []
  return (
    <div className="grid gap-3 pb-8">
      <PageHead title="Жаңа сауалнама" back />
      <Card className="grid gap-4">
        <Field label="Атауы">{(id) => <input id={id} value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder="Асхана мәзірі туралы" />}</Field>
        <Field label="Түсіндірме">{(id) => <textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={`${inputCls} h-20 py-2`} />}</Field>
        <Field label="Кімге">{(id) => (
          <select id={id} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value, target: '' })} className={inputCls}>
            {(deputy || me.role !== 'student') && <option value="all">Бүкіл мектеп</option>}
            <option value="students">Барлық оқушылар</option>
            {(deputy || me.role !== 'student') && <option value="staff">Мұғалімдер</option>}
            {classes.length > 0 && <option value="class">Сынып</option>}
            {acts.length > 0 && <option value="activity">Іс-шара қатысушылары</option>}
          </select>
        )}</Field>
        {f.audience === 'class' && <Field label="Сынып">{(id) => <select id={id} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className={inputCls}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>}
        {f.audience === 'activity' && <Field label="Іс-шара">{(id) => <select id={id} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className={inputCls}>{acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>}</Field>}
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Соңғы күні">{(id) => <input id={id} type="date" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} className={inputCls} />}</Field>
          <label className="flex items-center gap-2 min-h-12"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} className="size-5 accent-[var(--accent)]" />Анонимді</label>
        </div>
      </Card>

      {qs.map((q, i) => (
        <Card key={i} className="grid gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{i + 1}-сұрақ</span>
            <div className="flex-1" />
            {qs.length > 1 && <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== i))} aria-label={`${i + 1}-сұрақты өшіру`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
          </div>
          <input aria-label={`${i + 1}-сұрақ`} value={q.q} onChange={(e) => putQ(i, { q: e.target.value })} className={inputCls} placeholder="Сұрақ" />
          <Chips label="Жауап түрі" value={q.type} onChange={(t) => putQ(i, { type: t, options: t === 'text' ? undefined : q.options ?? ['', ''] })}
            items={[['single', 'Бір жауап'], ['multi', 'Бірнеше жауап'], ['text', 'Мәтін']]} />
          {q.type !== 'text' && (
            <div className="grid gap-2">
              {(q.options ?? []).map((o, k) => (
                <div key={k} className="flex gap-2">
                  <input aria-label={`${i + 1}-сұрақ, ${k + 1}-нұсқа`} value={o} onChange={(e) => putQ(i, { options: (q.options ?? []).map((x, j) => (j === k ? e.target.value : x)) })} className={inputCls} placeholder={`${k + 1}-нұсқа`} />
                  {(q.options?.length ?? 0) > 2 && <button type="button" onClick={() => putQ(i, { options: (q.options ?? []).filter((_, j) => j !== k) })} aria-label={`${k + 1}-нұсқаны өшіру`} className="size-11 shrink-0 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
                </div>
              ))}
              {(q.options?.length ?? 0) < 10 && <Button kind="ghost" onClick={() => putQ(i, { options: [...(q.options ?? []), ''] })}>Нұсқа қосу</Button>}
            </div>
          )}
        </Card>
      ))}
      {qs.length < 30 && <Button kind="secondary" onClick={() => setQs([...qs, { q: '', type: 'single', options: ['', ''] }])}>Сұрақ қосу</Button>}
      <Button block loading={busy} onClick={save}>Жіберу</Button>
    </div>
  )
}
