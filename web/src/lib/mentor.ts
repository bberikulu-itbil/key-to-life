import { lang, tx } from './i18n'
import { addDays, isoDow } from './time'

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

export const NATIONS = [
  'қазақ',
  'орыс',
  'өзбек',
  'ұйғыр',
  'татар',
  'түрік',
  'әзірбайжан',
  'дүнген',
  'кәріс',
  'тәжік',
  'неміс',
  'басқа',
]

export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
]

export function fmtBirthday(val?: string | null): string {
  if (!val) return '—'
  const v = val.trim()
  if (!v) return '—'
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return d.toLocaleDateString(lang === 'kk' ? 'kk-KZ' : lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }
  return v
}

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

/* ==========================================================================
   Күрделендірілген Даму Жоспары (Мақсаттар, Әдеттер, Тапсырмалар)
   ========================================================================== */

export type PlanCategory = 'study' | 'olympiad' | 'lang' | 'discipline' | 'book' | 'sport' | 'social' | 'other'

export type RoadmapGoalStep = {
  id: string
  title: string
  done: boolean
}

export type RoadmapGoal = {
  id: string
  title: string
  category: PlanCategory
  metric?: string
  why?: string
  priority?: 'high' | 'medium' | 'normal'
  due_on?: string | null
  done: boolean
  steps: RoadmapGoalStep[]
  created_at: string
}

export type HabitFrequency = 'daily' | 'weekdays' | '3x_week' | 'custom'

export type RoadmapHabit = {
  id: string
  title: string
  category: PlanCategory
  target_val?: string // e.g. '20 бет', '30 мин'
  time_of_day?: 'morning' | 'afternoon' | 'evening' | 'any'
  frequency?: HabitFrequency
  days_of_week?: number[] // ISO weekdays: 1 = Monday … 7 = Sunday
  target_per_week?: number
  reminder_time?: string | null
  motivation?: string
  goal_id?: string | null
  archived: boolean
  checks?: string[] // ['YYYY-MM-DD']
  created_at: string
}

export type RoadmapTask = {
  id: string
  title: string
  category: PlanCategory
  due_on?: string | null
  priority?: 'high' | 'normal'
  notes?: string | null
  goal_id?: string | null
  done: boolean
  created_at: string
}

export type StudentRoadmap = {
  goals: RoadmapGoal[]
  habits: RoadmapHabit[]
  tasks: RoadmapTask[]
}

export const PLAN_CATEGORIES: { id: PlanCategory; label: string; icon: string; color: string; border: string; bg: string }[] = [
  { id: 'study', label: tx('Үлгерім және оқу'), icon: 'book', color: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
  { id: 'olympiad', label: tx('Олимпиада және ғылым'), icon: 'star', color: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
  { id: 'lang', label: tx('Тіл үйрену'), icon: 'chat', color: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  { id: 'discipline', label: tx('Тәртіп пен күн тәртібі'), icon: 'clock', color: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
  { id: 'book', label: tx('Кітап оқу'), icon: 'file', color: 'text-teal-600 dark:text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-500/10' },
  { id: 'sport', label: tx('Спорт және денсаулық'), icon: 'ball', color: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-500/10' },
  { id: 'social', label: tx('Қарым-қатынас және тәрбие'), icon: 'users', color: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-500/10' },
  { id: 'other', label: tx('Басқа'), icon: 'pin', color: 'text-muted', border: 'border-line', bg: 'bg-surface-2' },
]

export const getCategoryMeta = (cat?: PlanCategory) =>
  PLAN_CATEGORIES.find((c) => c.id === cat) ?? PLAN_CATEGORIES[7]

export const TIME_OF_DAY_LABELS: Record<'morning' | 'afternoon' | 'evening' | 'any', { label: string; icon: string }> = {
  morning: { label: tx('Таңертең'), icon: 'sun' },
  afternoon: { label: tx('Күндіз'), icon: 'sun' },
  evening: { label: tx('Кешке'), icon: 'clock' },
  any: { label: tx('Кез келген уақытта'), icon: 'clock' },
}

export const FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  daily: tx('Күн сайын'),
  weekdays: tx('Жұмыс күндері (Дс-Жм)'),
  '3x_week': tx('Аптасына 3 рет'),
  custom: tx('Өзім таңдаған күндер'),
}

const defaultHabitDays = (habit: RoadmapHabit) => {
  if (habit.days_of_week?.length) return habit.days_of_week
  if (habit.frequency === 'weekdays') return [1, 2, 3, 4, 5]
  if (habit.frequency === '3x_week') return [1, 3, 5]
  return []
}

/** Whether this habit is expected on a particular local school date. */
export const habitDueOn = (habit: RoadmapHabit, date: string) => {
  if (habit.archived) return false
  if (habit.frequency === 'daily' || !habit.frequency) return true
  return defaultHabitDays(habit).includes(isoDow(date))
}

/** Number of completed occurrences in the Monday–Sunday week containing `date`. */
export const habitWeekProgress = (habit: RoadmapHabit, date: string) => {
  const start = addDays(date, 1 - isoDow(date))
  const checks = new Set(habit.checks ?? [])
  const total = habit.frequency === 'daily' || !habit.frequency
    ? 7
    : habit.frequency === 'custom'
      ? Math.max(1, habit.target_per_week ?? defaultHabitDays(habit).length)
      : habit.frequency === '3x_week'
        ? habit.target_per_week ?? 3
        : 5
  const done = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => checks.has(d)).length
  return { done, total }
}

/** Consecutive completed due days; for weekly habits, non-due days do not break the streak. */
export const habitCurrentStreak = (habit: RoadmapHabit, from: string) => {
  const checks = new Set(habit.checks ?? [])
  let cursor = from
  let streak = 0
  for (let i = 0; i < 90; i += 1) {
    if (habitDueOn(habit, cursor)) {
      if (!checks.has(cursor)) break
      streak += 1
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}

export const PRIORITY_LABELS: Record<'high' | 'medium' | 'normal', { label: string; color: string; badge: string }> = {
  high: { label: tx('Жоғары'), color: 'text-danger font-semibold', badge: 'bg-danger-soft text-danger' },
  medium: { label: tx('Орташа'), color: 'text-warning font-semibold', badge: 'bg-warning-soft text-warning' },
  normal: { label: tx('Қалыпты'), color: 'text-muted', badge: 'bg-surface-2 text-muted' },
}

/* --------------------------------------------------------------------------
   Тәлімгерлерге арналған дайын кешенді үлгілер банкі (Smart Presets Bank)
   -------------------------------------------------------------------------- */

export type PlanPreset = {
  key: string
  category: PlanCategory
  title: string
  desc: string
  goal: {
    title: string
    metric: string
    due_days: number
    priority: 'high' | 'medium' | 'normal'
    steps: string[]
  }
  habits: {
    title: string
    target_val: string
    time_of_day: 'morning' | 'afternoon' | 'evening' | 'any'
    frequency: 'daily' | 'weekdays' | '3x_week'
    motivation: string
  }[]
  tasks: {
    title: string
    due_days: number
    priority: 'high' | 'normal'
    notes: string
  }[]
}

export const PLAN_PRESETS: PlanPreset[] = [
  {
    key: 'study_grades',
    category: 'study',
    title: tx('Үлгерімді көтеру (БЖБ/ТЖБ)'),
    desc: tx('Қиын пәнді жүйелі меңгеру, бағаны 5-ке жеткізу жоспары.'),
    goal: {
      title: tx('Қиын пәннен БЖБ мен ТЖБ-ны 85%+ тапсыру'),
      metric: tx('Тоқсан соңында 5 баға алу'),
      due_days: 45,
      priority: 'high',
      steps: [
        tx('Өткен тақырыптардың формулалары мен анықтамаларына конспект жасау'),
        tx('БЖБ алдында пән мұғалімінен 2 рет консультация алу'),
        tx('Өткен жылғы 3 нұсқаны толық шығарып, қателерді талдау'),
      ],
    },
    habits: [
      {
        title: tx('Күн сайын 30 мин қиын пәнді қайталау'),
        target_val: tx('30 мин'),
        time_of_day: 'evening',
        frequency: 'daily',
        motivation: tx('Білімді жүйелі бекіту және сенімділікті арттыру үшін'),
      },
    ],
    tasks: [
      {
        title: tx('Пән мұғалімінен кеңес сұрап, түсінбеген есептерді анықтау'),
        due_days: 5,
        priority: 'high',
        notes: tx('Дәптерге нақты 5 қиын сұрақты жазып бару'),
      },
    ],
  },
  {
    key: 'olymp_prep',
    category: 'olympiad',
    title: tx('Олимпиадаға жүйелі дайындық'),
    desc: tx('Олимпиадалық есептер базасын жинақтау және жүлделі орынға ұмтылу.'),
    goal: {
      title: tx('Облыстық олимпиадада жүлделі орын алу'),
      metric: tx('Турда кемінде 60% балл жинау'),
      due_days: 60,
      priority: 'high',
      steps: [
        tx('Олимпиадалық тақырыптар тізімін жасап, апта сайын 1 тақырыпты меңгеру'),
        tx('Аптасына 1 рет толық нұсқаны уақытқа шығару'),
        tx('Жетекші ұстазбен апталық есептер талдауын өткізу'),
      ],
    },
    habits: [
      {
        title: tx('Күніне 3 күрделі олимпиадалық есеп шығару'),
        target_val: tx('3 есеп'),
        time_of_day: 'afternoon',
        frequency: 'daily',
        motivation: tx('Логикалық ойлау мен жылдамдықты дамыту'),
      },
    ],
    tasks: [
      {
        title: tx('Өткен 3 жылдың облыстық кезең тапсырмаларын жинақтау'),
        due_days: 4,
        priority: 'high',
        notes: tx('Мұғалімнен немесе интернет ресурстарынан PDF нұсқасын алу'),
      },
    ],
  },
  {
    key: 'lang_ielts',
    category: 'lang',
    title: tx('Ағылшын тілі және сөздік қор'),
    desc: tx('IELTS деңгейін арттыру, күнделікті лексика мен тыңдалымды дамыту.'),
    goal: {
      title: tx('Ағылшын тілі деңгейін 7.0+ деңгейіне жеткізу'),
      metric: tx('Reading/Listening 7.5+, Writing 6.5+'),
      due_days: 90,
      priority: 'high',
      steps: [
        tx('Академиялық 500 жаңа сөзді жаттап, карточкалармен қайталау'),
        tx('Аптасына 1 рет Task 1 және Task 2 эссе жазу'),
        tx('Айына 1 толық mock exam тапсыру'),
      ],
    },
    habits: [
      {
        title: tx('Күніне 15 жаңа ағылшын сөзін жаттау'),
        target_val: tx('15 сөз'),
        time_of_day: 'morning',
        frequency: 'daily',
        motivation: tx('Сөздік қорды тез әрі тиімді кеңейту үшін'),
      },
      {
        title: tx('Күніне 20 мин подкаст немесе мақала оқу'),
        target_val: tx('20 мин'),
        time_of_day: 'evening',
        frequency: 'daily',
        motivation: tx('Түпнұсқа тілді түсіну дағдысы үшін'),
      },
    ],
    tasks: [
      {
        title: tx('Ағылшын пәні мұғаліміне эссені тексеруге өткізу'),
        due_days: 7,
        priority: 'normal',
        notes: tx('Қателер бойынша кері байланыс алу'),
      },
    ],
  },
  {
    key: 'discipline_sleep',
    category: 'discipline',
    title: tx('Ұйқы режимі және күн тәртібі'),
    desc: tx('22:30-да гаджетсіз ұйықтау, сергек ояну және этюдке кешікпеу.'),
    goal: {
      title: tx('Тұрақты ұйқы режимін қалыптастыру'),
      metric: tx('2 апта қатарынан кешікпей ұйықтау'),
      due_days: 21,
      priority: 'medium',
      steps: [
        tx('22:00-ден бастап гаджеттерді тыныш режимге қою'),
        tx('Кешкі шайдан соң келесі күннің сабақтарын толық әзірлеу'),
        tx('Таңғы 07:00-де оянып, төсек орнын бірден жинау'),
      ],
    },
    habits: [
      {
        title: tx('22:30-да телефонды өшіріп, ұйықтау'),
        target_val: tx('22:30'),
        time_of_day: 'evening',
        frequency: 'weekdays',
        motivation: tx('Сергек ояну және сабақта зейінді толық ұстау үшін'),
      },
    ],
    tasks: [
      {
        title: tx('Жатақхана тәрбиешісімен режим келісімін бекіту'),
        due_days: 2,
        priority: 'normal',
        notes: tx('Кешкі уақытта кітапхана мен шай бөлмесіндегі кестені үйлестіру'),
      },
    ],
  },
  {
    key: 'book_challenge',
    category: 'book',
    title: tx('Кітап оқу мәдениеті'),
    desc: tx('Тоқсанына тағылымды кітаптар оқып, сөздік қор мен көзқарасты байыту.'),
    goal: {
      title: tx('Тоқсан ішінде 4 тағылымды кітап оқып шығу'),
      metric: tx('4 кітап және қысқаша ой-толғау жазу'),
      due_days: 60,
      priority: 'normal',
      steps: [
        tx('Кітапханадан оқитын 4 кітапты таңдап алу'),
        tx('Әр кітапты бітіргенде 1 беттік түйін жазу'),
        tx('Сынып сағатында кітаптан алған әсермен бөлісу'),
      ],
    },
    habits: [
      {
        title: tx('Күн сайын кемінде 20 бет кітап оқу'),
        target_val: tx('20 бет'),
        time_of_day: 'evening',
        frequency: 'daily',
        motivation: tx('Тұлғалық даму және дүниетанымды кеңейту'),
      },
    ],
    tasks: [
      {
        title: tx('Кітапханадан бірінші кітапты таңдап, бастау'),
        due_days: 3,
        priority: 'normal',
        notes: tx('Сынып жетекшісінен немесе кітапханашыдан кеңес алу'),
      },
    ],
  },
  {
    key: 'sport_fitness',
    category: 'sport',
    title: tx('Спорт және салауаттылық'),
    desc: tx('Таңғы жаттығу, секцияларға тұрақты қатысу және денсаулықты күшейту.'),
    goal: {
      title: tx('Дене шынықтыру және төзімділікті арттыру'),
      metric: tx('Спорт нормативтерін үздік тапсыру'),
      due_days: 45,
      priority: 'normal',
      steps: [
        tx('Апталық спорт секциясына (футбол/волейбол/үстел теннисі) тұрақты қатысу'),
        tx('Күнделікті таңғы бой жазуды үзбеу'),
      ],
    },
    habits: [
      {
        title: tx('Таңғы 15 мин бой жазу жаттығуы'),
        target_val: tx('15 мин'),
        time_of_day: 'morning',
        frequency: 'daily',
        motivation: tx('Күні бойы сергек жүру және иммунитетті көтеру үшін'),
      },
      {
        title: tx('Күніне 1.5 литр су ішу'),
        target_val: tx('1.5 л'),
        time_of_day: 'any',
        frequency: 'daily',
        motivation: tx('Ағзаның дұрыс дамуы мен сергектігі үшін'),
      },
    ],
    tasks: [
      {
        title: tx('Спорт секциясының кестесін нақтылау'),
        due_days: 3,
        priority: 'normal',
        notes: tx('Дене шынықтыру мұғаліміне жазылу'),
      },
    ],
  },
  {
    key: 'social_friendship',
    category: 'social',
    title: tx('Қарым-қатынас және тәрбие'),
    desc: tx('Сыныппен жақсы қарым-қатынас, ата-анаға құрмет және белсенділік.'),
    goal: {
      title: tx('Сыныпта белсенділік таныту және достық қарым-қатынас'),
      metric: tx('Сыныптық жобаға белсене қатысу'),
      due_days: 30,
      priority: 'normal',
      steps: [
        tx('Сыныптық іс-шараға немесе ортақ жобаға атсалысу'),
        tx('Апта сайын ата-анаға хабарласып, жағдай айту'),
      ],
    },
    habits: [
      {
        title: tx('Апта сайын ата-анамен жылы сөйлесу'),
        target_val: tx('20 мин'),
        time_of_day: 'evening',
        frequency: '3x_week',
        motivation: tx('Отбасылық байланысты нығайту және ризашылық білдіру'),
      },
    ],
    tasks: [
      {
        title: tx('Сыныптық іс-шараның бір бөлігіне жауапты болу'),
        due_days: 10,
        priority: 'normal',
        notes: tx('Сынып жетекшісімен келісу'),
      },
    ],
  },
]

export const calcGoalProgress = (goal: RoadmapGoal, tasks: RoadmapTask[] = []) => {
  const stepsTotal = goal.steps.length
  const stepsDone = goal.steps.filter((s) => s.done).length
  const linkedTasks = tasks.filter((t) => t.goal_id === goal.id)
  const tasksTotal = linkedTasks.length
  const tasksDone = linkedTasks.filter((t) => t.done).length

  const allTotal = stepsTotal + tasksTotal
  if (allTotal === 0) return goal.done ? 100 : 0
  const allDone = stepsDone + tasksDone
  return Math.round((100 * allDone) / allTotal)
}
