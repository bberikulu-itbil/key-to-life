import { useMemo, useState } from 'react'
import { errText, removeClassPlan, saveClassPlan, type Activity, type SchoolBreak } from '../lib/api'
import { WD_SHORT, addDays, fmtDate, hm, inBreak, isoDow, today } from '../lib/time'
import { Button, Field, Icon, Sheet, inputCls, toast } from './ui'
import { tx } from '../lib/i18n'

export type TermPresetId = 'term1' | 'term2' | 'term3' | 'year' | 'custom'

function getTermPresets(todayDate: string = today()) {
  const year = parseInt(todayDate.slice(0, 4), 10)
  const month = parseInt(todayDate.slice(5, 7), 10)
  const startYear = month < 8 ? year - 1 : year
  const nextYear = startYear + 1

  return [
    { id: 'term1' as TermPresetId, label: tx('1-тоқсан соңына дейін'), date: `${startYear}-10-31` },
    { id: 'term2' as TermPresetId, label: tx('2-тоқсан соңына дейін'), date: `${startYear}-12-31` },
    { id: 'term3' as TermPresetId, label: tx('3-тоқсан соңына дейін'), date: `${nextYear}-03-20` },
    { id: 'year' as TermPresetId, label: tx('Оқу жылының соңына дейін (4-тоқсан)'), date: `${nextYear}-05-31` },
  ]
}

export default function ClassPlanSheet({
  classId,
  className,
  existing,
  breaks,
  onClose,
  onSaved,
}: {
  classId: string
  className: string
  existing?: Activity | null
  breaks: SchoolBreak[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = today()
  const presets = useMemo(() => getTermPresets(t), [t])

  const initialDateFrom = existing?.date_from ?? '2026-09-01'
  const initialDateTo = existing?.date_to ?? presets[0].date

  // Determine initial preset
  const findPreset = (dateTo: string): TermPresetId => {
    const match = presets.find((p) => p.date === dateTo)
    return match ? match.id : 'custom'
  }

  const [title, setTitle] = useState(existing?.title ?? tx('Этюд-1 · {0}', className))
  const [startTime, setStartTime] = useState(existing ? hm(existing.start_time) : '19:00')
  const [endTime, setEndTime] = useState(existing ? hm(existing.end_time) : '19:45')
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays?.length ? existing.weekdays : [1, 2, 3, 4, 7])
  const [place, setPlace] = useState(existing?.place ?? `${className} ${tx('сыныбы')}`)
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [preset, setPreset] = useState<TermPresetId>(findPreset(initialDateTo))
  const [description, setDescription] = useState(
    existing?.description ?? tx('{0} сыныбының кешкі өзіндік дайындығы (Etude). Тәрбиеші мен сынып жетекшісі түгелдейді.', className)
  )
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleWd = (w: number) => {
    setWeekdays((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w].sort()))
  }

  const handleSelectPreset = (pId: TermPresetId) => {
    setPreset(pId)
    const found = presets.find((p) => p.id === pId)
    if (found) {
      setDateTo(found.date)
    }
  }

  // Count planned sessions excluding school breaks
  const totalSessions = useMemo(() => {
    if (!dateFrom || !dateTo || dateTo < dateFrom || !weekdays.length) return 0
    let count = 0
    for (let cur = dateFrom; cur <= dateTo; cur = addDays(cur, 1)) {
      if (weekdays.includes(isoDow(cur)) && !inBreak(cur, breaks)) {
        count++
      }
    }
    return count
  }, [dateFrom, dateTo, weekdays, breaks])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const cleanTitle = title.trim()
    if (cleanTitle.length < 2) {
      setError(tx('Жоспар атауын жазыңыз'))
      return
    }
    if (endTime <= startTime) {
      setError(tx('Аяқталу уақыты басталу уақытынан кейін болуы керек'))
      return
    }
    if (!weekdays.length) {
      setError(tx('Кемінде бір апта күнін таңдаңыз'))
      return
    }
    if (!dateFrom || !dateTo || dateTo < dateFrom) {
      setError(tx('Кезеңнің аяқталу күні басталу күнінен кейін болуы керек'))
      return
    }

    setBusy(true)
    try {
      await saveClassPlan(
        classId,
        {
          title: cleanTitle,
          start_time: startTime,
          end_time: endTime,
          date_from: dateFrom,
          date_to: dateTo,
          weekdays,
          place: place.trim() || null,
          description: description.trim() || null,
        },
        existing?.id
      )
      toast(existing ? tx('Сынып жоспары жаңартылды') : tx('Сынып жоспары сәтті қосылды'))
      onSaved()
      onClose()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!existing) return
    if (!window.confirm(tx('Бұл жоспарды (Этюд) күнтізбеден алып тастағыңыз келе ме?'))) return
    setDeleting(true)
    try {
      await removeClassPlan(existing.id)
      toast(tx('Жоспар алынды'))
      onSaved()
      onClose()
    } catch (err) {
      setError(errText(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Sheet
      onClose={onClose}
      title={existing ? tx('Сынып жоспарын (Этюд) өңдеу') : tx('Сынып жоспарын (Этюд) қосу')}
    >
      <form onSubmit={handleSave} className="grid gap-4 p-4 pb-6">
        {error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
            {error}
          </div>
        )}

        {/* Title and quick presets */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-muted">
            {tx('Жоспар атауы')} <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder={tx('Мысалы: Этюд-1 · {0}', className)}
            required
          />
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[
              tx('Этюд-1 · {0}', className),
              tx('Этюд-2 · {0}', className),
              tx('Кешкі өзіндік дайындық'),
              tx('Таңғы жиын'),
              tx('Сынып сағаты'),
            ].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTitle(p)}
                className={`h-7 px-2.5 rounded-full text-xs font-medium border transition ${
                  title === p
                    ? 'bg-accent text-on-accent border-accent'
                    : 'bg-surface-2 text-muted border-line hover:text-fg'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Time start & end */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Басталу уақыты')}>
            {(id) => (
              <input
                id={id}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputCls}
                required
              />
            )}
          </Field>
          <Field label={tx('Аяқталу уақыты')}>
            {(id) => (
              <input
                id={id}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
                required
              />
            )}
          </Field>
        </div>

        {/* Weekdays */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted">
              {tx('Апта күндері')} <span className="text-danger">*</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWeekdays([1, 2, 3, 4, 7])}
                className="text-[11px] text-accent hover:underline font-medium"
              >
                {tx('Этюд күндері (Дс–Бс, Жс)')}
              </button>
              <button
                type="button"
                onClick={() => setWeekdays([1, 2, 3, 4, 5])}
                className="text-[11px] text-accent hover:underline font-medium"
              >
                {tx('Дс–Жм')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WD_SHORT.map((w, i) => {
              const active = weekdays.includes(i + 1)
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => toggleWd(i + 1)}
                  className={`h-11 rounded-lg text-xs font-bold transition border ${
                    active
                      ? 'bg-accent text-on-accent border-accent shadow-xs'
                      : 'bg-surface-2 text-muted border-line hover:text-fg'
                  }`}
                >
                  {w}
                </button>
              )
            })}
          </div>
        </div>

        {/* Target Term / Validity Period Presets */}
        <div className="grid gap-2 border-t border-line pt-3">
          <label className="text-xs font-semibold text-muted flex items-center justify-between">
            <span>{tx('Жоспар қай уақытқа дейін жасалады?')}</span>
            <span className="text-[11px] text-accent font-normal">
              {tx('Тоқсан соңына дейін немесе белгіленген күн')}
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {presets.map((p) => {
              const selected = preset === p.id && dateTo === p.date
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border transition ${
                    selected
                      ? 'bg-accent/10 border-accent text-accent font-semibold shadow-2xs'
                      : 'bg-surface-2 text-muted border-line hover:text-fg'
                  }`}
                >
                  <span className="text-xs font-bold text-fg flex items-center justify-between w-full">
                    <span>{p.label}</span>
                    {selected && <span className="text-accent">✓</span>}
                  </span>
                  <span className="text-[11px] opacity-75 mt-0.5">{fmtDate(p.date)}</span>
                </button>
              )
            })}

            {/* Custom option */}
            <button
              type="button"
              onClick={() => handleSelectPreset('custom')}
              className={`flex flex-col text-left p-2.5 rounded-xl border transition ${
                preset === 'custom'
                  ? 'bg-accent/10 border-accent text-accent font-semibold shadow-2xs'
                  : 'bg-surface-2 text-muted border-line hover:text-fg'
              }`}
            >
              <span className="text-xs font-bold text-fg flex items-center justify-between w-full">
                <span>{tx('Белгіленген күнге дейін...')}</span>
                {preset === 'custom' && <span className="text-accent">✓</span>}
              </span>
              <span className="text-[11px] opacity-75 mt-0.5">
                {dateTo ? fmtDate(dateTo) : tx('Өз күніңізді таңдаңыз')}
              </span>
            </button>
          </div>

          {/* Dates From & To inputs */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <Field label={tx('Басталу күні')}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={inputCls}
                  required
                />
              )}
            </Field>

            <Field label={tx('Аяқталу күні')}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPreset(findPreset(e.target.value))
                  }}
                  className={inputCls}
                  required
                />
              )}
            </Field>
          </div>

          {/* Live session count badge */}
          <div className="p-3 rounded-xl bg-accent-soft border border-accent/20 flex items-center gap-2.5 text-xs text-accent">
            <Icon n="calendar" size={16} className="shrink-0" />
            <div>
              <p className="font-semibold">
                {tx('Барлығы {0} этюд сабағы жоспарланады', totalSessions)}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                {fmtDate(dateFrom)} — {fmtDate(dateTo)} · {tx('Мектеп демалыстарында сабақ өткізілмейді')}
              </p>
            </div>
          </div>
        </div>

        {/* Place */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-muted">{tx('Өтетін орны (кабинет)')}</label>
          <input
            type="text"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className={inputCls}
            placeholder={tx('{0} сыныбы', className)}
          />
        </div>

        {/* Description / Notes */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-muted">{tx('Сипаттамасы мен мақсаты')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${inputCls} py-2 h-auto text-xs`}
            placeholder={tx('Сыныптың кешкі өзіндік дайындығы...')}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between border-t border-line pt-3 mt-1">
          {existing ? (
            <Button
              kind="danger"
              type="button"
              onClick={handleDelete}
              disabled={busy || deleting}
              loading={deleting}
            >
              {tx('Жоспарды жою')}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button kind="secondary" type="button" onClick={onClose} disabled={busy || deleting}>
              {tx('Бас тарту')}
            </Button>
            <Button kind="primary" type="submit" loading={busy} disabled={deleting}>
              {existing ? tx('Сақтау') : tx('Жоспар қосу')}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}
