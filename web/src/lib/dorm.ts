// Dormitory: term keys and the random room placement that avoids last terms' pairs and rooms.

/** «2026-2027-2»: school year and quarter (I Sep–Oct, II Nov–Dec, III Jan–Mar, IV Apr–Aug). */
export function termOf(iso: string) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7)
  const start = m >= 9 ? y : y - 1
  const q = m >= 11 ? 2 : m >= 9 ? 1 : m <= 3 ? 3 : 4
  return `${start}-${start + 1}-${q}`
}
export function prevTerm(term: string) {
  const [a, , q] = term.split('-').map(Number)
  return q > 1 ? `${a}-${a + 1}-${q - 1}` : `${a - 1}-${a}-4`
}
export const termLabel = (term: string) => `${term.slice(0, 9)} · ${['I', 'II', 'III', 'IV'][+term.slice(10) - 1] ?? ''}`

/** Who lived with whom and in which room before (any earlier term). */
export type History = { pairs: Set<string>; rooms: Map<string, Set<string>> }
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
export function historyFrom(rows: { term: string; student_id: string; room_id: string | null }[], before: string): History {
  const pairs = new Set<string>(), rooms = new Map<string, Set<string>>(), byRoom = new Map<string, string[]>()
  for (const r of rows) {
    if (r.term >= before || !r.room_id) continue
    if (!rooms.has(r.student_id)) rooms.set(r.student_id, new Set())
    rooms.get(r.student_id)!.add(r.room_id)
    const k = `${r.term}/${r.room_id}`
    byRoom.set(k, [...(byRoom.get(k) ?? []), r.student_id])
  }
  for (const kids of byRoom.values()) for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) pairs.add(pairKey(kids[i], kids[j]))
  return { pairs, rooms }
}

export type Room = { id: string; capacity: number; others: string[] }   // others: boys of other classes already there this term
export type Place = Record<string, string | null>                     // student → room
export type Flag = { pair: string[]; room: boolean }                  // pair: roommates he lived with before; room: same room again

const PAIR = 10, ROOM = 1

export function flagsFor(place: Place, rooms: Room[], h: History): Record<string, Flag> {
  const mates = new Map<string, string[]>(rooms.map((r) => [r.id, [...r.others]]))
  for (const [s, r] of Object.entries(place)) if (r) mates.get(r)?.push(s)
  const out: Record<string, Flag> = {}
  for (const [s, r] of Object.entries(place)) {
    if (!r) continue
    out[s] = { pair: (mates.get(r) ?? []).filter((x) => x !== s && h.pairs.has(pairKey(s, x))), room: !!h.rooms.get(s)?.has(r) }
  }
  return out
}
export const penalty = (f: Record<string, Flag>) => Object.values(f).reduce((n, x) => n + x.pair.length * PAIR / 2 + (x.room ? ROOM : 0), 0)

/** Place the unpinned boys randomly into free beds, many tries, keeping the one with the fewest repeats. */
export function allocate(students: string[], rooms: Room[], pinned: Place, h: History, tries = 300, rnd = Math.random): Place {
  let best: Place = {}, bestScore = Infinity
  const free = (s: string[]) => s.filter((x) => !pinned[x])
  for (let t = 0; t < tries && bestScore > 0; t++) {
    const place: Place = { ...pinned }
    const left = new Map(rooms.map((r) => [r.id, r.capacity - r.others.length]))
    const mates = new Map(rooms.map((r) => [r.id, [...r.others]]))
    for (const [s, r] of Object.entries(pinned)) if (r) { left.set(r, (left.get(r) ?? 0) - 1); mates.get(r)?.push(s) }
    const order = free(students).map((s) => [rnd(), s] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1])
    for (const s of order) {
      let pick: string | null = null, cost = Infinity
      for (const r of rooms) {
        if ((left.get(r.id) ?? 0) <= 0) continue
        const c = mates.get(r.id)!.filter((x) => h.pairs.has(pairKey(s, x))).length * PAIR + (h.rooms.get(s)?.has(r.id) ? ROOM : 0) + rnd() * 0.5
        if (c < cost) { cost = c; pick = r.id }
      }
      place[s] = pick
      if (pick) { left.set(pick, left.get(pick)! - 1); mates.get(pick)!.push(s) }
    }
    const score = penalty(flagsFor(place, rooms, h)) + Object.values(place).filter((r) => !r).length * 100
    if (score < bestScore) { bestScore = score; best = place }
  }
  return best
}

export function nextTerm(term: string) {
  const [a, , q] = term.split('-').map(Number)
  return q < 4 ? `${a}-${a + 1}-${q + 1}` : `${a + 1}-${a + 2}-1`
}
/** The link printed on a bed, wardrobe or nightstand; a phone camera opens it straight in the app. */
export const itemUrl = (code: string) => `${location.origin}${location.pathname}#/dorm/item/${code}`
export function dormCodeFrom(text: string) {
  const m = text.trim().match(/#\/dorm\/item\/(D-[A-Za-z0-9]+)/) ?? text.trim().match(/^(D-[A-Za-z0-9]+)$/i)
  return m ? m[1].toUpperCase() : null
}
/** The Saturday of this weekend (Monday–Saturday look ahead, Sunday looks back); same rule as dorm_weekend_of in SQL. */
export function weekendOf(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`), dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + (dow === 7 ? -1 : 6 - dow))
  return d.toISOString().slice(0, 10)
}
