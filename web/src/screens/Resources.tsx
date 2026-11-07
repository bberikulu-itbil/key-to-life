import { useState } from 'react'
import {
  addHabit, addMedia, approveMedia, classStudents, errText, listClasses, listHabits, listClassResources, listRecipes, listStaff, logScreening, photoUrl, uploadPhoto,
  removeMedia, rateMedia, setMediaProgress, type Media, type Student,
} from '../lib/api'
import { today } from '../lib/time'
import { avgStars, seasonAvgs } from '../lib/stars'
import { useMe } from '../App'
import { ClassHoursPanel } from './Journal'
import Recipes from '../components/Recipes'
import Avatar from '../components/Avatar'
import { Button, Chips, Empty, ErrorBox, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

/* «Сынып ресурстары» — the class's shared shelf: books, films (with film club), recipes, class hours (staff). The fund lives in the class calendar. */

type Tab = 'book' | 'film' | 'recipes' | 'hours'

export default function Resources({ classId }: { classId?: string }) {
  const { me } = useMe()
  const student = me.role === 'student'
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(async () => (student ? [] : listClasses()), [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cid = student ? me.class?.id : (options.find((c) => c.id === classId) ?? mine[0] ?? options[0])?.id
  const staff = !student
  const cls = options.find((c) => c.id === cid)
  const [tab, setTab] = useState<Tab>('book')
  const data = useLoad(async () => {
    if (!cid) return null
    const [r, students, people, recipes] = await Promise.all([listClassResources(cid), classStudents(cid), listStaff(), listRecipes(cid)])
    return { ...r, students, people, recipes }
  }, [cid])
  if (classes.loading && !classes.data) return <><PageHead title={tx('Сынып ресурстары')} back /><Skeleton /></>
  if (!cid) return <><PageHead title={tx('Сынып ресурстары')} back /><Empty icon="book" title={tx('Сынып бекітілмеген')} text={tx('Сыныпқа бекітілгенде, сынып кітапханасы осында шығады.')} /></>
  const d = data.data
  const name = (id: string | null) => d?.students.find((s) => s.id === id)?.full_name ?? d?.people.find((s) => s.id === id)?.full_name ?? '—'
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сынып ресурстары')} back right={!student && options.length > 1 ? (
        <select aria-label={tx('Сынып')} value={cid} onChange={(e) => go(`/resources/${e.target.value}`)} className={`${inputCls} w-auto`}>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>) : undefined} />
      <Chips label={tx('Бөлім')} value={tab} onChange={setTab} items={[['book', tx('Кітаптар')], ['film', tx('Фильмдер')], ['recipes', tx('Рецепттер')], ...(staff ? [['hours', tx('Тәрбие сағаттары')]] as [Tab, string][] : [])]} />
      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (
        tab === 'book' || tab === 'film' ? <Shelf key={tab} kind={tab} classId={cid} media={d.media.filter((m) => m.kind === tab)} students={d.students} staff={staff} name={name} reload={data.reload} />
        : tab === 'recipes' ? <Recipes classId={cid} recipes={d.recipes} classSize={d.students.length} staff={staff} me={me.id} reload={data.reload} />
        : tab === 'hours' && cls ? <ClassHoursPanel cls={cls} /> : null
      )}
    </div>
  )
}

const FORMATS: Record<Media['kind'], [string, string][]> = {
  film: [['movie', tx('Фильм')], ['series', tx('Сериал')], ['anime', tx('Аниме')], ['cartoon', tx('Мультфильм')]],
  book: [['book', tx('Кітап')], ['comic', tx('Комикс')], ['manga', tx('Манга')], ['audio', tx('Аудиокітап')], ['magazine', tx('Журнал')]],
}
const formatName = (kind: Media['kind'], f: string | null) => FORMATS[kind].find(([k]) => k === f)?.[1] ?? ''
const hasSeasons = (f: string | null) => f === 'series' || f === 'anime'

/** Five stars: shows a value, or lets you pick one when onPick is given (tapping the same star again clears it). */
function Stars({ value, onPick, size = 18, label }: { value: number | null; onPick?: (v: number | null) => void; size?: number; label: string }) {
  return (
    <span role={onPick ? 'radiogroup' : 'img'} aria-label={onPick ? label : `${label}: ${value ?? 0}/5`} className="inline-flex">
      {[1, 2, 3, 4, 5].map((v) => {
        const on = (value ?? 0) >= v - 0.25
        const star = <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill={on ? '#f5b301' : 'none'} stroke={on ? '#f5b301' : '#cbd5e1'} strokeWidth="1.6" strokeLinejoin="round" /></svg>
        return onPick
          ? <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={`${v}/5`} onClick={() => onPick(value === v ? null : v)} className="p-0.5">{star}</button>
          : <span key={v}>{star}</span>
      })}
    </span>
  )
}

const GENRES: Record<Media['kind'], [string, string][]> = {
  book: [['novel', tx('Көркем')], ['science', tx('Ғылыми-танымдық')], ['history', tx('Тарих')], ['adventure', tx('Шытырман')], ['fantasy', tx('Фантастика')], ['bio', tx('Өмірбаян')], ['poetry', tx('Поэзия')], ['self', tx('Өзін-өзі дамыту')]],
  film: [['drama', tx('Драма')], ['comedy', tx('Комедия')], ['history', tx('Тарихи')], ['docs', tx('Деректі')], ['anim', tx('Анимация')], ['fantasy', tx('Фантастика')], ['adventure', tx('Шытырман')], ['family', tx('Отбасылық')]],
}
const genreName = (kind: Media['kind'], g: string | null) => GENRES[kind].find(([k]) => k === g)?.[1] ?? ''
// a cover colour from the title, for books and films without a photo
const tint = (t: string) => `hsl(${[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 45% 42%)`

function Cover({ m, className = '' }: { m: Media; className?: string }) {
  return m.cover
    ? <img src={photoUrl(m.cover)} alt="" className={`aspect-[2/3] w-full rounded-md object-cover ${className}`} loading="lazy" />
    : <span aria-hidden className={`aspect-[2/3] w-full rounded-md grid place-items-center text-white/90 text-4xl font-bold ${className}`} style={{ background: tint(m.title) }}>{m.title.trim()[0]?.toUpperCase()}</span>
}

function Shelf({ kind, classId, media, students, staff, name, reload }: { kind: Media['kind']; classId: string; media: Media[]; students: Student[]; staff: boolean; name: (id: string | null) => string; reload: () => void }) {
  const { me } = useMe()
  const book = kind === 'book'
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [showPending, setShowPending] = useState(false)
  const pending = media.filter((m) => !m.approved), shelf = media.filter((m) => m.approved)
  const doneBy = (m: Media) => m.progress.filter((p) => p.state === 'done' && students.some((s) => s.id === p.user_id)).length
  const [fmt, setFmt] = useState('')
  const shown = shelf.filter((m) => (!fmt || m.format === fmt) && (!genre || m.genre === genre) && (!q || `${m.title} ${m.author ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  // not started yet, most finished by classmates first
  const forYou = shelf.filter((m) => !m.progress.some((p) => p.user_id === me.id)).sort((a, b) => doneBy(b) - doneBy(a)).slice(0, 6)
  const cur = media.find((m) => m.id === open)
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <input aria-label={tx('Іздеу')} value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} flex-1 min-w-0`} placeholder={book ? tx('Кітап не автор іздеу') : tx('Фильм іздеу')} />
        <Button onClick={() => setAdding(true)}><Icon n="plus" size={18} />{staff ? tx('Қосу') : tx('Ұсыну')}</Button>
      </div>
      {FORMATS[kind].filter(([k]) => shelf.some((m) => m.format === k)).length > 1 && <Chips label={tx('Түрі')} value={fmt} onChange={setFmt} items={[['', tx('Барлық түрі')], ...FORMATS[kind].filter(([k]) => shelf.some((m) => m.format === k))]} />}
      <Chips label={tx('Жанр')} value={genre} onChange={setGenre} items={[['', tx('Барлығы')], ...GENRES[kind].filter(([g]) => shelf.some((m) => m.genre === g))]} />

      {pending.length > 0 && (
        <button type="button" onClick={() => setShowPending(!showPending)} className="flex items-center gap-2 rounded-lg bg-warning-soft text-warning px-4 min-h-12 text-sm font-semibold">
          <Icon n="clock" size={18} /><span className="flex-1 text-left">{staff ? tx('{0} ұсыныс мақұлдауды күтуде', pending.length) : tx('Ұсынысыңыз мақұлдауды күтуде · {0}', pending.length)}</span><Icon n="chev" size={18} className={showPending ? 'rotate-90' : ''} />
        </button>
      )}
      {showPending && <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">{pending.map((m) => (
        <button key={m.id} type="button" onClick={() => setOpen(m.id)} className="grid gap-1 text-left opacity-80"><Cover m={m} /><span className="text-xs font-semibold line-clamp-2">{m.title}</span></button>
      ))}</div>}

      {!q && !genre && forYou.length > 0 && shelf.length > 3 && <>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Саған ұсынамыз')}</h2>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">{forYou.map((m) => (
          <button key={m.id} type="button" onClick={() => setOpen(m.id)} className="w-24 shrink-0 grid gap-1 text-left"><Cover m={m} /><span className="text-xs font-semibold line-clamp-2">{m.title}</span>
            {doneBy(m) > 0 && <span className="text-[11px] text-muted">{book ? tx('{0} оқыды', doneBy(m)) : tx('{0} көрді', doneBy(m))}</span>}</button>
        ))}</div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Барлығы · {0}', shelf.length)}</h2>
      </>}

      {!shown.length ? <Empty icon={book ? 'book' : 'heart'} title={shelf.length ? tx('Ештеңе табылмады') : book ? tx('Кітап әлі жоқ') : tx('Фильм әлі жоқ')} text={shelf.length ? undefined : tx('Бірінші болып ұсыныңыз!')} />
        : <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">{shown.map((m) => {
          const mine = m.progress.find((p) => p.user_id === me.id)?.state
          return (
            <button key={m.id} type="button" onClick={() => setOpen(m.id)} className="relative grid gap-1 text-left">
              <Cover m={m} />
              {mine && <span className={`absolute top-1.5 right-1.5 size-6 rounded-full grid place-items-center text-white ${mine === 'done' ? 'bg-success' : 'bg-accent'}`}><Icon n={mine === 'done' ? 'check' : 'clock'} size={14} /></span>}
              <span className="text-sm font-semibold leading-tight line-clamp-2">{m.title}</span>
              <span className="text-xs text-muted truncate">{[formatName(kind, m.format), m.author ?? genreName(kind, m.genre)].filter(Boolean).join(' · ')}</span>
              {avgStars(m.progress.map((p) => p.rating)) && <span className="flex items-center gap-1 text-xs font-semibold"><Stars value={avgStars(m.progress.map((p) => p.rating))!.avg} size={12} label={tx('Баға')} />{avgStars(m.progress.map((p) => p.rating))!.avg}</span>}
            </button>
          )
        })}</div>}

      {cur && <Detail m={cur} students={students} staff={staff} name={name} onClose={() => setOpen(null)} reload={reload} />}
      {adding && <AddMedia kind={kind} classId={classId} staff={staff} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload() }} />}
    </div>
  )
}

function AddMedia({ kind, classId, staff, onClose, onDone }: { kind: Media['kind']; classId: string; staff: boolean; onClose: () => void; onDone: () => void }) {
  const { me } = useMe()
  const book = kind === 'book'
  const [f, setF] = useState({ title: '', author: '', note: '', genre: '', format: kind === 'book' ? 'book' : 'movie', seasons: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const cover = file ? await uploadPhoto(me.id, file) : null
      await addMedia({ class_id: classId, kind, title: f.title.trim(), author: f.author.trim() || null, note: f.note.trim() || null, genre: f.genre || null, format: f.format, seasons: hasSeasons(f.format) && Number(f.seasons) > 0 ? Math.min(50, Number(f.seasons)) : null, cover, approved: staff, proposed_by: me.id })
      toast(staff ? tx('Қосылды') : tx('Ұсыныс жіберілді')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet title={staff ? (book ? tx('Кітап қосу') : tx('Фильм қосу')) : (book ? tx('Кітап ұсыну') : tx('Фильм ұсыну'))} onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <label className="aspect-[2/3] rounded-md border-2 border-dashed border-line grid place-items-center text-center text-xs text-muted cursor-pointer overflow-hidden">
            {file ? <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" /> : <span className="grid justify-items-center gap-1 p-1"><Icon n="plus" size={18} />{tx('Мұқаба')}</span>}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid gap-2 content-start">
            <input aria-label={tx('Атауы')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} className={inputCls} placeholder={tx('Атауы')} />
            <input aria-label={book ? tx('Авторы') : tx('Режиссері')} value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} maxLength={200} className={inputCls} placeholder={book ? tx('Авторы') : tx('Режиссері')} />
          </div>
        </div>
        <Chips label={tx('Түрі')} value={f.format} onChange={(format) => setF({ ...f, format })} items={FORMATS[kind]} />
        {hasSeasons(f.format) && <input aria-label={tx('Неше маусым')} type="number" inputMode="numeric" min={1} max={50} value={f.seasons} onChange={(e) => setF({ ...f, seasons: e.target.value })} className={inputCls} placeholder={tx('Неше маусым (сезон)')} />}
        <Chips label={tx('Жанр')} value={f.genre} onChange={(genre) => setF({ ...f, genre })} items={GENRES[kind]} />
        <input aria-label={tx('Неге ұсынасыз?')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} className={inputCls} placeholder={tx('Неге ұсынасыз? (міндетті емес)')} />
        {!staff && <p className="text-xs text-muted">{tx('Ұсынысыңызды тәрбиеші не сынып жетекшісі мақұлдаған соң, бүкіл сыныпқа көрінеді.')}</p>}
        <Button onClick={save} loading={busy} disabled={f.title.trim().length < 2}>{staff ? tx('Қосу') : tx('Ұсыну')}</Button>
      </div>
    </Sheet>
  )
}

/** One book or film: status, classmates, reviews; staff approve, screen or remove. */
function Detail({ m, students, staff, name, onClose, reload }: { m: Media; students: Student[]; staff: boolean; name: (id: string | null) => string; onClose: () => void; reload: () => void }) {
  const { me } = useMe()
  const book = m.kind === 'book'
  const [busy, setBusy] = useState(false)
  const [screen, setScreen] = useState(false)
  const run = async (fn: () => Promise<unknown>, done?: string) => { setBusy(true); try { await fn(); if (done) toast(done); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) } }
  const mineP = m.progress.find((p) => p.user_id === me.id)
  const done = m.progress.filter((p) => p.state === 'done' && students.some((s) => s.id === p.user_id))
  const reading = m.progress.filter((p) => p.state === 'doing' && students.some((s) => s.id === p.user_id))
  const reviews = m.progress.filter((p) => p.review)
  const avg = avgStars(m.progress.map((p) => p.rating))
  const seasonAvg = m.seasons ? seasonAvgs(m.progress.map((p) => p.season_stars ?? {}), m.seasons) : []
  // rating counts as having read or watched it, unless the person is still on it
  const rate = (patch: { rating?: number | null; season_stars?: Record<string, number> }) => run(() => rateMedia(m.id, mineP?.state ?? 'done', patch))
  const mark = (state: 'doing' | 'done' | null) => run(async () => {
    await setMediaProgress(m.id, state)
    // "reading" puts a daily reading habit into the student's own tracker
    if (book && state === 'doing') {
      const title = tx('Күніне 20 бет оқу · {0}', m.title).slice(0, 100)
      if (!(await listHabits()).some((h) => h.title === title)) { await addHabit(title); toast(tx('Әдеттерге қосылды: күніне 20 бет')) }
    }
  })
  return (
    <Sheet title={m.title} onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Cover m={m} />
          <div className="grid gap-1 content-start text-sm">
            {m.author && <p className="font-semibold">{m.author}</p>}
            <p className="text-muted">{[formatName(m.kind, m.format), genreName(m.kind, m.genre), m.seasons ? tx('{0} маусым', m.seasons) : ''].filter(Boolean).join(' · ')}</p>
            {avg && <p className="flex items-center gap-1.5"><Stars value={avg.avg} size={16} label={tx('Орташа баға')} /><b>{avg.avg}</b><span className="text-muted">· {tx('{0} баға', avg.n)}</span></p>}
            {m.note && <p>{m.note}</p>}
            {!m.approved && <p className="text-warning font-semibold">{tx('Күтуде · ұсынған: {0}', name(m.proposed_by))}</p>}
          </div>
        </div>
        {!m.approved ? (
          <div className="flex gap-2">
            {staff && <Button onClick={() => run(() => approveMedia(m.id), tx('Мақұлданды'))}><Icon n="check" size={18} />{tx('Мақұлдау')}</Button>}
            <Button kind="ghost" onClick={() => run(async () => { await removeMedia(m.id); onClose() })}>{staff ? tx('Қабылдамау') : tx('Қайтару')}</Button>
          </div>
        ) : <>
          <div className="grid grid-cols-2 gap-2">
            {(['doing', 'done'] as const).map((st) => {
              const on = mineP?.state === st
              return <button key={st} type="button" aria-pressed={on} disabled={busy} onClick={() => mark(on ? null : st)}
                className={`h-11 rounded-md text-sm font-semibold ${on ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{st === 'doing' ? (book ? tx('Оқып жатырмын') : tx('Көремін')) : (book ? tx('Оқыдым') : tx('Көрдім'))}</button>
            })}
          </div>
          <div className="grid gap-2 rounded-md bg-surface-2 p-3">
            <div className="flex items-center gap-2"><span className="flex-1 text-sm font-semibold">{tx('Сенің бағаң')}</span><Stars value={mineP?.rating ?? null} onPick={(v) => rate({ rating: v })} size={26} label={tx('Сенің бағаң')} /></div>
            {m.seasons && Array.from({ length: m.seasons }, (_, i) => String(i + 1)).map((k, i) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{tx('{0}-маусым', k)}{seasonAvg[i] && <span className="text-muted text-xs">{' · '}{tx('сынып: {0}', seasonAvg[i]!.avg)}</span>}</span>
                <Stars value={mineP?.season_stars?.[k] ?? null} onPick={(v) => { const n = { ...(mineP?.season_stars ?? {}) }; if (v) n[k] = v; else delete n[k]; rate({ season_stars: n }) }} size={20} label={tx('{0}-маусым', k)} />
              </div>
            ))}
          </div>
          {mineP && <Review key={mineP.updated_at} m={m} state={mineP.state} review={mineP.review ?? ''} reload={reload} />}
          {(done.length > 0 || reading.length > 0) && (
            <div className="grid gap-2">
              {done.length > 0 && <div className="flex items-center gap-2">
                <span className="flex -space-x-2">{done.slice(0, 6).map((p) => { const s = students.find((x) => x.id === p.user_id)!; return <span key={p.user_id} className="rounded-full ring-2 ring-surface"><Avatar name={s.full_name} photo={s.photo} size={28} /></span> })}</span>
                <span className="text-sm text-muted">{book ? tx('Сыныптастарыңның {0}-і оқыды', done.length) : tx('Сыныптастарыңның {0}-і көрді', done.length)}</span>
              </div>}
              {reading.length > 0 && <p className="text-sm text-muted">{book ? tx('Қазір оқып жатыр: {0}', reading.map((p) => name(p.user_id).split(' ').slice(0, 2).join(' ')).join(', ')) : tx('Көргісі келеді: {0}', reading.length)}</p>}
            </div>
          )}
          {reviews.length > 0 && (
            <ul className="grid gap-2">{reviews.map((p) => (
              <li key={p.user_id} className="rounded-md bg-surface-2 p-3 text-sm"><span className="block text-xs font-semibold">{name(p.user_id)}</span><span className="whitespace-pre-line">{p.review}</span></li>
            ))}</ul>
          )}
          {staff && <div className="flex gap-2 border-t border-line pt-3">
            {!book && <Button kind="secondary" onClick={() => setScreen(true)}><Icon n="users" size={18} />{tx('Көрсетілім')}</Button>}
            <span className="flex-1" />
            <Button kind="ghost" onClick={() => run(async () => { await removeMedia(m.id); onClose() })}>{tx('Өшіру')}</Button>
          </div>}
        </>}
      </div>
      {screen && <Screening m={m} students={students} onClose={() => setScreen(false)} reload={reload} />}
    </Sheet>
  )
}

function Review({ m, state, review, reload }: { m: Media; state: 'doing' | 'done'; review: string; reload: () => void }) {
  const [v, setV] = useState(review)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex gap-2">
      <input aria-label={tx('Пікіріңіз')} value={v} onChange={(e) => setV(e.target.value)} maxLength={1000} className={`${inputCls} flex-1 min-w-0`} placeholder={tx('Қысқа пікіріңіз: не ұнады, не ойландырды?')} />
      <Button kind="secondary" loading={busy} disabled={v.trim() === review} onClick={async () => {
        setBusy(true); try { await setMediaProgress(m.id, state, v.trim() || null); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
      }}>{tx('Сақтау')}</Button>
    </div>
  )
}

/** Film club: tick who watched; it goes to the class calendar and counts as watched for them. */
function Screening({ m, students, onClose, reload }: { m: Media; students: Student[]; onClose: () => void; reload: () => void }) {
  const [date, setDate] = useState(today())
  const [who, setWho] = useState<Set<string>>(() => new Set(students.map((s) => s.id)))
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={tx('Көрсетілім: {0}', m.title)} onClose={onClose}>
      <div className="grid gap-3">
        <input aria-label={tx('Күні')} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} min-w-0`} />
        <p className="text-sm font-semibold">{tx('Кім көрді · {0}', who.size)}</p>
        <ul className="grid gap-1">{students.map((s) => (
          <li key={s.id}><label className="flex items-center gap-3 min-h-11 rounded-md px-3 bg-surface-2">
            <input type="checkbox" checked={who.has(s.id)} onChange={() => { const n = new Set(who); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); setWho(n) }} className="size-5 accent-[var(--accent)]" />{s.full_name}
          </label></li>
        ))}</ul>
        <Button loading={busy} disabled={!who.size} onClick={async () => {
          setBusy(true)
          try { await logScreening(m.id, date, [...who]); toast(tx('Көрсетілім журналына сақталды')); onClose(); reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
        }}>{tx('Сақтау')}</Button>
        <p className="text-xs text-muted">{tx('Көрсетілім Журнал және күнтізбеде сары түспен шығады.')}</p>
      </div>
    </Sheet>
  )
}

