import { useEffect, useState } from 'react'
import { ORNAMENT, SWALLOW } from './bilLogo'

/* The opening animation with the BIL logo.
   'books' (scenario 2): the three books fall one after another, the ornament grows around them, the swallow flies in.
   'fly' (scenario 1): the ornament appears and the whole swallow flies into it.
   The books are cut out of the one swallow path by rotated strips (the books lie at -30°). */
export type SplashKind = 'books' | 'fly'

const CSS = `
.kl-splash{position:fixed;inset:0;z-index:100;display:grid;place-items:center;align-content:center;gap:20px;background:#fbfaf6;animation:kl-out .35s ease-in var(--out) forwards}
.kl-splash svg{width:min(62vw,280px);height:auto;overflow:visible}
.kl-splash g{transform-box:view-box}
.kl-b{opacity:0;animation:kl-drop .45s cubic-bezier(.2,.8,.3,1.2) forwards}
.kl-orn{opacity:0;transform-origin:162px 160px;animation:kl-orn .55s cubic-bezier(.2,.8,.2,1) forwards}
.kl-bird{opacity:0;transform-origin:250px 120px;animation:kl-fly .75s cubic-bezier(.2,.8,.25,1.05) forwards}
.kl-word{opacity:0;font:700 20px Unbounded,Inter,system-ui,sans-serif;color:#16264f;letter-spacing:.5px;animation:kl-up .4s ease-out forwards}
@keyframes kl-drop{0%{opacity:0;transform:translateY(-150px)}60%{opacity:1;transform:translateY(5px)}100%{opacity:1;transform:none}}
@keyframes kl-orn{0%{opacity:0;transform:scale(.55) rotate(-30deg)}100%{opacity:1;transform:none}}
@keyframes kl-fly{0%{opacity:0;transform:translate(230px,-210px) rotate(-18deg) scale(.45)}70%{opacity:1;transform:translate(-5px,4px) rotate(2deg) scale(1.03)}100%{opacity:1;transform:none}}
@keyframes kl-up{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}
@keyframes kl-out{to{opacity:0;visibility:hidden}}
`
// seconds: when each part starts, and when the whole screen fades away
const T = {
  books: { b: [0, 0.2, 0.4], orn: 0.75, bird: 1.05, word: 1.6, out: 2.2 },
  fly: { b: [0, 0, 0], orn: 0, bird: 0.3, word: 1.1, out: 1.8 },
}

export default function Splash({ kind = 'books' }: { kind?: SplashKind }) {
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [on, setOn] = useState(!reduced)
  const t = T[kind]
  useEffect(() => { if (on) { const id = setTimeout(() => setOn(false), (t.out + 0.4) * 1000); return () => clearTimeout(id) } }, [on, t.out])
  if (!on) return null
  const d = (s: number) => ({ animationDelay: `${s}s` })
  const book = (id: string) => <path d={SWALLOW} clipPath={`url(#kl-${id})`} />
  return (
    // a tap skips it
    <div className="kl-splash" style={{ ['--out' as string]: `${t.out}s` }} onClick={() => setOn(false)} aria-hidden>
      <style>{CSS}</style>
      <svg viewBox="0 0 325 321">
        <defs>
          <clipPath id="kl-b1"><rect transform="rotate(-30)" x="-80" y="140" width="220" height="66" /></clipPath>
          <clipPath id="kl-b2"><rect transform="rotate(-30)" x="-150" y="206" width="218" height="54" /><rect transform="rotate(-30)" x="-150" y="259" width="115" height="30" /></clipPath>
          <clipPath id="kl-b3"><rect transform="rotate(-30)" x="-35" y="260" width="185" height="70" /></clipPath>
          <clipPath id="kl-bd"><rect transform="rotate(-30)" x="140" y="0" width="300" height="206" /><rect transform="rotate(-30)" x="68" y="206" width="380" height="54" />
            <rect transform="rotate(-30)" x="150" y="260" width="300" height="90" /><rect transform="rotate(-30)" x="-300" y="-200" width="800" height="340" /></clipPath>
        </defs>
        <g className="kl-orn" style={d(t.orn)}><path d={ORNAMENT} fill="#C9B291" /></g>
        {kind === 'books' ? <g fill="#111">
          <g className="kl-b" style={d(t.b[0])}>{book('b1')}</g>
          <g className="kl-b" style={d(t.b[1])}>{book('b2')}</g>
          <g className="kl-b" style={d(t.b[2])}>{book('b3')}</g>
          <g className="kl-bird" style={d(t.bird)}>{book('bd')}</g>
        </g> : <g className="kl-bird" style={d(t.bird)}><path d={SWALLOW} fill="#111" /></g>}
      </svg>
      <p className="kl-word" style={d(t.word)}>Key To Life</p>
    </div>
  )
}
