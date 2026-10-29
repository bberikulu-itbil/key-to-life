import { useId, type ReactNode } from 'react'

/* Small 3D-looking pictures for the «+» menu tiles, drawn in SVG: a light face, a darker extruded side,
   a soft shadow and a gloss. Original drawings, no assets. */

export type ArtKind = 'qr' | 'pass' | 'book' | 'feed' | 'idea' | 'plan' | 'habit' | 'user' | 'lost' | 'place' | 'food' | 'poll'

export default function MenuArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  const id = useId().replace(/:/g, '')
  const g = (n: string) => `url(#${id}${n})`
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={`pointer-events-none select-none drop-shadow-[0_10px_14px_rgba(0,0,0,.28)] ${className}`}>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dfe5f0" /></linearGradient>
        <linearGradient id={`${id}ws`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9c3d6" /><stop offset="1" stopColor="#8f9bb3" /></linearGradient>
        <linearGradient id={`${id}gd`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6d77a" /><stop offset=".55" stopColor="#d4a73a" /><stop offset="1" stopColor="#a87c1f" /></linearGradient>
        <linearGradient id={`${id}gs`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a87c1f" /><stop offset="1" stopColor="#7d5a12" /></linearGradient>
        <linearGradient id={`${id}nv`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2c4682" /><stop offset="1" stopColor="#101c3d" /></linearGradient>
        <linearGradient id={`${id}rd`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff8a7a" /><stop offset="1" stopColor="#d9463a" /></linearGradient>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <radialGradient id={`${id}ball`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#ffffff" /><stop offset=".45" stopColor="#e9eef7" /><stop offset="1" stopColor="#9fadc6" /></radialGradient>
        <radialGradient id={`${id}gball`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#fff3c4" /><stop offset=".4" stopColor="#e2b84d" /><stop offset="1" stopColor="#9a6f16" /></radialGradient>
        <radialGradient id={`${id}grn`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#c9f7d6" /><stop offset=".45" stopColor="#4fc275" /><stop offset="1" stopColor="#1f7a41" /></radialGradient>
      </defs>

      {kind === 'qr' && <g transform="rotate(-10 50 50)">
        <rect x="18" y="20" width="64" height="64" rx="12" fill={g('ws')} transform="translate(4 6)" />
        <rect x="18" y="20" width="64" height="64" rx="12" fill={g('w')} />
        {[[26, 28], [58, 28], [26, 60]].map(([x, y]) => <g key={`${x}${y}`}><rect x={x} y={y} width="16" height="16" rx="3" fill={g('nv')} /><rect x={x + 4.5} y={y + 4.5} width="7" height="7" rx="1.5" fill="#fff" /></g>)}
        {[[47, 29], [47, 37], [51, 45], [60, 50], [68, 50], [47, 53], [60, 60], [68, 66], [52, 66], [60, 72], [74, 72], [47, 74]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1.2" fill={g('nv')} />)}
        <path d="M14 34V22a6 6 0 0 1 6-6h12M68 16h12a6 6 0 0 1 6 6v12M86 70v12a6 6 0 0 1-6 6H68M32 88H20a6 6 0 0 1-6-6V70" fill="none" stroke={g('gd')} strokeWidth="5" strokeLinecap="round" />
        <rect x="20" y="22" width="60" height="18" rx="9" fill={g('gl')} opacity=".6" />
      </g>}

      {kind === 'pass' && <g transform="rotate(-14 50 50)">
        <path d="M16 30h68v12a7 7 0 0 0 0 14v12H16V56a7 7 0 0 0 0-14z" fill={g('ws')} transform="translate(3 5)" />
        <path d="M16 30h68v12a7 7 0 0 0 0 14v12H16V56a7 7 0 0 0 0-14z" fill={g('w')} />
        <path d="M16 30h68v9H16z" fill={g('gd')} />
        <circle cx="36" cy="54" r="10" fill={g('nv')} /><path d="M36 48v6l4 3" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <rect x="52" y="47" width="24" height="4" rx="2" fill="#9aa6bd" /><rect x="52" y="55" width="16" height="4" rx="2" fill="#c3cbdb" />
        <circle cx="80" cy="26" r="11" fill={g('grn')} /><path d="m75 26 4 4 6-7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>}

      {kind === 'book' && <g transform="rotate(8 50 50)">
        <rect x="18" y="22" width="62" height="60" rx="11" fill={g('ws')} transform="translate(4 6)" />
        <rect x="18" y="22" width="62" height="60" rx="11" fill={g('w')} />
        <path d="M18 33a11 11 0 0 1 11-11h40a11 11 0 0 1 11 11v5H18z" fill={g('rd')} />
        <rect x="32" y="14" width="6" height="16" rx="3" fill={g('nv')} /><rect x="60" y="14" width="6" height="16" rx="3" fill={g('nv')} />
        {[0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={26 + c * 12} y={46 + r * 10} width="8" height="6" rx="2" fill={r === 1 && c === 2 ? '#d9463a' : '#c3cbdb'} />))}
        <circle cx="76" cy="74" r="12" fill={g('gball')} /><path d="M76 68v6l4 2" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </g>}

      {kind === 'feed' && <g>
        <g transform="rotate(-8 50 50)">
          <rect x="22" y="18" width="52" height="66" rx="9" fill={g('ws')} transform="translate(4 5)" />
          <rect x="22" y="18" width="52" height="66" rx="9" fill={g('w')} />
          <rect x="30" y="28" width="36" height="16" rx="4" fill="#cfd8ea" />
          {[50, 58, 66].map((y, i) => <rect key={y} x="30" y={y} width={i === 2 ? 22 : 36} height="4" rx="2" fill="#aab4c8" />)}
        </g>
        <g transform="rotate(38 66 58)">
          <rect x="60" y="22" width="12" height="52" rx="3" fill={g('gd')} />
          <rect x="60" y="22" width="12" height="8" rx="3" fill="#e46f6f" />
          <path d="M60 74h12l-6 12z" fill="#f2dcb5" /><path d="M64 82h4l-2 4z" fill="#16264f" />
          <rect x="62" y="30" width="3" height="42" rx="1.5" fill="#fff" opacity=".45" />
        </g>
      </g>}

      {kind === 'idea' && <g>
        <ellipse cx="50" cy="86" rx="22" ry="5" fill="#000" opacity=".15" />
        <rect x="34" y="70" width="32" height="12" rx="3" fill={g('nv')} />
        <rect x="44" y="58" width="12" height="14" fill={g('gs')} />
        <path d="M26 20h48v14a24 24 0 0 1-48 0z" fill={g('gd')} />
        <path d="M26 24h-8a10 10 0 0 0 10 16M74 24h8a10 10 0 0 1-10 16" stroke={g('gd')} strokeWidth="5" fill="none" />
        <path d="M31 22h12v14a14 14 0 0 0 5 10 20 20 0 0 1-17-18z" fill="#fff" opacity=".35" />
        <path d="m50 26 3 6 7 1-5 4 1 7-6-3-6 3 1-7-5-4 7-1z" fill="#fff8de" />
      </g>}

      {kind === 'plan' && <g>
        <ellipse cx="44" cy="86" rx="16" ry="4" fill="#000" opacity=".15" />
        <rect x="30" y="16" width="6" height="70" rx="3" fill={g('nv')} />
        <path d="M36 20h40l-9 12 9 12H36z" fill={g('rd')} /><path d="M36 20h40l-4 5H36z" fill="#fff" opacity=".35" />
        <circle cx="33" cy="15" r="5" fill={g('gball')} />
      </g>}

      {kind === 'habit' && <g>
        <circle cx="50" cy="52" r="32" fill={g('grn')} />
        <path d="m35 52 10 10 20-22" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <ellipse cx="42" cy="32" rx="14" ry="7" fill="#fff" opacity=".35" />
      </g>}

      {kind === 'lost' && <g>
        <rect x="20" y="40" width="44" height="40" rx="8" fill="#b9864c" transform="translate(3 4)" />
        <rect x="20" y="40" width="44" height="40" rx="8" fill="#e0ad6c" /><rect x="20" y="40" width="44" height="10" rx="5" fill="#f1c88f" />
        <rect x="38" y="40" width="8" height="40" fill="#c99556" />
        <circle cx="64" cy="40" r="17" fill="#fff" fillOpacity=".35" stroke={g('nv')} strokeWidth="7" />
        <ellipse cx="58" cy="34" rx="7" ry="4" fill="#fff" opacity=".7" />
        <rect x="74" y="50" width="9" height="24" rx="4.5" fill={g('gd')} transform="rotate(-45 78 62)" />
      </g>}

      {kind === 'place' && <g>
        <rect x="24" y="14" width="50" height="74" rx="6" fill={g('ws')} transform="translate(4 3)" />
        <rect x="24" y="14" width="50" height="74" rx="6" fill={g('w')} />
        <rect x="31" y="21" width="36" height="67" rx="3" fill={g('nv')} />
        <rect x="35" y="25" width="28" height="26" rx="2" fill="#2f4c8f" /><rect x="35" y="56" width="28" height="26" rx="2" fill="#2f4c8f" />
        <circle cx="60" cy="56" r="3.5" fill={g('gball')} />
        <rect x="38" y="6" width="22" height="12" rx="4" fill={g('gd')} /><rect x="42" y="10" width="14" height="4" rx="2" fill="#16264f" />
      </g>}

      {kind === 'food' && <g>
        <ellipse cx="50" cy="84" rx="30" ry="6" fill="#000" opacity=".15" />
        <path d="M16 48h68a34 30 0 0 1-68 0z" fill="#c9d3e6" transform="translate(0 4)" />
        <path d="M16 48h68a34 30 0 0 1-68 0z" fill={g('w')} />
        <ellipse cx="50" cy="48" rx="34" ry="8" fill="#e9eef7" />
        <ellipse cx="50" cy="47" rx="29" ry="5.5" fill={g('gd')} />
        <circle cx="40" cy="45" r="4" fill="#e46f6f" /><circle cx="55" cy="44" r="3.5" fill="#5cb876" /><circle cx="62" cy="47" r="3" fill="#e46f6f" />
        <path d="M38 34c-4-5 4-8 0-14M50 32c-4-5 4-8 0-14M62 34c-4-5 4-8 0-14" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".8" />
        <path d="M24 54a28 22 0 0 0 20 22" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".55" />
      </g>}

      {kind === 'poll' && <g>
        <rect x="18" y="20" width="64" height="64" rx="12" fill={g('ws')} transform="translate(4 5)" />
        <rect x="18" y="20" width="64" height="64" rx="12" fill={g('w')} />
        <rect x="28" y="52" width="10" height="22" rx="3" fill={g('gd')} />
        <rect x="45" y="36" width="10" height="38" rx="3" fill={g('nv')} />
        <rect x="62" y="46" width="10" height="28" rx="3" fill="#e46f6f" />
        <circle cx="76" cy="28" r="11" fill={g('grn')} /><path d="m71 28 4 4 6-7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>}

      {kind === 'user' && <g>
        <circle cx="50" cy="36" r="16" fill={g('ball')} />
        <path d="M22 84a28 24 0 0 1 56 0z" fill={g('ball')} />
        <circle cx="74" cy="70" r="12" fill={g('gball')} /><path d="M74 64v12M68 70h12" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      </g>}
    </svg>
  )
}

type TileProps = { art: ArtKind; title: string; text?: string; className: string; size?: 'big' | 'mid' | 'small'; beta?: boolean; badge?: ReactNode } &
  ({ onClick: () => void; href?: never } | { href: string; onClick?: never })

/** A coloured tile with its 3D picture in the corner: the «+» menu and the home page use the same one. */
export function Tile({ art, title, text, className, size, beta, badge, ...to }: TileProps) {
  const body = <>
    <span className={`relative z-10 block font-bold leading-tight ${size === 'small' ? 'text-[13px] max-w-[70%]' : size === 'mid' ? 'text-[14px] max-w-[80%]' : size === 'big' ? 'text-xl max-w-[60%]' : 'text-[17px] max-w-[75%]'}`}>{title}</span>
    {beta && <span className="relative z-10 inline-block mt-1 rounded-full bg-white/25 px-1.5 text-[10px] font-semibold uppercase tracking-wide">beta</span>}
    {text && <span className={`relative z-10 block mt-1 text-xs opacity-90 leading-snug ${size === 'big' ? 'max-w-[58%]' : 'max-w-[56%]'}`}>{text}</span>}
    {badge && <span className="relative z-10 block mt-1.5">{badge}</span>}
    <MenuArt kind={art} className={`absolute ${size === 'small' ? '-right-1 -bottom-2 size-14' : size === 'mid' ? '-right-2 -bottom-3 size-[68px]' : size === 'big' ? 'right-1 -top-1 size-36' : '-right-3 -bottom-4 size-[96px]'}`} />
  </>
  const cls = `relative block overflow-hidden rounded-[22px] text-left shadow-card active:scale-[.98] transition ${size === 'small' ? 'h-[72px] px-3 py-2.5' : size === 'mid' ? 'px-3 py-3' : 'p-4'} ${className}`
  return to.href ? <a href={to.href} className={cls}>{body}</a> : <button type="button" onClick={to.onClick} className={cls}>{body}</button>
}

/** The tiles' colours: one per section, the same wherever that section appears. */
export const TILE = {
  qr: 'bg-[linear-gradient(135deg,#22386e,#16264f)] text-white',
  pass: 'bg-[linear-gradient(135deg,#4a7be3,#2f58b8)] text-white',
  book: 'bg-[linear-gradient(135deg,#7a68e0,#5443bd)] text-white',
  feed: 'bg-[linear-gradient(135deg,#ecc35c,#cf9d2e)] text-[#16264f]',
  idea: 'bg-[linear-gradient(135deg,#ef8f57,#d2652c)] text-white',
  plan: 'bg-[linear-gradient(135deg,#3fb6a0,#23897a)] text-white',
  habit: 'bg-[linear-gradient(135deg,#5cb876,#2f8a4c)] text-white',
  user: 'bg-[linear-gradient(135deg,#76839c,#55627b)] text-white',
  lost: 'bg-[linear-gradient(135deg,#38b2c9,#1d8aa1)] text-white',
  food: 'bg-[linear-gradient(135deg,#ee7d6e,#cc4f42)] text-white',
  poll: 'bg-[linear-gradient(135deg,#df6f9c,#b8467a)] text-white',
} as const
