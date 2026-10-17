import { useState } from 'react'
import { cancelBooking, createResource, decideBooking, errText, listBookings, listGroups, listResources, listStaff, managesRoom, updateRoom, type Booking, type Resource, type RoomAudience, type RoomMode } from '../lib/api'
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
  const managesAny = deputy || (resources.data ?? []).some((r) => managesRoom(me, r))
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
  const t = today()
  const { data, error, loading, reload } = useLoad(() => listBookings({ from: t }), [t])
  const [busy, setBusy] = useState('')
  const mineIds = new Set(resources.filter((r) => managesRoom(me, r)).map((r) => r.id))
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
  const mine = resources.filter((r) => managesRoom(me, r))
  const [edit, setEdit] = useState<Resource | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted">{tx('Жауапты болған кабинеттеріңіз. Көрінуін, брондау режимін және жауаптыларын осында баптайсыз.')}</p>
      {(groups.data ?? []).filter((g) => mine.some((r) => r.group_id === g.id)).map((g) => (
        <section key={g.id} className="grid gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx(g.name)}</h2>
          <Card className="p-0 divide-y divide-line">
            {mine.filter((r) => r.group_id === g.id).map((r) => (
              <button key={r.id} type="button" onClick={() => setEdit(r)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold break-words">{r.name}{r.title ? <span className="font-normal text-muted"> · {r.title}</span> : null}</span>
                  <span className="block text-xs text-muted">{[MODE[r.mode], r.audience !== 'all' && AUDIENCE[r.audience], r.capacity && tx('{0} орын', r.capacity), r.hide_slots && tx('кесте жасырын')].filter(Boolean).join(' · ')}</span>
                </span>
                {!r.active && <Badge tone="muted">{tx('Жасырын')}</Badge>}
              </button>
            ))}
          </Card>
        </section>
      ))}
      {deputy && <Button kind="secondary" onClick={() => setAdding(true)}>{tx('Орын қосу')}</Button>}
      {edit && <Sheet title={edit.name} onClose={() => setEdit(null)}><Settings r={edit} onDone={() => { setEdit(null); reload() }} /></Sheet>}
      {adding && <Sheet title={tx('Орын қосу')} onClose={() => setAdding(false)}><AddPlace groups={(groups.data ?? []).map((g) => g.name)} onDone={() => { setAdding(false); reload(); groups.reload() }} /></Sheet>}
    </div>
  )
}

const MODE: Record<RoomMode, string> = { open: tx('Брондауға ашық'), request: tx('Өтінішпен'), closed: tx('Жабық бөлме') }
const AUDIENCE: Record<RoomAudience, string> = { all: tx('Барлығына'), staff: tx('Тек мұғалімдерге'), listed: tx('Тек таңдалғандарға') }

/** Everything about a room: who sees it, how it is booked, who is responsible. */
function Settings({ r, onDone }: { r: Resource; onDone: () => void }) {
  const staff = useLoad(listStaff, [])
  const [f, setF] = useState({ title: r.title ?? '', capacity: r.capacity ? String(r.capacity) : '', slot: r.slot_minutes, from: hm(r.open_from), to: hm(r.open_to),
    active: r.active, mode: r.mode, audience: r.audience, hide_slots: r.hide_slots,
    managers: r.managers.length ? r.managers : [r.manager_id], viewers: r.viewers })
  const [busy, setBusy] = useState(false)
  const toggle = (k: 'managers' | 'viewers', id: string) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] })
  const save = async () => {
    if (f.to <= f.from) return toast(tx('Жабылу уақыты ашылудан кейін болуы керек'))
    if (!f.managers.length) return toast(tx('Кемінде бір жауапты керек'))
    setBusy(true)
    try { await updateRoom(r.id, f); toast(tx('Сақталды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const people = (k: 'managers' | 'viewers') => (
    <div className="max-h-56 overflow-y-auto rounded-md border border-line divide-y divide-line">
      {(staff.data ?? []).map((s) => (
        <label key={s.id} className="flex items-center gap-3 min-h-11 px-3">
          <input type="checkbox" checked={f[k].includes(s.id)} onChange={() => toggle(k, s.id)} className="size-5 accent-[var(--accent)]" />
          <span className="flex-1 min-w-0 truncate">{s.full_name}</span>
        </label>
      ))}
    </div>
  )
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label={tx('Атауы')}>{(id) => <input id={id} value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Орын саны')}>{(id) => <input id={id} inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value.replace(/\D/g, '') })} className={`${inputCls} w-24`} />}</Field>
      </div>
      <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-5 accent-[var(--accent)]" />{tx('Тізімде көрсету')}</label>
      <Field label={tx('Брондау режимі')}>{(id) => <select id={id} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as RoomMode })} className={inputCls}>
        <option value="open">{tx('Брондауға ашық — бірден расталады')}</option><option value="request">{tx('Өтінішпен — жауапты мұғалім растайды')}</option><option value="closed">{tx('Жабық бөлме — броньдалмайды')}</option></select>}</Field>
      <Field label={tx('Кімге көрінеді')}>{(id) => <select id={id} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as RoomAudience })} className={inputCls}>
        {(Object.keys(AUDIENCE) as RoomAudience[]).map((k) => <option key={k} value={k}>{AUDIENCE[k]}</option>)}</select>}</Field>
      {f.audience === 'listed' && <div className="grid gap-1.5"><p className="text-sm font-semibold">{tx('Кімдерге көрінеді')}</p>{people('viewers')}</div>}
      <label className="flex items-start gap-3 min-h-11"><input type="checkbox" checked={f.hide_slots} onChange={(e) => setF({ ...f, hide_slots: e.target.checked })} className="size-5 mt-0.5 accent-[var(--accent)]" />
        <span>{tx('Бос уақыттарды жасыру')}<span className="block text-sm text-muted">{tx('Басқалар кестені көрмейді, тек қалаған уақытына өтініш жібереді.')}</span></span></label>
      <Field label={tx('Бір слоттың ұзақтығы')}>{(id) => <select id={id} value={f.slot} onChange={(e) => setF({ ...f, slot: +e.target.value })} className={inputCls}>{SLOTS.map((s) => <option key={s} value={s}>{tx('{0} минут', s)}</option>)}</select>}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx('Ашылады')}>{(id) => <input id={id} type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Жабылады')}>{(id) => <input id={id} type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inputCls} />}</Field>
      </div>
      <div className="grid gap-1.5"><p className="text-sm font-semibold">{tx('Жауаптылар')}</p><p className="text-xs text-muted">{tx('Өтініштер бәріне барады, кез келгені растай алады.')}</p>{staff.loading ? <Skeleton rows={1} /> : people('managers')}</div>
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
