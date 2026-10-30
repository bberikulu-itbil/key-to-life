import { useState } from 'react'
import { MBTI, MBTI_AXES, mbtiScore, type MbtiItem } from '../lib/mbti'
import { MI_KINDS, miScore } from '../lib/mi'
import { Button, Card, toast } from './ui'
import { lang as appLang, tx } from '../lib/i18n'

/* The 70-item test inside a survey: every question in Kazakh and Russian, seven circles from the left choice to the right one. */

const SIZES = [44, 38, 32, 26, 32, 38, 44]
const LEFT = '#8b5cf6', RIGHT = '#16a34a'
const circle = (v: number, on: boolean) => {
  const c = v < 0 ? LEFT : v > 0 ? RIGHT : '#94a3b8'
  return { width: SIZES[v + 3], height: SIZES[v + 3], borderColor: c, background: on ? c : 'transparent' }
}
const INTRO: [string, string] = ['Дұрыс не бұрыс жауап жоқ. Өзіңе қайсысы жақын болса, сол жаққа жақын шеңберді таңда. Екеуі де бірдей болса — ортасын.',
  'Правильных и неправильных ответов нет. Выбери кружок ближе к тому, что больше похоже на тебя. Если одинаково — средний.']
export const MI_INTRO: [string, string] = ['Дұрыс не бұрыс жауап жоқ. Сөйлем саған қаншалық сәйкес келеді? Мүлде келіспесең — ең сол жақ, толық келіссең — ең оң жақ, екіұдай болсаң — ортасы.',
  'Правильных и неправильных ответов нет. Насколько фраза про тебя? Совсем не согласен — крайний левый кружок, полностью согласен — крайний правый, не уверен — средний.']
const WHERE = [tx('толық сол жақ'), tx('көбіне сол жақ'), tx('сәл сол жақ'), tx('ортасы'), tx('сәл оң жақ'), tx('көбіне оң жақ'), tx('толық оң жақ')]

/** Which language the test is shown in: Kazakh with Russian below, or Russian only. Kept on this phone. */
export type MbtiLang = 'kk' | 'ru'
export function useMbtiLang() {
  const [l, setL] = useState<MbtiLang>(() => {
    try { const v = localStorage.getItem('mbti-lang'); if (v === 'kk' || v === 'ru') return v } catch { /* private mode */ }
    return appLang === 'ru' ? 'ru' : 'kk'
  })
  const set = (v: MbtiLang) => { setL(v); try { localStorage.setItem('mbti-lang', v) } catch { /* private mode */ } }
  return [l, set] as const
}
export function MbtiLangSwitch({ value, onChange }: { value: MbtiLang; onChange: (v: MbtiLang) => void }) {
  return (
    <div role="radiogroup" aria-label="Тіл · Язык" className="flex rounded-full bg-surface-2 p-1 text-sm font-semibold">
      {(['kk', 'ru'] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} onClick={() => onChange(l)}
          className={`h-8 px-3 rounded-full transition-colors ${value === l ? 'bg-surface text-accent shadow-sm' : 'text-muted'}`}>{l === 'kk' ? 'ҚАЗ' : 'РУС'}</button>
      ))}
    </div>
  )
}

export function MbtiAnswer({ value, onChange, disabled, lang = 'kk', items = MBTI, intro = INTRO }: { value: (number | null)[]; onChange: (v: (number | null)[]) => void; disabled?: boolean; lang?: MbtiLang; items?: MbtiItem[]; intro?: [string, string] }) {
  const ru = lang === 'ru'
  const done = value.filter((v) => v != null).length
  const pick = (i: number, v: number) => {
    const first = value[i] == null
    onChange(value.map((x, j) => (j === i ? v : x)))
    // the next question comes up by itself the first time
    if (first) setTimeout(() => document.getElementById(`mbti-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[var(--bg)]/95 backdrop-blur">
        <div className="flex items-center justify-between text-sm font-semibold"><span>{ru ? 'Вопросы' : 'Сұрақтар'}</span><span className="tabular-nums">{done} / {items.length}</span></div>
        <div className="mt-1.5 h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${(100 * done) / items.length}%` }} /></div>
      </div>
      <Card className="grid gap-1 bg-accent-soft">
        {/* the test is always shown in both languages, whatever the app's language */}
        <p className="text-sm">{intro[ru ? 1 : 0]}</p>
      </Card>
      {items.map((it, i) => (
        <Card key={i} className={`grid gap-3 scroll-mt-24 ${value[i] == null ? '' : 'opacity-90'}`}>
          <div id={`mbti-${i}`} className="grid gap-0.5">
            <p className="text-xs text-muted tabular-nums">{i + 1} / {items.length}</p>
            <p className="font-semibold text-[17px] leading-snug">{it.q[ru ? 1 : 0]}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <p className="text-[15px] font-medium leading-snug" style={{ color: LEFT }}>{it.a[ru ? 1 : 0]}</p>
            <p className="text-right text-[15px] font-medium leading-snug" style={{ color: RIGHT }}>{it.b[ru ? 1 : 0]}</p>
          </div>
          <div role="radiogroup" aria-label={it.q[ru ? 1 : 0]} className="flex items-center justify-between px-1">
            {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={value[i] === v} disabled={disabled} onClick={() => pick(i, v)}
                aria-label={`${i + 1}: ${WHERE[v + 3]}`} className="grid place-items-center size-11 disabled:opacity-60">
                <span className="rounded-full border-2 transition-colors" style={circle(v, value[i] === v)} />
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Results: each child's letters with the strength of every side, and the 70 circles to type into the original site. */
export function MbtiResults({ rows, at }: { rows: { respondent: string | null; class_name: string | null; answers: unknown[] }[]; at: number }) {
  const [open, setOpen] = useState<number | null>(null)
  const list = rows.map((r) => ({ ...r, ans: (r.answers[at] ?? []) as number[] })).map((r) => ({ ...r, s: mbtiScore(r.ans) }))
  const counts = new Map<string, number>()
  for (const r of list) counts.set(r.s.type, (counts.get(r.s.type) ?? 0) + 1)
  return (
    <div className="grid grid-cols-1 gap-3">
      <Card className="grid gap-2">
        <p className="font-semibold">{tx('Типтер')}</p>
        <div className="flex flex-wrap gap-2">{[...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <span key={t} className="h-8 px-3 rounded-full bg-accent-soft text-accent font-bold text-sm grid place-items-center tabular-nums">{t} · {n}</span>
        ))}</div>
        <p className="text-xs text-muted">{tx('Есеп шамамен: түпнұсқа сайт басқаша есептеуі мүмкін. Нәтижені баламен әңгімелесу үшін қолданыңыз, белгі ретінде емес.')}</p>
      </Card>
      {list.map((r, k) => (
        <Card key={k} className="grid gap-3">
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{r.respondent ?? tx('Аноним')}</span>{r.class_name && <span className="block text-xs text-muted">{r.class_name}</span>}</span>
            <span className="text-xl font-bold tracking-wider text-accent">{r.s.type}</span>
          </div>
          {MBTI_AXES.map(([a, b], x) => (
            <div key={a} className="grid grid-cols-[1.5rem_1fr_1.5rem] items-center gap-2 text-sm font-semibold">
              <span style={{ color: LEFT }}>{a}</span>
              <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: RIGHT }}><div className="absolute inset-y-0 left-0" style={{ width: `${r.s.pct[x]}%`, background: LEFT }} /></div>
              <span className="text-right" style={{ color: RIGHT }}>{b}</span>
              <span className="col-start-2 -mt-1.5 flex justify-between text-xs text-muted tabular-nums"><span>{r.s.pct[x]}%</span><span>{100 - r.s.pct[x]}%</span></span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Button kind="ghost" onClick={() => setOpen(open === k ? null : k)}>{open === k ? tx('Жасыру') : tx('70 жауап')}</Button>
            <Button kind="secondary" onClick={() => copy(r.ans)}>{tx('Көшіру')}</Button>
          </div>
          {open === k && <AnswerGrid ans={r.ans} />}
        </Card>
      ))}
    </div>
  )
}

const copy = async (ans: number[]) => {
  try { await navigator.clipboard.writeText(ans.map((v, k) => `${k + 1}: ${v + 4}`).join('\n')); toast(tx('Көшірілді')) } catch { toast(tx('Көшіру мүмкін болмады')) }
}
function AnswerGrid({ ans }: { ans: number[] }) {
  return (
    <>
      <p className="text-xs text-muted">{tx('Сан — сайттағы шеңбердің реті: 1 = ең сол жақ, 4 = ортасы, 7 = ең оң жақ.')}</p>
      <div className="grid grid-cols-7 gap-1">
        {ans.map((v, q) => (
          <div key={q} className="rounded-md bg-surface-2 px-1 py-1 text-center">
            <span className="block text-[10px] text-muted tabular-nums">{q + 1}</span>
            <span className="block text-sm font-bold tabular-nums" style={{ color: v < 0 ? LEFT : v > 0 ? RIGHT : undefined }}>{v + 4}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Multiple intelligences: each child's nine scores, strongest first, and the 90 circles to type into the original site. */
export function MiResults({ rows, at }: { rows: { respondent: string | null; class_name: string | null; answers: unknown[] }[]; at: number }) {
  const [open, setOpen] = useState<number | null>(null)
  const ru = appLang === 'ru'
  const list = rows.map((r) => ({ ...r, ans: (r.answers[at] ?? []) as number[] })).map((r) => ({ ...r, s: miScore(r.ans) }))
  const top = (s: number[]) => s.map((v, k) => [k, v]).sort((a, b) => b[1] - a[1])
  // how many children have each intelligence as their strongest
  const lead = Array(9).fill(0)
  for (const r of list) lead[top(r.s)[0][0]]++
  return (
    <div className="grid grid-cols-1 gap-3">
      <Card className="grid gap-2">
        <p className="font-semibold">{tx('Ең күшті жағы')}</p>
        <div className="flex flex-wrap gap-2">{top(lead).filter(([, n]) => n).map(([k, n]) => (
          <span key={k} className="h-8 px-3 rounded-full bg-accent-soft text-accent font-semibold text-sm grid place-items-center tabular-nums">{MI_KINDS[k][ru ? 1 : 0]} · {n}</span>
        ))}</div>
        <p className="text-xs text-muted">{tx('Есеп шамамен: түпнұсқа сайт басқаша есептеуі мүмкін. Нәтижені баламен әңгімелесу үшін қолданыңыз, белгі ретінде емес.')}</p>
      </Card>
      {list.map((r, k) => (
        <Card key={k} className="grid gap-2.5">
          <span className="min-w-0"><span className="block font-semibold truncate">{r.respondent ?? tx('Аноним')}</span>{r.class_name && <span className="block text-xs text-muted">{r.class_name}</span>}</span>
          {top(r.s).map(([x, v], j) => (
            <div key={x} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span className={`truncate ${j < 3 ? 'font-semibold' : 'text-muted'}`}>{MI_KINDS[x][ru ? 1 : 0]}</span>
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v}%`, background: j < 3 ? RIGHT : '#94a3b8' }} /></div>
              <span className="text-right tabular-nums text-muted">{v}%</span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Button kind="ghost" onClick={() => setOpen(open === k ? null : k)}>{open === k ? tx('Жасыру') : tx('{0} жауап', r.ans.length)}</Button>
            <Button kind="secondary" onClick={() => copy(r.ans)}>{tx('Көшіру')}</Button>
          </div>
          {open === k && <AnswerGrid ans={r.ans} />}
        </Card>
      ))}
    </div>
  )
}
