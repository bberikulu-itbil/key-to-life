import { useMemo, useState } from 'react'
import { acceptWaitlisted, addParticipant, cancelActivity, errText, getActivity, listPeople, removeActivity, removeParticipant, removeSeries, removeSessionType, saveSessionType, updateSeries, setActivityFlags, setCurators, setDefaultSessionType, tgGroupLinkUrl, tgUnlinkGroup, type ActivityFull, type PlanCategory, type SessionType } from '../lib/api'
import { IMPORTANCE, PLAN_CAT, WD_SHORT, fmtDate, hm, isoDow, today } from '../lib/time'
import { openTelegram } from '../lib/telegram'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Modules } from './ActivityDetail'
import { Badge, Button, Card, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, Switch, TypeBadge, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

const H = ({ children }: { children: string }) => <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-3">{children}</h2>

export default function ActivitySettings({ id }: { id: string }) {
  const { me } = useMe()
  const { data: a, error, loading, reload } = useLoad(() => getActivity(id), [id])
  const [sheet, setSheet] = useState<null | 'modules' | 'add' | 'cancel' | 'remove' | 'tg' | 'types'>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [confirmOut, setConfirmOut] = useState<string | null>(null)
  const [q, setQ] = useState('')
  if (loading && !a) return <><PageHead title={tx('Баптаулар')} back /><Skeleton /></>
  if (error || !a) return <><PageHead title={tx('Баптаулар')} back /><ErrorBox text={error ?? tx('Табылмады')} retry={reload} /></>
  const manager = a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  if (!manager) return <><PageHead title={tx('Баптаулар')} back /><Card><p>{tx('Бастаманы жетекші немесе орынбасар баптайды.')}</p></Card></>

  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast(done); reload() } catch (e) { toast(errText(e)) } }
  const curatorIds = a.curators?.map((x) => x.student_id) ?? (a.curator_id ? [a.curator_id] : [])
  // one tap marks/unmarks a responsible student, saved at once
  const toggleCurator = (sid: string) => {
    const on = curatorIds.includes(sid)
    act(() => setCurators(a.id, on ? curatorIds.filter((x) => x !== sid) : [...curatorIds, sid]), on ? tx('Жауаптылықтан алынды') : tx('Жауапты оқушы болды'))
  }
  const joined = a.enrollments.filter((e) => !e.waitlisted)
  const waiting = a.enrollments.filter((e) => e.waitlisted)
  const match = (n: string, c?: string | null) => (n + (c ?? '')).toLowerCase().includes(q.trim().toLowerCase())

  const csv = () => {
    const rows = [['№', tx('Аты-жөні'), tx('Сынып'), tx('Күйі')], ...a.enrollments.map((e, i) => [String(i + 1), e.student.full_name, e.student.class?.name ?? '', e.waitlisted ? tx('күту тізімі') : curatorIds.includes(e.student_id) ? tx('жауапты') : tx('қатысушы')])]
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob); link.download = `${a.title}.csv`; link.click()
  }

  const row = (e: ActivityFull['enrollments'][number]) => {
    const cur = curatorIds.includes(e.student_id)
    return (
      <div key={e.student_id} className="flex items-center gap-3 pl-4 pr-1 min-h-14">
        <Avatar name={e.student.full_name} photo={e.student.photo} size={36} />
        <span className="flex-1 min-w-0"><span className="block truncate">{e.student.full_name}</span>
          <span className="block text-xs text-muted">{e.student.class?.name ?? ''}{cur ? tx(' · жауапты') : ''}</span></span>
        {confirmOut === e.student_id ? (
          <span className="flex items-center gap-1">
            <Button kind="danger" onClick={() => { setConfirmOut(null); act(() => removeParticipant(a.id, e.student_id), tx('Шығарылды')) }}>{tx('Шығару')}</Button>
            <Button kind="ghost" onClick={() => setConfirmOut(null)}>{tx('Жоқ')}</Button>
          </span>
        ) : e.waitlisted ? (
          <>
            <Button kind="secondary" onClick={() => act(() => acceptWaitlisted(a.id, e.student_id), tx('Қабылданды'))}>{tx('Қабылдау')}</Button>
            <button type="button" onClick={() => setConfirmOut(e.student_id)} aria-label={tx('{0} — тізімнен алу', e.student.full_name)} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => toggleCurator(e.student_id)} aria-pressed={cur} aria-label={tx('{0} — жауапты оқушы', e.student.full_name)}
              className={`size-11 grid place-items-center rounded-md ${cur ? 'text-accent' : 'text-muted'}`}><Icon n="star" size={20} /></button>
            <button type="button" onClick={() => setConfirmOut(e.student_id)} aria-label={tx('{0} — шығару', e.student.full_name)} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-2 pb-8">
      <PageHead title={tx('Баптаулар')} back />

      <Card className="grid gap-2">
        <p className="font-bold text-lg leading-snug break-words">{a.title}</p>
        <div className="flex flex-wrap gap-2">
          <Badge tone={a.status === 'approved' ? 'ok' : 'muted'}>{a.status === 'approved' ? tx('Белсенді') : tx('Тоқтатылған')}</Badge>
          <Badge tone={a.enrollment_open ? 'accent' : 'warn'}>{a.enrollment_open ? tx('Тіркелу ашық') : tx('Тіркелу жабық')}</Badge>
          {a.archived_at && <Badge tone="muted">{tx('Архивте')}</Badge>}
        </div>
        <p className="text-sm text-muted tabular-nums">{tx('{0}{1} қатысушы · {2} жауапты{3}', joined.length, a.capacity ? `/${a.capacity}` : '', curatorIds.length, waiting.length ? tx(' · {0} күтуде', waiting.length) : '')}</p>
      </Card>

      <H>{tx('Бастама')}</H>
      <Card className="p-0 divide-y divide-line">
        <Item icon="file" title={tx('Атауы, уақыты, орны')} hint={tx('Сипаттама, жетекші, сыныптар, орын саны')} onClick={() => go(`/a/${a.id}/edit`)} />
        <Item icon="grid" title={tx('Бөлімдер')} hint={tx('{0} бөлім қосулы', a.features.length)} onClick={() => setSheet('modules')} />
        <Item icon="flag" title={tx('Сабақ түрлері')} hint={a.types.length ? a.types.map((t) => t.name).join(', ') : tx('Мысалы: Çalışma, Camp, KBO — күнтізбеде маңыздылығымен көрінеді')} onClick={() => setSheet('types')} />
        <Item icon="send" title={tx('Telegram тобы')} hint={a.tg_chat_title ? tx('«{0}» · түгелдеу осында жіберіледі', a.tg_chat_title) : tx('Байланыстырсаңыз, түгелдеу нәтижесін топқа бір басумен жібересіз')} onClick={() => setSheet('tg')} />
        <div className="px-4"><Switch label={tx('Тіркелу ашық')} hint={tx('Өшірсеңіз, оқушылар өздері жазыла алмайды, тек сіз қосасыз')} on={a.enrollment_open}
          onChange={(v) => act(() => setActivityFlags(a.id, v, null), v ? tx('Тіркелу ашылды') : tx('Тіркелу жабылды'))} /></div>
      </Card>

      {plans(a).length > 0 && <>
        <H>{tx('Тұрақты жоспарлар')}</H>
        <Card className="p-0 divide-y divide-line">
          {plans(a).map((p) => <Item key={p.id} icon="clock" title={`${p.wds.map((w) => WD_SHORT[w - 1]).join(', ')} · ${p.start}–${p.end}`}
            hint={`${p.type ? `${p.type} · ` : ''}${tx('{0} – {1} · {2} жоспар қалды', fmtDate(p.from), fmtDate(p.to), p.left)}`} onClick={() => setPlan(p)} />)}
        </Card>
      </>}

      <div className="flex items-center justify-between mt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Қатысушылар')}</h2>
        <div className="flex gap-1">
          {a.enrollments.length > 0 && <Button kind="ghost" onClick={csv}>CSV</Button>}
          <Button kind="secondary" onClick={() => setSheet('add')}><Icon n="userplus" size={18} />{tx('Қосу')}</Button>
        </div>
      </div>
      <p className="text-sm text-muted -mt-1">{tx('Жұлдызша — жауапты оқушы: рұқсат сұрауларын көреді, лентаға жазады, тапсырма береді.')}</p>
      {a.enrollments.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Қатысушыны іздеу')} aria-label={tx('Қатысушыны іздеу')} className={inputCls} />}
      {!a.enrollments.length ? <Card><p className="text-sm text-muted">{tx('Әзірге ешкім жоқ. «Қосу» арқылы оқушыларды өзіңіз тіркей аласыз.')}</p></Card> : (
        <>
          <Card className="p-0 divide-y divide-line">{joined.filter((e) => match(e.student.full_name, e.student.class?.name)).map(row)}</Card>
          {waiting.length > 0 && <>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Күту тізімі · {0}', waiting.length)}</h3>
            <Card className="p-0 divide-y divide-line">{waiting.filter((e) => match(e.student.full_name, e.student.class?.name)).map(row)}</Card>
          </>}
        </>
      )}

      <H>{tx('Басқа')}</H>
      <Card className="p-0 divide-y divide-line">
        <Item icon="plus" title={tx('Көшірмесін жасау')} hint={tx('Келесі тоқсанға немесе басқа топқа')} onClick={() => go(`/a/copy/${a.id}`)} />
        <Item icon="inbox" title={a.archived_at ? tx('Архивтен шығару') : tx('Архивтеу')} hint={a.archived_at ? tx('Қайта лентада көрінеді') : tx('Лентадан жасырылады, журнал мен деректер сақталады')}
          onClick={() => act(() => setActivityFlags(a.id, null, !a.archived_at), a.archived_at ? tx('Архивтен шығарылды') : tx('Архивке жіберілді'))} />
      </Card>

      <H>{tx('Қауіпті әрекеттер')}</H>
      <Card className="p-0 divide-y divide-line border-danger-soft">
        {a.status === 'approved' && <Item icon="clock" title={tx('Тоқтату')} hint={tx('Қатысушыларға себебімен хабар барады')} danger onClick={() => setSheet('cancel')} />}
        <Item icon="x" title={tx('Жою')} hint={tx('Бастама барлығынан жасырылады')} danger onClick={() => setSheet('remove')} />
      </Card>

      {sheet === 'modules' && <Sheet title={tx('Бөлімдер')} onClose={() => setSheet(null)}><Modules a={a} onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {plan && <Sheet title={tx('Тұрақты жоспар')} onClose={() => setPlan(null)}><PlanEdit a={a} p={plan} onDone={() => { setPlan(null); reload() }} /></Sheet>}
      {sheet === 'tg' && <Sheet title={tx('Telegram тобы')} onClose={() => setSheet(null)}><TgGroup a={a} onChange={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet === 'types' && <Sheet title={tx('Сабақ түрлері')} onClose={() => { setSheet(null); reload() }}><SessionTypes a={a} onChange={reload} /></Sheet>}
      {sheet === 'add' && <Sheet title={tx('Оқушы қосу')} onClose={() => setSheet(null)}><AddPeople a={a} onAdded={reload} /></Sheet>}
      {sheet === 'cancel' && <Sheet title={tx('Тоқтату')} onClose={() => setSheet(null)}><Confirm label={tx('Себебі')} hint={tx('Қатысушыларға хабар барады')} button={tx('Тоқтату')} min={3}
        onConfirm={(v) => act(() => cancelActivity(a.id, v), tx('Бастама тоқтатылды')).then(() => setSheet(null))} /></Sheet>}
      {sheet === 'remove' && <Sheet title={tx('Жою')} onClose={() => setSheet(null)}><Confirm label={tx('Растау үшін атауын жазыңыз: «{0}»', a.title)} button={tx('Біржола жою')} match={a.title}
        onConfirm={() => removeActivity(a.id).then(() => { toast(tx('Жойылды')); go('/') }, (e) => toast(errText(e)))} /></Sheet>}
    </div>
  )
}

const Item = ({ icon, title, hint, onClick, danger }: { icon: string; title: string; hint?: string; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 min-h-14 px-4 py-2 text-left active:bg-surface-2 ${danger ? 'text-danger' : ''}`}>
    <span className={`size-9 rounded-sm grid place-items-center shrink-0 ${danger ? 'bg-danger-soft' : 'bg-accent-soft text-accent'}`}><Icon n={icon} size={18} /></span>
    <span className="flex-1 min-w-0"><span className="block font-medium">{title}</span>{hint && <span className="block text-sm text-muted">{hint}</span>}</span>
    <Icon n="chev" className="text-muted" />
  </button>
)

function AddPeople({ a, onAdded }: { a: ActivityFull; onAdded: () => void }) {
  const people = useLoad(listPeople, [])
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const inIt = new Set([...a.enrollments.map((e) => e.student_id), ...added])
  const list = useMemo(() => (people.data ?? []).filter((p) => p.role === 'student' && !inIt.has(p.id)
    && (p.full_name + (p.class?.name ?? '')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60), [people.data, q, inIt.size])
  const add = async (id: string) => { try { await addParticipant(a.id, id); setAdded([...added, id]); onAdded() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Аты-жөні немесе сынып, мысалы 7B')} aria-label={tx('Оқушыны іздеу')} className={inputCls} autoFocus />
      {added.length > 0 && <p className="text-sm text-success">{tx('{0} оқушы қосылды, оларға хабар кетті', added.length)}</p>}
      {people.loading ? <Skeleton rows={2} /> : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 min-h-12">
              <span className="flex-1 min-w-0 truncate">{p.full_name} <span className="text-sm text-muted">{p.class?.name}</span></span>
              <Button kind="secondary" onClick={() => add(p.id)}>{tx('Қосу')}</Button>
            </li>
          ))}
          {!list.length && <li className="py-4 text-sm text-muted text-center">{tx('Ешкім табылмады')}</li>}
        </ul>
      )}
      {a.capacity && a.enrollments.filter((e) => !e.waitlisted).length + added.length >= a.capacity && <Badge tone="warn">{tx('Орын саны толды, бірақ өзіңіз қоса аласыз')}</Badge>}
    </div>
  )
}

function Confirm({ label, hint, button, min = 0, match, onConfirm }: { label: string; hint?: string; button: string; min?: number; match?: string; onConfirm: (v: string) => void }) {
  const [v, setV] = useState('')
  const ok = match ? v.trim() === match.trim() : v.trim().length >= min
  return (
    <div className="grid gap-4">
      <Field label={label} hint={hint}>{(id, d) => <input id={id} aria-describedby={d} value={v} onChange={(e) => setV(e.target.value)} className={inputCls} />}</Field>
      <Button block kind="danger" disabled={!ok} onClick={() => onConfirm(v.trim())}>{button}</Button>
    </div>
  )
}

function TgGroup({ a, onChange }: { a: ActivityFull; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const link = async () => {
    setBusy(true)
    try { openTelegram((await tgGroupLinkUrl(a.id)).url); toast(tx('Telegram-да топты таңдап, ботты қосыңыз. Содан соң осы бетке оралыңыз')) } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => { try { await tgUnlinkGroup(a.id); toast(tx('Топ ажыратылды')); onChange() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-4">
      {a.tg_chat_title && <Card className="flex items-center gap-3"><Icon n="send" className="text-accent" /><span className="flex-1 font-semibold">{a.tg_chat_title}</span><Badge tone="ok">{tx('Байланысты')}</Badge></Card>}
      <ol className="grid gap-1.5 text-sm text-muted list-decimal pl-5">
        <li>{tx('Төмендегі батырманы басыңыз — Telegram ашылады.')}</li>
        <li>{tx('Бастаманың тобын таңдап, ботты қосыңыз (топта әкімші болуыңыз керек).')}</li>
        <li>{tx('Бот топқа «байланысты» деп жазады. Енді журналдағы «Топқа жіберу» батырмасы түгелдеуді осы топқа жібереді.')}</li>
      </ol>
      <Button block loading={busy} onClick={link}>{a.tg_chat_title ? tx('Басқа топқа ауыстыру') : tx('Топты байланыстыру')}</Button>
      {a.tg_chat_title && <Button block kind="ghost" onClick={unlink}>{tx('Ажырату')}</Button>}
    </div>
  )
}

const LEVELS = [1, 2, 3] as const

function SessionTypes({ a, onChange }: { a: ActivityFull; onChange: () => void }) {
  const [types, setTypes] = useState<SessionType[]>(a.types)
  const [def, setDef] = useState(a.default_type_id ?? '')
  const [f, setF] = useState<{ name: string; importance: 1 | 2 | 3; category: PlanCategory }>({ name: '', importance: 1, category: 'other' })
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); onChange() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  const add = () => run(async () => {
    const name = f.name.trim()
    if (!name) throw new Error(tx('Атауын жазыңыз'))
    setTypes([...types, await saveSessionType({ activity_id: a.id, name, importance: f.importance, category: f.category })]); setF({ name: '', importance: 1, category: 'other' })
  })
  const level = (t: SessionType, importance: 1 | 2 | 3) => run(async () => { await saveSessionType({ id: t.id, activity_id: a.id, name: t.name, importance, category: t.category }); setTypes(types.map((x) => (x.id === t.id ? { ...x, importance } : x))) })
  const recat = (t: SessionType, category: PlanCategory) => run(async () => { await saveSessionType({ id: t.id, activity_id: a.id, name: t.name, importance: t.importance, category }); setTypes(types.map((x) => (x.id === t.id ? { ...x, category } : x))) })
  const Cat = ({ value, onPick, label }: { value: PlanCategory; onPick: (v: PlanCategory) => void; label: string }) => (
    <select value={value} disabled={busy} onChange={(e) => onPick(e.target.value as PlanCategory)} aria-label={label} className={inputCls}>
      {(Object.keys(PLAN_CAT) as PlanCategory[]).map((k) => <option key={k} value={k}>{tx('Санаты: {0}', PLAN_CAT[k])}</option>)}
    </select>
  )
  const remove = (t: SessionType) => run(async () => { await removeSessionType(t.id); setTypes(types.filter((x) => x.id !== t.id)); if (def === t.id) setDef('') })
  const setDefault = (id: string) => run(async () => { await setDefaultSessionType(a.id, id || null); setDef(id) })
  const Level = ({ value, onPick, label }: { value: 1 | 2 | 3; onPick: (v: 1 | 2 | 3) => void; label: string }) => (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 bg-surface-2 rounded-md p-1">
      {LEVELS.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} disabled={busy} onClick={() => onPick(n)}
          className={`min-h-10 rounded-sm text-xs font-semibold ${value === n ? 'bg-surface shadow-card' : 'text-muted'}`}>{IMPORTANCE[n].label}</button>
      ))}
    </div>
  )
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{tx('Түрін күнтізбеде сабақ қосқанда таңдайсыз. «Өте маңызды» сабақтар күнтізбеде қызылмен ерекшеленеді.')}</p>
      {types.length > 0 && (
        <ul className="grid gap-3">
          {types.map((t) => (
            <li key={t.id} className="grid gap-2">
              <div className="flex items-center gap-2"><span className="flex-1"><TypeBadge t={t} /></span>
                <button type="button" disabled={busy} onClick={() => remove(t)} aria-label={tx('{0} түрін өшіру', t.name)} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button></div>
              <Level value={t.importance} onPick={(v) => level(t, v)} label={tx('{0} маңыздылығы', t.name)} />
              <Cat value={t.category} onPick={(v) => recat(t, v)} label={tx('{0} санаты', t.name)} />
            </li>
          ))}
        </ul>
      )}
      <Card className="grid gap-3">
        <Field label={tx('Жаңа түр')}>{(id) => <input id={id} value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder={tx('Мысалы: Çalışma, Camp, KBO')} />}</Field>
        <Level value={f.importance} onPick={(v) => setF({ ...f, importance: v })} label={tx('Жаңа түрдің маңыздылығы')} />
        <Cat value={f.category} onPick={(v) => setF({ ...f, category: v })} label={tx('Жаңа түрдің санаты')} />
        <Button kind="secondary" loading={busy} disabled={!f.name.trim()} onClick={add}>{tx('Қосу')}</Button>
      </Card>
      {types.length > 0 && a.schedule === 'weekly' && !!a.weekdays?.length && (
        <Field label={tx('Тұрақты сабақтардың түрі')} hint={tx('Апта сайынғы кестедегі сабақтар осы түрмен көрінеді')}>{(id, d) => <select id={id} aria-describedby={d} value={def} disabled={busy} onChange={(e) => setDefault(e.target.value)} className={inputCls}>
          <option value="">{tx('Түрсіз')}</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>
      )}
    </div>
  )
}

type Plan = { id: string; wds: number[]; start: string; end: string; type: string | null; type_id: string | null; note: string | null; from: string; to: string; left: number }
/** Repeating plans added from the calendar, grouped by series; only ones with sessions still ahead. */
function plans(a: ActivityFull): Plan[] {
  const t = today(), by = new Map<string, typeof a.extra>()
  for (const x of a.extra) if (x.series_id && x.on_date >= t) by.set(x.series_id, [...(by.get(x.series_id) ?? []), x])
  return [...by].map(([id, xs]) => {
    xs.sort((p, q) => p.on_date.localeCompare(q.on_date))
    const f = xs[0]
    return { id, wds: [...new Set(xs.map((x) => isoDow(x.on_date)))].sort(), start: hm(f.start_time), end: hm(f.end_time), type_id: f.type_id ?? null,
      type: a.types.find((y) => y.id === f.type_id)?.name ?? null, note: f.note, from: f.on_date, to: xs[xs.length - 1].on_date, left: xs.length }
  })
}

function PlanEdit({ a, p, onDone }: { a: ActivityFull; p: Plan; onDone: () => void }) {
  const [f, setF] = useState({ start: p.start, end: p.end, type: p.type_id ?? '', note: p.note ?? '' })
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const run = async (fn: () => Promise<unknown>, done: string) => { setBusy(true); try { await fn(); toast(done); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  const save = () => f.end <= f.start ? toast(tx('Аяқталу уақыты басталудан кейін болуы керек'))
    : run(() => updateSeries(p.id, today(), { start_time: f.start, end_time: f.end, type_id: f.type || null, note: f.note.trim() || null }), tx('Сақталды'))
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{tx('Өзгеріс бүгіннен бастап алдағы {0} жоспарға қолданылады. Өткен жоспарлар мен журнал сақталады.', p.left)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx('Басталуы')}>{(id) => <input id={id} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Аяқталуы')}>{(id) => <input id={id} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className={inputCls} />}</Field>
      </div>
      {a.types.length > 0 && <Field label={tx('Түрі')}>{(id) => <select id={id} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>
        <option value="">{tx('Түрсіз')}</option>{a.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>}
      <Field label={tx('Ескерту')}>{(id) => <input id={id} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {sure
        ? <div className="grid grid-cols-2 gap-2"><Button kind="danger" loading={busy} onClick={() => run(() => removeSeries(p.id, today()), tx('Жоспар жойылды'))}>{tx('Жою')}</Button><Button kind="ghost" onClick={() => setSure(false)}>{tx('Жоқ')}</Button></div>
        : <Button kind="ghost" onClick={() => setSure(true)}>{tx('Алдағы {0} жоспарды жою', p.left)}</Button>}
    </div>
  )
}
