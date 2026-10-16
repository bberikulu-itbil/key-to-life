import { useEffect, useMemo, useState } from 'react'
import { bookingsFor, createBooking, errText, listGroups, listResources, type Booking } from '../lib/api'
import { WD_SHORT, addDays, daySlots, fmtDate, hm, isoDow, parse, pickRange, today } from '../lib/time'
import Qr from '../components/Qr'
import { Button, Card, Chips, Empty, ErrorBox, Field, PageHead, Sheet, Skeleton, go, inputCls, useLoad } from '../components/ui'

const LEGEND = [['bg-surface border border-input', 'Бос'], ['bg-warning-soft', 'Растау күтуде'], ['bg-surface-2 text-muted line-through', 'Бос емес']] as const

export default function Book() {
  const groups = useLoad(listGroups, [])
  const resources = useLoad(listResources, [])
  const [group, setGroup] = useState('')
  const [resId, setResId] = useState('')
  const t = today()
  const [date, setDate] = useState(t)
  const [taken, setTaken] = useState<Booking[] | null>(null)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ code: string; pending: boolean } | null>(null)

  const g = group || groups.data?.[0]?.id || ''
  const inGroup = (resources.data ?? []).filter((r) => r.group_id === g && r.active)
  const r = inGroup.find((x) => x.id === resId)

  const reload = () => { if (r) { setTaken(null); bookingsFor(r.id, date).then(setTaken, (e) => setErr(errText(e))) } }
  useEffect(() => { setSel(null); reload() }, [r?.id, date])   // eslint-disable-line react-hooks/exhaustive-deps

  const nowHm = new Date().toTimeString().slice(0, 5)
  const slots = useMemo(() => (r && taken ? daySlots(r, taken, date === t, nowHm) : []), [r, taken, date, t, nowHm])
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i))

  async function submit() {
    if (!r || !sel) return
    if (purpose.trim().length < 3) return setErr('Мақсатын жазыңыз')
    setBusy(true); setErr('')
    try {
      const code = await createBooking(r.id, date, slots[sel[0]].start, slots[sel[1]].end, purpose)
      setDone({ code, pending: true }); setSel(null); setPurpose(''); reload()
    } catch (e) { setErr(errText(e)); reload() } finally { setBusy(false) }
  }

  if (groups.loading || resources.loading) return <><PageHead title="Броньдау" back /><Skeleton /></>
  if (groups.error || resources.error) return <><PageHead title="Броньдау" back /><ErrorBox text={(groups.error || resources.error)!} /></>
  if (!groups.data?.length) return <><PageHead title="Броньдау" back /><Empty title="Броньдауға орын қосылмаған" text="Орынбасар Профиль → Орындар бөлімінен аймақ пен орын қоса алады." /></>

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Броньдау" back right={<Button kind="ghost" onClick={() => go('/bookings')}>Менің броньдарым</Button>} />

      <h2 className="text-sm font-semibold">Аймақ</h2>
      <Chips label="Аймақ" value={g} onChange={(v) => { setGroup(v); setResId('') }} items={groups.data.map((x) => [x.id, x.name])} />

      <h2 className="text-sm font-semibold mt-1">Орын</h2>
      {!inGroup.length ? <p className="text-sm text-muted">Бұл аймақта ашық орын жоқ.</p> : (
        <div role="radiogroup" aria-label="Орын" className="grid grid-cols-2 gap-2">
          {inGroup.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === resId} onClick={() => setResId(x.id)}
              className={`text-left rounded-md p-3 min-h-16 border ${x.id === resId ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
              <span className="block font-semibold break-words">{x.name}</span>
              <span className="block text-xs text-muted tabular-nums">{hm(x.open_from)}–{hm(x.open_to)} · {x.slot_minutes} мин{x.capacity ? ` · ${x.capacity} орын` : ''}</span>
            </button>
          ))}
        </div>
      )}

      {r && (
        <>
          <h2 className="text-sm font-semibold mt-1">Күні</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Күні">
            {days.map((d) => (
              <button key={d} type="button" aria-pressed={d === date} onClick={() => setDate(d)}
                className={`shrink-0 w-12 grid justify-items-center rounded-md py-1.5 ${d === date ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
                <span className={`text-xs ${d === date ? '' : 'text-muted'}`}>{WD_SHORT[isoDow(d) - 1]}</span>
                <span className="text-lg font-semibold tabular-nums">{parse(d).getDate()}</span>
              </button>
            ))}
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <h2 className="text-sm font-semibold">Уақыт · {fmtDate(date)}</h2>
            <span className="text-xs text-muted">Бастауын, сосын соңын басыңыз</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {LEGEND.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`size-3 rounded-sm ${c}`} />{l}</span>)}
          </div>
          {!taken ? <Skeleton rows={2} /> : !slots.length ? <p className="text-sm text-muted">Слот жоқ.</p> : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5" role="group" aria-label="Уақыт слоттары">
              {slots.map((s, i) => {
                const on = sel && i >= sel[0] && i <= sel[1]
                const cls = on ? 'bg-accent text-on-accent font-semibold'
                  : s.state === 'free' ? 'bg-surface border border-input'
                  : s.state === 'pending' ? 'bg-warning-soft text-warning'
                  : 'bg-surface-2 text-muted line-through'
                const why = { free: 'бос', pending: 'растау күтуде', busy: 'бос емес', past: 'өтіп кеткен' }[s.state]
                return (
                  <button key={s.start} type="button" disabled={s.state !== 'free'} aria-pressed={!!on} aria-label={`${s.start}–${s.end}, ${why}`}
                    onClick={() => setSel(pickRange(slots, sel, i))}
                    className={`h-11 rounded-sm text-sm tabular-nums ${cls} disabled:cursor-not-allowed`}>{s.start}</button>
                )
              })}
            </div>
          )}

          {sel && (
            <Card className="grid gap-3 sticky bottom-[calc(72px+env(safe-area-inset-bottom))] shadow-pop">
              <p className="font-semibold tabular-nums">{r.name} · {fmtDate(date)} · {slots[sel[0]].start}–{slots[sel[1]].end}</p>
              <Field label="Мақсаты">{(id) => <input id={id} value={purpose} maxLength={300} onChange={(e) => setPurpose(e.target.value)} className={inputCls} placeholder="Волейбол жаттығуы, жоба кездесуі…" />}</Field>
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <Button block loading={busy} onClick={submit}>Броньдау</Button>
              <p className="text-xs text-muted">Жауаптысы: {r.manager.full_name}. Бронь ол растаған соң жарамды болады.</p>
            </Card>
          )}
          {!sel && err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </>
      )}

      {done && (
        <Sheet title="Бронь жасалды" onClose={() => setDone(null)}>
          <div className="grid gap-3 justify-items-center text-center">
            <Qr code={done.code} label="Бронь" />
            <p className="text-sm text-muted max-w-[34ch]">Нөмір мен QR «Менің броньдарым» бөлімінде сақталады. Растау керек болса, жауапты кісінің шешімі хабарламаға келеді.</p>
            <Button kind="secondary" onClick={() => go('/bookings')}>Менің броньдарым</Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
