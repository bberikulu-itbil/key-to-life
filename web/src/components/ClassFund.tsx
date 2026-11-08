import { useState } from 'react'
import { addClassWallet, addFund, errText, removeFund, type ClassEvent, type ClassWallet, type FundRow } from '../lib/api'
import { fmtDate, today } from '../lib/time'
import { fundTotals, money } from '../lib/money'
import { Button, Card, Chips, Empty, Icon, inputCls, toast } from './ui'
import { tx } from '../lib/i18n'

type Row = FundRow & { event?: true }
const NONE = 'none' // rows written before wallets existed

/** Class fund: manual income/expense rows plus event expenses (read-only here), counted per wallet. */
export default function ClassFund({ classId, rows: own, events, wallets: allWallets, staff, reload }: { classId: string; rows: FundRow[]; events: ClassEvent[]; wallets: ClassWallet[]; staff: boolean; reload: () => void }) {
  const wallets = allWallets.filter((w) => !w.archived)
  const fromEvents: Row[] = events.filter((e) => e.status !== 'archived').flatMap((e) => (Array.isArray(e.expenses) ? e.expenses : e.expenses ? [e.expenses] : []).map((x, i) => ({
    id: `ev-${e.id}-${i}`, on_date: e.on_date, amount: -Math.abs(Number(x.amount)), note: `${e.title}${x.note ? ` · ${x.note}` : ''}`, planned: e.status !== 'passed' && e.on_date >= today(), wallet_id: x.wallet_id, event: true as const,
  })))
  const all: Row[] = [...own, ...fromEvents].sort((a, b) => b.on_date.localeCompare(a.on_date))
  const hasNone = all.some((r) => !r.wallet_id)
  const [sel, setSel] = useState<string>('all')
  const rows = sel === 'all' ? all : all.filter((r) => (r.wallet_id ?? NONE) === sel)
  const walletName = (id: string | null | undefined) => (id ? allWallets.find((w) => w.id === id)?.name : null) ?? tx('Әмиянсыз')
  const [f, setF] = useState({ type: 'in' as 'in' | 'out' | 'plan', amount: '', note: '', date: today(), wallet: wallets[0]?.id ?? '' })
  const [newWallet, setNewWallet] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const t = fundTotals(rows)
  const save = async () => {
    setBusy(true)
    try {
      const n = Math.abs(Number(f.amount))
      await addFund({ class_id: classId, on_date: f.date, amount: f.type === 'in' ? n : -n, note: f.note.trim(), planned: f.type === 'plan', wallet_id: f.wallet || null })
      setF({ ...f, amount: '', note: '' }); reload()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const createWallet = async () => {
    const name = (newWallet ?? '').trim()
    if (name.length < 2) return toast(tx('Әмиян атауын жазыңыз'))
    try { const { id } = await addClassWallet(classId, name); setF({ ...f, wallet: id }); setNewWallet(null); reload() } catch (e) { toast(errText(e)) }
  }
  const tiles: [string, string][] = [['all', tx('Барлығы')], ...wallets.map((w) => [w.id, w.name] as [string, string]), ...(hasNone ? [[NONE, tx('Әмиянсыз')] as [string, string]] : [])]
  return (
    <div className="grid grid-cols-1 gap-3">
      {/* One tile per wallet with its own balance; tapping filters the list and totals below. */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {tiles.map(([id, name]) => {
          const b = fundTotals(id === 'all' ? all : all.filter((r) => (r.wallet_id ?? NONE) === id))
          return (
            <button key={id} type="button" aria-pressed={sel === id} onClick={() => setSel(id)}
              className={`shrink-0 min-w-32 text-left rounded-xl p-3 border transition ${sel === id ? 'bg-accent text-on-accent border-transparent' : 'bg-surface border-line'}`}>
              <span className={`block text-xs ${sel === id ? 'opacity-80' : 'text-muted'}`}>{id === 'all' ? '' : '👛 '}{name}</span>
              <span className="block font-bold tabular-nums">{money(b.balance)}</span>
              {b.planned !== 0 && <span className={`block text-[11px] ${sel === id ? 'opacity-80' : 'text-warning'}`}>{tx('жоспар')} {money(b.planned)}</span>}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([[tx('Қалдық'), t.balance, ''], [tx('Жоспарда'), t.planned, 'text-warning'], [tx('Жоспардан кейін'), t.after, t.after < 0 ? 'text-danger' : 'text-success']] as const).map(([l, v, c]) => (
          <Card key={l} className="grid gap-0.5 p-3"><span className="text-xs text-muted">{l}</span><span className={`font-bold tabular-nums ${c}`}>{money(v)}</span></Card>
        ))}
      </div>
      {staff && (
        <Card className="grid grid-cols-1 gap-2">
          <Chips label={tx('Түрі')} value={f.type} onChange={(type) => setF({ ...f, type })} items={[['in', tx('Кіріс')], ['out', tx('Шығыс')], ['plan', tx('Жоспарлы шығыс')]]} />
          {newWallet !== null ? (
            <div className="flex gap-2 [&_input]:min-w-0">
              <input aria-label={tx('Жаңа әмиян')} value={newWallet} maxLength={60} autoFocus onChange={(e) => setNewWallet(e.target.value)} className={`${inputCls} flex-1`} placeholder={tx('Мысалы: Сынып қоры, Ата-ана жарнасы')} />
              <Button kind="ghost" onClick={() => setNewWallet(null)}>{tx('Болдырмау')}</Button>
              <Button onClick={createWallet}>{tx('Қосу')}</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select aria-label={tx('Әмиян')} value={f.wallet} onChange={(e) => setF({ ...f, wallet: e.target.value })} className={`${inputCls} flex-1 min-w-0`}>
                {!wallets.length && <option value="">{tx('Әмиянсыз')}</option>}
                {wallets.map((w) => <option key={w.id} value={w.id}>👛 {w.name}</option>)}
              </select>
              <Button kind="secondary" onClick={() => setNewWallet('')}><Icon n="plus" size={16} />{tx('Әмиян')}</Button>
            </div>
          )}
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
            <span className="flex-1 min-w-0"><span className="block text-sm break-words">{r.note}</span><span className="block text-xs text-muted">{fmtDate(r.on_date)}{r.planned ? tx(' · жоспар') : ''}{sel === 'all' ? ` · 👛 ${walletName(r.wallet_id)}` : ''}</span></span>
            <span className={`font-semibold tabular-nums ${r.planned ? 'text-warning' : r.amount > 0 ? 'text-success' : ''}`}>{r.amount > 0 ? '+' : '−'}{money(Math.abs(r.amount))}</span>
            {r.event ? <span title={tx('Күнтізбедегі оқиға шығыны')} className="size-8 grid place-items-center text-muted">📅</span> : staff && <button type="button" aria-label={tx('Өшіру')} onClick={() => confirm(tx('Бұл жазбаны өшіру керек пе?')) && removeFund(r.id).then(reload, (e) => toast(errText(e)))} className="size-8 grid place-items-center rounded-md text-muted"><Icon n="x" size={14} /></button>}
          </li>
        ))}</ul></Card>
      )}
    </div>
  )
}
