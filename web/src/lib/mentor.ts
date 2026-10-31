import { tx } from './i18n'

/** The student's own questionnaire: the questions, in the order shown. */
export const FORM: [string, string, string][] = [
  ['interests', tx('Саған не қызық? Хоббиің қандай?'), tx('Мысалы: робототехника, футбол, сурет салу')],
  ['strengths', tx('Не жақсы шығады?'), tx('Пәндер, істер, қасиеттер')],
  ['hard', tx('Не қиын? Қай пән не жағдай?'), tx('Ашық жаза бер — мұны тек мұғалімдерің көреді')],
  ['goal', tx('Осы оқу жылындағы мақсатың'), tx('Мысалы: олимпиадаға шығу, ағылшынды жақсарту')],
  ['dream', tx('Арман мамандығың'), tx('Әлі білмесең — қызықтыратын салаларды жаз')],
  ['free', tx('Бос уақытыңда не істейсің?'), ''],
  ['help', tx('Мұғалімнен қандай көмек керек?'), ''],
]

/** Ready-made meetings: a topic, questions to ask, action items to suggest. */
export const TEMPLATES: { key: string; topic: string; questions: string[]; items: [string, 'task' | 'habit'][] }[] = [
  { key: 'grades', topic: tx('Үлгерім'), questions: [tx('Қай пәндер жақсы, қайсысы қиын? Неге?'), tx('Үй тапсырмасына қанша уақыт кетеді?'), tx('Келесі БЖБ/ТЖБ-ға қалай дайындаласың?')],
    items: [[tx('Қиын пәннен күніне 30 минут қайталау'), 'habit'], [tx('Пән мұғалімінен консультация сұрау'), 'task']] },
  { key: 'adapt', topic: tx('Бейімделу'), questions: [tx('Лицейде, жатақханада өзіңді қалай сезінесің?'), tx('Досың бар ма, кіммен жақынсың?'), tx('Ұйқың, тамағың қалай?'), tx('Үйді сағынасың ба?')],
    items: [[tx('22:30-да ұйықтау'), 'habit'], [tx('Бір үйірмеге жазылу'), 'task']] },
  { key: 'olymp', topic: tx('Олимпиадаға дайындық'), questions: [tx('Қай пән, қай деңгей?'), tx('Дайындық кестең қандай?'), tx('Қандай ресурс керек: кітап, тәлімгер, есептер?')],
    items: [[tx('Күніне 2 есеп шығару'), 'habit'], [tx('Өткен жылдардың есептерін жинау'), 'task']] },
  { key: 'career', topic: tx('Мамандық таңдау'), questions: [tx('Холланд, интеллект тестінің нәтижесі не дейді?'), tx('Қай салалар қызықтырады?'), tx('Қай университет, қай пәндер керек?')],
    items: [[tx('3 мамандық туралы оқып, салыстыру'), 'task'], [tx('Сол саладағы маманмен сөйлесу'), 'task']] },
  { key: 'conduct', topic: tx('Тәртіп, жағдай'), questions: [tx('Не болды? Өз көзқарасың қандай?'), tx('Себебі неде деп ойлайсың?'), tx('Енді не істейміз, қалай келісеміз?')],
    items: [[tx('Келісімді орындау · 2 апта'), 'task']] },
]

/** Days since the last held meeting, and whether the student is due for one (an upcoming meeting counts as covered). */
export function mentorStatus(meetings: { starts_at: string; done_at: string | null }[], every: number, now = Date.now()) {
  const done = meetings.filter((m) => m.done_at).map((m) => new Date(m.done_at!).getTime()).sort((a, b) => b - a)[0]
  const next = meetings.some((m) => !m.done_at && new Date(m.starts_at).getTime() > now)
  const days = done == null ? null : Math.floor((now - done) / 86400e3)
  return { days, next, due: !next && (days == null || days >= every) }
}
