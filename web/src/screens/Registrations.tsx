import { useState } from 'react'
import { decideRegistration, errText, listRegistrations, type Registration } from '../lib/api'
import { chatTime } from '../lib/time'
import { tx } from '../lib/i18n'
import { Button, Card, Empty, Field, PageHead, Skeleton, inputCls, toast, useLoad } from '../components/ui'

/** Sign-up requests this person may decide: their class's students, or (admin) everyone of the school. */
export default function Registrations() {
  const list = useLoad(listRegistrations, [])
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Тіркелу өтініштері')} back />
      {list.loading && !list.data ? <Skeleton /> : !list.data?.length ? <Card><Empty icon="userplus" title={tx('Жаңа өтініш жоқ')} text={tx('Оқушыны сынып жетекшісі немесе әкімші, мұғалімді әкімші растайды.')} /></Card>
        : list.data.map((r) => <Row key={r.user_id} r={r} onDone={list.reload} />)}
    </div>
  )
}

function Row({ r, onDone }: { r: Registration; onDone: () => void }) {
  const [refusing, setRefusing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const decide = async (approve: boolean) => {
    setBusy(true)
    try { await decideRegistration(r.user_id, approve, approve ? undefined : note); toast(approve ? tx('Расталды — енді кіре алады') : tx('Бас тартылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Card className="grid gap-3">
      <div>
        <p className="font-semibold">{r.full_name}</p>
        <p className="text-sm text-muted">{r.role === 'student' ? `${tx('Оқушы')} · ${r.class?.name ?? ''}` : `${tx('Мұғалім')}${r.title ? ` · ${r.title}` : ''}`} · {chatTime(r.created_at)}</p>
      </div>
      {refusing ? (
        <>
          <Field label={tx('Себебі')}>{(id) => <input id={id} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} autoFocus />}</Field>
          <div className="grid grid-cols-2 gap-2"><Button kind="danger" loading={busy} disabled={note.trim().length < 3} onClick={() => decide(false)}>{tx('Бас тарту')}</Button><Button kind="ghost" onClick={() => setRefusing(false)}>{tx('Болдырмау')}</Button></div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2"><Button loading={busy} onClick={() => decide(true)}>{tx('Растау')}</Button><Button kind="secondary" disabled={busy} onClick={() => setRefusing(true)}>{tx('Бас тарту')}</Button></div>
      )}
    </Card>
  )
}
