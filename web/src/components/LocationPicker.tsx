import { useMemo, useState } from 'react'
import { listResources, type Resource } from '../lib/api'
import { Icon, inputCls, useLoad } from './ui'
import { tx } from '../lib/i18n'

const DORM_LOCATIONS: string[] = [
  'Ыбырай бөлмесі',
  '2-қабат шай бөлмесі',
  '3-қабат шай бөлмесі',
  '4-қабат шай бөлмесі',
  '2-қабат оқу/этюд залы',
  '3-қабат оқу/этюд залы',
  '4-қабат оқу/этюд залы',
]

const QUICK_DORM_CHIPS: [string, string][] = [
  ['Ыбырай бөлмесі', 'Ыбырай бөлмесі'],
  ['2-қабат шай бөлмесі', '2-шай'],
  ['3-қабат шай бөлмесі', '3-шай'],
  ['4-қабат шай бөлмесі', '4-шай'],
  ['2-қабат оқу/этюд залы', '2-этюд'],
  ['3-қабат оқу/этюд залы', '3-этюд'],
  ['4-қабат оқу/этюд залы', '4-этюд'],
]

export default function LocationPicker({
  value,
  onChange,
  places: providedPlaces,
  id,
  hint,
}: {
  value: string
  onChange: (val: string) => void
  places?: Resource[]
  id?: string
  hint?: string
}) {
  const loaded = useLoad(listResources, [])
  const places = useMemo(() => providedPlaces ?? loaded.data ?? [], [providedPlaces, loaded.data])

  // Group school places by floor or category
  const schoolGroups = useMemo(() => {
    const map = new Map<string, Resource[]>()
    for (const p of places) {
      if (!p.active) continue
      // skip if already in dorm locations
      if (DORM_LOCATIONS.includes(p.name)) continue
      const name = p.name
      const floorMatch = name.match(/^([1-4])\d\d/)
      const groupName = floorMatch ? `${floorMatch[1]}-қабат` : tx('Басқа кабинеттер')
      if (!map.has(groupName)) map.set(groupName, [])
      map.get(groupName)!.push(p)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [places])

  const allKnown = useMemo(() => {
    const set = new Set<string>(DORM_LOCATIONS)
    for (const p of places) set.add(p.name)
    return set
  }, [places])

  const isCustomValue = !!value && !allKnown.has(value)
  const [customMode, setCustomMode] = useState(isCustomValue)

  const handleSelect = (selected: string) => {
    if (selected === '__custom__') {
      setCustomMode(true)
    } else {
      setCustomMode(false)
      onChange(selected)
    }
  }

  return (
    <div className="grid gap-2">
      {customMode ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} flex-1`}
            placeholder={tx('Орын атауын жазыңыз (мыс: Асхана, Спортзал)')}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="h-12 px-3 rounded-md bg-surface-2 hover:bg-surface border border-line text-xs font-semibold whitespace-nowrap transition"
          >
            {tx('Тізімнен таңдау')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            id={id}
            value={value || ''}
            onChange={(e) => handleSelect(e.target.value)}
            className={`${inputCls} flex-1`}
          >
            <option value="">{tx('Өтетін орнын таңдаңыз')}</option>

            <optgroup label={tx('Жатақхана орындары')}>
              {DORM_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {tx(loc)}
                </option>
              ))}
            </optgroup>

            {schoolGroups.map(([groupName, rooms]) => (
              <optgroup key={groupName} label={groupName}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}{r.title ? ` · ${r.title}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}

            <option value="__custom__">
              {tx('Басқа орын (қолмен жазу)...')}
            </option>
          </select>

          <button
            type="button"
            title={tx('Қолмен жазу')}
            aria-label={tx('Қолмен жазу')}
            onClick={() => setCustomMode(true)}
            className="size-12 shrink-0 grid place-items-center rounded-md bg-surface-2 hover:bg-surface border border-line text-muted transition"
          >
            <Icon n="compose" size={18} />
          </button>
        </div>
      )}

      {/* Quick Dorm Location Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
          <Icon n="home" size={13} />
          {tx('Жатақхана')}:
        </span>
        {QUICK_DORM_CHIPS.map(([loc, label]) => {
          const active = value === loc
          return (
            <button
              key={loc}
              type="button"
              onClick={() => {
                setCustomMode(false)
                onChange(loc)
              }}
              aria-pressed={active}
              className={`h-7 px-2.5 rounded-full text-xs font-semibold border transition ${
                active
                  ? 'bg-accent text-on-accent border-accent shadow-sm'
                  : 'bg-surface-2 hover:bg-surface border-line text-ink'
              }`}
            >
              {tx(label)}
            </button>
          )
        })}
      </div>

      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
