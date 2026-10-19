import { Card, Icon, PageHead } from '../components/ui'
import { tx } from '../lib/i18n'

// What changed, newest first. Keep it short: what a teacher or student notices.
const NEWS: [string, string[]][] = [
  ['1.0.1', [
    tx('Басты бет: үлкен «Бастамалар» плиткасы, Lost & Found, Places, Асхана, Сауалнама; лента бірден басталады.'),
    tx('Ұсыныстар енді Сауалнама бөлімінің ішінде.'),
    tx('Чаттар: оңға сырғытсаңыз — дыбыссыз режим мен архив, солға сырғытсаңыз — оқылды деп белгілеу.'),
    tx('QR кодты камерамен тексеру.'),
    tx('Профиль: Жалпы, Әкімшілік және Жүйе баптаулары бөлімдері.'),
    tx('Telegram ішіндегі «Артқа» батырмасы жөнделді, экранды үлкейту өшірілді.'),
  ]],
  ['1.0.0', [
    tx('Threads сияқты лента, Instagram сияқты бастама беттері.'),
    tx('Мақсат → жоспар → тапсырма және әдеттер трекері.'),
    tx('Силлабус пен тапсырмалар бір «Оқу» бетінде, Camp / Çalışma / КБО шолуы.'),
  ]],
]

const TIPS: [string, string][] = [
  ['plus', tx('Ортадағы «+» батырмасынан рұқсат сұрау, бронь, жаңа жоспар мен әдет бірден ашылады.')],
  ['chat', tx('Чатты оңға сырғытып дыбысын өшіріңіз немесе архивке жіберіңіз, солға сырғытып оқылды деп белгілеңіз.')],
  ['check', tx('Әдеттерді күн сайын белгілеңіз: қанша күн қатарынан жасағаныңыз көрініп тұрады.')],
  ['send', tx('Telegram-ды байланыстырсаңыз, рұқсат жауабы мен хабарламалар ботқа бірден келеді.')],
  ['grid', tx('Рұқсат пен броньның QR кодын кезекші мұғалім камерамен тексереді.')],
  ['star', tx('Бастама бетіндегі «Оқу» бөлімінде бүгінгі тақырып пен оның тапсырмалары бірге тұрады.')],
]

export default function About({ tab }: { tab: 'news' | 'tips' }) {
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tab === 'news' ? tx('Жаңалықтар') : tx('Кеңестер')} back />
      {tab === 'news' ? NEWS.map(([v, items]) => (
        <Card key={v} className="grid gap-2">
          <h2 className="font-bold">{tx('Нұсқа {0}', v)}</h2>
          <ul className="grid gap-1.5 text-[15px]">{items.map((t) => <li key={t} className="flex gap-2"><span className="text-accent">•</span><span>{t}</span></li>)}</ul>
        </Card>
      )) : (
        <Card className="p-0 divide-y divide-line">
          {TIPS.map(([icon, t]) => (
            <div key={t} className="flex gap-3 px-4 py-3 items-start">
              <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={icon} size={18} /></span>
              <p className="text-[15px]">{t}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
