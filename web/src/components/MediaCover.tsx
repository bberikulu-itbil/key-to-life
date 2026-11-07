import { photoUrl, type Media } from '../lib/api'

const tint = (t: string) => `hsl(${[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 45% 42%)`

/** Book/film cover, or a coloured tile with the first letter when there is no picture. */
export default function MediaCover({ m, className = '' }: { m: Pick<Media, 'cover' | 'title'>; className?: string }) {
  return m.cover
    ? <img src={photoUrl(m.cover)} alt="" className={`aspect-[2/3] w-full rounded-md object-cover ${className}`} loading="lazy" />
    : <span aria-hidden className={`aspect-[2/3] w-full rounded-md grid place-items-center text-white/90 text-4xl font-bold ${className}`} style={{ background: tint(m.title) }}>{m.title.trim()[0]?.toUpperCase()}</span>
}
