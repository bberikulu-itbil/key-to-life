import { useState } from 'react'
import { answerSurvey, closeSurvey, createSurvey, errText, getSurvey, listActivities, listClasses, listSurveys, surveyResults, type Question, type Survey } from '../lib/api'
import { chatTime, fmtDate } from '../lib/time'
import { useMe } from '../App'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'
import { MI_INTRO, MbtiAnswer, MbtiLangSwitch, MbtiResults, MiResults, useMbtiLang, type MbtiLang } from '../components/Mbti'
import { MBTI } from '../lib/mbti'
import { MI } from '../lib/mi'

// ready-made tests: one survey question that holds all their items
const TESTS: Record<string, typeof MBTI | undefined> = { mbti: MBTI, mi: MI }
const testOf = (q: { type: string }) => TESTS[q.type]
const TEMPLATES: { type: 'mbti' | 'mi'; button: string; hint: string; title: string; description: string; q: string; result: string }[] = [
  { type: 'mbti', button: tx('Дайын үлгі: MBTI мінез тесті'), hint: tx('70 сұрақ, қазақша және орысша, балаға түсінікті тілмен'), title: tx('Мінез типі тесті (MBTI)'),
    description: tx('70 қысқа сұрақ, шамамен 15 минут. Дұрыс не бұрыс жауап жоқ.'), q: tx('Мінез типі тесті · 70 сұрақ'),
    result: tx('Оқушы әр сұраққа 7 шеңбердің бірін таңдайды; нәтижеде типі мен 70 жауабы көрінеді') },
  { type: 'mi', button: tx('Дайын үлгі: Көптік интеллект тесті'), hint: tx('90 сөйлем, қазақша және орысша: «келіспеймін» … «келісемін»'), title: tx('Көптік интеллект тесті'),
    description: tx('90 қысқа сөйлем, шамамен 15 минут. Дұрыс не бұрыс жауап жоқ.'), q: tx('Көптік интеллект тесті · 90 сұрақ'),
    result: tx('Оқушы әр сөйлемге 7 шеңбердің бірін таңдайды; нәтижеде 9 интеллект пайызы мен 90 жауабы көрінеді') },
]

const AUD: Record<Survey['audience'], string> = { all: tx('Бүкіл мектеп'), students: tx('Барлық оқушылар'), staff: tx('Мұғалімдер'), class: tx('Сынып'), activity: tx('Бастама') }
const count = (s: Survey) => s.questions.reduce((n, q) => n + (testOf(q)?.length ?? 1), 0)
const isOpen = (s: Survey) => !s.closed && (!s.closes_at || new Date(s.closes_at) > new Date())
const audLabel = (s: Survey) => s.audience === 'class' ? tx('{0} сыныбы', s.class?.name ?? '') : s.audience === 'activity' ? s.activity?.title ?? tx('Бастама') : AUD[s.audience]

/** Сауалнама holds both: surveys and proposals to the parliament, the administration or a teacher. */
export const VoiceTabs = ({ at }: { at: 'surveys' | 'proposals' }) => (
  <nav aria-label={tx('Сауалнама')} className="grid grid-cols-2 gap-1 bg-surface-2 rounded-md p-1">
    {([['surveys', tx('Сауалнамалар')], ['proposals', tx('Ұсыныстар')]] as const).map(([k, label]) => (
      <a key={k} href={`#/${k}`} aria-current={at === k ? 'page' : undefined} onClick={(e) => { if (at !== k) { e.preventDefault(); location.replace(`#/${k}`) } }}
        className={`h-10 rounded-sm text-sm font-semibold grid place-items-center ${at === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</a>
    ))}
  </nav>
)

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
      <PageHead title={tx('Сауалнама')} back right={canCreate ? <Button kind="secondary" onClick={() => go('/surveys/new')}>{tx('Жасау')}</Button> : undefined} />
      <VoiceTabs at="surveys" />
      <Chips label={tx('Сүзгі')} value={f} onChange={setF} items={[['todo', tx('Жауап күтеді')], ['done', tx('Жауап бердім')], ...(canCreate ? [['mine', tx('Менікі')] as ['mine', string]] : [])]} />
      {list.loading && !list.data ? <Skeleton /> : list.error ? <ErrorBox text={list.error} retry={list.reload} /> : !shown.length ? (
        <Card><Empty icon="poll" title={f === 'todo' ? tx('Жаңа сауалнама жоқ') : tx('Әзірге бос')} text={f === 'mine' ? tx('Сыныпқа, бастамаға немесе бүкіл мектепке сауалнама жасаңыз.') : undefined} /></Card>
      ) : shown.map((s) => (
        <a key={s.id} href={`#/surveys/${s.id}`} className="block rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] p-4">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge tone={isOpen(s) ? 'accent' : 'muted'}>{isOpen(s) ? tx('Ашық') : tx('Жабық')}</Badge>
            {s.mine.length > 0 && <Badge tone="ok">{tx('Жауап бердіңіз')}</Badge>}
            {s.anonymous && <span className="text-muted">{tx('Анонимді')}</span>}
          </div>
          <h3 className="mt-2 font-semibold text-lg break-words">{s.title}</h3>
          <p className="text-sm text-muted">{tx('{0} · {1} сұрақ · {2}{3}', audLabel(s), count(s), s.author.full_name, s.closes_at ? tx(' · {0} дейін', fmtDate(s.closes_at.slice(0, 10))) : '')}</p>
        </a>
      ))}
    </div>
  )
}

/* ---------- answer / results ---------- */
export function SurveyView({ id }: { id: string }) {
  const { me } = useMe()
  const s = useLoad(() => getSurvey(id), [id])
  const [tl, setTl] = useMbtiLang()
  if (s.loading && !s.data) return <><PageHead title={tx('Сауалнама')} back /><Skeleton /></>
  if (s.error || !s.data) return <><PageHead title={tx('Сауалнама')} back /><ErrorBox text={s.error ?? tx('Табылмады')} /></>
  const v = s.data
  // Hafta Sonu: staff only read the results
  const owner = v.author_id === me.id || me.role === 'deputy' || me.role === 'admin' || (v.kind === 'weekend' && me.role !== 'student')
  const test = !owner && v.questions.some(testOf)
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сауалнама')} back right={test ? <MbtiLangSwitch value={tl} onChange={setTl} /> : undefined} />
      <Card className="grid gap-1">
        <h1 className="text-xl font-bold break-words">{v.title}</h1>
        {v.description && <p className="whitespace-pre-line text-sm">{tx(v.description)}</p>}
        <p className="text-xs text-muted">{audLabel(v)} · {v.author.full_name}{v.anonymous ? tx(' · анонимді: автор аттарды көрмейді') : ''}</p>
      </Card>
      {owner ? <Results s={v} onChange={s.reload} canClose={v.author_id === me.id || me.role === 'deputy' || me.role === 'admin'} /> : <Answer s={v} onDone={s.reload} tl={tl} />}
    </div>
  )
}

function Answer({ s, onDone, tl }: { s: Survey; onDone: () => void; tl: MbtiLang }) {
  const prev = (s.mine[0]?.answers ?? []) as unknown[]
  const draftKey = `survey-draft-${s.id}`
  const [a, setA] = useState<unknown[]>(() => {
    // a long test is kept on this phone until it is sent
    let draft: unknown[] | null = null
    try { draft = prev.length ? null : JSON.parse(localStorage.getItem(draftKey) ?? 'null') } catch { /* private mode */ }
    return s.questions.map((q, i) => prev[i] ?? draft?.[i] ?? (q.type === 'multi' ? [] : q.type === 'text' ? '' : testOf(q) ? Array(testOf(q)!.length).fill(null) : null))
  })
  const [busy, setBusy] = useState(false)
  const open = isOpen(s)
  const put = (i: number, v: unknown) => { const n = a.map((x, j) => (j === i ? v : x)); setA(n); try { localStorage.setItem(draftKey, JSON.stringify(n)) } catch { /* private mode */ } }
  const send = async () => {
    const gap = s.questions.findIndex((q, i) => !!testOf(q) && (a[i] as (number | null)[]).some((v) => v == null))
    if (gap >= 0) {
      const k = (a[gap] as (number | null)[]).findIndex((v) => v == null)
      document.getElementById(`mbti-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return toast(tx('{0}-сұраққа жауап беріңіз', k + 1))
    }
    const miss = s.questions.findIndex((q, i) => (q.type === 'single' ? a[i] === null : q.type === 'multi' ? !(a[i] as number[]).length : q.type === 'text' ? !(a[i] as string).trim() : false))
    if (miss >= 0) return toast(tx('{0}-сұраққа жауап беріңіз', miss + 1))
    setBusy(true)
    try { await answerSurvey(s.id, a); try { localStorage.removeItem(draftKey) } catch { /* private mode */ } toast(tx('Жауабыңыз қабылданды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-3">
      {prev.length > 0 && <p className="text-sm rounded-md bg-success-soft text-success p-3">{tx('Жауап бердіңіз.{0}', open ? tx(' Сауалнама жабылғанша өзгертуге болады.') : '')}</p>}
      {s.questions.map((q, i) => testOf(q) ? <MbtiAnswer key={i} value={a[i] as (number | null)[]} onChange={(v) => put(i, v)} disabled={!open} lang={tl} items={testOf(q)} intro={q.type === 'mi' ? MI_INTRO : undefined} /> : (
        <Card key={i} className="grid gap-2">
          <p className="font-semibold">{i + 1}. {tx(q.q)}</p>
          {q.type === 'text' ? (
            <textarea aria-label={q.q} disabled={!open} value={a[i] as string} onChange={(e) => put(i, e.target.value)} className={`${inputCls} h-24 py-2`} maxLength={1000} />
          ) : (q.options ?? []).map((o, k) => {
            const on = q.type === 'single' ? a[i] === k : (a[i] as number[]).includes(k)
            return (
              <label key={k} className={`flex items-center gap-3 min-h-11 rounded-md px-3 ${on ? 'bg-accent-soft' : 'bg-surface-2'}`}>
                <input type={q.type === 'single' ? 'radio' : 'checkbox'} name={`q${i}`} disabled={!open} checked={on} className="size-5 accent-[var(--accent)]"
                  onChange={() => put(i, q.type === 'single' ? k : on ? (a[i] as number[]).filter((x) => x !== k) : [...(a[i] as number[]), k])} />
                <span>{tx(o)}</span>
              </label>
            )
          })}
        </Card>
      ))}
      {open ? <Button block loading={busy} onClick={send}>{prev.length ? tx('Жауапты жаңарту') : tx('Жіберу')}</Button> : <p className="text-sm text-muted text-center">{tx('Сауалнама жабылған.')}</p>}
    </div>
  )
}

function Results({ s, onChange, canClose }: { s: Survey; onChange: () => void; canClose: boolean }) {
  const r = useLoad(() => surveyResults(s.id), [s.id])
  const rows = r.data ?? []
  const toggle = async () => { try { await closeSurvey(s.id, isOpen(s)); toast(isOpen(s) ? tx('Жабылды') : tx('Қайта ашылды')); onChange() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-3">
      <Card className="flex items-center gap-3">
        <div className="flex-1"><p className="text-2xl font-bold tabular-nums">{rows.length}</p><p className="text-xs text-muted">{tx('жауап')}</p></div>
        {canClose && <Button kind="secondary" onClick={toggle}>{isOpen(s) ? tx('Жабу') : tx('Қайта ашу')}</Button>}
      </Card>
      {r.loading && !r.data ? <Skeleton /> : r.error ? <ErrorBox text={r.error} /> : s.questions.map((q, i) => q.type === 'mbti' ? <MbtiResults key={i} rows={rows} at={i} /> : q.type === 'mi' ? <MiResults key={i} rows={rows} at={i} /> : (
        <Card key={i} className="grid gap-2">
          <p className="font-semibold">{i + 1}. {tx(q.q)}</p>
          {q.type === 'text' ? (
            rows.filter((x) => String(x.answers[i] ?? '').trim()).length ? (
              <ul className="grid gap-1.5">{rows.filter((x) => String(x.answers[i] ?? '').trim()).map((x, k) => (
                <li key={k} className="rounded-md bg-surface-2 px-3 py-2 text-sm"><span className="whitespace-pre-line break-words">{String(x.answers[i])}</span>
                  {x.respondent && <span className="block text-xs text-muted mt-0.5">{x.respondent}{x.class_name ? ` · ${x.class_name}` : ''}</span>}</li>))}</ul>
            ) : <p className="text-sm text-muted">{tx('Жауап жоқ')}</p>
          ) : (q.options ?? []).map((o, k) => {
            const who = rows.filter((x) => (q.type === 'single' ? x.answers[i] === k : ((x.answers[i] as number[]) ?? []).includes(k)))
            const pct = rows.length ? Math.round((100 * who.length) / rows.length) : 0
            return (
              <div key={k} className="grid gap-1">
                <div className="flex justify-between text-sm"><span>{tx(o)}</span><span className="tabular-nums font-semibold">{who.length} · {pct}%</span></div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                {!s.anonymous && who.length > 0 && <p className="text-xs text-muted">{who.map((x) => x.respondent).join(', ')}</p>}
              </div>
            )
          })}
        </Card>
      ))}
      {rows.length > 0 && <p className="text-xs text-muted text-center">{tx('Соңғы жауап: {0}', chatTime(rows[rows.length - 1].answered_at))}</p>}
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
    if (f.title.trim().length < 3) return toast(tx('Атауын жазыңыз'))
    const questions = qs.map((q) => ({ q: q.q.trim(), type: q.type, ...(q.type === 'text' || testOf(q) ? {} : { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }) }))
    if (questions.some((q) => q.q.length < 2 || ((q.type === 'single' || q.type === 'multi') && (q.options?.length ?? 0) < 2))) return toast(tx('Әр сұрақты және кемінде 2 жауап нұсқасын толтырыңыз'))
    const target = f.target || (f.audience === 'class' ? opts.data?.classes[0]?.id : f.audience === 'activity' ? opts.data?.acts[0]?.id : '')
    if ((f.audience === 'class' || f.audience === 'activity') && !target) return toast(tx('Кімге жіберетініңізді таңдаңыз'))
    setBusy(true)
    try {
      const id = await createSurvey({ title: f.title, description: f.description, audience: f.audience, questions, anonymous: f.anonymous,
        class_id: f.audience === 'class' ? target : null, activity_id: f.audience === 'activity' ? target : null,
        closes_at: f.closes ? new Date(`${f.closes}T23:59`).toISOString() : null })
      toast(tx('Сауалнама жіберілді')); go(`/surveys/${id}`)
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const classes = opts.data?.classes ?? [], acts = opts.data?.acts ?? []
  return (
    <div className="grid gap-3 pb-8">
      <PageHead title={tx('Жаңа сауалнама')} back />
      {!qs.some(testOf) && TEMPLATES.map((t) => (
        <button key={t.type} type="button" onClick={() => { setF({ ...f, title: f.title || t.title, description: f.description || t.description }); setQs([{ q: t.q, type: t.type }]) }}
          className="rounded-lg bg-accent-soft text-accent p-4 text-left grid gap-1"><span className="font-semibold">{t.button}</span><span className="text-sm">{t.hint}</span></button>
      ))}
      <Card className="grid gap-4">
        <Field label={tx('Атауы')}>{(id) => <input id={id} value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Асхана мәзірі туралы')} />}</Field>
        <Field label={tx('Түсіндірме')}>{(id) => <textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={`${inputCls} h-20 py-2`} />}</Field>
        <Field label={tx('Кімге')}>{(id) => (
          <select id={id} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value, target: '' })} className={inputCls}>
            {(deputy || me.role !== 'student') && <option value="all">{tx('Бүкіл мектеп')}</option>}
            <option value="students">{tx('Барлық оқушылар')}</option>
            {(deputy || me.role !== 'student') && <option value="staff">{tx('Мұғалімдер')}</option>}
            {classes.length > 0 && <option value="class">{tx('Сынып')}</option>}
            {acts.length > 0 && <option value="activity">{tx('Бастама қатысушылары')}</option>}
          </select>
        )}</Field>
        {f.audience === 'class' && <Field label={tx('Сынып')}>{(id) => <select id={id} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className={inputCls}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>}
        {f.audience === 'activity' && <Field label={tx('Бастама')}>{(id) => <select id={id} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className={inputCls}>{acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>}</Field>}
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label={tx('Соңғы күні')}>{(id) => <input id={id} type="date" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} className={inputCls} />}</Field>
          <label className="flex items-center gap-2 min-h-12"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} className="size-5 accent-[var(--accent)]" />{tx('Анонимді')}</label>
        </div>
      </Card>

      {qs.map((q, i) => testOf(q) ? (
        <Card key={i} className="flex items-center gap-3">
          <span className="flex-1"><span className="block font-semibold">{q.q}</span><span className="block text-sm text-muted">{TEMPLATES.find((t) => t.type === q.type)?.result}</span></span>
          <button type="button" onClick={() => setQs([{ q: '', type: 'single', options: ['', ''] }])} aria-label={tx('Тестті алып тастау')} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
        </Card>
      ) : (
        <Card key={i} className="grid gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{tx('{0}-сұрақ', i + 1)}</span>
            <div className="flex-1" />
            {qs.length > 1 && <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== i))} aria-label={tx('{0}-сұрақты өшіру', i + 1)} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
          </div>
          <input aria-label={tx('{0}-сұрақ', i + 1)} value={q.q} onChange={(e) => putQ(i, { q: e.target.value })} className={inputCls} placeholder={tx('Сұрақ')} />
          <Chips label={tx('Жауап түрі')} value={q.type} onChange={(t) => putQ(i, { type: t, options: t === 'text' ? undefined : q.options ?? ['', ''] })}
            items={[['single', tx('Бір жауап')], ['multi', tx('Бірнеше жауап')], ['text', tx('Мәтін')]]} />
          {q.type !== 'text' && (
            <div className="grid gap-2">
              {(q.options ?? []).map((o, k) => (
                <div key={k} className="flex gap-2">
                  <input aria-label={tx('{0}-сұрақ, {1}-нұсқа', i + 1, k + 1)} value={o} onChange={(e) => putQ(i, { options: (q.options ?? []).map((x, j) => (j === k ? e.target.value : x)) })} className={inputCls} placeholder={tx('{0}-нұсқа', k + 1)} />
                  {(q.options?.length ?? 0) > 2 && <button type="button" onClick={() => putQ(i, { options: (q.options ?? []).filter((_, j) => j !== k) })} aria-label={tx('{0}-нұсқаны өшіру', k + 1)} className="size-11 shrink-0 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
                </div>
              ))}
              {(q.options?.length ?? 0) < 10 && <Button kind="ghost" onClick={() => putQ(i, { options: [...(q.options ?? []), ''] })}>{tx('Нұсқа қосу')}</Button>}
            </div>
          )}
        </Card>
      ))}
      {qs.length < 30 && !qs.some(testOf) && <Button kind="secondary" onClick={() => setQs([...qs, { q: '', type: 'single', options: ['', ''] }])}>{tx('Сұрақ қосу')}</Button>}
      <Button block loading={busy} onClick={save}>{tx('Жіберу')}</Button>
    </div>
  )
}
