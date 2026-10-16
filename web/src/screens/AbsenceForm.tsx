import { useMemo, useState, type FormEvent } from 'react'
import { errText, listActivities, requestAbsence } from '../lib/api'
import { addDays, fmtDate, lastDay, sessions, today } from '../lib/time'
import { useMe } from '../App'
import { CATEGORY } from './ActivityDetail'
import { Button, Empty, Field, Skeleton, inputCls, toast, useLoad } from '../components/ui'

export default function AbsenceForm({ activityId, onDone }: { activityId?: string; onDone: () => void }) {
  const { me } = useMe()
  const { data, loading } = useLoad(listActivities, [])
  const t = today()
  const mine = useMemo(() => (data ?? []).filter((a) => a.status === 'approved' && lastDay(a) >= t
    && a.enrollments.some((e) => e.student_id === me.id && !e.waitlisted)), [data, me.id, t])
  const [act, setAct] = useState(activityId ?? '')
  const a = mine.find((x) => x.id === (act || mine[0]?.id))
  const dates = useMemo(() => (a ? sessions(a, t, addDays(t, 30)).reverse() : []), [a, t])
  const [date, setDate] = useState('')
  const [cat, setCat] = useState('illness')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (loading) return <Skeleton rows={2} />
  if (!mine.length) return <Empty title="Жазылған іс-шара жоқ" text="Рұқсат тек өзіңіз қатысатын іс-шараның сабақтарына сұралады." />

  async function submit(e: FormEvent) {
    e.preventDefault()
    const d = date || dates[0]
    if (!a || !d) return setErr('Алдағы 30 күнде сабақ жоқ')
    if (reason.trim().length < 10) return setErr('Себебін кемінде 10 таңбамен жазыңыз')
    setBusy(true); setErr('')
    try { await requestAbsence(a.id, d, cat, reason); toast('Өтініш жауапты мұғалімге жіберілді'); onDone() } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field label="Қай іс-шарадан?">
        {(id) => <select id={id} value={a?.id} onChange={(e) => { setAct(e.target.value); setDate('') }} className={inputCls}>
          {mine.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>}
      </Field>
      <Field label="Сабақ күні">
        {(id) => dates.length ? <select id={id} value={date || dates[0]} onChange={(e) => setDate(e.target.value)} className={inputCls}>
          {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}{d === t ? ' (бүгін)' : ''}</option>)}</select>
          : <p id={id} className="text-sm text-muted">Алдағы 30 күнде сабақ жоқ.</p>}
      </Field>
      <Field label="Себеп">
        {(id) => <select id={id} value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>
          {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      </Field>
      <Field label="Толығырақ" hint="Жауапты мұғалім ғана көреді">
        {(id, d) => <textarea id={id} aria-describedby={d} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className={`${inputCls} h-24 py-2`} />}
      </Field>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Button type="submit" block loading={busy}>Өтінішті жіберу</Button>
    </form>
  )
}
