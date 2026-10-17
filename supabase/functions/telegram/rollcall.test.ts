// run from web/: npx tsx ../supabase/functions/telegram/rollcall.test.ts
import assert from 'node:assert/strict'
import { rollcallText } from './rollcall.ts'

const text = rollcallText({
  title: 'Олимпиада <A&B>', date: '2026-10-14', start: '15:00', end: '16:30', type: 'KBO',
  rows: [
    { name: 'Айдар', status: 'present', late_min: null, excuse: null },
    { name: 'Ерлан', status: 'late', late_min: 10, excuse: null },
    { name: 'Мадина', status: 'excused', late_min: null, excuse: 'sick' },
    { name: 'Нұрлан', status: 'absent', late_min: null, excuse: null },
    { name: 'Сәуле', status: null, late_min: null, excuse: null },
  ],
})
assert.ok(text.startsWith('<b>Түгелдеу · Олимпиада &lt;A&amp;B&gt;</b>\n14.10.2026 · 15:00–16:30 · KBO'))
assert.ok(text.includes('🟩 келді — 1   🟦 кешікті — 1\n🟨 себепті — 1   🟥 келмеді — 1   ⬜ белгісіз — 1'))
assert.ok(text.includes('\n2. 🟦 Ерлан (10 мин)\n3. 🟨 Мадина (ауырып қалды)\n4. 🟥 Нұрлан\n5. ⬜ Сәуле'))
assert.ok(!rollcallText({ title: 'X', date: '2026-10-14', start: '1', end: '2', type: null, rows: [] }).includes('белгісіз'))
const ru = rollcallText({ title: 'X', date: '2026-10-14', start: '15:00', end: '16:30', type: null, lang: 'ru',
  rows: [{ name: 'Ерлан', status: 'late', late_min: 5, excuse: null }, { name: 'Мадина', status: 'excused', late_min: null, excuse: 'other' }] })
assert.ok(ru.startsWith('<b>Перекличка · X</b>') && ru.includes('🟦 опоздали — 1') && ru.includes('1. 🟦 Ерлан (5 мин)\n2. 🟨 Мадина (другая причина)'))
console.log('rollcall ok')
