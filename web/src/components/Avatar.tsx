import { useEffect, useState } from 'react'
import { avatarUrl } from '../lib/api'

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('')

/** Student photo, or initials while there is none. */
export default function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { setSrc(null); if (photo) avatarUrl(photo).then(setSrc, () => setSrc(null)) }, [photo])
  return src
    ? <img src={src} alt="" width={size} height={size} className="rounded-full object-cover shrink-0 bg-surface-2" style={{ width: size, height: size }} />
    : <span aria-hidden className="rounded-full bg-accent-soft text-accent grid place-items-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.34 }}>{initials(name)}</span>
}
