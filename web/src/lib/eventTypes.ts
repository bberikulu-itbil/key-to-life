import type { EventTypeCode } from './api'
import { tx } from './i18n'

// Types grouped by purpose; one colour per group keeps the calendar calm.
export const TYPE_GROUPS: { label: string; color: string; codes: [EventTypeCode, string][] }[] = [
  { label: tx('Бос уақыт'), color: '#7c3aed', codes: [['film', tx('Фильм')], ['game', tx('Ойын')], ['sport', tx('Спорт')], ['food', tx('Тамақ')], ['competition', tx('Жарыс')]] },
  { label: tx('Сыртқа шығу'), color: '#16a34a', codes: [['walk', tx('Серуен')], ['outing', tx('Қыдыру')], ['trip', tx('Саяхат')]] },
  { label: tx('Тәрбие және ата-ана'), color: '#d97706', codes: [['hour_lead', tx('Жетекші тәрбие сағаты')], ['hour_parent', tx('Ата-ана тәрбие сағаты')], ['meeting', tx('Жиналыс')], ['parent_activity', tx('Ата-ана белсенділігі')], ['visit', tx('Қонаққа бару')]] },
  { label: tx('Оқу және тәртіп'), color: '#dc2626', codes: [['exam', tx('Емтихан')], ['cleaning', tx('Тазалық')], ['other', tx('Басқа')]] },
  { label: tx('Ескертпелер'), color: '#2563eb', codes: [['mentor', tx('Жеке кездесу')], ['birthday', tx('Туған күн')]] },
]
export const TYPE_COLORS: Record<string, string> = Object.fromEntries(TYPE_GROUPS.flatMap((g) => g.codes.map(([c]) => [c, g.color])))
TYPE_COLORS.birthday = '#db2777'
