import type { EventTypeCode } from './api'
import { tx } from './i18n'

/* Class event types: one place for label, emoji and colour.
   Related activities share a colour (Фильм + Киберспорт, Серуен + Саяхат…) so the calendar stays calm. */
export type EventTypeDef = { code: EventTypeCode; label: string; emoji: string; color: string }
const t = (code: EventTypeCode, label: string, emoji: string, color: string): EventTypeDef => ({ code, label, emoji, color })

export const TYPE_GROUPS: { label: string; types: EventTypeDef[] }[] = [
  { label: tx('Тәрбие'), types: [
    t('cleaning', tx('Тазалық'), '🧹', '#06B6D4'),
    t('mentor', tx('Жеке кездесу'), '💬', '#8B5CF6'),
    t('hour_lead', tx('Тәрбие сағаты'), '👨‍🏫', '#4F46E5'),
  ] },
  { label: tx('Дәмхана'), types: [
    t('tea', tx('Шай ішу'), '☕', '#D97706'),
    t('food', tx('Ортақ тамақтану'), '🍕', '#EA580C'),
    t('birthday', tx('Туған күн кеші'), '🎂', '#E11D48'),
  ] },
  { label: tx('Ойын-сауық және демалыс'), types: [
    t('sport', tx('Спорт'), '⚽', '#16A34A'),
    t('active_rest', tx('Белсенді демалыс'), '🎳', '#16A34A'),
    t('game', tx('Үстел ойындары'), '🎲', '#9333EA'),
    t('film', tx('Фильм'), '🎬', '#475569'),
    t('walk', tx('Серуен'), '🚶', '#0284C7'),
    t('trip', tx('Саяхат / Экскурсия'), '🚌', '#0284C7'),
  ] },
  { label: tx('Жарыстар мен челлендждер'), types: [
    t('competition', tx('Турнир'), '🏆', '#CA8A04'),
    t('challenge', tx('Челлендж'), '⚡', '#DC2626'),
    t('quiz', tx('Интеллектуалды ойын'), '🧠', '#9333EA'),
    t('esport', tx('Киберспорт'), '🎮', '#475569'),
  ] },
  { label: tx('Оқу және ата-ана'), types: [
    t('exam', tx('Емтихан / Сынақ'), '📝', '#1E40AF'),
    t('hour_parent', tx('Ата-ана тәрбие сағаты'), '👥', '#0D9488'),
    t('meeting', tx('Сынып / педагогикалық жиналыс'), '💼', '#2563EB'),
    t('visit', tx('Қонаққа бару'), '🏠', '#C2410C'),
    t('parent_activity', tx('Ата-аналар басқосуы'), '🤝', '#2563EB'),
  ] },
]

// Old codes: not offered in the form any more, still drawn for existing events.
const LEGACY: EventTypeDef[] = [t('outing', tx('Серуен'), '🚶', '#0284C7'), t('other', tx('Басқа'), '📌', '#64748B')]

export const ALL_TYPES: EventTypeDef[] = [...TYPE_GROUPS.flatMap((g) => g.types), ...LEGACY]
export const TYPE_COLORS: Record<string, string> = Object.fromEntries(ALL_TYPES.map((x) => [x.code, x.color]))
export const TYPE_EMOJIS: Record<string, string> = Object.fromEntries(ALL_TYPES.map((x) => [x.code, x.emoji]))
export const TYPE_LABELS = Object.fromEntries(ALL_TYPES.map((x) => [x.code, x.label])) as Record<EventTypeCode, string>
/** Leisure types (old `kind = 'fun'`). */
export const FUN_TYPES: EventTypeCode[] = ['tea', 'food', 'birthday', 'sport', 'active_rest', 'game', 'film', 'walk', 'outing', 'trip', 'competition', 'challenge', 'quiz', 'esport', 'cleaning']
