import type { StudentFamilyContact, StudentHealthProfile, StudentProfileDetails } from '../lib/api'
import type { RoadmapHabit, StudentRoadmap } from '../lib/mentor'
import { addDays, fmtDate, today } from '../lib/time'
import { lang, tx } from '../lib/i18n'
import { Icon } from './ui'

/** Small pieces of the redesigned dossier, shared by its tabs. */

const isoDow = (d: string) => { const n = new Date(d + 'T00:00:00').getDay(); return n === 0 ? 7 : n }
const LETTERS: Record<string, string[]> = { kk: ['Д', 'С', 'С', 'Б', 'Ж', 'С', 'Ж'], ru: ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'], tr: ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] }
const dayLetter = (d: string) => (LETTERS[lang] ?? LETTERS.kk)[isoDow(d) - 1]

/** Monday–Sunday grid: one row per habit, a filled square for each day it was done. */
export function WeekHabits({ habits }: { habits: RoadmapHabit[] }) {
  const list = habits.filter((h) => !h.archived)
  if (!list.length) return <p className="text-sm text-muted">{tx('Әдет қосылмаған')}</p>
  const t0 = today()
  const monday = addDays(t0, 1 - isoDow(t0))
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,18px)] gap-1.5 text-[11px] text-muted text-center"><span />{week.map((d) => <span key={d} className={d === t0 ? 'font-bold text-accent' : ''}>{dayLetter(d)}</span>)}</div>
      {list.map((h) => {
        const checks = new Set(h.checks ?? [])
        return (
          <div key={h.id} className="grid grid-cols-[minmax(0,1fr)_repeat(7,18px)] gap-1.5 items-center">
            <span className="text-sm truncate" title={h.title}>{h.title}</span>
            {week.map((d) => <span key={d} title={fmtDate(d)} className={`size-[18px] rounded-md ${checks.has(d) ? 'bg-accent' : d > t0 ? 'ring-1 ring-inset ring-line' : 'bg-surface-2'}`} />)}
          </div>
        )
      })}
    </div>
  )
}

/** Upcoming deadlines from open tasks and goals, nearest first; overdue ones are marked. */
export function Deadlines({ roadmap, limit = 6 }: { roadmap: StudentRoadmap; limit?: number }) {
  const t0 = today()
  const rows = [
    ...roadmap.tasks.filter((t) => !t.done && t.due_on).map((t) => ({ id: t.id, title: t.title, due: t.due_on!, goal: false })),
    ...roadmap.goals.filter((g) => !g.done && g.due_on).map((g) => ({ id: g.id, title: g.title, due: g.due_on!, goal: true })),
  ].sort((a, b) => a.due.localeCompare(b.due)).slice(0, limit)
  if (!rows.length) return <p className="text-sm text-muted">{tx('Мерзімі бар іс жоқ')}</p>
  return (
    <div className="grid gap-1.5">
      {rows.map((r) => {
        const late = r.due < t0
        const soon = !late && r.due <= addDays(t0, 3)
        return (
          <div key={r.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${late ? 'bg-danger-soft' : soon ? 'bg-warning-soft' : 'bg-surface-2'}`}>
            <span className={`w-16 shrink-0 text-xs font-bold ${late ? 'text-danger' : soon ? 'text-warning' : 'text-muted'}`}>{fmtDate(r.due)}</span>
            {r.goal && <Icon n="target" size={14} className="text-accent shrink-0" />}
            <span className="text-sm font-semibold min-w-0 truncate">{r.title}</span>
          </div>
        )
      })}
    </div>
  )
}

/** «Мен кіммін»: the student's own words and test codes in one band at the top of Бағыт. */
export function DirectionSummary({ mbti, holland, gallup, answers }: { mbti: string; holland: string; gallup: string[]; answers: Record<string, string> }) {
  const lines = ([['interests', tx('Қызығатыны')], ['dream', tx('Арман мамандығы')], ['goal', tx('Осы жылғы мақсаты')]] as const)
    .map(([k, label]) => [label, answers[k]?.trim() ?? ''] as const).filter(([, v]) => v)
  const codes = [mbti && mbti !== '—' ? `MBTI ${mbti}` : '', holland ? `${tx('Холланд')} ${holland}` : '', ...gallup.slice(0, 3)].filter(Boolean)
  return (
    <section className="rounded-2xl bg-accent text-on-accent p-4 @3xl:p-5 grid gap-3">
      <p className="text-xs font-semibold opacity-75">{tx('Мен кіммін · қорытынды')}</p>
      {lines.length ? (
        <div className="grid gap-1.5">
          {lines.map(([label, v]) => <p key={label} className="text-sm leading-snug"><span className="opacity-75">{label}: </span><span className="font-semibold">{v}</span></p>)}
        </div>
      ) : <p className="text-sm opacity-90">{tx('Оқушымен бірге анкета сұрақтарын толтырыңыз: қызығушылығы, арманы, осы жылғы мақсаты.')}</p>}
      {codes.length > 0 && <div className="flex flex-wrap gap-1.5">{codes.map((c) => <span key={c} className="h-7 px-2.5 rounded-full bg-white/15 text-xs font-semibold flex items-center">{c}</span>)}</div>}
    </section>
  )
}

/** Top of «Мәліметтер»: who can see it, and how complete the record is with what is still missing. */
export function PrivateSummary({ profile, health, family }: { profile: StudentProfileDetails | null; health: StudentHealthProfile | null; family: StudentFamilyContact[] }) {
  const mother = family.find((f) => f.relationship === 'mother')
  const father = family.find((f) => f.relationship === 'father')
  const checks: [string, boolean][] = [
    [tx('туған күні'), Boolean(profile?.birthday)],
    [tx('ЖСН'), Boolean(profile?.iin)],
    [tx('ұлты'), Boolean(profile?.nation)],
    [tx('қаласы'), Boolean(profile?.city)],
    [tx('мекенжайы'), Boolean(profile?.address)],
    [tx('анасының телефоны'), Boolean(mother?.phone)],
    [tx('әкесінің телефоны'), Boolean(father?.phone)],
    [tx('ата-ананың жұмыс орны'), Boolean(mother?.workplace || father?.workplace)],
    [tx('денсаулық мәліметі'), Boolean(health && (health.diet || health.allergies || health.chronic_conditions || health.extra_notes || health.needs_attention))],
  ]
  const ok = checks.filter(([, v]) => v).length
  const pct = Math.round((100 * ok) / checks.length)
  const missing = checks.filter(([, v]) => !v).map(([k]) => k)
  return (
    <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_20rem] gap-3">
      <p className="rounded-xl bg-warning-soft text-warning text-sm font-semibold px-4 py-3 flex items-center gap-2.5">
        <Icon n="lock" size={17} className="shrink-0" />
        {tx('Жабық бөлім: тек сынып жетекшісі мен әкімшілікке көрінеді. «Оқушымен бірге» режимінде толық жасырылады.')}
      </p>
      <div className="rounded-xl bg-surface-2 px-4 py-3 grid gap-1.5">
        <div className="flex justify-between text-sm font-bold"><span>{tx('Толтырылуы')}</span><span className={pct < 70 ? 'text-warning' : 'text-success'}>{pct}%</span></div>
        <span className="h-2 rounded-full bg-surface overflow-hidden"><span className={`block h-full ${pct < 70 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${pct}%` }} /></span>
        <p className="text-xs text-muted">{missing.length ? tx('Жетіспейді: {0}', missing.join(', ')) : tx('Барлығы толтырылған')}</p>
      </div>
    </div>
  )
}
