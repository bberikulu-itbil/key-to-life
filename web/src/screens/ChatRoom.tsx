import { useEffect, useRef, useState } from 'react'
import { chatInfo, chatPeople, errText, listMessages, listVotes, messageReaders, onMessages, openDirect, pinMessage, readChat, removeMessage,
  reportMessage, sendMessage, setChatLocked, votePoll, type Message } from '../lib/api'
import { chatTime, fmtDate, iso } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, ErrorBox, Field, Icon, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { KIND_ICON, KIND_LABEL } from './Chats'
import { tx } from '../lib/i18n'

const ROLE_SHORT: Record<string, string> = { teacher: tx('Мұғалім'), class_teacher: tx('Сынып жетекшісі'), deputy: tx('Орынбасар'), admin: tx('Әкімші') }

export default function ChatRoom({ id }: { id: string }) {
  const { me, refreshBadge } = useMe()
  const info = useLoad(() => chatInfo(id), [id])
  const msgs = useLoad(async () => {
    const m = await listMessages(id)
    const polls = m.filter((x) => x.poll).map((x) => x.id)
    return { m, votes: polls.length ? await listVotes(polls) : [] }
  }, [id])
  const [sheet, setSheet] = useState<null | { kind: 'msg'; m: Message } | { kind: 'info' } | { kind: 'poll' } | { kind: 'readers'; m: Message } | { kind: 'report'; m: Message }>(null)
  const end = useRef<HTMLDivElement>(null)

  // live updates: any insert/update in this chat reloads the list
  useEffect(() => onMessages(id, msgs.reload), [id, msgs.reload])
  useEffect(() => { if (msgs.data) { readChat(id).then(refreshBadge, () => {}); end.current?.scrollIntoView({ block: 'end' }) } }, [msgs.data, id])

  const c = info.data
  if (info.loading && !info.data) return <Skeleton />
  if (info.error || !c) return <div className="pt-4"><ErrorBox text={info.error || tx('Чат табылмады немесе сіз оның мүшесі емессіз')} retry={info.reload} /></div>
  const list = msgs.data?.m ?? []
  const votes = msgs.data?.votes ?? []
  const pinned = list.find((m) => m.id === c.pinned_id)
  const group = c.kind !== 'direct'

  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast(done); setSheet(null); info.reload(); msgs.reload() } catch (e) { toast(errText(e)) } }

  return (
    <div className="grid gap-2 pb-2">
      <div className="sticky top-0 z-10 -mx-4 -mt-2 px-4 py-2 bg-hero text-on-hero flex items-center gap-2 min-h-16">
        <button type="button" onClick={() => go('/chats')} aria-label={tx('Чаттарға оралу')} className="size-10 grid place-items-center rounded-md bg-white/10"><Icon n="back" /></button>
        <span className="size-10 rounded-full bg-white/10 grid place-items-center shrink-0" aria-hidden><Icon n={KIND_ICON[c.kind]} size={20} /></span>
        <button type="button" onClick={() => setSheet({ kind: 'info' })} className="flex-1 min-w-0 text-left">
          <span className="block font-bold truncate">{c.title}</span>
          <span className="block text-xs text-white/70">{KIND_LABEL[c.kind]}{group ? tx(' · {0} адам', c.members) : ''}{c.locked && c.kind !== 'channel' ? tx(' · тек мұғалім жазады') : ''}</span>
        </button>
        <button type="button" onClick={() => setSheet({ kind: 'info' })} aria-label={tx('Чат туралы')} className="size-10 grid place-items-center rounded-md bg-white/10"><Icon n="more" size={22} /></button>
      </div>

      {pinned && (
        <div className="flex items-center gap-2 rounded-md bg-accent-soft text-accent px-3 py-2 text-sm">
          <Icon n="pin" size={16} /><span className="flex-1 min-w-0 truncate"><b>{tx('Бекітілген:')}</b> {pinned.body}</span>
          {c.moderator && <button type="button" onClick={() => act(() => pinMessage(id, null), tx('Бекітуден алынды'))} aria-label={tx('Бекітуден алу')} className="size-8 grid place-items-center"><Icon n="x" size={16} /></button>}
        </div>
      )}

      {msgs.loading && !msgs.data ? <Skeleton rows={2} /> : msgs.error ? <ErrorBox text={msgs.error} retry={msgs.reload} /> : !list.length ? (
        <p className="text-center text-sm text-muted py-12">{c.kind === 'channel' ? tx('Арнада әзірге хабарландыру жоқ.') : tx('Әзірге хат жоқ. Бірінші болып жазыңыз.')}</p>
      ) : (
        <ol className="grid gap-1.5 py-2">
          {list.map((m, i) => {
            const mine = m.author_id === me.id
            const day = iso(new Date(m.created_at))
            const newDay = i === 0 || iso(new Date(list[i - 1].created_at)) !== day
            const showName = group && !mine && (newDay || list[i - 1].author_id !== m.author_id)
            return (
              <li key={m.id} className="grid">
                {newDay && <p className="justify-self-center my-2 text-xs text-muted bg-surface-2 rounded-full px-3 py-1">{fmtDate(day)}</p>}
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${mine ? 'justify-self-end bg-accent text-on-accent rounded-br-sm' : 'justify-self-start bg-surface shadow-card rounded-bl-sm'} ${m.removed_at ? 'opacity-60 italic' : ''}`}>
                  <button type="button" disabled={!!m.removed_at} onClick={() => setSheet({ kind: 'msg', m })} aria-label={tx('{0}: {1}. Әрекеттер', m.author.full_name, m.body)} className="block w-full text-left">
                    {showName && <span className="block text-xs font-semibold text-accent mb-0.5">{m.author.full_name}{ROLE_SHORT[m.author.role] ? ` · ${ROLE_SHORT[m.author.role]}` : ''}</span>}
                    <span className="block whitespace-pre-line break-words">{m.body}</span>
                  </button>
                  {m.poll && <Poll m={m} votes={votes.filter((v) => v.message_id === m.id)} meId={me.id} mine={mine} onVote={(o) => act(() => votePoll(m.id, o), tx('Дауысыңыз қабылданды'))} />}
                  <span className={`block text-[11px] text-right mt-0.5 tabular-nums ${mine ? 'opacity-80' : 'text-muted'}`}>{new Date(m.created_at).toTimeString().slice(0, 5)}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <div ref={end} />

      {c.can_post ? <Composer chat={id} canPoll={me.role !== 'student'} onSent={msgs.reload} onPoll={() => setSheet({ kind: 'poll' })} />
        : <p className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] rounded-md bg-surface-2 text-muted text-sm text-center px-3 py-3">
            <Icon n="lock" size={16} className="inline -mt-0.5 mr-1" />{c.kind === 'channel' ? tx('Бұл арнаға тек мұғалім жазады') : tx('Мұғалім чатты уақытша жапты')}</p>}

      {sheet?.kind === 'msg' && (
        <Sheet title={tx('Хабар')} onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            <p className="rounded-md bg-surface-2 px-3 py-2 break-words whitespace-pre-line line-clamp-4">{sheet.m.body}</p>
            <Action icon="file" text={tx('Көшіру')} onClick={() => { navigator.clipboard.writeText(sheet.m.body).then(() => toast(tx('Көшірілді')), () => toast(tx('Көшіру мүмкін болмады'))); setSheet(null) }} />
            {c.kind === 'channel' && (sheet.m.author_id === me.id || c.moderator) && <Action icon="check" text={tx('Кім оқыды')} onClick={() => setSheet({ kind: 'readers', m: sheet.m })} />}
            {c.moderator && <Action icon="pin" text={c.pinned_id === sheet.m.id ? tx('Бекітуден алу') : tx('Бекіту')} onClick={() => act(() => pinMessage(id, c.pinned_id === sheet.m.id ? null : sheet.m.id), tx('Сақталды'))} />}
            {sheet.m.author_id !== me.id && <Action icon="flag" text={tx('Шағымдану')} onClick={() => setSheet({ kind: 'report', m: sheet.m })} />}
            {(sheet.m.author_id === me.id || c.moderator) && <Action icon="x" text={tx('Өшіру')} danger onClick={() => act(() => removeMessage(sheet.m.id), tx('Өшірілді'))} />}
          </div>
        </Sheet>
      )}
      {sheet?.kind === 'readers' && <Sheet title={tx('Кім оқыды')} onClose={() => setSheet(null)}><Readers msg={sheet.m.id} /></Sheet>}
      {sheet?.kind === 'report' && <Sheet title={tx('Шағым')} onClose={() => setSheet(null)}><Report msg={sheet.m} onDone={() => setSheet(null)} /></Sheet>}
      {sheet?.kind === 'poll' && <Sheet title={tx('Сауалнама')} onClose={() => setSheet(null)}><NewPoll chat={id} onDone={() => { setSheet(null); msgs.reload() }} /></Sheet>}
      {sheet?.kind === 'info' && (
        <Sheet title={c.title} onClose={() => setSheet(null)}>
          <div className="grid gap-3">
            {c.activity_id && <Button kind="secondary" onClick={() => go(`/a/${c.activity_id}`)}>{tx('Бастама беті')}</Button>}
            {c.moderator && c.kind !== 'channel' && (
              <label className="flex items-center gap-3 min-h-14 rounded-md bg-surface-2 px-3">
                <span className="flex-1"><span className="block font-semibold">{tx('Тек мұғалім жазады')}</span><span className="block text-sm text-muted">{tx('Сабақ уақытында немесе түнде оқушылардың хатын тоқтату')}</span></span>
                <input type="checkbox" checked={c.locked} onChange={(e) => act(() => setChatLocked(id, e.target.checked), e.target.checked ? tx('Чат жабылды') : tx('Чат ашылды'))} className="size-5 accent-[var(--accent)]" />
              </label>
            )}
            {group && <People chat={id} meId={me.id} />}
          </div>
        </Sheet>
      )}
    </div>
  )
}

const Action = ({ icon, text, onClick, danger }: { icon: string; text: string; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`flex items-center gap-3 min-h-12 rounded-md px-3 text-left hover:bg-surface-2 ${danger ? 'text-danger' : ''}`}><Icon n={icon} />{text}</button>
)

function Poll({ m, votes, meId, mine, onVote }: { m: Message; votes: { user_id: string; option: number }[]; meId: string; mine: boolean; onVote: (o: number) => void }) {
  const my = votes.find((v) => v.user_id === meId)?.option
  return (
    <span className="grid gap-1.5 mt-2 min-w-[220px]">
      {m.poll!.options.map((o, i) => {
        const n = votes.filter((v) => v.option === i).length
        const pct = votes.length ? Math.round((100 * n) / votes.length) : 0
        return (
          <button key={i} type="button" disabled={mine} onClick={() => onVote(i)} aria-pressed={my === i} aria-label={tx('{0}: {1} дауыс', o, n)}
            className={`relative overflow-hidden rounded-md px-3 py-2 text-sm text-left ${mine ? 'bg-white/15' : 'bg-surface-2'} ${my === i ? 'ring-2 ring-accent' : ''}`}>
            <span className={`absolute inset-y-0 left-0 ${mine ? 'bg-white/20' : 'bg-accent-soft'}`} style={{ width: `${pct}%` }} aria-hidden />
            <span className="relative flex justify-between gap-3"><span>{o}</span><span className="tabular-nums font-semibold">{n}</span></span>
          </button>
        )
      })}
      <span className={`text-xs ${mine ? 'opacity-80' : 'text-muted'}`}>{tx('{0} дауыс{1}', votes.length, my === undefined && !mine ? tx(' · жауабыңызды таңдаңыз') : '')}</span>
    </span>
  )
}

function Composer({ chat, canPoll, onSent, onPoll }: { chat: string; canPoll: boolean; onSent: () => void; onPoll: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try { await sendMessage(chat, text); setText(''); onSent() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); send() }} className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] flex items-end gap-2 bg-surface rounded-lg shadow-pop p-2">
      {canPoll && <button type="button" onClick={onPoll} aria-label={tx('Сауалнама жасау')} className="size-11 grid place-items-center text-muted shrink-0"><Icon n="poll" /></button>}
      <label className="flex-1 min-w-0">
        <span className="sr-only">{tx('Хабар')}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(5, text.split('\n').length)} maxLength={4000} placeholder={tx('Хабар жазыңыз')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send() } }}
          className="w-full resize-none bg-transparent px-2 py-2.5 focus:outline-none" />
      </label>
      <button type="submit" disabled={busy || !text.trim()} aria-label={tx('Жіберу')} className="size-11 rounded-full bg-gold text-on-gold grid place-items-center shrink-0 disabled:opacity-40"><Icon n="send" /></button>
    </form>
  )
}

function NewPoll({ chat, onDone }: { chat: string; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(tx('Иә\nЖоқ'))
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const options = opts.split('\n').map((s) => s.trim()).filter(Boolean)
    if (q.trim().length < 2) return toast(tx('Сұрақты жазыңыз'))
    if (options.length < 2 || options.length > 10) return toast(tx('2–10 жауап нұсқасын жазыңыз'))
    setBusy(true)
    try { await sendMessage(chat, q, { options }); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Сұрақ')}>{(id) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} placeholder={tx('Сенбідегі экскурсияға барасыз ба?')} />}</Field>
      <Field label={tx('Жауап нұсқалары')} hint={tx('Әр жолға бір нұсқа, 2–10')}>{(id, d) => <textarea id={id} aria-describedby={d} value={opts} onChange={(e) => setOpts(e.target.value)} className={`${inputCls} h-28 py-2`} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Жіберу')}</Button>
    </div>
  )
}

function Readers({ msg }: { msg: number }) {
  const r = useLoad(() => messageReaders(msg), [msg])
  if (r.loading) return <Skeleton rows={2} />
  if (r.error) return <ErrorBox text={r.error} />
  const read = (r.data ?? []).filter((x) => x.read_at)
  const unread = (r.data ?? []).filter((x) => !x.read_at)
  const block = (title: string, l: typeof read) => l.length > 0 && (
    <section className="grid gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title} · {l.length}</h3>
      <ul className="divide-y divide-line">{l.map((x, i) => <li key={i} className="flex justify-between gap-2 py-2"><span>{x.full_name}{x.class_name ? ` · ${x.class_name}` : ''}</span>{x.read_at && <span className="text-sm text-muted tabular-nums">{chatTime(x.read_at)}</span>}</li>)}</ul>
    </section>
  )
  return (
    <div className="grid gap-4">
      <Card className="py-3"><p className="text-xl font-bold tabular-nums">{read.length} / {read.length + unread.length}</p><p className="text-xs text-muted">{tx('оқыды')}</p></Card>
      {block(tx('Әлі оқымағандар'), unread)}
      {block(tx('Оқығандар'), read)}
    </div>
  )
}

function Report({ msg, onDone }: { msg: Message; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const REASONS = [tx('Балағат, қорлау'), tx('Қорқыту'), tx('Спам'), tx('Жеке ақпарат')]
  const save = async () => {
    if (reason.trim().length < 2) return toast(tx('Себебін таңдаңыз немесе жазыңыз'))
    setBusy(true)
    try { await reportMessage(msg.id, reason); toast(tx('Шағым жіберілді. Сынып жетекшісі мен орынбасар қарайды.')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <p className="rounded-md bg-surface-2 px-3 py-2 break-words line-clamp-3">{msg.body}</p>
      <div className="flex flex-wrap gap-2">{REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={`h-9 px-3.5 rounded-full text-sm ${reason === r ? 'bg-accent text-on-accent font-semibold' : 'bg-surface-2'}`}>{r}</button>)}</div>
      <Field label={tx('Немесе өзіңіз жазыңыз')}>{(id) => <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />}</Field>
      <Button block kind="danger" loading={busy} onClick={save}>{tx('Шағым жіберу')}</Button>
    </div>
  )
}

function People({ chat, meId }: { chat: string; meId: string }) {
  const p = useLoad(() => chatPeople(chat), [chat])
  const dm = async (id: string) => { try { go(`/c/${await openDirect(id)}`) } catch (e) { toast(errText(e)) } }
  if (p.loading) return <Skeleton rows={2} />
  return (
    <section className="grid gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Қатысушылар · {0}', p.data?.length ?? 0)}</h3>
      <ul className="divide-y divide-line">
        {(p.data ?? []).map((x) => (
          <li key={x.id} className="flex items-center gap-2 min-h-12">
            <span className="flex-1 min-w-0"><span className="block truncate">{x.full_name}</span><span className="block text-xs text-muted">{ROLE_SHORT[x.role] ?? tx('Оқушы')}{x.class_name ? ` · ${x.class_name}` : ''}</span></span>
            {x.id !== meId && <button type="button" onClick={() => dm(x.id)} aria-label={tx('{0} — жеке хат', x.full_name)} className="size-11 grid place-items-center text-accent"><Icon n="chat" /></button>}
          </li>
        ))}
      </ul>
    </section>
  )
}
