import { useState, type ReactNode } from 'react'
import { createPost, createProposal, errText, hidePost, listActivities, listPeople, listPosts, listStaff, openDirect, photoUrl, pinPost, setParliament, setPostStatus, uploadPhoto, votePost,
  type Me, type Post, type PostKind, type PostStatus } from '../lib/api'
import { chatTime, fmtDate } from '../lib/time'
import { useMe } from '../App'
import Stories, { storyCandidates } from '../components/Stories'
import Activities from './Activities'
import { DutyCard, TodayCard } from '../components/HomeWidgets'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad, type Tone } from '../components/ui'
import { tx } from '../lib/i18n'

type Tab = 'all' | 'news' | 'announcement'
type Page = 'lost' | 'events' | 'proposals'
const TABS: [Tab, string][] = [['all', tx('Барлығы')], ['news', tx('Жаңалықтар')], ['announcement', tx('Хабарландыру')]]
const PAGE_TITLE: Record<Page, string> = { lost: tx('Lost & Found'), events: tx('Events'), proposals: tx('Ұсыныстар') }
// old notification links (/?t=parliament) still land on the right page
const LEGACY: Record<string, Page> = { lost: 'lost', upcoming: 'events', parliament: 'proposals' }
const QUICK: [string, string, string][] = [['list', tx('Асхана'), '/menu'], ['search', tx('Lost & Found'), '/lost'], ['grid', tx('Cabinets'), '/book'], ['star', tx('Events'), '/events'], ['flag', tx('Ұсыныстар'), '/proposals'], ['poll', tx('Сауалнама'), '/surveys']]
const PROPOSAL: Record<PostStatus, [string, Tone]> = {
  open: [tx('Жаңа'), 'accent'], considering: [tx('Қаралуда'), 'warn'], accepted: [tx('Қабылданды'), 'ok'], rejected: [tx('Қабылданбады'), 'bad'], resolved: [tx('Жабылды'), 'muted'],
}
const canAnswer = (me: Me) => me.role === 'deputy' || me.role === 'admin' || me.parliament
const deputy = (me: Me) => me.role === 'deputy' || me.role === 'admin'
const canAnswerPost = (me: Me, p: Post) =>
  p.addressee === 'admin' ? deputy(me) : p.addressee === 'teacher' ? p.addressee_id === me.id || deputy(me) : canAnswer(me)
const TO_LABEL = (p: Post) => (p.addressee === 'admin' ? tx('Әкімшілікке') : p.addressee === 'teacher' ? tx('Мұғалімге: {0}', p.to?.full_name ?? '') : tx('Парламентке'))
const votes = (p: Post) => p.votes.filter((v) => v.value === 1).length

type Open = null | { kind: 'post'; p: Post } | { kind: 'new'; what: PostKind | null } | { kind: 'answer'; p: Post } | { kind: 'parliament' }

export default function Feed({ query, page }: { query: string; page?: Page }) {
  const { me } = useMe()
  const q = new URLSearchParams(query).get('t') ?? ''
  const view: Page | null = page ?? LEGACY[q] ?? null
  const tab: Tab = TABS.some(([k]) => k === q) ? (q as Tab) : 'all'
  const posts = useLoad(listPosts, [])
  const acts = useLoad(listActivities, [])
  const [open, setOpen] = useState<Open>(null)
  const reload = () => { posts.reload(); setOpen(null) }
  // members-only activity posts live on the activity page, not in the school feed
  const all = (posts.data ?? []).filter((p) => p.visibility === 'public')
  const of = (k: PostKind[]) => all.filter((p) => k.includes(p.kind))

  const setTab = (t: Tab) => go(t === 'all' ? '/' : `/?t=${t}`)
  const section = (title: string, t: Tab | Page | null, body: ReactNode) => (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between mt-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {t && <button type="button" onClick={() => (t in PAGE_TITLE ? go(`/${t}`) : setTab(t as Tab))} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Барлығы')}</button>}
      </div>
      {body}
    </section>
  )

  const sheets = (
    <>
      {open?.kind === 'post' && <Sheet title={KIND_TITLE[open.p.kind]} onClose={() => setOpen(null)}><PostView p={open.p} me={me} onChange={reload} /></Sheet>}
      {open?.kind === 'new' && <Sheet title={tx('Жариялау')} onClose={() => setOpen(null)}><NewPost me={me} initial={open.what} onDone={reload} /></Sheet>}
      {open?.kind === 'answer' && <Sheet title={tx('Ұсынысқа жауап')} onClose={() => setOpen(null)}><Answer p={open.p} onDone={reload} /></Sheet>}
      {open?.kind === 'parliament' && <Sheet title={tx('Парламент құрамы')} onClose={() => setOpen(null)}><Members /></Sheet>}
    </>
  )

  if (view) return (
    <div className="grid gap-3 pb-4">
      <PageHead title={PAGE_TITLE[view]} back right={view !== 'events' ? <Button kind="secondary" onClick={() => setOpen({ kind: 'new', what: view === 'lost' ? 'lost' : 'proposal' })}>{view === 'lost' ? tx('Жариялау') : tx('Жазу')}</Button> : undefined} />
      {view === 'events' ? <Activities tab="all" feed embedded />
        : posts.loading && !posts.data ? <Skeleton /> : posts.error ? <ErrorBox text={posts.error} retry={posts.reload} />
        : view === 'lost' ? <LostTab list={of(['lost', 'found'])} onOpen={(p) => setOpen({ kind: 'post', p })} onNew={() => setOpen({ kind: 'new', what: 'lost' })} />
        : <ProposalsTab list={of(['proposal'])} me={me} onChange={posts.reload} onAnswer={(p) => setOpen({ kind: 'answer', p })}
            onNew={() => setOpen({ kind: 'new', what: 'proposal' })} onMembers={() => setOpen({ kind: 'parliament' })} />}
      {sheets}
    </div>
  )

  return (
    <div className="grid gap-3 pb-4">
      <header className="flex items-center gap-2 min-h-14">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Key To Life</h1>
          <p className="text-sm text-muted truncate">{me.school.name}</p>
        </div>
        <a href="#/search" aria-label={tx('Іздеу')} className="size-11 rounded-full bg-accent text-on-accent grid place-items-center"><Icon n="search" /></a>
      </header>

      {/* 3 × 2: six shortcuts stay readable at 320px */}
      <nav aria-label={tx('Бөлімдер')} className="grid grid-cols-3 gap-2">
        {QUICK.map(([icon, label, path]) => (
          <a key={path} href={`#${path}`} className="min-w-0 flex items-center gap-2 min-h-12 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-2 text-[13px] leading-tight font-semibold active:bg-surface-2">
            <span className="size-8 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={icon} size={18} /></span><span className="min-w-0 break-words">{label}</span>
          </a>
        ))}
      </nav>

      <div className="flex items-end gap-2 border-b border-line">
        <div role="tablist" aria-label={tx('Лента')} className="flex-1 flex gap-5 overflow-x-auto [scrollbar-width:none]">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`relative h-11 whitespace-nowrap text-[15px] ${tab === k ? 'font-semibold text-fg' : 'text-muted'}`}>
              {label}{tab === k && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-accent" />}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setOpen({ kind: 'new', what: null })} aria-label={tx('Жариялау')} className="size-11 grid place-items-center text-accent"><Icon n="plus" /></button>
      </div>

      {posts.loading && !posts.data ? <Skeleton /> : posts.error ? <ErrorBox text={posts.error} retry={posts.reload} /> : (
        <>
          {tab === 'all' && (
            <>
              <TodayCard me={me} />
              <DutyCard />
              {(of(['news', 'announcement']).length > 0) && <Highlights list={of(['news', 'announcement']).slice(0, 6)} onOpen={(p) => setOpen({ kind: 'post', p })} />}
              {acts.data && <Stories me={me} items={storyCandidates(me, acts.data)} onJoined={acts.reload} />}
              {section(tx('Мектеп лентасы'), 'news', of(['news', 'announcement']).length
                ? <SocialFeed list={of(['news', 'announcement']).slice(0, 8)} onOpen={(p) => setOpen({ kind: 'post', p })} />
                : <Card><p className="text-sm text-muted">{tx('Жаңалықтар мен хабарландырулар осында көрінеді.')}</p></Card>)}
            </>
          )}

          {tab === 'news' && (of(['news']).length ? <NewsList list={of(['news'])} onOpen={(p) => setOpen({ kind: 'post', p })} />
            : <Card><Empty icon="file" title={tx('Жаңалық жоқ')} text={tx('Мұғалімдер мен парламент мүшелері лицей жаңалықтарын осында жариялайды.')} /></Card>)}

          {tab === 'announcement' && (of(['announcement']).length ? <div className="grid gap-2">{of(['announcement']).map((p) => <Announcement key={p.id} p={p} onOpen={() => setOpen({ kind: 'post', p })} />)}</div>
            : <Card><Empty icon="megaphone" title={tx('Хабарландыру жоқ')} /></Card>)}

        </>
      )}

      {sheets}
    </div>
  )
}

const KIND_TITLE: Record<PostKind, string> = { news: tx('Жаңалық'), announcement: tx('Хабарландыру'), lost: tx('Жоғалды'), found: tx('Табылды'), proposal: tx('Ұсыныс') }

function Highlights({ list, onOpen }: { list: Post[]; onOpen: (p: Post) => void }) {
  return (
    <section className="grid gap-2" aria-label={tx('Жаңалықтар мен хабарландырулар')}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{tx('Жаңалықтар мен хабарландырулар')}</h2>
        <span className="text-xs text-muted">{tx('Солға сырғытыңыз')}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 [scrollbar-width:none]">
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p)} className="snap-start shrink-0 w-[280px] min-h-[150px] rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] p-4 text-left grid gap-3">
            <span className="flex items-start gap-3">
              <span className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={p.kind === 'announcement' ? 'megaphone' : 'file'} /></span>
              <span className="min-w-0">
                <span className="block text-xs text-muted">{p.pinned ? tx('Маңызды · ') : ''}{p.kind === 'announcement' ? tx('Хабарландыру') : tx('Жаңалық')}</span>
                <span className="block font-semibold leading-snug line-clamp-3">{p.title}</span>
              </span>
            </span>
            {p.body && <span className="text-sm text-muted line-clamp-2">{p.body}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}

function SocialFeed({ list, onOpen }: { list: Post[]; onOpen: (p: Post) => void }) {
  return (
    <div className="grid gap-3">
      {list.map((p) => (
        <article key={p.id} className="rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] overflow-hidden">
          <button type="button" onClick={() => onOpen(p)} className="w-full text-left">
            <div className="flex items-center gap-3 p-4 pb-2">
              <span className="size-10 rounded-full bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={p.kind === 'announcement' ? 'megaphone' : 'file'} /></span>
              <span className="min-w-0">
                <span className="block font-semibold truncate">{p.author.full_name}</span>
                <span className="block text-xs text-muted">{p.kind === 'announcement' ? tx('Хабарландыру') : tx('Жаңалық')} · {chatTime(p.created_at)}</span>
              </span>
            </div>
            {p.photo && <img src={photoUrl(p.photo)} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover bg-surface-2" />}
            <div className="p-4 pt-3">
              <h3 className="font-bold leading-snug">{p.title}</h3>
              {p.body && <p className="mt-1 text-sm text-muted whitespace-pre-line line-clamp-4">{p.body}</p>}
            </div>
          </button>
          <div className="flex items-center gap-4 px-4 pb-3 text-xs text-muted">
            <span className="flex items-center gap-1"><Icon n={p.pinned ? 'star' : 'file'} size={15} />{p.pinned ? tx('Маңызды') : tx('Лицей жаңалығы')}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function Announcement({ p, onOpen }: { p: Post; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`text-left rounded-lg p-4 flex gap-3 ${p.pinned ? 'bg-accent-soft' : 'bg-surface shadow-card border border-[var(--card-line,transparent)]'}`}>
      <span className={`size-10 rounded-full grid place-items-center shrink-0 ${p.pinned ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'}`}><Icon n="megaphone" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs text-muted">{p.pinned && <b className="text-accent">{tx('Маңызды')}</b>}<span>{p.author.full_name} · {chatTime(p.created_at)}</span></span>
        <span className="block font-semibold mt-0.5">{p.title}</span>
        {p.body && <span className="block text-sm text-muted line-clamp-3 whitespace-pre-line">{p.body}</span>}
      </span>
    </button>
  )
}

function NewsList({ list, onOpen }: { list: Post[]; onOpen: (p: Post) => void }) {
  const [first, ...rest] = list
  return (
    <div className="grid gap-3">
      <button type="button" onClick={() => onOpen(first)} className="text-left rounded-lg overflow-hidden bg-surface shadow-card border border-[var(--card-line,transparent)]">
        {first.photo ? <img src={photoUrl(first.photo)} alt="" loading="lazy" className="w-full aspect-[16/9] object-cover bg-surface-2" />
          : <span className="block aspect-[16/9] bg-accent-soft text-accent grid place-items-center"><Icon n="file" size={40} /></span>}
        <span className="block p-4">
          <span className="block text-xs text-muted">{chatTime(first.created_at)} · {first.activity?.title ?? first.author.full_name}</span>
          <span className="block text-lg font-bold leading-snug mt-1 text-balance">{first.title}</span>
          {first.body && <span className="block text-sm text-muted line-clamp-2 mt-1">{first.body}</span>}
        </span>
      </button>
      {rest.length > 0 && (
        <div className={`grid gap-0 bg-surface rounded-lg shadow-card border border-[var(--card-line,transparent)] divide-y divide-line`}>
          {rest.map((p) => (
            <button key={p.id} type="button" onClick={() => onOpen(p)} className="flex gap-3 p-3 text-left">
              <span className="flex-1 min-w-0"><span className="block font-semibold leading-snug line-clamp-2">{p.title}</span><span className="block text-xs text-muted mt-1">{chatTime(p.created_at)} · {p.activity?.title ?? p.author.full_name}</span></span>
              {p.photo && <img src={photoUrl(p.photo)} alt="" loading="lazy" className="size-16 rounded-md object-cover shrink-0 bg-surface-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LostGrid({ list, onOpen }: { list: Post[]; onOpen: (p: Post) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => onOpen(p)} className={`text-left rounded-lg overflow-hidden bg-surface shadow-card border border-[var(--card-line,transparent)] ${p.status === 'resolved' ? 'opacity-60' : ''}`}>
          <span className="relative block aspect-square bg-surface-2">
            {p.photo ? <img src={photoUrl(p.photo)} alt="" loading="lazy" className="size-full object-cover" /> : <span className="size-full grid place-items-center text-muted"><Icon n="search" size={36} /></span>}
            <span className="absolute top-2 left-2"><Badge tone={p.status === 'resolved' ? 'muted' : p.kind === 'lost' ? 'bad' : 'ok'}>{p.status === 'resolved' ? tx('Иесі табылды') : KIND_TITLE[p.kind]}</Badge></span>
          </span>
          <span className="block p-2.5">
            <span className="block font-semibold text-sm line-clamp-1">{p.title}</span>
            <span className="block text-xs text-muted truncate">{p.place ? `${p.place} · ` : ''}{chatTime(p.created_at)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function LostTab({ list, onOpen, onNew }: { list: Post[]; onOpen: (p: Post) => void; onNew: () => void }) {
  const [f, setF] = useState<'all' | 'lost' | 'found' | 'resolved'>('all')
  const l = list.filter((p) => (f === 'resolved' ? p.status === 'resolved' : p.status === 'open' && (f === 'all' || p.kind === f)))
  return (
    <div className="grid gap-3">
      <Chips label={tx('Сүзгі')} value={f} onChange={setF} items={[['all', tx('Барлығы')], ['lost', tx('Жоғалды')], ['found', tx('Табылды')], ['resolved', tx('Иесі табылды')]]} />
      {l.length ? <LostGrid list={l} onOpen={onOpen} /> : <Card><Empty icon="search" title={tx('Әзірге бос')} text={tx('Жоғалған немесе табылған затты суретімен жариялаңыз.')} /></Card>}
      <Button kind="secondary" onClick={onNew}>{tx('Зат жариялау')}</Button>
    </div>
  )
}

function Proposal({ p, me, onChange, onAnswer }: { p: Post; me: Me; onChange: () => void; onAnswer: () => void }) {
  const mine = p.votes.some((v) => v.user_id === me.id && v.value === 1)
  const [busy, setBusy] = useState(false)
  const vote = async () => { setBusy(true); try { await votePost(p.id, !mine); onChange() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  const [label, tone] = PROPOSAL[p.status]
  return (
    <Card className="grid gap-2">
      <div className="flex gap-3">
        {(p.addressee ?? 'parliament') === 'parliament' && <button type="button" onClick={vote} disabled={busy} aria-pressed={mine} aria-label={tx('Қолдау, {0} дауыс', votes(p))}
          className={`w-12 shrink-0 rounded-md grid justify-items-center content-center py-2 gap-0.5 ${mine ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'}`}>
          <Icon n="star" size={18} /><span className="text-sm font-bold tabular-nums">{votes(p)}</span>
        </button>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap"><Badge tone={tone}>{label}</Badge><span className="text-xs font-semibold text-accent">{TO_LABEL(p)}</span><span className="text-xs text-muted">{p.author.full_name}{p.author.class ? ` · ${p.author.class.name}` : ''}</span></div>
          <p className="font-semibold mt-1 break-words">{p.title}</p>
          {p.body && <p className="text-sm text-muted whitespace-pre-line break-words line-clamp-4">{p.body}</p>}
        </div>
      </div>
      {p.answer && <p className="rounded-md bg-surface-2 px-3 py-2 text-sm"><b>{tx('Жауап{0}:', p.answerer ? ` · ${p.answerer.full_name}` : '')}</b> {p.answer}</p>}
      {canAnswerPost(me, p) && <div><Button kind="ghost" onClick={onAnswer}>{p.answer ? tx('Жауапты өзгерту') : tx('Жауап беру')}</Button></div>}
    </Card>
  )
}

function ProposalsTab({ list, me, onChange, onAnswer, onNew, onMembers }: { list: Post[]; me: Me; onChange: () => void; onAnswer: (p: Post) => void; onNew: () => void; onMembers: () => void }) {
  const [to, setTo] = useState<'parliament' | 'admin' | 'teacher'>('parliament')
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const of = list.filter((p) => (p.addressee ?? 'parliament') === to)
  const l = to === 'parliament' && sort === 'top' ? [...of].sort((a, b) => votes(b) - votes(a)) : of
  const HINT = { parliament: tx('Лицейді жақсарту идеясы. Барлығы көреді және қолдап дауыс береді, парламент пен орынбасар жауап береді.'),
    admin: tx('Әкімшілікке жеке ұсыныс. Тек сіз бен орынбасарлар көреді.'), teacher: tx('Бір мұғалімге жеке ұсыныс. Тек сіз бен сол мұғалім көреді.') }
  return (
    <div className="grid gap-3">
      <div role="tablist" aria-label={tx('Кімге')} className="grid grid-cols-3 gap-1 bg-surface-2 rounded-md p-1">
        {([['parliament', tx('Парламент')], ['admin', tx('Әкімшілік')], ['teacher', tx('Мұғалім')]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={to === k} onClick={() => setTo(k)}
            className={`h-10 rounded-sm text-sm font-semibold ${to === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</button>
        ))}
      </div>
      <p className="text-sm text-muted">{HINT[to]}</p>
      {to === 'parliament' && (
        <div className="flex gap-2 items-center">
          <div className="flex-1"><Chips label={tx('Реттеу')} value={sort} onChange={setSort} items={[['top', tx('Танымал')], ['new', tx('Жаңа')]]} /></div>
          {deputy(me) && <Button kind="ghost" onClick={onMembers}>{tx('Парламент құрамы')}</Button>}
        </div>
      )}
      {l.length ? l.map((p) => <Proposal key={p.id} p={p} me={me} onChange={onChange} onAnswer={() => onAnswer(p)} />)
        : <Card><Empty icon="flag" title={tx('Ұсыныс жоқ')} text={to === 'parliament' ? tx('Бірінші ұсынысты сіз жазыңыз.') : tx('Жіберген немесе сізге келген ұсыныстар осында шығады.')} /></Card>}
      <Button onClick={onNew}>{tx('Ұсыныс жазу')}</Button>
    </div>
  )
}

function PostView({ p, me, onChange }: { p: Post; me: Me; onChange: () => void }) {
  const staff = me.role !== 'student'
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast(done); onChange() } catch (e) { toast(errText(e)) } }
  const dm = async () => { try { go(`/c/${await openDirect(p.author_id)}`) } catch (e) { toast(errText(e)) } }
  const lf = p.kind === 'lost' || p.kind === 'found'
  return (
    <article className="grid gap-3">
      {p.photo && <img src={photoUrl(p.photo)} alt="" className="w-full rounded-md object-contain max-h-[60vh] bg-surface-2" />}
      <div>
        <p className="text-xs text-muted">{p.author.full_name}{p.author.class ? ` · ${p.author.class.name}` : ''} · {fmtDate(p.created_at.slice(0, 10))}</p>
        <h3 className="text-xl font-bold mt-1 text-balance break-words">{p.title}</h3>
      </div>
      {lf && p.place && <p className="flex items-center gap-1.5 text-sm"><Icon n="pin" size={16} />{p.kind === 'lost' ? tx('Жоғалған жері') : tx('Табылған жері')}: {p.place}</p>}
      {p.body && <p className="whitespace-pre-line break-words leading-relaxed">{p.body}</p>}
      <div className="grid gap-2">
        {lf && p.author_id !== me.id && <Button onClick={dm}>{p.kind === 'lost' ? tx('Таптым — иесіне жазу') : tx('Бұл менікі — жазу')}</Button>}
        {lf && (p.author_id === me.id || staff) && (p.status === 'open'
          ? <Button kind="secondary" onClick={() => act(() => setPostStatus(p.id, 'resolved'), tx('Белгіленді'))}>{tx('Иесі табылды')}</Button>
          : <Button kind="secondary" onClick={() => act(() => setPostStatus(p.id, 'open'), tx('Қайта ашылды'))}>{tx('Қайта ашу')}</Button>)}
        {staff && (p.kind === 'news' || p.kind === 'announcement') && <Button kind="secondary" onClick={() => act(() => pinPost(p.id, !p.pinned), tx('Сақталды'))}>{p.pinned ? tx('Маңыздыдан алу') : tx('Маңызды деп бекіту')}</Button>}
        {(p.author_id === me.id || deputy || (lf && staff)) && <Button kind="danger" onClick={() => act(() => hidePost(p.id), tx('Жойылды'))}>{tx('Жою')}</Button>}
      </div>
    </article>
  )
}

function NewPost({ me, initial, onDone }: { me: Me; initial: PostKind | null; onDone: () => void }) {
  const staff = me.role !== 'student'
  const options: [PostKind, string, string, string][] = [
    ...(staff || me.parliament ? [['news', 'file', tx('Жаңалық'), tx('Фотосымен, лентаның басында')] as [PostKind, string, string, string]] : []),
    ...(staff ? [['announcement', 'megaphone', tx('Хабарландыру'), tx('Барлығына маңызды ақпарат')] as [PostKind, string, string, string]] : []),
    ['lost', 'search', tx('Жоғалған немесе табылған зат'), tx('Lost & Found')],
    ['proposal', 'flag', tx('Ұсыныс'), tx('Парламентке, әкімшілікке немесе мұғалімге')],
  ]
  const [kind, setKind] = useState<PostKind | null>(initial)
  const [to, setTo] = useState<'parliament' | 'admin' | 'teacher'>('parliament')
  const [teacher, setTeacher] = useState('')
  const teachers = useLoad(() => (kind === 'proposal' ? listStaff() : Promise.resolve([])), [kind])
  const [f, setF] = useState({ title: '', body: '', place: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  if (!kind) return (
    <div className="grid gap-2">
      {options.map(([k, icon, title, text]) => (
        <button key={k} type="button" onClick={() => setKind(k)} className="flex items-center gap-3 min-h-16 rounded-md px-3 py-2 text-left hover:bg-surface-2">
          <span className="size-10 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} /></span>
          <span className="flex-1"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{text}</span></span><Icon n="chev" className="text-muted" />
        </button>
      ))}
      <button type="button" onClick={() => go('/a/new')} className="flex items-center gap-3 min-h-16 rounded-md px-3 py-2 text-left hover:bg-surface-2">
        <span className="size-10 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n="grid" /></span>
        <span className="flex-1"><span className="block font-semibold">{tx('Іс-шара ұсыну')}</span><span className="block text-sm text-muted">{tx('Үйірме, жарыс, турнир — растаған соң Events бөлімінде шығады')}</span></span><Icon n="chev" className="text-muted" />
      </button>
    </div>
  )

  const lf = kind === 'lost' || kind === 'found'
  const photo = lf || kind === 'news'
  const save = async () => {
    if (f.title.trim().length < 3) return toast(tx('Тақырыпты жазыңыз'))
    if (kind === 'proposal' && f.body.trim().length < 10) return toast(tx('Ұсынысыңызды толығырақ жазыңыз'))
    setBusy(true)
    try {
      const path = file ? await uploadPhoto(me.id, file) : null
      if (kind === 'proposal') {
        if (to === 'teacher' && !teacher) { setBusy(false); return toast(tx('Мұғалімді таңдаңыз')) }
        await createProposal(to, to === 'teacher' ? teacher : null, f.title, f.body)
      } else await createPost(kind, f.title, f.body, path, lf ? f.place : null)
      toast(kind === 'proposal' ? tx('Ұсыныс жіберілді, алушыға хабар кетті') : tx('Жарияланды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      {lf && (
        <div role="radiogroup" aria-label={tx('Түрі')} className="grid grid-cols-2 gap-1 bg-surface-2 rounded-md p-1">
          {(['lost', 'found'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`h-10 rounded-sm text-sm font-semibold ${kind === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{k === 'lost' ? tx('Жоғалттым') : tx('Тауып алдым')}</button>)}
        </div>
      )}
      {kind === 'proposal' && (
        <>
          <Field label={tx('Кімге')}>{(id) => <select id={id} value={to} onChange={(e) => setTo(e.target.value as typeof to)} className={inputCls}>
            <option value="parliament">{tx('Оқушылар парламентіне (барлығы көреді)')}</option><option value="admin">{tx('Әкімшілікке (жеке)')}</option><option value="teacher">{tx('Мұғалімге (жеке)')}</option></select>}</Field>
          {to === 'teacher' && <Field label={tx('Мұғалім')}>{(id) => <select id={id} value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inputCls}>
            <option value="">{tx('Таңдаңыз')}</option>{(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select>}</Field>}
        </>
      )}
      <Field label={kind === 'proposal' ? tx('Ұсыныс') : lf ? tx('Не?') : tx('Тақырып')}>{(id) => <input id={id} value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls}
        placeholder={kind === 'proposal' ? tx('Асханаға су автоматы қою') : kind === 'lost' ? tx('Көк түсті рюкзак') : kind === 'found' ? tx('Кілт, 2-қабат') : ''} />}</Field>
      {lf && <Field label={kind === 'lost' ? tx('Қай жерде жоғалды') : tx('Қай жерден табылды')}>{(id) => <input id={id} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} className={inputCls} placeholder={tx('Спортзал, 3-қабат')} />}</Field>}
      <Field label={kind === 'proposal' ? tx('Неге керек, қалай жасауға болады') : tx('Толығырақ')}>{(id) => <textarea id={id} value={f.body} maxLength={5000} onChange={(e) => setF({ ...f, body: e.target.value })} className={`${inputCls} h-28 py-2`} />}</Field>
      {photo && (
        <Field label={tx('Фото')} hint={tx('Міндетті емес, 1 сурет')}>{(id, d) => (
          <div className="flex items-center gap-3">
            <input id={id} aria-describedby={d} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:h-10 file:px-3 file:rounded-md file:border-0 file:bg-accent-soft file:text-accent file:font-semibold" />
            {file && <img src={URL.createObjectURL(file)} alt={tx('Таңдалған фото')} className="size-14 rounded-md object-cover" />}
          </div>
        )}</Field>
      )}
      <Button block loading={busy} onClick={save}>{kind === 'proposal' ? tx('Ұсыныс жіберу') : tx('Жариялау')}</Button>
    </div>
  )
}

function Answer({ p, onDone }: { p: Post; onDone: () => void }) {
  const [status, setStatus] = useState<PostStatus>(p.status === 'open' ? 'considering' : p.status)
  const [answer, setAnswer] = useState(p.answer ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => { setBusy(true); try { await setPostStatus(p.id, status, answer); toast(tx('Жауап жіберілді')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  return (
    <div className="grid gap-4">
      <p className="rounded-md bg-surface-2 px-3 py-2"><b>{p.title}</b>{p.body ? <><br /><span className="text-sm text-muted">{p.body}</span></> : null}</p>
      <Chips label={tx('Шешім')} value={status} onChange={setStatus} items={[['considering', tx('Қаралуда')], ['accepted', tx('Қабылданды')], ['rejected', tx('Қабылданбады')]]} />
      <Field label={tx('Жауап')} hint={tx('Авторға хабар барады')}>{(id, d) => <textarea id={id} aria-describedby={d} value={answer} onChange={(e) => setAnswer(e.target.value)} className={`${inputCls} h-28 py-2`} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Жіберу')}</Button>
    </div>
  )
}

function Members() {
  const people = useLoad(listPeople, [])
  const [q, setQ] = useState('')
  const toggle = async (id: string, on: boolean) => { try { await setParliament(id, on); people.reload() } catch (e) { toast(errText(e)) } }
  const list = (people.data ?? []).filter((p) => p.role === 'student' && (p.full_name + (p.class?.name ?? '')).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">{tx('Парламент мүшелері ұсыныстарға жауап береді және жаңалық жариялай алады.')}</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Оқушыны іздеу')} aria-label={tx('Оқушыны іздеу')} className={inputCls} />
      {people.loading ? <Skeleton rows={2} /> : (
        <ul className="divide-y divide-line">
          {[...list].sort((a, b) => Number(b.parliament) - Number(a.parliament)).map((p) => (
            <li key={p.id}><label className="flex items-center gap-3 min-h-12">
              <span className="flex-1">{p.full_name}{p.class ? <span className="text-muted"> · {p.class.name}</span> : null}</span>
              <input type="checkbox" checked={p.parliament} onChange={(e) => toggle(p.id, e.target.checked)} className="size-5 accent-[var(--accent)]" />
            </label></li>
          ))}
        </ul>
      )}
    </div>
  )
}
