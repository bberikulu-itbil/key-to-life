import type { MediaState } from './api'
import { tx } from './i18n'
/** Average of 1–5 star ratings, one decimal; null when nobody rated. */
export function avgStars(list: (number | null | undefined)[]) {
  const r = list.filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5)
  return r.length ? { avg: Math.round((10 * r.reduce((s, v) => s + v, 0)) / r.length) / 10, n: r.length } : null
}
/** Per-season averages from everyone's {"1": 5, "2": 4}. */
export const seasonAvgs = (all: Record<string, number>[], seasons: number) =>
  Array.from({ length: seasons }, (_, i) => avgStars(all.map((s) => s[String(i + 1)])))

/** Button/column label for a media progress state. */
export const stateLabel = (st: MediaState, book: boolean) => st === 'want' ? (book ? tx('Оқимын') : tx('Көремін')) : st === 'doing' ? (book ? tx('Оқып жатырмын') : tx('Көріп жатырмын')) : (book ? tx('Оқыдым') : tx('Көрдім'))

/** Groups the parts of a series into one entry (parts sorted by number); other titles stay single, order kept. */
export function groupSeries<T extends { id: string; series?: string | null; series_no?: number | null }>(items: T[]): { key: string; series: string | null; items: T[] }[] {
  const out: { key: string; series: string | null; items: T[] }[] = []
  const bySeries = new Map<string, { key: string; series: string | null; items: T[] }>()
  for (const m of items) {
    const s = m.series?.trim()
    if (!s) { out.push({ key: m.id, series: null, items: [m] }); continue }
    let g = bySeries.get(s.toLowerCase())
    if (!g) { g = { key: `s:${s}`, series: s, items: [] }; bySeries.set(s.toLowerCase(), g); out.push(g) }
    g.items.push(m)
  }
  for (const g of bySeries.values()) g.items.sort((a, b) => (a.series_no ?? 999) - (b.series_no ?? 999))
  return out
}

/** Pages per day for the last `days` days ending today (oldest first). */
export function pagesByDay(logs: { on_date: string; pages: number }[], days: number, todayIso: string): { day: string; pages: number }[] {
  const end = new Date(`${todayIso}T00:00:00Z`)
  const out = Array.from({ length: days }, (_, i) => ({ day: new Date(end.getTime() - (days - 1 - i) * 864e5).toISOString().slice(0, 10), pages: 0 }))
  const idx = new Map(out.map((d, i) => [d.day, i]))
  for (const l of logs) { const i = idx.get(l.on_date); if (i !== undefined) out[i].pages += l.pages }
  return out
}
