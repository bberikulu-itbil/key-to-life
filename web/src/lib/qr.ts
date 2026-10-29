/** The pass or booking code inside a scanned QR: our verify link (…#/v/L-3F9A2C) or the bare code. */
export function codeFrom(text: string) {
  const m = text.trim().match(/#\/v\/([A-Za-z0-9-]+)/) ?? text.trim().match(/^([A-Za-z]-[A-Za-z0-9]+)$/)
  return m ? m[1].toUpperCase() : null
}

/** Where any of our QR codes (or a typed code) leads: a pass or booking check, a certificate, a dorm item, an initiative. */
export function routeFrom(text: string) {
  const t = text.trim()
  const m = t.match(/#\/(cert|dorm\/item)\/([A-Za-z0-9-]+)/)
  if (m) return `/${m[1]}/${m[2].toUpperCase()}`
  const a = t.match(/#\/a\/([0-9a-f-]{36})/i)
  if (a) return `/a/${a[1].toLowerCase()}`
  const c = codeFrom(t)
  if (!c) return null
  return c.startsWith('C-') ? `/cert/${c}` : c.startsWith('D-') ? `/dorm/item/${c}` : `/v/${c}`
}
