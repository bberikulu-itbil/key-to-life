import { Fragment, useState, type ReactNode } from 'react'
import { errText, getMenuCycle, listBreaks, listClasses, listDuty, listMenu, listStaff, menuImageUrl, listTasks, listTeacherDuty, saveMenu, type Me, type Meal } from '../lib/api'
import { loadAgenda } from '../lib/agenda'
import { addDays, cycleCode, fmtDate, inBreak, isoDow, today } from '../lib/time'
import { Button, Card, Field, Icon, Sheet, Skeleton, TypeBadge, inputCls, toast, useLoad } from './ui'
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

/* ---------- today: next items of the day + tasks due soon ---------- */
export function TodayCard({ me }: { me: Me }) {
  const t = today()
  const data = useLoad(async () => {
    const [ag, tasks] = await Promise.all([loadAgenda(me, t, t), listTasks()])
    const now = new Date()
    const next = ag.items.filter((i) => !i.allDay && i.end > now).slice(0, 3)
    const soon = tasks.filter((x) => !(x.author_id === me.id && (x.class_id || x.activity_id || x.assignee_id)) && !x.done.some((d) => d.user_id === me.id)
      && (!x.due_on || x.due_on <= addDays(t, 2))).slice(0, 3)
    return { next, soon }
  }, [me.id, t])
  const d = data.data
  return (
    <Card className="grid gap-3">
      <Head icon="clock" title={tx('Бүгін · {0}', fmtDate(t))} href="#/plan" />
      {!d ? <Skeleton rows={1} /> : !d.next.length && !d.soon.length ? <p className="text-sm text-muted">{tx('Бүгінге жоспар бос. Тапсырма немесе жоспар қосу — Жоспар бетінде.')}</p> : (
        <ul className="grid gap-1.5">
          {d.next.map((i) => {
            const live = new Date() >= i.start
            return (
              <li key={i.key}><a href={i.link ? `#${i.link}` : '#/plan'} className="flex items-center gap-3 min-h-11">
                <span className={`w-12 text-sm tabular-nums font-semibold ${live ? 'text-success' : ''}`}>{live ? tx('Қазір') : hhmm(i.start)}</span>
                <span className="w-1 self-stretch rounded-full" style={{ background: i.color }} />
                <span className="flex-1 min-w-0"><span className="block truncate font-medium">{i.title}</span>{i.place && <span className="block text-xs text-muted truncate">{i.place}</span>}</span>
                {i.stype && <TypeBadge t={i.stype} />}
              </a></li>
            )
          })}
          {d.soon.map((x) => (
            <li key={x.id}><a href="#/plan" className="flex items-center gap-3 min-h-11">
              <span className={`w-12 text-xs font-semibold ${x.due_on && x.due_on < t ? 'text-danger' : 'text-warning'}`}>{x.due_on ? (x.due_on < t ? tx('Өтті') : x.due_on === t ? tx('Бүгін') : fmtDate(x.due_on)) : tx('Тапсырма')}</span>
              <Icon n="check" size={16} className="text-muted" />
              <span className="flex-1 min-w-0 truncate">{x.title}</span>
            </a></li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ---------- canteen menu ---------- */
const MEALS: [Meal, string, string][] = [['breakfast', tx('Таңғы ас'), '10:00'], ['lunch', tx('Түскі ас'), '15:00'], ['snack', tx('Бесін ас'), '17:30'], ['dinner', tx('Кешкі ас'), '24:00']]

export function MenuCard({ me }: { me: Me }) {
  const [day, setDay] = useState(today())
  const menu = useLoad(() => listMenu(day), [day])
  const cycle = useLoad(() => Promise.all([getMenuCycle(), listBreaks()]), [])
  const [editing, setEditing] = useState(false)
  // no menu typed in for the day: the picture of that day in the canteen's 10-day cycle (not in breaks)
  const [cyc, breaks] = cycle.data ?? [null, []]
  const code = cyc?.weekA && !inBreak(day, breaks) ? cycleCode(day, cyc.weekA) : null
  const planned = code ? cyc?.days.find((d) => d.day_code === code && d.image) : undefined
  const items = Object.fromEntries((menu.data ?? []).map((m) => [m.meal, m.items])) as Partial<Record<Meal, string>>
  const shown = MEALS.filter(([m]) => m !== 'snack' || items.snack)
  const nowHm = new Date().toTimeString().slice(0, 5)
  const current = day === today() ? MEALS.find(([m, , until]) => items[m] && nowHm < until)?.[0] : undefined
  return (
    <Card className="grid gap-3">
      <Head icon="list" title={tx('Асхана мәзірі')} action={me.role !== 'student' ? <Button kind="ghost" onClick={() => setEditing(true)}>{tx('Өзгерту')}</Button> : undefined} />
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setDay(addDays(day, -1))} aria-label={tx('Алдыңғы күн')} className="size-11 grid place-items-center"><Icon n="back" /></button>
        <span className="flex-1 text-center text-sm font-semibold">{day === today() ? tx('Бүгін') : day === addDays(today(), 1) ? tx('Ертең') : fmtDate(day)}</span>
        <button type="button" onClick={() => setDay(addDays(day, 1))} aria-label={tx('Келесі күн')} className="size-11 grid place-items-center"><Icon n="chev" /></button>
      </div>
      {menu.loading && !menu.data ? <Skeleton rows={1} /> : !menu.data?.length ? (planned ? (
        <figure className="grid gap-1.5">
          <img src={menuImageUrl(planned.image!)} alt={tx('{0} — ас мәзірі', planned.title)} loading="lazy" className="w-full rounded-md border border-line bg-surface-2" />
          <figcaption className="text-xs text-muted">{tx('Болжамды мәзір: асхана 10 күндік циклмен қайталайды, кейде бір-екі тағам ауысады.')}</figcaption>
        </figure>
      ) : <p className="text-sm text-muted">{tx('Бұл күнге мәзір әлі енгізілмеген.')}</p>) : (
        <div className="grid gap-2">
          {shown.map(([m, label]) => (
            <div key={m} className={`rounded-md px-3 py-2 ${current === m ? 'bg-accent-soft' : 'bg-surface-2'}`}>
              <p className="text-xs font-semibold text-muted">{label}{current === m ? tx(' · қазір') : ''}</p>
              <p className="whitespace-pre-line">{items[m] ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
      {editing && <Sheet title={tx('Мәзір · {0}', fmtDate(day))} onClose={() => setEditing(false)}><MenuEdit day={day} items={items} onDone={() => { setEditing(false); menu.reload() }} /></Sheet>}
    </Card>
  )
}

function MenuEdit({ day, items, onDone }: { day: string; items: Partial<Record<Meal, string>>; onDone: () => void }) {
  const [f, setF] = useState<Partial<Record<Meal, string>>>(items)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await Promise.all(MEALS.filter(([m]) => (f[m] ?? '') !== (items[m] ?? '')).map(([m]) => saveMenu(day, m, f[m] ?? ''))); toast(tx('Мәзір сақталды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      {MEALS.map(([m, label]) => (
        <Field key={m} label={label} hint={m === 'snack' ? tx('Міндетті емес') : undefined}>{(id, d) => <textarea id={id} aria-describedby={d} value={f[m] ?? ''} onChange={(e) => setF({ ...f, [m]: e.target.value })}
          className={`${inputCls} h-20 py-2`} placeholder={tx('Әр тағамды жаңа жолдан')} />}</Field>
      ))}
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
    </div>
  )
}

/* ---------- today's duty ---------- */
export function DutyCard() {
  const wd = isoDow(today())
  const d = useLoad(async () => {
    const [roster, posts, staff, classes] = await Promise.all([listDuty(), listTeacherDuty(), listStaff(), listClasses()])
    const r = roster.find((x) => x.weekday === wd)
    return { deputy: staff.find((s) => s.id === r?.deputy_id)?.full_name, cls: classes.find((c) => c.id === r?.class_id)?.name, posts: posts.filter((p) => p.weekday === wd) }
  }, [wd])
  if (d.loading && !d.data) return null
  const v = d.data
  if (!v || (!v.deputy && !v.cls && !v.posts.length)) return null
  return (
    <Card className="grid gap-2">
      <Head icon="users" title={tx('Бүгінгі кезекшілер')} href="#/duty" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {v.deputy && <><dt className="text-muted">{tx('Орынбасар')}</dt><dd className="font-medium">{v.deputy}</dd></>}
        {v.cls && <><dt className="text-muted">{tx('Сынып')}</dt><dd className="font-medium">{v.cls}</dd></>}
        {v.posts.slice(0, 4).map((p) => <Fragment key={p.id}><dt className="text-muted">{p.post}</dt><dd className="font-medium">{p.user.full_name}</dd></Fragment>)}
      </dl>
    </Card>
  )
}
