import { useMemo, useState, type ReactNode } from 'react'
import { errText, listActivities, listGroups, listPeople, listPosts, listResources, openDirect } from '../lib/api'
import { TYPE_LABEL, scheduleLabel } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Card, Empty, Icon, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

const ROLE: Record<string, string> = { student: tx('Оқушы'), teacher: tx('Мұғалім'), class_teacher: tx('Сынып жетекшісі'), deputy: tx('Орынбасар'), admin: tx('Әкімші') }

/** One field over activities, people, rooms and lost & found. Everything is loaded once and filtered here. */
export default function Search() {
  const { me } = useMe()
  // shortcut: client-side filter over at most a few hundred rows per kind; move to a search RPC when a school passes ~2000 people
  const data = useLoad(async () => {
    const [acts, people, rooms, groups, posts] = await Promise.all([listActivities(), listPeople(), listResources(), listGroups(), listPosts()])
    return { acts: acts.filter((a) => a.status === 'approved' && !a.class_plan), people: people.filter((p) => p.id !== me.id), rooms: rooms.filter((r) => r.active), groups, lost: posts.filter((p) => p.kind === 'lost' || p.kind === 'found') }
  }, [me.id])
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const has = (...xs: (string | null | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(term))
  const r = useMemo(() => {
    const d = data.data
    if (!d || term.length < 2) return null
    const group = (id: string) => d.groups.find((g) => g.id === id)?.name
    return {
      acts: d.acts.filter((a) => has(a.title, a.place, a.supervisor.full_name, TYPE_LABEL[a.type])).slice(0, 8),
      people: d.people.filter((p) => has(p.full_name, p.class?.name)).slice(0, 8),
      rooms: d.rooms.filter((x) => has(x.name, group(x.group_id))).slice(0, 8).map((x) => ({ ...x, group: group(x.group_id) })),
      lost: d.lost.filter((p) => has(p.title, p.body, p.place)).slice(0, 6),
    }
  }, [data.data, term])   // eslint-disable-line react-hooks/exhaustive-deps
  const total = r ? r.acts.length + r.people.length + r.rooms.length + r.lost.length : 0
  const dm = async (id: string) => { try { go(`/c/${await openDirect(id)}`) } catch (e) { toast(errText(e)) } }

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Іздеу')} back />
      <label className="relative">
        <span className="sr-only">{tx('Іздеу')}</span>
        <Icon n="search" className="absolute left-3 top-3.5 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={tx('Бастама, адам, кабинет, зат')} className={`${inputCls} pl-10`} />
      </label>
      {data.loading && !data.data ? <Skeleton /> : !r ? <p className="text-sm text-muted text-center py-6">{tx('Кемінде 2 әріп жазыңыз')}</p>
        : !total ? <Card><Empty icon="search" title={tx('Ештеңе табылмады')} text={tx('Басқа сөзбен іздеп көріңіз.')} /></Card> : (
          <>
            <Group title={tx('Бастамалар')} n={r.acts.length}>{r.acts.map((a) => (
              <Row key={a.id} href={`#/a/${a.id}`} icon="star" title={a.title} sub={`${TYPE_LABEL[a.type]} · ${scheduleLabel(a)} · ${a.place}`} />))}</Group>
            <Group title={tx('Адамдар')} n={r.people.length}>{r.people.map((p) => (
              <button key={p.id} type="button" onClick={() => dm(p.id)} className="w-full flex items-center gap-3 px-4 min-h-14 text-left">
                <Avatar name={p.full_name} size={36} />
                <span className="flex-1 min-w-0"><span className="block truncate font-medium">{p.full_name}</span><span className="block text-xs text-muted">{ROLE[p.role]}{p.class ? ` · ${p.class.name}` : ''}</span></span>
                <Icon n="chat" className="text-accent" />
              </button>))}</Group>
            <Group title={tx('Кабинеттер')} n={r.rooms.length}>{r.rooms.map((x) => (
              <Row key={x.id} href={`#/book/${x.id}`} icon="grid" title={x.name} sub={tx('{0}{1} · броньдау', x.group ?? '', x.capacity ? tx(' · {0} орын', x.capacity) : '')} />))}</Group>
            <Group title={tx('Lost & Found')} n={r.lost.length}>{r.lost.map((p) => (
              <Row key={p.id} href="#/lost" icon="search" title={p.title} sub={`${p.kind === 'lost' ? tx('Жоғалды') : tx('Табылды')}${p.place ? ` · ${p.place}` : ''}${p.status === 'resolved' ? tx(' · иесі табылды') : ''}`} />))}</Group>
          </>
        )}
    </div>
  )
}

const Group = ({ title, n, children }: { title: string; n: number; children: ReactNode }) => n ? (
  <section className="grid gap-1.5">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title} · {n}</h2>
    <Card className="p-0 divide-y divide-line">{children}</Card>
  </section>
) : null

const Row = ({ href, icon, title, sub }: { href: string; icon: string; title: string; sub: string }) => (
  <a href={href} className="flex items-center gap-3 px-4 min-h-14 py-2">
    <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={icon} size={18} /></span>
    <span className="flex-1 min-w-0"><span className="block truncate font-medium">{title}</span><span className="block text-xs text-muted truncate">{sub}</span></span>
    <Icon n="chev" className="text-muted" />
  </a>
)
