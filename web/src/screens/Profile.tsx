import { useState } from 'react'
import { attendanceRate, errText, listActivities, listResources, uploadStudentPhoto, listClasses, signOut, tgLinkUrl, tgStatus, tgUnlink } from '../lib/api'
import { openTelegram } from '../lib/telegram'
import { useMe, canAddUsers, isApprover } from '../App'
import { Button, Card, Icon, PageHead, toast, useLoad } from '../components/ui'
import Avatar from '../components/Avatar'
import { LangChips } from '../components/LangPicker'
import { tx } from '../lib/i18n'

const ROLE: Record<string, string> = { student: tx('Оқушы'), teacher: tx('Мұғалім'), class_teacher: tx('Сынып жетекшісі'), deputy: tx('Тәрбие ісі жөніндегі орынбасар'), admin: tx('Әкімші') }

type Link = [string, string, string, string?]
const Section = ({ title, links }: { title: string; links: Link[] }) => (
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

export default function Profile() {
  const { me } = useMe()
  const staff = me.role !== 'student'
  const stats = useLoad(async () => {
    const [rate, acts, rooms] = await Promise.all([staff ? Promise.resolve(null) : attendanceRate(me.id), listActivities(), staff ? listResources() : Promise.resolve([])])
    const mine = acts.filter((a) => !a.class_plan && a.status === 'approved' && (staff ? a.supervisor_id === me.id : a.enrollments.some((e) => e.student_id === me.id && !e.waitlisted)))
    // rooms this person answers for (a deputy sees all, but only own ones count here)
    return { rate, acts: mine.length, rooms: rooms.filter((r) => r.manager_id === me.id || r.managers.includes(me.id)).length }
  }, [me.id])
  const myClass = useLoad(async () => (staff ? (await listClasses()).find((c) => c.teacher_id === me.id || c.tutor_id === me.id) ?? null : null), [me.id])
  const [leaving, setLeaving] = useState(false)
  // approvals, sign-ups, complaints, new accounts: for class teachers, deputies and admins
  const admin: Link[] = [
    ...(isApprover(me) ? [['#/activities/review', 'check', tx('Растау күтуде'), tx('Оқушылардың бастама ұсыныстары')] as Link] : []),
    ...(me.role === 'admin' || myClass.data?.teacher_id === me.id ? [['#/registrations', 'userplus', tx('Тіркелу өтініштері'), tx('Растауды күтетін жаңа аккаунттар')] as Link] : []),
    ...(canAddUsers(me) ? [['#/adduser', 'userplus', tx('Пайдаланушы қосу'), me.role === 'class_teacher' ? tx('Өз сыныбыңызға оқушы тіркеу') : tx('Оқушы немесе мұғалім тіркеу')] as Link] : []),
    ...(isApprover(me) ? [['#/chats/reports', 'flag', tx('Чат шағымдары')] as Link] : []),
  ]
  const [photo, setPhoto] = useState(me.photo)
  const [uploading, setUploading] = useState(false)
  const upload = async (f: File) => {
    setUploading(true)
    try { setPhoto(await uploadStudentPhoto(me.id, f)); toast(tx('Сурет сақталды')) } catch (e) { toast(errText(e)) } finally { setUploading(false) }
  }

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Профиль')} />
      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <label className={`relative shrink-0 cursor-pointer ${uploading ? 'opacity-50' : ''}`} aria-label={photo ? tx('Суретті ауыстыру') : tx('Сурет қосу')}>
            <Avatar name={me.full_name} photo={photo} size={64} />
            <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-accent text-on-accent grid place-items-center border-2 border-surface"><Icon n="plus" size={14} /></span>
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-snug break-words">{me.full_name}</p>
            <p className="text-sm text-muted">{me.title || ROLE[me.role]}{me.class ? ` · ${me.class.name}` : ''}</p>
            <p className="text-sm text-muted truncate">{me.school.name}{me.parliament ? tx(' · парламент мүшесі') : ''}</p>
          </div>
        </div>
        <div className={`grid gap-2 ${staff ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {!staff && <Stat value={stats.data?.rate == null ? '—' : `${stats.data.rate}%`} label={tx('Қатысу')} />}
          <Stat value={stats.data ? String(stats.data.acts) : '—'} label={tx('Бастамаларым')} href="#/activities/mine" />
          {staff && <Stat value={stats.data ? String(stats.data.rooms) : '—'} label={tx('Орындар')} href="#/bookings/places" />}
          {staff && <Stat value={myClass.data?.name ?? '—'} label={tx('Сыныбым')} href={myClass.data ? `#/class/${myClass.data.id}` : undefined} />}
        </div>
      </Card>

      <Section title={tx('Жалпы')} links={[
        ['#/activities/mine', 'star', tx('Менің бастамаларым'), staff ? tx('Жетекшілік ететін және ұсынған') : tx('Жазылған, ұсынған, жауапты')],
        ...(myClass.data ? [[`#/class/${myClass.data.id}`, 'users', tx('Менің сыныбым'), tx('Оқушылар, суреттер, кім сыртта')] as Link] : []),
        ['#/leaves', 'clock', staff ? tx('Рұқсаттар') : tx('Менің рұқсаттарым'), staff ? tx('Шешім күтетіндер және бүгін берілгендер') : undefined],
        ['#/bookings', 'grid', tx('Менің броньдарым')],
        ...(staff ? [] : [['#/certs', 'trophy', tx('Сертификаттарым')] as Link]),
        ['#/timetable', 'list', tx('Сабақ кестесі')],
        ['#/calendars', 'file', tx('Күнтізбелер'), tx('Жеке, сынып, мектеп · импорт/экспорт')],
        ...(staff ? [['#/duty', 'users', tx('Кезекшіліктер'), tx('Мұғалімдер мен орынбасарлар')], ['#/v/', 'check', tx('QR тексеру'), tx('Камерамен рұқсат немесе бронь кодын тексеру')]] as Link[] : []),
      ]} />
      {admin.length > 0 && <Section title={tx('Әкімшілік')} links={admin} />}

      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Жүйе баптаулары')}</h2>
      <Card className="grid gap-2"><p className="font-semibold">{tx('Тіл')}</p><LangChips signedIn /></Card>
      <TelegramCard staff={staff} />
      <Section title={tx('Қосымша жайлы')} links={[
        ['#/about/news', 'megaphone', tx('Жаңалықтар'), tx('Соңғы нұсқада не өзгерді')],
        ['#/about/tips', 'star', tx('Кеңестер'), tx('Қосымшаны тиімді қолдану')],
        ['#/feedback', 'flag', tx('Қосымшаны дамытуға ұсыныс'), tx('Идея немесе қате туралы әзірлеушіге жазыңыз')],
      ]} />
      {leaving ? (
        <Card className="grid gap-3">
          <p className="font-semibold">{tx('Аккаунттан шығасыз ба?')}</p>
          <div className="grid grid-cols-2 gap-2"><Button kind="danger" onClick={() => signOut()}>{tx('Шығу')}</Button><Button kind="secondary" onClick={() => setLeaving(false)}>{tx('Жоқ')}</Button></div>
        </Card>
      ) : <Button kind="ghost" onClick={() => setLeaving(true)}>{tx('Шығу')}</Button>}
      <p className="text-center text-xs text-muted">{tx('Нұсқа {0}', __APP_VERSION__)}</p>
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
    try { openTelegram((await tgLinkUrl()).url); toast(tx('Telegram-да «Start» басыңыз, содан соң осы бетке оралыңыз')) } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const unlink = async () => { try { await tgUnlink(); st.reload() } catch (e) { toast(errText(e)) } }
  if (st.loading) return null
  return st.data ? (
    <Card className="flex items-center gap-3">
      <span className="size-10 rounded-full bg-success-soft text-success grid place-items-center"><Icon n="send" /></span>
      <span className="flex-1 min-w-0"><span className="block font-semibold">{tx('Telegram байланысқан')}</span>
        <span className="block text-sm text-muted truncate">{tx('{0}хабарламалар ботқа келеді', st.data.tg_username ? `@${st.data.tg_username} · ` : '')}</span></span>
      <Button kind="ghost" onClick={unlink}>{tx('Ажырату')}</Button>
    </Card>
  ) : (
    <Card className="grid gap-3 bg-accent-soft">
      <div className="flex gap-3 items-start">
        <span className="size-10 rounded-full bg-accent text-on-accent grid place-items-center shrink-0"><Icon n="send" /></span>
        <div><p className="font-semibold">{tx('Telegram-ды байланыстырыңыз')}</p>
          <p className="text-sm">{staff ? tx('Рұқсат сұраулары ботқа бірден келеді, «Рұқсат беру» батырмасымен сол жерде шешесіз.') : tx('Рұқсат жауабы мен хабарламалар Telegram-ға бірден келеді.')}</p></div>
      </div>
      <div className="flex gap-2"><Button loading={busy} onClick={link}>{tx('Байланыстыру')}</Button><Button kind="ghost" onClick={st.reload}>{tx('Тексеру')}</Button></div>
    </Card>
  )
}
