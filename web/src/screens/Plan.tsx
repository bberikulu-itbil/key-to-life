import { useEffect, useState } from 'react'
import { ensureCalendars, listBookings, listLeaves, listResources } from '../lib/api'
import { loadAgenda, onDay } from '../lib/agenda'
import { WD_SHORT, addDays, fmtDate, parse, today, weekOf } from '../lib/time'
import { useMe, isApprover } from '../App'
import { needsMyDecision } from './Activities'
import { waitsForMe } from './Leaves'
import { Button, Card, Empty, ErrorBox, Icon, Skeleton, TypeBadge, go, useLoad } from '../components/ui'
import Tasks from '../components/Tasks'

const hhmm = (d: Date) => d.toTimeString().slice(0, 5)

export default function Plan() {
  const { me } = useMe()
  const t = today()
  const [day, setDay] = useState(t)
  const [anchor, setAnchor] = useState(t)
  const week = weekOf(anchor)
  useEffect(() => { ensureCalendars().catch(() => {}) }, [])
  const ag = useLoad(() => loadAgenda(me, week[0], week[6]), [me.id, week[0]])
  const staff = me.role !== 'student'
  const leaves = useLoad(() => (staff ? listLeaves({ pending: true }) : Promise.resolve([])), [staff])
  const books = useLoad(async () => {
    if (!staff) return 0
    const [res, bs] = await Promise.all([listResources(), listBookings({ from: t })])
    const mine = new Set(res.filter((r) => r.manager_id === me.id || me.role === 'deputy' || me.role === 'admin').map((r) => r.id))
    return bs.filter((b) => b.status === 'pending' && mine.has(b.resource_id)).length
  }, [staff, t])

  const acts = ag.data?.activities ?? []
  const pending = acts.filter((a) => needsMyDecision(me, a)).length
  const myPending = acts.filter((a) => a.author_id === me.id && a.status.startsWith('pending')).length
  const leaveCount = (leaves.data ?? []).filter((l) => waitsForMe(me, l)).length
  const ofDay = (ag.data?.items ?? []).filter((i) => onDay(i, day))
  const now = new Date()

  return (
    <div className="grid gap-3 pb-4">
      <header className="flex items-center gap-3 min-h-14">
        <div className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center font-bold" aria-hidden>{me.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">Жоспар</h1>
          <p className="text-sm text-muted truncate">Сәлем, {me.full_name.split(' ')[1] ?? me.full_name}! · {me.class ? me.class.name : me.school.name}</p>
        </div>
        <a href="#/calendars" className="size-11 grid place-items-center rounded-md text-accent" aria-label="Күнтізбелерім"><Icon n="clock" /></a>
      </header>

      {isApprover(me) && pending > 0 && <Alert href="#/activities/review" tone="bg-warning-soft text-warning" icon="file" text={`${pending} ұсыныс сіздің шешіміңізді күтуде`} />}
      {leaveCount > 0 && <Alert href="#/leaves" tone="bg-danger-soft text-danger" icon="clock" text={`${leaveCount} рұқсат сұрауы шешіміңізді күтуде`} />}
      {(books.data ?? 0) > 0 && <Alert href="#/bookings/review" tone="bg-warning-soft text-warning" icon="grid" text={`${books.data} бронь сұрауы растауды күтуде`} />}
      {myPending > 0 && <Alert href="#/activities/mine" tone="bg-accent-soft text-accent" icon="clock" text={`${myPending} ұсынысыңыз қаралып жатыр`} />}

      <Card className="p-2.5">
        <div className="flex items-center justify-between px-1.5 pb-1">
          <button type="button" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Алдыңғы апта" className="size-11 grid place-items-center"><Icon n="back" /></button>
          <span className="text-sm font-semibold">{fmtDate(week[0])} – {fmtDate(week[6])}</span>
          <button type="button" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Келесі апта" className="size-11 grid place-items-center"><Icon n="chev" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map((d, i) => {
            const items = (ag.data?.items ?? []).filter((x) => onDay(x, d))
            const sel = d === day
            return (
              <button key={d} type="button" aria-pressed={sel} onClick={() => setDay(d)} aria-label={`${fmtDate(d)}, ${items.length} жазба`}
                className={`grid justify-items-center gap-0.5 rounded-md py-1.5 ${sel ? 'bg-accent text-on-accent' : d === t ? 'text-accent' : ''} ${items.some((x) => x.stype?.importance === 3) ? 'ring-2 ring-danger' : ''}`}>
                <span className={`text-xs ${sel ? '' : 'text-muted'}`}>{WD_SHORT[i]}</span>
                <span className="text-lg font-semibold tabular-nums">{parse(d).getDate()}</span>
                <span className="flex gap-0.5 h-1.5">{[...new Set(items.map((x) => x.color))].slice(0, 3).map((c) => <span key={c} className="size-1.5 rounded-full" style={{ background: sel ? 'var(--on-accent)' : c }} />)}</span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="flex items-baseline justify-between mt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{day === t ? 'Бүгін' : fmtDate(day)}</h2>
        <a href="#/calendars" className="text-sm text-accent font-semibold">Күнтізбелер</a>
      </div>
      {ag.loading && !ag.data ? <Skeleton rows={2} /> : ag.error ? <ErrorBox text={ag.error} retry={ag.reload} />
        : !ofDay.length ? (
          <Card><Empty icon="clock" title="Бұл күні жазба жоқ" text="Іс-шараға жазылсаңыз немесе жеке жоспар қоссаңыз, осында көрінеді."
            action={<Button kind="secondary" onClick={() => go('/calendars')}>Жоспар қосу</Button>} /></Card>
        ) : (
          <Card className="py-1">
            <ol>
              {ofDay.map((i) => {
                const live = now >= i.start && now < i.end && !i.allDay
                const past = i.end <= now
                const body = (
                  <span className="grid grid-cols-[52px_1fr] gap-3 py-3">
                    <span className="text-sm tabular-nums text-right pt-0.5">{i.allDay ? 'Күні бойы' : <>{hhmm(i.start)}<br /><span className="text-muted">{hhmm(i.end)}</span></>}</span>
                    <span className="min-w-0 border-l-[3px] pl-3" style={{ borderColor: i.color }}>
                      <span className="block font-semibold break-words">{i.title}{i.stype && <span className="ml-2"><TypeBadge t={i.stype} /></span>}{live && <span className="ml-2 text-xs text-success font-semibold">Қазір</span>}</span>
                      {i.place && <span className="flex items-center gap-1 text-sm text-muted"><Icon n="pin" size={14} />{i.place}</span>}
                    </span>
                  </span>
                )
                return <li key={i.key} className={`${past ? 'opacity-60' : ''} ${i.stype?.importance === 3 ? 'bg-danger-soft -mx-4 px-4' : ''}`}>{i.link ? <a href={`#${i.link}`}>{body}</a> : body}</li>
              })}
            </ol>
          </Card>
        )}

      <Tasks me={me} />

      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Менің іс-шараларым</h2>
      <div className="grid grid-cols-3 gap-2">
        {([['#/my/olympiad', 'star', 'Олимпиада'], ['#/my/clubs', 'users', 'Үйірме, курс'], ['#/my/competitions', 'flag', 'Жарыстар']] as const).map(([href, icon, label]) => (
          <a key={href} href={href} className="grid justify-items-center gap-1.5 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] py-3 px-1 text-sm font-semibold text-center">
            <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} size={18} /></span>{label}
          </a>
        ))}
      </div>
    </div>
  )
}

const Alert = ({ href, tone, icon, text }: { href: string; tone: string; icon: string; text: string }) => (
  <a href={href} className={`flex items-center gap-3 rounded-lg p-4 ${tone}`}><Icon n={icon} /><span className="flex-1 font-semibold">{text}</span><Icon n="chev" /></a>
)
