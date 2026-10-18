import { useCallback, useEffect, useRef, useState } from 'react'
import { errText, joinActivity, type Activity, type ActivityType, type Me } from '../lib/api'
import { TYPE_LABEL, lastDay, scheduleLabel, today } from '../lib/time'
import { Button, Icon, go, toast } from './ui'
import { tx } from '../lib/i18n'
import { ActivityAvatar } from './ActivityProfile'

const TONE: Record<ActivityType, string> = {
  olympiad_prep: 'var(--accent)', club: 'var(--success)', course: 'var(--late)', event: 'var(--warning)',
  competition: 'var(--danger)', tournament: 'var(--danger)', challenge: 'var(--accent)', league: 'var(--danger)',
  community: 'var(--success)', team: 'var(--late)',
}
const SHOW_MS = 6000

/** Open activities this person could still join: the story row on top of Бастамалар. */
export function storyCandidates(me: Me, list: Activity[]) {
  const t = today()
  return list.filter((a) => !a.class_plan && a.status === 'approved' && lastDay(a) >= t && a.author_id !== me.id && (
    me.role !== 'student' || (!a.enrollments.some((e) => e.student_id === me.id)
      && (!a.audience_grades.length || (me.class && a.audience_grades.includes(me.class.grade)))
      && (a.capacity === null || a.enrollments.filter((e) => !e.waitlisted).length < a.capacity)))).slice(0, 15)
}

const seenKey = (me: Me) => `ll-stories-seen-${me.id}`
const readSeen = (me: Me): string[] => { try { return JSON.parse(localStorage.getItem(seenKey(me)) ?? '[]') } catch { return [] } }
export default function Stories({ me, items, onJoined }: { me: Me; items: Activity[]; onJoined: () => void }) {
  const [seen, setSeen] = useState(() => readSeen(me))
  const [open, setOpen] = useState<number | null>(null)
  const markSeen = useCallback((id: string) => setSeen((s) => {
    if (s.includes(id)) return s
    const next = [...s, id].slice(-200)
    try { localStorage.setItem(seenKey(me), JSON.stringify(next)) } catch { /* private mode: rings just stay coloured */ }
    return next
  }), [me])
  if (!items.length) return null
  return (
    <>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]" role="list" aria-label={tx('Ұсыныстар')}>
        {items.map((a, i) => (
          <button key={a.id} type="button" role="listitem" onClick={() => setOpen(i)} className="shrink-0 w-[72px] grid justify-items-center gap-1 text-center">
            <span className="size-[68px] rounded-full p-[3px] grid" style={{ background: seen.includes(a.id) ? 'var(--border)' : TONE[a.type] }}>
              {a.photo || a.icon ? <span className="rounded-full bg-surface border-2 border-surface grid place-items-center overflow-hidden"><ActivityAvatar a={a} size={56} /></span> : (
                <span className="rounded-full bg-surface border-2 border-surface grid place-items-center text-[9.5px] font-bold leading-tight tracking-tight px-0.5 overflow-hidden" style={{ color: TONE[a.type] }}>
                  {TYPE_LABEL[a.type]}
                </span>
              )}
            </span>
            <span className="text-xs leading-tight line-clamp-2 break-words w-full">{a.title}</span>
          </button>
        ))}
      </div>
      {open !== null && <Viewer me={me} items={items} start={open} onSeen={markSeen} onClose={() => setOpen(null)} onJoined={onJoined} />}
    </>
  )
}

function Viewer({ me, items, start, onSeen, onClose, onJoined }: { me: Me; items: Activity[]; start: number; onSeen: (id: string) => void; onClose: () => void; onJoined: () => void }) {
  const [i, setI] = useState(start)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const t0 = useRef(Date.now())
  const [, tick] = useState(0)
  const a = items[i]
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  const next = useCallback(() => { if (i < items.length - 1) { setI(i + 1); t0.current = Date.now() } else onClose() }, [i, items.length, onClose])
  const prev = () => { if (i > 0) { setI(i - 1); t0.current = Date.now() } }
  useEffect(() => { onSeen(a.id) }, [a.id, onSeen])
  useEffect(() => {
    if (paused || reduce) return
    const h = setInterval(() => { if (Date.now() - t0.current >= SHOW_MS) next(); else tick((n) => n + 1) }, 100)
    return () => clearInterval(h)
  }, [paused, next, reduce])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev() }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  })

  const pct = reduce ? 100 : Math.min(100, ((Date.now() - t0.current) / SHOW_MS) * 100)
  const seats = a.capacity === null ? null : a.capacity - a.enrollments.filter((e) => !e.waitlisted).length
  const join = async () => {
    setBusy(true); setPaused(true)
    try { const ok = await joinActivity(a.id); toast(ok ? tx('Жазылдыңыз') : tx('Орын толы — күту тізіміне жазылдыңыз')); onJoined(); next() }
    catch (e) { toast(errText(e)) } finally { setBusy(false); setPaused(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center" role="dialog" aria-modal="true" aria-label={tx('Ұсыныс: {0}', a.title)}>
      <div className="relative w-full max-w-[480px] h-dvh sm:h-[90dvh] sm:rounded-lg overflow-hidden bg-surface flex flex-col"
        onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
        <div className="h-48 shrink-0 relative" style={{ background: TONE[a.type] }}>
          <div className="absolute inset-x-0 top-0 flex gap-1 p-3 pt-[max(12px,env(safe-area-inset-top))]">
            {items.map((x, k) => (
              <span key={x.id} className="h-1 flex-1 rounded-full bg-white/40 overflow-hidden">
                <span className="block h-full bg-white" style={{ width: `${k < i ? 100 : k === i ? pct : 0}%` }} />
              </span>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label={tx('Жабу')} className="absolute right-2 top-[max(20px,calc(env(safe-area-inset-top)+8px))] size-11 grid place-items-center text-white"><Icon n="x" size={24} /></button>
          <p className="absolute left-4 bottom-4 right-4 text-white">
            <span className="block text-sm font-semibold uppercase tracking-wider opacity-90">{TYPE_LABEL[a.type]}</span>
            <span className="block text-display font-bold leading-tight text-balance break-words">{a.title}</span>
          </p>
        </div>
        {/* tap zones: left third goes back, the rest goes forward */}
        <button type="button" aria-label={tx('Алдыңғы')} onClick={prev} className="absolute left-0 top-48 bottom-40 w-1/3" />
        <button type="button" aria-label={tx('Келесі')} onClick={next} className="absolute right-0 top-48 bottom-40 w-2/3" />
        <div className="flex-1 overflow-hidden p-4 grid gap-2 content-start">
          <p className="flex gap-2 items-center tabular-nums"><Icon n="clock" size={18} className="text-muted" />{scheduleLabel(a)}</p>
          <p className="flex gap-2 items-center"><Icon n="pin" size={18} className="text-muted" />{a.place}</p>
          <p className="flex gap-2 items-center"><Icon n="user" size={18} className="text-muted" />{a.supervisor.full_name}</p>
          {seats !== null && <p className="flex gap-2 items-center"><Icon n="users" size={18} className="text-muted" />{seats}{' '}{tx('бос орын')}</p>}
          <p className="text-muted line-clamp-6 mt-1">{a.description}</p>
        </div>
        <div className="relative z-10 p-4 pb-[max(16px,env(safe-area-inset-bottom))] grid gap-2 border-t border-line">
          {me.role === 'student' && <Button block loading={busy} onClick={join}>{tx('Қатысамын')}</Button>}
          <Button block kind="secondary" onClick={() => { onClose(); go(`/a/${a.id}`) }}>{tx('Толығырақ')}</Button>
        </div>
      </div>
    </div>
  )
}
