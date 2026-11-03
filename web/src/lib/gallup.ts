import { tx } from './i18n'

export type GallupDomain = 'executing' | 'influencing' | 'relationship' | 'strategic'

export type GallupTheme = {
  key: string
  nameEn: string
  nameKk: string
  nameRu: string
  domain: GallupDomain
  descKk: string
}

export const GALLUP_DOMAINS: Record<
  GallupDomain,
  { label: string; tone: string; bg: string; text: string; border: string }
> = {
  executing: {
    label: tx('Орындаушылық (Executing)'),
    tone: 'purple',
    bg: 'bg-purple-100 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-300 dark:border-purple-800',
  },
  influencing: {
    label: tx('Ықпал ету (Influencing)'),
    tone: 'amber',
    bg: 'bg-amber-100 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
  },
  relationship: {
    label: tx('Қарым-қатынас құру (Relationship Building)'),
    tone: 'sky',
    bg: 'bg-sky-100 dark:bg-sky-950/40',
    text: 'text-sky-800 dark:text-sky-300',
    border: 'border-sky-300 dark:border-sky-800',
  },
  strategic: {
    label: tx('Стратегиялық ойлау (Strategic Thinking)'),
    tone: 'emerald',
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
  },
}

export const GALLUP_THEMES: GallupTheme[] = [
  // Executing
  { key: 'achiever', nameEn: 'Achiever', nameKk: 'Жетістікке ұмтылушы', nameRu: 'Достигатель', domain: 'executing', descKk: 'Күн сайын нақты нәтижеге қол жеткізуді қалайтын жоғары өнімділік.' },
  { key: 'arranger', nameEn: 'Arranger', nameKk: 'Ұйымдастырушы', nameRu: 'Организатор', domain: 'executing', descKk: 'Күрделі процестер мен ресурстарды ең тиімді тәсілмен реттей алады.' },
  { key: 'belief', nameEn: 'Belief', nameKk: 'Сенім / Ұстаным', nameRu: 'Убеждения', domain: 'executing', descKk: 'Берік құндылықтар мен өмірлік мақсаттарға адалдық.' },
  { key: 'consistency', nameEn: 'Consistency', nameKk: 'Әділдік / Тұрақтылық', nameRu: 'Равноправие', domain: 'executing', descKk: 'Барлығына бірдей әділ ереже мен теңдік орнату.' },
  { key: 'deliberative', nameEn: 'Deliberative', nameKk: 'Байыпты / Сақтық', nameRu: 'Осмотрительный', domain: 'executing', descKk: 'Шешім қабылдар алдында барлық тәуекелдерді мұқият талдау.' },
  { key: 'discipline', nameEn: 'Discipline', nameKk: 'Тәртіп / Жүйелілік', nameRu: 'Дисциплина', domain: 'executing', descKk: 'Нақты күн тәртібі, құрылым және жоспарға сай әрекет ету.' },
  { key: 'focus', nameEn: 'Focus', nameKk: 'Фокус / Мақсатшыл', nameRu: 'Концентрация', domain: 'executing', descKk: 'Негізгі бағытты нақтылап, алаңдамай алға жылжу.' },
  { key: 'responsibility', nameEn: 'Responsibility', nameKk: 'Жауапкершілік', nameRu: 'Ответственность', domain: 'executing', descKk: 'Берген сөзге адал болып, міндетті соңына дейін сапалы жеткізу.' },
  { key: 'restorative', nameEn: 'Restorative', nameKk: 'Мәселе шешуші', nameRu: 'Исправитель', domain: 'executing', descKk: 'Ақаулар мен қиын мәселелердің түпкі себебін тауып, қалпына келтіру.' },

  // Influencing
  { key: 'activator', nameEn: 'Activator', nameKk: 'Бастамашы', nameRu: 'Активатор', domain: 'influencing', descKk: 'Ойды кідіртпей нақты әрекетке айналдыруға құлшыныс.' },
  { key: 'command', nameEn: 'Command', nameKk: 'Көшбасшылық', nameRu: 'Командование', domain: 'influencing', descKk: 'Жағдайды өз бақылауына алып, батыл шешімдер қабылдау.' },
  { key: 'communication', nameEn: 'Communication', nameKk: 'Шешендік', nameRu: 'Коммуникация', domain: 'influencing', descKk: 'Ойды тартымды, әсерлі сөздер мен мысалдармен жеткізу.' },
  { key: 'competition', nameEn: 'Competition', nameKk: 'Бәсекеге қабілеттілік', nameRu: 'Соревновательность', domain: 'influencing', descKk: 'Өзгелермен салыстыра отырып, бірінші орынға ұмтылу.' },
  { key: 'maximizer', nameEn: 'Maximizer', nameKk: 'Кемелдікке ұмтылушы', nameRu: 'Максимизатор', domain: 'influencing', descKk: 'Жақсы нәрсені мінсіз, ең үздік деңгейге дейін көтеру.' },
  { key: 'positivity', nameEn: 'Positivity', nameKk: 'Жарқын көңіл-күй', nameRu: 'Позитивность', domain: 'influencing', descKk: 'Жұқпалы оптимизм, айналасына шабыт пен қуаныш сыйлау.' },
  { key: 'significance', nameEn: 'Significance', nameKk: 'Маңыздылық', nameRu: 'Значимость', domain: 'influencing', descKk: 'Қоғамға үлкен ықпал ету және мойындалуға ұмтылыс.' },
  { key: 'woo', nameEn: 'Woo', nameKk: 'Баурап алу', nameRu: 'Обаяние', domain: 'influencing', descKk: 'Жаңа адамдармен оңай танысып, олардың сенімін тез иелену.' },

  // Relationship Building
  { key: 'adaptability', nameEn: 'Adaptability', nameKk: 'Бейімделгіш', nameRu: 'Адаптивность', domain: 'relationship', descKk: 'Өзгерістерге жылдам бейімделіп, ағыммен еркін қозғалу.' },
  { key: 'connectedness', nameEn: 'Connectedness', nameKk: 'Үндестік / Байланыс', nameRu: 'Связующее звено', domain: 'relationship', descKk: 'Әлемдегі барлық нәрсе мен адамдардың өзара байланысын сезіну.' },
  { key: 'developer', nameEn: 'Developer', nameKk: 'Дамытушы', nameRu: 'Развиватель', domain: 'relationship', descKk: 'Өзгелердің бойындағы әлеуетті көріп, олардың өсуіне қуану.' },
  { key: 'empathy', nameEn: 'Empathy', nameKk: 'Эмпатия', nameRu: 'Эмпатия', domain: 'relationship', descKk: 'Өзге адамдардың сезімдері мен ішкі күйін терең түсіну.' },
  { key: 'harmony', nameEn: 'Harmony', nameKk: 'Үйлесім / Татулық', nameRu: 'Гармония', domain: 'relationship', descKk: 'Дау-дамайды азайтып, ортақ келісім мен бейбітшілікке ұмтылу.' },
  { key: 'includer', nameEn: 'Includer', nameKk: 'Қабылдаушы', nameRu: 'Включатель', domain: 'relationship', descKk: 'Ешкімді шеттетпей, барлығын ортақ топқа тарту.' },
  { key: 'individualization', nameEn: 'Individualization', nameKk: 'Жекелік', nameRu: 'Индивидуализация', domain: 'relationship', descKk: 'Әрбір адамның қайталанбас даралығы мен ерекшелігін бағалау.' },
  { key: 'relator', nameEn: 'Relator', nameKk: 'Шынайы дос', nameRu: 'Установление отношений', domain: 'relationship', descKk: 'Терең, сенімді және жақын достық қарым-қатынасты бағалау.' },

  // Strategic Thinking
  { key: 'analytical', nameEn: 'Analytical', nameKk: 'Аналитикалық талдау', nameRu: 'Аналитик', domain: 'strategic', descKk: 'Фактілерді, дәлелдерді және себеп-салдар байланысын іздеу.' },
  { key: 'context', nameEn: 'Context', nameKk: 'Тарих / Тәжірибе', nameRu: 'Контекст', domain: 'strategic', descKk: 'Бүгінгі күнді түсіну үшін өткен оқиғаларға үңілу.' },
  { key: 'futuristic', nameEn: 'Futuristic', nameKk: 'Болашақты болжаушы', nameRu: 'Футуристичный', domain: 'strategic', descKk: 'Болашақ көрінісін анық елестетіп, соған жігерлендіру.' },
  { key: 'ideation', nameEn: 'Ideation', nameKk: 'Идея генераторы', nameRu: 'Генератор идей', domain: 'strategic', descKk: 'Күтпеген, креативті жаңа идеялар мен байланыстар табу.' },
  { key: 'input', nameEn: 'Input', nameKk: 'Ақпарат жинаушы', nameRu: 'Сборщик данных', domain: 'strategic', descKk: 'Қызықты ақпарат, білім, деректер мен идеяларды жинақтау.' },
  { key: 'intellection', nameEn: 'Intellection', nameKk: 'Терең ойшыл', nameRu: 'Мыслитель', domain: 'strategic', descKk: 'Ішкі толғаныс, философиялық ойлар және интеллектуалдық ізденіс.' },
  { key: 'learner', nameEn: 'Learner', nameKk: 'Үнемі үйренуші', nameRu: 'Ученик', domain: 'strategic', descKk: 'Үздіксіз білім алу және жаңа дағдыларды меңгеру процесін сүю.' },
  { key: 'strategic', nameEn: 'Strategic', nameKk: 'Стратег', nameRu: 'Стратег', domain: 'strategic', descKk: 'Қалыптасқан жағдайдағы балама жолдарды көріп, ең дұрыс бағытты таңдау.' },
]

export function findGallup(query: string): GallupTheme | undefined {
  const q = query.trim().toLowerCase()
  return GALLUP_THEMES.find(
    (t) =>
      t.key.toLowerCase() === q ||
      t.nameEn.toLowerCase() === q ||
      t.nameKk.toLowerCase() === q ||
      t.nameRu.toLowerCase() === q
  )
}
