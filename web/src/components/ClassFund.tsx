import { useState } from 'react'
import { addFund, errText, removeFund, type ClassEvent, type FundRow } from '../lib/api'
import { fmtDate, today } from '../lib/time'
import { fundTotals, money } from '../lib/money'
import { Button, Card, Chips, Empty, Icon, inputCls, toast } from './ui'
import { tx } from '../lib/i18n'

/** Class fund: manual income/expense rows plus the expenses recorded on calendar events (read-only here). */
export default function ClassFund({ classId, rows: own, events, staff, reload }: { classId: string; rows: FundRow[]; events: ClassEvent[]; staff: boolean; reload: () => void }) {
  const fromEvents: (FundRow & { event?: true })[] = events.filter((e) => e.status !== 'archived').flatMap((e) => (Array.isArray(e.expenses) ? e.expenses : e.expenses ? [e.expenses] : []).map((x, i) => ({
    id: `ev-${e.id}-${i}`, on_date: e.on_date, amount: -Math.abs(Number(x.amount)), note: `${e.title}${x.wallet?.name ? ` · ${x.wallet.name}` : ''}${x.note ? ` · ${x.note}` : ''}`, planned: e.status !== 'passed' && e.on_date >= today(), event: true as const,
  })))
  const rows: (FundRow & { event?: true })[] = [...own, ...fromEvents].sort((a, b) => b.on_date.localeCompare(a.on_date))
  const [f, setF] = useState({ type: 'in' as 'in' | 'out' | 'plan', amount: '', note: '', date: today() })
  const [busy, setBusy] = useState(false)
  const t = fundTotals(rows)
  const save = async () => {
    setBusy(true)
    try {
      const n = Math.abs(Number(f.amount))
      await addFund({ class_id: classId, on_date: f.date, amount: f.type === 'in' ? n : -n, note: f.note.trim(), planned: f.type === 'plan' })
      setF({ ...f, amount: '', note: '' }); reload()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2">
        {([[tx('Қалдық'), t.balance, ''], [tx('Жоспарда'), t.planned, 'text-warning'], [tx('Жоспардан кейін'), t.after, t.after < 0 ? 'text-danger' : 'text-success']] as const).map(([l, v, c]) => (
          <Card key={l} className="grid gap-0.5 p-3"><span className="text-xs text-muted">{l}</span><span className={`font-bold tabular-nums ${c}`}>{money(v)}</span></Card>
        ))}
      </div>
      {staff && (
        <Card className="grid gap-2">
          <Chips label={tx('Түрі')} value={f.type} onChange={(type) => setF({ ...f, type })} items={[['in', tx('Кіріс')], ['out', tx('Шығыс')], ['plan', tx('Жоспарлы шығыс')]]} />
          <div className="grid grid-cols-2 gap-2 [&_input]:min-w-0">
            <input aria-label={tx('Сомасы')} type="number" inputMode="numeric" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={inputCls} placeholder={tx('Сомасы, ₸')} />
            <input aria-label={tx('Күні')} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />
          </div>
          <input aria-label={tx('Не үшін')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Не үшін: жарна, шай кешіне, сыйлыққа…')} />
          <Button loading={busy} disabled={!(Number(f.amount) > 0) || f.note.trim().length < 2} onClick={save}>{tx('Қосу')}</Button>
        </Card>
      )}
      {!rows.length ? <Empty icon="grid" title={tx('Жазба жоқ')} text={tx('Сынып қорының кірісі мен шығысы осында жазылады.')} /> : (
        <Card className="p-0 overflow-hidden"><ul className="divide-y divide-line">{rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1 min-w-0"><span className="block text-sm break-words">{r.note}</span><span className="block text-xs text-muted">{fmtDate(r.on_date)}{r.planned ? tx(' · жоспар') : ''}</span></span>
            <span className={`font-semibold tabular-nums ${r.planned ? 'text-warning' : r.amount > 0 ? 'text-success' : ''}`}>{r.amount > 0 ? '+' : '−'}{money(Math.abs(r.amount))}</span>
            {r.event ? <span title={tx('Күнтізбедегі оқиға шығыны')} className="size-8 grid place-items-center text-muted">📅</span> : staff && <button type="button" aria-label={tx('Өшіру')} onClick={() => removeFund(r.id).then(reload, (e) => toast(errText(e)))} className="size-8 grid place-items-center rounded-md text-muted"><Icon n="x" size={14} /></button>}
          </li>
        ))}</ul></Card>
      )}
    </div>
  )
}
