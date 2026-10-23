import { useEffect } from 'react'
import { listNotifications, markNoticesRead } from '../lib/api'
import { noticeGroup } from '../lib/notices'
import { useMe } from '../App'
import { Empty, ErrorBox, PageHead, Skeleton, useLoad } from '../components/ui'
import { tx, txTitle } from '../lib/i18n'

const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  return m < 1 ? tx('жаңа ғана') : m < 60 ? tx('{0} мин бұрын', m) : m < 1440 ? tx('{0} сағ бұрын', Math.round(m / 60)) : new Date(s).toLocaleDateString('kk-KZ')
}

export default function Notifications({ group }: { group?: string }) {
  const { refreshBadge } = useMe()
  const all = useLoad(listNotifications, [])
  const { error, loading, reload } = all
  const data = group ? all.data?.filter((n) => noticeGroup(n).key === group) : all.data
  const title = group && data?.[0] ? noticeGroup(data[0]).label : 'Key To Life'
  // mark this chat's notices as read once they are on screen; unread dots stay for this visit
  useEffect(() => {
    const ids = (data ?? []).filter((n) => !n.read_at).map((n) => n.id)
    if (ids.length) markNoticesRead(ids).then(refreshBadge)
  }, [all.data, group])

  return (
    <div className="grid gap-3 pb-4">
      <PageHead title={title} back />
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
