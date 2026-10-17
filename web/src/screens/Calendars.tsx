import { useEffect, useRef, useState } from 'react'
import { addEvents, canEditCalendar, ensureCalendars, errText, removeEvent, setHidden, type Calendar } from '../lib/api'
import { loadAgenda, onDay, type Item } from '../lib/agenda'
import { parseIcs, toIcs } from '../lib/ics'
import { addDays, fmtDate, iso, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Field, Icon, PageHead, Sheet, Skeleton, ErrorBox, TypeBadge, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

const hhmm = (d: Date) => d.toTimeString().slice(0, 5)

export default function Calendars() {
  const { me } = useMe()
  const t = today()
  const classId = new URLSearchParams(location.hash.split('?')[1] ?? '').get('class')
  const [ready, setReady] = useState(false)
  useEffect(() => { ensureCalendars().finally(() => setReady(true)) }, [])
  const ag = useLoad(() => (ready ? loadAgenda(me, addDays(t, -30), addDays(t, 120)) : new Promise<never>(() => {})), [ready, me.id, classId])
  const [sheet, setSheet] = useState<null | 'add' | 'import'>(null)
  const allCals = (ag.data?.sources ?? []).flatMap((s) => (s.cal ? [s.cal] : []))
  const classCal = classId ? allCals.find((c) => c.class_id === classId) : undefined
  const cals = classCal ? [classCal] : allCals
  const visibleSources = classCal ? (ag.data?.sources ?? []).filter((s) => s.cal?.id === classCal.id) : (ag.data?.sources ?? [])
  const visibleItems = classCal ? (ag.data?.items ?? []).filter((i) => i.src === classCal.id) : (ag.data?.items ?? [])
  // ask the database which calendars this person may write to, so the UI never offers what RLS would refuse
  const can = useLoad(async () => (await Promise.all(cals.map((c) => canEditCalendar(c.id)))), [cals.map((c) => c.id).join()])
  const editable = cals.filter((_, i) => can.data?.[i])

  const toggle = async (key: string, hide: boolean) => {
    try { await setHidden(key, hide); ag.reload() } catch (e) { toast(errText(e)) }
  }
  const exportIcs = () => {
    const items = ag.data?.items ?? []
    const ics = toIcs('Lyceum Life', items.map((i) => ({ uid: i.key, title: i.title, start: i.start, end: i.end, allDay: i.allDay, location: i.place ?? undefined })))
    // shortcut: a Blob link; inside Telegram this should switch to WebApp.downloadFile once the Mini App ships
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `lyceum-life-${t}.ics` })
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(tx('{0} жазба экспортталды', items.length))
  }

  const upcoming = visibleItems.filter((i) => i.end >= new Date() && i.start <= new Date(Date.now() + 30 * 864e5))
  const days = [...new Set(upcoming.map((i) => iso(i.start)))]

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={classCal?.name ?? tx('Күнтізбелерім')} back />
      {!ag.data ? (ag.error ? <ErrorBox text={ag.error} retry={ag.reload} /> : <Skeleton />) : (
        <>
          <Card className="p-0 divide-y divide-line">
            {visibleSources.map((s) => {
              const hidden = ag.data!.hidden.includes(s.key)
              return (
                <div key={s.key} className="flex items-center gap-3 px-4 min-h-14">
                  <span className="size-3 rounded-full shrink-0" style={{ background: s.color }} aria-hidden />
                  <span className={`flex-1 min-w-0 ${hidden ? 'text-muted line-through' : ''}`}>{s.name}
                    {s.key === 'activities' && <span className="block text-xs text-muted no-underline">{tx('Жазылған бастамалар автоматты түрде')}</span>}
                  </span>
                  <button type="button" role="switch" aria-checked={!hidden} aria-label={`${s.name}: ${hidden ? tx('жасырылған') : tx('көрінеді')}`} onClick={() => toggle(s.key, !hidden)}
                    className={`w-12 h-7 rounded-full p-0.5 transition-colors ${hidden ? 'bg-surface-2 border border-input' : 'bg-accent'}`}>
                    <span className={`block size-6 rounded-full bg-surface shadow-card transition-transform ${hidden ? '' : 'translate-x-5'}`} />
                  </button>
                </div>
              )
            })}
          </Card>
          <div className="grid grid-cols-3 gap-2">
            <Button kind="secondary" disabled={!editable.length} onClick={() => setSheet('add')}>{tx('Қосу')}</Button>
            <Button kind="secondary" disabled={!editable.length} onClick={() => setSheet('import')}>{tx('Импорт')}</Button>
            <Button kind="secondary" onClick={exportIcs}>{tx('Экспорт')}</Button>
          </div>
          <p className="text-xs text-muted">{tx('Экспорт .ics файлын жасайды: оны Google Calendar немесе iPhone күнтізбесіне қосуға болады. Тек көрініп тұрған күнтізбелер кіреді.')}</p>

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Алдағы 30 күн')}</h2>
          {!days.length ? <Card><p className="text-sm text-muted">{tx('Жазба жоқ.')}</p></Card> : days.map((d) => (
            <section key={d} className="grid gap-1">
              <h3 className="text-sm font-semibold">{d === t ? tx('Бүгін') : fmtDate(d)}</h3>
              <Card className="py-1 divide-y divide-line">
                {upcoming.filter((i) => onDay(i, d) && iso(i.start) === d).map((i) => <Row key={i.key} i={i} canDelete={i.kind === 'event' && editable.some((c) => c.id === i.src)} onDeleted={ag.reload} />)}
              </Card>
            </section>
          ))}
        </>
      )}

      {sheet === 'add' && <Sheet title={tx('Жоспар қосу')} onClose={() => setSheet(null)}><AddEvent cals={editable} preferredId={classCal?.id} onDone={() => { setSheet(null); ag.reload() }} /></Sheet>}
      {sheet === 'import' && <Sheet title={tx('.ics импорт')} onClose={() => setSheet(null)}><Import cals={editable} onDone={() => { setSheet(null); ag.reload() }} /></Sheet>}
    </div>
  )
}

function Row({ i, canDelete, onDeleted }: { i: Item; canDelete: boolean; onDeleted: () => void }) {
  const del = async () => { try { await removeEvent(i.key.slice(1)); toast(tx('Өшірілді')); onDeleted() } catch (e) { toast(errText(e)) } }
  const body = (
    <span className="flex gap-3 py-2.5 items-start">
      <span className="w-12 text-sm tabular-nums text-right shrink-0">{i.allDay ? tx('Күні бойы') : hhmm(i.start)}</span>
      <span className="min-w-0 flex-1 border-l-[3px] pl-3" style={{ borderColor: i.color }}>
        <span className="block font-medium break-words">{i.title}{i.stype && <span className="ml-2"><TypeBadge t={i.stype} /></span>}</span>
        {i.place && <span className="block text-sm text-muted">{i.place}</span>}{i.responsible && <span className="block text-sm text-muted">{tx('Жауапты: {0}', i.responsible)}</span>}
      </span>
    </span>
  )
  return (
    <div className="flex items-center">
      <div className="flex-1 min-w-0">{i.link ? <a href={`#${i.link}`}>{body}</a> : body}</div>
      {canDelete && <button type="button" onClick={del} aria-label={tx('{0} — өшіру', i.title)} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
    </div>
  )
}

function AddEvent({ cals, preferredId, onDone }: { cals: Calendar[]; preferredId?: string; onDone: () => void }) {
  const t = today()
  const [f, setF] = useState({ cal: preferredId ?? cals.find((c) => c.kind === 'personal')?.id ?? cals[0]?.id ?? '', title: '', date: t, from: '16:00', to: '17:00', allDay: false, place: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.title.trim()) return toast(tx('Атауын жазыңыз'))
    if (!f.allDay && f.to <= f.from) return toast(tx('Аяқталу уақыты басталудан кейін болуы керек'))
    const s = f.allDay ? new Date(`${f.date}T00:00`) : new Date(`${f.date}T${f.from}`)
    const e = f.allDay ? new Date(`${f.date}T23:59`) : new Date(`${f.date}T${f.to}`)
    setBusy(true)
    try { await addEvents([{ calendar_id: f.cal, title: f.title.trim(), starts_at: s.toISOString(), ends_at: e.toISOString(), all_day: f.allDay, location: f.place.trim() || null }]); toast(tx('Қосылды')); onDone() }
    catch (x) { toast(errText(x)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Күнтізбе')}>{(id) => <select id={id} value={f.cal} onChange={(e) => setF({ ...f, cal: e.target.value })} className={inputCls}>{cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
      <Field label={tx('Атауы')}>{(id) => <input id={id} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Codeforces контесті, кітап оқу…')} />}</Field>
      <Field label={tx('Күні')}>{(id) => <input id={id} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={inputCls} />}</Field>
      <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} className="size-5 accent-[var(--accent)]" />{tx('Күні бойы')}</label>
      {!f.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Басталуы')}>{(id) => <input id={id} type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={inputCls} />}</Field>
          <Field label={tx('Аяқталуы')}>{(id) => <input id={id} type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={inputCls} />}</Field>
        </div>
      )}
      <Field label={tx('Орны')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}

function Import({ cals, onDone }: { cals: Calendar[]; onDone: () => void }) {
  const [cal, setCal] = useState(cals.find((c) => c.kind === 'personal')?.id ?? cals[0]?.id ?? '')
  const [parsed, setParsed] = useState<ReturnType<typeof parseIcs> | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const read = async (f?: File) => {
    if (!f) return
    if (f.size > 2_000_000) return toast(tx('Файл тым үлкен (2 МБ-тан аспауы керек)'))
    try { const ev = parseIcs(await f.text()); if (!ev.length) toast(tx('Файлда оқиға табылмады')); setParsed(ev) } catch (e) { toast(errText(e)) }
  }
  const save = async () => {
    if (!parsed?.length) return
    setBusy(true)
    try {
      let n = 0
      for (let i = 0; i < parsed.length; i += 200) {   // keep each request small
        const rows = parsed.slice(i, i + 200).map((e) => ({ calendar_id: cal, title: e.title, starts_at: e.start.toISOString(), ends_at: e.end.toISOString(),
          all_day: e.allDay, location: e.location ?? null, notes: e.notes?.slice(0, 2000) ?? null, import_uid: e.uid.slice(0, 300) }))
        n += (await addEvents(rows)).length
      }
      toast(n ? tx('{0} оқиға қосылды', n) : tx('Барлығы бұрын импортталған')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">{tx('Google Calendar, iPhone немесе Outlook-тан экспортталған .ics файлын таңдаңыз. Қайталанатын оқиғалар бір жылға дейін ашылады, бұрын қосылғандары екінші рет қосылмайды.')}</p>
      <Field label={tx('Қай күнтізбеге')}>{(id) => <select id={id} value={cal} onChange={(e) => setCal(e.target.value)} className={inputCls}>{cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
      <input ref={file} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
      <Button kind="secondary" onClick={() => file.current?.click()}>{tx('Файл таңдау')}</Button>
      {parsed && <p className="text-sm">{tx('{0} оқиға табылды{1}', parsed.length, parsed[0] ? tx(': «{0}» және т.б.', parsed[0].title) : '')}</p>}
      <Button block loading={busy} disabled={!parsed?.length} onClick={save}>{tx('Импорттау')}</Button>
    </div>
  )
}
