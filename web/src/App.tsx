import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getMe, listActivities, myChatFlags, myChats, myRoles, myRegistration, setMyLang, supabase, tgLink, unreadCount, type Me, type Registration } from './lib/api'
import Registrations from './screens/Registrations'
import { Pending } from './screens/Register'
import { chosen, lang, rememberLang, setLang } from './lib/i18n'
import { FirstRunLang } from './components/LangPicker'
import { inTelegram, syncBackButton, tg } from './lib/telegram'
import Feed, { PostPage } from './screens/Feed'
import Search from './screens/Search'
import Surveys, { SurveyNew, SurveyTry, SurveyView } from './screens/Surveys'
import { Icon, PageHead, Sheet, Toaster, go, useLoad, usePath } from './components/ui'
import { ledActivities } from './components/FeedCard'
import Login from './screens/Login'
import Plan from './screens/Plan'
import Chats, { Reports } from './screens/Chats'
import ChatRoom from './screens/ChatRoom'
import Activities from './screens/Activities'
import ActivityDetail from './screens/ActivityDetail'
import ActivityForm from './screens/ActivityForm'
import ActivitySettings from './screens/ActivitySettings'
import Notifications from './screens/Notifications'
import Profile from './screens/Profile'
import Book from './screens/Book'
import Bookings from './screens/Bookings'
import LeaveForm from './screens/LeaveForm'
import Leaves from './screens/Leaves'
import Verify from './screens/Verify'
import Duty from './screens/Duty'
import Calendars from './screens/Calendars'
import Timetable from './screens/Timetable'
import MyClass from './screens/MyClass'
import MyActivities from './screens/MyActivities'
import Dorm from './screens/Dorm'
import Council from './screens/Council'
import AddUser from './screens/AddUser'
import Feedback from './screens/Feedback'
import About from './screens/About'
import Certificate, { MyCertificates } from './screens/Certificate'
import { MenuCard } from './components/HomeWidgets'
import { GoalForm, HabitForm } from './components/Goals'
import { TILE, Tile } from './components/MenuArt'
import { tx } from './lib/i18n'

// the canteen's Google Form for feedback
const CANTEEN_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSc4BWrq8LtQ3axHfn2gw2xrMQqmjfVLRgIlzYW6Uc9zVzFqxQ/viewform'

const Ctx = createContext<{ me: Me; refreshBadge: () => void }>(null!)
export const useMe = () => useContext(Ctx)

export const isApprover = (me: Me) => me.role === 'deputy' || me.role === 'admin' || me.role === 'class_teacher'
export const canAddUsers = isApprover

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  const [err, setErr] = useState('')
  const [reg, setReg] = useState<Registration | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setMe(null); return }
    // no profile yet: a self sign-up waiting for approval
    getMe(session.user.id).then(setMe, async (e) => {
      const r = await myRegistration(session.user.id).catch(() => null)
      if (r) setReg(r); else setErr(String(e.message ?? e))
    })
  }, [session?.user.id])
  // a language picked on another device follows the account; one picked here is saved to it (the bot uses it)
  useEffect(() => {
    if (!me) return
    // same language as now: just keep it, no reload
    if (!chosen && me.lang) { if (me.lang === lang) rememberLang(me.lang); else setLang(me.lang) }
    else if (chosen && me.lang !== chosen) setMyLang(chosen).catch(() => {})
  }, [me])

  if (session === undefined || (session && !me && !err && !reg)) return <div className="min-h-dvh grid place-items-center text-muted">{tx('Жүктелуде…')}</div>
  if (!session) return <><Login /><Toaster /></>
  if (!me && reg) return <Pending name={reg.full_name} status={reg.status} note={reg.note} onCheck={() => location.reload()} onSignOut={() => { setReg(null); supabase.auth.signOut() }} />
  if (!me) return <div className="p-6 text-danger" role="alert">{tx('Профиль табылмады:')}{' '}{err}. <button className="underline" onClick={() => supabase.auth.signOut()}>{tx('Шығу')}</button></div>
  if (!chosen && !me.lang) return <><FirstRunLang signedIn /><Toaster /></>
  if (!chosen && me.lang !== lang) return <div className="min-h-dvh grid place-items-center text-muted">{tx('Жүктелуде…')}</div>
  return <Shell me={me} />
}

function Shell({ me }: { me: Me }) {
  const path = usePath()
  const [badge, setBadge] = useState(0)
  const [sheet, setSheet] = useState<null | 'menu' | 'adduser' | 'goal' | 'habit'>(null)
  const [planKey, setPlanKey] = useState(0)
  // who may write in the feed: staff, parliament, and students who lead an initiative or hold a role in one
  const voice = useLoad(async () => me.role !== 'student' || me.parliament ? true
    : Promise.all([myRoles(me.id), listActivities()]).then(([r, a]) => r.length > 0 || ledActivities(me, a).length > 0), [me.id])
  const toPlan = () => { setSheet(null); setPlanKey(planKey + 1); go('/plan') }
  // notifications + unread chat messages; shortcut: polled on navigation, add realtime for the badge if it feels stale
  // muted and archived chats do not count
  const refreshBadge = () => { Promise.all([unreadCount(), myChats().catch(() => []), myChatFlags().catch(() => [])]).then(([n, c, f]) => {
    const quiet = new Set(f.map((x) => x.chat_id))
    setBadge(n + c.reduce((s, x) => s + (quiet.has(x.id) ? 0 : x.unread), 0))
  }) }
  useEffect(refreshBadge, [path])
  useEffect(() => syncBackButton(['/', '/plan', '/chats', '/profile'].includes(path) || path.startsWith('/?')), [path])
  // signed in with ЖСН inside Telegram → remember this Telegram account
  useEffect(() => { if (inTelegram && tg) tgLink(tg.initData).catch(() => {}) }, [me.id])

  const [, seg, id] = path.split('?')[0].split('/')
  let screen
  if (seg === 'a' && id === 'new') screen = <ActivityForm />
  else if (seg === 'a' && id === 'copy') screen = <ActivityForm key={path} copyOf={path.split('/')[3]} />
  else if (seg === 'a' && path.endsWith('/settings')) screen = <ActivitySettings id={id} />
  else if (seg === 'a' && path.endsWith('/edit')) screen = <ActivityForm id={id} />
  else if (seg === 'a' && id) screen = <ActivityDetail id={id} />
  else if (seg === 'activities' && (id === 'mine' || id === 'review' || id === 'archive')) screen = <Activities tab={id} />
  else if (seg === 'book') screen = <Book key={path} resource={id || undefined} />
  else if (seg === 'search') screen = <Search />
  else if (seg === 'bookings') screen = <Bookings tab={(id as 'mine' | 'review' | 'places') || 'mine'} />
  else if (seg === 'leave') screen = <LeaveForm />
  else if (seg === 'leaves') screen = <Leaves />
  else if (seg === 'v') screen = <Verify code={id || undefined} />
  else if (seg === 'duty') screen = <Duty />
  else if (seg === 'calendars') screen = <Calendars />
  else if (seg === 'timetable') screen = <Timetable classId={id} />
  else if (seg === 'class') screen = <MyClass classId={id} />
  else if (seg === 'council') screen = <Council key={path} classId={id} />
  else if (seg === 'dorm') screen = <Dorm key={path} sub={id} arg={path.split('?')[0].split('/')[3]} />
  else if (seg === 'my') screen = <MyActivities kind={id} />
  else if (seg === 'chats' && id === 'system') screen = <Notifications key={path} group={new URLSearchParams(path.split('?')[1] ?? '').get('g') ?? undefined} />
  else if (seg === 'chats' && id === 'reports') screen = <Reports />
  else if (seg === 'chats') screen = <Chats />
  else if (seg === 'c' && id) screen = <ChatRoom key={id} id={id} />
  else if (seg === 'notifications') screen = <Notifications />
  else if (seg === 'plan') screen = <Plan key={planKey} />
  else if (seg === 'lost') screen = <Feed key="lost" query="" page="lost" />
  else if (seg === 'events') screen = <Feed key="events" query="" page="events" />
  else if (seg === 'proposals') screen = <Feed key="proposals" query="" page="proposals" />
  else if (seg === 'p' && id) screen = <PostPage key={id} id={id} />
  else if (seg === 'menu') screen = <div className="grid gap-3 pb-6"><PageHead title={tx('Асхана')} back /><MenuCard me={me} />
    <a href={CANTEEN_FORM} target="_blank" rel="noopener" onClick={(e) => { if (inTelegram && tg?.openLink) { e.preventDefault(); tg.openLink(CANTEEN_FORM) } }}
      className="h-12 rounded-md bg-accent-soft text-accent font-semibold inline-flex items-center justify-center gap-2"><Icon n="chat" size={20} />{tx('Асхана туралы пікір жазу')}</a></div>
  else if (seg === 'feedback') screen = <Feedback />
  else if (seg === 'registrations') screen = <Registrations />
  else if (seg === 'surveys' && id === 'new') screen = <SurveyNew />
  else if (seg === 'surveys' && id?.startsWith('try-')) screen = <SurveyTry type={id.slice(4)} />
  else if (seg === 'surveys' && id) screen = <SurveyView key={id} id={id} />
  else if (seg === 'surveys') screen = <Surveys />
  else if (seg === 'profile') screen = <Profile />
  else if (seg === 'adduser') screen = <div className="grid gap-3 pb-6"><PageHead title={tx('Пайдаланушы қосу')} back /><AddUser /></div>
  else if (seg === 'certs') screen = <MyCertificates />
  else if (seg === 'cert' && id) screen = <Certificate key={id} code={id} />
  else if (seg === 'about') screen = <About tab={id === 'tips' ? 'tips' : 'news'} />
  else screen = <Feed query={path.split('?')[1] ?? ''} />

  const tabs = [['/', 'home', tx('Home')], ['/plan', 'clock', tx('Жоспар')], ['+', 'plus', tx('Әрекет')], ['/chats', 'chat', tx('Чаттар')], ['/profile', 'user', tx('Профиль')]] as const
  const active = (p: string) => (p === '/profile' ? ['profile', 'adduser', 'about', 'feedback', 'certs', 'cert', 'dorm'].includes(seg) : p === '/' ? path === '/' || path.startsWith('/?') || ['a', 'p', 'activities', 'lost', 'events', 'proposals', 'surveys', 'book', 'bookings', 'search', 'menu'].includes(seg) : p === '/chats' ? seg === 'chats' || seg === 'c' || seg === 'notifications' : path.startsWith(p))

  return (
    <Ctx.Provider value={{ me, refreshBadge }}>
      <SideNav me={me} seg={seg} active={active} badge={badge} onPlus={() => setSheet('menu')} />
      <div className="min-h-dvh pb-[calc(80px+env(safe-area-inset-bottom))] lg:pb-8 lg:pl-72">
        <main className={`mx-auto ${seg === 'council' ? 'max-w-[640px] lg:max-w-[1100px]' : 'max-w-[640px]'} pt-[max(8px,env(safe-area-inset-top))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]`}>{screen}</main>
      </div>
      <nav aria-label={tx('Негізгі мәзір')} className="print:hidden lg:hidden fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[640px] grid grid-cols-5 h-16 items-center">
          {tabs.map(([p, icon, label]) =>
            p === '+' ? (
              <button key={p} type="button" onClick={() => setSheet('menu')} aria-label={tx('Әрекеттер мәзірі')}
                className="justify-self-center -mt-7 size-14 rounded-full bg-hero text-gold grid place-items-center shadow-pop ring-4 ring-surface"><Icon n="plus" size={26} /></button>
            ) : (
              <a key={p} href={`#${p}`} aria-current={active(p) ? 'page' : undefined}
                className={`relative grid justify-items-center gap-0.5 text-[11px] h-14 content-center ${active(p) ? 'text-accent font-semibold' : 'text-muted'}`}>
                <span className={`h-7 w-12 rounded-full grid place-items-center ${active(p) ? 'bg-accent-soft' : ''}`}><Icon n={icon} size={21} /></span>{label}
                {p === '/chats' && badge > 0 && <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-xs font-semibold grid place-items-center" aria-label={tx('{0} оқылмаған', badge)}>{badge > 9 ? '9+' : badge}</span>}
              </a>
            ),
          )}
        </div>
      </nav>

      {sheet === 'menu' && (
        <Sheet title={tx('Не істейміз?')} onClose={() => setSheet(null)}>
          <div className="grid grid-cols-6 gap-3">
            <Tile art="qr" size="big" className={`col-span-6 h-32 ${TILE.qr}`} title={tx('QR тексеру')} text={tx('Рұқсат, бронь, сертификат, жатақхана заты')} onClick={() => { setSheet(null); go('/v/') }} />
            <Tile art="pass" className={`col-span-3 h-36 ${TILE.pass}`} title={tx('Рұқсат сұрау')} text={me.role === 'student' ? tx('Сыртқа шығу, сабақтан') : tx('Өтініштер, бүгінгілер')} onClick={() => { setSheet(null); go(me.role === 'student' ? '/leave/new' : '/leaves') }} />
            <Tile art="book" className={`col-span-3 h-36 ${TILE.book}`} title={tx('Броньдау')} text={tx('Кабинет, спортзал, шай бөлмесі')} onClick={() => { setSheet(null); go('/book') }} />
            {voice.data && <Tile art="feed" className={`col-span-3 h-36 ${TILE.feed}`} title={tx('Лента жазу')} text={tx('Жаңалық, хабарландыру')} onClick={() => { setSheet(null); go('/?new=1') }} />}
            <Tile art="idea" className={`${voice.data ? 'col-span-3 h-36' : 'col-span-6 h-28'} ${TILE.idea}`} title={tx('Бастама ұсыну')} text={tx('Жарыс, үйірме, клуб, команда')} onClick={() => { setSheet(null); go('/a/new') }} />
            {(() => {
              const span = me.role === 'admin' ? 'col-span-2' : 'col-span-3'
              return <>
                <Tile art="plan" size="small" className={`${span} ${TILE.plan}`} title={tx('Жаңа жоспар')} beta onClick={() => setSheet('goal')} />
                <Tile art="habit" size="small" className={`${span} ${TILE.habit}`} title={tx('Жаңа әдет')} beta onClick={() => setSheet('habit')} />
                {me.role === 'admin' && <Tile art="user" size="small" className={`${span} ${TILE.user}`} title={tx('Пайдаланушы қосу')} onClick={() => setSheet('adduser')} />}
              </>
            })()}
          </div>
        </Sheet>
      )}
      {sheet === 'goal' && <Sheet title={tx('Жаңа жоспар')} onClose={() => setSheet(null)}><GoalForm parent={null} pick onDone={toPlan} /></Sheet>}
      {sheet === 'habit' && <Sheet title={tx('Жаңа әдет')} onClose={() => setSheet(null)}><HabitForm onDone={toPlan} /></Sheet>}
      {sheet === 'adduser' && <Sheet title={tx('Пайдаланушы қосу')} onClose={() => setSheet(null)}><AddUser /></Sheet>}
      <Toaster />
    </Ctx.Provider>
  )
}



/** Wide screens: the main tabs and, for staff, the class management sections on the left. */
function SideNav({ me, seg, active, badge, onPlus }: { me: Me; seg: string; active: (p: string) => boolean; badge: number; onPlus: () => void }) {
  const link = (href: string, icon: string, label: string, on: boolean, extra?: ReactNode) => (
    <a key={href} href={`#${href}`} aria-current={on ? 'page' : undefined}
      className={`flex items-center gap-3 h-11 px-3 rounded-md text-sm ${on ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface-2'}`}><Icon n={icon} size={20} /><span className="flex-1">{label}</span>{extra}</a>
  )
  const soon = (icon: string, label: string) => (
    <span key={label} aria-disabled="true" className="flex items-center gap-3 h-11 px-3 rounded-md text-sm text-muted"><Icon n={icon} size={20} /><span className="flex-1 whitespace-nowrap">{label}</span><span className="text-[11px]">{tx('жақында')}</span></span>
  )
  return (
    <aside aria-label={tx('Бүйір мәзір')} className="print:hidden hidden lg:flex fixed inset-y-0 left-0 z-30 w-72 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3">
      <p className="px-3 py-3 text-lg font-bold">Key To Life</p>
      <button type="button" onClick={onPlus} className="mb-2 flex items-center justify-center gap-2 h-11 rounded-md bg-hero text-gold font-semibold"><Icon n="plus" size={20} />{tx('Әрекет')}</button>
      {link('/', 'home', tx('Home'), active('/'))}
      {link('/plan', 'clock', tx('Жоспар'), active('/plan'))}
      {link('/chats', 'chat', tx('Чаттар'), active('/chats'), badge > 0 ? <span className="min-w-5 h-5 px-1 rounded-full bg-danger text-white text-xs font-semibold grid place-items-center">{badge > 9 ? '9+' : badge}</span> : null)}
      {link('/profile', 'user', tx('Профиль'), active('/profile') && seg !== 'dorm')}
      {me.role !== 'student' && <>
        <p className="mt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">{tx('Сыныпты басқару')}</p>
        {link('/class', 'users', tx('Менің сыныбым'), seg === 'class')}
        {link('/dorm', 'home', tx('Жатақхана'), seg === 'dorm')}
        {soon('book', tx('Сынып ресурстары'))}
        {soon('file', tx('Журнал және күнтізбе'))}
        {soon('user', tx('Жеке кездесулер'))}
        {link('/council', 'lock', tx('Сынып кеңесі'), seg === 'council')}
      </>}
    </aside>
  )
}
