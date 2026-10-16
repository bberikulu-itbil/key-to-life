// run from web/: npx tsx ../supabase/functions/telegram/initdata.test.ts
import assert from 'node:assert/strict'
import { checkInitData, signInitData } from './initdata.ts'

;(async () => {
  const token = '123456:TEST'
  const now = 1_760_000_000
  const data = await signInitData({ auth_date: String(now - 60), query_id: 'AAE', user: JSON.stringify({ id: 42, username: 'sanzhar' }) }, token)
  assert.deepEqual(await checkInitData(data, token, now), { id: 42, username: 'sanzhar' })
  assert.equal(await checkInitData(data, '999:OTHER', now), null)                       // other bot
  assert.equal(await checkInitData(data.replace('sanzhar', 'hacker'), token, now), null) // tampered
  assert.equal(await checkInitData(data, token, now + 2 * 86400), null)                 // stale
  console.log('initdata ok')
})()
