import { useState } from 'react'
import { errText, photoUrl, removeRecipe, saveRecipe, uploadPhoto, type Recipe, type RecipeItem } from '../lib/api'
import { money } from '../lib/money'
import { parseTags, scaleAmount } from '../lib/recipe'
import { Button, Card, Empty, Field, Sheet, inputCls, toast } from './ui'
import { tx } from '../lib/i18n'

/* «Рецепттер»: ingredients with amounts and prices (scaled to any number of people), steps and #tags. */

const UNITS = ['г', 'кг', 'мл', 'л', 'дана', 'ас қасық', 'шай қасық', 'стақан', 'пакет']
const cost = (r: Recipe) => r.items.reduce((a, x) => a + Number(x.price), 0)

export default function Recipes({ classId, recipes, classSize, staff, me, reload }: { classId: string; recipes: Recipe[]; classSize: number; staff: boolean; me: string; reload: () => void }) {
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Recipe | null>(null)
  const [edit, setEdit] = useState<Recipe | 'new' | null>(null)
  const tags = [...new Set(recipes.flatMap((r) => r.tags))].sort()
  const shown = recipes.filter((r) => (!tag || r.tags.includes(tag)) && (!q || r.title.toLowerCase().includes(q.toLowerCase()) || r.items.some((x) => x.name.toLowerCase().includes(q.toLowerCase()))))
  return <div className="grid gap-3">
    <div className="flex gap-2">
      <input aria-label={tx('Іздеу')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Рецепт не азық-түлік іздеу')} className={`${inputCls} flex-1 min-w-0`} />
      {staff && <Button onClick={() => setEdit('new')}>{tx('+ Рецепт')}</Button>}
    </div>
    {tags.length > 0 && <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)} className={`h-8 px-3 rounded-full text-xs font-medium ${tag === t ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>#{t}</button>)}
    </div>}
    {!shown.length ? <Empty icon="book" title={recipes.length ? tx('Ештеңе табылмады') : tx('Рецепт әлі жоқ')} text={staff && !recipes.length ? tx('Шай кеші, пудинг, пицца — сыныппен жасайтын тағамдардың рецептін қосыңыз.') : undefined} />
      : <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {shown.map((r) => <button key={r.id} type="button" onClick={() => setOpen(r)} className="text-left rounded-md bg-surface border border-line overflow-hidden">
          {r.photo ? <img src={photoUrl(r.photo)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3] grid place-items-center bg-surface-2 text-3xl" aria-hidden>🍲</div>}
          <div className="p-2 grid gap-0.5">
            <span className="font-semibold text-sm line-clamp-2">{r.title}</span>
            <span className="text-xs text-muted">{tx('{0} адамға · {1}', r.servings, money(cost(r)))}</span>
            {r.tags.length > 0 && <span className="text-[11px] text-accent truncate">{r.tags.map((t) => `#${t}`).join(' ')}</span>}
          </div>
        </button>)}
      </div>}
    {open && <RecipeSheet r={open} classSize={classSize} staff={staff} onEdit={() => { setEdit(open); setOpen(null) }} onClose={() => setOpen(null)} />}
    {edit && <RecipeEditor classId={classId} r={edit === 'new' ? null : edit} me={me} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
  </div>
}

function RecipeSheet({ r, classSize, staff, onEdit, onClose }: { r: Recipe; classSize: number; staff: boolean; onEdit: () => void; onClose: () => void }) {
  const [people, setPeople] = useState(classSize || r.servings)
  const total = cost(r) * people / r.servings
  const steps = r.steps.split('\n').map((x) => x.trim()).filter(Boolean)
  return <Sheet title={r.title} onClose={onClose} right={staff ? <Button kind="ghost" onClick={onEdit}>{tx('Өзгерту')}</Button> : undefined}>
    <div className="grid gap-3">
      {r.photo && <img src={photoUrl(r.photo)} alt="" className="w-full max-h-64 object-cover rounded-md" />}
      {r.tags.length > 0 && <p className="text-xs text-accent">{r.tags.map((t) => `#${t}`).join(' ')}</p>}
      <div className="flex items-center gap-2 rounded-md bg-surface-2 p-2">
        <label htmlFor="rc-people" className="text-sm flex-1">{tx('Неше адамға?')}</label>
        <button type="button" aria-label="−" onClick={() => setPeople(Math.max(1, people - 1))} className="size-9 rounded-md bg-surface">−</button>
        <input id="rc-people" type="number" min={1} max={500} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className={`${inputCls} w-16 text-center px-1`} />
        <button type="button" aria-label="+" onClick={() => setPeople(Math.min(500, people + 1))} className="size-9 rounded-md bg-surface">+</button>
      </div>
      <Card className="grid gap-1.5">
        <p className="font-semibold">{tx('Азық-түлік')}</p>
        {r.items.map((x, i) => <div key={x.id ?? i} className="flex items-baseline gap-2 text-sm">
          <span className="flex-1">{x.name}</span>
          <span className="tabular-nums text-muted">{x.amount != null ? `${scaleAmount(Number(x.amount), r.servings, people)} ${x.unit ?? ''}` : x.unit ?? ''}</span>
          <span className="tabular-nums w-20 text-right">{Number(x.price) ? money(Number(x.price) * people / r.servings) : '—'}</span>
        </div>)}
        <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-sm"><span>{tx('Барлығы (жобамен)')}</span><span className="tabular-nums">{money(total)}</span></div>
        <p className="text-xs text-muted">{tx('Бір адамға ≈ {0}', money(total / people))}</p>
      </Card>
      {steps.length > 0 && <Card className="grid gap-2">
        <p className="font-semibold">{tx('Жасалу қадамдары')}</p>
        <ol className="grid gap-2">{steps.map((s, i) => <li key={i} className="flex gap-2 text-sm"><span className="size-6 shrink-0 grid place-items-center rounded-full bg-accent-soft text-accent text-xs font-bold">{i + 1}</span><span>{s}</span></li>)}</ol>
      </Card>}
    </div>
  </Sheet>
}

type Row = { name: string; amount: string; unit: string; price: string }
const toRow = (x?: RecipeItem): Row => ({ name: x?.name ?? '', amount: x?.amount != null ? String(x.amount) : '', unit: x?.unit ?? 'г', price: x && Number(x.price) ? String(x.price) : '' })
const num = (s: string) => Number(s.trim().replace(',', '.'))

function RecipeEditor({ classId, r, me, onClose, onDone }: { classId: string; r: Recipe | null; me: string; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(r?.title ?? '')
  const [servings, setServings] = useState(String(r?.servings ?? 4))
  const [tags, setTags] = useState(r?.tags.map((t) => `#${t}`).join(' ') ?? '')
  const [steps, setSteps] = useState(r?.steps ?? '')
  const [rows, setRows] = useState<Row[]>(r?.items.length ? r.items.map(toRow) : [toRow(), toRow()])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const save = async () => {
    const items = rows.filter((x) => x.name.trim())
    if (title.trim().length < 2) return toast(tx('Рецепт атауын жазыңыз'))
    if (!(num(servings) >= 1)) return toast(tx('Адам санын жазыңыз'))
    if (items.some((x) => (x.amount && !(num(x.amount) > 0)) || (x.price && !(num(x.price) >= 0)))) return toast(tx('Мөлшер мен баға сан болуы керек'))
    setBusy(true)
    try {
      const photo = file ? await uploadPhoto(me, file) : r?.photo ?? null
      await saveRecipe({ ...(r ? { id: r.id } : {}), class_id: classId, title: title.trim(), servings: Math.round(num(servings)), steps: steps.trim(), tags: parseTags(tags), photo },
        items.map((x) => ({ name: x.name.trim(), amount: x.amount ? num(x.amount) : null, unit: x.unit || null, price: x.price ? num(x.price) : 0 })))
      onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!r || !confirm(tx('«{0}» рецептін өшіру керек пе?', r.title))) return
    try { await removeRecipe(r.id); onDone() } catch (e) { toast(errText(e)) }
  }
  return <Sheet title={r ? tx('Рецептті өзгерту') : tx('Жаңа рецепт')} onClose={onClose}>
    <div className="grid gap-3">
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label={tx('Атауы')}>{(id) => <input id={id} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={tx('Мысалы: Шоколадты пудинг')} className={inputCls} />}</Field>
        <Field label={tx('Адам саны')}>{(id) => <input id={id} type="number" min={1} max={500} value={servings} onChange={(e) => setServings(e.target.value)} className={inputCls} />}</Field>
      </div>
      <Field label={tx('Хэштегтер')} hint={tx('Мысалы: #пудинг #десерт')}>{(id, d) => <input id={id} aria-describedby={d} value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} />}</Field>
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold">{tx('Азық-түлік (адам санына шаққанда)')}</span>
        {rows.map((x, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-1 items-center rounded-md bg-surface-2 p-1 [&_input]:min-w-0 [&_select]:min-w-0">
          <input aria-label={tx('Атауы')} value={x.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder={tx('Сүт')} className={`${inputCls} px-2 col-span-3 sm:col-span-1`} />
          <button type="button" aria-label={tx('Өшіру')} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="size-9 grid place-items-center text-muted sm:order-last">✕</button>
          <input aria-label={tx('Мөлшері')} inputMode="decimal" value={x.amount} onChange={(e) => set(i, 'amount', e.target.value)} placeholder={tx('Мөлшері')} className={`${inputCls} px-2`} />
          <select aria-label={tx('Өлшем')} value={x.unit} onChange={(e) => set(i, 'unit', e.target.value)} className={`${inputCls} px-1`}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          <input aria-label={tx('Бағасы, ₸')} inputMode="decimal" value={x.price} onChange={(e) => set(i, 'price', e.target.value)} placeholder="₸" className={`${inputCls} px-2`} />
        </div>)}
        <button type="button" onClick={() => setRows([...rows, toRow()])} className="h-10 rounded-md bg-surface-2 text-accent text-sm font-semibold">{tx('+ Азық-түлік')}</button>
      </div>
      <Field label={tx('Жасалу қадамдары')} hint={tx('Әр қадам — жаңа жолдан')}>{(id, d) => <textarea id={id} aria-describedby={d} rows={5} maxLength={5000} value={steps} onChange={(e) => setSteps(e.target.value)} className={`${inputCls} h-auto py-2`} />}</Field>
      <label className="h-12 rounded-md border-2 border-dashed border-line grid place-items-center text-sm text-muted cursor-pointer">{file ? file.name : r?.photo ? tx('Суретті ауыстыру') : tx('Сурет қосу (міндетті емес)')}<input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {r && <Button block kind="danger" onClick={remove}>{tx('Рецептті өшіру')}</Button>}
    </div>
  </Sheet>
}
