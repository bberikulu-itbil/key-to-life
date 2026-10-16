import { useEffect, useState, type FormEvent } from 'react'
import { errText, verifyCode } from '../lib/api'
import { fmtDate } from '../lib/time'
import { useMe } from '../App'
import { LEAVE_CATEGORY } from './LeaveForm'
import { LEAVE_STATUS, when } from './Leaves'
import { Button, Card, Field, Icon, PageHead, Skeleton, go, inputCls } from '../components/ui'

type R = Record<string, string | boolean>

export default function Verify({ code }: { code?: string }) {
  const { me } = useMe()
  const [input, setInput] = useState(code ?? '')
  const [res, setRes] = useState<R | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!code || me.role === 'student') return
    setBusy(true); setErr(''); setRes(undefined)
    verifyCode(code).then(setRes, (e) => setErr(errText(e))).finally(() => setBusy(false))
  }, [code, me.role])

  const submit = (e: FormEvent) => { e.preventDefault(); if (input.trim()) go(`/v/${input.trim().toUpperCase()}`) }

  if (me.role === 'student') return <><PageHead title="QR тексеру" back /><Card><p>QR-ды тек мұғалімдер тексереді.</p></Card></>

  const ok = res?.valid_now === true
  const approved = res?.status === 'approved'
  const tone = ok ? 'bg-success-soft text-success' : approved ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
  const verdict = ok ? 'Жарамды — қазір' : approved ? 'Расталған, бірақ уақыты емес' : 'Жарамсыз'

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="QR тексеру" back />
      <form onSubmit={submit} className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="Код" hint="QR-ды телефон камерасымен сканерлесеңіз, бет өзі ашылады">{(id, d) =>
          <input id={id} aria-describedby={d} value={input} onChange={(e) => setInput(e.target.value)} className={`${inputCls} uppercase tabular-nums`} placeholder="L-3F9A2C" />}</Field>
        <Button type="submit">Тексеру</Button>
      </form>
      {busy && <Skeleton rows={1} />}
      {err && <Card className="bg-danger-soft text-danger">{err}</Card>}
      {code && !busy && res === null && <Card className="bg-danger-soft text-danger font-semibold">Мұндай код табылмады</Card>}
      {res && (
        <div className={`rounded-lg p-5 grid gap-3 ${tone}`} role="status">
          <p className="flex items-center gap-2 text-xl font-bold"><Icon n={ok ? 'check' : 'x'} size={28} />{verdict}</p>
          <div className="text-fg bg-surface rounded-md p-4 grid gap-1">
            {res.type === 'leave' ? (
              <>
                <p className="text-lg font-semibold">{res.student as string} <span className="text-sm text-muted">{res.class as string}</span></p>
                <p>{res.kind === 'outside' ? 'Сыртқа шығу' : 'Сабақтан сұрану'} · {LEAVE_CATEGORY[res.category as string]}</p>
                <p className="tabular-nums">{when({ starts_at: res.starts_at as string, ends_at: res.ends_at as string })}</p>
                <p className="text-sm text-muted">{LEAVE_STATUS[res.status as keyof typeof LEAVE_STATUS]?.[0]}{res.decided_by ? ` · ${res.decided_by}` : ''} · {res.code as string}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">{res.resource as string} <span className="text-sm text-muted">{res.group as string}</span></p>
                <p className="tabular-nums">{fmtDate(res.date as string)} · {res.start as string}–{res.end as string}</p>
                <p>{res.user as string} · {res.purpose as string}</p>
                <p className="text-sm text-muted">{res.status === 'approved' ? 'Расталған' : res.status === 'pending' ? 'Растау күтуде' : 'Белсенді емес'} · {res.code as string}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
