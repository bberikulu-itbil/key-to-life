import { useState } from 'react'
import {
  addClassEvent, addClassPhoto, addClassWallet, errText, photoUrl, removeClassPhoto, type ClassPhoto, type Recipe, setClassEventExpenses, setClassEventParticipants, updateClassEvent,
  type CalAudience, type ClassEvent, type ClassEventExpense, type ClassEventStatus, type ClassHour, type EventTypeCode, type Media, type MentorMeeting, type Resource, type Staff, type Student, type ClassWallet,
} from '../lib/api'
import { Button, Field, inputCls, toast } from './ui'
import LocationPicker from './LocationPicker'
import { tx } from '../lib/i18n'
import { money } from '../lib/money'
import { FUN_TYPES, TYPE_GROUPS } from '../lib/eventTypes'

const legacy = (codes: EventTypeCode[]): ClassEvent['kind'] => codes.some((x) => ['mentor', 'meeting'].includes(x)) ? 'school' : codes.some((x) => ['visit', 'parent_activity', 'hour_parent'].includes(x)) ? 'parents' : codes.some((x) => FUN_TYPES.includes(x)) ? 'fun' : 'school'
const listText = (v: string) => v.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)
type ExpenseRow = { key: string; wallet: string; walletName: string; amount: string; note: string }
const newExpenseRow = (e?: ClassEventExpense): ExpenseRow => ({ key: e?.id ?? `new-${Math.random().toString(36).slice(2)}`, wallet: e?.wallet_id ?? '', walletName: '', amount: e ? String(e.amount) : '', note: e?.note ?? '' })

export default function ClassEventForm({ classId, date, existing, defaultTypes, defaultStudentId, students, staff, places, media, meetings, hours, wallets, photos = [], recipes = [], meId, onDone }: {
  classId: string; date: string; existing?: ClassEvent; defaultTypes?: EventTypeCode[]; defaultStudentId?: string; students: Student[]; staff: Staff[]; places: Resource[]; media: Media[]; meetings: MentorMeeting[]; hours: ClassHour[]; wallets: ClassWallet[]; photos?: ClassPhoto[]; recipes?: Recipe[]; meId: string; onDone: () => void
}) {
  const initialTypes: EventTypeCode[] = existing?.type_codes?.length ? existing.type_codes : defaultTypes?.length ? defaultTypes : existing?.kind === 'parents' ? ['visit'] : existing?.kind === 'fun' ? ['film'] : ['exam']
  const [title, setTitle] = useState(existing?.title ?? '')
  const [onDate, setOnDate] = useState(existing?.on_date ?? date)
  const [types, setTypes] = useState<EventTypeCode[]>(initialTypes)
  const [start, setStart] = useState(existing?.at_time?.slice(0, 5) ?? '')
  const [end, setEnd] = useState(existing?.end_time?.slice(0, 5) ?? '')
  const [place, setPlace] = useState(existing?.place ?? '')
  const [responsible, setResponsible] = useState(existing ? existing.responsible_id ?? '' : meId)
  const [hasPlace, setHasPlace] = useState(!!existing?.place)
  const [notify, setNotify] = useState(existing?.notify ?? false)
  const [note, setNote] = useState(existing?.note ?? '')
  const [visible, setVisible] = useState(existing?.visible ?? false)
  const [audience, setAudience] = useState<CalAudience>(existing?.audience ?? (existing?.visible ? 'students' : 'all'))
  const [status, setStatus] = useState<ClassEventStatus>(existing?.status ?? 'planned')
  const [showPeople, setShowPeople] = useState(!!existing?.participants?.length || !!defaultStudentId || initialTypes.some((x) => x === 'mentor' || x === 'visit'))
  const [participantType, setParticipantType] = useState<'student' | 'group' | 'room'>('student')
  const [selected, setSelected] = useState<string[]>(
    existing?.participants?.filter((p) => p.kind === 'student').map((p) => p.student_id!).filter(Boolean) ?? (defaultStudentId ? [defaultStudentId] : [])
  )
  const [groups, setGroups] = useState(existing?.participants?.filter((p) => p.kind === 'group').map((p) => p.label).join(', ') ?? '')
  const [rooms, setRooms] = useState(existing?.participants?.filter((p) => p.kind === 'room').map((p) => p.label).join(', ') ?? '')
  const [link, setLink] = useState(existing?.linked_kind && existing.linked_id ? `${existing.linked_kind}:${existing.linked_id}` : '')
  const oldExpenses = Array.isArray(existing?.expenses) ? existing.expenses : existing?.expenses ? [existing.expenses] : []
  const [expense, setExpense] = useState(oldExpenses.length > 0)
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(oldExpenses.length ? oldExpenses.map(newExpenseRow) : [newExpenseRow()])
  const [files, setFiles] = useState<File[]>([])
  // Existing photos: removed ids, and ids replaced by a new file (old one removed on save).
  const [removed, setRemoved] = useState<string[]>([])
  const [replaced, setReplaced] = useState<Record<string, File>>({})
  const [busy, setBusy] = useState(false)
  const toggle = (code: EventTypeCode) => setTypes(types.includes(code) ? types.filter((x) => x !== code) : [...types, code])
  const updateExpenseRow = (key: string, patch: Partial<ExpenseRow>) => setExpenseRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row))
  const save = async () => {
    if (title.trim().length < 2 || !types.length) return toast(tx('Атауы мен кемінде бір типті таңдаңыз'))
    const invalidExpense = expense && (!expenseRows.length || expenseRows.some((row) => {
      const parsed = Number(row.amount.trim().replace(',', '.'))
      return ((!row.wallet && !row.walletName.trim()) || !Number.isFinite(parsed) || parsed <= 0)
    }))
    const selectedWallets = expenseRows.filter((row) => row.wallet).map((row) => row.wallet)
    if (invalidExpense) return toast(tx('Қаржы үшін әр шығынға әмиянды және 0-ден үлкен соманы көрсетіңіз'))
    if (expense && new Set(selectedWallets).size !== selectedWallets.length) return toast(tx('Бір әмиянды екі рет таңдамаңыз'))
    setBusy(true)
    try {
      const isSchool = classId === 'school'
      const row = { class_id: isSchool ? null : classId, on_date: onDate, at_time: start || null, end_time: end || null, kind: legacy(types), type_codes: types, title: title.trim(), visible: audience === 'students' || audience === 'all' || visible, audience, note: note.trim() || null, place: hasPlace ? place.trim() || null : null, responsible_id: responsible || null, linked_kind: link ? link.split(':')[0] : null, linked_id: link ? link.slice(link.indexOf(':') + 1) : null, notify: !isSchool && notify, status, archived_at: status === 'archived' ? new Date().toISOString() : null }
      const id = existing ? existing.id : (await addClassEvent(row)).id
      if (existing) {
        const changes = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'class_id')) as Partial<Parameters<typeof updateClassEvent>[1]>
        await updateClassEvent(id, changes)
      }
      const participants = [
        ...selected.map((student_id) => ({ kind: 'student' as const, student_id, label: students.find((s) => s.id === student_id)?.full_name ?? student_id })),
        ...listText(groups).map((label) => ({ kind: 'group' as const, label })),
        ...listText(rooms).map((label) => ({ kind: 'room' as const, label })),
      ]
      if (participants.length || existing?.participants?.length) {
        await setClassEventParticipants(id, participants)
      }
      if (!isSchool) {
        const resolvedExpenses: { wallet_id: string; amount: number; note: string | null }[] = []
        if (expense) for (const row of expenseRows) {
          const walletId = row.wallet || (await addClassWallet(classId, row.walletName.trim())).id
          resolvedExpenses.push({ wallet_id: walletId, amount: Number(row.amount.trim().replace(',', '.')), note: row.note.trim() || null })
        }
        await setClassEventExpenses(id, expense ? resolvedExpenses : [])
        for (const p of photos) {
          if (replaced[p.id]) await addClassPhoto(classId, onDate, meId, replaced[p.id], p.caption ?? title.trim(), id)
          if (replaced[p.id] || removed.includes(p.id)) await removeClassPhoto(p.id)
        }
        for (const f of files) await addClassPhoto(classId, onDate, meId, f, title.trim(), id)
      }
      toast(existing ? tx('Оқиға өзгертілді') : tx('Оқиға сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const linkedRecipe = link.startsWith('recipe:') ? recipes.find((r) => r.id === link.slice(7)) : undefined
  // People = listed students, else the whole class; price lines are for the recipe's own servings.
  const recipePeople = selected.length || students.length || linkedRecipe?.servings || 1
  const recipeCost = linkedRecipe ? Math.round(linkedRecipe.items.reduce((a, x) => a + Number(x.price), 0) * recipePeople / linkedRecipe.servings) : 0
  const addRecipeCost = () => { if (!linkedRecipe) return; setExpense(true); setExpenseRows([...expenseRows.filter((x) => x.amount.trim()), { ...newExpenseRow(), amount: String(recipeCost), note: linkedRecipe.title }]) }
  const linkOptions = [
    ...types.some((x) => ['food', 'tea', 'birthday'].includes(x)) ? recipes.map((r) => [`recipe:${r.id}`, `${tx('Рецепт')}: ${r.title}`] as [string, string]) : [],
    ...types.includes('film') ? media.filter((m) => m.approved).map((m) => [`media:${m.id}`, `${tx('Фильм')}: ${m.title}`] as [string, string]) : [],
    ...types.includes('mentor') ? meetings.map((m) => [`mentor:${m.id}`, `${tx('Жеке кездесу')}: ${m.topic}`] as [string, string]) : [],
    ...types.some((x) => ['hour_lead', 'hour_parent'].includes(x)) ? hours.map((h) => [`hour:${h.id}`, `${tx('Тәрбие сағаты')}: ${h.topic}`] as [string, string]) : [],
  ]
  const peopleSummary = [selected.length ? tx('{0} оқушы', selected.length) : '', listText(groups).length ? tx('{0} топ', listText(groups).length) : '', listText(rooms).length ? tx('{0} бөлме', listText(rooms).length) : ''].filter(Boolean).join(', ') || tx('Бүкіл сынып')
  return <div className="grid gap-3">
    <Field label={tx('Атауы')}>{(id) => (
      <div className="grid gap-1.5">
        <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} placeholder={types.includes('mentor') ? tx('Жеке кездесу тақырыбы (не төмендегіден таңдаңыз)') : ''} />
        {types.includes('mentor') && (
          <div className="flex flex-wrap gap-1.5">
            {[tx('Үлгерім мен БЖБ'), tx('Бейімделу және көңіл-күй'), tx('Олимпиадаға дайындық'), tx('Мамандық пен болашақ'), tx('Тәртіп пен ереже'), tx('Жеке әңгіме')].map((topic) => (
              <button key={topic} type="button" onClick={() => setTitle(topic)} className={`h-7 px-2.5 rounded-full text-xs font-medium transition border ${title === topic ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 hover:bg-surface border-line text-ink'}`}>
                {topic}
              </button>
            ))}
          </div>
        )}
      </div>
    )}</Field>
    <div className="grid gap-2">
      <span className="text-sm font-semibold">{tx('Іс-шара типі')}</span>
      {TYPE_GROUPS.map((g) => <div key={g.label} className="flex flex-wrap items-center gap-1.5">
        <span className="w-full text-[11px] uppercase tracking-wide text-muted">{g.label}</span>
        {g.types.map(({ code, label, emoji, color }) => { const on = types.includes(code); return <button key={code} type="button" aria-pressed={on} onClick={() => toggle(code)} className={`h-8 pl-2 pr-3 rounded-full text-xs font-medium border transition inline-flex items-center gap-1 ${on ? '' : 'bg-surface-2 border-transparent text-ink hover:bg-surface'}`} style={on ? { backgroundColor: `${color}1f`, borderColor: color, color } : undefined}><span aria-hidden>{emoji}</span>{label}</button> })}
      </div>)}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_1fr] gap-2">
      <div className="col-span-2 sm:col-span-1"><Field label={tx('Күні')}>{(id) => <input id={id} type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={`${inputCls} min-w-0 px-2`} />}</Field></div>
      <Field label={tx('Басталуы')}>{(id) => <input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} min-w-0 px-2`} />}</Field>
      <Field label={tx('Аяқталуы')}>{(id) => <input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} min-w-0 px-2`} />}</Field>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasPlace} onChange={(e) => setHasPlace(e.target.checked)} className="size-4 accent-[var(--accent)]" />{tx('Өтетін орынды көрсету')}</label>
    {hasPlace && <LocationPicker id="ev-place" value={place} onChange={setPlace} places={places} />}
    <Field label={tx('Жауапты кісі')}>{() => <select aria-label={tx('Жауапты кісі')} value={responsible} onChange={(e) => setResponsible(e.target.value)} className={inputCls}><option value="">{tx('Таңдалмаған')}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.id === meId ? `${s.full_name} (${tx('мен')})` : s.full_name}{s.title ? ` · ${s.title}` : ''}</option>)}</select>}</Field>
    <div className="rounded-md border border-line">
      <button type="button" aria-expanded={showPeople} onClick={() => setShowPeople(!showPeople)} className="w-full h-11 px-3 flex items-center gap-2 text-sm text-left">
        <span className="font-semibold">{tx('Қатысушылар')}</span><span className="flex-1 truncate text-muted">{peopleSummary}</span><span className="text-muted">{showPeople ? '▴' : '▾'}</span>
      </button>
      {showPeople && <div className="px-3 pb-3"><><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setParticipantType('student')} className={`h-9 px-3 rounded-full text-sm ${participantType === 'student' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Оқушылар')}</button><button type="button" onClick={() => setParticipantType('group')} className={`h-9 px-3 rounded-full text-sm ${participantType === 'group' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Топ')}</button><button type="button" onClick={() => setParticipantType('room')} className={`h-9 px-3 rounded-full text-sm ${participantType === 'room' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Бөлме')}</button></div>{participantType === 'student' ? <div className="flex flex-wrap gap-1.5 mt-2">{students.map((s) => { const on = selected.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])} className={`h-8 px-3 rounded-full text-xs ${on ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{s.full_name.split(' ').slice(0, 2).join(' ')}</button> })}</div> : <input value={participantType === 'group' ? groups : rooms} onChange={(e) => participantType === 'group' ? setGroups(e.target.value) : setRooms(e.target.value)} className={`${inputCls} mt-2`} placeholder={participantType === 'group' ? tx('Мысалы: Топ 1, Топ 2') : tx('Мысалы: 209-бөлме')} />}</></div>}
    </div>
    {linkOptions.length > 0 && <Field label={tx('Ресурспен байланыстыру')}>{() => <select value={link} onChange={(e) => setLink(e.target.value)} className={inputCls}><option value="">{tx('Байланыстырмау')}</option>{linkOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>}
    {linkedRecipe && classId !== 'school' && <button type="button" onClick={addRecipeCost} className="h-10 rounded-md bg-surface-2 text-accent text-sm font-semibold">{tx('Рецепт құнын шығынға қосу ({0} адам · {1})', recipePeople, money(recipeCost))}</button>}
    <Field label={tx('Ескертпе')} hint={tx('Міндетті емес')}>{(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={`${inputCls} h-20 py-2`} />}</Field>
    {existing && <Field label={tx('Статус')}>{() => <select value={status} onChange={(e) => setStatus(e.target.value as ClassEventStatus)} className={inputCls}><option value="planned">{tx('Жоспарланған')}</option><option value="passed">{tx('Өтті')}</option><option value="postponed">{tx('Кейінге қалдырылды')}</option><option value="archived">{tx('Мұрағаттау')}</option></select>}</Field>}
    <Field label={tx('Көрінетін аудитория')} hint={tx('Оқиға кімдерге көрінетінін таңдаңыз')}>
      {() => (
        <select
          value={audience}
          onChange={(e) => {
            const val = e.target.value as CalAudience
            setAudience(val)
            setVisible(val === 'all' || val === 'students')
          }}
          className={inputCls}
        >
          <option value="all">{tx('Барлығына (оқушылар мен ұстаздар)')}</option>
          <option value="students">{tx('Оқушыларға')}</option>
          <option value="teachers">{tx('Мұғалімдерге')}</option>
          <option value="tutors">{tx('Тәрбиешілерге')}</option>
          <option value="staff">{tx('Мұғалімдер мен тәрбиешілерге')}</option>
        </select>
      )}
    </Field>
    {classId !== 'school' && (
      <label className="flex items-center gap-3 rounded-md bg-surface-2 px-3 h-12 text-sm cursor-pointer">
        <span className="flex-1">🔔 {tx('Оқушыларға хабарлама жіберу')}</span>
        <input type="checkbox" role="switch" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5 accent-[var(--accent)]" />
      </label>
    )}
    {classId !== 'school' && (
      <div className="grid gap-2 rounded-md bg-surface-2 p-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} className="size-5 accent-[var(--accent)]" />{tx('Қаржы қосу')}
        </label>
        {expense && <>
          <div className="grid gap-2">
            {expenseRows.map((row, index) => <div key={row.key} className="grid gap-2 rounded-md border border-line p-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs font-semibold text-muted">{tx('Шығын')} {index + 1}</span>
                {expenseRows.length > 1 && <button type="button" onClick={() => setExpenseRows(expenseRows.filter((x) => x.key !== row.key))} className="size-8 rounded-md text-muted hover:bg-surface-2" aria-label={tx('Өшіру')}>×</button>}
              </div>
              <select value={row.wallet} onChange={(e) => updateExpenseRow(row.key, { wallet: e.target.value })} className={inputCls}>
                <option value="">{tx('Әмиянды таңдаңыз')}</option>
                {wallets.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {!row.wallet && <input value={row.walletName} onChange={(e) => updateExpenseRow(row.key, { walletName: e.target.value })} className={inputCls} placeholder={tx('Жаңа әмиян атауы')} />}
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={0.01} step="0.01" value={row.amount} onChange={(e) => updateExpenseRow(row.key, { amount: e.target.value })} className={inputCls} placeholder={tx('Сома')} />
                <input value={row.note} onChange={(e) => updateExpenseRow(row.key, { note: e.target.value })} className={inputCls} placeholder={tx('Қаржы түсініктемесі')} />
              </div>
            </div>)}
          </div>
          <button type="button" onClick={() => setExpenseRows([...expenseRows, newExpenseRow()])} className="h-10 rounded-md bg-surface text-accent text-sm font-semibold">{tx('+ Тағы шығын қосу')}</button>
          <p className="text-xs text-muted text-right">{tx('Жалпы')}: {expenseRows.reduce((sum, row) => sum + (Number(row.amount.replace(',', '.')) || 0), 0).toLocaleString()} ₸</p>
        </>}
      </div>
    )}
    {classId !== 'school' && (<>
      {photos.length > 0 && <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => { const gone = removed.includes(p.id); const nf = replaced[p.id]; return <div key={p.id} className={`relative aspect-square rounded-md overflow-hidden bg-surface-2 ${gone ? 'opacity-30' : ''}`}>
          <img src={nf ? URL.createObjectURL(nf) : photoUrl(p.path)} alt={p.caption ?? ''} className="size-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 bg-gradient-to-t from-black/60">
            {gone ? <button type="button" onClick={() => setRemoved(removed.filter((x) => x !== p.id))} className="h-8 px-2 rounded bg-white/90 text-xs text-black">{tx('Қайтару')}</button> : <>
              <label className="h-8 px-2 grid place-items-center rounded bg-white/90 text-xs text-black cursor-pointer">{tx('Алмастыру')}<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setReplaced({ ...replaced, [p.id]: f }) }} /></label>
              <button type="button" aria-label={tx('Өшіру')} onClick={() => { setRemoved([...removed, p.id]); const r = { ...replaced }; delete r[p.id]; setReplaced(r) }} className="size-8 grid place-items-center rounded bg-white/90 text-black">✕</button>
            </>}
          </div>
        </div> })}
      </div>}
      <label className="h-14 rounded-md border-2 border-dashed border-line grid place-items-center text-sm text-muted cursor-pointer"><span>{files.length ? tx('{0} сурет таңдалды', files.length) : tx('Фото қосу (міндетті емес)')}</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
    </>)}
    <Button block loading={busy} onClick={save}>{existing ? tx('Өзгерту') : tx('Сақтау')}</Button>
  </div>
}
