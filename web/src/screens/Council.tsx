import { useMemo, useState } from 'react'
import {
  addCouncilMeeting, addCouncilNote, addCouncilTask, addParentContact, classStudents, errText, finishCouncilMeeting, listClasses, listCouncil, listStaff,
  removeCouncilMeeting, removeCouncilNote, removeCouncilTask, resolveCouncilNotes, setCouncilTask, setNoteUrgent, photoUrl, uploadPhoto, type CouncilNote, type CouncilTask, type ParentContact, type Student,
} from '../lib/api'
import { chatTime, fmtDate, today } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, PageHead, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'

/* «Сынып кеңесі» — the class teacher and tutor's closed workspace: notes, meetings, a task board, talks with parents. */

type Tab = 'notes' | 'meeting' | 'board' | 'parents'
const COLS: [CouncilTask['status'], string][] = [
  ['todo', tx('Күтілуде')],
  ['doing', tx('Орындалуда')],
  ['done', tx('Аяқталды')],
]

const CHANNEL: Record<ParentContact['channel'], string> = {
  phone: tx('Телефон'),
  meeting: tx('Кездесу'),
  chat: tx('Чат'),
  visit: tx('Үйіне бару'),
}

const CHANNEL_ICONS: Record<ParentContact['channel'], string> = {
  phone: 'phone',
  meeting: 'user',
  chat: 'chat',
  visit: 'home',
}

const TAGS: [string, string, string][] = [
  ['grades', tx('Үлгерім'), '#2563eb'],
  ['conduct', tx('Тәртіп'), '#dc2626'],
  ['health', tx('Денсаулық'), '#16a34a'],
  ['dorm', tx('Жатақхана'), '#9333ea'],
  ['family', tx('Отбасы'), '#ea580c'],
  ['social', tx('Қарым-қатынас'), '#0891b2'],
  ['win', tx('Жетістік'), '#ca8a04'],
]
const tagOf = (k: string) => TAGS.find((t) => t[0] === k)

export default function Council({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const [tab, setTab] = useState<Tab>('notes')
  const data = useLoad(async () => {
    if (!cls) return null
    const [c, students, staff] = await Promise.all([listCouncil(cls.id), classStudents(cls.id), listStaff()])
    return { ...c, students, staff }
  }, [cls?.id])

  if (classes.loading && !classes.data) return <><PageHead title={tx('Сынып кеңесі')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Сынып кеңесі')} back /><Empty icon="lock" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></>
  const d = data.data
  const staffName = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'

  const openNotes = (d?.notes ?? []).filter((n) => !n.resolved_at)
  const urgentNotes = openNotes.filter((n) => n.urgent)
  const nextMeeting = (d?.meetings ?? []).filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const activeTasks = (d?.tasks ?? []).filter((t) => t.status !== 'done')
  const lateTasks = activeTasks.filter((t) => t.due_on != null && t.due_on < today())
  const contactsCount = d?.contacts.length ?? 0

  return (
    <div className="grid gap-4 pb-6">
      <PageHead
        title={tx('Сынып кеңесі')}
        back
        right={options.length > 1 ? (
          <select aria-label={tx('Сынып')} value={cls.id} onChange={(e) => go(`/council/${e.target.value}`)} className={`${inputCls} w-auto text-sm h-10`}>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : undefined}
      />

      {/* Top Hero Card with Class Info & Quick Stats */}
      <Card className="grid gap-3 bg-gradient-to-br from-surface to-surface-2 border-line">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-accent text-on-accent grid place-items-center shadow-card font-bold text-lg shrink-0">
            {cls.name}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight flex items-center gap-1.5 truncate">
              {tx('{0} сынып кеңесі', cls.name)}
              <span className="text-muted"><Icon n="lock" size={16} /></span>
            </h1>
            <p className="text-xs text-muted truncate">
              {tx('Сынып жетекшісі мен тәрбиешінің жабық кеңістігі')}
            </p>
          </div>
        </div>

        {/* 4 Summary Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-line">
          <button
            type="button"
            onClick={() => setTab('notes')}
            className={`rounded-lg p-2.5 text-left border transition ${tab === 'notes' ? 'bg-surface border-accent shadow-card' : 'bg-surface/60 border-line hover:bg-surface'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">{tx('Жазбалар')}</span>
              {urgentNotes.length > 0 && <span className="size-2 rounded-full bg-danger animate-pulse" />}
            </div>
            <p className="text-xl font-bold mt-1 tabular-nums">{openNotes.length}</p>
            <p className="text-[11px] text-muted truncate">
              {urgentNotes.length > 0 ? tx('{0} шұғыл', urgentNotes.length) : tx('шешілмеген')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setTab('meeting')}
            className={`rounded-lg p-2.5 text-left border transition ${tab === 'meeting' ? 'bg-surface border-accent shadow-card' : 'bg-surface/60 border-line hover:bg-surface'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">{tx('Жиналыс')}</span>
              <Icon n="clock" size={14} className={nextMeeting ? 'text-accent' : 'text-muted'} />
            </div>
            <p className="text-sm font-bold mt-2 truncate">
              {nextMeeting ? fmtDate(nextMeeting.starts_at) : tx('Жоқ')}
            </p>
            <p className="text-[11px] text-muted truncate">
              {nextMeeting ? tx('жоспарланған') : tx('белгіленбеген')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setTab('board')}
            className={`rounded-lg p-2.5 text-left border transition ${tab === 'board' ? 'bg-surface border-accent shadow-card' : 'bg-surface/60 border-line hover:bg-surface'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">{tx('Тапсырма')}</span>
              {lateTasks.length > 0 && <span className="size-2 rounded-full bg-danger" />}
            </div>
            <p className="text-xl font-bold mt-1 tabular-nums">{activeTasks.length}</p>
            <p className="text-[11px] text-muted truncate">
              {lateTasks.length > 0 ? tx('{0} кешіккен', lateTasks.length) : tx('орындалуда')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setTab('parents')}
            className={`rounded-lg p-2.5 text-left border transition ${tab === 'parents' ? 'bg-surface border-accent shadow-card' : 'bg-surface/60 border-line hover:bg-surface'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">{tx('Ата-аналар')}</span>
              <Icon n="chat" size={14} className="text-muted" />
            </div>
            <p className="text-xl font-bold mt-1 tabular-nums">{contactsCount}</p>
            <p className="text-[11px] text-muted truncate">{tx('сөйлесу жазбасы')}</p>
          </button>
        </div>
      </Card>

      {/* Modern Tabs Navigation */}
      <div role="tablist" aria-label={tx('Бөлімдер')} className="flex gap-2 overflow-x-auto py-1 -mx-1 px-1 [scrollbar-width:none]">
        {([
          ['notes', tx('Жазбалар'), openNotes.length, urgentNotes.length > 0],
          ['meeting', tx('Жиналыс'), nextMeeting ? 1 : 0, false],
          ['board', tx('Тапсырмалар'), activeTasks.length, lateTasks.length > 0],
          ['parents', tx('Ата-аналар'), contactsCount, false],
        ] as const).map(([id, label, count, alert]) => {
          const active = tab === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(id)}
              className={`h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-2 border transition ${
                active
                  ? 'bg-accent text-on-accent border-accent shadow-card'
                  : 'bg-surface border-line text-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              <span>{label}</span>
              {count > 0 && (
                <span
                  className={`min-w-5 h-5 px-1.5 rounded-full text-xs font-bold grid place-items-center ${
                    alert
                      ? 'bg-danger text-white'
                      : active
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-2 text-muted'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {data.loading && !d ? (
        <Skeleton rows={4} />
      ) : data.error ? (
        <ErrorBox text={data.error} retry={data.reload} />
      ) : d && (
        tab === 'notes' ? (
          <Notes classId={cls.id} notes={d.notes} students={d.students} staffName={staffName} reload={data.reload} />
        ) : tab === 'meeting' ? (
          <Meeting key={d.notes.length} classId={cls.id} d={d} staffName={staffName} reload={data.reload} />
        ) : tab === 'board' ? (
          <Board
            classId={cls.id}
            tasks={d.tasks}
            people={[cls.teacher_id, cls.tutor_id].filter((x): x is string => !!x)}
            staffName={staffName}
            reload={data.reload}
          />
        ) : (
          <Parents classId={cls.id} contacts={d.contacts} students={d.students} staffName={staffName} reload={data.reload} />
        )
      )}
    </div>
  )
}

/** The "@name" being typed at the end of the text, if any. */
const mentionAt = (text: string) => text.match(/(^|\s)@([^\s@]*)$/)?.[2] ?? null

function Notes({
  classId,
  notes,
  students,
  staffName,
  reload,
}: {
  classId: string
  notes: CouncilNote[]
  students: Student[]
  staffName: (id: string | null) => string
  reload: () => void
}) {
  const { me } = useMe()
  const [body, setBody] = useState('')
  const [tagged, setTagged] = useState<Student[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [urgent, setUrgent] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<'open' | 'urgent' | 'all'>('open')
  const [who, setWho] = useState('')
  const [tagF, setTagF] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [big, setBig] = useState<string | null>(null)

  const q = mentionAt(body)
  const hits = q == null ? [] : students.filter((s) => s.full_name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
  const short = (s: Student) => s.full_name.split(' ').slice(0, 2).join(' ')
  const tag = (s: Student) => {
    setBody(body.replace(/@([^\s@]*)$/, `@${short(s)} `))
    if (!tagged.some((t) => t.id === s.id)) setTagged([...tagged, s])
  }

  const onFileChange = (f: File | null) => {
    setFile(f)
    if (f) {
      const url = URL.createObjectURL(f)
      setFilePreview(url)
    } else {
      setFilePreview(null)
    }
  }

  const save = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      const photo = file ? await uploadPhoto(me.id, file) : null
      await addCouncilNote(classId, body.trim(), tagged.filter((s) => body.includes(`@${short(s)}`)).map((s) => s.id), { tags, urgent, photo })
      setBody('')
      setTagged([])
      setTags([])
      setUrgent(false)
      onFileChange(null)
      reload()
      toast(tx('Жазба сақталды'))
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const name = (id: string) => students.find((s) => s.id === id)

  const shown = notes
    .filter((n) => {
      if (show === 'open' && n.resolved_at) return false
      if (show === 'urgent' && (!n.urgent || n.resolved_at)) return false
      if (who && !n.student_ids.includes(who)) return false
      if (tagF && !n.tags.includes(tagF)) return false
      if (searchQ.trim() && !n.body.toLowerCase().includes(searchQ.trim().toLowerCase())) return false
      return true
    })
    .sort((a, b) => Number(b.urgent && !b.resolved_at) - Number(a.urgent && !a.resolved_at))

  const used = TAGS.filter(([k]) => notes.some((n) => n.tags.includes(k)))
  const openCount = notes.filter((n) => !n.resolved_at).length
  const urgentCount = notes.filter((n) => !n.resolved_at && n.urgent).length

  return (
    <div className="grid gap-4">
      {/* Composer Card */}
      <Card className="grid gap-3 shadow-card border-line">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Icon n="compose" size={18} className="text-accent" />
            {tx('Жаңа жазба жазу')}
          </p>
          <span className="text-xs text-muted">{tx('Ұстаздарға ғана көрінеді')}</span>
        </div>

        <textarea
          aria-label={tx('Жаңа жазба')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          className={`${inputCls} ${body ? 'h-24' : 'h-14'} py-2.5 transition-[height] text-sm resize-none`}
          placeholder={tx('Не байқадыңыз? Оқушыны белгілеу үшін @ жазыңыз')}
        />

        {hits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface-2 border border-line animate-fade-in">
            <span className="text-xs text-muted w-full font-medium">{tx('Оқушыны белгілеу')}:</span>
            {hits.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => tag(s)}
                className="h-8 px-2.5 rounded-full bg-surface text-accent text-xs font-semibold inline-flex items-center gap-1.5 border border-line shadow-sm hover:bg-accent hover:text-on-accent transition"
              >
                <Avatar name={s.full_name} photo={s.photo} size={20} />
                <span>@{short(s)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tags Selection */}
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">{tx('Тегтер')}:</span>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map(([k, l, c]) => {
              const on = tags.includes(k)
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags(on ? tags.filter((x) => x !== k) : [...tags, k])}
                  className={`h-7 px-2.5 rounded-full text-xs font-semibold border transition ${
                    on ? 'shadow-sm text-white' : 'hover:opacity-80'
                  }`}
                  style={on ? { background: c, borderColor: c, color: '#fff' } : { borderColor: c + '40', background: c + '12', color: c }}
                >
                  #{l}
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Image Preview */}
        {filePreview && (
          <div className="relative inline-flex items-center gap-3 p-2 rounded-lg bg-surface-2 border border-line justify-self-start">
            <img src={filePreview} alt="" className="size-14 rounded-md object-cover border border-line" />
            <div className="min-w-0 pr-2">
              <p className="text-xs font-medium truncate max-w-[200px]">{file?.name}</p>
              <button
                type="button"
                onClick={() => onFileChange(null)}
                className="text-xs text-danger font-medium hover:underline inline-flex items-center gap-1 mt-0.5"
              >
                <Icon n="x" size={14} />{tx('Суретті алып тастау')}
              </button>
            </div>
          </div>
        )}

        {/* Action Row */}
        <div className="flex items-center gap-2 pt-1 border-t border-line">
          <button
            type="button"
            aria-pressed={urgent}
            onClick={() => setUrgent(!urgent)}
            className={`h-10 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 border transition ${
              urgent ? 'bg-danger text-white border-danger shadow-card' : 'bg-surface-2 border-line text-ink hover:bg-surface'
            }`}
          >
            <Icon n="flag" size={16} />
            {urgent ? tx('Шұғыл белгісі бар') : tx('Шұғыл')}
          </button>

          <label className="h-10 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 bg-surface-2 border border-line text-ink hover:bg-surface cursor-pointer transition">
            <Icon n="file" size={16} />
            {file ? tx('Сурет ауыстыру') : tx('Сурет қосу')}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
          </label>

          <span className="flex-1" />

          <Button onClick={save} loading={busy} disabled={!body.trim()}>
            <Icon n="send" size={16} />
            {tx('Жазу')}
          </Button>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card className="grid gap-2.5 p-3 bg-surface-2/60 border-line">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Chips */}
          <div className="flex rounded-md bg-surface p-0.5 border border-line text-xs font-medium">
            <button
              type="button"
              onClick={() => setShow('open')}
              className={`h-8 px-3 rounded transition ${show === 'open' ? 'bg-accent text-on-accent font-semibold shadow-sm' : 'text-muted'}`}
            >
              {tx('Шешілмеген')} ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setShow('urgent')}
              className={`h-8 px-3 rounded transition ${show === 'urgent' ? 'bg-danger text-white font-semibold shadow-sm' : 'text-muted'}`}
            >
              {tx('Шұғыл')} ({urgentCount})
            </button>
            <button
              type="button"
              onClick={() => setShow('all')}
              className={`h-8 px-3 rounded transition ${show === 'all' ? 'bg-accent text-on-accent font-semibold shadow-sm' : 'text-muted'}`}
            >
              {tx('Барлығы')} ({notes.length})
            </button>
          </div>

          <span className="flex-1" />

          {/* Student Filter */}
          <select
            aria-label={tx('Оқушы бойынша сүзгі')}
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className={`${inputCls} w-auto h-9 text-xs py-1`}
          >
            <option value="">{tx('Барлық оқушылар')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={tx('Жазбалар ішінен іздеу...')}
            className={`${inputCls} h-9 pl-9 pr-8 text-xs bg-surface`}
          />
          <span className="absolute left-2.5 top-2.5 text-muted pointer-events-none">
            <Icon n="search" size={16} />
          </span>
          {searchQ && (
            <button
              type="button"
              onClick={() => setSearchQ('')}
              className="absolute right-2.5 top-2.5 text-muted hover:text-ink"
            >
              <Icon n="x" size={14} />
            </button>
          )}
        </div>

        {/* Tags quick filter */}
        {used.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line/60">
            <span className="text-[11px] text-muted">{tx('Тег')}:</span>
            {used.map(([k, l, c]) => {
              const active = tagF === k
              const count = notes.filter((n) => n.tags.includes(k) && (show === 'all' || !n.resolved_at)).length
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTagF(active ? '' : k)}
                  className={`h-6 px-2 rounded-full text-[11px] font-semibold transition ${
                    active ? 'text-white shadow-sm' : 'hover:opacity-80'
                  }`}
                  style={active ? { background: c, color: '#fff' } : { background: c + '18', color: c }}
                >
                  #{l} · {count}
                </button>
              )
            })}
            {tagF && (
              <button
                type="button"
                onClick={() => setTagF('')}
                className="text-[11px] text-muted underline hover:text-ink ml-1"
              >
                {tx('Тазарту')}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Notes List */}
      {!shown.length ? (
        <Empty
          icon="file"
          title={tx('Жазба табылмады')}
          text={tx('Апта бойы оқушылар туралы байқағаныңызды осында жазыңыз. Шешілмеген жазбалар келесі жиналыстың күн тәртібіне енеді.')}
        />
      ) : (
        <div className="grid gap-3">
          {shown.map((n) => {
            const isResolved = !!n.resolved_at
            return (
              <Card
                key={n.id}
                className={`grid gap-2.5 transition border-line ${
                  isResolved
                    ? 'opacity-70 bg-surface-2/40 border-l-4 border-l-success'
                    : n.urgent
                      ? 'border-l-4 border-l-danger shadow-card'
                      : 'hover:border-line'
                }`}
              >
                {/* Meta Header */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n.urgent && !isResolved && (
                      <span className="h-6 px-2.5 rounded-full bg-danger text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-sm">
                        <Icon n="flag" size={12} />
                        {tx('Шұғыл')}
                      </span>
                    )}
                    {n.tags.map((k) => {
                      const t = tagOf(k)
                      return (
                        t && (
                          <span
                            key={k}
                            className="h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center"
                            style={{ background: t[2] + '18', color: t[2] }}
                          >
                            #{t[1]}
                          </span>
                        )
                      )
                    })}
                  </div>

                  {isResolved ? (
                    <Badge tone="ok">{tx('Шешілді')}</Badge>
                  ) : (
                    <span className="text-muted text-[11px]">{chatTime(n.created_at)}</span>
                  )}
                </div>

                {/* Body Content */}
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink">
                  {n.body}
                </p>

                {/* Photo Attachment */}
                {n.photo && (
                  <button
                    type="button"
                    onClick={() => setBig(n.photo)}
                    className="justify-self-start group relative rounded-lg overflow-hidden border border-line"
                  >
                    <img
                      src={photoUrl(n.photo)}
                      alt=""
                      className="h-32 max-w-full rounded-lg object-cover group-hover:scale-105 transition"
                      loading="lazy"
                    />
                    <span className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition grid place-items-center text-white text-xs font-semibold">
                      {tx('Үлкейту')}
                    </span>
                  </button>
                )}

                {/* Tagged Students */}
                {n.student_ids.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-xs text-muted font-medium">{tx('Оқушылар')}:</span>
                    {n.student_ids.map((id) => {
                      const s = name(id)
                      return (
                        s && (
                          <a
                            key={id}
                            href={`#/mentor/${id}`}
                            className="h-7 px-2 rounded-full bg-surface-2 hover:bg-accent-soft hover:text-accent border border-line text-xs font-semibold inline-flex items-center gap-1.5 transition"
                          >
                            <Avatar name={s.full_name} photo={s.photo} size={18} />
                            <span>@{short(s)}</span>
                          </a>
                        )
                      )
                    })}
                  </div>
                )}

                {/* Footer Controls */}
                <div className="flex items-center gap-2 pt-2 border-t border-line text-xs text-muted">
                  <span className="flex-1 truncate">
                    <span className="font-medium text-ink">{staffName(n.author_id)}</span>
                    {isResolved && <span className="text-success font-medium">{' · '}{tx('шешілді')}</span>}
                  </span>

                  {!isResolved && (
                    <button
                      type="button"
                      aria-label={n.urgent ? tx('Шұғыл белгісін алып тастау') : tx('Шұғыл деп белгілеу')}
                      onClick={() => setNoteUrgent(n.id, !n.urgent).then(reload, (e) => toast(errText(e)))}
                      className={`size-9 grid place-items-center rounded-md border transition ${
                        n.urgent ? 'bg-danger-soft border-danger/40 text-danger' : 'bg-surface-2 border-line text-muted hover:text-ink'
                      }`}
                    >
                      <Icon n="flag" size={16} />
                    </button>
                  )}

                  {!isResolved && (
                    <button
                      type="button"
                      onClick={() => resolveCouncilNotes([n.id], null).then(reload, (e) => toast(errText(e)))}
                      className="h-9 px-3 rounded-md bg-success-soft text-success hover:bg-success hover:text-white border border-success/30 font-semibold inline-flex items-center gap-1.5 transition"
                    >
                      <Icon n="check" size={16} />
                      {tx('Шешілді')}
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label={tx('Өшіру')}
                    onClick={() => {
                      if (confirm(tx('Бұл жазбаны өшіруді растайсыз ба?'))) {
                        removeCouncilNote(n.id).then(reload, (e) => toast(errText(e)))
                      }
                    }}
                    className="size-9 grid place-items-center rounded-md hover:bg-danger-soft hover:text-danger text-muted border border-transparent hover:border-danger/30 transition"
                  >
                    <Icon n="x" size={16} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {big && (
        <div
          className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4 backdrop-blur-sm cursor-pointer"
          onClick={() => setBig(null)}
          role="dialog"
          aria-label={tx('Сурет')}
        >
          <img src={photoUrl(big)} alt="" className="max-h-full max-w-full rounded-md shadow-2xl" />
        </div>
      )}
    </div>
  )
}

type Data = Awaited<ReturnType<typeof listCouncil>> & { students: Student[] }

function Meeting({
  classId,
  d,
  staffName,
  reload,
}: {
  classId: string
  d: Data
  staffName: (id: string | null) => string
  reload: () => void
}) {
  const next = d.meetings.filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const past = d.meetings.filter((m) => m.done_at)
  const agenda = d.notes.filter((n) => !n.resolved_at).reverse().sort((a, b) => Number(b.urgent) - Number(a.urgent))
  const [when, setWhen] = useState('')
  const [minutes, setMinutes] = useState('')
  const [settled, setSettled] = useState<Set<string>>(() => new Set(agenda.map((n) => n.id)))
  const [busy, setBusy] = useState(false)

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await f()
      reload()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const at = (s: string) =>
    new Date(s).toLocaleString(lang === 'kk' ? 'kk-KZ' : lang, {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="grid gap-4">
      {/* Active / Schedule Meeting Card */}
      {!next ? (
        <Card className="grid gap-3 shadow-card border-line">
          <div className="flex items-center gap-2.5">
            <span className="size-10 rounded-xl bg-accent-soft text-accent grid place-items-center">
              <Icon n="clock" size={20} />
            </span>
            <div>
              <p className="font-semibold text-base">{tx('Келесі жиналысты белгілеу')}</p>
              <p className="text-xs text-muted">{tx('Сынып жетекшісі мен тәрбиеші бірлескен жиналысы')}</p>
            </div>
          </div>

          <Field label={tx('Күні мен уақыты')}>
            {(id) => (
              <input
                id={id}
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className={inputCls}
              />
            )}
          </Field>

          <p className="text-xs text-muted flex items-center gap-1.5 bg-surface-2 p-2.5 rounded-lg border border-line">
            <Icon n="bell" size={16} className="text-accent shrink-0" />
            <span>{tx('Екеуіңізге де жиналысқа 1 күн және 1 сағат қалғанда еске салу келеді.')}</span>
          </p>

          <Button
            disabled={!when}
            loading={busy}
            onClick={() => run(() => addCouncilMeeting(classId, new Date(when).toISOString()))}
          >
            <Icon n="plus" size={18} />
            {tx('Жиналыс белгілеу')}
          </Button>
        </Card>
      ) : (
        <Card className="grid gap-4 shadow-card border-line border-t-4 border-t-accent">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="size-12 rounded-xl bg-accent text-on-accent grid place-items-center shadow-card shrink-0">
              <Icon n="clock" size={24} />
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-accent uppercase tracking-wider block">
                {tx('Келесі жиналыс')}
              </span>
              <p className="text-lg font-bold text-ink leading-tight">{at(next.starts_at)}</p>
            </div>
            <button
              type="button"
              aria-label={tx('Жиналысты өшіру')}
              onClick={() => {
                if (confirm(tx('Жиналысты жоюды растайсыз ба?'))) {
                  run(() => removeCouncilMeeting(next.id))
                }
              }}
              className="size-10 grid place-items-center rounded-md hover:bg-danger-soft hover:text-danger text-muted border border-line transition"
            >
              <Icon n="x" size={18} />
            </button>
          </div>

          {/* Agenda Checklist */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm flex items-center gap-2">
                <Icon n="list" size={18} className="text-accent" />
                {tx('Күн тәртібі')} · <span className="tabular-nums">{agenda.length}</span>
              </p>
              <span className="text-xs text-muted">{tx('Шешілетін мәселелерді белгілеңіз')}</span>
            </div>

            {!agenda.length ? (
              <p className="text-sm text-muted bg-surface-2 p-3 rounded-lg border border-line">
                {tx('Шешілмеген жазба жоқ. Барлық мәселе реттелген.')}
              </p>
            ) : (
              <ul className="grid gap-2">
                {agenda.map((n) => {
                  const isChecked = settled.has(n.id)
                  return (
                    <li key={n.id}>
                      <label className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition ${
                        isChecked ? 'bg-accent-soft/40 border-accent/40' : 'bg-surface-2 border-line'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const s = new Set(settled)
                            if (s.has(n.id)) s.delete(n.id)
                            else s.add(n.id)
                            setSettled(s)
                          }}
                          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                        />
                        <div className="text-sm flex-1 min-w-0">
                          {n.urgent && (
                            <span className="h-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-bold inline-flex items-center gap-1 mb-1">
                              <Icon n="flag" size={10} />
                              {tx('Шұғыл')}
                            </span>
                          )}
                          <p className="whitespace-pre-line break-words text-ink leading-snug">{n.body}</p>
                          <p className="text-xs text-muted mt-1">
                            {staffName(n.author_id)} · {chatTime(n.created_at)}
                          </p>
                        </div>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Minutes Input */}
          <Field
            label={tx('Хаттама')}
            hint={tx('Белгіленген жазбалар «шешілді» деп мұрағатқа сақталады, қалғаны күн тәртібінде қалады.')}
          >
            {(id, dsc) => (
              <textarea
                id={id}
                aria-describedby={dsc}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                maxLength={10000}
                className={`${inputCls} h-28 py-2.5 text-sm resize-none`}
                placeholder={tx('Жиналыста қандай шешім қабылданды? Нәтижелерді жазыңыз...')}
              />
            )}
          </Field>

          <Button
            loading={busy}
            disabled={!minutes.trim()}
            onClick={() =>
              run(async () => {
                await finishCouncilMeeting(next.id, minutes.trim())
                const ids = agenda.filter((n) => settled.has(n.id)).map((n) => n.id)
                if (ids.length) await resolveCouncilNotes(ids, next.id)
                setMinutes('')
                toast(tx('Хаттама мұрағатқа сақталды'))
              })
            }
          >
            <Icon n="check" size={18} />
            {tx('Жиналысты аяқтау және хаттаманы сақтау')}
          </Button>
        </Card>
      )}

      {/* Past Meetings Archive */}
      {past.length > 0 && (
        <div className="grid gap-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Icon n="archive" size={14} />
              {tx('Өткен жиналыстар мұрағаты')}
            </h2>
            <span className="text-xs text-muted tabular-nums">{tx('{0} жиналыс', past.length)}</span>
          </div>

          <div className="grid gap-2.5">
            {past.map((m) => {
              const items = d.notes.filter((n) => n.meeting_id === m.id)
              return (
                <details
                  key={m.id}
                  className="group rounded-lg bg-surface shadow-card border border-line overflow-hidden transition"
                >
                  <summary className="p-3.5 font-semibold cursor-pointer list-none flex items-center justify-between hover:bg-surface-2 transition">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-8 rounded-md bg-surface-2 text-accent grid place-items-center shrink-0">
                        <Icon n="file" size={16} />
                      </span>
                      <div className="min-w-0 truncate">
                        <p className="text-sm font-semibold text-ink truncate">{at(m.starts_at)}</p>
                        <p className="text-xs text-muted">{tx('{0} мәселе қаралды', items.length)}</p>
                      </div>
                    </div>
                    <span className="text-muted group-open:rotate-90 transition-transform">
                      <Icon n="chev" size={16} />
                    </span>
                  </summary>

                  <div className="p-4 pt-2 border-t border-line text-sm grid gap-3 bg-surface-2/30">
                    <div>
                      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{tx('Хаттама')}:</p>
                      <p className="whitespace-pre-line text-ink leading-relaxed">{m.minutes}</p>
                    </div>

                    {items.length > 0 && (
                      <div className="pt-2 border-t border-line/60">
                        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">{tx('Қаралған мәселелер')}:</p>
                        <ul className="grid gap-1.5 text-xs text-muted">
                          {items.map((n) => (
                            <li key={n.id} className="flex items-start gap-2">
                              <span className="text-success font-bold">✓</span>
                              <span className="text-ink flex-1">{n.body}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Board({
  classId,
  tasks,
  people,
  staffName,
  reload,
}: {
  classId: string
  tasks: CouncilTask[]
  people: string[]
  staffName: (id: string | null) => string
  reload: () => void
}) {
  const [f, setF] = useState({ title: '', assignee: people[0] ?? '', due: '' })
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!f.title.trim()) return
    setBusy(true)
    try {
      await addCouncilTask({ class_id: classId, title: f.title.trim(), assignee_id: f.assignee || null, due_on: f.due || null })
      setF({ ...f, title: '', due: '' })
      reload()
      toast(tx('Тапсырма қосылды'))
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const move = (t: CouncilTask, step: number) => {
    const currentIndex = COLS.findIndex(([s]) => s === t.status)
    const nextCol = COLS[currentIndex + step]
    if (nextCol) {
      setCouncilTask(t.id, nextCol[0]).then(reload, (e) => toast(errText(e)))
    }
  }

  const isLate = (t: CouncilTask) => t.status !== 'done' && t.due_on != null && t.due_on < today()
  const isTodayDue = (t: CouncilTask) => t.status !== 'done' && t.due_on != null && t.due_on === today()

  return (
    <div className="grid gap-4">
      {/* Add Task Card */}
      <Card className="grid gap-3 shadow-card border-line">
        <p className="font-semibold text-sm flex items-center gap-2">
          <Icon n="plus" size={18} className="text-accent" />
          {tx('Жаңа тапсырма қосу')}
        </p>

        <input
          aria-label={tx('Тапсырма атауы')}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          maxLength={300}
          className={`${inputCls} text-sm`}
          placeholder={tx('Не істеу керек? Мысалы: оқушының ата-анасына хабарласу')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label={tx('Жауапты')}>
            {(id) => (
              <select
                id={id}
                aria-label={tx('Жауапты')}
                value={f.assignee}
                onChange={(e) => setF({ ...f, assignee: e.target.value })}
                className={`${inputCls} text-sm`}
              >
                <option value="">{tx('Жауапты жоқ')}</option>
                {people.map((p) => (
                  <option key={p} value={p}>{staffName(p)}</option>
                ))}
              </select>
            )}
          </Field>

          <Field label={tx('Дедлайн')}>
            {(id) => (
              <input
                id={id}
                aria-label={tx('Дедлайн')}
                type="date"
                value={f.due}
                onChange={(e) => setF({ ...f, due: e.target.value })}
                className={`${inputCls} text-sm`}
              />
            )}
          </Field>
        </div>

        <Button onClick={add} loading={busy} disabled={f.title.trim().length < 2}>
          <Icon n="plus" size={18} />
          {tx('Тапсырма қосу')}
        </Button>
      </Card>

      {/* 3-Column Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {COLS.map(([s, label], k) => {
          const list = tasks.filter((t) => t.status === s)
          const colBadgeStyle =
            s === 'todo'
              ? 'bg-surface-2 text-muted'
              : s === 'doing'
                ? 'bg-warning-soft text-warning font-bold'
                : 'bg-success-soft text-success font-bold'

          return (
            <section
              key={s}
              aria-label={label}
              className="grid gap-2 rounded-xl bg-surface-2/80 p-3 border border-line shadow-sm"
            >
              <div className="px-1 flex items-center justify-between pb-1">
                <h2 className="text-sm font-bold flex items-center gap-2 text-ink">
                  {label}
                </h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${colBadgeStyle} tabular-nums`}>
                  {list.length}
                </span>
              </div>

              {!list.length ? (
                <div className="py-6 text-center text-xs text-muted rounded-lg bg-surface/50 border border-dashed border-line">
                  {tx('Тапсырма жоқ')}
                </div>
              ) : (
                list.map((t) => {
                  const late = isLate(t)
                  const todayDue = isTodayDue(t)
                  const isDone = s === 'done'

                  return (
                    <div
                      key={t.id}
                      className={`grid gap-2 rounded-lg bg-surface p-3.5 shadow-card border transition ${
                        late
                          ? 'border-danger/40 bg-danger-soft/10'
                          : 'border-line hover:border-accent/40'
                      }`}
                    >
                      <p className={`text-sm font-medium break-words leading-snug ${isDone ? 'line-through text-muted' : 'text-ink'}`}>
                        {t.title}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {t.assignee_id ? (
                          <span className="inline-flex items-center gap-1 bg-surface-2 px-2 py-0.5 rounded-full text-ink font-medium">
                            <span className="size-4 rounded-full bg-accent-soft text-accent text-[10px] grid place-items-center font-bold">
                              {staffName(t.assignee_id)[0]}
                            </span>
                            {staffName(t.assignee_id)}
                          </span>
                        ) : (
                          <span className="text-muted text-[11px]">{tx('Жауапты жоқ')}</span>
                        )}

                        {t.due_on && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              late
                                ? 'bg-danger text-white'
                                : todayDue
                                  ? 'bg-warning-soft text-warning'
                                  : 'bg-surface-2 text-muted'
                            }`}
                          >
                            <Icon n="clock" size={11} />
                            {late ? tx('Мерзімі өтті: {0}', fmtDate(t.due_on)) : todayDue ? tx('Бүгін') : fmtDate(t.due_on)}
                          </span>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1 pt-1 border-t border-line">
                        {k > 0 && (
                          <button
                            type="button"
                            aria-label={tx('Артқа жылжыту')}
                            onClick={() => move(t, -1)}
                            className="size-8 grid place-items-center rounded-md bg-surface-2 hover:bg-surface border border-line text-muted transition"
                          >
                            <Icon n="back" size={14} />
                          </button>
                        )}
                        {k < 2 && (
                          <button
                            type="button"
                            aria-label={tx('Алға жылжыту')}
                            onClick={() => move(t, 1)}
                            className="h-8 px-2.5 rounded-md bg-accent-soft text-accent hover:bg-accent hover:text-on-accent text-xs font-semibold inline-flex items-center gap-1 transition"
                          >
                            <span>{COLS[k + 1][1]}</span>
                            <Icon n="chev" size={14} />
                          </button>
                        )}
                        <span className="flex-1" />
                        <button
                          type="button"
                          aria-label={tx('Өшіру')}
                          onClick={() => {
                            if (confirm(tx('Тапсырманы өшіруді растайсыз ба?'))) {
                              removeCouncilTask(t.id).then(reload, (e) => toast(errText(e)))
                            }
                          }}
                          className="size-8 grid place-items-center rounded-md hover:bg-danger-soft hover:text-danger text-muted transition"
                        >
                          <Icon n="x" size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Parents({
  classId,
  contacts,
  students,
  staffName,
  reload,
}: {
  classId: string
  contacts: ParentContact[]
  students: Student[]
  staffName: (id: string | null) => string
  reload: () => void
}) {
  const [f, setF] = useState({ student: '', date: today(), channel: 'phone' as ParentContact['channel'], summary: '' })
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const name = useMemo(() => new Map(students.map((s) => [s.id, s.full_name])), [students])

  const add = async () => {
    if (!f.student || !f.summary.trim()) return
    setBusy(true)
    try {
      await addParentContact({ class_id: classId, student_id: f.student, on_date: f.date, channel: f.channel, summary: f.summary.trim() })
      setF({ ...f, summary: '' })
      reload()
      toast(tx('Ата-анамен сөйлесу жазбасы сақталды'))
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = contacts.filter((c) => !who || c.student_id === who)

  return (
    <div className="grid gap-4">
      {/* Add Parent Talk Card */}
      <Card className="grid gap-3 shadow-card border-line">
        <p className="font-semibold text-sm flex items-center gap-2">
          <Icon n="chat" size={18} className="text-accent" />
          {tx('Ата-анамен сөйлесуді тіркеу')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label={tx('Оқушы')}>
            {(id) => (
              <select
                id={id}
                aria-label={tx('Оқушы')}
                value={f.student}
                onChange={(e) => setF({ ...f, student: e.target.value })}
                className={`${inputCls} text-sm`}
              >
                <option value="">{tx('Оқушыны таңдаңыз')}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            )}
          </Field>

          <Field label={tx('Күні')}>
            {(id) => (
              <input
                id={id}
                aria-label={tx('Күні')}
                type="date"
                value={f.date}
                onChange={(e) => setF({ ...f, date: e.target.value })}
                className={`${inputCls} text-sm`}
              />
            )}
          </Field>
        </div>

        {/* Channel Selector */}
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">{tx('Байланыс түрі')}:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(CHANNEL) as [ParentContact['channel'], string][]).map(([k, label]) => {
              const active = f.channel === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setF({ ...f, channel: k })}
                  className={`h-10 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    active
                      ? 'bg-accent text-on-accent border-accent shadow-card'
                      : 'bg-surface-2 border-line text-muted hover:text-ink hover:bg-surface'
                  }`}
                >
                  <Icon n={CHANNEL_ICONS[k]} size={16} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <Field label={tx('Сөйлесу қорытындысы')}>
          {(id) => (
            <textarea
              id={id}
              aria-label={tx('Не туралы сөйлестіңіз?')}
              value={f.summary}
              onChange={(e) => setF({ ...f, summary: e.target.value })}
              maxLength={2000}
              className={`${inputCls} h-24 py-2.5 text-sm resize-none`}
              placeholder={tx('Не туралы сөйлестіңіз? Қандай мәселелер мен шешімдер талқыланды?')}
            />
          )}
        </Field>

        <Button onClick={add} loading={busy} disabled={!f.student || f.summary.trim().length < 2}>
          <Icon n="check" size={18} />
          {tx('Жазбаны сақтау')}
        </Button>
      </Card>

      {/* Filter by Student */}
      <div className="flex items-center justify-between gap-2">
        <select
          aria-label={tx('Оқушы бойынша сүзгі')}
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className={`${inputCls} w-auto h-9 text-xs py-1`}
        >
          <option value="">{tx('Барлық оқушылар')}</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>

        <span className="text-xs text-muted tabular-nums">
          {tx('{0} жазба', shown.length)}
        </span>
      </div>

      {/* History Feed */}
      {!shown.length ? (
        <Empty
          icon="chat"
          title={tx('Әзірге жазба жоқ')}
          text={tx('Ата-анамен кім, қашан, не туралы сөйлескені осында сақталады — ұстаздар арасында ақпарат бөлісіп, бір сұрақты екі рет қоймау үшін.')}
        />
      ) : (
        <div className="grid gap-3">
          {shown.map((c) => {
            const studentName = name.get(c.student_id) ?? '—'
            const studentObj = students.find((s) => s.id === c.student_id)

            return (
              <Card key={c.id} className="grid gap-2.5 shadow-card border-line">
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={`#/mentor/${c.student_id}`}
                    className="flex items-center gap-2 hover:text-accent font-semibold text-sm group"
                  >
                    <Avatar name={studentName} photo={studentObj?.photo} size={28} />
                    <span className="group-hover:underline truncate">{studentName}</span>
                  </a>

                  <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold bg-accent-soft text-accent">
                    <Icon n={CHANNEL_ICONS[c.channel]} size={13} />
                    <span>{CHANNEL[c.channel]}</span>
                  </span>
                </div>

                <p className="text-sm whitespace-pre-line break-words text-ink leading-relaxed bg-surface-2/50 p-3 rounded-lg border border-line">
                  {c.summary}
                </p>

                <div className="flex items-center justify-between text-xs text-muted pt-1">
                  <span>{staffName(c.staff_id)}</span>
                  <span>{fmtDate(c.on_date)}</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
