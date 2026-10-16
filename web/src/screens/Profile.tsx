import { attendanceRate, signOut } from '../lib/api'
import { useMe, canAddUsers } from '../App'
import { Button, Card, Icon, PageHead, useLoad } from '../components/ui'

const ROLE: Record<string, string> = { student: 'Оқушы', teacher: 'Мұғалім', class_teacher: 'Сынып жетекшісі', deputy: 'Тәрбие ісі жөніндегі орынбасар', admin: 'Әкімші' }

const Section = ({ title, links }: { title: string; links: [string, string, string, string?][] }) => (
  <section className="grid gap-2">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{title}</h2>
    <nav aria-label={title} className="bg-surface rounded-lg shadow-card border border-[var(--card-line,transparent)] divide-y divide-line">
      {links.map(([href, icon, label, hint]) => (
        <a key={href} href={href} className="flex items-center gap-3 min-h-14 px-4 py-2">
          <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} size={18} /></span>
          <span className="flex-1 min-w-0"><span className="block">{label}</span>{hint && <span className="block text-sm text-muted">{hint}</span>}</span>
          <Icon n="chev" className="text-muted" />
        </a>
      ))}
    </nav>
  </section>
)

export default function Profile({ onAddUser }: { onAddUser: () => void }) {
  const { me } = useMe()
  const staff = me.role !== 'student'
  const rate = useLoad(() => (staff ? Promise.resolve(null) : attendanceRate(me.id)), [me.id])

  return (
    <div className="grid gap-3 pb-4">
      <PageHead title="Профиль" />
      <Card className="flex items-center gap-3">
        <div className="size-14 rounded-full bg-accent-soft text-accent grid place-items-center text-lg font-bold" aria-hidden>{me.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold break-words">{me.full_name}</p>
          <p className="text-sm text-muted">{me.title || ROLE[me.role]}{me.class ? ` · ${me.class.name}` : ''}</p>
          <p className="text-sm text-muted">{me.school.name}</p>
        </div>
        {!staff && <div className="text-right"><p className="text-xl font-bold tabular-nums">{rate.data == null ? '—' : `${rate.data}%`}</p><p className="text-xs text-muted">қатысу</p></div>}
      </Card>

      <Section title="Менікі" links={[
        ['#/bookings', 'grid', 'Менің броньдарым'],
        ['#/leaves', 'clock', staff ? 'Рұқсаттар' : 'Менің рұқсаттарым', staff ? 'Шешім күтетіндер және бүгін берілгендер' : undefined],
        ['#/calendars', 'file', 'Менің күнтізбелерім', 'Жеке, сынып, мектеп, олимпиада · импорт/экспорт'],
        ['#/duty', 'users', 'Кезекшіліктер', 'Мұғалімдер мен орынбасарлар'],
      ]} />
      <Section title="Оқу" links={[
        ['#/timetable', 'clock', 'Сабақ кестесі'],
        ['#/my/olympiad', 'check', 'Олимпиада', 'Силабус және қатысу'],
        ['#/my/clubs', 'users', 'Үйірме, курс'],
        ['#/my/competitions', 'grid', 'Жарыстар, челлендждер'],
      ]} />
      {staff && <Section title="Құралдар" links={[['#/v/', 'check', 'QR тексеру', 'Рұқсат немесе бронь кодын тексеру']]} />}

      <div className="grid gap-2 mt-2">
        {canAddUsers(me) && <Button kind="secondary" onClick={onAddUser}>Пайдаланушы қосу</Button>}
        <Button kind="ghost" onClick={() => signOut()}>Шығу</Button>
      </div>
    </div>
  )
}
