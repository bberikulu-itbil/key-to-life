import { useState } from 'react'
import { cancelLeave, decideLeave, errText, listLeaves, type Leave, type LeaveStatus, type Me } from '../lib/api'
import { fmtDate, iso } from '../lib/time'
import { useMe } from '../App'
import { LEAVE_CATEGORY } from './LeaveForm'
import Qr from '../components/Qr'
import { Badge, Button, Card, Empty, ErrorBox, Field, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad, type Tone } from '../components/ui'

export const LEAVE_STATUS: Record<LeaveStatus, [string, Tone]> = {
  pending_class_teacher: ['Сынып жетекшісінде', 'warn'], pending_deputy: ['Орынбасарда', 'warn'], pending_teacher: ['Пән мұғалімінде', 'warn'],
  approved: ['Рұқсат берілді', 'ok'], rejected: ['Рұқсат берілмеді', 'bad'], cancelled: ['Тоқтатылды', 'muted'],
}
const t2 = (s: string) => new Date(s).toTimeString().slice(0, 5)
export const when = (l: Pick<Leave, 'starts_at' | 'ends_at'>) => {
  const a = new Date(l.starts_at), b = new Date(l.ends_at)
  return iso(a) === iso(b) ? `${fmtDate(iso(a))} · ${t2(l.starts_at)}–${t2(l.ends_at)}` : `${fmtDate(iso(a))} ${t2(l.starts_at)} – ${fmtDate(iso(b))} ${t2(l.ends_at)}`
}

/** Is this request waiting for *me*? Deputies may decide at any step. */
export const waitsForMe = (me: Me, l: Leave) =>
  l.status.startsWith('pending') && (me.role === 'deputy' || me.role === 'admin'
    || (l.status === 'pending_class_teacher' && l.class_teacher_id === me.id)
    || (l.status === 'pending_teacher' && l.teacher_id === me.id))

export default function Leaves() {
  const { me } = useMe()
  return me.role === 'student' ? <StudentLeaves /> : <StaffLeaves />
}

function LeaveCard({ l, children, showStudent }: { l: Leave; children?: React.ReactNode; showStudent?: boolean }) {
  return (
    <Card className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showStudent && <p className="font-semibold">{l.student.full_name} <span className="text-sm text-muted">{l.student.class?.name}</span></p>}
          <p className={showStudent ? 'text-sm' : 'font-semibold'}>{l.kind === 'outside' ? 'Сыртқа шығу' : `Сабақтан · ${l.teacher?.full_name ?? ''}`}</p>
          <p className="text-sm text-muted tabular-nums">{when(l)}</p>
        </div>
        <Badge tone={LEAVE_STATUS[l.status][1]}>{LEAVE_STATUS[l.status][0]}</Badge>
      </div>
      <p className="text-sm break-words"><b>{LEAVE_CATEGORY[l.category]}:</b> {l.reason}</p>
      {l.escalated && <p className="text-sm text-warning">Сынып жетекшісі 20 минутта жауап бермеді — орынбасарға өтті.</p>}
      {l.ct_opinion !== null && <p className="text-sm">Сынып жетекшісі: <b>{l.ct_opinion ? 'келіседі' : 'келіспейді'}</b>{l.ct_note && ` · «${l.ct_note}»`}</p>}
      {l.decision_note && <p className="text-sm text-muted">{l.decider?.full_name}: «{l.decision_note}»</p>}
      {children}
    </Card>
  )
}

function StudentLeaves() {
  const { me } = useMe()
  const { data, error, loading, reload } = useLoad(() => listLeaves({ student: me.id }), [me.id])
  const [qr, setQr] = useState<Leave | null>(null)
  const cancel = async (l: Leave) => { try { await cancelLeave(l.id); toast('Өтініш тоқтатылды'); reload() } catch (e) { toast(errText(e)) } }
  const live = (l: Leave) => new Date(l.ends_at) > new Date()
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Рұқсаттарым" back right={<Button kind="secondary" onClick={() => go('/leave/new')}>Сұрау</Button>} />
      {loading && !data ? <Skeleton /> : error ? <ErrorBox text={error} retry={reload} /> : !data?.length
        ? <Empty title="Өтініш жоқ" text="Сыртқа шығу немесе сабақтан сұрану керек болса, осы жерден сұраңыз." action={<Button onClick={() => go('/leave/new')}>Рұқсат сұрау</Button>} />
        : data.map((l) => (
          <LeaveCard key={l.id} l={l}>
            {live(l) && (l.status === 'approved' || l.status.startsWith('pending')) && (
              <div className="flex gap-2 flex-wrap">
                {l.status === 'approved' && <Button onClick={() => setQr(l)}>QR көрсету</Button>}
                <Button kind="ghost" onClick={() => cancel(l)}>Тоқтату</Button>
              </div>
            )}
          </LeaveCard>
        ))}
      {qr && <Sheet title="Рұқсат QR" onClose={() => setQr(null)}><div className="grid justify-items-center gap-2 text-center"><Qr code={qr.code} label="Рұқсат" />
        <p className="text-sm text-muted tabular-nums">{when(qr)}</p><p className="text-sm text-muted">Кезекші мұғалімге көрсетіңіз.</p></div></Sheet>}
    </div>
  )
}

function StaffLeaves() {
  const { me, refreshBadge } = useMe()
  const now = new Date()
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59)
  const pending = useLoad(() => listLeaves({ pending: true }), [])
  const today = useLoad(() => listLeaves({ since: now.toISOString(), until: endOfDay.toISOString() }), [])
  const [deciding, setDeciding] = useState<{ l: Leave; ok: boolean } | null>(null)
  const mine = (pending.data ?? []).filter((l) => waitsForMe(me, l))
  const granted = (today.data ?? []).filter((l) => l.status === 'approved')

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Рұқсаттар" back right={<Button kind="secondary" onClick={() => go('/v/')}>QR тексеру</Button>} />
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Шешіміңізді күтуде · {mine.length}</h2>
      {pending.loading && !pending.data ? <Skeleton rows={2} /> : pending.error ? <ErrorBox text={pending.error} retry={pending.reload} />
        : !mine.length ? <Card><p className="text-sm text-muted">Күтіп тұрған өтініш жоқ.</p></Card>
        : mine.map((l) => {
          const ctStep = l.status === 'pending_class_teacher' && l.class_teacher_id === me.id && me.role !== 'deputy' && me.role !== 'admin'
          const left = l.deadline_at ? Math.max(0, Math.round((new Date(l.deadline_at).getTime() - Date.now()) / 60000)) : null
          return (
            <LeaveCard key={l.id} l={l} showStudent>
              {ctStep && left !== null && <p className="text-sm text-warning">{left} минуттан кейін кезекші орынбасарға өтеді. Сіздің жауабыңыз орынбасарға бірге жіберіледі.</p>}
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => setDeciding({ l, ok: true })}>{ctStep ? 'Келісемін' : 'Рұқсат беру'}</Button>
                <Button kind="danger" onClick={() => setDeciding({ l, ok: false })}>{ctStep ? 'Келіспеймін' : 'Бермеу'}</Button>
              </div>
            </LeaveCard>
          )
        })}

      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-3">Бүгін рұқсат берілгендер · {granted.length}</h2>
      {today.loading && !today.data ? <Skeleton rows={2} /> : !granted.length ? <Card><p className="text-sm text-muted">Бүгін ешкімге рұқсат берілмеген.</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {granted.map((l) => {
            const active = new Date(l.starts_at) <= now && now <= new Date(l.ends_at)
            return (
              <div key={l.id} className="flex items-center gap-2 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.student.full_name} <span className="text-sm text-muted">{l.student.class?.name}</span></p>
                  <p className="text-sm text-muted tabular-nums">{l.kind === 'outside' ? 'Сыртта' : 'Сабақтан'} · {when(l)} · {l.code}</p>
                </div>
                {l.category === 'illness' && <Badge tone="bad">Ауырып</Badge>}
                {active && <Badge tone="ok">Қазір</Badge>}
              </div>
            )
          })}
        </Card>
      )}

      {deciding && (
        <Sheet title={deciding.ok ? 'Рұқсат беру' : 'Бас тарту'} onClose={() => setDeciding(null)}>
          <Decide l={deciding.l} ok={deciding.ok} onDone={() => { setDeciding(null); pending.reload(); today.reload(); refreshBadge() }} />
        </Sheet>
      )}
    </div>
  )
}

function Decide({ l, ok, onDone }: { l: Leave; ok: boolean; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const go_ = async () => {
    if (!ok && note.trim().length < 3) return toast('Себебін жазыңыз')
    setBusy(true)
    try {
      const st = await decideLeave(l.id, ok, note)
      toast(st === 'pending_deputy' ? 'Жауабыңыз орынбасарға жіберілді' : ok ? 'Рұқсат берілді' : 'Рұқсат берілмеді')
      onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <p>{l.student.full_name} · <span className="tabular-nums">{when(l)}</span></p>
      <Field label={ok ? 'Түсініктеме (міндетті емес)' : 'Себебі'}>{(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} h-24 py-2`} />}</Field>
      <Button block kind={ok ? 'primary' : 'danger'} loading={busy} onClick={go_}>{ok ? 'Растау' : 'Бас тарту'}</Button>
    </div>
  )
}
