import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getMe, supabase, unreadCount, type Me } from './lib/api'
import { Icon, Sheet, Toaster, go, usePath } from './components/ui'
import Login from './screens/Login'
import Home from './screens/Home'
import Activities from './screens/Activities'
import ActivityDetail from './screens/ActivityDetail'
import ActivityForm from './screens/ActivityForm'
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
import MyActivities from './screens/MyActivities'
import AddUser from './screens/AddUser'

const Ctx = createContext<{ me: Me; refreshBadge: () => void }>(null!)
export const useMe = () => useContext(Ctx)

export const isApprover = (me: Me) => me.role === 'deputy' || me.role === 'admin' || me.role === 'class_teacher'
export const canAddUsers = isApprover

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setMe(null); return }
    getMe(session.user.id).then(setMe, (e) => setErr(String(e.message ?? e)))
  }, [session?.user.id])

  if (session === undefined || (session && !me && !err)) return <div className="min-h-dvh grid place-items-center text-muted">Жүктелуде…</div>
  if (!session) return <><Login /><Toaster /></>
  if (!me) return <div className="p-6 text-danger" role="alert">Профиль табылмады: {err}. <button className="underline" onClick={() => supabase.auth.signOut()}>Шығу</button></div>
  return <Shell me={me} />
}

function Shell({ me }: { me: Me }) {
  const path = usePath()
  const [badge, setBadge] = useState(0)
  const [sheet, setSheet] = useState<null | 'menu' | 'adduser'>(null)
  const refreshBadge = () => { unreadCount().then(setBadge) }
  useEffect(refreshBadge, [path])

  const [, seg, id] = path.split('/')
  let screen
  if (seg === 'a' && id === 'new') screen = <ActivityForm />
  else if (seg === 'a' && path.endsWith('/edit')) screen = <ActivityForm id={id} />
  else if (seg === 'a' && id) screen = <ActivityDetail id={id} />
  else if (seg === 'activities') screen = <Activities tab={(id as 'all' | 'mine' | 'review') || 'all'} />
  else if (seg === 'book') screen = <Book />
  else if (seg === 'bookings') screen = <Bookings tab={(id as 'mine' | 'review' | 'places') || 'mine'} />
  else if (seg === 'leave') screen = <LeaveForm />
  else if (seg === 'leaves') screen = <Leaves />
  else if (seg === 'v') screen = <Verify code={id || undefined} />
  else if (seg === 'duty') screen = <Duty />
  else if (seg === 'calendars') screen = <Calendars />
  else if (seg === 'timetable') screen = <Timetable />
  else if (seg === 'my') screen = <MyActivities kind={id} />
  else if (seg === 'notifications') screen = <Notifications />
  else if (seg === 'profile') screen = <Profile onAddUser={() => setSheet('adduser')} />
  else screen = <Home />

  const tabs = [['/', 'home', 'Басты'], ['/activities', 'grid', 'Іс-шаралар'], ['+', 'plus', 'Әрекет'], ['/notifications', 'bell', 'Хабарлама'], ['/profile', 'user', 'Профиль']] as const
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p) || (p === '/activities' && seg === 'a'))

  return (
    <Ctx.Provider value={{ me, refreshBadge }}>
      <div className="min-h-dvh pb-[calc(80px+env(safe-area-inset-bottom))]">
        <main className="mx-auto max-w-[640px] pt-[max(8px,env(safe-area-inset-top))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]">{screen}</main>
      </div>
      <nav aria-label="Негізгі мәзір" className="fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[640px] grid grid-cols-5 h-16 items-center">
          {tabs.map(([p, icon, label]) =>
            p === '+' ? (
              <button key={p} type="button" onClick={() => setSheet('menu')} aria-label="Әрекеттер мәзірі"
                className="justify-self-center -mt-6 size-[52px] rounded-full bg-accent text-on-accent grid place-items-center shadow-pop"><Icon n="plus" size={24} /></button>
            ) : (
              <a key={p} href={`#${p}`} aria-current={active(p) ? 'page' : undefined}
                className={`relative grid justify-items-center gap-0.5 text-xs h-14 content-center ${active(p) ? 'text-accent font-semibold' : 'text-muted'}`}>
                <Icon n={icon} size={24} />{label}
                {p === '/notifications' && badge > 0 && <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-xs font-semibold grid place-items-center" aria-label={`${badge} оқылмаған`}>{badge > 9 ? '9+' : badge}</span>}
              </a>
            ),
          )}
        </div>
      </nav>

      {sheet === 'menu' && (
        <Sheet title="Не істейміз?" onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            <MenuItem icon="clock" title="Рұқсат сұрау" text={me.role === 'student' ? 'Сыртқа шығу, сабақтан немесе іс-шарадан' : 'Келген өтініштер және бүгін рұқсат берілгендер'} onClick={() => { setSheet(null); go(me.role === 'student' ? '/leave/new' : '/leaves') }} />
            <MenuItem icon="grid" title="Броньдау" text="Кабинет, спортзал, шай бөлмесі" onClick={() => { setSheet(null); go('/book') }} />
            <MenuItem icon="file" title="Іс-шара ұсыну" text="Үйірме, курс, жарыс, турнир немесе іс-шара" onClick={() => { setSheet(null); go('/a/new') }} />
            {me.role !== 'student' && <MenuItem icon="check" title="QR тексеру" text="Рұқсат немесе бронь кодын тексеру" onClick={() => { setSheet(null); go('/v/') }} />}
            {canAddUsers(me) && <MenuItem icon="userplus" title="Пайдаланушы қосу" text={me.role === 'class_teacher' ? 'Өз сыныбыңызға оқушы тіркеу' : 'Оқушы немесе мұғалім тіркеу'} onClick={() => setSheet('adduser')} />}
          </div>
        </Sheet>
      )}
      {sheet === 'adduser' && <Sheet title="Пайдаланушы қосу" onClose={() => setSheet(null)}><AddUser /></Sheet>}
      <Toaster />
    </Ctx.Provider>
  )
}

const MenuItem = ({ icon, title, text, onClick }: { icon: string; title: string; text: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-3 min-h-16 rounded-md px-3 py-2 text-left hover:bg-surface-2 active:bg-surface-2">
    <span className="size-10 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} /></span>
    <span className="flex-1 min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{text}</span></span>
    <Icon n="chev" className="text-muted" />
  </button>
)
