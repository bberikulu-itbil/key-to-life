import { Component, type ReactNode } from 'react'
import { supabase } from '../lib/api'
import { tx } from '../lib/i18n'

/** Writes a crash to client_errors (best effort: signed-out errors are simply dropped by RLS). */
export function reportError(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e))
  supabase.auth.getSession().then(({ data }) => data.session && supabase.from('client_errors').insert({
    message: err.message.slice(0, 2000), stack: err.stack?.slice(0, 8000) ?? null, path: location.hash.slice(0, 300), ua: navigator.userAgent.slice(0, 400),
  })).then(() => {}, () => {})
}

/** Instead of a blank screen: the error, and a way back. */
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { reportError(error) }
  render() {
    const e = this.state.error
    if (!e) return this.props.children
    return (
      <main className="min-h-dvh grid place-items-center px-6 text-center">
        <div className="grid gap-3 max-w-sm">
          <h1 className="text-xl font-bold">{tx('Қате шықты')}</h1>
          <p className="text-sm text-muted break-words">{e.message}</p>
          <button type="button" onClick={() => { location.hash = '#/'; location.reload() }} className="h-12 rounded-md bg-accent text-on-accent font-semibold">{tx('Қайта жүктеу')}</button>
        </div>
      </main>
    )
  }
}
