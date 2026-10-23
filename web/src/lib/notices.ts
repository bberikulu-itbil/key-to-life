import { tx } from './i18n'

export type NoticeGroup = { key: string; label: string; icon: string }

/** Notifications land in separate chats: sign-ups, each room's booking requests, each chat's complaints, everything else. */
export function noticeGroup(n: { title: string; body: string | null; link: string | null }): NoticeGroup {
  const link = n.link ?? ''
  const q = new URLSearchParams(link.split('?')[1] ?? '')
  if (link.startsWith('/registrations')) return { key: 'reg', label: tx('Тіркелу өтініштері'), icon: 'userplus' }
  if (link.startsWith('/bookings/review')) {
    // body: «who · room · date time»; older ones have no room id in the link
    const room = (n.body ?? '').split(' · ')[1] ?? ''
    return { key: `room:${q.get('r') ?? room}`, label: room ? tx('Бронь · {0}', room) : tx('Бронь сұраулары'), icon: 'grid' }
  }
  if (link.startsWith('/chats/reports')) {
    const c = q.get('c')
    return c ? { key: `rep:${c}`, label: n.title, icon: 'flag' } : { key: 'rep', label: tx('Чат шағымдары'), icon: 'flag' }
  }
  return { key: 'sys', label: 'Key To Life', icon: 'bell' }
}
