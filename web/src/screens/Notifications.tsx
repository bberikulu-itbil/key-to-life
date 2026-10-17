import { useEffect } from 'react'
import { listNotifications, markRead } from '../lib/api'
import { useMe } from '../App'
import { Empty, ErrorBox, PageHead, Skeleton, useLoad } from '../components/ui'
import { tx, txTitle } from '../lib/i18n'

const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  return m < 1 ? tx('жаңа ғана') : m < 60 ? tx('{0} мин бұрын', m) : m < 1440 ? tx('{0} сағ бұрын', Math.round(m / 60)) : new Date(s).toLocaleDateString('kk-KZ')
}

export default function Notifications() {
  const { refreshBadge } = useMe()
  const { data, error, loading, reload } = useLoad(listNotifications, [])
  // mark as read once the list is on screen; unread dots stay for this visit
  useEffect(() => { if (data?.some((n) => !n.read_at)) markRead().then(refreshBadge) }, [data])

  return (
    <div className="grid gap-3 pb-4">
      <PageHead title="Key To Life" back />
      {loading && !data ? <Skeleton /> : error ? <ErrorBox text={error} retry={reload} />
        : !data?.length ? <Empty icon="bell" title={tx('Хабарлама жоқ')} text={tx('Ұсыныстарыңыз расталғанда, рұқсат берілгенде немесе орын босағанда осында жазамыз.')} />
        : (
          <ul className="bg-surface rounded-lg shadow-card border border-[var(--card-line,transparent)] divide-y divide-line">
            {data.map((n) => (
              <li key={n.id}>
                <a href={n.link ? `#${n.link}` : undefined} className="flex gap-3 px-4 py-3 active:bg-surface-2">
                  <span className={`mt-2 size-2 rounded-full shrink-0 ${n.read_at ? 'bg-transparent' : 'bg-accent'}`} aria-label={n.read_at ? undefined : tx('Жаңа')} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{txTitle(n.title)}</span>
                    {n.body && <span className="block text-sm text-muted break-words">{n.body}</span>}
                    <span className="block text-xs text-muted mt-0.5">{ago(n.created_at)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
