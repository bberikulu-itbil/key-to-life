import { useState, type ReactNode } from 'react'
import { errText, getMenuCycle, listBreaks, listClasses, listDuty, listMenu, listMenuDuty, listPeople, menuImageUrl, listTasks, saveMenu, setMenuDuty, uploadMenuPhoto, type Me, type Meal, type MenuFix } from '../lib/api'
import { loadAgenda } from '../lib/agenda'
import { WD_SHORT, addDays, cycleCode, fmtDate, inBreak, isoDow, today } from '../lib/time'
import { Button, Card, Chips, Field, Icon, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

const hhmm = (d: Date) => d.toTimeString().slice(0, 5)
const Head = ({ icon, title, href, action }: { icon: string; title: string; href?: string; action?: ReactNode }) => (
  <div className="flex items-center gap-2">
    <span className="size-8 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} size={18} /></span>
    <h2 className="flex-1 font-bold">{title}</h2>
    {action}
    {href && <a href={href} className="text-sm text-accent font-semibold min-h-11 grid place-items-center px-1">{tx('Барлығы')}</a>}
  </div>
)

/* ---------- today: one compact row of the day's next items, tasks due soon and today's duty ---------- */
const Chip = ({ href, top, title, sub, color, tone = '' }: { href: string; top: ReactNode; title: string; sub?: string | null; color?: string; tone?: string }) => (
  <a href={href} className="shrink-0 w-40 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-3 py-2 grid gap-0.5"
    style={color ? { borderLeft: `3px solid ${color}` } : undefined}>
    <span className={`text-xs font-semibold tabular-nums ${tone || 'text-muted'}`}>{top}</span>
    <span className="text-sm font-semibold truncate">{title}</span>
    {sub && <span className="text-xs text-muted truncate">{sub}</span>}
  </a>
)

export function TodayCard({ me }: { me: Me }) {
  const t = today()
  const wd = isoDow(t)
  const data = useLoad(async () => {
    const [ag, tasks, roster, classes] = await Promise.all([loadAgenda(me, t, t), listTasks(), listDuty().catch(() => []), listClasses().catch(() => [])])
    const now = new Date()
    const next = ag.items.filter((i) => !i.allDay && i.end > now).slice(0, 4)
    const soon = tasks.filter((x) => !(x.author_id === me.id && (x.class_id || x.activity_id || x.assignee_id)) && !x.done.some((d) => d.user_id === me.id)
      && (!x.due_on || x.due_on <= addDays(t, 2))).slice(0, 3)
    const duty = classes.find((c) => c.id === roster.find((r) => r.weekday === wd)?.class_id)?.name
    return { next, soon, duty }
  }, [me.id, t])
  const d = data.data
  if (!d) return <Skeleton rows={1} />
  const empty = !d.next.length && !d.soon.length && !d.duty
  return (
    <section aria-label={tx('Бүгін · {0}', fmtDate(t))} className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-muted">{tx('Бүгін · {0}', fmtDate(t))}</h2>
        <a href="#/plan" className="text-sm text-accent font-semibold">{tx('Жоспар')}</a>
      </div>
      {empty ? <p className="text-sm text-muted">{tx('Бүгінге жоспар бос.')}</p> : (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
          {d.next.map((i) => {
            const live = new Date() >= i.start
            return <Chip key={i.key} href={i.link ? `#${i.link}` : '#/plan'} color={i.color} top={live ? tx('Қазір') : hhmm(i.start)} tone={live ? 'text-success' : ''} title={i.title} sub={i.place} />
          })}
          {d.soon.map((x) => <Chip key={x.id} href="#/plan" top={x.due_on ? (x.due_on < t ? tx('Өтті') : x.due_on === t ? tx('Бүгін') : fmtDate(x.due_on)) : tx('Тапсырма')}
            tone={x.due_on && x.due_on < t ? 'text-danger' : 'text-warning'} title={x.title} sub={tx('Тапсырма')} />)}
          {d.duty && <Chip href="#/duty" top={tx('Кезекші сынып')} title={d.duty} sub={tx('Бүгінгі кезекшілер')} />}
        </div>
      )}
    </section>
  )
}

/* ---------- canteen menu ---------- */
// meal, label, served until (for "now"), cell in the cycle composite picture (1080×1440, 4 photos of 488×380)
const MEALS: [Meal, string, string, number | null][] = [
  ['breakfast', tx('Таңғы ас'), '09:00', null], ['brunch', tx('Таңнан кейін'), '11:30', 0], ['lunch', tx('Түскі ас'), '15:00', 1],
  ['snack', tx('Түстен кейін'), '17:00', null], ['dinner', tx('Кешкі ас'), '20:00', 2], ['supper', tx('Кешкіден кейін'), '24:00', 3]]
const CELL_POS = ['6.757% 22.64%', '93.24% 22.64%', '6.757% 74.91%', '93.24% 74.91%']
const isStaff = (me: Me) => me.role !== 'student'

/** One photo cut out of the day's composite picture. */
const CyclePhoto = ({ image, cell }: { image: string; cell: number }) => (
  <span role="img" aria-hidden className="block w-full aspect-[488/380] rounded-sm bg-surface-2 bg-no-repeat"
    style={{ backgroundImage: `url(${menuImageUrl(image)})`, backgroundSize: '221.31% auto', backgroundPosition: CELL_POS[cell] }} />
)

export function MenuCard({ me }: { me: Me }) {
  const [day, setDay] = useState(today())
  const menu = useLoad(() => listMenu(day), [day])
  const cycle = useLoad(() => Promise.all([getMenuCycle(), listBreaks(), listMenuDuty()]), [])
  const [editing, setEditing] = useState<Meal | null>(null)
  const [duty, setDuty] = useState(false)
  const [cyc, breaks, duties] = cycle.data ?? [null, [], []]
  const code = cyc?.weekA && !inBreak(day, breaks) ? cycleCode(day, cyc.weekA) : null
  const planned = code ? cyc?.days.find((d) => d.day_code === code) : undefined
  const fixes = Object.fromEntries((menu.data ?? []).map((m) => [m.meal, m])) as Partial<Record<Meal, MenuFix>>
  // staff any day; the day's duty students only today (the database checks the same)
  const canEdit = isStaff(me) || (day === today() && duties.some((d) => d.weekday === isoDow(day) && d.students.includes(me.id)))
  const nowHm = new Date().toTimeString().slice(0, 5)
  const shown = MEALS.filter(([m]) => fixes[m]?.items || fixes[m]?.photo || planned?.items[m])
  const current = day === today() ? shown.find(([, , until]) => nowHm < until)?.[0] : undefined
  return (
    <Card className="grid gap-3">
      <Head icon="list" title={tx('Асхана мәзірі')} action={me.role === 'deputy' || me.role === 'admin'
        ? <Button kind="ghost" onClick={() => setDuty(true)}>{tx('Кезекшілер')}</Button> : undefined} />
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setDay(addDays(day, -1))} aria-label={tx('Алдыңғы күн')} className="size-11 grid place-items-center"><Icon n="back" /></button>
        <span className="flex-1 text-center text-sm font-semibold">{day === today() ? tx('Бүгін') : day === addDays(today(), 1) ? tx('Ертең') : fmtDate(day)}</span>
        <button type="button" onClick={() => setDay(addDays(day, 1))} aria-label={tx('Келесі күн')} className="size-11 grid place-items-center"><Icon n="chev" /></button>
      </div>
      {(menu.loading && !menu.data) || (cycle.loading && !cycle.data) ? <Skeleton rows={2} /> : !shown.length ? (
        <p className="text-sm text-muted">{tx('Бұл күнге мәзір әлі енгізілмеген.')}</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map(([m, label, , cell]) => {
            const fix = fixes[m]
            const text = fix?.items || planned?.items[m] || '—'
            const body = (
              <>
                <span className="w-24 shrink-0">
                  {fix?.photo ? <img src={menuImageUrl(fix.photo)} alt="" loading="lazy" className="w-full aspect-[488/380] rounded-sm object-cover bg-surface-2" />
                    : cell !== null && planned?.image ? <CyclePhoto image={planned.image} cell={cell} />
                    : <span className="grid w-full aspect-[488/380] place-items-center rounded-sm bg-surface text-muted"><Icon n="list" size={18} /></span>}
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-xs font-semibold text-muted">{label}{current === m ? tx(' · қазір') : ''}{fix ? tx(' · түзетілді') : ''}</span>
                  <span className="block whitespace-pre-line text-[15px] leading-snug">{text}</span>
                </span>
                {canEdit && <Icon n="chev" size={16} className="text-muted shrink-0 self-center" />}
              </>
            )
            const cls = `flex gap-3 rounded-md p-2 w-full ${current === m ? 'bg-accent-soft' : 'bg-surface-2'}`
            return <li key={m}>{canEdit
              ? <button type="button" onClick={() => setEditing(m)} aria-label={tx('{0}: түзету', label)} className={cls}>{body}</button>
              : <div className={cls}>{body}</div>}</li>
          })}
        </ul>
      )}
      {!fixesAny(fixes) && planned && <p className="text-xs text-muted">{tx('Болжамды мәзір: асхана 10 күндік циклмен қайталайды. Тамақ басқа болса, кезекші оқушылар түзетеді.')}</p>}
      {editing && <Sheet title={`${MEALS.find(([m]) => m === editing)![1]} · ${fmtDate(day)}`} onClose={() => setEditing(null)}>
        <MealEdit day={day} meal={editing} fix={fixes[editing]} planned={planned?.items[editing] ?? ''} onDone={() => { setEditing(null); menu.reload() }} />
      </Sheet>}
      {duty && <Sheet title={tx('Мәзір кезекшілері')} onClose={() => setDuty(false)}><MenuDutyEdit duties={duties} onDone={() => { setDuty(false); cycle.reload() }} /></Sheet>}
    </Card>
  )
}
const fixesAny = (f: Partial<Record<Meal, MenuFix>>) => Object.keys(f).length > 0

function MealEdit({ day, meal, fix, planned, onDone }: { day: string; meal: Meal; fix?: MenuFix; planned: string; onDone: () => void }) {
  const [text, setText] = useState(fix?.items || planned)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); toast(tx('Мәзір сақталды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  // unchanged text is stored empty, so the cycle text keeps showing
  const save = () => run(async () => saveMenu(day, meal, text.trim() === planned.trim() ? '' : text, file ? await uploadMenuPhoto(day, file) : fix?.photo ?? null))
  return (
    <div className="grid gap-4">
      <Field label={tx('Тағамдар')} hint={tx('Асханада берілгені кестедегіден басқа болса, түзетіңіз')}>{(id, d) => (
        <textarea id={id} aria-describedby={d} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} className={`${inputCls} h-24 py-2`} />)}</Field>
      <Field label={tx('Фото')} hint={tx('Міндетті емес')}>{(id, d) => (
        <input id={id} aria-describedby={d} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />)}</Field>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {fix && <Button block kind="ghost" disabled={busy} onClick={() => run(() => saveMenu(day, meal, '', null))}>{tx('Кестедегіге қайтару')}</Button>}
    </div>
  )
}

/** Deputy or admin: up to 5 students a weekday who correct that day's menu. */
function MenuDutyEdit({ duties, onDone }: { duties: { weekday: number; students: string[] }[]; onDone: () => void }) {
  const people = useLoad(listPeople, [])
  const [wd, setWd] = useState(String(Math.min(isoDow(today()), 6)))
  const [sel, setSel] = useState<Record<string, string[]>>(() => Object.fromEntries(duties.map((d) => [String(d.weekday), d.students])))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const cur = sel[wd] ?? []
  const toggle = (id: string) => cur.includes(id) ? setSel({ ...sel, [wd]: cur.filter((x) => x !== id) })
    : cur.length >= 5 ? toast(tx('Бір күнге 5 оқушыдан артық емес')) : setSel({ ...sel, [wd]: [...cur, id] })
  const students = (people.data ?? []).filter((p) => p.role === 'student')
  const list = students.filter((p) => cur.includes(p.id) || (q.trim().length > 1 && p.full_name.toLowerCase().includes(q.trim().toLowerCase())))
  const save = async () => {
    setBusy(true)
    try { await Promise.all(Object.entries(sel).map(([w, ids]) => setMenuDuty(Number(w), ids))); toast(tx('Сақталды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Chips label={tx('Апта күні')} value={wd} onChange={setWd} items={WD_SHORT.slice(0, 6).map((l, i) => [String(i + 1), `${l}${sel[String(i + 1)]?.length ? ` · ${sel[String(i + 1)].length}` : ''}`])} />
      <p className="text-xs text-muted">{tx('Кезекші оқушы тек өз күнінде, сол күннің мәзірін түзете алады.')}</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={tx('Оқушыны іздеу')} placeholder={tx('Оқушыны іздеу')} className={inputCls} />
      {people.loading ? <Skeleton rows={1} /> : (
        <div className="max-h-64 overflow-y-auto rounded-md border border-line divide-y divide-line">
          {list.map((p) => (
            <label key={p.id} className="flex items-center gap-3 min-h-11 px-3">
              <input type="checkbox" checked={cur.includes(p.id)} onChange={() => toggle(p.id)} className="size-5 accent-[var(--accent)]" />
              <span className="flex-1 min-w-0 truncate">{p.full_name}</span>
              {p.class && <span className="text-xs text-muted">{p.class.name}</span>}
            </label>
          ))}
          {!list.length && <p className="px-3 py-2 text-sm text-muted">{tx('Атын жазып іздеңіз')}</p>}
        </div>
      )}
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
    </div>
  )
}
