import { useState, type ReactNode } from 'react'
import { addAward, addHighlight, errText, listAwards, listHighlights, photoUrl, removeAward, removeHighlight, setActivityLook, uploadPhoto, type Activity, type Highlight, type Me } from '../lib/api'
import { TYPE_LABEL } from '../lib/time'
import { Button, Card, Field, Icon, Sheet, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

/** Subject icons and colours an initiative may wear instead of a photo. */
const ACT_ICONS = ['code', 'sigma', 'atom', 'flask', 'leaf', 'globe', 'book', 'trophy', 'ball', 'music', 'star', 'users']
const COLORS = ['#1d5bd8', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#475569']
const TYPE_ICON: Partial<Record<Activity['type'], string>> = { olympiad_prep: 'star', competition: 'trophy', tournament: 'trophy', league: 'trophy', challenge: 'flag', club: 'users', community: 'chat', team: 'users', course: 'book', event: 'flag' }

/** The initiative's round face: its photo, or a subject icon on its colour. */
export function ActivityAvatar({ a, size = 80 }: { a: Pick<Activity, 'photo' | 'icon' | 'color' | 'type'>; size?: number }) {
  if (a.photo) return <img src={photoUrl(a.photo)} alt="" className="rounded-full object-cover bg-surface-2 shrink-0" style={{ width: size, height: size }} />
  const c = a.color ?? '#1d5bd8'
  return (
    <span className="rounded-full grid place-items-center shrink-0" style={{ width: size, height: size, background: `${c}22`, color: c }}>
      <Icon n={a.icon ?? TYPE_ICON[a.type] ?? 'grid'} size={size * 0.45} />
    </span>
  )
}

/** Instagram-style head: face, counters, name and a short description. */
export function ProfileHeader({ a, me, members, awards, canEdit, badges, onChange }: { a: Activity; me: Me; members: number; awards: number; canEdit: boolean; badges: ReactNode; onChange: () => void }) {
  const [more, setMore] = useState(false)
  const [look, setLook] = useState(false)
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-5">
        {canEdit ? <button type="button" onClick={() => setLook(true)} aria-label={tx('Сурет пен белгіні өзгерту')} className="relative">
          <ActivityAvatar a={a} />
          <span className="absolute -bottom-0.5 -right-0.5 size-7 rounded-full bg-accent text-on-accent grid place-items-center border-2 border-[var(--bg)]"><Icon n="plus" size={14} /></span>
        </button> : <ActivityAvatar a={a} />}
        <dl className="flex-1 grid grid-cols-2 text-center">
          <div><dt className="sr-only">{tx('Қатысушылар')}</dt><dd className="text-xl font-bold tabular-nums">{members}</dd><dd className="text-xs text-muted" aria-hidden>{tx('қатысушы')}</dd></div>
          <div><dt className="sr-only">{tx('Марапаттар')}</dt><dd className="text-xl font-bold tabular-nums">{awards}</dd><dd className="text-xs text-muted" aria-hidden>{tx('марапат')}</dd></div>
        </dl>
      </div>
      <div className="grid gap-1">
        <h1 className="text-lg font-bold text-balance break-words leading-snug">{a.title}</h1>
        <p className="text-sm text-muted">{TYPE_LABEL[a.type]}</p>
        <div className="flex gap-1.5 flex-wrap">{badges}</div>
        {a.description && <>
          <p className={`text-[15px] whitespace-pre-line break-words ${more ? '' : 'line-clamp-3'}`}>{a.description}</p>
          {a.description.length > 140 && <button type="button" onClick={() => setMore(!more)} className="justify-self-start text-sm text-muted min-h-8">{more ? tx('Жасыру') : tx('толығырақ')}</button>}
        </>}
      </div>
      {look && <Sheet title={tx('Сурет пен белгі')} onClose={() => setLook(false)}><LookEdit a={a} me={me} onDone={() => { setLook(false); onChange() }} /></Sheet>}
    </section>
  )
}

function LookEdit({ a, me, onDone }: { a: Activity; me: Me; onDone: () => void }) {
  const [icon, setIcon] = useState(a.icon ?? TYPE_ICON[a.type] ?? 'grid')
  const [color, setColor] = useState(a.color ?? COLORS[0])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (photo: string | null | 'keep') => {
    setBusy(true)
    try {
      const p = file ? await uploadPhoto(me.id, file) : photo === 'keep' ? a.photo : photo
      await setActivityLook(a.id, p, icon, color); toast(tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <div className="flex justify-center"><ActivityAvatar a={{ ...a, photo: file ? null : a.photo, icon, color }} size={96} /></div>
      <Field label={tx('Өз суреті')} hint={tx('Суреті болса, белгінің орнына сол көрінеді')}>{(id, d) => (
        <input id={id} aria-describedby={d} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />)}</Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold mb-1">{tx('Пән белгісі')}</legend>
        <div className="grid grid-cols-6 gap-2">
          {ACT_ICONS.map((n) => <button key={n} type="button" onClick={() => setIcon(n)} aria-pressed={icon === n} aria-label={n}
            className={`h-11 rounded-md grid place-items-center ${icon === n ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}><Icon n={n} /></button>)}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold mb-1">{tx('Түсі')}</legend>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-pressed={color === c} aria-label={c}
            className={`size-9 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-[var(--fg)]' : ''}`} style={{ background: c }} />)}
        </div>
      </fieldset>
      <Button block loading={busy} onClick={() => save('keep')}>{tx('Сақтау')}</Button>
      {a.photo && !file && <Button block kind="ghost" disabled={busy} onClick={() => save(null)}>{tx('Суретті алып, белгіні қою')}</Button>}
    </div>
  )
}

/* ---------- highlights: round pinned stories under the head ---------- */
export function Highlights({ a, canEdit, me }: { a: Activity; canEdit: boolean; me: Me }) {
  const list = useLoad(() => listHighlights(a.id), [a.id])
  const [open, setOpen] = useState<Highlight | null>(null)
  const [adding, setAdding] = useState(false)
  const items = list.data ?? []
  if (!items.length && !canEdit) return null
  return (
    <nav aria-label={tx('Өзекті')} className="flex gap-4 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
      {canEdit && <button type="button" onClick={() => setAdding(true)} className="shrink-0 w-16 grid justify-items-center gap-1 text-xs">
        <span className="size-16 rounded-full border-2 border-dashed border-line grid place-items-center text-muted"><Icon n="plus" /></span>{tx('Жаңа')}</button>}
      {items.map((h) => (
        <button key={h.id} type="button" onClick={() => setOpen(h)} className="shrink-0 w-16 grid justify-items-center gap-1 text-xs">
          <span className="size-16 rounded-full p-[3px] border-2 border-accent">
            {h.photo ? <img src={photoUrl(h.photo)} alt="" className="size-full rounded-full object-cover bg-surface-2" />
              : <span className="size-full rounded-full bg-accent-soft text-accent grid place-items-center font-bold">{h.title.slice(0, 2)}</span>}
          </span>
          <span className="w-full truncate text-center">{h.title}</span>
        </button>
      ))}
      {open && <Sheet title={open.title} onClose={() => setOpen(null)}>
        <div className="grid gap-3">
          {open.photo && <img src={photoUrl(open.photo)} alt="" className="w-full rounded-md object-contain max-h-[60vh] bg-surface-2" />}
          {open.body && <p className="whitespace-pre-line break-words">{open.body}</p>}
          {open.link && <a href={open.link} target="_blank" rel="noreferrer" className="text-accent underline break-all">{open.link}</a>}
          {canEdit && <Button kind="danger" onClick={async () => { try { await removeHighlight(open.id); setOpen(null); list.reload() } catch (e) { toast(errText(e)) } }}>{tx('Өшіру')}</Button>}
        </div>
      </Sheet>}
      {adding && <Sheet title={tx('Өзекті материал')} onClose={() => setAdding(false)}><HighlightForm a={a} me={me} next={items.length} onDone={() => { setAdding(false); list.reload() }} /></Sheet>}
    </nav>
  )
}

function HighlightForm({ a, me, next, onDone }: { a: Activity; me: Me; next: number; onDone: () => void }) {
  const [f, setF] = useState({ title: '', body: '', link: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.title.trim()) return toast(tx('Атауын жазыңыз'))
    if (f.link && !/^https?:\/\//.test(f.link.trim())) return toast(tx('Сілтеме https:// деп басталады'))
    setBusy(true)
    try {
      const photo = file ? await uploadPhoto(me.id, file) : null
      await addHighlight({ activity_id: a.id, title: f.title.trim(), body: f.body.trim() || null, link: f.link.trim() || null, photo, sort: next })
      toast(tx('Қосылды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Атауы')} hint={tx('Қысқа: Ережелер, Кесте, Камп 2026')}>{(id, d) => <input id={id} aria-describedby={d} value={f.title} maxLength={30} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} />}</Field>
      <Field label={tx('Мәтін')} hint={tx('Міндетті емес')}>{(id, d) => <textarea id={id} aria-describedby={d} value={f.body} maxLength={3000} onChange={(e) => setF({ ...f, body: e.target.value })} className={`${inputCls} h-28 py-2`} />}</Field>
      <Field label={tx('Сілтеме')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} className={inputCls} placeholder="https://" />}</Field>
      <Field label={tx('Фото')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}

/* ---------- Hall of Fame: results by year ---------- */
export function HallOfFame({ a, canEdit, onCount }: { a: Activity; canEdit: boolean; onCount?: (n: number) => void }) {
  const list = useLoad(async () => { const r = await listAwards(a.id); onCount?.(r.length); return r }, [a.id])
  const [adding, setAdding] = useState(false)
  const items = list.data ?? []
  if (!items.length && !canEdit) return null
  const years = [...new Set(items.map((x) => x.year))]
  const del = async (id: string) => { try { await removeAward(id); list.reload() } catch (e) { toast(errText(e)) } }
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between mt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Нәтижелер мен жетістіктер')}</h2>
        {canEdit && <button type="button" onClick={() => setAdding(true)} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Қосу')}</button>}
      </div>
      {!items.length ? <Card><p className="text-sm text-muted">{tx('Өткен жылдардың жүлделері мен марапаттарын қосыңыз — жаңа оқушылар осыдан көреді.')}</p></Card> : (
        <Card className="grid gap-3">
          {years.map((y) => (
            <div key={y} className="grid gap-1.5">
              <p className="text-sm font-bold text-accent">{y}</p>
              {items.filter((x) => x.year === y).map((x) => (
                <div key={x.id} className="flex gap-3 items-start">
                  <span className="size-8 rounded-full bg-warning-soft text-warning grid place-items-center shrink-0"><Icon n="trophy" size={16} /></span>
                  <div className="flex-1 min-w-0"><p className="font-semibold break-words">{x.title}</p>{x.winners && <p className="text-sm text-muted break-words">{x.winners}</p>}</div>
                  {canEdit && <button type="button" onClick={() => del(x.id)} aria-label={tx('{0} — өшіру', x.title)} className="size-11 -my-2 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
      {adding && <Sheet title={tx('Жетістік қосу')} onClose={() => setAdding(false)}><AwardForm activity={a.id} onDone={() => { setAdding(false); list.reload() }} /></Sheet>}
    </section>
  )
}

function AwardForm({ activity, onDone }: { activity: string; onDone: () => void }) {
  const [f, setF] = useState({ year: String(new Date().getFullYear()), title: '', winners: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Атауын жазыңыз'))
    setBusy(true)
    try { await addAward({ activity_id: activity, year: Number(f.year), title: f.title.trim(), winners: f.winners.trim() || null }); toast(tx('Қосылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Жылы')}>{(id) => <input id={id} type="number" min={2000} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} className={inputCls} />}</Field>
      <Field label={tx('Жетістік')}>{(id) => <input id={id} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Облыстық олимпиада — 1-орын')} />}</Field>
      <Field label={tx('Кімдер')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} value={f.winners} maxLength={500} onChange={(e) => setF({ ...f, winners: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}
