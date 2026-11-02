import { tx } from './i18n'

export type Holiday = {
  date: string // YYYY-MM-DD
  name: string
  color: string
}

export const getKazakhstanHolidays = (year: number): Holiday[] => {
  const fixed: [string, string][] = [
    ['01-01', tx('Жаңа жыл')],
    ['01-02', tx('Жаңа жыл')],
    ['01-07', tx('Рождество')],
    ['03-08', tx('Халықаралық әйелдер күні')],
    ['03-21', tx('Наурыз мейрамы')],
    ['03-22', tx('Наурыз мейрамы')],
    ['03-23', tx('Наурыз мейрамы')],
    ['05-01', tx('Қазақстан халқының бірлігі күні')],
    ['05-07', tx('Отан қорғаушы күні')],
    ['05-09', tx('Жеңіс күні')],
    ['07-06', tx('Астана күні')],
    ['08-30', tx('Конституция күні')],
    ['10-25', tx('Республика күні')],
    ['12-16', tx('Тәуелсіздік күні')],
  ]

  const list: Holiday[] = fixed.map(([md, name]) => ({
    date: `${year}-${md}`,
    name,
    color: '#10b981', // emerald
  }))

  const lunar: Record<number, { date: string; name: string }[]> = {
    2024: [{ date: '2024-06-16', name: tx('Құрбан айт') }],
    2025: [{ date: '2025-06-06', name: tx('Құрбан айт') }],
    2026: [
      { date: '2026-05-08', name: tx('Демалыс күні') },
      { date: '2026-05-11', name: tx('Демалыс күні (Жеңіс күні)') },
      { date: '2026-05-27', name: tx('Құрбан айт') },
    ],
    2027: [{ date: '2027-05-16', name: tx('Құрбан айт') }],
  }

  if (lunar[year]) {
    for (const h of lunar[year]) {
      list.push({ date: h.date, name: h.name, color: '#10b981' })
    }
  }

  return list.sort((a, b) => a.date.localeCompare(b.date))
}
