import type { Activity } from '../lib/api'
import { STATUS_LABEL, TYPE_LABEL, scheduleLabel } from '../lib/time'
import { Badge, Icon, type Tone } from './ui'
import { ActivityAvatar } from './ActivityProfile'
import { tx } from '../lib/i18n'

export const statusTone = (s: Activity['status']): Tone =>
  s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : s === 'cancelled' ? 'muted' : 'warn'

export default function ActivityCard({ a, showStatus }: { a: Activity; showStatus?: boolean }) {
  const joined = a.enrollments.filter((e) => !e.waitlisted).length
  return (
    <a href={`#/a/${a.id}`} className="block bg-surface rounded-lg shadow-card border border-[var(--card-line,transparent)] p-4 active:bg-surface-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ActivityAvatar a={a} size={32} />
        <Badge tone="accent">{TYPE_LABEL[a.type]}</Badge>
        {showStatus && a.status !== 'approved' && <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge>}
      </div>
      <h3 className="mt-2 text-lg font-semibold break-words">{a.title}</h3>
      <div className="mt-1 grid gap-1 text-sm text-muted">
        <span className="flex items-center gap-1.5 tabular-nums"><Icon n="clock" size={16} />{scheduleLabel(a)}</span>
        <span className="flex items-center gap-1.5"><Icon n="pin" size={16} />{a.place ? `${a.place} · ` : ''}{a.supervisor.full_name}</span>
        <span className="flex items-center gap-1.5 tabular-nums"><Icon n="users" size={16} />{a.capacity ? tx('{0}/{1} орын', joined, a.capacity) : tx('{0} қатысушы', joined)}</span>
      </div>
    </a>
  )
}
