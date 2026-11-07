/** Scale a recipe amount from its own servings to `to` people; keeps 2 significant decimals. */
export const scaleAmount = (amount: number | null, from: number, to: number) => amount == null ? null : Math.round((amount * to / Math.max(1, from)) * 100) / 100
/** «#пудинг #десерт, шоколад» → ['пудинг', 'десерт', 'шоколад'] (lower-case, unique, max 10). */
export const parseTags = (s: string) => [...new Set(s.split(/[\s,#]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
