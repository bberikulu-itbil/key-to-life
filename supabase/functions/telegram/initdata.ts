// Telegram Mini App initData check: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const enc = new TextEncoder()
async function hmac(key: Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

export type TgUser = { id: number; username?: string; first_name?: string }

/** Returns the Telegram user when initData is signed by this bot and fresh (24 h), otherwise null. */
export async function checkInitData(initData: string, botToken: string, nowSec = Date.now() / 1000): Promise<TgUser | null> {
  const p = new URLSearchParams(initData)
  const hash = p.get('hash')
  if (!hash || !botToken) return null
  p.delete('hash')
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = await hmac(enc.encode('WebAppData'), botToken)
  if (hex(await hmac(secret, dcs)) !== hash) return null
  if (nowSec - Number(p.get('auth_date')) > 86400) return null
  try { return JSON.parse(p.get('user') ?? 'null') } catch { return null }
}

/** Builds signed initData — only for the self-check below. */
export async function signInitData(fields: Record<string, string>, botToken: string) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n')
  const hash = hex(await hmac(await hmac(enc.encode('WebAppData'), botToken), dcs))
  return new URLSearchParams({ ...fields, hash }).toString()
}
