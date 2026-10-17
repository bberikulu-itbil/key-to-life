import { useState } from 'react'
import { attendanceRate, errText, listActivities, listClasses, signOut, tgLinkUrl, tgStatus, tgUnlink } from '../lib/api'
import { openTelegram } from '../lib/telegram'
import { useMe, canAddUsers, isApprover } from '../App'
import { Button, Card, Icon, PageHead, toast, useLoad } from '../components/ui'
import Avatar from '../components/Avatar'

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
  const stats = useLoad(async () => {
    const [rate, acts] = await Promise.all([staff ? Promise.resolve(null) : attendanceRate(me.id), listActivities()])
    const mine = acts.filter((a) => a.status === 'approved' && (staff ? a.supervisor_id === me.id : a.enrollments.some((e) => e.student_id === me.id && !e.waitlisted)))
    return { rate, acts: mine.length }
  }, [me.id])
  const myClass = useLoad(async () => (staff ? (await listClasses()).find((c) => c.teacher_id === me.id || c.tutor_id === me.id) ?? null : null), [me.id])
  const [leaving, setLeaving] = useState(false)

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Профиль" />
      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.full_name} photo={me.photo} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-snug break-words">{me.full_name}</p>
            <p className="text-sm text-muted">{me.title || ROLE[me.role]}{me.class ? ` · ${me.class.name}` : ''}</p>
            <p className="text-sm text-muted truncate">{me.school.name}{me.parliament ? ' · парламент мүшесі' : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {!staff && <Stat value={stats.data?.rate == null ? '—' : `${stats.data.rate}%`} label="Қатысу" />}
          <Stat value={stats.data ? String(stats.data.acts) : '—'} label={staff ? 'Мен жетекші' : 'Іс-шара'} href="#/activities/mine" />
          {staff && myClass.data && <Stat value={myClass.data.name} label="Менің сыныбым" href={`#/class/${myClass.data.id}`} />}
        </div>
      </Card>

      <Section title="Менікі" links={[
        ['#/activities/mine', 'star', 'Менің іс-шараларым', staff ? 'Жетекшілік ететін және ұсынған' : 'Жазылған, ұсынған, жауапты'],
        ['#/leaves', 'clock', staff ? 'Рұқсаттар' : 'Менің рұқсаттарым', staff ? 'Шешім күтетіндер және бүгін берілгендер' : undefined],
        ['#/bookings', 'grid', 'Менің броньдарым'],
        ['#/calendars', 'file', 'Күнтізбелер', 'Жеке, сынып, мектеп · импорт/экспорт'],
        ['#/timetable', 'list', 'Сабақ кестесі'],
      ]} />
      {staff && <Section title="Мұғалімге" links={[
        ...(myClass.data ? [[`#/class/${myClass.data.id}`, 'users', 'Менің сыныбым', 'Оқушылар, суреттер, кім сыртта'] as [string, string, string, string]] : []),
        ...(isApprover(me) ? [['#/activities/review', 'check', 'Растау күтуде', 'Оқушылардың іс-шара ұсыныстары'] as [string, string, string, string]] : []),
        ['#/duty', 'users', 'Кезекшіліктер', 'Мұғалімдер мен орынбасарлар'],
        ['#/v/', 'check', 'QR тексеру', 'Рұқсат немесе бронь кодын тексеру'],
        ...(isApprover(me) ? [['#/chats/reports', 'flag', 'Чат шағымдары'] as [string, string, string]] : []),
      ]} />}
      {canAddUsers(me) && (
        <button type="button" onClick={onAddUser} className="flex items-center gap-3 min-h-14 px-4 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] text-left">
          <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n="userplus" size={18} /></span>
          <span className="flex-1">Пайдаланушы қосу</span><Icon n="chev" className="text-muted" />
        </button>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">Аккаунт</h2>
      <TelegramCard staff={staff} />
      {leaving ? (
        <Card className="grid gap-3">
          <p className="font-semibold">Аккаунттан шығасыз ба?</p>
          <div className="grid grid-cols-2 gap-2"><Button kind="danger" onClick={() => signOut()}>Шығу</Button><Button kind="secondary" onClick={() => setLeaving(false)}>Жоқ</Button></div>
        </Card>
      ) : <Button kind="ghost" onClick={() => setLeaving(true)}>Шығу</Button>}

      <Section title="Key To Life" links={[['#/feedback', 'flag', 'Қосымшаны дамытуға ұсыныс', 'Идея немесе қате туралы әзірлеушіге жазыңыз']]} />
    </div>
  )
}

const Stat = ({ value, label, href }: { value: string; label: string; href?: string }) => {
  const body = <><span className="block text-xl font-bold tabular-nums">{value}</span><span className="block text-xs text-muted">{label}</span></>
  return href ? <a href={href} className="rounded-md bg-surface-2 px-3 py-2.5">{body}</a> : <div className="rounded-md bg-surface-2 px-3 py-2.5">{body}</div>
}

function TelegramCard({ staff }: { staff: boolean }) {
  const st = useLoad(tgStatus, [])
  const [busy, setBusy] = useState(false)
  const link = async () => {
    setBusy(true)
    try { openTelegram((await tgLinkUrl()).url); toast('Telegram-да «Start» басыңыз, содан соң осы бетке оралыңыз') } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => { try { await tgUnlink(); st.reload() } catch (e) { toast(errText(e)) } }
  if (st.loading) return null
  return st.data ? (
    <Card className="flex items-center gap-3">
      <span className="size-10 rounded-full bg-success-soft text-success grid place-items-center"><Icon n="send" /></span>
      <span className="flex-1 min-w-0"><span className="block font-semibold">Telegram байланысқан</span>
        <span className="block text-sm text-muted truncate">{st.data.tg_username ? `@${st.data.tg_username} · ` : ''}хабарламалар ботқа келеді</span></span>
      <Button kind="ghost" onClick={unlink}>Ажырату</Button>
    </Card>
  ) : (
    <Card className="grid gap-3 bg-accent-soft">
      <div className="flex gap-3 items-start">
        <span className="size-10 rounded-full bg-accent text-on-accent grid place-items-center shrink-0"><Icon n="send" /></span>
        <div><p className="font-semibold">Telegram-ды байланыстырыңыз</p>
          <p className="text-sm">{staff ? 'Рұқсат сұраулары ботқа бірден келеді, «Рұқсат беру» батырмасымен сол жерде шешесіз.' : 'Рұқсат жауабы мен хабарламалар Telegram-ға бірден келеді.'}</p></div>
      </div>
      <div className="flex gap-2"><Button loading={busy} onClick={link}>Байланыстыру</Button><Button kind="ghost" onClick={st.reload}>Тексеру</Button></div>
    </Card>
  )
}
