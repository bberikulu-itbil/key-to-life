/** Tenge for display: 12 500 ₸ */
export const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`

/** The class fund: money in (+), spent (−), and planned spending that hasn't happened yet (−, planned). */
export function fundTotals(rows: { amount: number | string; planned: boolean }[]) {
  const balance = rows.filter((r) => !r.planned).reduce((s, r) => s + Number(r.amount), 0)
  const planned = rows.filter((r) => r.planned).reduce((s, r) => s + Number(r.amount), 0)
  return { balance, planned, after: balance + planned }
}
