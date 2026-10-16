import { useMemo, useState } from 'react'
import { listActivities, type Activity, type ActivityType, type Me } from '../lib/api'
import { TYPE_LABEL, lastDay, nextSession, today } from '../lib/time'
import { useMe, isApprover } from '../App'
import ActivityCard from '../components/ActivityCard'
import Stories, { storyCandidates } from '../components/Stories'
import { Button, Chips, Empty, ErrorBox, Icon, PageHead, Skeleton, go, inputCls, useLoad } from '../components/ui'

type Tab = 'all' | 'mine' | 'review'

/** Activities waiting for *this* person's decision. */
export const needsMyDecision = (me: Me, a: Activity) =>
  me.role === 'deputy' || me.role === 'admin'
    ? a.status === 'pending_deputy' || a.status === 'pending_class_teacher'
    : a.status === 'pending_class_teacher' && a.author.class?.teacher_id === me.id

export default function Activities({ tab, feed, embedded }: { tab: Tab; feed?: boolean; embedded?: boolean }) {
  const { me } = useMe()
  const { data, error, loading, reload } = useLoad(listActivities, [])
  const [type, setType] = useState<'all' | ActivityType>('all')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const all = data ?? []
    const t = today()
    let l =
      tab === 'review' ? all.filter((a) => needsMyDecision(me, a))
      : tab === 'mine' ? all.filter((a) => a.author_id === me.id || a.supervisor_id === me.id || a.enrollments.some((e) => e.student_id === me.id))
      : all.filter((a) => a.status === 'approved' && !a.archived_at && lastDay(a) >= t)
          .map((a) => [a, nextSession(a, t, 120) ?? '9999'] as const).sort((x, y) => x[1].localeCompare(y[1])).map(([a]) => a)
    if (type !== 'all') l = l.filter((a) => a.type === type)
    if (q.trim()) l = l.filter((a) => (a.title + a.place + a.supervisor.full_name).toLowerCase().includes(q.trim().toLowerCase()))
    return l
  }, [data, tab, type, q, me])

  const reviewCount = (data ?? []).filter((a) => needsMyDecision(me, a)).length
  const tabs: [Tab, string][] = [['mine', 'Менікі'], ...(isApprover(me) ? [['review', `Растау${reviewCount ? ` · ${reviewCount}` : ''}`] as [Tab, string]] : [])]

  return (
    <div className="grid gap-3 pb-4">
      {!embedded && <PageHead title={feed ? 'Лента' : tab === 'review' ? 'Растау күтуде' : 'Менің іс-шараларым'} back={!feed} right={<Button kind="secondary" onClick={() => go('/a/new')}>Ұсыну</Button>} />}
      {!feed && <div role="tablist" aria-label="Тізім" className="grid grid-flow-col auto-cols-fr bg-surface-2 rounded-md p-1 gap-1">
        {tabs.map(([k, label]) => (
          <a key={k} role="tab" aria-selected={tab === k} href={`#/activities/${k}`}
            className={`h-10 rounded-sm grid place-items-center text-sm font-semibold ${tab === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</a>
        ))}
      </div>}
      {tab === 'all' && !embedded && data && <Stories me={me} items={storyCandidates(me, data)} onJoined={reload} />}
      {tab !== 'review' && (
        <>
          <label className="relative">
            <span className="sr-only">Іздеу</span>
            <Icon n="search" className="absolute left-3 top-3.5 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Атауы, орны немесе мұғалім" className={`${inputCls} pl-10`} />
          </label>
          <Chips label="Түрі" value={type} onChange={setType} items={[['all', 'Барлығы'], ...(Object.entries(TYPE_LABEL) as [ActivityType, string][])]} />
        </>
      )}
      {loading && !data ? <Skeleton /> : error ? <ErrorBox text={error} retry={reload} />
        : list.length === 0 ? (
          tab === 'review' ? <Empty icon="check" title="Растайтын өтініш жоқ" text="Жаңа ұсыныс түскенде осында және хабарламада көресіз." />
          : tab === 'mine' ? <Empty title="Әзірге бос" text="Жазылған, ұсынған немесе жауапты болған іс-шараларыңыз осында шығады." action={<Button kind="secondary" onClick={() => go('/')}>Барлығын қарау</Button>} />
          : <Empty title={q || type !== 'all' ? 'Ештеңе табылмады' : 'Әзірге іс-шара жоқ'} text="Өз идеяңыз бар ма? Ұсыныңыз — растаған соң барлығына көрінеді." action={<Button onClick={() => go('/a/new')}>Іс-шара ұсыну</Button>} />
        ) : (
          <div className="grid gap-3">{list.map((a) => <ActivityCard key={a.id} a={a} showStatus={tab !== 'all'} />)}</div>
        )}
    </div>
  )
}
