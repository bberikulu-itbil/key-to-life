import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addEvents, canEditCalendar, ensureCalendars, errText,
  removeEvent, setHidden, updateEvent,
  type CalAudience, type CalEvent, type Calendar,
} from '../lib/api'
import { loadAgenda, onDay, type Item, type Source } from '../lib/agenda'
import { getKazakhstanHolidays } from '../lib/holidays'
import { parseIcs, toIcs } from '../lib/ics'
import { MONTHS, addDays, fmtDate, iso, today } from '../lib/time'
import { useMe } from '../App'
import { Button, Card, Empty, ErrorBox, Field, Icon, Sheet, Skeleton, inputCls, toast, useLoad } from '../components/ui'
import LocationPicker from '../components/LocationPicker'
import { tx } from '../lib/i18n'

export type CalViewMode = 'month' | 'week' | 'day' | 'year' | 'agenda'

const hhmm = (d: Date) => d.toTimeString().slice(0, 5)

// Weekday headers Sunday to Saturday (matching Google Calendar in Image 2)
const WD_SUNDAY_FIRST = ['ЖС', 'ДС', 'СС', 'СР', 'БС', 'ЖМ', 'СБ']
const WD_MINI = ['Ж', 'Д', 'С', 'С', 'Б', 'Ж', 'С']

const AUDIENCE_LABELS: Record<CalAudience, string> = {
  all: tx('Барлығына (оқушылар мен ұстаздар)'),
  students: tx('Тек оқушыларға'),
  staff: tx('Мұғалімдер мен тәрбиешілерге'),
  teachers: tx('Тек мұғалімдерге'),
  tutors: tx('Тек тәрбиешілерге'),
}

export default function Calendars() {
  const { me } = useMe()
  const isDeputy = me.role === 'deputy' || me.role === 'admin'
  const t = today()
  const classId = new URLSearchParams(location.hash.split('?')[1] ?? '').get('class')

  const [ready, setReady] = useState(false)
  useEffect(() => {
    ensureCalendars().finally(() => setReady(true))
  }, [])

  const [currentMonth, setCurrentMonth] = useState(() => t.slice(0, 7)) // YYYY-MM
  const [selectedDay, setSelectedDay] = useState(t) // YYYY-MM-DD
  const [view, setView] = useState<CalViewMode>('month')
  const [showSidebar, setShowSidebar] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Load agenda for wide range
  const ag = useLoad(
    () => (ready ? loadAgenda(me, addDays(t, -90), addDays(t, 240)) : new Promise<never>(() => {})),
    [ready, me.id, classId]
  )

  // Hidden sources state
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (ag.data?.hidden) {
      setHiddenKeys(new Set(ag.data.hidden))
    }
  }, [ag.data?.hidden])

  // Editable calendars
  const allCals = useMemo(() => (ag.data?.sources ?? []).flatMap((s) => (s.cal ? [s.cal] : [])), [ag.data?.sources])
  const classCal = classId ? allCals.find((c) => c.class_id === classId) : undefined
  const cals = useMemo(() => (classCal ? [classCal] : allCals), [classCal, allCals])

  const can = useLoad(
    async () => (await Promise.all(cals.map((c) => canEditCalendar(c.id)))),
    [cals.map((c) => c.id).join(',')]
  )
  const editable = useMemo(() => cals.filter((_, i) => can.data?.[i]), [cals, can.data])

  // Modals & Sheets
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; date: string; calId?: string } | null>(null)
  const [inspectEvent, setInspectEvent] = useState<Item | null>(null)
  const [inspectDay, setInspectDay] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'import' | 'newcal'>(null)
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null)

  // Toggle calendar source visibility
  const toggleSource = async (key: string) => {
    const isCurrentlyHidden = hiddenKeys.has(key)
    const next = new Set(hiddenKeys)
    if (isCurrentlyHidden) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setHiddenKeys(next)
    try {
      await setHidden(key, !isCurrentlyHidden)
    } catch (e) {
      toast(errText(e))
    }
  }

  // Shift current month/day/week
  const [y, m] = currentMonth.split('-').map(Number)
  const shift = (delta: number) => {
    if (view === 'month') {
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
    const todayStr = today()
    setSelectedDay(todayStr)
    setCurrentMonth(todayStr.slice(0, 7))
  }

  // Filtered items (respecting toggled sources and search query)
  const visibleItems = useMemo(() => {
    const all = ag.data?.all ?? []
    return all.filter((i) => {
      if (hiddenKeys.has(i.src)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = i.title.toLowerCase().includes(q)
        const matchPlace = i.place?.toLowerCase().includes(q) ?? false
        const matchNotes = i.notes?.toLowerCase().includes(q) ?? false
        if (!matchTitle && !matchPlace && !matchNotes) return false
      }
      return true
    })
  }, [ag.data?.all, hiddenKeys, searchQuery])

  // Holidays
  const holidays = useMemo(() => {
    if (hiddenKeys.has('holidays')) return []
    return getKazakhstanHolidays(y)
  }, [hiddenKeys, y])

  // Export ICS
  const exportIcs = () => {
    const ics = toIcs('Lyceum Life', visibleItems.map((i) => ({
      uid: i.key,
      title: i.title,
      start: i.start,
      end: i.end,
      allDay: i.allDay,
      location: i.place ?? undefined,
    })))
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })),
      download: `lyceum-life-${t}.ics`,
    })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(tx('{0} жазба экспортталды', visibleItems.length))
  }

  // Header Title
  const headerTitle = useMemo(() => {
    if (view === 'year') return `${y} ${tx('жыл')}`
    if (view === 'month') {
      return `${y} ж. ${MONTHS[m - 1].toLowerCase()}`
    }
    if (view === 'week') {
      const dayOfWeek = new Date(selectedDay).getDay()
      const sun = addDays(selectedDay, -dayOfWeek)
      const sat = addDays(sun, 6)
      return `${fmtDate(sun)} – ${fmtDate(sat)}`
    }
    return `${fmtDate(selectedDay)}, ${y}`
  }, [view, y, m, selectedDay])

  // Group sources for Google Calendar sidebar: "Күнтізбелерім" vs "Басқа күнтізбелер"
  const { myCalendars, otherCalendars } = useMemo(() => {
    const sources = ag.data?.sources ?? []
    const my: Source[] = []
    const other: Source[] = []

    for (const s of sources) {
      if (s.cal?.kind === 'personal') {
        // Label with user's name like in Image 2 ("Bagdaulet Abdikarim")
        my.push({ ...s, name: me.full_name || s.name })
      } else if (s.cal?.kind === 'class') {
        my.push(s)
      } else if (s.cal?.kind === 'olympiad') {
        my.push(s)
      } else {
        // school, activities, timetable
        other.push(s)
      }
    }

    // Add Holidays as a toggleable source
    other.push({
      key: 'holidays',
      name: tx('ҚР Мерекелері'),
      color: '#10b981',
    })

    return { myCalendars: my, otherCalendars: other }
  }, [ag.data?.sources, me.full_name])

  return (
    <div className="flex flex-col bg-surface rounded-2xl shadow-card border border-line overflow-hidden pb-6">
      {/* 1. Google Calendar Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-line bg-surface">
        {/* Left: Hamburger, App Logo/Date Icon, "Күнтізбе", Today Pill, < >, Month Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            aria-label={tx('Мәзірді жасыру/көрсету')}
            title={tx('Мәзірді жасыру/көрсету')}
            onClick={() => setShowSidebar(!showSidebar)}
            className="size-9 grid place-items-center rounded-xl hover:bg-surface-2 text-muted hover:text-ink transition"
          >
            <Icon n="filter" size={20} />
          </button>

          {/* Calendar Icon Badge + Title (Matching Google Calendar: blue rounded icon with current day) */}
          <div className="flex items-center gap-2 select-none">
            <div className="size-9 rounded-xl bg-blue-600 text-white font-bold flex flex-col items-center justify-center shadow-xs">
              <span className="text-[9px] uppercase font-semibold leading-none opacity-80">
                {MONTHS[Number(t.slice(5, 7)) - 1].slice(0, 3)}
              </span>
              <span className="text-sm font-extrabold leading-tight">
                {Number(t.slice(8))}
              </span>
            </div>
            <span className="hidden sm:inline font-display font-bold text-lg text-ink">
              {tx('Күнтізбе')}
            </span>
          </div>

          {/* Today Button */}
          <button
            type="button"
            onClick={goToday}
            className="h-9 px-3.5 rounded-full border border-line hover:bg-surface-2 text-xs font-semibold text-ink transition shadow-2xs"
          >
            {tx('Бүгін')}
          </button>

          {/* Arrows < > */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label={tx('Алдыңғы')}
              onClick={() => shift(-1)}
              className="size-8 grid place-items-center rounded-full hover:bg-surface-2 text-muted hover:text-ink transition"
            >
              <Icon n="back" size={16} />
            </button>
            <button
              type="button"
              aria-label={tx('Келесі')}
              onClick={() => shift(1)}
              className="size-8 grid place-items-center rounded-full hover:bg-surface-2 text-muted hover:text-ink transition"
            >
              <Icon n="chev" size={16} />
            </button>
          </div>

          {/* Current Month & Year (e.g. "2026 ж. қараша") */}
          <h1 className="text-base sm:text-xl font-bold font-display text-ink truncate capitalize">
            {headerTitle}
          </h1>
        </div>

        {/* Right: Search, View Mode Switcher Dropdown, Import / Export */}
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <button
            type="button"
            aria-label={tx('Іздеу')}
            title={tx('Іздеу')}
            onClick={() => setIsSearching(!isSearching)}
            className={`size-9 grid place-items-center rounded-xl border transition ${
              isSearching ? 'bg-accent-soft text-accent border-accent/30' : 'border-transparent text-muted hover:text-ink hover:bg-surface-2'
            }`}
          >
            <Icon n="search" size={18} />
          </button>

          {/* View Mode Selector Dropdown (Month / Week / Day / Year / Agenda) */}
          <select
            value={view}
            onChange={(e) => setView(e.target.value as CalViewMode)}
            aria-label={tx('Көрініс режимі')}
            className="h-9 px-3 rounded-xl border border-line bg-surface text-xs font-semibold text-ink hover:bg-surface-2 transition cursor-pointer outline-none"
          >
            <option value="month">{tx('Ай')}</option>
            <option value="week">{tx('Апта')}</option>
            <option value="day">{tx('Күн')}</option>
            <option value="year">{tx('Жыл')}</option>
            <option value="agenda">{tx('Тізім (Кесте)')}</option>
          </select>

          {/* Import / Export Menu */}
          <button
            type="button"
            onClick={() => setSheet('import')}
            title={tx('Импорттау')}
            className="size-9 hidden md:grid place-items-center rounded-xl border border-line hover:bg-surface-2 text-muted hover:text-ink transition"
          >
            <Icon n="doc" size={16} />
          </button>
          <button
            type="button"
            onClick={exportIcs}
            title={tx('Экспорттау (.ics)')}
            className="size-9 hidden md:grid place-items-center rounded-xl border border-line hover:bg-surface-2 text-muted hover:text-ink transition"
          >
            <Icon n="share" size={16} />
          </button>
        </div>
      </header>

      {/* Optional Search Bar */}
      {isSearching && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-line animate-in fade-in duration-200">
          <Icon n="search" size={16} className="text-muted shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tx('Оқиға, орын, қатысушы бойынша іздеу...')}
            autoFocus
            className="flex-1 bg-transparent text-sm text-ink outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="size-6 grid place-items-center text-muted hover:text-ink"
            >
              <Icon n="x" size={14} />
            </button>
          )}
        </div>
      )}

      {/* Main Body: Left Sidebar + Grid Area */}
      <div className="flex-1 flex overflow-hidden min-h-[640px]">
        {/* Left Sidebar (Collapsible) */}
        {showSidebar && (
          <aside className="w-64 sm:w-72 shrink-0 border-r border-line p-3 sm:p-4 flex flex-col gap-5 overflow-y-auto bg-surface">
            {/* 1. Large "+ Жасау" Pill Button (Google Calendar style) */}
            <button
              type="button"
              onClick={() => setQuickAdd({ open: true, date: selectedDay, calId: editable[0]?.id })}
              className="group flex items-center gap-3 px-4 py-3 rounded-full bg-surface shadow-card hover:shadow-md border border-line text-ink font-semibold text-sm transition active:scale-98"
            >
              {/* Google colored plus */}
              <span className="size-7 rounded-full bg-accent text-on-accent grid place-items-center font-bold text-lg shadow-xs group-hover:scale-105 transition">
                +
              </span>
              <span>{tx('Жасау')}</span>
            </button>

            {/* 2. Mini Month Calendar */}
            <MiniCalendar
              year={y}
              month={m}
              selectedDay={selectedDay}
              todayStr={t}
              onSelectDay={(day) => {
                setSelectedDay(day)
                setCurrentMonth(day.slice(0, 7))
              }}
              onPrevMonth={() => shift(-1)}
              onNextMonth={() => shift(1)}
            />

            {/* 3. "Күнтізбелерім" (My Calendars) with colored checkboxes */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-wider px-1">
                <span>{tx('Күнтізбелерім')}</span>
              </div>
              <div className="flex flex-col gap-1">
                {myCalendars.map((s) => {
                  const isChecked = !hiddenKeys.has(s.key)
                  return (
                    <label
                      key={s.key}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer transition select-none text-xs sm:text-sm text-ink"
                    >
                      {/* Custom Colored Checkbox matching Google Calendar */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSource(s.key)}
                        className="sr-only"
                      />
                      <span
                        className="size-4 rounded flex items-center justify-center transition border"
                        style={{
                          backgroundColor: isChecked ? s.color : 'transparent',
                          borderColor: s.color,
                        }}
                      >
                        {isChecked && (
                          <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2.5 6 5 8.5 9.5 3.5" />
                          </svg>
                        )}
                      </span>
                      <span className={`truncate flex-1 font-medium ${!isChecked ? 'text-muted line-through' : ''}`}>
                        {s.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* 4. "Басқа күнтізбелер" (Other Calendars: School, Lessons, Activities, Holidays) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-wider px-1">
                <span>{tx('Басқа күнтізбелер')}</span>
                {isDeputy && (
                  <button
                    type="button"
                    onClick={() => {
                      const schoolCal = allCals.find((c) => c.kind === 'school')
                      setQuickAdd({ open: true, date: selectedDay, calId: schoolCal?.id })
                    }}
                    title={tx('Мектеп оқиғасын қосу')}
                    className="size-5 rounded grid place-items-center text-muted hover:text-accent hover:bg-accent-soft transition"
                  >
                    <Icon n="plus" size={13} />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {otherCalendars.map((s) => {
                  const isChecked = !hiddenKeys.has(s.key)
                  const isSchoolCal = s.cal?.kind === 'school'
                  return (
                    <label
                      key={s.key}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer transition select-none text-xs sm:text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSource(s.key)}
                        className="sr-only"
                      />
                      <span
                        className="size-4 rounded flex items-center justify-center transition border"
                        style={{
                          backgroundColor: isChecked ? s.color : 'transparent',
                          borderColor: s.color,
                        }}
                      >
                        {isChecked && (
                          <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2.5 6 5 8.5 9.5 3.5" />
                          </svg>
                        )}
                      </span>
                      <span className={`truncate flex-1 font-medium ${!isChecked ? 'text-muted line-through' : ''}`}>
                        {s.name}
                      </span>
                      {isSchoolCal && isDeputy && (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                          {tx('Орынбасар')}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Calendar View Area */}
        <main className="flex-1 overflow-auto bg-surface flex flex-col">
          {!ag.data ? (
            ag.error ? (
              <div className="p-6">
                <ErrorBox text={ag.error} retry={ag.reload} />
              </div>
            ) : (
              <div className="p-6">
                <Skeleton />
              </div>
            )
          ) : view === 'month' ? (
            <GoogleMonthGrid
              year={y}
              month={m}
              selectedDay={selectedDay}
              todayStr={t}
              items={visibleItems}
              holidays={holidays}
              onSelectDay={(day) => setSelectedDay(day)}
              onAddClick={(day) => setQuickAdd({ open: true, date: day })}
              onItemClick={(item) => setInspectEvent(item)}
              onInspectDay={(day) => setInspectDay(day)}
            />
          ) : view === 'week' ? (
            <WeekView
              selectedDay={selectedDay}
              todayStr={t}
              items={visibleItems}
              holidays={holidays}
              onItemClick={(item) => setInspectEvent(item)}
              onAddClick={(day) => setQuickAdd({ open: true, date: day })}
            />
          ) : view === 'day' ? (
            <DayView
              selectedDay={selectedDay}
              todayStr={t}
              items={visibleItems}
              holidays={holidays}
              onItemClick={(item) => setInspectEvent(item)}
              onAddClick={() => setQuickAdd({ open: true, date: selectedDay })}
            />
          ) : view === 'year' ? (
            <YearView
              year={y}
              selectedDay={selectedDay}
              todayStr={t}
              onSelectMonth={(monthIndex) => {
                const nextMonth = `${y}-${String(monthIndex + 1).padStart(2, '0')}`
                setCurrentMonth(nextMonth)
                setView('month')
              }}
            />
          ) : (
            <AgendaListView
              items={visibleItems}
              todayStr={t}
              onItemClick={(item) => setInspectEvent(item)}
            />
          )}
        </main>
      </div>

      {/* Quick Add Popover / Dialog (Image 1) */}
      {quickAdd?.open && (
        <Sheet
          title={tx('Жаңа оқиға қосу')}
          onClose={() => setQuickAdd(null)}
        >
          <QuickAddEventDialog
            initialDate={quickAdd.date}
            initialCalId={quickAdd.calId}
            cals={editable}
            isDeputy={isDeputy}
            onDone={() => {
              setQuickAdd(null)
              ag.reload()
            }}
            onClose={() => setQuickAdd(null)}
          />
        </Sheet>
      )}

      {/* Event Details Modal */}
      {inspectEvent && (
        <Sheet
          title={inspectEvent.title}
          onClose={() => setInspectEvent(null)}
        >
          <EventDetailSheet
            item={inspectEvent}
            canEdit={inspectEvent.kind === 'event' && editable.some((c) => c.id === inspectEvent.src)}
            onEdit={() => {
              if (inspectEvent.calEvent) {
                setEditingEvent(inspectEvent.calEvent)
                setInspectEvent(null)
              }
            }}
            onDelete={async () => {
              try {
                await removeEvent(inspectEvent.key.slice(1))
                toast(tx('Өшірілді'))
                setInspectEvent(null)
                ag.reload()
              } catch (e) {
                toast(errText(e))
              }
            }}
            onClose={() => setInspectEvent(null)}
          />
        </Sheet>
      )}

      {/* Edit Event Sheet */}
      {editingEvent && (
        <Sheet
          title={tx('Оқиғаны өзгерту')}
          onClose={() => setEditingEvent(null)}
        >
          <EditEventDialog
            event={editingEvent}
            cals={editable}
            isDeputy={isDeputy}
            onDone={() => {
              setEditingEvent(null)
              ag.reload()
            }}
            onClose={() => setEditingEvent(null)}
          />
        </Sheet>
      )}

      {/* Day Inspector Sheet ("Тағы N" or clicking a cell on mobile) */}
      {inspectDay && (
        <Sheet
          title={`${fmtDate(inspectDay)}, ${inspectDay.slice(0, 4)}`}
          onClose={() => setInspectDay(null)}
        >
          <DayInspectorContent
            items={visibleItems.filter((i) => onDay(i, inspectDay))}
            holidays={holidays.filter((h) => h.date === inspectDay)}
            onAdd={() => {
              const d = inspectDay
              setInspectDay(null)
              setQuickAdd({ open: true, date: d })
            }}
            onItemClick={(i) => {
              setInspectDay(null)
              setInspectEvent(i)
            }}
          />
        </Sheet>
      )}

      {/* ICS Import Sheet */}
      {sheet === 'import' && (
        <Sheet title={tx('.ics импорттау')} onClose={() => setSheet(null)}>
          <ImportIcsDialog
            cals={editable}
            onDone={() => {
              setSheet(null)
              ag.reload()
            }}
          />
        </Sheet>
      )}
    </div>
  )
}

/* =========================================================================
   2. Mini Month Calendar (in Left Sidebar)
   ========================================================================= */

function MiniCalendar({
  year,
  month,
  selectedDay,
  todayStr,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: {
  year: number
  month: number
  selectedDay: string
  todayStr: string
  onSelectDay: (day: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const firstDay = new Date(year, month - 1, 1)
  const firstDow = firstDay.getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month, 0).getDate()
  const totalCells = firstDow + daysInMonth > 35 ? 42 : 35
  const startDate = addDays(`${monthStr}-01`, -firstDow)
  const cells = Array.from({ length: totalCells }, (_, i) => addDays(startDate, i))

  return (
    <div className="flex flex-col gap-2 select-none">
      {/* Month Header with < > */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-ink capitalize">
          {year} ж. {MONTHS[month - 1].toLowerCase()}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label={tx('Алдыңғы ай')}
            className="size-6 grid place-items-center rounded-full hover:bg-surface-2 text-muted hover:text-ink transition"
          >
            <Icon n="back" size={13} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label={tx('Келесі ай')}
            className="size-6 grid place-items-center rounded-full hover:bg-surface-2 text-muted hover:text-ink transition"
          >
            <Icon n="chev" size={13} />
          </button>
        </div>
      </div>

      {/* Weekday Initials: Ж Д С С Б Ж С */}
      <div className="grid grid-cols-7 text-center">
        {WD_MINI.map((wd, i) => (
          <span key={i} className="text-[11px] font-semibold text-muted py-1">
            {wd}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 text-center gap-y-1">
        {cells.map((d) => {
          const isCurr = d.startsWith(monthStr)
          const isToday = d === todayStr
          const isSelected = d === selectedDay
          const num = Number(d.slice(8))

          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDay(d)}
              className={`size-7 mx-auto rounded-full text-xs font-medium grid place-items-center transition ${
                isToday
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : isSelected
                  ? 'bg-accent-soft text-accent font-bold ring-1 ring-accent'
                  : isCurr
                  ? 'text-ink hover:bg-surface-2'
                  : 'text-muted/40 hover:bg-surface-2/50'
              }`}
            >
              {num}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* =========================================================================
   3. Authentic Google Calendar Month Grid (Image 2)
   - Multi-day spanning continuous horizontal banners
   - Single-day timed events with colored dots
   - Weekday headers: "ЖС 1 қар.", "ДС 2" (with blue circled today)
   - Overflow "Тағы {N}"
   ========================================================================= */

type WeekBanner = {
  item: Item
  startCol: number // 0..6
  endCol: number // 0..6
  span: number // 1..7
  slot: number // 0, 1, 2...
  isStart: boolean
  isEnd: boolean
}

function GoogleMonthGrid({
  year,
  month,
  selectedDay,
  todayStr,
  items,
  holidays,
  onSelectDay,
  onAddClick,
  onItemClick,
  onInspectDay,
}: {
  year: number
  month: number
  selectedDay: string
  todayStr: string
  items: Item[]
  holidays: { date: string; name: string; color: string }[]
  onSelectDay: (d: string) => void
  onAddClick: (d: string) => void
  onItemClick: (item: Item) => void
  onInspectDay: (d: string) => void
}) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const firstDow = new Date(year, month - 1, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month, 0).getDate()
  const totalCells = firstDow + daysInMonth > 35 ? 42 : 35
  const startDate = addDays(`${monthStr}-01`, -firstDow)

  const numWeeks = totalCells / 7
  const weeks = Array.from({ length: numWeeks }, (_, w) =>
    Array.from({ length: 7 }, (__, d) => addDays(startDate, w * 7 + d))
  )

  return (
    <div className="flex-1 flex flex-col border-t border-l border-line bg-surface select-none min-h-0">
      {/* 7 Columns Grid */}
      <div className="flex-1 flex flex-col divide-y divide-line">
        {weeks.map((weekDays, wIdx) => {
          const isFirstWeek = wIdx === 0

          // Calculate multi-day banners for this week
          const weekStart = weekDays[0]
          const weekEnd = weekDays[6]

          // 1. Find multi-day items intersecting this week
          const bannerItems: Item[] = []
          const singleItemsMap: Record<string, Item[]> = {}
          weekDays.forEach((d) => { singleItemsMap[d] = [] })

          items.forEach((item) => {
            const startStr = iso(item.start)
            const endStr = iso(item.end)
            const isMultiDay = item.allDay || startStr !== endStr

            if (isMultiDay) {
              if (startStr <= weekEnd && endStr >= weekStart) {
                bannerItems.push(item)
              }
            } else {
              // Single day timed event
              if (weekDays.includes(startStr)) {
                singleItemsMap[startStr].push(item)
              }
            }
          })

          // Add holidays as banners
          holidays.forEach((h) => {
            if (weekDays.includes(h.date)) {
              bannerItems.push({
                key: `hol-${h.date}`,
                src: 'holidays',
                color: '#10b981',
                title: h.name,
                start: new Date(`${h.date}T00:00:00`),
                end: new Date(`${h.date}T23:59:59`),
                allDay: true,
                kind: 'event',
              })
            }
          })

          // 2. Slot allocation for banners in this week
          // Sort banners: longer span first, then start date
          bannerItems.sort((a, b) => {
            const spanA = Math.min(6, dayDiff(weekEnd, iso(a.start)))
            const spanB = Math.min(6, dayDiff(weekEnd, iso(b.start)))
            return spanB - spanA || a.start.getTime() - b.start.getTime()
          })

          const occupied: boolean[][] = [] // occupied[slot][dayIndex]
          const weekBanners: WeekBanner[] = []

          bannerItems.forEach((item) => {
            const sStr = iso(item.start)
            const eStr = iso(item.end)

            const startCol = sStr < weekStart ? 0 : weekDays.indexOf(sStr)
            const endCol = eStr > weekEnd ? 6 : weekDays.indexOf(eStr)
            if (startCol === -1 || endCol === -1 || endCol < startCol) return

            const span = endCol - startCol + 1

            // Find lowest available slot
            let slot = 0
            while (true) {
              if (!occupied[slot]) occupied[slot] = Array(7).fill(false)
              let fits = true
              for (let c = startCol; c <= endCol; c++) {
                if (occupied[slot][c]) {
                  fits = false
                  break
                }
              }
              if (fits) {
                for (let c = startCol; c <= endCol; c++) occupied[slot][c] = true
                break
              }
              slot++
            }

            weekBanners.push({
              item,
              startCol,
              endCol,
              span,
              slot,
              isStart: sStr >= weekStart,
              isEnd: eStr <= weekEnd,
            })
          })

          const maxSlots = 3 // Maximum visible horizontal banner slots before overflow

          return (
            <div key={weekStart} className="flex-1 flex flex-col min-h-[120px] relative">
              {/* Day Cells Row (Headers & Click Area) */}
              <div className="grid grid-cols-7 flex-1 divide-x divide-line">
                {weekDays.map((d, colIdx) => {
                  const isCurrentMonth = d.startsWith(monthStr)
                  const isToday = d === todayStr
                  const isSelected = d === selectedDay
                  const dayNum = Number(d.slice(8))
                  const dayWd = WD_SUNDAY_FIRST[colIdx]

                  // Count overflow for this day
                  const bannersOnDay = weekBanners.filter((b) => colIdx >= b.startCol && colIdx <= b.endCol)
                  const timedOnDay = singleItemsMap[d] ?? []
                  const totalEntries = bannersOnDay.length + timedOnDay.length
                  const overflowCount = Math.max(0, totalEntries - (maxSlots + 1))

                  return (
                    <div
                      key={d}
                      onClick={() => onSelectDay(d)}
                      className={`relative p-1 sm:p-1.5 flex flex-col justify-between transition cursor-pointer group ${
                        !isCurrentMonth ? 'bg-surface-2/20 text-muted/50' : 'bg-surface text-ink'
                      } ${isSelected ? 'ring-2 ring-accent/50 inset-ring' : 'hover:bg-surface-2/40'}`}
                    >
                      {/* Cell Header: Day of week + Number (e.g. "ЖС 1 қар.", "ДС 2") */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5">
                          {isFirstWeek && (
                            <span className="text-[11px] font-bold text-muted uppercase">
                              {dayWd}
                            </span>
                          )}
                          <span
                            className={`tabular-nums text-xs sm:text-sm font-semibold transition ${
                              isToday
                                ? 'size-6 sm:size-7 rounded-full bg-blue-600 text-white grid place-items-center shadow-xs font-bold'
                                : isCurrentMonth
                                ? 'text-ink'
                                : 'text-muted/60'
                            }`}
                          >
                            {dayNum}
                          </span>
                          {dayNum === 1 && (
                            <span className="text-[10px] font-medium text-muted capitalize truncate">
                              {MONTHS[Number(d.slice(5, 7)) - 1]}
                            </span>
                          )}
                        </div>

                        {/* Quick Add Button on Hover */}
                        <button
                          type="button"
                          aria-label={tx('Қосу')}
                          onClick={(e) => {
                            e.stopPropagation()
                            onAddClick(d)
                          }}
                          className="size-5 rounded grid place-items-center opacity-0 group-hover:opacity-100 text-muted hover:text-accent hover:bg-accent-soft transition"
                        >
                          <Icon n="plus" size={13} />
                        </button>
                      </div>

                      {/* Spacer for Banners overlay */}
                      <div style={{ height: `${Math.min(maxSlots, occupied.length) * 23}px` }} />

                      {/* Timed Single-day Events List (🟢 9 AM akimshilik jin) */}
                      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden mt-0.5">
                        {timedOnDay.slice(0, 2).map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onItemClick(item)
                            }}
                            className="w-full text-left flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-surface-2 transition truncate text-[11px]"
                          >
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-muted tabular-nums text-[10px] shrink-0 font-medium">
                              {hhmm(item.start)}
                            </span>
                            <span className="truncate font-medium text-ink flex-1">
                              {item.title}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Overflow indicator: "Тағы {N}" (Matching Google Calendar Image 2: "Тағы 2", "Тағы 3") */}
                      {overflowCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onInspectDay(d)
                          }}
                          className="text-[11px] font-bold text-muted hover:text-ink hover:underline text-left px-1 mt-0.5 truncate"
                        >
                          {tx('Тағы {0}', overflowCount)}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Multi-day Banners Overlay Layer */}
              <div
                className="absolute inset-x-0 pointer-events-none"
                style={{ top: isFirstWeek ? '30px' : '28px' }}
              >
                {weekBanners
                  .filter((b) => b.slot < maxSlots)
                  .map((b) => {
                    const leftPct = (b.startCol / 7) * 100
                    const widthPct = (b.span / 7) * 100
                    const topPx = b.slot * 23

                    return (
                      <div
                        key={b.item.key}
                        onClick={(e) => {
                          e.stopPropagation()
                          onItemClick(b.item)
                        }}
                        style={{
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          top: `${topPx}px`,
                          backgroundColor: b.item.color,
                        }}
                        title={`${b.item.title}${b.item.place ? ' · ' + b.item.place : ''}`}
                        className={`absolute h-[21px] flex items-center px-2 text-[11px] font-semibold text-white truncate shadow-2xs cursor-pointer pointer-events-auto transition hover:brightness-95 active:scale-99 ${
                          b.isStart ? 'rounded-l-md' : 'rounded-l-none'
                        } ${b.isEnd ? 'rounded-r-md' : 'rounded-r-none'}`}
                      >
                        <span className="truncate flex-1">
                          {b.item.title}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function dayDiff(d1: string, d2: string) {
  const t1 = new Date(d1).getTime()
  const t2 = new Date(d2).getTime()
  return Math.round(Math.abs(t1 - t2) / (1000 * 60 * 60 * 24))
}

/* =========================================================================
   4. Quick-Add Popover Dialog (Image 1)
   - Toggle: Event / Reminder
   - Title
   - Calendar Picker
   - LocationPicker
   - Date / Time / All Day
   - Audience Selector (crucial for school calendar/deputy!)
   - Notes
   ========================================================================= */

function QuickAddEventDialog({
  initialDate,
  initialCalId,
  cals,
  isDeputy,
  onDone,
  onClose,
}: {
  initialDate: string
  initialCalId?: string
  cals: Calendar[]
  isDeputy: boolean
  onDone: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'event' | 'reminder'>('event')
  const [title, setTitle] = useState('')
  const [selectedCalId, setSelectedCalId] = useState(
    initialCalId ?? cals.find((c) => c.kind === 'personal')?.id ?? cals[0]?.id ?? ''
  )
  const [date, setDate] = useState(initialDate)
  const [allDay, setAllDay] = useState(false)
  const [fromTime, setFromTime] = useState('09:00')
  const [toTime, setToTime] = useState('10:00')
  const [location, setLocation] = useState('')
  const [audience, setAudience] = useState<CalAudience>('all')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedCal = cals.find((c) => c.id === selectedCalId)
  const isSchoolCal = selectedCal?.kind === 'school'

  const save = async () => {
    if (!title.trim()) return toast(tx('Атауын жазыңыз'))
    if (!selectedCalId) return toast(tx('Күнтізбені таңдаңыз'))
    if (!allDay && toTime <= fromTime) {
      return toast(tx('Аяқталу уақыты басталудан кейін болуы керек'))
    }

    const s = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${fromTime}:00`)
    const e = allDay ? new Date(`${date}T23:59:59`) : new Date(`${date}T${toTime}:00`)

    setBusy(true)
    try {
      await addEvents([
        {
          calendar_id: selectedCalId,
          title: title.trim(),
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          all_day: allDay,
          location: location.trim() || null,
          notes: notes.trim() || null,
          audience,
        },
      ])
      toast(tx('Оқиға қосылды'))
      onDone()
    } catch (err) {
      toast(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 select-none">
      {/* 1. Event / Reminder Segmented Toggle (Matching Image 1) */}
      <div className="flex bg-surface-2 p-1 rounded-full border border-line">
        <button
          type="button"
          onClick={() => setTab('event')}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold transition ${
            tab === 'event' ? 'bg-red-500 text-white shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          {tx('Іс-шара')}
        </button>
        <button
          type="button"
          onClick={() => setTab('reminder')}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold transition ${
            tab === 'reminder' ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          {tx('Еске салу')}
        </button>
      </div>

      {/* 2. Title & Calendar Color Indicator */}
      <div className="relative">
        <Field label={tx('Атауы')}>
          {(id) => (
            <div className="relative flex items-center">
              <input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder={tx('Жаңа оқиға...')}
                autoFocus
                className={`${inputCls} pr-10 font-medium`}
              />
              <span
                className="absolute right-3 size-4 rounded-full border border-white/20 shadow-xs"
                style={{ backgroundColor: selectedCal?.color ?? '#1d5bd8' }}
              />
            </div>
          )}
        </Field>
      </div>

      {/* 3. Calendar Choice */}
      <Field label={tx('Күнтізбе')}>
        {(id) => (
          <select
            id={id}
            value={selectedCalId}
            onChange={(e) => setSelectedCalId(e.target.value)}
            className={inputCls}
          >
            {cals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.kind === 'school' ? `(${tx('Мектеп')})` : ''}
              </option>
            ))}
          </select>
        )}
      </Field>

      {/* 4. Target Audience Selector (Crucial Requirement!) */}
      {(isDeputy || isSchoolCal) && (
        <Field
          label={tx('Көрінетін аудитория')}
          hint={tx('Оқиға тек таңдалған аудиторияға көрінеді')}
        >
          {(id) => (
            <select
              id={id}
              value={audience}
              onChange={(e) => setAudience(e.target.value as CalAudience)}
              className={inputCls}
            >
              <option value="all">{AUDIENCE_LABELS.all}</option>
              <option value="students">{AUDIENCE_LABELS.students}</option>
              <option value="staff">{AUDIENCE_LABELS.staff}</option>
              <option value="teachers">{AUDIENCE_LABELS.teachers}</option>
              <option value="tutors">{AUDIENCE_LABELS.tutors}</option>
            </select>
          )}
        </Field>
      )}

      {/* 5. Date & Time */}
      <div className="grid gap-2">
        <Field label={tx('Күні')}>
          {(id) => (
            <input
              id={id}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          )}
        </Field>

        <label className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4 rounded accent-[var(--accent)]"
          />
          <span>{tx('Күні бойы')}</span>
        </label>

        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx('Басталуы')}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  className={inputCls}
                />
              )}
            </Field>
            <Field label={tx('Аяқталуы')}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  className={inputCls}
                />
              )}
            </Field>
          </div>
        )}
      </div>

      {/* 6. LocationPicker */}
      <Field label={tx('Өтетін орны')} hint={tx('Жатақхана немесе мектеп орындары')}>
        {(id) => (
          <LocationPicker
            id={id}
            value={location}
            onChange={setLocation}
          />
        )}
      </Field>

      {/* 7. Notes */}
      <Field label={tx('Ескертпе немесе сипаттама')} hint={tx('Міндетті емес')}>
        {(id) => (
          <textarea
            id={id}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className={`${inputCls} py-2`}
            placeholder={tx('Қосымша мәліметтер...')}
          />
        )}
      </Field>

      {/* Save Button */}
      <div className="flex items-center gap-2 pt-2">
        <Button block loading={busy} onClick={save}>
          {tx('Сақтау')}
        </Button>
        <Button kind="secondary" onClick={onClose}>
          {tx('Жабу')}
        </Button>
      </div>
    </div>
  )
}

/* =========================================================================
   5. Edit Event Dialog
   ========================================================================= */

function EditEventDialog({
  event,
  cals,
  isDeputy,
  onDone,
  onClose,
}: {
  event: CalEvent
  cals: Calendar[]
  isDeputy: boolean
  onDone: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(event.title)
  const [selectedCalId, setSelectedCalId] = useState(event.calendar_id)
  const [allDay, setAllDay] = useState(event.all_day)
  const [date, setDate] = useState(() => iso(new Date(event.starts_at)))
  const [fromTime, setFromTime] = useState(() => hhmm(new Date(event.starts_at)))
  const [toTime, setToTime] = useState(() => hhmm(new Date(event.ends_at)))
  const [location, setLocation] = useState(event.location ?? '')
  const [audience, setAudience] = useState<CalAudience>(event.audience ?? 'all')
  const [notes, setNotes] = useState(event.notes ?? '')
  const [busy, setBusy] = useState(false)

  const selectedCal = cals.find((c) => c.id === selectedCalId)
  const isSchoolCal = selectedCal?.kind === 'school'

  const save = async () => {
    if (!title.trim()) return toast(tx('Атауын жазыңыз'))
    const s = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${fromTime}:00`)
    const e = allDay ? new Date(`${date}T23:59:59`) : new Date(`${date}T${toTime}:00`)

    setBusy(true)
    try {
      await updateEvent(event.id, {
        calendar_id: selectedCalId,
        title: title.trim(),
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        all_day: allDay,
        location: location.trim() || null,
        notes: notes.trim() || null,
        audience,
      })
      toast(tx('Өзгертілді'))
      onDone()
    } catch (err) {
      toast(errText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 select-none">
      <Field label={tx('Атауы')}>
        {(id) => (
          <input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className={inputCls}
          />
        )}
      </Field>

      <Field label={tx('Күнтізбе')}>
        {(id) => (
          <select
            id={id}
            value={selectedCalId}
            onChange={(e) => setSelectedCalId(e.target.value)}
            className={inputCls}
          >
            {cals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.kind === 'school' ? `(${tx('Мектеп')})` : ''}
              </option>
            ))}
          </select>
        )}
      </Field>

      {(isDeputy || isSchoolCal) && (
        <Field label={tx('Көрінетін аудитория')}>
          {(id) => (
            <select
              id={id}
              value={audience}
              onChange={(e) => setAudience(e.target.value as CalAudience)}
              className={inputCls}
            >
              <option value="all">{AUDIENCE_LABELS.all}</option>
              <option value="students">{AUDIENCE_LABELS.students}</option>
              <option value="staff">{AUDIENCE_LABELS.staff}</option>
              <option value="teachers">{AUDIENCE_LABELS.teachers}</option>
              <option value="tutors">{AUDIENCE_LABELS.tutors}</option>
            </select>
          )}
        </Field>
      )}

      <div className="grid gap-2">
        <Field label={tx('Күні')}>
          {(id) => (
            <input
              id={id}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          )}
        </Field>

        <label className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4 rounded accent-[var(--accent)]"
          />
          <span>{tx('Күні бойы')}</span>
        </label>

        {!allDay && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx('Басталуы')}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  className={inputCls}
                />
              )}
            </Field>
            <Field label={tx('Аяқталуы')}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  className={inputCls}
                />
              )}
            </Field>
          </div>
        )}
      </div>

      <Field label={tx('Өтетін орны')}>
        {(id) => <LocationPicker id={id} value={location} onChange={setLocation} />}
      </Field>

      <Field label={tx('Ескертпе')}>
        {(id) => (
          <textarea
            id={id}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className={`${inputCls} py-2`}
          />
        )}
      </Field>

      <div className="flex items-center gap-2 pt-2">
        <Button block loading={busy} onClick={save}>
          {tx('Сақтау')}
        </Button>
        <Button kind="secondary" onClick={onClose}>
          {tx('Жабу')}
        </Button>
      </div>
    </div>
  )
}

/* =========================================================================
   6. Event Detail Sheet
   ========================================================================= */

function EventDetailSheet({
  item,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: {
  item: Item
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <div className="grid gap-4 select-none">
      <div className="flex items-start gap-3">
        <span
          className="size-4 rounded-full mt-1 shrink-0"
          style={{ backgroundColor: item.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-ink">{item.title}</h3>
          <p className="text-xs text-muted mt-0.5">
            {fmtDate(iso(item.start))}
            {item.allDay ? ` · ${tx('Күні бойы')}` : ` · ${hhmm(item.start)} – ${hhmm(item.end)}`}
          </p>
        </div>
      </div>

      {item.place && (
        <div className="flex items-center gap-2 text-sm text-ink bg-surface-2 p-2.5 rounded-xl border border-line">
          <Icon n="pin" size={16} className="text-muted shrink-0" />
          <span>{item.place}</span>
        </div>
      )}

      {item.audience && item.audience !== 'all' && (
        <div className="flex items-center gap-2 text-xs font-semibold text-accent bg-accent-soft p-2.5 rounded-xl border border-accent/20">
          <Icon n="info" size={15} className="shrink-0" />
          <span>{tx('Көрінеді: {0}', AUDIENCE_LABELS[item.audience])}</span>
        </div>
      )}

      {item.notes && (
        <div className="text-sm text-ink/80 bg-surface-2 p-3 rounded-xl border border-line whitespace-pre-line">
          {item.notes}
        </div>
      )}

      {item.responsible && (
        <p className="text-xs text-muted">
          {tx('Жауапты: {0}', item.responsible)}
        </p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-line">
        {canEdit && (
          <>
            <Button block onClick={onEdit}>
              {tx('Өзгерту')}
            </Button>
            <Button kind="danger" onClick={onDelete}>
              {tx('Өшіру')}
            </Button>
          </>
        )}
        <Button kind="secondary" block={!canEdit} onClick={onClose}>
          {tx('Жабу')}
        </Button>
      </div>
    </div>
  )
}

/* =========================================================================
   7. Day Inspector Content ("Тағы N")
   ========================================================================= */

function DayInspectorContent({
  items,
  holidays,
  onAdd,
  onItemClick,
}: {
  items: Item[]
  holidays: { date: string; name: string; color: string }[]
  onAdd: () => void
  onItemClick: (i: Item) => void
}) {
  return (
    <div className="grid gap-3 select-none">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <span className="text-xs font-bold text-muted uppercase">
          {tx('{0} оқиға', items.length + holidays.length)}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="h-8 px-3 rounded-md bg-accent text-on-accent text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
        >
          <Icon n="plus" size={13} />
          {tx('Оқиға қосу')}
        </button>
      </div>

      {holidays.map((h) => (
        <div
          key={h.name}
          className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-sm font-semibold"
        >
          <span className="size-2 rounded-full bg-emerald-500" />
          <span>{h.name}</span>
        </div>
      ))}

      {items.length === 0 && holidays.length === 0 ? (
        <p className="text-sm text-muted text-center py-6">{tx('Жазба жоқ')}</p>
      ) : (
        <div className="grid gap-1.5">
          {items.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => onItemClick(i)}
              className="w-full text-left flex items-start gap-3 p-2.5 rounded-xl bg-surface-2 hover:bg-surface border border-line transition shadow-2xs"
            >
              <span
                className="size-3 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: i.color }}
              />
              <div className="flex-1 min-w-0 text-sm">
                <span className="font-semibold text-ink block truncate">{i.title}</span>
                <span className="text-xs text-muted block mt-0.5">
                  {i.allDay ? tx('Күні бойы') : `${hhmm(i.start)} – ${hhmm(i.end)}`}
                  {i.place ? ` · ${i.place}` : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   8. Week, Day, Year, and Agenda Views
   ========================================================================= */

function WeekView({
  selectedDay,
  todayStr,
  items,
  holidays,
  onItemClick,
  onAddClick,
}: {
  selectedDay: string
  todayStr: string
  items: Item[]
  holidays: { date: string; name: string; color: string }[]
  onItemClick: (i: Item) => void
  onAddClick: (d: string, time?: string) => void
}) {
  const dayOfWeek = new Date(selectedDay).getDay()
  const weekStart = addDays(selectedDay, -dayOfWeek)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex-1 flex flex-col border-t border-l border-line bg-surface select-none overflow-y-auto">
      {/* 7 Day Headers */}
      <div className="grid grid-cols-7 divide-x divide-line border-b border-line bg-surface-2/40 sticky top-0 z-10">
        {weekDays.map((d, colIdx) => {
          const isToday = d === todayStr
          const dayNum = Number(d.slice(8))
          const dayWd = WD_SUNDAY_FIRST[colIdx]

          return (
            <div key={d} className="p-2 text-center">
              <span className="text-[11px] font-bold text-muted block">{dayWd}</span>
              <span
                className={`size-7 mx-auto rounded-full text-sm font-semibold grid place-items-center mt-0.5 ${
                  isToday ? 'bg-blue-600 text-white font-bold' : 'text-ink'
                }`}
              >
                {dayNum}
              </span>
            </div>
          )
        })}
      </div>

      {/* Week Day Columns */}
      <div className="grid grid-cols-7 divide-x divide-line flex-1 min-h-[500px]">
        {weekDays.map((d) => {
          const dayItems = items.filter((i) => onDay(i, d))
          const dayHolidays = holidays.filter((h) => h.date === d)

          return (
            <div
              key={d}
              onClick={() => onAddClick(d)}
              className="p-1.5 flex flex-col gap-1.5 hover:bg-surface-2/30 cursor-pointer transition min-h-[400px]"
            >
              {dayHolidays.map((h) => (
                <div
                  key={h.name}
                  className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 truncate"
                >
                  {h.name}
                </div>
              ))}
              {dayItems.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onItemClick(i)
                  }}
                  className="w-full text-left p-1.5 rounded-lg text-xs font-medium text-white shadow-xs transition hover:brightness-95 truncate"
                  style={{ backgroundColor: i.color }}
                >
                  <span className="block truncate font-bold">{i.title}</span>
                  <span className="block text-[10px] opacity-90 truncate">
                    {i.allDay ? tx('Күні бойы') : hhmm(i.start)}
                  </span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({
  selectedDay,
  todayStr,
  items,
  holidays,
  onItemClick,
  onAddClick,
}: {
  selectedDay: string
  todayStr: string
  items: Item[]
  holidays: { date: string; name: string; color: string }[]
  onItemClick: (i: Item) => void
  onAddClick: () => void
}) {
  const dayItems = items.filter((i) => onDay(i, selectedDay))
  const dayHolidays = holidays.filter((h) => h.date === selectedDay)

  return (
    <div className="p-4 flex flex-col gap-4 max-w-2xl mx-auto w-full select-none">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div>
          <h2 className="text-xl font-bold font-display text-ink">
            {fmtDate(selectedDay)}, {selectedDay.slice(0, 4)}
          </h2>
          {selectedDay === todayStr && (
            <span className="text-xs font-semibold text-accent">{tx('Бүгін')}</span>
          )}
        </div>
        <Button onClick={onAddClick}>
          <Icon n="plus" size={16} />
          {tx('Қосу')}
        </Button>
      </div>

      {dayHolidays.map((h) => (
        <div
          key={h.name}
          className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 font-semibold"
        >
          {h.name}
        </div>
      ))}

      {dayItems.length === 0 ? (
        <Empty icon="calendar" title={tx('Оқиға жоқ')} text={tx('Бұл күні ешқандай оқиға жоқ.')} />
      ) : (
        <div className="grid gap-2">
          {dayItems.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => onItemClick(i)}
              className="w-full text-left p-3 rounded-xl bg-surface-2 hover:bg-surface border border-line flex items-start gap-3 transition shadow-xs"
            >
              <span
                className="size-3.5 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: i.color }}
              />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-ink block">{i.title}</span>
                <span className="text-xs text-muted block mt-0.5">
                  {i.allDay ? tx('Күні бойы') : `${hhmm(i.start)} – ${hhmm(i.end)}`}
                  {i.place ? ` · ${i.place}` : ''}
                </span>
                {i.notes && (
                  <p className="text-xs text-muted mt-1 whitespace-pre-line line-clamp-2">
                    {i.notes}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function YearView({
  year,
  selectedDay,
  todayStr,
  onSelectMonth,
}: {
  year: number
  selectedDay: string
  todayStr: string
  onSelectMonth: (monthIndex: number) => void
}) {
  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 select-none overflow-y-auto">
      {MONTHS.map((name, mIdx) => (
        <div
          key={name}
          onClick={() => onSelectMonth(mIdx)}
          className="p-3 rounded-2xl bg-surface border border-line hover:border-accent/40 hover:shadow-card cursor-pointer transition flex flex-col gap-2"
        >
          <span className="text-sm font-bold font-display text-ink capitalize">
            {name}
          </span>
          <MiniCalendar
            year={year}
            month={mIdx + 1}
            selectedDay={selectedDay}
            todayStr={todayStr}
            onSelectDay={() => onSelectMonth(mIdx)}
            onPrevMonth={() => {}}
            onNextMonth={() => {}}
          />
        </div>
      ))}
    </div>
  )
}

function AgendaListView({
  items,
  todayStr,
  onItemClick,
}: {
  items: Item[]
  todayStr: string
  onItemClick: (i: Item) => void
}) {
  const upcoming = items.filter((i) => iso(i.end) >= todayStr)
  const days = [...new Set(upcoming.map((i) => iso(i.start)))].sort()

  if (!days.length) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Empty icon="calendar" title={tx('Алдағы оқиғалар жоқ')} text={tx('Күнтізбеде алдағы оқиғалар табылмады.')} />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto w-full flex flex-col gap-4 select-none">
      {days.map((d) => (
        <section key={d} className="flex flex-col gap-1.5">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${d === todayStr ? 'text-accent' : 'text-muted'}`}>
            {d === todayStr ? tx('Бүгін') : fmtDate(d)}
          </h3>
          <Card className="p-1 divide-y divide-line">
            {upcoming
              .filter((i) => onDay(i, d) && iso(i.start) === d)
              .map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => onItemClick(i)}
                  className="w-full text-left p-2.5 flex items-start gap-3 hover:bg-surface-2 transition rounded-lg"
                >
                  <span
                    className="size-3 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: i.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-ink text-sm block">{i.title}</span>
                    <span className="text-xs text-muted block mt-0.5">
                      {i.allDay ? tx('Күні бойы') : `${hhmm(i.start)} – ${hhmm(i.end)}`}
                      {i.place ? ` · ${i.place}` : ''}
                    </span>
                  </div>
                </button>
              ))}
          </Card>
        </section>
      ))}
    </div>
  )
}

/* =========================================================================
   9. ICS Import Dialog
   ========================================================================= */

function ImportIcsDialog({
  cals,
  onDone,
}: {
  cals: Calendar[]
  onDone: () => void
}) {
  const [cal, setCal] = useState(cals.find((c) => c.kind === 'personal')?.id ?? cals[0]?.id ?? '')
  const [parsed, setParsed] = useState<ReturnType<typeof parseIcs> | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const read = async (f?: File) => {
    if (!f) return
    if (f.size > 2_000_000) return toast(tx('Файл тым үлкен (2 МБ-тан аспауы керек)'))
    try {
      const ev = parseIcs(await f.text())
      if (!ev.length) toast(tx('Файлда оқиға табылмады'))
      setParsed(ev)
    } catch (e) {
      toast(errText(e))
    }
  }

  const save = async () => {
    if (!parsed?.length) return
    setBusy(true)
    try {
      let n = 0
      for (let i = 0; i < parsed.length; i += 200) {
        const rows = parsed.slice(i, i + 200).map((e) => ({
          calendar_id: cal,
          title: e.title,
          starts_at: e.start.toISOString(),
          ends_at: e.end.toISOString(),
          all_day: e.allDay,
          location: e.location ?? null,
          notes: e.notes?.slice(0, 2000) ?? null,
          import_uid: e.uid.slice(0, 300),
        }))
        n += (await addEvents(rows)).length
      }
      toast(n ? tx('{0} оқиға қосылды', n) : tx('Барлығы бұрын импортталған'))
      onDone()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 select-none">
      <p className="text-sm text-muted">
        {tx(
          'Google Calendar немесе Apple Calendar-дан экспортталған .ics файлын таңдаңыз.'
        )}
      </p>
      <Field label={tx('Қай күнтізбеге')}>
        {(id) => (
          <select
            id={id}
            value={cal}
            onChange={(e) => setCal(e.target.value)}
            className={inputCls}
          >
            {cals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <input
        ref={file}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => read(e.target.files?.[0])}
      />
      <Button kind="secondary" onClick={() => file.current?.click()}>
        {tx('Файл таңдау')}
      </Button>
      {parsed && (
        <p className="text-sm font-semibold">
          {tx('{0} оқиға табылды', parsed.length)}
        </p>
      )}
      <Button block loading={busy} disabled={!parsed?.length} onClick={save}>
        {tx('Импорттау')}
      </Button>
    </div>
  )
}
