import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { errText } from '../lib/api'
import { tx } from '../lib/i18n'

/* ---------- routing (hash based, works on any static host) ---------- */
const getPath = () => location.hash.slice(1) || '/'
export function usePath() {
  const [p, setP] = useState(getPath)
  useEffect(() => { const f = () => { setP(getPath()); window.scrollTo(0, 0) }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return p
}
export const go = (path: string) => { location.hash = path }

/* ---------- data loading ---------- */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => { set((s) => ({ ...s, loading: true })); fn().then((data) => set({ data, loading: false }), (e) => set({ error: errText(e), loading: false })) }, deps)
  useEffect(run, [run])
  return { ...state, reload: run }
}

/* ---------- icons (Lucide-style strokes, drawn here) ---------- */
const P: Record<string, string> = {
  code: 'm8 7-5 5 5 5M16 7l5 5-5 5', sigma: 'M18 5H6l6 7-6 7h12', flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  atom: 'M12 12h.01M12 3c3 0 4 4 4 9s-1 9-4 9-4-4-4-9 1-9 4-9zM3.5 7.5c1.5-2.6 5.6-1.5 9.9 1s7.1 5.7 5.6 8.3-5.6 1.5-9.9-1-7.1-5.7-5.6-8.3z',
  leaf: 'M5 21c0-9 6-15 15-16-1 9-7 15-15 16zM5 21l7-7', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 19V5', trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M10 17h4',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7l4 3-1.5 5h-5L8 10z', music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  plus: 'M12 5v14M5 12h14',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  chev: 'm9 6 6 6-6 6', back: 'm15 6-6 6 6 6', x: 'M6 6l12 12M18 6 6 18',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M22 21c0-3-2-5-5-5.5',
  check: 'M5 12.5 10 17l9-10', file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6', userplus: 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21c0-4 3-6 7-6 2 0 3.5.5 4.5 1.3M19 14v6M16 17h6',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  chat: 'M4 5h16v11H9l-5 4z', send: 'M4 12 20 4l-6 16-3-7z', megaphone: 'M3 10v4h4l7 4V6L7 10zM17 9a3 3 0 0 1 0 6',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3', flag: 'M5 21V4h11l-2 4 2 4H5', poll: 'M5 20V10M12 20V4M19 20v-7',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  more: 'M5 12h.01M12 12h.01M19 12h.01', utensils: 'M7 3v7M4 3v7a3 3 0 0 0 6 0V3M7 13v8M17 3v18M14 9h6', settings: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01', star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
}
export const Icon = ({ n, size = 20, className = '' }: { n: keyof typeof P | string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}><path d={P[n]} /></svg>
)

/* ---------- primitives ---------- */
type BtnProps = { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'ghost' | 'danger'; block?: boolean; disabled?: boolean; loading?: boolean; type?: 'button' | 'submit' }
export function Button({ children, onClick, kind = 'primary', block, disabled, loading, type = 'button' }: BtnProps) {
  const k = { primary: 'bg-accent text-on-accent', secondary: 'bg-accent-soft text-accent', ghost: 'text-accent', danger: 'bg-danger-soft text-danger' }[kind]
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} aria-busy={loading}
      className={`${k} ${block ? 'w-full h-[52px]' : 'h-11'} inline-flex items-center justify-center gap-2 rounded-md px-4 font-semibold transition active:scale-[.98] active:opacity-85 disabled:opacity-40`}>
      {loading && <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`bg-surface rounded-lg shadow-card border border-[var(--card-line,transparent)] p-4 ${className}`}>{children}</div>
)

const TONE = { ok: 'bg-success-soft text-success', late: 'bg-late-soft text-late', warn: 'bg-warning-soft text-warning', bad: 'bg-danger-soft text-danger', muted: 'bg-surface-2 text-muted', accent: 'bg-accent-soft text-accent' }
export type Tone = keyof typeof TONE
const TYPE_TONE = { 1: 'bg-accent-soft text-accent', 2: 'bg-warning-soft text-warning', 3: 'bg-danger text-on-accent' } as const
/** Session type chip; «өте маңызды» (3) is filled red with a flag so it stands out in every calendar. */
export const TypeBadge = ({ t }: { t: { name: string; importance: 1 | 2 | 3 } }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 text-xs font-bold align-middle ${TYPE_TONE[t.importance]}`}>
    {t.importance === 3 && <Icon n="flag" size={12} />}{t.name}
  </span>
)

export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={`${TONE[tone]} inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap`}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden />{children}
  </span>
)

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId(); const d = hint || error ? `${id}-d` : undefined
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children(id, d)}
      {(error || hint) && <p id={d} className={`text-sm ${error ? 'text-danger' : 'text-muted'}`}>{error || hint}</p>}
    </div>
  )
}
export const inputCls = 'h-12 w-full rounded-md border border-input bg-surface px-3 text-fg focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft'

export const Empty = ({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) => (
  <div className="grid justify-items-center gap-1.5 text-center py-10 px-4">
    <Icon n={icon} size={40} className="text-muted" />
    <p className="font-semibold">{title}</p>
    {text && <p className="text-sm text-muted max-w-[34ch]">{text}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
)

export const Skeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="grid gap-3" aria-busy="true" aria-label={tx('Жүктелуде')}>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="h-20 rounded-lg bg-surface-2 animate-pulse" />)}
  </div>
)

export const ErrorBox = ({ text, retry }: { text: string; retry?: () => void }) => (
  <div role="alert" className="rounded-lg bg-danger-soft text-danger p-4 grid gap-2">
    <p className="font-semibold">{text}</p>
    {retry && <div><Button kind="ghost" onClick={retry}>{tx('Қайта жүктеу')}</Button></div>}
  </div>
)

export function Chips<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto py-1 -mx-1 px-1 [scrollbar-width:none]">
      {items.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={`h-9 px-3.5 rounded-full text-sm whitespace-nowrap ${v === value ? 'bg-accent text-on-accent font-semibold' : 'bg-surface-2'}`}>{t}</button>
      ))}
    </div>
  )
}

/* ---------- bottom sheet ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => { removeEventListener('keydown', k); prev?.focus() }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] max-h-[90dvh] overflow-y-auto bg-surface rounded-t-lg shadow-pop pb-[max(16px,env(safe-area-inset-bottom))] outline-none">
        <div className="sticky top-0 bg-surface flex items-center gap-2 px-4 pt-3 pb-2 border-b border-line">
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tx('Жабу')} className="size-11 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="x" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

/* ---------- toast ---------- */
let pushToast: (t: string) => void = () => {}
export const toast = (t: string) => pushToast(t)
export function Toaster() {
  const [t, setT] = useState<string | null>(null)
  useEffect(() => { pushToast = (m) => { setT(m); setTimeout(() => setT(null), 3000) } }, [])
  return t ? <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 rounded-md bg-fg text-bg px-4 py-3 text-sm shadow-pop max-w-[90vw]">{t}</div> : null
}

export const PageHead = ({ title, back, right }: { title: string; back?: boolean; right?: ReactNode }) => (
  <div className="flex items-center gap-1 min-h-14">
    {back && <button type="button" onClick={() => history.length > 1 ? history.back() : go('/')} aria-label={tx('Артқа')} className="tg-hide size-11 -ml-3 grid place-items-center"><Icon n="back" /></button>}
    <h1 className="flex-1 text-xl font-bold text-balance">{title}</h1>
    {right}
  </div>
)

/** iOS-style on/off switch; the whole row is the touch target. */
export function Switch({ label, hint, on, onChange, disabled }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="w-full flex items-center gap-3 min-h-14 py-2 text-left disabled:opacity-50">
      <span className="flex-1 min-w-0"><span className="block font-semibold">{label}</span>{hint && <span className="block text-sm text-muted">{hint}</span>}</span>
      <span aria-hidden className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${on ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow-card transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
