import { useMemo, useRef, useState, type ReactNode } from 'react'
import { createChannel, ensureChats, errText, listClasses, listNotifications, listPeople, listReports, myChatFlags, myChats, openDirect, readChat, resolveReport, setChatFlags, type ChatKind, type Notice } from '../lib/api'
import { chatTime } from '../lib/time'
import { useMe } from '../App'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx, txTitle } from '../lib/i18n'
import { noticeGroup, type NoticeGroup } from '../lib/notices'

export const KIND_ICON: Record<ChatKind, string> = { activity: 'star', class: 'users', channel: 'megaphone', direct: 'chat' }
export const KIND_LABEL: Record<ChatKind, string> = { activity: tx('Бастама тобы'), class: tx('Сынып чаты'), channel: tx('Арна'), direct: tx('Жеке хат') }
type Filter = 'all' | 'groups' | 'channel' | 'direct'

export default function Chats() {
  const { me } = useMe()
  const chats = useLoad(async () => { await ensureChats(); return myChats() }, [])
  const flags = useLoad(myChatFlags, [])
  const [archive, setArchive] = useState(false)
  const flag = (id: string) => flags.data?.find((f) => f.chat_id === id) ?? { muted: false, archived: false }
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast(done); chats.reload(); flags.reload() } catch (e) { toast(errText(e)) } }
  const sys = useLoad(listNotifications, [])
  const moderator = me.role === 'deputy' || me.role === 'admin' || me.role === 'class_teacher'
  const reports = useLoad(() => (moderator ? listReports() : Promise.resolve([])), [moderator])
  const [filter, setFilter] = useState<Filter>('all')
  const [sheet, setSheet] = useState<null | 'new' | 'channel'>(null)

  const byKind = (chats.data ?? []).filter((c) => filter === 'all' || (filter === 'groups' ? c.kind === 'activity' || c.kind === 'class' : c.kind === filter))
  const archived = byKind.filter((c) => flag(c.id).archived)
  const list = archive ? archived : byKind.filter((c) => !flag(c.id).archived)
  // one row per kind of notification: sign-ups, each room, each chat's complaints, the rest
  const groups = [...(sys.data ?? []).reduce((m, n) => {
    const g = noticeGroup(n)
    const x = m.get(g.key) ?? { ...g, last: n, unread: 0 }
    if (!n.read_at) x.unread++
    return m.set(g.key, x)
  }, new Map<string, NoticeGroup & { last: Notice; unread: number }>()).values()]
  const openReports = (reports.data ?? []).filter((r) => !r.resolved_at).length

  return (
    <div className="grid gap-3 pb-4">
      <PageHead title={tx('Чаттар')} right={<Button kind="secondary" onClick={() => setSheet('new')}>{tx('Жаңа хат')}</Button>} />
      <Chips label={tx('Чат түрі')} value={filter} onChange={setFilter} items={[['all', tx('Барлығы')], ['groups', tx('Топтар')], ['channel', tx('Арналар')], ['direct', tx('Жеке')]]} />

      {openReports > 0 && (
        <a href="#/chats/reports" className="flex items-center gap-3 rounded-lg p-4 bg-danger-soft text-danger"><Icon n="flag" /><span className="flex-1 font-semibold">{tx('{0} шағым қарауды күтуде', openReports)}</span><Icon n="chev" /></a>
      )}

      {chats.loading && !chats.data ? <Skeleton /> : chats.error ? <ErrorBox text={chats.error} retry={chats.reload} /> : (
        <ul className="bg-surface rounded-lg shadow-card border border-[var(--card-line,transparent)] divide-y divide-line">
          {(archived.length > 0 || archive) && (
            <li><button type="button" onClick={() => setArchive(!archive)} aria-expanded={archive} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2">
              <span className="size-11 rounded-full grid place-items-center shrink-0 bg-surface-2 text-muted"><Icon n={archive ? 'back' : 'archive'} /></span>
              <span className="flex-1 font-semibold">{archive ? tx('Барлық чаттар') : tx('Архив')}</span>
              {!archive && <span className="text-sm text-muted tabular-nums">{archived.length}</span>}
            </button></li>
          )}
          {filter === 'all' && !archive && (
            <>{(groups.length ? groups : [{ key: 'sys', label: 'Key To Life', icon: 'bell', last: null, unread: 0 }]).map((g) => (
              <Row key={g.key} href={`#/chats/system?g=${encodeURIComponent(g.key)}`} icon={g.icon} accent title={g.label}
                sub={g.last ? txTitle(g.last.title) : tx('Жүйелік хабарламалар')} time={g.last ? chatTime(g.last.created_at) : ''} unread={g.unread} badge={tx('Жүйе')} />
            ))}</>
          )}
          {list.map((c) => {
            const f = flag(c.id)
            return (
              <Swipe key={c.id}
                left={<>
                  <SwipeAction icon={f.muted ? 'bell' : 'belloff'} label={f.muted ? tx('Дыбысын қосу') : tx('Дыбыссыз')} tone="bg-late text-white"
                    onClick={() => act(() => setChatFlags(c.id, { muted: !f.muted }), f.muted ? tx('Дыбысы қосылды') : tx('Дыбыссыз режим'))} />
                  <SwipeAction icon="archive" label={f.archived ? tx('Архивтен шығару') : tx('Архивке')} tone="bg-muted text-white"
                    onClick={() => act(() => setChatFlags(c.id, { archived: !f.archived }), f.archived ? tx('Архивтен шықты') : tx('Архивке жіберілді'))} />
                </>}
                right={<SwipeAction icon="check" label={tx('Оқылды')} tone="bg-accent text-on-accent" onClick={() => act(() => readChat(c.id), tx('Оқылды деп белгіленді'))} />}>
                <Row href={`#/c/${c.id}`} icon={KIND_ICON[c.kind]} title={c.title} time={chatTime(c.last_at)} unread={c.unread} muted={f.muted}
                  sub={c.last_body ? `${c.last_author && c.kind !== 'direct' ? `${c.last_author.split(' ')[1] ?? c.last_author}: ` : ''}${c.last_body}` : KIND_LABEL[c.kind]}
                  badge={c.locked && c.kind !== 'channel' ? tx('Тек мұғалім') : undefined} />
              </Swipe>
            )
          })}
          {!list.length && filter !== 'all' && <li><Empty icon="chat" title={tx('Әзірге жоқ')} text={filter === 'direct' ? tx('Мұғалімге немесе сыныптасқа жеке хат жазыңыз.') : tx('Бастамаға жазылсаңыз, оның тобы осында шығады.')} /></li>}
        </ul>
      )}

      {me.role !== 'student' && <Button kind="secondary" onClick={() => setSheet('channel')}>{tx('Хабарландыру арнасын ашу')}</Button>}
      {sheet === 'new' && <Sheet title={tx('Жаңа хат')} onClose={() => setSheet(null)}><NewDirect meId={me.id} /></Sheet>}
      {sheet === 'channel' && <Sheet title={tx('Хабарландыру арнасы')} onClose={() => setSheet(null)}><NewChannel /></Sheet>}
    </div>
  )
}

const SwipeAction = ({ icon, label, tone, onClick }: { icon: string; label: string; tone: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`w-20 h-full grid content-center justify-items-center gap-1 text-xs font-semibold ${tone}`}><Icon n={icon} size={22} />{label}</button>
)

/** A row that slides: to the right shows `left` actions, to the left shows `right`. Vertical scrolling stays free. */
function Swipe({ left, right, children }: { left: ReactNode; right: ReactNode; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; dx: number; on: boolean } | null>(null)
  const moved = useRef(false)
  const LEFT = 160, RIGHT = 80
  return (
    <li className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 flex" aria-hidden={dx <= 0}>{left}</div>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={dx >= 0}>{right}</div>
      <div className="relative bg-surface touch-pan-y" style={{ transform: `translateX(${dx}px)`, transition: start.current?.on ? 'none' : 'transform .2s' }}
        onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY, dx, on: false }; moved.current = false }}
        onPointerMove={(e) => {
          const s = start.current; if (!s) return
          const mx = e.clientX - s.x, my = e.clientY - s.y
          if (!s.on && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my)) { s.on = true; moved.current = true }
          if (s.on) setDx(Math.max(-RIGHT, Math.min(LEFT, s.dx + mx)))
        }}
        onPointerUp={() => { const s = start.current; start.current = null; if (s?.on) setDx(dx > LEFT / 2 ? LEFT : dx < -RIGHT / 2 ? -RIGHT : 0) }}
        onPointerCancel={() => { start.current = null; setDx(0) }}
        onClickCapture={(e) => {
          // the click that ends a drag keeps the row open; a tap on an open row closes it instead of opening the chat
          if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false }
          else if (dx !== 0) { e.preventDefault(); e.stopPropagation(); setDx(0) }
        }}>
        {children}
      </div>
    </li>
  )
}

function Row({ href, icon, title, sub, time, unread, badge, accent, muted }: { href: string; icon: string; title: string; sub: string; time: string; unread: number; badge?: string; accent?: boolean; muted?: boolean }) {
  const body = (
      <a href={href} draggable={false} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2 select-none">
        <span className={`size-11 rounded-full grid place-items-center shrink-0 ${accent ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'}`}><Icon n={icon} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2"><span className="font-semibold truncate">{title}</span>{muted && <Icon n="belloff" size={14} className="text-muted shrink-0" />}{badge && <span className="text-xs text-muted shrink-0">{badge}</span>}</span>
          <span className={`block text-sm truncate ${unread ? 'text-fg' : 'text-muted'}`}>{sub}</span>
        </span>
        <span className="grid justify-items-end gap-1 shrink-0">
          <span className="text-xs text-muted tabular-nums">{time}</span>
          {unread > 0 ? <span className={`min-w-5 h-5 px-1.5 rounded-full text-xs font-semibold grid place-items-center ${muted ? 'bg-surface-2 text-muted' : 'bg-accent text-on-accent'}`} aria-label={tx('{0} оқылмаған', unread)}>{unread > 99 ? '99+' : unread}</span> : <span className="h-5" />}
        </span>
      </a>
  )
  // inside a Swipe the <li> is the Swipe's
  return muted === undefined ? <li>{body}</li> : body
}

const ROLE_SHORT: Record<string, string> = { student: tx('Оқушы'), teacher: tx('Мұғалім'), class_teacher: tx('Сынып жетекшісі'), deputy: tx('Орынбасар'), admin: tx('Әкімші') }

function NewDirect({ meId }: { meId: string }) {
  const people = useLoad(listPeople, [])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const list = useMemo(() => (people.data ?? []).filter((p) => p.id !== meId && (p.full_name + (p.class?.name ?? '')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50), [people.data, q, meId])
  const open = async (id: string) => { setBusy(id); try { go(`/c/${await openDirect(id)}`) } catch (e) { toast(errText(e)); setBusy('') } }
  return (
    <div className="grid gap-3">
      <label className="relative">
        <span className="sr-only">{tx('Іздеу')}</span>
        <Icon n="search" className="absolute left-3 top-3.5 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Аты-жөні немесе сынып')} className={`${inputCls} pl-10`} autoFocus />
      </label>
      {people.loading ? <Skeleton rows={2} /> : !list.length ? <p className="text-sm text-muted py-4 text-center">{tx('Ешкім табылмады')}</p> : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!!busy} onClick={() => open(p.id)} className="w-full flex items-center gap-3 min-h-14 py-2 text-left">
                <span className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center font-semibold text-sm" aria-hidden>{p.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                <span className="flex-1 min-w-0"><span className="block font-medium truncate">{p.full_name}</span><span className="block text-sm text-muted">{ROLE_SHORT[p.role]}{p.class ? ` · ${p.class.name}` : ''}</span></span>
                {busy === p.id ? <span className="size-4 rounded-full border-2 border-accent border-t-transparent animate-spin" /> : <Icon n="chev" className="text-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewChannel() {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => deputy || c.teacher_id === me.id)
  const [f, setF] = useState({ title: '', audience: deputy ? 'all' : 'class', class_id: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Арна атауын жазыңыз'))
    const cls = f.class_id || mine[0]?.id
    if (f.audience === 'class' && !cls) return toast(tx('Сыныпты таңдаңыз'))
    setBusy(true)
    try { go(`/c/${await createChannel(f.title.trim(), f.audience, f.audience === 'class' ? cls : undefined)}`) } catch (e) { toast(errText(e)); setBusy(false) }
  }
  if (!deputy && !classes.loading && !mine.length) return <p className="text-sm text-muted">{tx('Арнаны сынып жетекшісі өз сыныбына, ал орынбасар бүкіл мектепке ашады. Бастама тобында «Тек мұғалім жазады» режимін қосуға болады.')}</p>
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{tx('Арнаға тек сіз жазасыз. Әр хабарды кім оқығаны көрініп тұрады.')}</p>
      <Field label={tx('Атауы')}>{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('9А ата-аналар мен оқушыларға')} />}</Field>
      <Field label={tx('Кімге')}>{(id) => (
        <select id={id} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} className={inputCls}>
          {deputy && <><option value="all">{tx('Бүкіл мектеп')}</option><option value="students">{tx('Барлық оқушылар')}</option><option value="staff">{tx('Тек мұғалімдер')}</option></>}
          <option value="class">{tx('Бір сынып')}</option>
        </select>
      )}</Field>
      {f.audience === 'class' && (
        <Field label={tx('Сынып')}>{(id) => <select id={id} value={f.class_id || mine[0]?.id || ''} onChange={(e) => setF({ ...f, class_id: e.target.value })} className={inputCls}>
          {mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
      )}
      <Button block loading={busy} onClick={save}>{tx('Арнаны ашу')}</Button>
    </div>
  )
}

export function Reports() {
  const reports = useLoad(listReports, [])
  const act = async (id: number, remove: boolean) => { try { await resolveReport(id, remove); toast(remove ? tx('Хабар өшірілді') : tx('Шағым жабылды')); reports.reload() } catch (e) { toast(errText(e)) } }
  const list = [...(reports.data ?? [])].sort((a, b) => Number(!!a.resolved_at) - Number(!!b.resolved_at))
  return (
    <div className="grid gap-3 pb-4">
      <PageHead title={tx('Шағымдар')} back />
      {reports.loading && !reports.data ? <Skeleton /> : reports.error ? <ErrorBox text={reports.error} retry={reports.reload} />
        : !list.length ? <Card><Empty icon="flag" title={tx('Шағым жоқ')} text={tx('Оқушылар чаттағы хабарға шағымданса, осында көресіз.')} /></Card>
        : list.map((r) => (
          <Card key={r.id} className={`grid gap-2 ${r.resolved_at ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{r.author.full_name}{r.author.class ? ` · ${r.author.class.name}` : ''}</span>
              {r.resolved_at && <Badge tone={r.removed ? 'bad' : 'muted'}>{r.removed ? tx('Өшірілді') : tx('Жабылды')}</Badge>}
            </div>
            <blockquote className="rounded-md bg-surface-2 px-3 py-2 break-words whitespace-pre-line">{r.body}</blockquote>
            <p className="text-sm text-muted">{tx('Шағым: {0} · {1} · {2}', r.reason, r.reporter.full_name, chatTime(r.created_at))}</p>
            {!r.resolved_at && <div className="grid grid-cols-2 gap-2"><Button kind="danger" onClick={() => act(r.id, true)}>{tx('Хабарды өшіру')}</Button><Button kind="secondary" onClick={() => act(r.id, false)}>{tx('Жабу')}</Button></div>}
          </Card>
        ))}
    </div>
  )
}
