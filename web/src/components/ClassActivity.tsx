import { useState } from 'react'
import { classActivityStats, errText, listClassGroups, removeClassGroup, saveClassGroup, type ActivityStat, type ClassGroup, type Student } from '../lib/api'
import { addDays, fmtDate, today } from '../lib/time'
import { Button, Chips, Empty, ErrorBox, Field, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

/* «Белсенділік»: class groups for a period and each student's activity over a chosen period. */

const COLORS = ['#4F46E5', '#16A34A', '#EA580C', '#0284C7', '#9333EA', '#E11D48', '#CA8A04', '#0D9488']
type Period = 'week' | 'month' | 'year' | 'custom'

const schoolYearStart = (d: string) => `${Number(d.slice(0, 4)) - (Number(d.slice(5, 7)) < 9 ? 1 : 0)}-09-01`
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

export default function ClassActivity({ classId, students }: { classId: string; students: Student[] }) {
  const t = today()
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState({ from: `${t.slice(0, 8)}01`, to: t })
  const range = period === 'week' ? { from: addDays(t, -6), to: t } : period === 'month' ? { from: `${t.slice(0, 8)}01`, to: t } : period === 'year' ? { from: schoolYearStart(t), to: t } : custom
  const [group, setGroup] = useState('all')
  const [edit, setEdit] = useState<ClassGroup | 'new' | null>(null)
  const groups = useLoad(() => listClassGroups(classId), [classId])
  const stats = useLoad(() => classActivityStats(classId, range.from, range.to), [classId, range.from, range.to])

  const active = (groups.data ?? []).filter((g) => g.starts_on <= range.to && (!g.ends_on || g.ends_on >= range.from))
  const sel = active.find((g) => g.id === group)
  const byId = new Map((stats.data ?? []).map((r) => [r.student_id, r]))
  const rows = students.filter((s) => !sel || sel.members.some((m) => m.student_id === s.id)).map((s) => ({ s, r: byId.get(s.id) }))
  const groupOf = (id: string) => active.filter((g) => g.members.some((m) => m.student_id === id))

  return <div className="grid gap-3">
    <Chips label={tx('Кезең')} value={period} onChange={setPeriod} items={[['week', tx('7 күн')], ['month', tx('Осы ай')], ['year', tx('Оқу жылы')], ['custom', tx('Таңдау')]]} />
    {period === 'custom' && <div className="grid grid-cols-2 gap-2">
      <Field label={tx('Басы')}>{(id) => <input id={id} type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={inputCls} />}</Field>
      <Field label={tx('Соңы')}>{(id) => <input id={id} type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={inputCls} />}</Field>
    </div>}

    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-full text-xs font-semibold text-muted">{tx('Топтар')}</span>
      <button type="button" aria-pressed={group === 'all'} onClick={() => setGroup('all')} className={`h-8 px-3 rounded-full text-xs font-medium ${group === 'all' ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{tx('Бүкіл сынып')}</button>
      {active.map((g) => <span key={g.id} className="inline-flex items-center rounded-full text-xs font-medium overflow-hidden" style={{ backgroundColor: `${g.color ?? COLORS[0]}1f`, color: g.color ?? COLORS[0], boxShadow: group === g.id ? `inset 0 0 0 1.5px ${g.color ?? COLORS[0]}` : undefined }}>
        <button type="button" aria-pressed={group === g.id} onClick={() => setGroup(group === g.id ? 'all' : g.id)} className="h-8 pl-3 pr-1.5">{g.name} · {g.members.length}</button>
        <button type="button" aria-label={tx('Өзгерту')} onClick={() => setEdit(g)} className="h-8 px-2">✎</button>
      </span>)}
      <button type="button" onClick={() => setEdit('new')} className="h-8 px-3 rounded-full text-xs font-semibold text-accent border border-dashed border-accent/50">{tx('+ Топ')}</button>
    </div>

    {stats.loading && !stats.data ? <Skeleton /> : stats.error ? <ErrorBox text={stats.error} retry={stats.reload} /> : !rows.length ? <Empty icon="users" title={tx('Оқушы жоқ')} /> : <>
      <Summary rows={rows.map((x) => x.r).filter((r): r is ActivityStat => !!r)} />
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="sticky left-0 bg-surface-2 text-left font-semibold px-3 py-2">{tx('Оқушы')}</th>
              <th className="px-2 py-2 font-semibold" title={tx('Іс-шараға қатысу')}>🎉</th>
              <th className="px-2 py-2 font-semibold" title={tx('Жеке кездесу')}>💬</th>
              <th className="px-2 py-2 font-semibold" title={tx('Тапсырма')}>✅</th>
              <th className="px-2 py-2 font-semibold" title={tx('Әдет')}>🔁</th>
              <th className="px-2 py-2 font-semibold" title={tx('Мақсат')}>🎯</th>
              <th className="px-2 py-2 font-semibold" title={tx('Ата-ана: қонаққа бару / жиналыс / байланыс')}>👪</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, r }) => <tr key={s.id} className="border-t border-line">
              <td className="sticky left-0 bg-surface px-3 py-2 min-w-36">
                <div className="truncate max-w-44">{s.full_name.split(' ').slice(0, 2).join(' ')}</div>
                {groupOf(s.id).length > 0 && <div className="flex gap-1 mt-0.5">{groupOf(s.id).map((g) => <span key={g.id} className="size-2 rounded-full" style={{ backgroundColor: g.color ?? COLORS[0] }} title={g.name} />)}</div>}
              </td>
              <Cell v={r?.events} />
              <Cell v={r?.mentor} warn={r ? r.mentor === 0 : false} />
              <Cell v={r ? `${r.tasks_done}/${r.tasks_total}` : undefined} p={r ? pct(r.tasks_done, r.tasks_total) : null} />
              <Cell v={r && r.habit_expected ? `${pct(r.habit_checks, r.habit_expected)}%` : '—'} p={r ? pct(r.habit_checks, r.habit_expected) : null} />
              <Cell v={r?.goals_done} />
              <Cell v={r ? `${r.parent_visits}/${r.parent_meetings}/${r.parent_other}` : undefined} warn={r ? r.parent_visits + r.parent_meetings + r.parent_other === 0 : false} />
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{tx('{0} — {1}. 🎉 іс-шара, 💬 жеке кездесу, ✅ орындалған/барлық тапсырма, 🔁 әдеттің орындалуы, 🎯 орындалған мақсат, 👪 ата-ана: қонаққа бару / жиналыс / байланыс.', fmtDate(range.from), fmtDate(range.to))}</p>
    </>}

    {edit && <GroupSheet classId={classId} group={edit === 'new' ? null : edit} students={students} onClose={() => setEdit(null)} onDone={() => { setEdit(null); groups.reload() }} />}
  </div>
}

function Cell({ v, p, warn }: { v: number | string | undefined; p?: number | null; warn?: boolean }) {
  const tone = warn ? 'text-danger' : p == null ? '' : p >= 80 ? 'text-success' : p < 40 ? 'text-danger' : ''
  return <td className={`px-2 py-2 text-center ${tone}`}>{v ?? '—'}</td>
}

function Summary({ rows }: { rows: ActivityStat[] }) {
  const sum = (k: keyof ActivityStat) => rows.reduce((a, r) => a + (r[k] as number), 0)
  const n = rows.length || 1
  const tiles: [string, string, string][] = [
    ['🎉', (sum('events') / n).toFixed(1), tx('іс-шара / оқушы')],
    ['💬', `${rows.filter((r) => r.mentor > 0).length}/${rows.length}`, tx('жеке кездесу болды')],
    ['✅', `${pct(sum('tasks_done'), sum('tasks_total')) ?? '—'}%`, tx('тапсырма орындалды')],
    ['🔁', `${pct(sum('habit_checks'), sum('habit_expected')) ?? '—'}%`, tx('әдет орындалды')],
    ['👪', `${rows.filter((r) => r.parent_visits + r.parent_meetings + r.parent_other > 0).length}/${rows.length}`, tx('ата-анамен байланыс болды')],
  ]
  return <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
    {tiles.map(([e, v, l]) => <div key={l} className="rounded-md bg-surface-2 p-3"><div className="text-lg font-bold tabular-nums">{e} {v}</div><div className="text-xs text-muted">{l}</div></div>)}
  </div>
}

function GroupSheet({ classId, group, students, onClose, onDone }: { classId: string; group: ClassGroup | null; students: Student[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(group?.name ?? '')
  const [color, setColor] = useState(group?.color ?? COLORS[0])
  const [from, setFrom] = useState(group?.starts_on ?? today())
  const [to, setTo] = useState(group?.ends_on ?? '')
  const [members, setMembers] = useState<string[]>(group?.members.map((m) => m.student_id) ?? [])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return toast(tx('Топ атауын жазыңыз'))
    if (to && to < from) return toast(tx('Соңы басынан кейін болуы керек'))
    setBusy(true)
    try { await saveClassGroup({ ...(group ? { id: group.id } : {}), class_id: classId, name: name.trim(), color, starts_on: from, ends_on: to || null }, members); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!group || !confirm(tx('«{0}» тобын өшіру керек пе?', group.name))) return
    try { await removeClassGroup(group.id); onDone() } catch (e) { toast(errText(e)) }
  }
  return <Sheet title={group ? tx('Топты өзгерту') : tx('Жаңа топ')} onClose={onClose}>
    <div className="grid gap-3">
      <Field label={tx('Атауы')}>{(id) => <input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={tx('Мысалы: Тазалық тобы, 1-команда')} className={inputCls} />}</Field>
      <div className="flex gap-2" role="radiogroup" aria-label={tx('Түсі')}>{COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className="size-8 rounded-full" style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : undefined }} />)}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={tx('Басталуы')}>{(id) => <input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />}</Field>
        <Field label={tx('Аяқталуы')} hint={tx('Бос болса — мерзімсіз')}>{(id, d) => <input id={id} aria-describedby={d} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />}</Field>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold">{tx('Мүшелері ({0})', members.length)}</span>
        <div className="flex flex-wrap gap-1.5">{students.map((s) => { const on = members.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setMembers(on ? members.filter((x) => x !== s.id) : [...members, s.id])} className={`h-8 px-3 rounded-full text-xs ${on ? 'text-white' : 'bg-surface-2'}`} style={on ? { backgroundColor: color } : undefined}>{s.full_name.split(' ').slice(0, 2).join(' ')}</button> })}</div>
      </div>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {group && <Button block kind="danger" onClick={remove}>{tx('Топты өшіру')}</Button>}
    </div>
  </Sheet>
}
