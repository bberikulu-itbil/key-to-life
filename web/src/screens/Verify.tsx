import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { errText, verifyCode } from '../lib/api'
import { fmtDate } from '../lib/time'
import { LEAVE_CATEGORY } from './LeaveForm'
import { LEAVE_STATUS, when } from './Leaves'
import { Button, Card, Icon, PageHead, Skeleton, go, inputCls, toast } from '../components/ui'
import Scanner from '../components/Scanner'
import { routeFrom } from '../lib/qr'
import { canTgScan, goBack, tgScanQr } from '../lib/telegram'
import { tx } from '../lib/i18n'

type R = Record<string, string | boolean>

export default function Verify({ code }: { code?: string }) {
  const [input, setInput] = useState(code ?? '')
  const [res, setRes] = useState<R | null | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!code) return
    setBusy(true); setErr(''); setRes(undefined)
    verifyCode(code).then(setRes, (e) => setErr(errText(e))).finally(() => setBusy(false))
  }, [code])

  // one read is enough: leave the camera and open the result
  const bad = useRef('')
  const onText = useCallback((t: string) => {
    const to = routeFrom(t)
    if (!to) { if (bad.current !== t) toast(tx('Бұл Key To Life QR коды емес')); bad.current = t; return false }
    go(to); return true
  }, [])
  const submit = (e: FormEvent) => { e.preventDefault(); const to = routeFrom(input); if (to) go(to); else toast(tx('Бұл Key To Life QR коды емес')) }

  // no code yet: the camera opens at once, full screen, with the code field at the bottom
  if (!code) return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      <div className="flex items-center gap-1 px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2 text-white">
        <button type="button" onClick={goBack} aria-label={tx('Артқа')} className="size-11 grid place-items-center"><Icon n="back" /></button>
        <h1 className="flex-1 text-lg font-bold">{tx('QR тексеру')}</h1>
        {canTgScan() && <button type="button" onClick={() => tgScanQr(tx('Key To Life QR кодын көрсетіңіз'), onText)} className="h-9 px-3 rounded-full bg-white/15 text-sm">{tx('Telegram сканері')}</button>}
      </div>
      <div className="flex-1 min-h-0"><Scanner full onText={onText} /></div>
      <form onSubmit={submit} className="bg-surface rounded-t-lg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] grid gap-2">
        <p className="text-xs text-muted">{tx('Рұқсат, бронь, сертификат, жатақхана заты немесе бастама QR коды.')}</p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input aria-label={tx('Немесе кодты жазыңыз')} value={input} onChange={(e) => setInput(e.target.value)} className={`${inputCls} uppercase placeholder:normal-case tabular-nums`} placeholder={tx("Немесе кодты жазыңыз")} />
          <Button type="submit">{tx('Тексеру')}</Button>
        </div>
      </form>
    </div>
  )

  const ok = res?.valid_now === true
  const approved = res?.status === 'approved'
  const tone = ok ? 'bg-success-soft text-success' : approved ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
  const verdict = ok ? tx('Жарамды — қазір') : approved ? tx('Расталған, бірақ уақыты емес') : tx('Жарамсыз')

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('QR тексеру')} back />
      <Button block onClick={() => go('/v/')}><Icon n="qr" size={20} />{tx('Қайта сканерлеу')}</Button>
      {busy && <Skeleton rows={1} />}
      {err && <Card className="bg-danger-soft text-danger">{err}</Card>}
      {code && !busy && res === null && <Card className="bg-danger-soft text-danger font-semibold">{tx('Мұндай код табылмады')}</Card>}
      {res && (
        <div className={`rounded-lg p-5 grid gap-3 ${tone}`} role="status">
          <p className="flex items-center gap-2 text-xl font-bold"><Icon n={ok ? 'check' : 'x'} size={28} />{verdict}</p>
          <div className="text-fg bg-surface rounded-md p-4 grid gap-1">
            {res.type === 'leave' ? (
              <>
                <p className="text-lg font-semibold">{res.student as string} <span className="text-sm text-muted">{res.class as string}</span></p>
                <p>{res.kind === 'outside' ? tx('Сыртқа шығу') : tx('Сабақтан сұрану')}{res.category ? ` · ${LEAVE_CATEGORY[res.category as string]}` : ''}</p>
                <p className="tabular-nums">{when({ starts_at: res.starts_at as string, ends_at: res.ends_at as string })}</p>
                <p className="text-sm text-muted">{LEAVE_STATUS[res.status as keyof typeof LEAVE_STATUS]?.[0]}{res.decided_by ? ` · ${res.decided_by}` : ''} · {res.code as string}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">{res.resource as string} <span className="text-sm text-muted">{res.group as string}</span></p>
                <p className="tabular-nums">{fmtDate(res.date as string)} · {res.start as string}–{res.end as string}</p>
                <p>{res.user as string} · {res.purpose as string}</p>
                <p className="text-sm text-muted">{res.status === 'approved' ? tx('Расталған') : res.status === 'pending' ? tx('Растау күтуде') : tx('Белсенді емес')} · {res.code as string}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
