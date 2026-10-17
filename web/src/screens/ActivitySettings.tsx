import { useMemo, useState } from 'react'
import { acceptWaitlisted, addParticipant, cancelActivity, errText, getActivity, listPeople, removeActivity, removeParticipant, removeSessionType, saveSessionType, setActivityFlags, setCurators, setDefaultSessionType, tgGroupLinkUrl, tgUnlinkGroup, type ActivityFull, type SessionType } from '../lib/api'
import { IMPORTANCE } from '../lib/time'
import { openTelegram } from '../lib/telegram'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Modules } from './ActivityDetail'
import { Badge, Button, Card, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, Switch, TypeBadge, go, inputCls, toast, useLoad } from '../components/ui'

const H = ({ children }: { children: string }) => <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-3">{children}</h2>

export default function ActivitySettings({ id }: { id: string }) {
  const { me } = useMe()
  const { data: a, error, loading, reload } = useLoad(() => getActivity(id), [id])
  const [sheet, setSheet] = useState<null | 'modules' | 'add' | 'cancel' | 'remove' | 'tg' | 'types'>(null)
  const [confirmOut, setConfirmOut] = useState<string | null>(null)
  const [q, setQ] = useState('')
  if (loading && !a) return <><PageHead title="Баптаулар" back /><Skeleton /></>
  if (error || !a) return <><PageHead title="Баптаулар" back /><ErrorBox text={error ?? 'Табылмады'} retry={reload} /></>
  const manager = a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  if (!manager) return <><PageHead title="Баптаулар" back /><Card><p>Іс-шараны жетекші немесе орынбасар баптайды.</p></Card></>

  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast(done); reload() } catch (e) { toast(errText(e)) } }
  const curatorIds = a.curators?.map((x) => x.student_id) ?? (a.curator_id ? [a.curator_id] : [])
  // one tap marks/unmarks a responsible student, saved at once
  const toggleCurator = (sid: string) => {
    const on = curatorIds.includes(sid)
    act(() => setCurators(a.id, on ? curatorIds.filter((x) => x !== sid) : [...curatorIds, sid]), on ? 'Жауаптылықтан алынды' : 'Жауапты оқушы болды')
  }
  const joined = a.enrollments.filter((e) => !e.waitlisted)
  const waiting = a.enrollments.filter((e) => e.waitlisted)
  const match = (n: string, c?: string | null) => (n + (c ?? '')).toLowerCase().includes(q.trim().toLowerCase())

  const csv = () => {
    const rows = [['№', 'Аты-жөні', 'Сынып', 'Күйі'], ...a.enrollments.map((e, i) => [String(i + 1), e.student.full_name, e.student.class?.name ?? '', e.waitlisted ? 'күту тізімі' : curatorIds.includes(e.student_id) ? 'жауапты' : 'қатысушы'])]
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
          <span className="block text-xs text-muted">{e.student.class?.name ?? ''}{cur ? ' · жауапты' : ''}</span></span>
        {confirmOut === e.student_id ? (
          <span className="flex items-center gap-1">
            <Button kind="danger" onClick={() => { setConfirmOut(null); act(() => removeParticipant(a.id, e.student_id), 'Шығарылды') }}>Шығару</Button>
            <Button kind="ghost" onClick={() => setConfirmOut(null)}>Жоқ</Button>
          </span>
        ) : e.waitlisted ? (
          <>
            <Button kind="secondary" onClick={() => act(() => acceptWaitlisted(a.id, e.student_id), 'Қабылданды')}>Қабылдау</Button>
            <button type="button" onClick={() => setConfirmOut(e.student_id)} aria-label={`${e.student.full_name} — тізімнен алу`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => toggleCurator(e.student_id)} aria-pressed={cur} aria-label={`${e.student.full_name} — жауапты оқушы`}
              className={`size-11 grid place-items-center rounded-md ${cur ? 'text-accent' : 'text-muted'}`}><Icon n="star" size={20} /></button>
            <button type="button" onClick={() => setConfirmOut(e.student_id)} aria-label={`${e.student.full_name} — шығару`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-2 pb-8">
      <PageHead title="Баптаулар" back />

      <Card className="grid gap-2">
        <p className="font-bold text-lg leading-snug break-words">{a.title}</p>
        <div className="flex flex-wrap gap-2">
          <Badge tone={a.status === 'approved' ? 'ok' : 'muted'}>{a.status === 'approved' ? 'Белсенді' : 'Тоқтатылған'}</Badge>
          <Badge tone={a.enrollment_open ? 'accent' : 'warn'}>{a.enrollment_open ? 'Тіркелу ашық' : 'Тіркелу жабық'}</Badge>
          {a.archived_at && <Badge tone="muted">Архивте</Badge>}
        </div>
        <p className="text-sm text-muted tabular-nums">{joined.length}{a.capacity ? `/${a.capacity}` : ''} қатысушы · {curatorIds.length} жауапты{waiting.length ? ` · ${waiting.length} күтуде` : ''}</p>
      </Card>

      <H>Іс-шара</H>
      <Card className="p-0 divide-y divide-line">
        <Item icon="file" title="Атауы, уақыты, орны" hint="Сипаттама, жетекші, сыныптар, орын саны" onClick={() => go(`/a/${a.id}/edit`)} />
        <Item icon="grid" title="Бөлімдер" hint={`${a.features.length} бөлім қосулы`} onClick={() => setSheet('modules')} />
        <Item icon="flag" title="Сабақ түрлері" hint={a.types.length ? a.types.map((t) => t.name).join(', ') : 'Мысалы: Çalışma, Camp, KBO — күнтізбеде маңыздылығымен көрінеді'} onClick={() => setSheet('types')} />
        <Item icon="send" title="Telegram тобы" hint={a.tg_chat_title ? `«${a.tg_chat_title}» · түгелдеу осында жіберіледі` : 'Байланыстырсаңыз, түгелдеу нәтижесін топқа бір басумен жібересіз'} onClick={() => setSheet('tg')} />
        <div className="px-4"><Switch label="Тіркелу ашық" hint="Өшірсеңіз, оқушылар өздері жазыла алмайды, тек сіз қосасыз" on={a.enrollment_open}
          onChange={(v) => act(() => setActivityFlags(a.id, v, null), v ? 'Тіркелу ашылды' : 'Тіркелу жабылды')} /></div>
      </Card>

      <div className="flex items-center justify-between mt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Қатысушылар</h2>
        <div className="flex gap-1">
          {a.enrollments.length > 0 && <Button kind="ghost" onClick={csv}>CSV</Button>}
          <Button kind="secondary" onClick={() => setSheet('add')}><Icon n="userplus" size={18} />Қосу</Button>
        </div>
      </div>
      <p className="text-sm text-muted -mt-1">Жұлдызша — жауапты оқушы: рұқсат сұрауларын көреді, лентаға жазады, тапсырма береді.</p>
      {a.enrollments.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Қатысушыны іздеу" aria-label="Қатысушыны іздеу" className={inputCls} />}
      {!a.enrollments.length ? <Card><p className="text-sm text-muted">Әзірге ешкім жоқ. «Қосу» арқылы оқушыларды өзіңіз тіркей аласыз.</p></Card> : (
        <>
          <Card className="p-0 divide-y divide-line">{joined.filter((e) => match(e.student.full_name, e.student.class?.name)).map(row)}</Card>
          {waiting.length > 0 && <>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Күту тізімі · {waiting.length}</h3>
            <Card className="p-0 divide-y divide-line">{waiting.filter((e) => match(e.student.full_name, e.student.class?.name)).map(row)}</Card>
          </>}
        </>
      )}

      <H>Басқа</H>
      <Card className="p-0 divide-y divide-line">
        <Item icon="plus" title="Көшірмесін жасау" hint="Келесі тоқсанға немесе басқа топқа" onClick={() => go(`/a/copy/${a.id}`)} />
        <Item icon="inbox" title={a.archived_at ? 'Архивтен шығару' : 'Архивтеу'} hint={a.archived_at ? 'Қайта лентада көрінеді' : 'Лентадан жасырылады, журнал мен деректер сақталады'}
          onClick={() => act(() => setActivityFlags(a.id, null, !a.archived_at), a.archived_at ? 'Архивтен шығарылды' : 'Архивке жіберілді')} />
      </Card>

      <H>Қауіпті әрекеттер</H>
      <Card className="p-0 divide-y divide-line border-danger-soft">
        {a.status === 'approved' && <Item icon="clock" title="Тоқтату" hint="Қатысушыларға себебімен хабар барады" danger onClick={() => setSheet('cancel')} />}
        <Item icon="x" title="Жою" hint="Іс-шара барлығынан жасырылады" danger onClick={() => setSheet('remove')} />
      </Card>

      {sheet === 'modules' && <Sheet title="Бөлімдер" onClose={() => setSheet(null)}><Modules a={a} onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet === 'tg' && <Sheet title="Telegram тобы" onClose={() => setSheet(null)}><TgGroup a={a} onChange={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet === 'types' && <Sheet title="Сабақ түрлері" onClose={() => { setSheet(null); reload() }}><SessionTypes a={a} onChange={reload} /></Sheet>}
      {sheet === 'add' && <Sheet title="Оқушы қосу" onClose={() => setSheet(null)}><AddPeople a={a} onAdded={reload} /></Sheet>}
      {sheet === 'cancel' && <Sheet title="Тоқтату" onClose={() => setSheet(null)}><Confirm label="Себебі" hint="Қатысушыларға хабар барады" button="Тоқтату" min={3}
        onConfirm={(v) => act(() => cancelActivity(a.id, v), 'Іс-шара тоқтатылды').then(() => setSheet(null))} /></Sheet>}
      {sheet === 'remove' && <Sheet title="Жою" onClose={() => setSheet(null)}><Confirm label={`Растау үшін атауын жазыңыз: «${a.title}»`} button="Біржола жою" match={a.title}
        onConfirm={() => removeActivity(a.id).then(() => { toast('Жойылды'); go('/') }, (e) => toast(errText(e)))} /></Sheet>}
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Аты-жөні немесе сынып, мысалы 7B" aria-label="Оқушыны іздеу" className={inputCls} autoFocus />
      {added.length > 0 && <p className="text-sm text-success">{added.length} оқушы қосылды, оларға хабар кетті</p>}
      {people.loading ? <Skeleton rows={2} /> : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 min-h-12">
              <span className="flex-1 min-w-0 truncate">{p.full_name} <span className="text-sm text-muted">{p.class?.name}</span></span>
              <Button kind="secondary" onClick={() => add(p.id)}>Қосу</Button>
            </li>
          ))}
          {!list.length && <li className="py-4 text-sm text-muted text-center">Ешкім табылмады</li>}
        </ul>
      )}
      {a.capacity && a.enrollments.filter((e) => !e.waitlisted).length + added.length >= a.capacity && <Badge tone="warn">Орын саны толды, бірақ өзіңіз қоса аласыз</Badge>}
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
    try { openTelegram((await tgGroupLinkUrl(a.id)).url); toast('Telegram-да топты таңдап, ботты қосыңыз. Содан соң осы бетке оралыңыз') } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => { try { await tgUnlinkGroup(a.id); toast('Топ ажыратылды'); onChange() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-4">
      {a.tg_chat_title && <Card className="flex items-center gap-3"><Icon n="send" className="text-accent" /><span className="flex-1 font-semibold">{a.tg_chat_title}</span><Badge tone="ok">Байланысты</Badge></Card>}
      <ol className="grid gap-1.5 text-sm text-muted list-decimal pl-5">
        <li>Төмендегі батырманы басыңыз — Telegram ашылады.</li>
        <li>Іс-шараның тобын таңдап, ботты қосыңыз (топта әкімші болуыңыз керек).</li>
        <li>Бот топқа «байланысты» деп жазады. Енді журналдағы «Топқа жіберу» батырмасы түгелдеуді осы топқа жібереді.</li>
      </ol>
      <Button block loading={busy} onClick={link}>{a.tg_chat_title ? 'Басқа топқа ауыстыру' : 'Топты байланыстыру'}</Button>
      {a.tg_chat_title && <Button block kind="ghost" onClick={unlink}>Ажырату</Button>}
    </div>
  )
}

const LEVELS = [1, 2, 3] as const

function SessionTypes({ a, onChange }: { a: ActivityFull; onChange: () => void }) {
  const [types, setTypes] = useState<SessionType[]>(a.types)
  const [def, setDef] = useState(a.default_type_id ?? '')
  const [f, setF] = useState<{ name: string; importance: 1 | 2 | 3 }>({ name: '', importance: 1 })
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); onChange() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  const add = () => run(async () => {
    const name = f.name.trim()
    if (!name) throw new Error('Атауын жазыңыз')
    setTypes([...types, await saveSessionType({ activity_id: a.id, name, importance: f.importance })]); setF({ name: '', importance: 1 })
  })
  const level = (t: SessionType, importance: 1 | 2 | 3) => run(async () => { await saveSessionType({ id: t.id, activity_id: a.id, name: t.name, importance }); setTypes(types.map((x) => (x.id === t.id ? { ...x, importance } : x))) })
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
      <p className="text-sm text-muted">Түрін күнтізбеде сабақ қосқанда таңдайсыз. «Өте маңызды» сабақтар күнтізбеде қызылмен ерекшеленеді.</p>
      {types.length > 0 && (
        <ul className="grid gap-3">
          {types.map((t) => (
            <li key={t.id} className="grid gap-2">
              <div className="flex items-center gap-2"><span className="flex-1"><TypeBadge t={t} /></span>
                <button type="button" disabled={busy} onClick={() => remove(t)} aria-label={`${t.name} түрін өшіру`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button></div>
              <Level value={t.importance} onPick={(v) => level(t, v)} label={`${t.name} маңыздылығы`} />
            </li>
          ))}
        </ul>
      )}
      <Card className="grid gap-3">
        <Field label="Жаңа түр">{(id) => <input id={id} value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder="Мысалы: Çalışma, Camp, KBO" />}</Field>
        <Level value={f.importance} onPick={(v) => setF({ ...f, importance: v })} label="Жаңа түрдің маңыздылығы" />
        <Button kind="secondary" loading={busy} disabled={!f.name.trim()} onClick={add}>Қосу</Button>
      </Card>
      {types.length > 0 && a.schedule === 'weekly' && !!a.weekdays?.length && (
        <Field label="Тұрақты сабақтардың түрі" hint="Апта сайынғы кестедегі сабақтар осы түрмен көрінеді">{(id, d) => <select id={id} aria-describedby={d} value={def} disabled={busy} onChange={(e) => setDefault(e.target.value)} className={inputCls}>
          <option value="">Түрсіз</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>
      )}
    </div>
  )
}
