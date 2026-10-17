import { useState } from 'react'
import { cancelBooking, createResource, decideBooking, errText, listBookings, listGroups, listResources, listStaff, updateResource, type Booking, type Resource } from '../lib/api'
import { fmtDate, hm, today } from '../lib/time'
import { useMe } from '../App'
import Qr from '../components/Qr'
import { Badge, Button, Card, Empty, ErrorBox, Field, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad, type Tone } from '../components/ui'
import { tx } from '../lib/i18n'

type Tab = 'mine' | 'review' | 'places'
const ST: Record<Booking['status'], [string, Tone]> = { pending: [tx('Растау күтуде'), 'warn'], approved: [tx('Расталды'), 'ok'], rejected: [tx('Қабылданбады'), 'bad'], cancelled: [tx('Тоқтатылды'), 'muted'] }

export default function Bookings({ tab }: { tab: Tab }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const resources = useLoad(listResources, [])
  const managesAny = deputy || (resources.data ?? []).some((r) => r.manager_id === me.id)
  const tabs: [Tab, string][] = [['mine', tx('Менікі')], ...(managesAny ? [['review', tx('Растау')], ['places', tx('Орындар')]] as [Tab, string][] : [])]

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Броньдар')} back right={<Button kind="secondary" onClick={() => go('/book')}>{tx('Жаңа бронь')}</Button>} />
      {tabs.length > 1 && (
        <div role="tablist" className="grid grid-flow-col auto-cols-fr bg-surface-2 rounded-md p-1 gap-1">
          {tabs.map(([k, l]) => <a key={k} role="tab" aria-selected={tab === k} href={`#/bookings/${k}`} className={`h-10 rounded-sm grid place-items-center text-sm font-semibold ${tab === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{l}</a>)}
        </div>
      )}
      {tab === 'mine' && <Mine />}
      {tab === 'review' && managesAny && <Review resources={resources.data ?? []} />}
      {tab === 'places' && managesAny && <Places resources={resources.data ?? []} reload={resources.reload} />}
    </div>
  )
}

function Row({ b, children }: { b: Booking; children?: React.ReactNode }) {
  return (
    <Card className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{b.resource.name}</p>
          <p className="text-sm text-muted tabular-nums">{b.resource.group.name} · {fmtDate(b.on_date)} · {hm(b.start_time)}–{hm(b.end_time)}</p>
        </div>
        <Badge tone={ST[b.status][1]}>{ST[b.status][0]}</Badge>
      </div>
      <p className="text-sm break-words">{b.purpose}{b.note && <span className="text-muted"> · «{b.note}»</span>}</p>
      {children}
    </Card>
  )
}

function Mine() {
  const { me } = useMe()
  const { data, error, loading, reload } = useLoad(() => listBookings({ user: me.id }), [me.id])
  const [qr, setQr] = useState<Booking | null>(null)
  const t = today()
  if (loading && !data) return <Skeleton />
  if (error) return <ErrorBox text={error} retry={reload} />
  if (!data?.length) return <Empty title={tx('Броньыңыз жоқ')} text={tx('Кабинет, спортзал немесе шай бөлмесін бірнеше түрту арқылы броньдаңыз.')} action={<Button onClick={() => go('/book')}>{tx('Броньдау')}</Button>} />
  const cancel = async (b: Booking) => { try { await cancelBooking(b.id); toast(tx('Бронь тоқтатылды')); reload() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-2">
      {data.map((b) => (
        <Row key={b.id} b={b}>
          {(b.status === 'approved' || b.status === 'pending') && b.on_date >= t && (
            <div className="flex gap-2 flex-wrap">
              <Button kind="secondary" onClick={() => setQr(b)}>QR · {b.code}</Button>
              <Button kind="ghost" onClick={() => cancel(b)}>{tx('Тоқтату')}</Button>
            </div>
          )}
        </Row>
      ))}
      {qr && <Sheet title={qr.resource.name} onClose={() => setQr(null)}><div className="grid justify-items-center gap-2 text-center"><Qr code={qr.code} label={tx('Бронь')} />
        <p className="text-sm text-muted tabular-nums">{fmtDate(qr.on_date)} · {hm(qr.start_time)}–{hm(qr.end_time)}</p></div></Sheet>}
    </div>
  )
}

function Review({ resources }: { resources: Resource[] }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const t = today()
  const { data, error, loading, reload } = useLoad(() => listBookings({ from: t }), [t])
  const [busy, setBusy] = useState('')
  const mineIds = new Set(resources.filter((r) => deputy || r.manager_id === me.id).map((r) => r.id))
  const list = (data ?? []).filter((b) => mineIds.has(b.resource_id))
  const pending = list.filter((b) => b.status === 'pending')
  const upcoming = list.filter((b) => b.status === 'approved').sort((a, b) => (a.on_date + a.start_time).localeCompare(b.on_date + b.start_time))
  const act = async (b: Booking, ok: boolean) => {
    setBusy(b.id + ok)
    try { await decideBooking(b.id, ok); toast(ok ? tx('Бронь расталды') : tx('Бронь қабылданбады')); reload() } catch (e) { toast(errText(e)) } finally { setBusy('') }
  }
  if (loading && !data) return <Skeleton />
  if (error) return <ErrorBox text={error} retry={reload} />
  return (
    <div className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Растау күтуде · {0}', pending.length)}</h2>
      {!pending.length ? <Card><p className="text-sm text-muted">{tx('Жаңа сұрау жоқ.')}</p></Card> : pending.map((b) => (
        <Row key={b.id} b={b}>
          <p className="text-sm">{tx('Сұраған:')}{' '}<b>{b.user.full_name}</b></p>
          <div className="flex gap-2"><Button loading={busy === b.id + true} onClick={() => act(b, true)}>{tx('Растау')}</Button><Button kind="danger" loading={busy === b.id + false} onClick={() => act(b, false)}>{tx('Қабылдамау')}</Button></div>
        </Row>
      ))}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-3">{tx('Алдағы расталған броньдар')}</h2>
      {!upcoming.length ? <Card><p className="text-sm text-muted">{tx('Әзірге жоқ.')}</p></Card> : upcoming.map((b) => <Row key={b.id} b={b}><p className="text-sm text-muted">{b.user.full_name} · {b.code}</p></Row>)}
    </div>
  )
}

const SLOTS = [15, 30, 45, 60, 90, 120]
function Places({ resources, reload }: { resources: Resource[]; reload: () => void }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const groups = useLoad(listGroups, [])
  const mine = resources.filter((r) => deputy || r.manager_id === me.id)
  const [edit, setEdit] = useState<Resource | null>(null)
  const [adding, setAdding] = useState(false)
  const gname = (id: string) => groups.data?.find((g) => g.id === id)?.name ?? ''
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">{tx('Слот ұзақтығы мен ашық сағаттарын өзіңіз баптайсыз. Өзгеріс жаңа броньдарға қолданылады.')}</p>
      {mine.map((r) => (
        <button key={r.id} type="button" onClick={() => setEdit(r)} className="text-left">
          <Card className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold break-words">{r.name} {!r.active && <Badge tone="muted">{tx('Жабық')}</Badge>}</p>
              <p className="text-sm text-muted tabular-nums">{tx('{0} · {1}–{2} · {3} мин · {4}', gname(r.group_id), hm(r.open_from), hm(r.open_to), r.slot_minutes, r.manager.full_name)}</p>
            </div>
            <span className="text-accent text-sm font-semibold">{tx('Баптау')}</span>
          </Card>
        </button>
      ))}
      {deputy && <Button kind="secondary" onClick={() => setAdding(true)}>{tx('Орын қосу')}</Button>}
      {edit && <Sheet title={edit.name} onClose={() => setEdit(null)}><Settings r={edit} onDone={() => { setEdit(null); reload() }} /></Sheet>}
      {adding && <Sheet title={tx('Орын қосу')} onClose={() => setAdding(false)}><AddPlace groups={(groups.data ?? []).map((g) => g.name)} onDone={() => { setAdding(false); reload(); groups.reload() }} /></Sheet>}
    </div>
  )
}

function Settings({ r, onDone }: { r: Resource; onDone: () => void }) {
  const [f, setF] = useState({ slot: r.slot_minutes, from: hm(r.open_from), to: hm(r.open_to), active: r.active })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.to <= f.from) return toast(tx('Жабылу уақыты ашылудан кейін болуы керек'))
    setBusy(true)
    try { await updateResource(r.id, f.slot, f.from, f.to, f.active); toast(tx('Сақталды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Бір слоттың ұзақтығы')}>{(id) => <select id={id} value={f.slot} onChange={(e) => setF({ ...f, slot: +e.target.value })} className={inputCls}>{SLOTS.map((s) => <option key={s} value={s}>{tx('{0} минут', s)}</option>)}</select>}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx('Ашылады')}>{(id) => <input id={id} type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Жабылады')}>{(id) => <input id={id} type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inputCls} />}</Field>
      </div>
      <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-5 accent-[var(--accent)]" />{tx('Броньдауға ашық')}</label>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
    </div>
  )
}

function AddPlace({ groups, onDone }: { groups: string[]; onDone: () => void }) {
  const staff = useLoad(listStaff, [])
  const [f, setF] = useState({ group: groups[0] ?? '', name: '', manager: '', capacity: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.group.trim().length < 2 || f.name.trim().length < 2 || !f.manager) return toast(tx('Аймақ, атауы және жауаптысын толтырыңыз'))
    setBusy(true)
    try { await createResource(f.group, f.name, f.manager, f.capacity ? +f.capacity : null); toast(tx('Орын қосылды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Аймақ')} hint={tx('Барын таңдаңыз немесе жаңасын жазыңыз')}>
        {(id, d) => <><input id={id} aria-describedby={d} list="groups" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} className={inputCls} /><datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></>}
      </Field>
      <Field label={tx('Орын атауы')}>{(id) => <input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder={tx('Күрес залы')} />}</Field>
      <Field label={tx('Жауаптысы (растайды)')}>{(id) => <select id={id} value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })} className={inputCls}><option value="">{tx('Таңдаңыз')}</option>{(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}</Field>
      <Field label={tx('Сыйымдылығы')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value.replace(/\D/g, '') })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}
