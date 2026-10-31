/** Average of 1–5 star ratings, one decimal; null when nobody rated. */
export function avgStars(list: (number | null | undefined)[]) {
  const r = list.filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5)
  return r.length ? { avg: Math.round((10 * r.reduce((s, v) => s + v, 0)) / r.length) / 10, n: r.length } : null
}
/** Per-season averages from everyone's {"1": 5, "2": 4}. */
export const seasonAvgs = (all: Record<string, number>[], seasons: number) =>
  Array.from({ length: seasons }, (_, i) => avgStars(all.map((s) => s[String(i + 1)])))
