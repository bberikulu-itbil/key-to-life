import { useState } from 'react'
import { attendanceRate, errText, listActivities, listResources, uploadStudentPhoto, listClasses, addAccount, forgetAccount, savedAccounts, signOutAndSwitch, switchAccount, tgLinkUrl, tgStatus, tgUnlink } from '../lib/api'
import { openTelegram } from '../lib/telegram'
import { useMe, canAddUsers, isApprover } from '../App'
import { Button, Card, Icon, PageHead, Sheet, toast, useLoad } from '../components/ui'
import { TILE, Tile } from '../components/MenuArt'
import Avatar from '../components/Avatar'
import { LangChips } from '../components/LangPicker'
import { tx } from '../lib/i18n'


type Tint = keyof typeof TILE
type Link = [string, string, string, string?, Tint?]
const Section = ({ title, links }: { title: string; links: Link[] }) => (
  <section className="grid gap-2">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{title}</h2>
    <nav aria-label={title} className="bg-surface rounded-[22px] shadow-card border border-[var(--card-line,transparent)] divide-y divide-line overflow-hidden">
      {links.map(([href, icon, label, hint, tint]) => (
        <a key={href} href={href} className="flex items-center gap-3 min-h-14 px-4 py-2 active:bg-surface-2">
          <span className={`size-9 rounded-[11px] grid place-items-center shadow-card ${TILE[tint ?? 'qr']}`}><Icon n={icon} size={18} /></span>
          <span className="flex-1 min-w-0"><span className="block font-medium">{label}</span>{hint && <span className="block text-sm text-muted">{hint}</span>}</span>
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
  const [accounts, setAccounts] = useState(false)
  // approvals, sign-ups, complaints, new accounts: for class teachers, deputies and admins
  const admin: Link[] = [
    ...(me.role === 'admin' || me.role === 'deputy' ? [['#/class', 'users', tx('Сыныптар мен қызметкерлер'), tx('Мұғалімдер, тәрбиешілер, қызметкерлер'), 'plan'] as Link] : []),
    ...(isApprover(me) ? [['#/activities/review', 'check', tx('Растау күтуде'), tx('Оқушылардың бастама ұсыныстары'), 'idea'] as Link] : []),
    ...(me.role === 'admin' || myClass.data?.teacher_id === me.id ? [['#/registrations', 'userplus', tx('Тіркелу өтініштері'), tx('Растауды күтетін жаңа аккаунттар'), 'pass'] as Link] : []),
    ...(canAddUsers(me) ? [['#/adduser', 'userplus', tx('Пайдаланушы қосу'), me.role === 'class_teacher' ? tx('Өз сыныбыңызға оқушы тіркеу') : tx('Оқушы немесе мұғалім тіркеу'), 'user'] as Link] : []),
    ...(isApprover(me) ? [['#/chats/reports', 'flag', tx('Чат шағымдары'), undefined, 'food'] as Link] : []),
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
      <div className="rounded-[22px] p-4 bg-[linear-gradient(135deg,#22386e,#16264f)] text-white shadow-card grid gap-4">
        <div className="flex items-center gap-3">
          <label className={`relative shrink-0 cursor-pointer ${uploading ? 'opacity-50' : ''}`} aria-label={photo ? tx('Суретті ауыстыру') : tx('Сурет қосу')}>
            <span className="block rounded-full ring-2 ring-gold"><Avatar name={me.full_name} photo={photo} size={64} /></span>
            <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-gold text-on-gold grid place-items-center border-2 border-[#16264f]"><Icon n="plus" size={14} /></span>
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-snug break-words">{me.full_name}</p>
            <p className="text-sm opacity-80">{me.title || ROLE[me.role]}{me.class ? ` · ${me.class.name}` : ''}</p>
            <p className="text-sm opacity-80 truncate">{me.school.name}{me.parliament ? tx(' · парламент мүшесі') : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="rounded-[14px] bg-white/10 px-3 py-2.5 min-w-0">
            <p className="text-xs opacity-80">{tx('Жауапкершілігім')}</p>
            <div className="flex gap-4 mt-0.5">
              <a href="#/activities/mine" className="min-w-0"><span className="text-xl font-bold tabular-nums text-gold">{stats.data ? stats.data.acts : '—'}</span> <span className="text-xs opacity-90">{tx('Бастамалар')}</span></a>
              {staff ? <a href="#/bookings/places" className="min-w-0"><span className="text-xl font-bold tabular-nums text-gold">{stats.data ? stats.data.rooms : '—'}</span> <span className="text-xs opacity-90">{tx('Орындар')}</span></a>
                : <span className="min-w-0"><span className="text-xl font-bold tabular-nums text-gold">{stats.data?.rate == null ? '—' : `${stats.data.rate}%`}</span> <span className="text-xs opacity-90">{tx('Қатысу')}</span></span>}
            </div>
          </div>
          <Stat value={me.class?.name ?? myClass.data?.name ?? '—'} label={tx('Сыныбым')} href={myClass.data ? `#/class/${myClass.data.id}` : undefined} />
        </div>
      </div>

      {(() => {
        const dorm = me.dorm || (staff && (myClass.data || me.staff_kind === 'dorm_head' || me.role === 'deputy' || me.role === 'admin'))
        return (
          <nav aria-label={tx('Жалпы')} className="grid grid-cols-6 gap-2.5">
            {dorm && <Tile href="#/dorm" art="bed" size="mid" className={`col-span-2 h-24 ${TILE.bed}`} title={tx('Жатақхана')} />}
            {(staff || dorm) && <Tile href={staff ? '#/duty' : '#/dorm'} art="duty" size="mid" className={`${dorm ? 'col-span-2' : 'col-span-3'} h-24 ${TILE.duty}`} title={tx('Кезекшілік')} />}
            <Tile href="#/timetable" art="clock" size="mid" className={`${dorm ? 'col-span-2' : staff ? 'col-span-3' : 'col-span-6'} h-24 ${TILE.clock}`} title={tx('Сабақ кестесі')} />
          </nav>
        )
      })()}

      <Section title={tx('Менікі')} links={[
        ['#/bookings', 'grid', tx('Менің броньдарым'), undefined, 'book'],
        ['#/leaves', 'clock', staff ? tx('Рұқсаттар') : tx('Менің рұқсаттарым'), staff ? tx('Шешім күтетіндер және бүгін берілгендер') : undefined, 'pass'],
        ['#/calendars', 'file', tx('Күнтізбелерім'), tx('Жеке, сынып, мектеп · импорт/экспорт'), 'plan'],
        ...(staff ? [] : [['#/certs', 'trophy', tx('Жетістіктерім'), tx('Сертификаттар'), 'cert'] as Link]),
        ...(staff ? [] : [['#/resources', 'book', tx('Сынып ресурстары'), tx('Кітаптар, фильмдер, шаралар, сынып қоры'), 'book'] as Link]),
        ...(staff ? [] : [['#/mentor', 'user', tx('Жеке кездесулерім'), tx('Жетекшімен кездесулер мен міндеттер'), 'plan'] as Link]),
      ]} />
      {admin.length > 0 && <Section title={tx('Әкімшілік')} links={admin} />}

      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Жүйе баптаулары')}</h2>
      <Card className="grid gap-2"><p className="font-semibold">{tx('Тіл')}</p><LangChips signedIn /></Card>
      <TelegramCard staff={staff} />
      <Section title={tx('Қосымша жайлы')} links={[
        ['#/about/news', 'megaphone', tx('Жаңалықтар'), tx('Соңғы нұсқада не өзгерді'), 'feed'],
        ['#/about/tips', 'star', tx('Кеңестер'), tx('Қосымшаны тиімді қолдану'), 'habit'],
        ['#/feedback', 'flag', tx('Қосымшаны дамытуға ұсыныс'), tx('Идея немесе қате туралы әзірлеушіге жазыңыз'), 'poll'],
      ]} />
      {leaving ? (
        <Card className="grid gap-3">
          <p className="font-semibold">{tx('Аккаунттан шығасыз ба?')}</p>
          <div className="grid grid-cols-2 gap-2"><Button kind="danger" onClick={() => signOutAndSwitch(me.id)}>{tx('Шығу')}</Button><Button kind="secondary" onClick={() => setLeaving(false)}>{tx('Жоқ')}</Button></div>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button kind="secondary" onClick={() => setAccounts(true)}><Icon n="users" size={18} />{tx('Аккаунт ауыстыру')}</Button>
          <Button kind="ghost" onClick={() => setLeaving(true)}>{tx('Шығу')}</Button>
        </div>
      )}
      {accounts && <Accounts onClose={() => setAccounts(false)} />}
      <p className="text-center text-xs text-muted">{tx('Нұсқа {0}', __APP_VERSION__)}</p>
    </div>
  )
}

const Stat = ({ value, label, href }: { value: string; label: string; href?: string }) => {
  const body = <><span className="block text-xl font-bold tabular-nums text-gold">{value}</span><span className="block text-xs opacity-80">{label}</span></>
  return href ? <a href={href} className="rounded-[14px] bg-white/10 px-3 py-2.5">{body}</a> : <div className="rounded-[14px] bg-white/10 px-3 py-2.5">{body}</div>
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

const ROLE: Record<string, string> = { student: tx('Оқушы'), teacher: tx('Мұғалім'), class_teacher: tx('Сынып жетекшісі'), deputy: tx('Орынбасар'), admin: tx('Әкімші') }

/** Accounts signed in on this device: switch in one tap, add another, or forget one. */
function Accounts({ onClose }: { onClose: () => void }) {
  const { me } = useMe()
  const [list, setList] = useState(savedAccounts)
  const [busy, setBusy] = useState('')
  const pick = async (id: string) => {
    setBusy(id)
    try { await switchAccount(id) } catch (e) { toast(errText(e)); setList(savedAccounts()); setBusy('') }
  }
  return (
    <Sheet title={tx('Аккаунт ауыстыру')} onClose={onClose}>
      <div className="grid gap-2">
        <ul className="grid gap-2">{list.map((a) => {
          const current = a.id === me.id
          return (
            <li key={a.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${current ? 'bg-accent-soft' : 'bg-surface-2'}`}>
              <button type="button" disabled={current || !!busy} onClick={() => pick(a.id)} className="flex flex-1 min-w-0 items-center gap-3 text-left min-h-11">
                <Avatar name={a.name} photo={a.photo} size={40} />
                <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{a.name}</span><span className="block text-xs text-muted">{current ? tx('Қазір осы аккаунттасыз') : ROLE[a.role] ?? a.role}</span></span>
                {current ? <Icon n="check" className="text-accent" /> : busy === a.id ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden /> : <Icon n="chev" className="text-muted" />}
              </button>
              {!current && <button type="button" aria-label={tx('{0} аккаунтын тізімнен алып тастау', a.name)} onClick={() => { forgetAccount(a.id); setList(savedAccounts()) }} className="size-9 grid place-items-center rounded-md text-muted hover:bg-surface"><Icon n="x" size={16} /></button>}
            </li>
          )
        })}</ul>
        <Button kind="secondary" onClick={() => addAccount()}><Icon n="plus" size={18} />{tx('Басқа аккаунт қосу')}</Button>
        <p className="text-xs text-muted">{tx('Аккаунттар тек осы құрылғыда сақталады. Басқа аккаунтқа кіргенде, бұл аккаунт тізімде қалады.')}</p>
      </div>
    </Sheet>
  )
}
