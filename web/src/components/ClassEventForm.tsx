import { useState } from 'react'
import {
  addClassEvent, addClassPhoto, addClassWallet, errText, setClassEventExpenses, setClassEventParticipants, updateClassEvent,
  type ClassEvent, type ClassEventExpense, type ClassEventStatus, type ClassHour, type EventTypeCode, type Media, type MentorMeeting, type Resource, type Staff, type Student, type ClassWallet,
} from '../lib/api'
import { Button, Field, inputCls, toast } from './ui'
import LocationPicker from './LocationPicker'
import { tx } from '../lib/i18n'

type TypeDef = [EventTypeCode, string, string]
const TYPES: TypeDef[] = [
  ['sport', tx('Спорт'), '#2563eb'], ['food', tx('Тамақ'), '#f59e0b'], ['game', tx('Ойын'), '#8b5cf6'], ['film', tx('Фильм'), '#7c3aed'], ['cleaning', tx('Тазалық'), '#0d9488'],
  ['walk', tx('Серуен'), '#16a34a'], ['outing', tx('Қыдыру'), '#16a34a'], ['trip', tx('Саяхат'), '#0891b2'], ['hour_lead', tx('Жетекші тәрбие сағаты'), '#16a34a'], ['hour_parent', tx('Ата-ана тәрбие сағаты'), '#9333ea'],
  ['meeting', tx('Жиналыс'), '#64748b'], ['parent_activity', tx('Ата-ана белсенділігі'), '#ec4899'], ['visit', tx('Қонаққа бару'), '#ec4899'], ['mentor', tx('Жеке кездесу'), '#2563eb'], ['exam', tx('Емтихан'), '#dc2626'], ['birthday', tx('Туған күн'), '#db2777'], ['competition', tx('Жарыс'), '#dc2626'], ['other', tx('Басқа'), '#6b7280'],
]
const legacy = (codes: EventTypeCode[]): ClassEvent['kind'] => codes.some((x) => ['mentor', 'meeting'].includes(x)) ? 'school' : codes.some((x) => ['visit', 'parent_activity', 'hour_parent'].includes(x)) ? 'parents' : codes.some((x) => ['film', 'sport', 'food', 'game', 'cleaning', 'walk', 'outing', 'trip'].includes(x)) ? 'fun' : 'school'
const listText = (v: string) => v.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)
type ExpenseRow = { key: string; wallet: string; walletName: string; amount: string; note: string }
const newExpenseRow = (e?: ClassEventExpense): ExpenseRow => ({ key: e?.id ?? `new-${Math.random().toString(36).slice(2)}`, wallet: e?.wallet_id ?? '', walletName: '', amount: e ? String(e.amount) : '', note: e?.note ?? '' })

export default function ClassEventForm({ classId, date, existing, students, staff, places, media, meetings, hours, wallets, meId, onDone }: {
  classId: string; date: string; existing?: ClassEvent; students: Student[]; staff: Staff[]; places: Resource[]; media: Media[]; meetings: MentorMeeting[]; hours: ClassHour[]; wallets: ClassWallet[]; meId: string; onDone: () => void
}) {
  const initialTypes: EventTypeCode[] = existing?.type_codes?.length ? existing.type_codes : existing?.kind === 'parents' ? ['visit'] : existing?.kind === 'fun' ? ['film'] : ['exam']
  const [title, setTitle] = useState(existing?.title ?? '')
  const [onDate, setOnDate] = useState(existing?.on_date ?? date)
  const [types, setTypes] = useState<EventTypeCode[]>(initialTypes)
  const [start, setStart] = useState(existing?.at_time?.slice(0, 5) ?? '')
  const [end, setEnd] = useState(existing?.end_time?.slice(0, 5) ?? '')
  const [place, setPlace] = useState(existing?.place ?? '')
  const [responsible, setResponsible] = useState(existing?.responsible_id ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [visible, setVisible] = useState(existing?.visible ?? false)
  const [status, setStatus] = useState<ClassEventStatus>(existing?.status ?? 'planned')
  const [participantType, setParticipantType] = useState<'student' | 'group' | 'room'>('student')
  const [selected, setSelected] = useState<string[]>(existing?.participants?.filter((p) => p.kind === 'student').map((p) => p.student_id!).filter(Boolean) ?? [])
  const [groups, setGroups] = useState(existing?.participants?.filter((p) => p.kind === 'group').map((p) => p.label).join(', ') ?? '')
  const [rooms, setRooms] = useState(existing?.participants?.filter((p) => p.kind === 'room').map((p) => p.label).join(', ') ?? '')
  const [link, setLink] = useState(existing?.linked_kind && existing.linked_id ? `${existing.linked_kind}:${existing.linked_id}` : '')
  const oldExpenses = Array.isArray(existing?.expenses) ? existing.expenses : existing?.expenses ? [existing.expenses] : []
  const [expense, setExpense] = useState(oldExpenses.length > 0)
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(oldExpenses.length ? oldExpenses.map(newExpenseRow) : [newExpenseRow()])
  const [files, setFiles] = useState<File[]>([])
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
      const row = { class_id: classId, on_date: onDate, at_time: start || null, end_time: end || null, kind: legacy(types), type_codes: types, title: title.trim(), visible, note: note.trim() || null, place: place.trim() || null, responsible_id: responsible || null, linked_kind: link ? link.split(':')[0] : null, linked_id: link ? link.slice(link.indexOf(':') + 1) : null, status, archived_at: status === 'archived' ? new Date().toISOString() : null }
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
      await setClassEventParticipants(id, participants)
      const resolvedExpenses: { wallet_id: string; amount: number; note: string | null }[] = []
      if (expense) for (const row of expenseRows) {
        const walletId = row.wallet || (await addClassWallet(classId, row.walletName.trim())).id
        resolvedExpenses.push({ wallet_id: walletId, amount: Number(row.amount.trim().replace(',', '.')), note: row.note.trim() || null })
      }
      await setClassEventExpenses(id, expense ? resolvedExpenses : [])
      for (const f of files) await addClassPhoto(classId, onDate, meId, f, title.trim(), id)
      toast(existing ? tx('Оқиға өзгертілді') : tx('Оқиға сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const linkOptions = [
    ...types.includes('film') ? media.filter((m) => m.approved).map((m) => [`media:${m.id}`, `${tx('Фильм')}: ${m.title}`] as [string, string]) : [],
    ...types.includes('mentor') ? meetings.map((m) => [`mentor:${m.id}`, `${tx('Жеке кездесу')}: ${m.topic}`] as [string, string]) : [],
    ...types.some((x) => ['hour_lead', 'hour_parent'].includes(x)) ? hours.map((h) => [`hour:${h.id}`, `${tx('Тәрбие сағаты')}: ${h.topic}`] as [string, string]) : [],
  ]
  return <div className="grid gap-3">
    <Field label={tx('Атауы')}>{(id) => <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} />}</Field>
    <Field label={tx('Іс-шара типтері')} hint={tx('Бірнеше тип таңдауға болады')}>{() => <div className="flex flex-wrap gap-1.5">{TYPES.map(([code, label, color]) => <button key={code} type="button" aria-pressed={types.includes(code)} onClick={() => toggle(code)} className={`min-h-9 px-3 rounded-full text-sm border ${types.includes(code) ? 'text-white border-transparent' : 'bg-surface border-line'}`} style={types.includes(code) ? { backgroundColor: color } : undefined}>{label}</button>)}</div>}</Field>
    <input aria-label={tx('Күні')} type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className={`${inputCls} min-w-0`} />
    <div className="grid grid-cols-2 gap-2"><Field label={tx('Басталуы')}>{(id) => <input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} min-w-0`} />}</Field><Field label={tx('Аяқталуы')}>{(id) => <input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} min-w-0`} />}</Field></div>
    <Field label={tx('Өтетін орны')} hint={tx('Жатақхана орындары немесе мектеп кабинеттері')}>
      {(id) => <LocationPicker id={id} value={place} onChange={setPlace} places={places} />}
    </Field>
    <Field label={tx('Жауапты кісі')}>{() => <select aria-label={tx('Жауапты кісі')} value={responsible} onChange={(e) => setResponsible(e.target.value)} className={inputCls}><option value="">{tx('Таңдалмаған')}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.title ? ` · ${s.title}` : ''}</option>)}</select>}</Field>
    <Field label={tx('Қатысушылар')} hint={tx('Оқушы, топ немесе бөлме бойынша таңдауға болады')}>{() => <><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setParticipantType('student')} className={`h-9 px-3 rounded-full text-sm ${participantType === 'student' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Оқушылар')}</button><button type="button" onClick={() => setParticipantType('group')} className={`h-9 px-3 rounded-full text-sm ${participantType === 'group' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Топ')}</button><button type="button" onClick={() => setParticipantType('room')} className={`h-9 px-3 rounded-full text-sm ${participantType === 'room' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Бөлме')}</button></div>{participantType === 'student' ? <div className="flex flex-wrap gap-1.5 mt-2">{students.map((s) => { const on = selected.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])} className={`h-8 px-3 rounded-full text-xs ${on ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{s.full_name.split(' ').slice(0, 2).join(' ')}</button> })}</div> : <input value={participantType === 'group' ? groups : rooms} onChange={(e) => participantType === 'group' ? setGroups(e.target.value) : setRooms(e.target.value)} className={`${inputCls} mt-2`} placeholder={participantType === 'group' ? tx('Мысалы: Топ 1, Топ 2') : tx('Мысалы: 209-бөлме')} />}</>}</Field>
    {linkOptions.length > 0 && <Field label={tx('Ресурспен байланыстыру')}>{() => <select value={link} onChange={(e) => setLink(e.target.value)} className={inputCls}><option value="">{tx('Байланыстырмау')}</option>{linkOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</Field>}
    <Field label={tx('Ескертпе')} hint={tx('Міндетті емес')}>{(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={`${inputCls} h-20 py-2`} />}</Field>
    <Field label={tx('Статус')}>{() => <select value={status} onChange={(e) => setStatus(e.target.value as ClassEventStatus)} className={inputCls}><option value="planned">{tx('Жоспарланған')}</option><option value="passed">{tx('Өтті')}</option><option value="postponed">{tx('Кейінге қалдырылды')}</option><option value="archived">{tx('Мұрағаттау')}</option></select>}</Field>
    <label className="flex items-start gap-3 rounded-md bg-surface-2 p-3"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="mt-0.5 size-5 accent-[var(--accent)]" /><span className="text-sm"><span className="block font-semibold">{tx('Оқушыларға көрсету')}</span><span className="block text-muted">{tx('Қаржы мәліметтері оқушыларға көрінбейді')}</span></span></label>
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
    <label className="h-14 rounded-md border-2 border-dashed border-line grid place-items-center text-sm text-muted cursor-pointer"><span>{files.length ? tx('{0} сурет таңдалды', files.length) : tx('Фото қосу (міндетті емес)')}</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
    <Button block loading={busy} onClick={save}>{existing ? tx('Өзгерту') : tx('Сақтау')}</Button>
  </div>
}
