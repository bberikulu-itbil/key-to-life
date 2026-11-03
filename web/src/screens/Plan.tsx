import { useEffect, useState } from 'react'
import { ensureCalendars, listBookings, listLeaves, listResources, loadStudentRoadmap } from '../lib/api'
import type { StudentRoadmap } from '../lib/mentor'
import { loadAgenda, onDay } from '../lib/agenda'
import { WD_SHORT, addDays, fmtDate, parse, today, weekOf } from '../lib/time'
import { useMe, isApprover } from '../App'
import { needsMyDecision } from './Activities'
import { waitsForMe } from './Leaves'
import { Button, Card, Empty, ErrorBox, Icon, Skeleton, TypeBadge, go, useLoad } from '../components/ui'
import Tasks from '../components/Tasks'
import { RoadmapBuilderSheet, RoadmapSection } from './Mentor'
import { tx } from '../lib/i18n'

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
  const isStudent = me.role === 'student'
  const leaves = useLoad(() => (staff ? listLeaves({ pending: true }) : Promise.resolve([])), [staff])
  const srm = useLoad(() => (isStudent ? loadStudentRoadmap(me.id) : Promise.resolve({ goals: [], habits: [], tasks: [] })), [me.id, isStudent])
  const [roadmap, setRoadmap] = useState<StudentRoadmap>({ goals: [], habits: [], tasks: [] })
  const [planTab, setPlanTab] = useState<'goals' | 'schedule' | 'habits' | 'all'>('goals')
  const [showBuilder, setShowBuilder] = useState(false)

  useEffect(() => {
    if (srm.data) {
      setRoadmap(srm.data)
    }
  }, [srm.data])

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

  // Find next or live item today for the quick status card in the goals view
  const ofToday = (ag.data?.items ?? []).filter((i) => onDay(i, t))
  const liveItem = ofToday.find((i) => now >= i.start && now < i.end && !i.allDay)
  const nextItem = liveItem ?? ofToday.find((i) => i.start > now && !i.allDay) ?? ofToday[0]

  const activeGoalsCount = (roadmap.goals ?? []).filter((g) => !g.done).length
  const activeHabitsCount = (roadmap.habits ?? []).filter((h) => (h.checks ?? []).includes(t)).length

  return (
    <div className="grid gap-3 pb-6">
      <header className="flex items-center gap-3 min-h-14">
        <div className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center font-bold" aria-hidden>
          {me.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{tx('Жоспар')}</h1>
          <p className="text-sm text-muted truncate">
            {tx('Сәлем, {0}! · {1}', me.full_name.split(' ')[1] ?? me.full_name, me.class ? me.class.name : me.school.name)}
          </p>
        </div>
        <a href="#/calendars" className="size-11 grid place-items-center rounded-md text-accent" aria-label={tx('Күнтізбелерім')}>
          <Icon n="clock" />
        </a>
      </header>

      {/* Staff alerts */}
      {isApprover(me) && pending > 0 && <Alert href="#/activities/review" tone="bg-warning-soft text-warning" icon="file" text={tx('{0} ұсыныс сіздің шешіміңізді күтуде', pending)} />}
      {leaveCount > 0 && <Alert href="#/leaves" tone="bg-danger-soft text-danger" icon="clock" text={tx('{0} рұқсат сұрауы шешіміңізді күтуде', leaveCount)} />}
      {(books.data ?? 0) > 0 && <Alert href="#/bookings/review" tone="bg-warning-soft text-warning" icon="grid" text={tx('{0} бронь сұрауы растауды күтуде', books.data)} />}
      {myPending > 0 && <Alert href="#/activities/mine" tone="bg-accent-soft text-accent" icon="clock" text={tx('{0} ұсынысыңыз қаралып жатыр', myPending)} />}

      {/* Оқушылар үшін негізгі бөлім ауыстырғыш (Tabs) */}
      {isStudent && (
        <div className="flex gap-1.5 p-1 bg-surface-2 rounded-xl text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setPlanTab('goals')}
            className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
              planTab === 'goals' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            <span>🎯</span>
            <span>{tx('Мақсаттар мен қадамдар')}</span>
            {(roadmap.goals ?? []).length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${planTab === 'goals' ? 'bg-accent/15 text-accent font-bold' : 'bg-surface-3 text-muted'}`}>
                {activeGoalsCount}/{roadmap.goals.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPlanTab('schedule')}
            className={`flex-1 min-w-[100px] py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
              planTab === 'schedule' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            <span>📅</span>
            <span>{tx('Күн тәртібі')}</span>
            {ofDay.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${planTab === 'schedule' ? 'bg-accent/15 text-accent font-bold' : 'bg-surface-3 text-muted'}`}>
                {ofDay.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPlanTab('habits')}
            className={`flex-1 min-w-[90px] py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
              planTab === 'habits' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            <span>🔄</span>
            <span>{tx('Әдеттер')}</span>
            {(roadmap.habits ?? []).length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] ${planTab === 'habits' ? 'bg-accent/15 text-accent font-bold' : 'bg-surface-3 text-muted'}`}>
                {activeHabitsCount}/{roadmap.habits.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPlanTab('all')}
            className={`py-2 px-3 rounded-lg flex items-center justify-center transition text-xs font-semibold ${
              planTab === 'all' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-fg'
            }`}
            title={tx('Барлығын бір бетте көру')}
          >
            {tx('Барлығы')}
          </button>
        </div>
      )}

      {/* Оқушының Мақсаттар бөліміндегі бүгінгі сабақ кестесінің қысқаша виджеті */}
      {isStudent && planTab === 'goals' && ofToday.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface shadow-card border border-[var(--card-line,transparent)] text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="size-8 rounded-lg bg-accent-soft text-accent grid place-items-center text-sm font-bold shrink-0">📅</span>
            <div className="min-w-0">
              <p className="font-semibold truncate">
                {tx('Бүгін {0} сабақ және шара бар', ofToday.length)}
              </p>
              <p className="text-muted truncate">
                {nextItem ? (
                  <>
                    {liveItem ? <span className="text-success font-semibold mr-1">● {tx('Қазір')}:</span> : <span className="mr-1">{tx('Келесі')}:</span>}
                    {liveItem ? liveItem.title : nextItem.title} ({hhmm(liveItem ? liveItem.start : nextItem.start)} – {hhmm(liveItem ? liveItem.end : nextItem.end)})
                  </>
                ) : (
                  tx('Бүгінгі сабақтар аяқталды')
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPlanTab('schedule')}
            className="text-xs text-accent font-semibold px-2 py-1 rounded-md hover:bg-accent-soft transition flex items-center gap-1 shrink-0 ml-2"
          >
            {tx('Кестені ашу')} <Icon n="chev" size={14} />
          </button>
        </div>
      )}

      {/* МАҚСАТТАР МЕН ҚАДАМДАР БӨЛІМІ (Оқушыларға арналған негізгі блок) */}
      {isStudent && (planTab === 'goals' || planTab === 'all') && (
        srm.loading && !srm.data ? (
          <Skeleton rows={3} />
        ) : (
          <RoadmapSection
            studentId={me.id}
            roadmap={roadmap}
            onUpdate={setRoadmap}
            onOpenAdd={() => setShowBuilder(true)}
            initialTab="goals"
          />
        )
      )}

      {/* КҮН ТӘРТІБІ МЕН САБАҚ КЕСТЕСІ (Мұғалімдер үшін немесе schedule/all қойындысында) */}
      {(!isStudent || planTab === 'schedule' || planTab === 'all') && (
        <>
          <Card className="p-2.5">
            <div className="flex items-center justify-between px-1.5 pb-1">
              <button type="button" onClick={() => setAnchor(addDays(anchor, -7))} aria-label={tx('Алдыңғы апта')} className="size-11 grid place-items-center"><Icon n="back" /></button>
              <span className="text-sm font-semibold">{fmtDate(week[0])} – {fmtDate(week[6])}</span>
              <button type="button" onClick={() => setAnchor(addDays(anchor, 7))} aria-label={tx('Келесі апта')} className="size-11 grid place-items-center"><Icon n="chev" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((d, i) => {
                const items = (ag.data?.items ?? []).filter((x) => onDay(x, d))
                const sel = d === day
                return (
                  <button key={d} type="button" aria-pressed={sel} onClick={() => setDay(d)} aria-label={tx('{0}, {1} жазба', fmtDate(d), items.length)}
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{day === t ? tx('Бүгін') : fmtDate(day)}</h2>
            <a href="#/calendars" className="text-sm text-accent font-semibold">{tx('Күнтізбелер')}</a>
          </div>
          {ag.loading && !ag.data ? <Skeleton rows={2} /> : ag.error ? <ErrorBox text={ag.error} retry={ag.reload} />
            : !ofDay.length ? (
              <Card><Empty icon="clock" title={tx('Бұл күні жазба жоқ')} text={tx('Бастамаға жазылсаңыз немесе жеке жоспар қоссаңыз, осында көрінеді.')}
                action={<Button kind="secondary" onClick={() => go('/calendars')}>{tx('Жоспар қосу')}</Button>} /></Card>
            ) : (
              <Card className="py-1">
                <ol>
                  {ofDay.map((i) => {
                    const live = now >= i.start && now < i.end && !i.allDay
                    const past = i.end <= now
                    const body = (
                      <span className="grid grid-cols-[52px_1fr] gap-3 py-3">
                        <span className="text-sm tabular-nums text-right pt-0.5">{i.allDay ? tx('Күні бойы') : <>{hhmm(i.start)}<br /><span className="text-muted">{hhmm(i.end)}</span></>}</span>
                        <span className="min-w-0 border-l-[3px] pl-3" style={{ borderColor: i.color }}>
                          <span className="block font-semibold break-words">{i.title}{i.stype && <span className="ml-2"><TypeBadge t={i.stype} /></span>}{live && <span className="ml-2 text-xs text-success font-semibold">{tx('Қазір')}</span>}</span>
                          {i.place && <span className="flex items-center gap-1 text-sm text-muted"><Icon n="pin" size={14} />{i.place}</span>}
                        </span>
                      </span>
                    )
                    return <li key={i.key} className={`${past ? 'opacity-60' : ''} ${i.stype?.importance === 3 ? 'bg-danger-soft -mx-4 px-4' : ''}`}>{i.link ? <a href={`#${i.link}`}>{body}</a> : body}</li>
                  })}
                </ol>
              </Card>
            )}
        </>
      )}

      {/* ӘДЕТТЕР МЕН ТАПСЫРМАЛАР (Оқушының habits қойындысында немесе all қойындысында) */}
      {isStudent && (planTab === 'habits' || planTab === 'all') && (
        <>
          <RoadmapSection
            studentId={me.id}
            roadmap={roadmap}
            onUpdate={setRoadmap}
            onOpenAdd={() => setShowBuilder(true)}
            initialTab="habits"
          />
          <Tasks me={me} />
        </>
      )}

      {/* Мұғалімдер үшін тапсырмалар */}
      {!isStudent && <Tasks me={me} />}

      {/* Бастамалар */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Менің бастамаларым')}</h2>
      <div className="grid grid-cols-3 gap-2">
        {([['#/my/olympiad', 'star', tx('Олимпиада')], ['#/my/clubs', 'users', tx('Үйірме, курс')], ['#/my/competitions', 'flag', tx('Жарыстар')]] as const).map(([href, icon, label]) => (
          <a key={href} href={href} className="grid justify-items-center gap-1.5 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] py-3 px-1 text-sm font-semibold text-center">
            <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} size={18} /></span>{label}
          </a>
        ))}
      </div>

      {/* Күрделендірілген Даму Жоспары Құру Шебері (Roadmap Builder Sheet) */}
      {showBuilder && (
        <RoadmapBuilderSheet
          student={{ id: me.id, class_id: me.class?.id ?? '', full_name: me.full_name }}
          currentRoadmap={roadmap}
          onClose={() => setShowBuilder(false)}
          onDone={(newR) => {
            setRoadmap(newR)
            setShowBuilder(false)
          }}
        />
      )}
    </div>
  )
}

const Alert = ({ href, tone, icon, text }: { href: string; tone: string; icon: string; text: string }) => (
  <a href={href} className={`flex items-center gap-3 rounded-lg p-4 ${tone}`}><Icon n={icon} /><span className="flex-1 font-semibold">{text}</span><Icon n="chev" /></a>
)
