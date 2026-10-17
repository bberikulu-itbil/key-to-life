import { useEffect, useState, type FormEvent } from 'react'
import { errText, getActivity, listStaff, submitActivity, updateActivity, type ActivityType } from '../lib/api'
import { TYPE_GROUPS, TYPE_LABEL, WD_SHORT, addDays, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, ErrorBox, Field, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

type F = { type: ActivityType; title: string; description: string; supervisor_id: string; place: string; audience: number[]; capacity: string
  schedule: 'once' | 'weekly' | 'calendar'; on_date: string; weekdays: number[]; date_from: string; date_to: string; start_time: string; end_time: string
  perDay: boolean; times: Record<number, { start: string; end: string }>; extra: { date: string; start: string; end: string }[] }

const GRADES = [5, 6, 7, 8, 9, 10, 11]
const SCHEDULE = { weekly: tx('Апта сайын'), once: tx('Бір рет'), calendar: tx('Күнтізбеде') } as const

export function validate(f: F, t = today()): Partial<Record<keyof F, string>> {
  const e: Partial<Record<keyof F, string>> = {}
  if (f.title.trim().length < 3) e.title = tx('Атауы кемінде 3 таңба')
  if (f.description.trim().length < 30) e.description = tx('Тағы {0} таңба жазыңыз: не істейсіздер, кімге арналған', 30 - f.description.trim().length)
  if (!f.supervisor_id) e.supervisor_id = tx('Жауапты мұғалімді таңдаңыз')
  if (f.place.trim().length < 2) e.place = tx('Өтетін орнын жазыңыз')
  if (f.capacity && !(+f.capacity >= 1 && +f.capacity <= 2000)) e.capacity = tx('1-ден 2000-ға дейін')
  if (f.schedule === 'once' && (!f.on_date || f.on_date < t)) e.on_date = tx('Бүгін немесе кейінгі күнді таңдаңыз')
  if (f.schedule !== 'once') {
    if (f.schedule === 'weekly' && !f.weekdays.length) e.weekdays = tx('Кемінде бір күн таңдаңыз')
    if (!f.date_from || !f.date_to || f.date_to < f.date_from) e.date_to = tx('Кезеңнің соңы басынан кейін болуы керек')
    else if (f.date_to < t) e.date_to = tx('Кезеңнің соңы өтіп кеткен')
  }
  if (!f.start_time || !f.end_time || f.end_time <= f.start_time) e.end_time = tx('Аяқталу уақыты басталудан кейін болуы керек')
  if (f.schedule === 'weekly' && f.perDay && f.weekdays.some((w) => { const x = f.times[w]; return x && x.end <= x.start }))
    e.times = tx('Әр күннің аяқталу уақыты басталудан кейін болуы керек')
  if (f.schedule === 'once' && f.extra.some((x) => !x.date || x.date < t || x.end <= x.start || x.date === f.on_date))
    e.extra = tx('Қосымша күндерді тексеріңіз: өткен күн, қайталанған күн немесе уақыт қате')
  return e
}

export default function ActivityForm({ id, copyOf }: { id?: string; copyOf?: string }) {
  const { me } = useMe()
  const staff = useLoad(listStaff, [])
  const t = today()
  const [f, setF] = useState<F>({ type: 'club', title: '', description: '', supervisor_id: me.role !== 'student' ? me.id : '', place: '', audience: [], capacity: '',
    schedule: 'weekly', on_date: addDays(t, 7), weekdays: [], date_from: t, date_to: addDays(t, 60), start_time: '15:00', end_time: '16:30', perDay: false, times: {}, extra: [] })
  const [loaded, setLoaded] = useState(!id && !copyOf)
  const [approved, setApproved] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const src = id ?? copyOf
    if (!src) return
    getActivity(src).then((a) => {
      setApproved(!!id && a.status === 'approved')
      setF({ type: a.type, title: a.title, description: a.description, supervisor_id: a.supervisor_id, place: a.place, audience: a.audience_grades,
        capacity: a.capacity ? String(a.capacity) : '', schedule: a.schedule === 'weekly' && !a.weekdays?.length ? 'calendar' : a.schedule, on_date: a.on_date ?? addDays(t, 7), weekdays: a.weekdays ?? [],
        date_from: a.date_from ?? t, date_to: a.date_to ?? addDays(t, 60), start_time: a.start_time.slice(0, 5), end_time: a.end_time.slice(0, 5),
        perDay: !!a.slots?.length, times: Object.fromEntries((a.slots ?? []).map((x) => [x.wd, { start: x.start, end: x.end }])), extra: [] })
      setLoaded(true)
    }, (e) => setErr(errText(e)))
  }, [id, copyOf])

  const errors = touched ? validate(f, t) : {}
  const set = <K extends keyof F>(k: K, v: F[K]) => setF({ ...f, [k]: v })
  const toggle = (k: 'audience' | 'weekdays', v: number) => set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v].sort())

  async function submit(e: FormEvent) {
    e.preventDefault(); setTouched(true)
    if (Object.keys(validate(f, t)).length) return toast(tx('Белгіленген өрістерді түзетіңіз'))
    setBusy(true)
    try {
      const slots = f.schedule === 'weekly' && f.perDay ? f.weekdays.map((wd) => ({ wd, ...(f.times[wd] ?? { start: f.start_time, end: f.end_time }) })) : []
      const p = { type: f.type, title: f.title.trim(), description: f.description.trim(), supervisor_id: f.supervisor_id, place: f.place.trim(),
        audience_grades: f.audience, capacity: f.capacity || null, schedule: f.schedule === 'once' ? 'once' : 'weekly',
        start_time: slots[0]?.start ?? f.start_time, end_time: slots[0]?.end ?? f.end_time, slots,
        ...(f.schedule === 'once' ? { on_date: f.on_date, extra: f.extra } : { weekdays: f.schedule === 'calendar' ? [] : f.weekdays, date_from: f.date_from, date_to: f.date_to }) }
      if (approved && id) { await updateActivity(id, p); toast(tx('Сақталды. Уақыты өзгерсе, қатысушыларға хабар кетті')); go(`/a/${id}`); return }
      const newId = await submitActivity(p, id)
      toast(me.role === 'deputy' || me.role === 'admin' ? tx('Жарияланды') : me.role === 'student' ? tx('Сынып жетекшісіне жіберілді') : tx('Орынбасарға жіберілді'))
      go(`/a/${newId}`)
    } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  if (!loaded) return <><PageHead title={tx('Өңдеу')} back />{err ? <ErrorBox text={err} /> : <Skeleton />}</>
  const route = me.role === 'deputy' || me.role === 'admin' ? tx('Сіз орынбасарсыз — бастама бірден жарияланады.')
    : me.role === 'student' ? tx('Ұсыныс алдымен сынып жетекшіңізге, содан кейін орынбасарға барады.') : tx('Ұсынысты орынбасар растайды.')

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 pb-6">
      <PageHead title={approved ? tx('Бастаманы өңдеу') : id ? tx('Ұсынысты өңдеу') : copyOf ? tx('Көшірмесін жасау') : tx('Бастама ұсыну')} back />
      <p className="text-sm text-muted -mt-2">{route}</p>

      <Card className="grid gap-4">
        <Field label={tx('Түрі')}>
          {(fid) => <select id={fid} value={f.type} onChange={(e) => set('type', e.target.value as ActivityType)} className={inputCls}>
            {TYPE_GROUPS.map(([g, types]) => <optgroup key={g} label={g}>{types.map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}</optgroup>)}</select>}
        </Field>
        <Field label={tx('Атауы')} error={errors.title}>
          {(fid, d) => <input id={fid} aria-describedby={d} aria-invalid={!!errors.title} maxLength={120} value={f.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder={tx('Мысалы: 3D модельдеу үйірмесі')} />}
        </Field>
        <Field label={tx('Сипаттамасы')} error={errors.description} hint={tx('Не істейсіздер, кімге пайдалы, не керек болады')}>
          {(fid, d) => <textarea id={fid} aria-describedby={d} aria-invalid={!!errors.description} maxLength={4000} value={f.description} onChange={(e) => set('description', e.target.value)} className={`${inputCls} h-28 py-2`} />}
        </Field>
        <Field label={tx('Жауапты мұғалім')} error={errors.supervisor_id ?? staff.error}>
          {(fid, d) => <select id={fid} aria-describedby={d} value={f.supervisor_id} onChange={(e) => set('supervisor_id', e.target.value)} className={inputCls}>
            <option value="">{tx('Таңдаңыз')}</option>
            {(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.title ? ` · ${s.title}` : ''}</option>)}</select>}
        </Field>
        <Field label={tx('Өтетін орны')} error={errors.place}>
          {(fid, d) => <input id={fid} aria-describedby={d} value={f.place} onChange={(e) => set('place', e.target.value)} className={inputCls} placeholder={tx('402-кабинет')} />}
        </Field>
      </Card>

      <Card className="grid gap-4">
        <div role="radiogroup" aria-label={tx('Кесте түрі')} className="grid grid-cols-3 gap-1 bg-surface-2 rounded-md p-1">
          {(['weekly', 'once', 'calendar'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.schedule === k} onClick={() => set('schedule', k)}
              className={`min-h-10 rounded-sm text-sm font-semibold leading-tight ${f.schedule === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{SCHEDULE[k]}</button>
          ))}
        </div>
        {f.schedule === 'calendar' && <p className="text-sm text-muted">{tx('Бастама құрылғаннан кейін Күнтізбе бөлімінде сабақтарды қосасыз: түрі (мысалы Çalışma, Camp, KBO), күні, қайталануы. Төмендегі уақыт — жаңа сабақтың әдепкі уақыты.')}</p>}
        {f.schedule === 'once' ? (
          <Field label={tx('Күні')} error={errors.on_date}>{(fid, d) => <input id={fid} aria-describedby={d} type="date" min={t} value={f.on_date} onChange={(e) => set('on_date', e.target.value)} className={inputCls} />}</Field>
        ) : (
          <>
            {f.schedule === 'weekly' && <fieldset className="grid gap-1.5">
              <legend className="text-sm font-semibold mb-1.5">{tx('Апта күндері')}</legend>
              <div className="grid grid-cols-7 gap-1">
                {WD_SHORT.map((w, i) => (
                  <button key={w} type="button" aria-pressed={f.weekdays.includes(i + 1)} onClick={() => toggle('weekdays', i + 1)}
                    className={`h-11 rounded-sm text-sm font-semibold ${f.weekdays.includes(i + 1) ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{w}</button>
                ))}
              </div>
              {errors.weekdays && <p className="text-sm text-danger">{errors.weekdays}</p>}
            </fieldset>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={tx('Басталуы')}>{(fid) => <input id={fid} type="date" value={f.date_from} onChange={(e) => set('date_from', e.target.value)} className={inputCls} />}</Field>
              <Field label={tx('Аяқталуы')} error={errors.date_to}>{(fid, d) => <input id={fid} aria-describedby={d} type="date" min={t} value={f.date_to} onChange={(e) => set('date_to', e.target.value)} className={inputCls} />}</Field>
            </div>
          </>
        )}
        {f.schedule === 'weekly' && f.weekdays.length > 1 && (
          <label className="flex items-center gap-3 min-h-11">
            <input type="checkbox" checked={f.perDay} onChange={(e) => set('perDay', e.target.checked)} className="size-5 accent-[var(--accent)]" />
            <span>{tx('Әр күнге бөлек уақыт')}</span>
          </label>
        )}
        {f.schedule === 'weekly' && f.perDay && f.weekdays.length > 1 ? (
          <div className="grid gap-2">
            {f.weekdays.map((wd) => {
              const x = f.times[wd] ?? { start: f.start_time, end: f.end_time }
              const put = (k: 'start' | 'end', v: string) => set('times', { ...f.times, [wd]: { ...x, [k]: v } })
              return (
                <div key={wd} className="grid grid-cols-[48px_1fr_1fr] gap-2 items-center">
                  <span className="font-semibold">{WD_SHORT[wd - 1]}</span>
                  <input type="time" aria-label={tx('{0} басталуы', WD_SHORT[wd - 1])} value={x.start} onChange={(e) => put('start', e.target.value)} className={inputCls} />
                  <input type="time" aria-label={tx('{0} аяқталуы', WD_SHORT[wd - 1])} value={x.end} onChange={(e) => put('end', e.target.value)} className={inputCls} />
                </div>
              )
            })}
            {errors.times && <p className="text-sm text-danger">{errors.times}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx('Басталатын уақыт')}>{(fid) => <input id={fid} type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} className={inputCls} />}</Field>
            <Field label={tx('Аяқталатын уақыт')} error={errors.end_time}>{(fid, d) => <input id={fid} aria-describedby={d} type="time" value={f.end_time} onChange={(e) => set('end_time', e.target.value)} className={inputCls} />}</Field>
          </div>
        )}
        {f.schedule === 'once' && !id && (
          <div className="grid gap-2">
            {f.extra.map((x, i) => {
              const put = (k: 'date' | 'start' | 'end', v: string) => set('extra', f.extra.map((y, j) => (j === i ? { ...y, [k]: v } : y)))
              return (
                <div key={i} className="grid grid-cols-[1.3fr_1fr_1fr_44px] gap-2 items-center">
                  <input type="date" aria-label={tx('{0}-күн', i + 2)} min={t} value={x.date} onChange={(e) => put('date', e.target.value)} className={inputCls} />
                  <input type="time" aria-label={tx('{0}-күн басталуы', i + 2)} value={x.start} onChange={(e) => put('start', e.target.value)} className={inputCls} />
                  <input type="time" aria-label={tx('{0}-күн аяқталуы', i + 2)} value={x.end} onChange={(e) => put('end', e.target.value)} className={inputCls} />
                  <button type="button" onClick={() => set('extra', f.extra.filter((_, j) => j !== i))} aria-label={tx('{0}-күнді алып тастау', i + 2)} className="size-11 grid place-items-center text-muted">✕</button>
                </div>
              )
            })}
            {errors.extra && <p className="text-sm text-danger">{errors.extra}</p>}
            <Button kind="ghost" onClick={() => set('extra', [...f.extra, { date: addDays(f.extra[f.extra.length - 1]?.date ?? f.on_date, 1), start: f.start_time, end: f.end_time }])}>{tx('Тағы күн мен уақыт қосу')}</Button>
          </div>
        )}
      </Card>

      <Card className="grid gap-4">
        <fieldset>
          <legend className="text-sm font-semibold mb-1.5">{tx('Қай сыныптарға?')}</legend>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <button key={g} type="button" aria-pressed={f.audience.includes(g)} onClick={() => toggle('audience', g)}
                className={`h-11 min-w-11 px-3 rounded-sm text-sm font-semibold ${f.audience.includes(g) ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{g}</button>
            ))}
          </div>
          <p className="text-sm text-muted mt-1.5">{f.audience.length ? tx('{0}-сыныптар', f.audience.join(', ')) : tx('Ештеңе таңдалмаса — барлық сыныптарға ашық')}</p>
        </fieldset>
        <Field label={tx('Орын саны')} error={errors.capacity} hint={tx('Бос қалса — шектеусіз')}>
          {(fid, d) => <input id={fid} aria-describedby={d} inputMode="numeric" value={f.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))} className={`${inputCls} tabular-nums`} />}
        </Field>
      </Card>

      {err && <ErrorBox text={err} />}
      <Button type="submit" block loading={busy}>{id ? tx('Қайта жіберу') : me.role === 'deputy' || me.role === 'admin' ? tx('Жариялау') : tx('Ұсынысты жіберу')}</Button>
    </form>
  )
}
