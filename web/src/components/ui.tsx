import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { errText } from '../lib/api'

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
  more: 'M5 12h.01M12 12h.01M19 12h.01', settings: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01', star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
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
  <div className="grid gap-3" aria-busy="true" aria-label="Жүктелуде">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="h-20 rounded-lg bg-surface-2 animate-pulse" />)}
  </div>
)

export const ErrorBox = ({ text, retry }: { text: string; retry?: () => void }) => (
  <div role="alert" className="rounded-lg bg-danger-soft text-danger p-4 grid gap-2">
    <p className="font-semibold">{text}</p>
    {retry && <div><Button kind="ghost" onClick={retry}>Қайта жүктеу</Button></div>}
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
          <button type="button" onClick={onClose} aria-label="Жабу" className="size-11 grid place-items-center rounded-md hover:bg-surface-2"><Icon n="x" /></button>
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
    {back && <button type="button" onClick={() => history.length > 1 ? history.back() : go('/')} aria-label="Артқа" className="tg-hide size-11 -ml-3 grid place-items-center"><Icon n="back" /></button>}
    <h1 className="flex-1 text-xl font-bold text-balance">{title}</h1>
    {right}
  </div>
)
