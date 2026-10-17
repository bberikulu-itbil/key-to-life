import { useState } from 'react'
import { addComment, createFeedPost, errText, hideComment, likePost, listComments, photoUrl, type Activity, type Me, type Post } from '../lib/api'
import { chatTime } from '../lib/time'
import { Button, Field, Icon, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

/** Activities this person may write in the name of (supervisor or responsible student). */
export const ledActivities = (me: Me, list: Activity[]) => list.filter((a) => a.status === 'approved' && !a.archived_at
  && (a.supervisor_id === me.id || a.curator_id === me.id || a.curators.some((c) => c.student_id === me.id)))
/** May write news or announcements: staff and parliament in their own name, leaders in an activity's name. */
export const canWriteFeed = (me: Me, led: Activity[]) => me.role !== 'student' || me.parliament || led.length > 0

const likes = (p: Post) => p.votes.filter((v) => v.value === 1).length
const KIND = (k: string) => (k === 'announcement' ? tx('Хабарландыру') : tx('Жаңалық'))

/** The name a post is shown under: the activity when written in its name. */
function Byline({ p }: { p: { kind: string; created_at: string; author: { full_name: string }; activity: { title: string } | null } }) {
  return (
    <span className="flex items-center gap-3 min-w-0">
      <span className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={p.activity ? 'grid' : p.kind === 'announcement' ? 'megaphone' : 'user'} /></span>
      <span className="min-w-0">
        <span className="block font-semibold truncate">{p.activity?.title ?? p.author.full_name}</span>
        <span className="block text-xs text-muted truncate">{p.activity ? `${p.author.full_name} · ` : ''}{KIND(p.kind)} · {chatTime(p.created_at)}</span>
      </span>
    </span>
  )
}

/** The shared post inside a repost. */
export const Original = ({ o }: { o: NonNullable<Post['orig']> }) => (
  <span className="block rounded-md border border-line overflow-hidden">
    <span className="block p-3"><Byline p={o} /></span>
    {o.photo && <img src={photoUrl(o.photo)} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover bg-surface-2" />}
    <span className="block p-3 pt-2"><span className="block font-bold leading-snug">{o.title}</span>
      {o.body && <span className="block mt-1 text-sm text-muted whitespace-pre-line line-clamp-3">{o.body}</span>}</span>
  </span>
)

export function FeedCard({ p, me, canRepost, onOpen, onRepost }: { p: Post; me: Me; canRepost: boolean; onOpen: () => void; onRepost: () => void }) {
  const [mine, setMine] = useState(() => p.votes.some((v) => v.user_id === me.id && v.value === 1))
  const n = likes(p) - (p.votes.some((v) => v.user_id === me.id && v.value === 1) ? 1 : 0) + (mine ? 1 : 0)
  const showCount = !p.hide_likes || p.author_id === me.id   // the author still sees the hidden count
  const like = async () => { setMine(!mine); try { await likePost(p.id, !mine) } catch (e) { setMine(mine); toast(errText(e)) } }
  const comments = p.comments[0]?.count ?? 0
  return (
    <article className="rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] overflow-hidden">
      <button type="button" onClick={onOpen} className="w-full text-left">
        {p.orig && <span className="flex items-center gap-1.5 px-4 pt-3 text-xs text-muted"><Icon n="repeat" size={14} />{tx('{0} бөлісті', p.activity?.title ?? p.author.full_name)} · {chatTime(p.created_at)}</span>}
        {p.orig ? (
          <span className="block p-4 pt-2 grid gap-2">{p.body && <span className="block whitespace-pre-line line-clamp-4">{p.body}</span>}<Original o={p.orig} /></span>
        ) : (
          <>
            <span className="flex items-center gap-2 p-4 pb-2"><span className="flex-1 min-w-0"><Byline p={p} /></span>{p.pinned && <Icon n="star" size={16} className="text-accent" />}</span>
            {p.photo && <img src={photoUrl(p.photo)} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover bg-surface-2" />}
            <span className="block p-4 pt-3">
              <span className="block font-bold leading-snug">{p.title}</span>
              {p.body && <span className="block mt-1 text-sm text-muted whitespace-pre-line line-clamp-4">{p.body}</span>}
            </span>
          </>
        )}
      </button>
      <div className="flex items-center gap-1 px-2 pb-1 border-t border-line">
        <button type="button" onClick={like} aria-pressed={mine} aria-label={showCount ? tx('Ұнады, {0}', n) : tx('Ұнады')}
          className={`flex items-center gap-1.5 h-11 px-3 text-sm font-semibold ${mine ? 'text-danger' : 'text-muted'}`}>
          <Icon n="heart" className={mine ? 'fill-current' : ''} />{showCount && n > 0 ? <span className="tabular-nums">{n}</span> : null}
        </button>
        {!p.comments_off && <button type="button" onClick={onOpen} aria-label={tx('Пікірлер, {0}', comments)} className="flex items-center gap-1.5 h-11 px-3 text-sm font-semibold text-muted">
          <Icon n="chat" />{comments > 0 && <span className="tabular-nums">{comments}</span>}
        </button>}
        {canRepost && p.visibility === 'public' && <button type="button" onClick={onRepost} aria-label={tx('Репост')} className="flex items-center gap-1.5 h-11 px-3 text-sm font-semibold text-muted"><Icon n="repeat" /></button>}
      </div>
    </article>
  )
}

export function Comments({ p, me }: { p: Post; me: Me }) {
  const list = useLoad(() => listComments(p.id), [p.id])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const mod = p.author_id === me.id || me.role === 'deputy' || me.role === 'admin'
  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try { await addComment(p.id, text); setText(''); list.reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const hide = async (id: string) => { try { await hideComment(id); list.reload() } catch (e) { toast(errText(e)) } }
  return (
    <section className="grid gap-2 border-t border-line pt-3" aria-label={tx('Пікірлер')}>
      <h4 className="font-bold">{tx('Пікірлер')}</h4>
      {list.loading && !list.data ? <Skeleton rows={1} /> : (list.data ?? []).map((c) => (
        <div key={c.id} className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-xs text-muted">{c.author.full_name}{c.author.class ? ` · ${c.author.class.name}` : ''} · {chatTime(c.created_at)}</p>
          <p className="whitespace-pre-line break-words">{c.body}</p>
          {(c.author_id === me.id || mod) && <button type="button" onClick={() => hide(c.id)} className="text-xs text-danger font-semibold min-h-8">{tx('Жою')}</button>}
        </div>
      ))}
      {list.data && !list.data.length && <p className="text-sm text-muted">{tx('Әзірге пікір жоқ.')}</p>}
      {p.comments_off ? <p className="text-sm text-muted">{tx('Пікір жазу өшірілген')}</p> : (
        <div className="flex gap-2 items-end">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={1} aria-label={tx('Пікір жазу')} placeholder={tx('Пікір жазу')} className={`${inputCls} flex-1 py-2 min-h-11`} />
          <button type="button" onClick={send} disabled={busy || !text.trim()} aria-label={tx('Жіберу')} className="size-11 rounded-md bg-accent text-on-accent grid place-items-center disabled:opacity-40"><Icon n="send" /></button>
        </div>
      )}
    </section>
  )
}

/** Who a news post or announcement is written as: the person, or one of the activities they lead. */
export function AsWho({ me, led, value, onChange, own }: { me: Me; led: Activity[]; value: string; onChange: (v: string) => void; own: boolean }) {
  if (!led.length) return null
  return (
    <Field label={tx('Кімнің атынан')}>{(id) => (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {own && <option value="">{tx('Өз атымнан ({0})', me.full_name)}</option>}
        {led.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
      </select>
    )}</Field>
  )
}

export function RepostForm({ p, me, led, onDone }: { p: Post; me: Me; led: Activity[]; onDone: () => void }) {
  const own = me.role !== 'student' || me.parliament
  const [as, setAs] = useState(own ? '' : led[0]?.id ?? '')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await createFeedPost({ kind: 'news', title: '', body: text, activity: as || null, repost: p.id }); toast(tx('Лентада бөлістіңіз')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Original o={p.orig ?? { ...p }} />
      <AsWho me={me} led={led} value={as} onChange={setAs} own={own} />
      <Field label={tx('Пікіріңіз')} hint={tx('Міндетті емес')}>{(id, d) => <textarea id={id} aria-describedby={d} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} className={`${inputCls} h-24 py-2`} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Репост жасау')}</Button>
    </div>
  )
}
