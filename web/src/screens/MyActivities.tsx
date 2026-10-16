import { listActivities, listTopics, myAttendance, myProgress, type ActivityType } from '../lib/api'
import { myActivity } from '../lib/agenda'
import { lastDay, rate, today } from '../lib/time'
import { useMe } from '../App'
import ActivityCard from '../components/ActivityCard'
import { Button, Card, Empty, ErrorBox, PageHead, Skeleton, go, useLoad } from '../components/ui'

const KINDS: Record<string, { title: string; types: ActivityType[]; empty: string }> = {
  olympiad: { title: 'Олимпиада', types: ['olympiad_prep'], empty: 'Олимпиадаға дайындыққа жазылсаңыз, силабус пен қатысуыңыз осында көрінеді.' },
  clubs: { title: 'Үйірме, курс', types: ['club', 'course'], empty: 'Үйірмеге немесе курсқа жазылыңыз.' },
  competitions: { title: 'Жарыстар, челлендждер', types: ['competition', 'tournament', 'challenge'], empty: 'Жарыс, турнир немесе челленджге қатысыңыз — не өзіңіз ұсыныңыз.' },
}

export default function MyActivities({ kind }: { kind: string }) {
  const { me } = useMe()
  const k = KINDS[kind] ?? KINDS.clubs
  const data = useLoad(async () => {
    const acts = (await listActivities()).filter((a) => k.types.includes(a.type))
    const mine = acts.filter((a) => myActivity(me, a))
    const [att, topics, done] = await Promise.all([
      me.role === 'student' ? myAttendance(me.id) : Promise.resolve([]),
      kind === 'olympiad' && mine.length ? listTopics(mine.map((a) => a.id)) : Promise.resolve([]),
      kind === 'olympiad' && me.role === 'student' ? myProgress(me.id) : Promise.resolve([]),
    ])
    const t = today()
    const open = acts.filter((a) => !mine.includes(a) && a.status === 'approved' && lastDay(a) >= t)
    return { mine, open, att, topics, done }
  }, [kind, me.id])

  if (data.loading && !data.data) return <><PageHead title={k.title} back /><Skeleton /></>
  if (data.error || !data.data) return <><PageHead title={k.title} back /><ErrorBox text={data.error ?? ''} retry={data.reload} /></>
  const { mine, open, att, topics, done } = data.data

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={k.title} back />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{me.role === 'student' ? 'Мен қатысатындар' : 'Мен жауапты'} · {mine.length}</h2>
      {!mine.length ? <Card><Empty title="Әзірге жоқ" text={k.empty} /></Card> : mine.map((a) => {
        const pct = rate(att.filter((r) => r.activity_id === a.id).map((r) => r.status))
        const tp = topics.filter((x) => x.activity_id === a.id)
        const dn = tp.filter((x) => done.includes(x.id)).length
        return (
          <div key={a.id} className="grid gap-1">
            <ActivityCard a={a} />
            {(me.role === 'student' || tp.length > 0) && (
              <div className="grid grid-cols-2 gap-2">
                {me.role === 'student' && <Card className="py-3"><p className="text-xl font-bold tabular-nums">{pct === null ? '—' : `${pct}%`}</p><p className="text-xs text-muted">Қатысу</p></Card>}
                {tp.length > 0 && <Card className="py-3"><p className="text-xl font-bold tabular-nums">{me.role === 'student' ? `${dn}/${tp.length}` : tp.length}</p><p className="text-xs text-muted">Силабус тақырыбы</p>
                  {me.role === 'student' && <div className="h-1 mt-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent" style={{ width: `${(100 * dn) / tp.length}%` }} /></div>}</Card>}
              </div>
            )}
          </div>
        )
      })}
      {open.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-3">Жазылуға ашық · {open.length}</h2>
          {open.map((a) => <ActivityCard key={a.id} a={a} />)}
        </>
      )}
      <Button kind="secondary" onClick={() => go('/a/new')}>Жаңасын ұсыну</Button>
    </div>
  )
}
