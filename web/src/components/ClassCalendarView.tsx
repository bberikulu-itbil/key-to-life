import { useMemo, useState } from 'react'
import {
  MONTHS, WD_SHORT, addDays, fmtDate, iso, isoDow, today,
} from '../lib/time'
import { getKazakhstanHolidays } from '../lib/holidays'
import { Icon, Sheet } from './ui'
import { tx } from '../lib/i18n'
import type { CalAudience, ClassEvent, ClassEventStatus, ClassPhoto, EventTypeCode } from '../lib/api'
import { photoUrl } from '../lib/api'
import { ALL_TYPES as ALL_TYPE_DEFS, TYPE_EMOJIS, TYPE_GROUPS as EVENT_GROUPS } from '../lib/eventTypes'

export type CalItem = {
  key: string
  date: string
  kind: 'school' | 'mentor' | 'hour' | 'fun' | 'parents'
  title: string
  note?: string | null
  shown?: boolean
  personal?: boolean
  color?: string
  status?: ClassEventStatus
  types?: EventTypeCode[]
  eventId?: string
  edit?: () => void
  remove?: () => Promise<unknown>
  time?: string
  place?: string | null
  rawEvent?: ClassEvent
  audience?: CalAudience
  isSchoolEvent?: boolean
  /** Personal meetings and birthdays: drawn as a light dot row, not an event bar. */
  reminder?: boolean
}

export type CalViewMode = 'month' | 'week' | 'day' | 'year' | 'agenda'

const dayLabel = (d: string) => `${WD_SHORT[isoDow(d) - 1]}, ${fmtDate(d)}`

const ALL_TYPES: EventTypeCode[] = ALL_TYPE_DEFS.map((x) => x.code)
const TYPE_GROUPS = EVENT_GROUPS.map((g) => ({ id: g.label, label: g.label, icon: g.types[0].emoji, types: g.types.map((x) => x.code) }))

export default function ClassCalendarView({
  items,
  photos,
  onAdd,
  onEdit,
  className = '',
  classTitle,
  typeLabels,
}: {
  items: CalItem[]
  photos: ClassPhoto[]
  onAdd: (date: string) => void
  onEdit: (e: ClassEvent) => void
  className?: string
  classTitle?: string
  typeLabels: Record<EventTypeCode, string>
}) {
  const [view, setView] = useState<CalViewMode>('month')
  const [selectedDay, setSelectedDay] = useState(today())
  const [currentMonth, setCurrentMonth] = useState(() => today().slice(0, 7)) // YYYY-MM
  const [showPhotos, setShowPhotos] = useState(false)
  const [viewPhoto, setViewPhoto] = useState<ClassPhoto | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  // Filters
  const [showHolidays, setShowHolidays] = useState(true)
  const [enabledTypes, setEnabledTypes] = useState<Set<EventTypeCode>>(() => new Set(ALL_TYPES))
  const [openTypeGroups, setOpenTypeGroups] = useState<Set<string>>(() => new Set(['class']))
  const [onlyVisibleToStudents, setOnlyVisibleToStudents] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  // Day detail sheet state (when clicking "+N more" or day in mobile)
  const [inspectDay, setInspectDay] = useState<string | null>(null)

  const [y, m] = currentMonth.split('-').map(Number)

  // Holidays for current year
  const holidays = useMemo(() => {
    if (!showHolidays) return []
    return getKazakhstanHolidays(y)
  }, [showHolidays, y])

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!includeArchived && item.status === 'archived') return false
      if (onlyVisibleToStudents && !item.shown) return false

      // Type filter
      if (item.types && item.types.length > 0) {
        const hasMatchingType = item.types.some((t) => enabledTypes.has(t))
        if (!hasMatchingType) return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchPlace = item.place?.toLowerCase().includes(q) ?? false
        const matchNote = item.note?.toLowerCase().includes(q) ?? false
        if (!matchTitle && !matchPlace && !matchNote) return false
      }

      return true
    })
  }, [items, includeArchived, onlyVisibleToStudents, enabledTypes, searchQuery])

  // Shift current date / month
  const shift = (delta: number) => {
    if (view === 'month' || view === 'agenda') {
      const nextDate = new Date(y, m - 1 + delta, 1)
      const nextMonth = iso(nextDate).slice(0, 7)
      setCurrentMonth(nextMonth)
    } else if (view === 'week') {
      const nextDate = addDays(selectedDay, delta * 7)
      setSelectedDay(nextDate)
      setCurrentMonth(nextDate.slice(0, 7))
    } else if (view === 'day') {
      const nextDate = addDays(selectedDay, delta)
      setSelectedDay(nextDate)
      setCurrentMonth(nextDate.slice(0, 7))
    } else if (view === 'year') {
      const nextYear = y + delta
      setCurrentMonth(`${nextYear}-01`)
    }
  }

  const goToday = () => {
    const t = today()
    setSelectedDay(t)
    setCurrentMonth(t.slice(0, 7))
  }

  // Type toggle helpers
  const toggleType = (type: EventTypeCode) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const selectAllTypes = () => setEnabledTypes(new Set(ALL_TYPES))
  const deselectAllTypes = () => setEnabledTypes(new Set())
  const toggleTypeGroup = (types: EventTypeCode[]) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      const allOn = types.every((type) => next.has(type))
      types.forEach((type) => allOn ? next.delete(type) : next.add(type))
      return next
    })
  }

  // Header Title
  const headerTitle = useMemo(() => {
    if (view === 'year') return `${y} ${tx('жыл')}`
    if (view === 'month' || view === 'agenda') {
      return `${MONTHS[m - 1]} ${y}`
    }
    if (view === 'week') {
      const mon = addDays(selectedDay, 1 - isoDow(selectedDay))
      const sun = addDays(mon, 6)
      return `${fmtDate(mon)} – ${fmtDate(sun)}`
    }
    return `${fmtDate(selectedDay)}, ${y}`
  }, [view, y, m, selectedDay])

  return (
    <div className={`bg-surface rounded-2xl shadow-card border border-line overflow-hidden ${className}`}>
      {/* Top Bar / Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 border-b border-line bg-surface">
        {/* Left: Sidebar Toggle, Add Button, Month & Year */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            title={tx('Сүзгілер')}
            aria-label={tx('Сүзгілер')}
            onClick={() => setShowSidebar(!showSidebar)}
            className={`size-10 grid place-items-center rounded-xl border transition ${
              showSidebar ? 'bg-accent-soft text-accent border-accent/30' : 'bg-surface-2 hover:bg-surface border-line text-muted'
            }`}
          >
            <Icon n="filter" size={18} />
          </button>

          <button
            type="button"
            title={tx('Оқиға қосу')}
            aria-label={tx('Оқиға қосу')}
            onClick={() => onAdd(selectedDay)}
            className="size-10 rounded-xl bg-accent hover:opacity-90 active:scale-95 text-on-accent grid place-items-center shadow-card font-bold transition"
          >
            <Icon n="plus" size={20} />
          </button>

          <h2 className="text-xl sm:text-2xl font-bold font-display tracking-tight capitalize truncate text-ink">
            {headerTitle}
          </h2>
        </div>

        {/* Right: Switcher, Nav (Prev, Today, Next), Search */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* View Mode Switcher Pills: Day, Week, Month, Year, Agenda/List */}
          <div className="flex items-center bg-surface-2 p-1 rounded-xl border border-line text-xs font-semibold overflow-x-auto">
            {(['day', 'week', 'month', 'year', 'agenda'] as CalViewMode[]).map((v) => {
              const active = view === v
              const labels: Record<CalViewMode, string> = {
                day: tx('Күн'),
                week: tx('Апта'),
                month: tx('Ай'),
                year: tx('Жыл'),
                agenda: tx('Тізім'),
              }
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`h-8 px-2.5 sm:px-3 rounded-lg transition shrink-0 ${
                    active ? 'bg-surface text-ink shadow-xs font-bold' : 'text-muted hover:text-ink'
                  }`}
                >
                  {labels[v]}
                </button>
              )
            })}
          </div>

          {/* Navigation Controls (< Today >) */}
          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line">
            <button
              type="button"
              aria-label={tx('Алдыңғы')}
              onClick={() => shift(-1)}
              className="size-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface transition"
            >
              <Icon n="back" size={16} />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="h-8 px-2.5 text-xs font-semibold rounded-lg text-ink hover:bg-surface transition"
            >
              {tx('Бүгін')}
            </button>
            <button
              type="button"
              aria-label={tx('Келесі')}
              onClick={() => shift(1)}
              className="size-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-surface transition"
            >
              <Icon n="chev" size={16} />
            </button>
          </div>

          {/* Search Toggle */}
          <button
            type="button"
            title={tx('Іздеу')}
            aria-label={tx('Іздеу')}
            onClick={() => setIsSearching(!isSearching)}
            className={`size-10 grid place-items-center rounded-xl border transition ${
              isSearching ? 'bg-accent-soft text-accent border-accent/30' : 'bg-surface-2 hover:bg-surface border-line text-muted'
            }`}
          >
            <Icon n="search" size={18} />
          </button>
        </div>
      </div>

      {/* Optional Search Bar Row */}
      {isSearching && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-2 border-b border-line animate-in fade-in duration-200">
          <Icon n="search" size={16} className="text-muted shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tx('Оқиға атауы, орын, түсініктеме бойынша іздеу...')}
            autoFocus
            className="flex-1 bg-transparent text-sm text-ink outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="size-6 grid place-items-center text-muted hover:text-ink"
              aria-label={tx('Тазалау')}
            >
              <Icon n="x" size={14} />
            </button>
          )}
        </div>
      )}

      {/* Main Calendar Body: Left Sidebar + Calendar View Area */}
      <div className="flex flex-col lg:flex-row min-h-[640px]">
        {/* Left Sidebar */}
        {showSidebar && (
          <aside className="w-full lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-surface-2/40 p-4 flex flex-col gap-5">
            {/* Header info */}
            <div>
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-accent" />
                <h3 className="font-semibold text-sm truncate text-ink">{classTitle ?? tx('Сынып күнтізбесі')}</h3>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {tx('{0} оқиға белсенді', filteredItems.length)}
              </p>
            </div>

            {/* Calendar Categories / Checkboxes */}
            <div className="grid gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  {tx('Санаттар')}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllTypes}
                    className="text-accent hover:underline text-[11px] font-medium"
                  >
                    {tx('Барлығы')}
                  </button>
                  <span className="text-muted/40">·</span>
                  <button
                    type="button"
                    onClick={deselectAllTypes}
                    className="text-muted hover:text-ink text-[11px]"
                  >
                    {tx('Тазалау')}
                  </button>
                </div>
              </div>

              {/* Kazakhstan Holidays Checkbox */}
              <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer hover:bg-surface-2 p-1.5 rounded-lg transition">
                <input
                  type="checkbox"
                  checked={showHolidays}
                  onChange={(e) => setShowHolidays(e.target.checked)}
                  className="size-4 rounded accent-emerald-500 cursor-pointer"
                />
                <span className="size-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-medium truncate flex-1">{tx('Қазақстандағы мерекелер')}</span>
              </label>

              {/* Photo Album Checkbox */}
              <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer hover:bg-surface-2 p-1.5 rounded-lg transition">
                <input
                  type="checkbox"
                  checked={showPhotos}
                  onChange={(e) => setShowPhotos(e.target.checked)}
                  className="size-4 rounded accent-pink-500 cursor-pointer"
                />
                <span className="size-2.5 rounded-full bg-pink-500 shrink-0" />
                <span className="font-medium truncate flex-1">{tx('Фотоальбом')}</span>
                {photos.length > 0 && (
                  <span className="text-[11px] text-muted tabular-nums">({photos.length})</span>
                )}
              </label>

              {/* Compact grouped event type filters */}
              <div className="grid gap-1.5">
                {TYPE_GROUPS.map((group) => {
                  const selected = group.types.filter((type) => enabledTypes.has(type)).length
                  const open = openTypeGroups.has(group.id)
                  return (
                    <div key={group.id} className="rounded-lg border border-line bg-surface overflow-hidden">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setOpenTypeGroups((prev) => { const next = new Set(prev); if (open) next.delete(group.id); else next.add(group.id); return next })} className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left hover:bg-surface-2">
                          <span>{group.icon}</span><span className="font-semibold text-xs truncate flex-1">{group.label}</span><span className="text-[10px] text-muted tabular-nums">{selected}/{group.types.length}</span><Icon n="chev" size={13} className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                        </button>
                        <button type="button" onClick={() => toggleTypeGroup(group.types)} className="px-2 text-[10px] text-accent font-semibold hover:underline">{selected === group.types.length ? tx('Алу') : tx('Бәрі')}</button>
                      </div>
                      {open && <div className="grid grid-cols-2 gap-1 px-2 pb-2 border-t border-line pt-1.5">{group.types.map((code) => {
                        const checked = enabledTypes.has(code)
                        return <label key={code} className="flex items-center gap-1.5 min-w-0 text-[11px] text-ink cursor-pointer rounded px-1 py-1 hover:bg-surface-2"><input type="checkbox" checked={checked} onChange={() => toggleType(code)} className="size-3.5 rounded accent-accent cursor-pointer" /><span>{TYPE_EMOJIS[code]}</span><span className="truncate">{typeLabels[code] ?? code}</span></label>
                      })}</div>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick Filters */}
            <div className="grid gap-1.5 pt-2 border-t border-line">
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-ink p-1">
                <input
                  type="checkbox"
                  checked={onlyVisibleToStudents}
                  onChange={(e) => setOnlyVisibleToStudents(e.target.checked)}
                  className="size-4 rounded accent-accent cursor-pointer"
                />
                <span>{tx('Оқушыларға көрінетін')}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-ink p-1">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="size-4 rounded accent-accent cursor-pointer"
                />
                <span>{tx('Мұрағаттағы оқиғалар')}</span>
              </label>
            </div>

            {/* Mini Month Calendar */}
            <div className="mt-auto pt-3 border-t border-line">
              <MiniMonth
                month={currentMonth}
                selectedDay={selectedDay}
                onSelect={(d) => {
                  setSelectedDay(d)
                  setCurrentMonth(d.slice(0, 7))
                  if (view === 'year') setView('month')
                }}
                items={filteredItems}
                onShiftMonth={(delta) => {
                  const [my, mm] = currentMonth.split('-').map(Number)
                  const n = new Date(my, mm - 1 + delta, 1)
                  setCurrentMonth(iso(n).slice(0, 7))
                }}
              />
            </div>
          </aside>
        )}

        {/* View Grid Area */}
        <div className="flex-1 min-w-0 p-3 sm:p-4 overflow-x-auto">
          {view === 'month' && (
            <MonthGrid
              month={currentMonth}
              selectedDay={selectedDay}
              items={filteredItems}
              holidays={holidays}
              photos={photos}
              showPhotos={showPhotos}
              onSelectDay={(d) => setSelectedDay(d)}
              onAddEvent={onAdd}
              onEditEvent={onEdit}
              onInspectDay={(d) => setInspectDay(d)}
              onViewPhoto={(p) => setViewPhoto(p)}
            />
          )}

          {view === 'week' && (
            <WeekGrid
              day={selectedDay}
              items={filteredItems}
              holidays={holidays}
              photos={photos}
              showPhotos={showPhotos}
              onAddEvent={onAdd}
              onEditEvent={onEdit}
              onInspectDay={(d) => setInspectDay(d)}
              onViewPhoto={(p) => setViewPhoto(p)}
            />
          )}

          {view === 'day' && (
            <DayView
              day={selectedDay}
              items={filteredItems}
              holidays={holidays}
              photos={photos}
              onAddEvent={onAdd}
              onEditEvent={onEdit}
              onViewPhoto={(p) => setViewPhoto(p)}
            />
          )}

          {view === 'year' && (
            <YearGrid
              year={y}
              items={filteredItems}
              onSelectMonth={(targetMonth) => {
                setCurrentMonth(targetMonth)
                setView('month')
              }}
            />
          )}

          {view === 'agenda' && (
            <AgendaGrid
              month={currentMonth}
              items={filteredItems}
              photos={photos}
              showPhotos={showPhotos}
              onEditEvent={onEdit}
              onInspectDay={(d) => setInspectDay(d)}
              onViewPhoto={(p) => setViewPhoto(p)}
            />
          )}
        </div>
      </div>

      {/* Inspect Day Sheet (Opened from "+N more" or Day tap) */}
      {inspectDay && (
        <Sheet
          title={`${fmtDate(inspectDay)}, ${inspectDay.slice(0, 4)}`}
          onClose={() => setInspectDay(null)}
        >
          <div className="grid gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-sm font-semibold text-muted">
                {tx('{0} оқиға белгіленген', filteredItems.filter((i) => i.date === inspectDay).length)}
              </span>
              <button
                type="button"
                onClick={() => {
                  const d = inspectDay
                  setInspectDay(null)
                  onAdd(d)
                }}
                className="h-8 px-3 rounded-md bg-accent text-on-accent text-xs font-semibold flex items-center gap-1.5"
              >
                <Icon n="plus" size={14} />
                {tx('Оқиға қосу')}
              </button>
            </div>

            {/* List all items */}
            {filteredItems.filter((i) => i.date === inspectDay).length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">{tx('Бұл күні жазба жоқ.')}</p>
            ) : (
              <div className="grid gap-2">
                {filteredItems
                  .filter((i) => i.date === inspectDay)
                  .map((item) => (
                    <div
                      key={item.key}
                      className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 border border-line"
                    >
                      <span
                        className="size-3 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: item.color ?? '#6b7280' }}
                      />
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-ink">{item.title}</span>
                          {item.time && (
                            <span className="text-xs text-muted tabular-nums">· {item.time}</span>
                          )}
                          {item.audience && item.audience !== 'all' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-soft text-accent font-medium">
                              {item.audience === 'students' ? '🎓 ' + tx('Оқушылар')
                               : item.audience === 'teachers' ? '👨‍🏫 ' + tx('Мұғалімдер')
                               : item.audience === 'tutors' ? '🏠 ' + tx('Тәрбиешілер')
                               : '💼 ' + tx('Ұстаздар')}
                            </span>
                          )}
                          {item.isSchoolEvent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                              🏛️ {tx('Мектеп')}
                            </span>
                          )}
                        </div>
                        {item.place && (
                          <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                            <Icon n="pin" size={12} />
                            {item.place}
                          </p>
                        )}
                        {item.note && (
                          <p className="text-xs text-muted mt-1 whitespace-pre-line">{item.note}</p>
                        )}
                      </div>
                      {item.rawEvent && (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectDay(null)
                            onEdit(item.rawEvent!)
                          }}
                          className="h-8 px-2.5 rounded-md bg-surface text-xs font-semibold text-accent hover:bg-surface-2 border border-line"
                        >
                          {tx('Өзгерту')}
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {photos.filter((p) => p.on_date === inspectDay).length > 0 && (
              <div className="pt-2 border-t border-line">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 block">
                  {tx('Осы күннің фотосуреттері ({0})', photos.filter((p) => p.on_date === inspectDay).length)}
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.filter((p) => p.on_date === inspectDay).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setViewPhoto(p)}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-line"
                    >
                      <img
                        src={photoUrl(p.path)}
                        alt={p.caption ?? ''}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                      {p.caption && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate text-left">
                          {p.caption}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {/* Lightbox / Fullscreen Photo Viewer */}
      {viewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 grid grid-rows-[1fr_auto] p-4 gap-3 animate-in fade-in duration-150"
          onClick={() => setViewPhoto(null)}
          role="dialog"
          aria-label={tx('Сурет')}
        >
          <img
            src={photoUrl(viewPhoto.path)}
            alt={viewPhoto.caption ?? ''}
            className="m-auto max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
          <div
            className="flex items-center gap-3 text-white max-w-2xl mx-auto w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="flex-1 min-w-0">
              {viewPhoto.caption && (
                <span className="block text-sm font-semibold truncate">{viewPhoto.caption}</span>
              )}
              <span className="block text-xs opacity-70">{fmtDate(viewPhoto.on_date)}</span>
            </span>
            <button
              type="button"
              onClick={() => setViewPhoto(null)}
              aria-label={tx('Жабу')}
              className="size-10 grid place-items-center rounded-lg bg-white/15 hover:bg-white/25 text-white"
            >
              <Icon n="x" size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   1. Month Grid (Matching the uploaded Apple / Google Calendar design)
   ========================================================================= */

function MonthGrid({
  month,
  selectedDay,
  items,
  holidays,
  photos,
  showPhotos,
  onSelectDay,
  onAddEvent,
  onEditEvent,
  onInspectDay,
  onViewPhoto,
}: {
  month: string
  selectedDay: string
  items: CalItem[]
  holidays: { date: string; name: string; color: string }[]
  photos: ClassPhoto[]
  showPhotos?: boolean
  onSelectDay: (d: string) => void
  onAddEvent: (d: string) => void
  onEditEvent: (e: ClassEvent) => void
  onInspectDay: (d: string) => void
  onViewPhoto?: (p: ClassPhoto) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const firstDow = isoDow(`${month}-01`) // 1..7 (Mon..Sun)
  const daysInMonth = new Date(y, m, 0).getDate()
  const totalCells = firstDow - 1 + daysInMonth > 35 ? 42 : 35
  const startDate = addDays(`${month}-01`, 1 - firstDow)
  const cells = Array.from({ length: totalCells }, (_, i) => addDays(startDate, i))

  const todayStr = today()

  return (
    <div
      className="grid grid-cols-7 border-t border-l border-line rounded-xl overflow-hidden bg-surface"
      style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
    >
      {/* Weekday Headers */}
      {WD_SHORT.map((wd) => (
        <div
          key={wd}
          className="py-2.5 text-center text-xs font-semibold text-muted bg-surface-2/60 border-r border-b border-line"
        >
          {wd}
        </div>
      ))}

      {/* 35 or 42 Day Cells */}
      {cells.map((c) => {
        const isCurrentMonth = c.startsWith(month)
        const isToday = c === todayStr
        const isSelected = c === selectedDay
        const dayNumber = Number(c.slice(8))
        const isFirstOfMonth = dayNumber === 1

        const dayItems = items.filter((i) => i.date === c)
        const dayHolidays = holidays.filter((h) => h.date === c)
        const dayPics = photos.filter((p) => p.on_date === c)

        const totalEntries = dayItems.length + dayHolidays.length
        const maxVisible = 3
        const overflow = totalEntries - maxVisible

        return (
          <div
            key={c}
            onClick={() => onSelectDay(c)}
            className={`group relative min-h-[110px] sm:min-h-[125px] xl:min-h-[135px] p-1.5 sm:p-2 border-r border-b border-line transition flex flex-col justify-between cursor-pointer ${
              !isCurrentMonth ? 'bg-surface-2/20 text-muted/50' : 'bg-surface text-ink'
            } ${isSelected ? 'ring-2 ring-accent/60 inset-ring' : 'hover:bg-surface-2/40'}`}
          >
            {/* Cell Header: Day Number + Quick Add */}
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className={`tabular-nums text-xs sm:text-sm font-semibold transition ${
                    isToday
                      ? 'size-6 sm:size-7 rounded-full bg-accent text-on-accent grid place-items-center shadow-xs'
                      : isCurrentMonth
                      ? 'text-ink'
                      : 'text-muted/60'
                  }`}
                >
                  {dayNumber}
                </span>
                {isFirstOfMonth && (
                  <span className="text-[11px] font-medium text-muted capitalize truncate">
                    {MONTHS[Number(c.slice(5, 7)) - 1]}
                  </span>
                )}
              </div>

              {/* Hover Quick Add Button */}
              <button
                type="button"
                title={tx('Қосу')}
                aria-label={tx('Қосу')}
                onClick={(e) => {
                  e.stopPropagation()
                  onAddEvent(c)
                }}
                className="size-5 rounded grid place-items-center opacity-0 group-hover:opacity-100 text-muted hover:text-accent hover:bg-accent-soft transition"
              >
                <Icon n="plus" size={13} />
              </button>
            </div>

            {/* Cell Content: Holidays & Event Rows */}
            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
              {/* National Holidays (Green banner pills like in the screenshot) */}
              {dayHolidays.map((h) => (
                <div
                  key={h.name}
                  title={h.name}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 truncate shadow-2xs"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate flex-1">{h.name}</span>
                </div>
              ))}

              {/* Event Rows (Google Calendar style: solid banner for all-day/school, dot + time + title for timed) */}
              {dayItems.slice(0, maxVisible - dayHolidays.length).map((i) => {
                const typeCode = (i.types ?? [])[0]
                const emoji = typeCode ? TYPE_EMOJIS[typeCode] : null
                const isBanner = !i.reminder && (i.kind === 'school' || !i.time)

                if (isBanner) {
                  return (
                    <button
                      key={i.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (i.rawEvent) onEditEvent(i.rawEvent)
                        else onInspectDay(c)
                      }}
                      className="w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white shadow-2xs transition hover:brightness-95 truncate"
                      style={{ backgroundColor: i.color ?? '#2563eb' }}
                    >
                      {emoji && <span className="text-[10px] shrink-0">{emoji}</span>}
                      <span className="truncate flex-1">{i.title}</span>
                    </button>
                  )
                }

                return (
                  <button
                    key={i.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (i.rawEvent) onEditEvent(i.rawEvent)
                      else onInspectDay(c)
                    }}
                    className="w-full text-left flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-surface-2 transition truncate text-[11px]"
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: i.color ?? '#2563eb' }}
                    />
                    {i.time && !i.reminder && (
                      <span className="text-[10px] text-muted tabular-nums shrink-0 font-medium">
                        {i.time}
                      </span>
                    )}
                    <span className="font-medium truncate flex-1 flex items-center gap-1 text-ink">
                      {emoji && <span className="text-[10px] shrink-0">{emoji}</span>}
                      <span className="truncate">{i.title}</span>
                    </span>
                  </button>
                )
              })}

              {/* Overflow link: "Тағы {N}" (Google Calendar Image 2) */}
              {overflow > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onInspectDay(c)
                  }}
                  className="text-left text-[11px] font-bold text-muted hover:text-ink hover:underline px-1 py-0.5 mt-auto"
                >
                  {tx('Тағы {0}', overflow)}
                </button>
              )}
            </div>

            {/* Bottom thumbnail or photo badge if showPhotos is checked */}
            {showPhotos && dayPics.length > 0 && (
              // 1 photo fills the strip, 2+ split it in half; the rest shows as «+N».
              <div className={`mt-auto pt-1 grid gap-0.5 h-16 sm:h-20 ${dayPics.length > 1 ? 'grid-cols-2' : ''}`}>
                {dayPics.slice(0, 2).map((p, k) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (onViewPhoto) onViewPhoto(p); else onInspectDay(c) }}
                    aria-label={p.caption ?? tx('{0} фото', dayPics.length)}
                    className="relative min-w-0 overflow-hidden rounded-md bg-surface-2"
                  >
                    <img src={photoUrl(p.path)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    {k === 1 && dayPics.length > 2 && <span className="absolute inset-0 grid place-items-center bg-black/45 text-white text-xs font-semibold">+{dayPics.length - 2}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* =========================================================================
   2. Week Grid View
   ========================================================================= */

function WeekGrid({
  day,
  items,
  holidays,
  photos,
  showPhotos,
  onAddEvent,
  onEditEvent,
  onInspectDay,
  onViewPhoto,
}: {
  day: string
  items: CalItem[]
  holidays: { date: string; name: string; color: string }[]
  photos: ClassPhoto[]
  showPhotos?: boolean
  onAddEvent: (d: string) => void
  onEditEvent: (e: ClassEvent) => void
  onInspectDay?: (d: string) => void
  onViewPhoto?: (p: ClassPhoto) => void
}) {
  const mon = addDays(day, 1 - isoDow(day))
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const todayStr = today()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 border-t border-l border-line rounded-xl overflow-hidden bg-surface">
      {weekDays.map((d, index) => {
        const isToday = d === todayStr
        const dayNumber = Number(d.slice(8))
        const dayItems = items.filter((i) => i.date === d)
        const dayHolidays = holidays.filter((h) => h.date === d)
        const dayPics = photos.filter((p) => p.on_date === d)

        return (
          <div
            key={d}
            className="border-r border-b border-line min-h-[380px] sm:min-h-[500px] flex flex-col bg-surface p-2"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-line mb-2">
              <div>
                <span className="text-[11px] font-bold text-muted block uppercase">
                  {WD_SHORT[index]}
                </span>
                <span
                  className={`tabular-nums text-base font-bold inline-block ${
                    isToday ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {dayNumber} {MONTHS[Number(d.slice(5, 7)) - 1]}
                </span>
              </div>
              <button
                type="button"
                title={tx('Оқиға қосу')}
                aria-label={tx('Оқиға қосу')}
                onClick={() => onAddEvent(d)}
                className="size-7 rounded-md grid place-items-center text-muted hover:text-accent hover:bg-accent-soft transition"
              >
                <Icon n="plus" size={15} />
              </button>
            </div>

            {/* Photo thumbnails if showPhotos */}
            {showPhotos && dayPics.length > 0 && (
              <div
                onClick={() => {
                  if (onViewPhoto && dayPics[0]) onViewPhoto(dayPics[0])
                  else if (onInspectDay) onInspectDay(d)
                }}
                className="flex items-center gap-1.5 p-1 rounded-md bg-pink-500/10 text-pink-700 dark:text-pink-300 border border-pink-500/20 text-[11px] font-semibold hover:bg-pink-500/20 transition cursor-pointer mb-1.5 truncate"
              >
                <span className="text-[10px]">📷</span>
                <span className="truncate flex-1">{tx('{0} фото', dayPics.length)}</span>
                <div className="flex -space-x-1 shrink-0">
                  {dayPics.slice(0, 3).map((p) => (
                    <img
                      key={p.id}
                      src={photoUrl(p.path)}
                      alt=""
                      className="size-4 rounded-full object-cover ring-1 ring-white"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* List */}
            <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
              {dayHolidays.map((h) => (
                <div
                  key={h.name}
                  className="px-2 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25"
                >
                  {h.name}
                </div>
              ))}

              {dayItems.map((i) => {
                const typeCode = (i.types ?? [])[0]
                const emoji = typeCode ? TYPE_EMOJIS[typeCode] : null
                if (i.reminder) return <ReminderRow key={i.key} i={i} emoji={emoji} onClick={() => { if (i.rawEvent) onEditEvent(i.rawEvent) }} />
                return (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => {
                      if (i.rawEvent) onEditEvent(i.rawEvent)
                    }}
                    className="w-full text-left p-2 rounded-lg bg-surface-2 hover:bg-surface border-l-[3px] border border-line shadow-2xs transition grid gap-0.5"
                    style={{ borderColor: i.color ?? '#2563eb' }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-ink truncate flex items-center gap-1">
                        {emoji && <span>{emoji}</span>}
                        {i.title}
                      </span>
                      {i.time && (
                        <span className="text-[10px] text-muted tabular-nums shrink-0">
                          {i.time}
                        </span>
                      )}
                    </div>
                    {i.place && (
                      <span className="text-[10px] text-muted truncate flex items-center gap-1">
                        <Icon n="pin" size={10} />
                        {i.place}
                      </span>
                    )}
                  </button>
                )
              })}

              {dayItems.length === 0 && dayHolidays.length === 0 && (
                <span className="text-xs text-muted/60 py-4 text-center block">
                  {tx('Оқиға жоқ')}
                </span>
              )}
            </div>

            {dayPics.length > 0 && (
              <div className="pt-2 border-t border-line text-[11px] text-muted flex items-center gap-1">
                <span className="size-2 rounded-full bg-accent" />
                <span>{tx('{0} фотосурет', dayPics.length)}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* =========================================================================
   3. Day View
   ========================================================================= */

function DayView({
  day,
  items,
  holidays,
  photos,
  onAddEvent,
  onEditEvent,
  onViewPhoto,
}: {
  day: string
  items: CalItem[]
  holidays: { date: string; name: string; color: string }[]
  photos: ClassPhoto[]
  onAddEvent: (d: string) => void
  onEditEvent: (e: ClassEvent) => void
  onViewPhoto?: (p: ClassPhoto) => void
}) {
  const dayItems = items.filter((i) => i.date === day)
  const dayHolidays = holidays.filter((h) => h.date === day)
  const dayPics = photos.filter((p) => p.on_date === day)

  return (
    <div className="max-w-2xl mx-auto grid gap-4 p-2 sm:p-4">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div>
          <h3 className="text-lg font-bold text-ink">{fmtDate(day)}, {day.slice(0, 4)}</h3>
          <p className="text-xs text-muted">
            {tx('{0} іс-шара мен жазба', dayItems.length + dayHolidays.length)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAddEvent(day)}
          className="h-10 px-4 rounded-xl bg-accent text-on-accent text-sm font-semibold flex items-center gap-2 shadow-card"
        >
          <Icon n="plus" size={16} />
          {tx('Оқиға қосу')}
        </button>
      </div>

      {dayHolidays.map((h) => (
        <div
          key={h.name}
          className="p-3 rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 font-semibold text-sm flex items-center gap-2"
        >
          <span className="size-2.5 rounded-full bg-emerald-500" />
          {h.name}
        </div>
      ))}

      {dayItems.length === 0 ? (
        <div className="p-8 text-center text-muted border border-dashed border-line rounded-xl">
          <p className="font-medium text-sm">{tx('Бұл күні жоспарланған оқиға жоқ')}</p>
          <button
            type="button"
            onClick={() => onAddEvent(day)}
            className="mt-3 text-xs text-accent font-semibold hover:underline"
          >
            {tx('+ Жаңа оқиға қосу')}
          </button>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {dayItems.map((i) => {
            const typeCode = (i.types ?? [])[0]
            const emoji = typeCode ? TYPE_EMOJIS[typeCode] : null
            if (i.reminder) return <ReminderRow key={i.key} i={i} emoji={emoji} large onClick={() => { if (i.rawEvent) onEditEvent(i.rawEvent) }} />
            return (
              <div
                key={i.key}
                className="p-3.5 rounded-xl bg-surface border-l-4 border border-line shadow-card flex items-start justify-between gap-3"
                style={{ borderLeftColor: i.color ?? '#2563eb' }}
              >
                <div className="grid gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-ink flex items-center gap-1.5">
                      {emoji && <span>{emoji}</span>}
                      {i.title}
                    </span>
                    {i.time && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-surface-2 text-muted tabular-nums font-semibold">
                        {i.time}
                      </span>
                    )}
                  </div>
                  {i.place && (
                    <p className="text-xs text-muted flex items-center gap-1">
                      <Icon n="pin" size={13} />
                      {i.place}
                    </p>
                  )}
                  {i.note && <p className="text-xs text-muted mt-1 whitespace-pre-line">{i.note}</p>}
                </div>
                {i.rawEvent && (
                  <button
                    type="button"
                    onClick={() => onEditEvent(i.rawEvent!)}
                    className="h-8 px-3 rounded-lg bg-surface-2 hover:bg-surface border border-line text-xs font-semibold text-accent"
                  >
                    {tx('Өзгерту')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dayPics.length > 0 && (
        <div className="pt-3 border-t border-line">
          <h4 className="text-xs font-semibold uppercase text-muted mb-2">
            {tx('Осы күннің фотосуреттері ({0})', dayPics.length)}
          </h4>
          <div className="grid grid-cols-4 gap-2">
            {dayPics.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onViewPhoto && onViewPhoto(p)}
                className="aspect-square rounded-lg overflow-hidden border border-line group relative"
              >
                <img
                  src={photoUrl(p.path)}
                  alt={p.caption ?? ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   3b. Agenda / List View
   ========================================================================= */

function AgendaGrid({
  month,
  items,
  photos,
  showPhotos,
  onEditEvent,
  onInspectDay,
  onViewPhoto,
}: {
  month: string
  items: CalItem[]
  photos: ClassPhoto[]
  showPhotos: boolean
  onEditEvent: (e: ClassEvent) => void
  onInspectDay: (d: string) => void
  onViewPhoto: (p: ClassPhoto) => void
}) {
  const monthItems = items.filter((i) => i.date.startsWith(month))
  const monthPhotos = photos.filter((p) => p.on_date.startsWith(month))
  const days = [...new Set([...monthItems.map((i) => i.date), ...(showPhotos ? monthPhotos.map((p) => p.on_date) : [])])].sort().reverse()
  const todayStr = today()

  if (!days.length) {
    return (
      <div className="p-8 max-w-md mx-auto text-center border border-dashed border-line rounded-2xl bg-surface">
        <p className="font-semibold text-ink mb-1">{tx('Бұл айда оқиғалар жоқ')}</p>
        <p className="text-xs text-muted">{tx('Жоғарғы «+» батырмасы арқылы жаңа оқиға қосыңыз.')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto grid gap-3.5">
      {days.map((d) => {
        const dayItems = monthItems.filter((i) => i.date === d)
        const dayPics = monthPhotos.filter((p) => p.on_date === d)
        const isToday = d === todayStr
        return (
          <div key={d} className="rounded-xl bg-surface border border-line p-3 sm:p-4 shadow-2xs grid gap-2.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className={`text-sm font-bold ${isToday ? 'text-accent' : 'text-ink'}`}>
                {isToday ? `${tx('Бүгін')} · ${dayLabel(d)}` : dayLabel(d)}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {dayItems.length > 0 && tx('{0} оқиға', dayItems.length)}
                {dayItems.length > 0 && showPhotos && dayPics.length > 0 && ' · '}
                {showPhotos && dayPics.length > 0 && tx('{0} фото', dayPics.length)}
              </span>
            </div>

            {dayItems.length > 0 && (
              <div className="grid gap-1.5">
                {dayItems.map((i) => (
                  <div
                    key={i.key}
                    onClick={() => {
                      if (i.rawEvent) onEditEvent(i.rawEvent)
                      else onInspectDay(d)
                    }}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-2 transition cursor-pointer border border-line/60 bg-surface-2/20"
                  >
                    <span className="size-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: i.color ?? '#2563eb' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-ink">{i.title}</span>
                        {i.place && <span className="text-xs text-muted">📍 {i.place}</span>}
                        {i.time && <span className="text-xs text-muted tabular-nums">⏰ {i.time}</span>}
                      </div>
                      {i.note && <p className="text-xs text-muted mt-1 whitespace-pre-line">{i.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showPhotos && dayPics.length > 0 && (
              <div className="pt-2 border-t border-line/50">
                <div className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
                  <span className="text-pink-500">📷</span>
                  <span>{tx('Осы күннің суреттері')} ({dayPics.length})</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {dayPics.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onViewPhoto(p)}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-line hover:ring-2 hover:ring-accent transition"
                    >
                      <img
                        src={photoUrl(p.path)}
                        alt={p.caption ?? ''}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        loading="lazy"
                      />
                      {p.caption && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate text-left">
                          {p.caption}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* =========================================================================
   4. Year Grid View
   ========================================================================= */

function YearGrid({
  year,
  items,
  onSelectMonth,
}: {
  year: number
  items: CalItem[]
  onSelectMonth: (month: string) => void
}) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-2 sm:p-4">
      {months.map((mm) => {
        const monthStr = `${year}-${String(mm).padStart(2, '0')}`
        const monthItems = items.filter((i) => i.date.startsWith(monthStr))
        return (
          <button
            key={monthStr}
            type="button"
            onClick={() => onSelectMonth(monthStr)}
            className="p-3.5 rounded-xl bg-surface hover:bg-surface-2 border border-line shadow-card text-left transition hover:scale-[1.01]"
          >
            <div className="flex items-center justify-between pb-2 border-b border-line mb-2">
              <span className="font-bold text-sm text-ink capitalize">{MONTHS[mm - 1]}</span>
              <span className="text-[11px] font-semibold text-accent tabular-nums">
                {monthItems.length ? tx('{0} оқиға', monthItems.length) : '—'}
              </span>
            </div>
            <MiniMonth month={monthStr} items={monthItems} readOnly />
          </button>
        )
      })}
    </div>
  )
}

/* =========================================================================
   5. Mini Month Component (Sidebar & Year View)
   ========================================================================= */

function MiniMonth({
  month,
  selectedDay,
  onSelect,
  items = [],
  onShiftMonth,
  readOnly = false,
}: {
  month: string
  selectedDay?: string
  onSelect?: (d: string) => void
  items?: CalItem[]
  onShiftMonth?: (delta: number) => void
  readOnly?: boolean
}) {
  const [y, m] = month.split('-').map(Number)
  const firstDow = isoDow(`${month}-01`)
  const daysInMonth = new Date(y, m, 0).getDate()
  const totalCells = firstDow - 1 + daysInMonth > 35 ? 42 : 35
  const startDate = addDays(`${month}-01`, 1 - firstDow)
  const cells = Array.from({ length: totalCells }, (_, i) => addDays(startDate, i))
  const todayStr = today()

  return (
    <div className="text-center">
      {!readOnly && (
        <div className="flex items-center justify-between mb-2 px-1">
          <button
            type="button"
            onClick={() => onShiftMonth?.(-1)}
            aria-label={tx('Алдыңғы ай')}
            className="size-6 grid place-items-center rounded hover:bg-surface text-muted"
          >
            <Icon n="back" size={12} />
          </button>
          <span className="text-xs font-bold text-ink capitalize">
            {MONTHS[m - 1]} {y}
          </span>
          <button
            type="button"
            onClick={() => onShiftMonth?.(1)}
            aria-label={tx('Келесі ай')}
            className="size-6 grid place-items-center rounded hover:bg-surface text-muted"
          >
            <Icon n="chev" size={12} />
          </button>
        </div>
      )}

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted mb-1 font-medium">
        {WD_SHORT.map((w) => (
          <span key={w}>{w.slice(0, 2)}</span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const isCur = c.startsWith(month)
          const isTod = c === todayStr
          const isSel = c === selectedDay
          const hasEvents = items.some((i) => i.date === c)
          const num = Number(c.slice(8))

          return (
            <button
              key={c}
              type="button"
              disabled={readOnly}
              onClick={() => onSelect?.(c)}
              className={`size-6 mx-auto grid place-items-center rounded-full text-[10px] tabular-nums transition ${
                isSel
                  ? 'bg-accent text-on-accent font-bold'
                  : isTod
                  ? 'border border-accent text-accent font-bold'
                  : isCur
                  ? 'text-ink hover:bg-surface'
                  : 'text-muted/40'
              }`}
            >
              <span>{num}</span>
              {hasEvents && !isSel && (
                <span className="size-1 rounded-full bg-accent -mt-1" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Personal meeting, home visit, birthday: a light «dot · emoji · title» row instead of an event card. */
function ReminderRow({ i, emoji, large, onClick }: { i: CalItem; emoji: string | null; large?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full text-left flex items-center gap-1.5 rounded hover:bg-surface-2 transition ${large ? 'px-2 py-1.5 text-sm' : 'px-1 py-0.5 text-xs'}`}>
      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: i.color ?? '#2563eb' }} />
      {emoji && <span className="shrink-0">{emoji}</span>}
      <span className="truncate font-medium text-ink">{i.title}</span>
      {large && i.time && <span className="ml-auto text-xs text-muted tabular-nums">{i.time}</span>}
    </button>
  )
}
