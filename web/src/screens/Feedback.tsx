import { useState } from 'react'
import { errText, listAppFeedback, sendAppFeedback } from '../lib/api'
import { chatTime } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Empty, Field, PageHead, Skeleton, inputCls, toast, useLoad } from '../components/ui'

/** Ideas and bug reports for the app itself; they go to the app's admins (its developers). */
export default function Feedback() {
  const { me } = useMe()
  const list = useLoad(listAppFeedback, [])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try { await sendAppFeedback(body.trim()); setBody(''); toast('Рақмет! Ұсынысыңыз әзірлеушіге жіберілді'); list.reload() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const admin = me.role === 'admin'
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Қосымшаны дамыту" back />
      <Card className="grid gap-3">
        <p className="text-sm text-muted">Не ыңғайсыз, не жетіспейді, қандай қате кездесті? Жазыңыз — қосымшаны әзірлеушіге [қосымшаны жасаушы] бірден барады.</p>
        <Field label="Ұсыныс немесе қате">{(id) => <textarea id={id} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} className={`${inputCls} h-32 py-2`}
          placeholder="Мысалы: түгелдеуде оқушыларды сынып бойынша сұрыптау керек" />}</Field>
        <Button block loading={busy} disabled={body.trim().length < 5} onClick={send}>Жіберу</Button>
      </Card>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{admin ? 'Келген ұсыныстар' : 'Менің ұсыныстарым'}</h2>
      {list.loading && !list.data ? <Skeleton rows={2} /> : !list.data?.length ? <Card><Empty icon="flag" title="Әзірге жоқ" /></Card> : (
        <Card className="p-0 divide-y divide-line">
          {list.data.map((f) => (
            <div key={f.id} className="px-4 py-3 grid gap-1">
              <p className="text-xs text-muted">{admin ? `${f.author?.full_name ?? '—'} · ` : ''}{chatTime(f.created_at)}</p>
              <p className="whitespace-pre-line break-words">{f.body}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
