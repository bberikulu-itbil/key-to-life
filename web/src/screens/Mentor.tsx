import { useEffect, useState } from 'react'
import {
  addMedia, addMentorMeeting, classMentorMeetings, classStudentForms, classStudents, errText, finishMentorMeeting,
  listClasses, listClassResources, listStaff, mentorAssign, mentorEvery, photoUrl, rateMedia, removeMentorMeeting, saveStudentForm,
  saveStudentRoadmap, seedDemoClass, setMediaProgress, staffClasses, studentMentor, supabase, updateStudentAccount, uploadPhoto,
  type Media, type MediaProgressState, type MentorMeeting,
} from '../lib/api'
import { toLatin, makeEasyPassword } from '../lib/translit'
import { mbtiScore } from '../lib/mbti'
import { MI_KINDS, miScore } from '../lib/mi'
import { RIASEC, hollandScore } from '../lib/holland'
import {
  calcGoalProgress, fmtBirthday, FORM, FREQUENCY_LABELS, getCategoryMeta, MBTI_TYPES, mentorStatus, NATIONS, PLAN_CATEGORIES, PLAN_PRESETS,
  PRIORITY_LABELS, TEMPLATES, TIME_OF_DAY_LABELS, type PlanCategory, type PlanPreset, type RoadmapGoal,
  type RoadmapHabit, type RoadmapTask, type StudentRoadmap,
} from '../lib/mentor'
import { GALLUP_DOMAINS, GALLUP_THEMES, findGallup } from '../lib/gallup'
import { addDays, fmtDate, streak, today } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import LocationPicker from '../components/LocationPicker'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'

const BLOOD_TYPES = [
  'I (0) Rh+',
  'I (0) Rh-',
  'II (A) Rh+',
  'II (A) Rh-',
  'III (B) Rh+',
  'III (B) Rh-',
  'IV (AB) Rh+',
  'IV (AB) Rh-',
  'Белгісіз',
]

/* «Анкета және жеке даму жоспары» — 1-on-1 mentor meetings, student questionnaire, and rich roadmap (Goals, Habits, Tasks). */

const at = (s: string) => new Date(s).toLocaleString(lang === 'kk' ? 'kk-KZ' : lang, { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' })
export type DossierTab = 'info' | 'tests' | 'plan' | 'meetings' | 'resources'

export default function Mentor({ studentId, classId }: { studentId?: string; classId?: string }) {
  const { me } = useMe()
  if (me.role === 'student') return <StudentOwnDossier />
  return <TeacherDossierMasterDetail initialStudentId={studentId} classId={classId} />
}

/* ==========================================================================
   Мұғалімдер үшін: Master-Detail Анкета және Оқушылар карточкасы
   ========================================================================== */

function TeacherDossierMasterDetail({ initialStudentId, classId }: { initialStudentId?: string; classId?: string }) {
  const { me } = useMe()
  const classes = useLoad(listClasses, [])
  const options = staffClasses(classes.data ?? [], me)

  const [inferredClassId, setInferredClassId] = useState<string | null>(null)
  useEffect(() => {
    if (initialStudentId && !classId) {
      supabase.from('profiles').select('class_id').eq('id', initialStudentId).maybeSingle().then(({ data }) => {
        if (data?.class_id) setInferredClassId(data.class_id)
      })
    }
  }, [initialStudentId, classId])

  const activeClassId = classId ?? inferredClassId
  const cls = (activeClassId ? (classes.data ?? []).find((c) => c.id === activeClassId) : null) ?? options.find((c) => c.id === activeClassId) ?? options[0]
  const visibleOptions = cls && !options.some((c) => c.id === cls.id) ? [cls, ...options] : options

  const [seeding, setSeeding] = useState(false)
  const handleSeedDemo = async () => {
    setSeeding(true)
    try {
      const res = await seedDemoClass(tx('7-Демо'))
      toast(tx('Демо сынып және 5 оқушының анкетасы сәтті жасалды!'))
      await classes.reload()
      go(`/mentor?class=${res.class_id}`)
    } catch (e) {
      toast(errText(e))
    } finally {
      setSeeding(false)
    }
  }

  const data = useLoad(async () => {
    if (!cls) return null
    const [students, meetings, every] = await Promise.all([
      classStudents(cls.id),
      classMentorMeetings(cls.id),
      mentorEvery(cls.id),
    ])
    const sids = students.map((s) => s.id)
    const formsMap = await classStudentForms(sids)
    return { students, meetings, every, formsMap }
  }, [cls?.id])

  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId ?? null)
  const [search, setSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [tab, setTab] = useState<DossierTab>('info')
  const [formsState, setFormsState] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    if (data.data?.formsMap) {
      setFormsState(data.data.formsMap)
    }
    if (data.data?.students.length && !selectedId) {
      if (initialStudentId && data.data.students.some((s) => s.id === initialStudentId)) {
        setSelectedId(initialStudentId)
      } else {
        setSelectedId(data.data.students[0].id)
      }
    }
  }, [data.data, initialStudentId, selectedId])

  if (classes.loading && !classes.data) {
    return (
      <div className="grid gap-3 pb-6">
        <PageHead title={tx('Оқушылар анкетасы')} back />
        <Skeleton />
      </div>
    )
  }

  if (!cls) {
    return (
      <div className="grid gap-3 pb-6">
        <PageHead
          title={tx('Оқушылар анкетасы')}
          back
          right={
            <Button kind="primary" onClick={handleSeedDemo} loading={seeding}>
              <Icon n="sparkles" size={16} />
              <span>{tx('Демо сыныпты қосу')}</span>
            </Button>
          }
        />
        <Empty
          icon="user"
          title={tx('Сынып бекітілмеген')}
          text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')}
          action={
            <Button kind="primary" onClick={handleSeedDemo} loading={seeding}>
              <Icon n="sparkles" size={16} />
              <span>{tx('Демо сыныпты қосу (7-Демо)')}</span>
            </Button>
          }
        />
      </div>
    )
  }

  const { students = [], meetings = [], every = 30 } = data.data ?? {}
  const rows = students.map((s) => {
    const st = mentorStatus(
      meetings.filter((m) => m.student_id === s.id),
      every
    )
    const form = formsState[s.id] ?? {}
    return { s, st, form }
  })

  const covered = rows.filter((r) => !r.st.due).length
  const selectedStudent = students.find((s) => s.id === selectedId)

  const filtered = rows.filter(({ s, form }) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const matchName = s.full_name.toLowerCase().includes(q)
    const matchIin = (form.iin ?? '').toLowerCase().includes(q)
    const matchBday = (form.birthday ?? '').toLowerCase().includes(q)
    const matchHobby = (form.hobby ?? '').toLowerCase().includes(q)
    const matchSport = (form.sport ?? '').toLowerCase().includes(q)
    const matchNation = (form.nation ?? '').toLowerCase().includes(q)
    return matchName || matchIin || matchBday || matchHobby || matchSport || matchNation
  })

  return (
    <div className="grid gap-3 pb-6 w-full">
      {/* Top Header */}
      <PageHead
        title={tx('Оқушылар анкетасы')}
        back
        right={
          <div className="flex items-center gap-2">
            <Button
              kind="secondary"
              onClick={handleSeedDemo}
              loading={seeding}
              title={tx('Демо сынып пен 5 оқушының деректерін жүктеу')}
            >
              <Icon n="sparkles" size={16} />
              <span className="hidden md:inline">{tx('Демо сынып')}</span>
            </Button>
            {visibleOptions.length > 1 && (
              <select
                aria-label={tx('Сынып')}
                value={cls.id}
                onChange={(e) => go(`/mentor?class=${e.target.value}`)}
                className={`${inputCls} w-auto font-medium h-10 py-1`}
              >
                {visibleOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <Button kind="secondary" onClick={() => go(`/journal/${cls.id}?tab=mentor`)}>
              <Icon n="calendar" size={16} />
              <span className="hidden sm:inline">{tx('Күнтізбе')}</span>
            </Button>
          </div>
        }
      />

      {data.loading && !data.data ? (
        <Skeleton />
      ) : data.error ? (
        <ErrorBox text={data.error} retry={data.reload} />
      ) : (
        <div className="flex gap-4 items-start w-full">
          {/* Left Sidebar: Student Directory */}
          <div
            className={`${
              sidebarCollapsed ? 'hidden' : 'block'
            } w-full lg:w-72 xl:w-80 shrink-0 bg-surface rounded-xl shadow-card border border-[var(--card-line,transparent)] p-3 ${
              selectedId ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Search Box matching the screenshot */}
            <div className="relative mb-3">
              <Icon n="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tx('Іздеу...')}
                className="w-full bg-surface-2 dark:bg-surface-3 rounded-lg pl-9 pr-8 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent-soft transition"
              />
              {search && (
                <button
                  type="button"
                  aria-label={tx('Тазарту')}
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 size-5 grid place-items-center rounded-full text-muted hover:text-fg"
                >
                  <Icon n="x" size={14} />
                </button>
              )}
            </div>

            {/* Quick stats / Progress */}
            <div className="px-1 py-1 mb-2 flex items-center justify-between text-xs text-muted">
              <span>{tx('{0} оқушы', students.length)}</span>
              <span>
                {covered}/{students.length} {tx('жұмыс жүргізілді')}
              </span>
            </div>

            {/* Students List */}
            <div className="space-y-1 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {!filtered.length ? (
                <div className="py-8 text-center text-xs text-muted grid gap-2 place-items-center">
                  <span>{tx('Оқушы табылмады')}</span>
                  {students.length === 0 && (
                    <Button kind="secondary" onClick={handleSeedDemo} loading={seeding}>
                      <Icon n="sparkles" size={14} />
                      <span>{tx('Демо оқушылар')}</span>
                    </Button>
                  )}
                </div>
              ) : (
                filtered.map(({ s, st, form }) => {
                  const isSelected = s.id === selectedId
                  const bdayDisplay = form.birthday
                    ? fmtBirthday(form.birthday)
                    : form.iin
                    ? tx('ЖСН: {0}', form.iin)
                    : form.hobby
                    ? form.hobby
                    : [s.olympiad, s.club].filter(Boolean).join(' · ') || '—'

                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-accent/15 dark:bg-accent/25 text-accent font-semibold border-l-4 border-accent shadow-xs'
                          : 'hover:bg-surface-2 text-fg'
                      }`}
                    >
                      <Avatar name={s.full_name} photo={s.photo} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate leading-snug">{s.full_name}</div>
                        <div
                          className={`text-xs truncate mt-0.5 ${
                            isSelected ? 'text-accent/80 font-medium' : 'text-muted'
                          }`}
                        >
                          {bdayDisplay}
                        </div>
                      </div>
                      {st.due && (
                        <span
                          className="size-2 rounded-full bg-danger shrink-0"
                          title={tx('Кездесу қажет')}
                        />
                      )}
                      {st.next && (
                        <span
                          className="size-2 rounded-full bg-accent shrink-0"
                          title={tx('Кездесу алда')}
                        />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Main Dossier Panel */}
          <div
            className={`flex-1 min-w-0 bg-surface rounded-xl shadow-card border border-[var(--card-line,transparent)] p-4 lg:p-6 ${
              !selectedId ? 'hidden lg:block' : 'block'
            }`}
          >
            {selectedStudent ? (
              <StudentDossierView
                key={selectedStudent.id}
                student={selectedStudent}
                allStudents={students}
                onSelectStudent={setSelectedId}
                classId={cls.id}
                classNameStr={cls.name}
                tab={tab}
                onTabChange={setTab}
                onBack={() => setSelectedId(null)}
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                onFormUpdated={(newAnswers) => {
                  setFormsState((prev) => ({ ...prev, [selectedStudent.id]: newAnswers }))
                }}
              />
            ) : (
              <div className="py-24 text-center text-muted">
                <Icon n="user" size={44} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-lg text-fg">{tx('Оқушыны таңдаңыз')}</p>
                <p className="text-sm mt-1">{tx('Сол жақтағы тізімнен оқушының жеке анкетасын ашыңыз.')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
   Оқушының толық Dossier / Анкета витринасы (5 Tabs, 2-Column Grid, Gallup, Roadmap)
   ========================================================================== */

function StudentDossierView({
  student,
  allStudents,
  onSelectStudent,
  classId,
  classNameStr,
  tab,
  onTabChange,
  onBack,
  sidebarCollapsed,
  onToggleSidebar,
  onFormUpdated,
}: {
  student: { id: string; full_name: string; latin_name?: string | null; photo: string | null; class_id?: string; olympiad?: string | null; club?: string | null }
  allStudents?: { id: string; full_name: string }[]
  onSelectStudent?: (id: string) => void
  classId?: string
  classNameStr?: string
  tab: DossierTab
  onTabChange: (t: DossierTab) => void
  onBack?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onFormUpdated?: (answers: Record<string, string>) => void
}) {
  const data = useLoad(async () => Promise.all([studentMentor(student.id), listStaff()]), [student.id])
  const [d, staff] = data.data ?? [null, []]

  const currentIndex = allStudents ? allStudents.findIndex((s) => s.id === student.id) : -1
  const prevStudent = allStudents && currentIndex > 0 ? allStudents[currentIndex - 1] : null
  const nextStudent = allStudents && currentIndex >= 0 && currentIndex < allStudents.length - 1 ? allStudents[currentIndex + 1] : null

  const currentFullName = d?.student?.full_name || student.full_name
  const currentLatinName = d?.student?.latin_name ?? student.latin_name ?? null

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [roadmap, setRoadmap] = useState<StudentRoadmap>({ goals: [], habits: [], tasks: [] })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [dotsMenuOpen, setDotsMenuOpen] = useState(false)
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [gallupPicker, setGallupPicker] = useState<'top' | 'low' | null>(null)
  const [addPlan, setAddPlan] = useState(false)
  const [addMeeting, setAddMeeting] = useState(false)
  const [finishMeeting, setFinishMeeting] = useState<MentorMeeting | null>(null)
  const [questionsOpen, setQuestionsOpen] = useState(true)

  useEffect(() => {
    if (d?.form?.answers) {
      setAnswers(d.form.answers)
    }
    if (d?.roadmap) {
      setRoadmap(d.roadmap)
    }
  }, [d])

  const saveField = async (key: string, val: string) => {
    const updated = { ...answers, [key]: val }
    setAnswers(updated)
    setSaving(true)
    try {
      await saveStudentForm(student.id, updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onFormUpdated?.(updated)
    } catch (e) {
      toast(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMultipleFields = async (patch: Record<string, string>) => {
    const updated = { ...answers, ...patch }
    setAnswers(updated)
    setSaving(true)
    try {
      await saveStudentForm(student.id, updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onFormUpdated?.(updated)
    } catch (e) {
      toast(errText(e))
    } finally {
      setSaving(false)
    }
  }

  if (data.loading && !data.data) return <Skeleton />
  if (data.error || !d) return <ErrorBox text={data.error ?? tx('Табылмады')} retry={data.reload} />

  const staffName = (sid: string | null) =>
    staff.find((x) => x.id === sid)?.full_name.split(' ').slice(0, 2).join(' ') ?? '—'
  const nextMeetings = d.meetings.filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const pastMeetings = d.meetings.filter((m) => m.done_at)

  const testMbti = d.tests.find((x) => x.type === 'mbti')
  const testMi = d.tests.find((x) => x.type === 'mi')
  const testHol = d.tests.find((x) => x.type === 'holland')

  // Calculated or manual MBTI
  const mbtiComputed = testMbti ? mbtiScore(testMbti.answers) : null
  const mbtiDisplayType = answers.mbti?.trim() || mbtiComputed?.type || '—'

  // Gallup themes parsed from answers
  const topGallupList = (answers.top_gallup ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const lowGallupList = (answers.low_gallup ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const tabs: { id: DossierTab; label: string; icon: string }[] = [
    { id: 'info', label: tx('Ақпарат'), icon: 'file' },
    { id: 'tests', label: tx('Жеке қасиеттер'), icon: 'list' },
    { id: 'plan', label: tx('Жоспар'), icon: 'grid' },
    { id: 'meetings', label: tx('Кездесулер'), icon: 'calendar' },
    { id: 'resources', label: tx('Ресурстар'), icon: 'book' },
  ]

  return (
    <div className="grid gap-5">
      {/* Top Header Bar matching Notion/Airtable style */}
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="lg:hidden inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-sm font-semibold text-muted hover:text-fg hover:bg-surface-2 shrink-0 mr-1"
            >
              <Icon n="back" size={16} />
              <span>{tx('Тізім')}</span>
            </button>
          )}

          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-sm font-semibold transition shrink-0 ${
                tab === t.id
                  ? 'bg-surface shadow-xs text-fg border border-line ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-muted hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Icon n={t.icon} size={15} />
              <span>{t.label}</span>
            </button>
          ))}

          {/* Plus button */}
          <div className="relative">
            <button
              type="button"
              aria-label={tx('Қосымша')}
              onClick={() => setPlusMenuOpen(!plusMenuOpen)}
              className="size-9 rounded-lg border border-line grid place-items-center text-muted hover:text-fg hover:bg-surface-2 transition shrink-0"
            >
              <Icon n="plus" size={16} />
            </button>
            {plusMenuOpen && (
              <div className="absolute left-0 mt-1 w-52 rounded-lg bg-surface shadow-lg border border-line py-1 z-30 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false)
                    window.print()
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                >
                  <Icon n="file" size={15} />
                  {tx('Басып шығару (PDF)')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false)
                    setAddMeeting(true)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                >
                  <Icon n="calendar" size={15} />
                  {tx('Кездесу белгілеу')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false)
                    setAddPlan(true)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                >
                  <Icon n="grid" size={15} />
                  {tx('Жоспар құру')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Action Icons: student navigation, ⋮ and ⤢ */}
        <div className="flex items-center gap-1 shrink-0 relative">
          {allStudents && allStudents.length > 1 && (
            <div className="flex items-center gap-1 border-r border-line pr-2 mr-1">
              <button
                type="button"
                disabled={!prevStudent}
                onClick={() => prevStudent && onSelectStudent?.(prevStudent.id)}
                className="size-8 rounded-lg text-muted hover:text-fg hover:bg-surface-2 grid place-items-center disabled:opacity-20 disabled:pointer-events-none transition"
                title={prevStudent ? `${tx('Алдыңғы оқушы')}: ${prevStudent.full_name}` : tx('Алдыңғы оқушы')}
              >
                <Icon n="back" size={15} />
              </button>
              <span className="text-xs font-mono font-medium text-muted px-1 select-none">
                {currentIndex + 1}/{allStudents.length}
              </span>
              <button
                type="button"
                disabled={!nextStudent}
                onClick={() => nextStudent && onSelectStudent?.(nextStudent.id)}
                className="size-8 rounded-lg text-muted hover:text-fg hover:bg-surface-2 grid place-items-center disabled:opacity-20 disabled:pointer-events-none transition"
                title={nextStudent ? `${tx('Келесі оқушы')}: ${nextStudent.full_name}` : tx('Келесі оқушы')}
              >
                <Icon n="chev" size={15} className="rotate-90" />
              </button>
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              aria-label={tx('Мәзір')}
              onClick={() => setDotsMenuOpen(!dotsMenuOpen)}
              className="size-9 rounded-lg text-muted hover:text-fg hover:bg-surface-2 grid place-items-center transition"
            >
              <Icon n="dots" size={18} />
            </button>
            {dotsMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-lg bg-surface shadow-lg border border-line py-1 z-30 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setDotsMenuOpen(false)
                    window.print()
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                >
                  <Icon n="file" size={15} />
                  {tx('Басып шығару')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDotsMenuOpen(false)
                    setAddPlan(true)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                >
                  <Icon n="plus" size={15} />
                  {tx('Жоспар құру')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDotsMenuOpen(false)
                    setAccountModalOpen(true)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                >
                  <Icon n="key" size={15} />
                  {tx('Аккаунт мәліметтері')}
                </button>
                {classId && (
                  <button
                    type="button"
                    onClick={() => {
                      setDotsMenuOpen(false)
                      go(`/journal/${classId}?tab=mentor`)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2 text-fg"
                  >
                    <Icon n="calendar" size={15} />
                    {tx('Сынып журналы')}
                  </button>
                )}
              </div>
            )}
          </div>

          {onToggleSidebar && (
            <button
              type="button"
              aria-label={sidebarCollapsed ? tx('Тізімді көрсету') : tx('Толық экран')}
              onClick={onToggleSidebar}
              className="size-9 rounded-lg text-muted hover:text-fg hover:bg-surface-2 grid place-items-center transition hidden lg:grid"
              title={sidebarCollapsed ? tx('Тізімді көрсету') : tx('Толық экран')}
            >
              <Icon n="expand" size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Student Name Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={currentFullName} photo={student.photo} size={48} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-fg">
                {currentFullName}
              </h1>
              {currentLatinName && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded bg-surface-2 dark:bg-surface-3 text-muted border border-line"
                  title={tx('Латын түріндегі аты-жөні')}
                >
                  {currentLatinName}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted">
              {classNameStr && <span className="font-semibold text-accent">{classNameStr}</span>}
              {student.olympiad && <span>· 🏆 {student.olympiad}</span>}
              {student.club && <span>· 🎭 {student.club}</span>}
              {answers.iin && <span className="font-mono text-muted">· #{answers.iin}</span>}
              {saving && (
                <span className="text-muted italic animate-pulse">
                  {tx('Сақталуда...')}
                </span>
              )}
              {saved && (
                <span className="text-success font-semibold flex items-center gap-1">
                  ✓ {tx('Сақталды')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right buttons in header */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAccountModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-fg border border-line transition shadow-xs"
            title={tx('Аккаунт мәліметтерін өзгерту (ЖСН, құпия сөз, аты-жөні)')}
          >
            <Icon n="key" size={14} className="text-accent" />
            <span>{tx('Аккаунт')}</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAB 1: INFO (2-Column Property Grid matching screenshot)
          ==================================================================== */}
      {tab === 'info' && (
        <div className="grid gap-6">
          {/* ================================================================
              БӨЛІМ 1: ЖЕКЕ МӘЛІМЕТТЕР
              ================================================================ */}
          <div className="rounded-xl border border-line bg-surface p-4 lg:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
              <span className="text-base font-bold text-fg">👤 {tx('Жеке мәліметтер')}</span>
              <button
                type="button"
                onClick={() => setAccountModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-accent hover:bg-accent-soft transition"
              >
                <Icon n="key" size={13} />
                <span>{tx('Аккаунтты өңдеу')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Birthday */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Туған күні')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="calendar" size={16} className="text-muted" />
                  <input
                    type="date"
                    value={answers.birthday ?? ''}
                    onChange={(e) => {
                      setAnswers({ ...answers, birthday: e.target.value })
                      saveField('birthday', e.target.value)
                    }}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                  />
                </div>
              </div>

              {/* Birthplace */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Туған жері')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="pin" size={16} className="text-muted" />
                  <input
                    type="text"
                    value={answers.birthplace ?? ''}
                    onChange={(e) => setAnswers({ ...answers, birthplace: e.target.value })}
                    onBlur={(e) => saveField('birthplace', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Қостанай қ., Арқалық қ. ...')}
                  />
                </div>
              </div>

              {/* Nation */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Ұлты')}</label>
                <div className="relative">
                  <select
                    value={answers.nation ?? tx('қазақ')}
                    onChange={(e) => {
                      setAnswers({ ...answers, nation: e.target.value })
                      saveField('nation', e.target.value)
                    }}
                    className="w-full appearance-none rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 pr-8 min-h-12 text-sm font-medium border border-transparent focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none text-fg"
                  >
                    {NATIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Icon
                    n="chev"
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none rotate-90"
                  />
                </div>
              </div>

              {/* Ru */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Руы (Жеті атасы)')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.ru ?? ''}
                    onChange={(e) => setAnswers({ ...answers, ru: e.target.value })}
                    onBlur={(e) => saveField('ru', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Арғын, Қыпшақ, Найман...')}
                  />
                </div>
              </div>

              {/* Document N */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Құжат нөмірі')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="file" size={16} className="text-muted" />
                  <input
                    type="text"
                    value={answers.doc_number ?? ''}
                    onChange={(e) => setAnswers({ ...answers, doc_number: e.target.value })}
                    onBlur={(e) => saveField('doc_number', e.target.value)}
                    className="w-full bg-transparent text-sm font-mono focus:outline-none text-fg"
                    placeholder="N°3805794"
                  />
                </div>
              </div>

              {/* JSN */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('ЖСН')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">#</span>
                  <input
                    type="text"
                    maxLength={12}
                    value={answers.iin ?? ''}
                    onChange={(e) => setAnswers({ ...answers, iin: e.target.value })}
                    onBlur={(e) => saveField('iin', e.target.value)}
                    className="w-full bg-transparent text-sm font-mono focus:outline-none text-fg"
                    placeholder="140707504592"
                  />
                  <button
                    type="button"
                    onClick={() => setAccountModalOpen(true)}
                    className="shrink-0 p-1 text-muted hover:text-accent transition"
                    title={tx('Аккаунтты өңдеу')}
                  >
                    <Icon n="key" size={15} />
                  </button>
                </div>
              </div>

              {/* Address */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Мекенжайы')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="pin" size={16} className="text-muted" />
                  <input
                    type="text"
                    value={answers.address ?? ''}
                    onChange={(e) => setAnswers({ ...answers, address: e.target.value })}
                    onBlur={(e) => saveField('address', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Қала, көше, үй нөмірі')}
                  />
                </div>
              </div>

              {/* Student Phone */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Оқушының телефоны')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="phone" size={16} className="text-muted" />
                  <input
                    type="tel"
                    value={answers.phone ?? ''}
                    onChange={(e) => setAnswers({ ...answers, phone: e.target.value })}
                    onBlur={(e) => saveField('phone', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder="+7 700 000 0000"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================
              БӨЛІМ 2: ОТБАСЫ МӘЛІМЕТТЕРІ (ОРТАДА БӨЛІП ТҰРАТЫН ЕРЕКШЕ БЛОК)
              ================================================================ */}
          <div className="rounded-xl border border-line bg-surface-2/60 dark:bg-surface-2/30 p-4 lg:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-fg">👨‍👩‍👧‍👦 {tx('Отбасы мәліметтері')}</span>
                <span className="text-xs text-muted font-normal">
                  ({tx('Ата-анасының байланыс ақпараты мен жұмыс орны')})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Father Name */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Әкесінің аты-жөні')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.father_name ?? ''}
                    onChange={(e) => setAnswers({ ...answers, father_name: e.target.value })}
                    onBlur={(e) => saveField('father_name', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Әкесінің аты-жөні')}
                  />
                </div>
              </div>

              {/* Father Phone */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Әкесінің телефоны')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="phone" size={16} className="text-muted" />
                  <input
                    type="tel"
                    value={answers.father_phone ?? ''}
                    onChange={(e) => setAnswers({ ...answers, father_phone: e.target.value })}
                    onBlur={(e) => saveField('father_phone', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder="+7 700 000 0000"
                  />
                </div>
              </div>

              {/* Father Job */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Әкесінің жұмыс орны / қызметі')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.father_job ?? ''}
                    onChange={(e) => setAnswers({ ...answers, father_job: e.target.value })}
                    onBlur={(e) => saveField('father_job', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Мекеме, мамандығы, лауазымы')}
                  />
                </div>
              </div>

              {/* Mother Name */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Анасының аты-жөні')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.mother_name ?? ''}
                    onChange={(e) => setAnswers({ ...answers, mother_name: e.target.value })}
                    onBlur={(e) => saveField('mother_name', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Анасының аты-жөні')}
                  />
                </div>
              </div>

              {/* Mother Phone */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Анасының телефоны')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <Icon n="phone" size={16} className="text-muted" />
                  <input
                    type="tel"
                    value={answers.mother_phone ?? ''}
                    onChange={(e) => setAnswers({ ...answers, mother_phone: e.target.value })}
                    onBlur={(e) => saveField('mother_phone', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder="+7 700 000 0000"
                  />
                </div>
              </div>

              {/* Mother Job */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Анасының жұмыс орны / қызметі')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.mother_job ?? ''}
                    onChange={(e) => setAnswers({ ...answers, mother_job: e.target.value })}
                    onBlur={(e) => saveField('mother_job', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Мекеме, мамандығы, лауазымы')}
                  />
                </div>
              </div>

              {/* Family Notes / Children */}
              <div className="grid gap-1 md:col-span-2">
                <label className="text-xs font-semibold text-muted">{tx('Отбасы туралы қосымша мәлімет')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface dark:bg-surface-3 px-3.5 min-h-12 border border-line/50 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.family_notes ?? ''}
                    onChange={(e) => setAnswers({ ...answers, family_notes: e.target.value })}
                    onBlur={(e) => saveField('family_notes', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Отбасындағы бала саны (үлкені/ортаншысы/кенжесі), ерекше жағдайлар...')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================
              БӨЛІМ 3: ДЕНСАУЛЫҚ ЖӘНЕ МЕДИЦИНАЛЫҚ АҚПАРАТ
              ================================================================ */}
          <div className="rounded-xl border border-line bg-surface p-4 lg:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-fg">🩺 {tx('Денсаулық жағдайы')}</span>
                <span className="text-xs text-muted font-normal">
                  ({tx('Аллергиялар, фобиялар, созылмалы аурулар мен дәрігерлік есеп')})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Blood Type */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Қан тобы және резус-фактор')}</label>
                <div className="relative">
                  <select
                    value={answers.blood_type ?? 'Белгісіз'}
                    onChange={(e) => {
                      setAnswers({ ...answers, blood_type: e.target.value })
                      saveField('blood_type', e.target.value)
                    }}
                    className="w-full appearance-none rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 pr-8 min-h-12 text-sm font-medium border border-transparent focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none text-fg"
                  >
                    {BLOOD_TYPES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <Icon
                    n="chev"
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none rotate-90"
                  />
                </div>
              </div>

              {/* Allergies */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Аллергиясы')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.allergies ?? ''}
                    onChange={(e) => setAnswers({ ...answers, allergies: e.target.value })}
                    onBlur={(e) => saveField('allergies', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Тағам, дәрі-дәрмек, маусымдық поллиноз (немесе «Жоқ»)')}
                  />
                </div>
              </div>

              {/* Phobias */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Фобиясы мен қорқыныштары')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.phobias ?? ''}
                    onChange={(e) => setAnswers({ ...answers, phobias: e.target.value })}
                    onBlur={(e) => saveField('phobias', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Биіктік, қараңғылық, жабық кеңістік (немесе «Жоқ»)')}
                  />
                </div>
              </div>

              {/* Chronic Diseases */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Созылмалы аурулары')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.chronic_diseases ?? ''}
                    onChange={(e) => setAnswers({ ...answers, chronic_diseases: e.target.value })}
                    onBlur={(e) => saveField('chronic_diseases', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Созылмалы ауруы, диагнозы (немесе «Жоқ»)')}
                  />
                </div>
              </div>

              {/* Medical Dispensary */}
              <div className="grid gap-1 md:col-span-2">
                <label className="text-xs font-semibold text-muted">{tx('Диспансерлік есеп / Медициналық бақылау')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.medical_dispensary ?? ''}
                    onChange={(e) => setAnswers({ ...answers, medical_dispensary: e.target.value })}
                    onBlur={(e) => saveField('medical_dispensary', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Дәрігерлік есеп, арнайы топ, қадағалау (немесе «Жоқ»)')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================
              БӨЛІМ 4: ҚЫЗЫҒУШЫЛЫҚТАР МЕН ДАҒДЫЛАР
              ================================================================ */}
          <div className="rounded-xl border border-line bg-surface p-4 lg:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
              <span className="text-base font-bold text-fg">🎯 {tx('Қызығушылықтары мен қабілеттері')}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hobby */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Хобби')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.hobby ?? ''}
                    onChange={(e) => setAnswers({ ...answers, hobby: e.target.value })}
                    onBlur={(e) => saveField('hobby', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Робототехника, кітап, сурет...')}
                  />
                </div>
              </div>

              {/* Sport */}
              <div className="grid gap-1">
                <label className="text-xs font-semibold text-muted">{tx('Спорт')}</label>
                <div className="flex items-center gap-2 rounded-lg bg-surface-2 dark:bg-surface-3 px-3.5 min-h-12 border border-transparent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
                  <span className="text-xs font-mono font-bold text-muted select-none">T</span>
                  <input
                    type="text"
                    value={answers.sport ?? ''}
                    onChange={(e) => setAnswers({ ...answers, sport: e.target.value })}
                    onBlur={(e) => saveField('sport', e.target.value)}
                    className="w-full bg-transparent text-sm focus:outline-none text-fg"
                    placeholder={tx('Футбол, үстел теннисі, шахмат...')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Previews of Gallup & MBTI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-line">
            {/* Top 5 Gallup Card */}
            <div
              onClick={() => setGallupPicker('top')}
              className="p-3.5 rounded-lg bg-surface-2 hover:bg-surface-2/80 transition cursor-pointer flex flex-col justify-between gap-2 border border-transparent hover:border-line"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted tracking-wider">Top 5 Gallup</span>
                <span className="text-xs font-semibold text-accent hover:underline">{tx('Таңдау →')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-6">
                {!topGallupList.length ? (
                  <span className="text-xs text-muted">{tx('Таңдалмаған (толтыру →)')}</span>
                ) : (
                  topGallupList.slice(0, 5).map((t) => {
                    const found = findGallup(t)
                    const dom = found ? GALLUP_DOMAINS[found.domain] : GALLUP_DOMAINS.executing
                    return (
                      <span
                        key={t}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${dom.bg} ${dom.text} ${dom.border}`}
                      >
                        {t}
                      </span>
                    )
                  })
                )}
              </div>
            </div>

            {/* Low Gallup Card */}
            <div
              onClick={() => setGallupPicker('low')}
              className="p-3.5 rounded-lg bg-surface-2 hover:bg-surface-2/80 transition cursor-pointer flex flex-col justify-between gap-2 border border-transparent hover:border-line"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted tracking-wider">Low Gallup</span>
                <span className="text-xs font-semibold text-accent hover:underline">{tx('Таңдау →')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-6">
                {!lowGallupList.length ? (
                  <span className="text-xs text-muted">{tx('Белгіленбеген (толтыру →)')}</span>
                ) : (
                  lowGallupList.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-surface text-muted border border-line"
                    >
                      {t}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* MBTI Card */}
            <div
              onClick={() => onTabChange('tests')}
              className="p-3.5 rounded-lg bg-surface-2 hover:bg-surface-2/80 transition cursor-pointer flex flex-col justify-between gap-2 border border-transparent hover:border-line"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted tracking-wider">MBTI</span>
                <span className="text-xs font-semibold text-accent hover:underline">{tx('Толық көру →')}</span>
              </div>
              <div className="flex items-center gap-2 min-h-6">
                <span className="text-base font-extrabold text-accent tracking-wider">
                  {mbtiDisplayType}
                </span>
                {mbtiComputed && (
                  <span className="text-[11px] text-muted">
                    ({mbtiComputed.pct[0]}% E · {mbtiComputed.pct[1]}% S)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Personal reflections & detailed questionnaire questions */}
          <div className="rounded-xl border border-line bg-surface p-4 grid gap-3">
            <button
              type="button"
              onClick={() => setQuestionsOpen(!questionsOpen)}
              className="flex items-center justify-between w-full text-left font-semibold text-sm"
            >
              <span className="flex items-center gap-2">
                <Icon n="file" size={16} className="text-accent" />
                <span>{tx('Жеке сұрақтар мен рефлексия (Анкета)')}</span>
              </span>
              <Icon n="chev" size={16} className={`text-muted transition-transform ${questionsOpen ? 'rotate-90' : ''}`} />
            </button>

            {questionsOpen && (
              <div className="grid gap-3 pt-2">
                {FORM.map(([k, q, hint]) => (
                  <div key={k} className="grid gap-1 text-sm">
                    <label className="font-medium text-xs text-muted">{q}</label>
                    <textarea
                      value={answers[k] ?? ''}
                      onChange={(e) => setAnswers({ ...answers, [k]: e.target.value })}
                      onBlur={(e) => saveField(k, e.target.value)}
                      maxLength={800}
                      rows={2}
                      className={`${inputCls} py-2 h-auto text-sm`}
                      placeholder={hint || tx('Жауабын жазыңыз...')}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: PERSONALITIES TEST (MBTI, Gallup CliftonStrengths, Holland, MI)
          ==================================================================== */}
      {tab === 'tests' && (
        <div className="grid gap-5">
          {/* 1. MBTI Card */}
          <Card className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-base flex items-center gap-2">
                  <span>MBTI</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent font-bold tracking-wider">
                    {mbtiDisplayType}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {tx('Майерс-Бриггс тұлға типі және мінез-құлық индикаторы')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={answers.mbti ?? mbtiComputed?.type ?? ''}
                  onChange={(e) => saveField('mbti', e.target.value)}
                  className={`${inputCls} h-9 text-xs w-auto font-semibold`}
                >
                  <option value="">{tx('Таңдау...')}</option>
                  {MBTI_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {mbtiComputed && (
              <div className="grid gap-2 border-t border-line pt-3 text-xs">
                <div className="flex justify-between items-center text-muted">
                  <span>E ({mbtiComputed.pct[0]}%)</span>
                  <span>Extraversion — Introversion</span>
                  <span>I ({100 - mbtiComputed.pct[0]}%)</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex">
                  <div className="bg-accent" style={{ width: `${mbtiComputed.pct[0]}%` }} />
                  <div className="bg-sky-500 flex-1" />
                </div>

                <div className="flex justify-between items-center text-muted mt-1">
                  <span>S ({mbtiComputed.pct[1]}%)</span>
                  <span>Sensing — Intuition</span>
                  <span>N ({100 - mbtiComputed.pct[1]}%)</span>
                </div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden flex">
                  <div className="bg-amber-500" style={{ width: `${mbtiComputed.pct[1]}%` }} />
                  <div className="bg-emerald-500 flex-1" />
                </div>
              </div>
            )}
          </Card>

          {/* 2. Gallup CliftonStrengths Card */}
          <Card className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-base flex items-center gap-2">
                  <span>Gallup CliftonStrengths</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold">
                    34 Themes
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {tx('Оқушының туа біткен басым таланттары мен дамыту бағыттары')}
                </p>
              </div>
              <Button kind="secondary" onClick={() => setGallupPicker('top')}>
                <Icon n="plus" size={15} />
                {tx('Таңдау / Өзгерту')}
              </Button>
            </div>

            {/* Top 5 Gallup */}
            <div className="grid gap-2">
              <span className="text-xs font-bold uppercase text-muted tracking-wider">
                Top 5 Gallup ({tx('Мықты қасиеттері')})
              </span>
              {!topGallupList.length ? (
                <p className="text-sm text-muted bg-surface-2 p-3 rounded-lg">
                  {tx('Әлі таңдалмаған. «Таңдау / Өзгерту» батырмасы арқылы 34 қасиеттен 5 негізгісін белгілеңіз.')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {topGallupList.map((t) => {
                    const found = findGallup(t)
                    const dom = found ? GALLUP_DOMAINS[found.domain] : GALLUP_DOMAINS.executing
                    return (
                      <span
                        key={t}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${dom.bg} ${dom.text} ${dom.border}`}
                      >
                        <span className="font-bold">{t}</span>
                        {found && <span className="text-[11px] opacity-80">({found.nameKk})</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Low Gallup */}
            <div className="grid gap-2 border-t border-line pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-muted tracking-wider">
                  Low Gallup ({tx('Дамытуды қажет ететін тұстары')})
                </span>
                <button
                  type="button"
                  onClick={() => setGallupPicker('low')}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  {tx('Өзгерту →')}
                </button>
              </div>
              {!lowGallupList.length ? (
                <p className="text-sm text-muted bg-surface-2 p-3 rounded-lg">
                  {tx('Дамытуды қажет ететін қасиеттер белгіленбеген.')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {lowGallupList.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-2 text-muted border border-line"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* 3. Holland (RIASEC) Card */}
          {testHol && (
            <Card className="grid gap-2">
              <p className="font-bold text-base">{tx('Холланд кәсіби бағдар тесті (RIASEC)')}</p>
              {(() => {
                const h = hollandScore(testHol.answers)
                const ru = lang === 'ru'
                return (
                  <div className="text-sm">
                    <p className="text-accent font-extrabold text-lg tracking-wider mb-1">{h.code}</p>
                    <p className="text-muted">
                      {h.code
                        .split('')
                        .map((l) => RIASEC.find((x) => x[0] === l)?.[ru ? 2 : 1])
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                )
              })()}
            </Card>
          )}

          {/* 4. Multiple Intelligences Card */}
          {testMi && (
            <Card className="grid gap-2">
              <p className="font-bold text-base">{tx('Гарднер көптік интеллекті')}</p>
              <div className="grid gap-1.5 text-sm">
                {miScore(testMi.answers)
                  .map((v, k) => [k, v] as [number, number])
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([k, score]) => (
                    <div key={k} className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2 rounded-lg">
                      <span className="font-medium">{MI_KINDS[k][lang === 'ru' ? 1 : 0]}</span>
                      <span className="text-xs font-bold text-accent tabular-nums">{tx('{0} балл', score)}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 3: PLAN (Rich Roadmap: Goals, Habits, Tasks, Presets Bank)
          ==================================================================== */}
      {tab === 'plan' && (
        <div className="grid gap-4">
          <RoadmapSection
            studentId={student.id}
            roadmap={roadmap}
            onUpdate={setRoadmap}
            onOpenAdd={() => setAddPlan(true)}
          />
        </div>
      )}

      {/* ====================================================================
          TAB 4: MEETINGS (1-on-1 History & Actions)
          ==================================================================== */}
      {tab === 'meetings' && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-base">{tx('Жеке кездесулер журналы')}</p>
            <Button onClick={() => setAddMeeting(true)}>
              <Icon n="plus" size={16} />
              {tx('Кездесу белгілеу')}
            </Button>
          </div>

          {nextMeetings.map((m) => (
            <Card key={m.id} className="grid gap-2 border-accent/40">
              <div className="flex items-start gap-2">
                <span className="size-10 shrink-0 rounded-md bg-accent-soft text-accent grid place-items-center">
                  <Icon n="clock" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold break-words">{m.topic}</span>
                  <span className="block text-xs text-muted">
                    {at(m.starts_at)} · {m.visible ? tx('Оқушыға көрінеді') : tx('Тек ұстаздарға')}
                    {m.place ? ` · ${m.place}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={tx('Өшіру')}
                  onClick={() => removeMentorMeeting(m.id).then(data.reload, (e) => toast(errText(e)))}
                  className="size-9 grid place-items-center rounded-md text-muted hover:bg-surface-2"
                >
                  <Icon n="x" size={16} />
                </button>
              </div>
              <Button onClick={() => setFinishMeeting(m)}>
                <Icon n="check" size={18} />
                {tx('Қорытынды жазу')}
              </Button>
            </Card>
          ))}

          {!nextMeetings.length && !pastMeetings.length ? (
            <Empty
              icon="calendar"
              title={tx('Кездесу жоқ')}
              text={tx('Оқушымен жеке кездесу өткізу үшін «Кездесу белгілеу» батырмасын басыңыз.')}
            />
          ) : null}

          {pastMeetings.length > 0 && (
            <Card className="grid gap-2">
              <p className="text-xs text-muted font-semibold uppercase">
                {tx('Өткен кездесулер · {0}', pastMeetings.length)}
              </p>
              <div className="grid gap-2">
                {pastMeetings.map((m) => (
                  <details key={m.id} className="rounded-lg bg-surface-2 px-3 py-2.5">
                    <summary className="cursor-pointer text-sm font-semibold">
                      {m.topic} ·{' '}
                      <span className="text-muted font-normal">
                        {fmtDate(m.starts_at.slice(0, 10))} · {staffName(m.staff_id)}
                        {m.place ? ` · ${m.place}` : ''}
                      </span>
                    </summary>
                    {m.actions && <p className="mt-2 text-sm whitespace-pre-line">{m.actions}</p>}
                    {m.notes && (
                      <p className="mt-2 text-sm whitespace-pre-line text-muted">
                        <Icon n="lock" size={12} className="inline mr-1" />
                        {m.notes}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 5: RESOURCES (Study materials, Books, Council notes)
          ==================================================================== */}
      {tab === 'resources' && (
        <div className="grid gap-4">
          <StudentResourcesShelf
            studentId={student.id}
            studentName={student.full_name}
            classId={classId ?? student.class_id}
          />
          {d.notes.length > 0 && (
            <Card className="grid gap-2 border-t border-line pt-3">
              <p className="text-xs font-bold uppercase text-muted">{tx('Сынып кеңесінің жазбалары')}</p>
              {d.notes.map((n) => (
                <div key={n.id} className="p-3 rounded-lg bg-surface-2 text-sm">
                  <span className="text-xs text-muted block mb-1">
                    {staffName(n.author_id)} · {fmtDate(n.created_at.slice(0, 10))}
                  </span>
                  <p className="whitespace-pre-line">{n.body}</p>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Gallup Picker Modal */}
      {gallupPicker && (
        <GallupPickerSheet
          mode={gallupPicker}
          selectedTop={topGallupList}
          selectedLow={lowGallupList}
          onClose={() => setGallupPicker(null)}
          onSave={async (newTop, newLow) => {
            setGallupPicker(null)
            await saveMultipleFields({
              top_gallup: newTop.join(', '),
              low_gallup: newLow.join(', '),
            })
          }}
        />
      )}

      {/* 1-on-1 Roadmap Builder Sheet */}
      {addPlan && (
        <RoadmapBuilderSheet
          student={{ id: student.id, class_id: classId ?? student.class_id ?? '', full_name: student.full_name }}
          currentRoadmap={roadmap}
          meetings={d.meetings}
          onClose={() => setAddPlan(false)}
          onDone={(newR) => {
            setRoadmap(newR)
            setAddPlan(false)
            data.reload()
          }}
        />
      )}

      {/* Schedule 1-on-1 Meeting Sheet */}
      {addMeeting && (
        <PlanSheet
          student={{ id: student.id, class_id: classId ?? student.class_id ?? '' }}
          onClose={() => setAddMeeting(false)}
          onDone={() => {
            setAddMeeting(false)
            data.reload()
          }}
        />
      )}

      {/* Finish Meeting Sheet */}
      {finishMeeting && (
        <FinishSheet
          m={finishMeeting}
          onClose={() => setFinishMeeting(null)}
          onDone={() => {
            setFinishMeeting(null)
            data.reload()
          }}
        />
      )}

      {/* Account Edit Sheet */}
      {accountModalOpen && (
        <AccountEditSheet
          onClose={() => setAccountModalOpen(false)}
          student={{
            id: student.id,
            full_name: currentFullName,
            latin_name: currentLatinName,
          }}
          currentIin={answers.iin}
          onSaved={(res) => {
            if (res.iin) {
              setAnswers((prev) => ({ ...prev, iin: res.iin! }))
            }
            data.reload()
          }}
        />
      )}
    </div>
  )
}

/* ==========================================================================
   Аккаунт мәліметтерін өзгерту (ЖСН, құпия сөз, аты, латынша аты)
   ========================================================================== */

function AccountEditSheet({
  onClose,
  student,
  currentIin,
  onSaved,
}: {
  onClose: () => void
  student: { id: string; full_name: string; latin_name?: string | null }
  currentIin?: string
  onSaved: (res: { full_name?: string; latin_name?: string | null; iin?: string }) => void
}) {
  const [fullName, setFullName] = useState(student.full_name)
  const [latinName, setLatinName] = useState(student.latin_name ?? '')
  const [iin, setIin] = useState(currentIin ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTranslit = () => {
    if (fullName) {
      setLatinName(toLatin(fullName))
    }
  }

  const handleGeneratePassword = () => {
    const p = makeEasyPassword()
    setPassword(p)
    setShowPassword(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const fn = fullName.trim()
    if (fn.length < 2) {
      setError(tx('Аты-жөнін толық жазыңыз'))
      return
    }
    const cleanIin = iin.trim()
    if (cleanIin && !/^\d{12}$/.test(cleanIin)) {
      setError(tx('ЖСН 12 саннан тұруы керек'))
      return
    }
    const cleanPass = password.trim()
    if (cleanPass && cleanPass.length < 6) {
      setError(tx('Құпия сөз кемінде 6 таңбадан тұруы керек'))
      return
    }

    setSaving(true)
    try {
      await updateStudentAccount({
        student_id: student.id,
        full_name: fn,
        latin_name: latinName.trim() || null,
        iin: cleanIin || undefined,
        password: cleanPass || undefined,
      })
      toast(tx('Аккаунт мәліметтері сәтті сақталды'))
      onSaved({
        full_name: fn,
        latin_name: latinName.trim() || null,
        iin: cleanIin || undefined,
      })
      onClose()
    } catch (err) {
      setError(errText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose} title={tx('Аккаунт мәліметтерін өзгерту')}>
      <form onSubmit={handleSave} className="grid gap-4 p-4">
        {error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
            {error}
          </div>
        )}

        {/* Full Name in Cyrillic */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-muted">
            {tx('Аты-жөні (ресми/кириллше)')} <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
            placeholder={tx('Амангелді Санжар')}
            required
          />
        </div>

        {/* Latin Name */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted">
              {tx('Латын түріндегі аты-жөні')}
            </label>
            <button
              type="button"
              onClick={handleTranslit}
              className="text-xs text-accent hover:underline font-semibold"
            >
              ⚡ {tx('Авто-транслитерация')}
            </button>
          </div>
          <input
            type="text"
            value={latinName}
            onChange={(e) => setLatinName(e.target.value)}
            className={inputCls}
            placeholder="Amangeldi Sanzhar"
          />
          <span className="text-[11px] text-muted">
            {tx('Олимпиадалар, сертификаттар мен халықаралық емтихандар үшін')}
          </span>
        </div>

        {/* IIN */}
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-muted">
            {tx('ЖСН (жүйеге кіру логині)')}
          </label>
          <input
            type="text"
            maxLength={12}
            value={iin}
            onChange={(e) => setIin(e.target.value.replace(/\D/g, ''))}
            className={`${inputCls} font-mono`}
            placeholder="110412501234"
          />
          <span className="text-[11px] text-muted font-mono">
            {tx('12 сан. Пошта: {0}@users.lyceum-life.app', iin || '123456789012')}
          </span>
        </div>

        {/* Password */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted">
              {tx('Жаңа құпия сөз')}
            </label>
            <button
              type="button"
              onClick={handleGeneratePassword}
              className="text-xs text-accent hover:underline font-semibold"
            >
              🎲 {tx('Оңай сөз құру')}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} pr-16`}
              placeholder={tx('Өзгертпеу үшін бос қалдырыңыз')}
            />
            {password && (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-fg font-medium"
              >
                {showPassword ? tx('Жасыру') : tx('Көрсету')}
              </button>
            )}
          </div>
          <span className="text-[11px] text-muted">
            {tx('Кемінде 6 таңба. Өзгертпей қалдыру үшін бос жіберіңіз.')}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 justify-end border-t border-line mt-2">
          <Button kind="secondary" type="button" onClick={onClose} disabled={saving}>
            {tx('Бас тарту')}
          </Button>
          <Button kind="primary" type="submit" loading={saving}>
            {tx('Сақтау')}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/* ==========================================================================
   Оқушының Кітап Сөресі (3 баған: Оқығым келеді, Оқып жатыр, Аяқтады)
   ========================================================================== */

const coverTint = (t: string) => `hsl(${[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 45% 42%)`

function BookCover({ title, cover, className = '' }: { title: string; cover?: string | null; className?: string }) {
  return cover ? (
    <img src={photoUrl(cover)} alt="" className={`aspect-[2/3] rounded-md object-cover ${className}`} loading="lazy" />
  ) : (
    <span
      aria-hidden
      className={`aspect-[2/3] rounded-md grid place-items-center text-white/90 font-bold ${className}`}
      style={{ background: coverTint(title) }}
    >
      {title.trim()[0]?.toUpperCase() ?? '📖'}
    </span>
  )
}

function StudentResourcesShelf({
  studentId,
  studentName,
  classId,
}: {
  studentId: string
  studentName: string
  classId?: string
}) {
  const { me } = useMe()
  const isStaff = me.role !== 'student'
  const isOwn = me.id === studentId
  const canEdit = isStaff || isOwn

  const data = useLoad(async () => {
    if (!classId) return null
    return listClassResources(classId)
  }, [classId])

  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [ratingBook, setRatingBook] = useState<{ book: Media; currentRating: number | null; currentReview: string } | null>(null)
  const [pickSearch, setPickSearch] = useState('')

  const books = (data.data?.media ?? []).filter((m) => m.kind === 'book' && m.approved)
  const planned = books.filter((m) => m.progress.some((p) => p.user_id === studentId && p.state === 'planned'))
  const doing = books.filter((m) => m.progress.some((p) => p.user_id === studentId && p.state === 'doing'))
  const done = books.filter((m) => m.progress.some((p) => p.user_id === studentId && p.state === 'done'))
  const unselected = books.filter((m) => !m.progress.some((p) => p.user_id === studentId))

  const setProgress = async (mediaId: string, state: MediaProgressState | null, review?: string | null) => {
    try {
      await setMediaProgress(mediaId, state, review, studentId)
      toast(state === 'doing' ? tx('«Оқып жатқан» кітаптарға қосылды') : state === 'done' ? tx('Кітап аяқталды деп белгіленді') : state === 'planned' ? tx('«Оқығым келетін» кітаптарға қосылды') : tx('Өшірілді'))
      data.reload()
    } catch (e) {
      toast(errText(e))
    }
  }

  const handleRate = async (mediaId: string, rating: number | null, review: string) => {
    try {
      await rateMedia(mediaId, 'done', { rating }, studentId)
      await setMediaProgress(mediaId, 'done', review || null, studentId)
      toast(tx('Баға мен пікір сақталды'))
      setRatingBook(null)
      data.reload()
    } catch (e) {
      toast(errText(e))
    }
  }

  const filteredUnselected = unselected.filter((m) => {
    const q = pickSearch.trim().toLowerCase()
    if (!q) return true
    return m.title.toLowerCase().includes(q) || (m.author ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="grid gap-4">
      {/* Shelf Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-bold text-base flex items-center gap-2">
            <span>📚</span>
            <span>{tx('Оқушының кітап сөресі')}</span>
          </h3>
          <p className="text-xs text-muted">
            {tx('«{0}» оқушысының оқу барысы мен сөресі', studentName)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Button kind="secondary" onClick={() => setPicking(true)}>
                <Icon n="plus" size={16} />
                <span>{tx('Сыныптан таңдау')}</span>
              </Button>
              <Button kind="secondary" onClick={() => setAdding(true)}>
                <Icon n="plus" size={16} />
                <span>{tx('Жаңа кітап')}</span>
              </Button>
            </>
          )}
          {classId && (
            <button
              type="button"
              onClick={() => go(`/resources/${classId}`)}
              className="text-xs text-accent hover:underline flex items-center gap-1 font-medium py-1 px-2"
            >
              <span>{tx('Сынып қорына өту')}</span>
              <Icon n="chev" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-surface-2 p-2.5 text-center border-l-4 border-amber-500">
          <span className="block text-xs text-muted mb-0.5">📖 {tx('Оқығым келеді')}</span>
          <span className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {planned.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center border-l-4 border-accent">
          <span className="block text-xs text-muted mb-0.5">⏳ {tx('Оқып жатыр')}</span>
          <span className="text-lg font-bold tabular-nums text-accent">
            {doing.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center border-l-4 border-success">
          <span className="block text-xs text-muted mb-0.5">✅ {tx('Аяқтады')}</span>
          <span className="text-lg font-bold tabular-nums text-success">
            {done.length}
          </span>
        </div>
      </div>

      {/* 3 Columns Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {/* Column 1: Оқығым келетін кітаптар */}
        <div className="rounded-xl border border-line bg-surface p-3 grid gap-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-line">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📖</span>
              <span>{tx('Оқығым келеді')}</span>
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {planned.length}
            </span>
          </div>

          {!planned.length ? (
            <div className="py-6 text-center text-xs text-muted grid gap-2">
              <p>{tx('Әзірге таңдалған кітап жоқ')}</p>
              {canEdit && (
                <div>
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="text-accent text-xs font-semibold hover:underline"
                  >
                    {tx('+ Кітап таңдау')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {planned.map((b) => (
                <div key={b.id} className="p-2.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 transition grid gap-2 text-xs">
                  <div className="flex gap-2.5 items-start">
                    <BookCover title={b.title} cover={b.cover} className="w-12 shrink-0 shadow-xs" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight break-words text-fg line-clamp-2">{b.title}</p>
                      {b.author && <p className="text-muted mt-0.5 truncate">{b.author}</p>}
                      {b.genre && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-surface font-medium text-muted">
                          {b.genre}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-line/50">
                      <button
                        type="button"
                        onClick={() => setProgress(b.id, 'doing')}
                        className="flex-1 py-1 px-2 rounded-md bg-accent text-on-accent font-semibold text-[11px] text-center transition hover:opacity-90 flex items-center justify-center gap-1"
                      >
                        <Icon n="clock" size={12} />
                        <span>{tx('Оқуды бастау')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProgress(b.id, null)}
                        className="size-6 grid place-items-center rounded text-muted hover:text-danger hover:bg-surface transition"
                        title={tx('Тізімнен шығару')}
                      >
                        <Icon n="x" size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Оқып жатқан кітаптар */}
        <div className="rounded-xl border border-line bg-surface p-3 grid gap-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-line">
            <span className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
              <span>⏳</span>
              <span>{tx('Оқып жатыр')}</span>
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-accent">
              {doing.length}
            </span>
          </div>

          {!doing.length ? (
            <div className="py-6 text-center text-xs text-muted grid gap-2">
              <p>{tx('Қазір оқып жатқан кітап жоқ')}</p>
              {canEdit && (
                <div>
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="text-accent text-xs font-semibold hover:underline"
                  >
                    {tx('+ Кітап бастау')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              {doing.map((b) => (
                <div key={b.id} className="p-2.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 transition grid gap-2 text-xs">
                  <div className="flex gap-2.5 items-start">
                    <BookCover title={b.title} cover={b.cover} className="w-12 shrink-0 shadow-xs" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight break-words text-fg line-clamp-2">{b.title}</p>
                      {b.author && <p className="text-muted mt-0.5 truncate">{b.author}</p>}
                      <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-accent font-semibold">
                        <Icon n="flame" size={12} />
                        <span>{tx('Оқылып жатыр')}</span>
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-line/50">
                      <button
                        type="button"
                        onClick={() => {
                          const p = b.progress.find((x) => x.user_id === studentId)
                          setRatingBook({ book: b, currentRating: p?.rating ?? 5, currentReview: p?.review ?? '' })
                        }}
                        className="flex-1 py-1 px-2 rounded-md bg-success text-white font-semibold text-[11px] text-center transition hover:opacity-90 flex items-center justify-center gap-1"
                      >
                        <Icon n="check" size={12} />
                        <span>{tx('Аяқтадым')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setProgress(b.id, 'planned')}
                        className="py-1 px-2 rounded-md text-muted hover:text-fg hover:bg-surface text-[11px] transition"
                        title={tx('«Оқығым келеді» күйіне қайтару')}
                      >
                        {tx('Кейінге')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 3: Аяқтаған кітаптар */}
        <div className="rounded-xl border border-line bg-surface p-3 grid gap-2.5">
          <div className="flex items-center justify-between pb-1 border-b border-line">
            <span className="text-xs font-bold text-success uppercase tracking-wider flex items-center gap-1.5">
              <span>✅</span>
              <span>{tx('Аяқтады')}</span>
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success">
              {done.length}
            </span>
          </div>

          {!done.length ? (
            <div className="py-6 text-center text-xs text-muted">
              {tx('Әлі аяқталған кітап жоқ')}
            </div>
          ) : (
            <div className="grid gap-2">
              {done.map((b) => {
                const prog = b.progress.find((p) => p.user_id === studentId)
                return (
                  <div key={b.id} className="p-2.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 transition grid gap-2 text-xs">
                    <div className="flex gap-2.5 items-start">
                      <BookCover title={b.title} cover={b.cover} className="w-12 shrink-0 shadow-xs" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight break-words text-fg line-clamp-2">{b.title}</p>
                        {b.author && <p className="text-muted mt-0.5 truncate">{b.author}</p>}
                        {prog?.rating && (
                          <div className="flex items-center gap-1 mt-1 text-amber-500 font-bold text-xs">
                            <span>{'★'.repeat(prog.rating)}</span>
                            <span className="text-muted text-[10px]">({prog.rating}/5)</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {prog?.review && (
                      <p className="text-[11px] text-muted italic bg-surface p-2 rounded border border-line/50">
                        «{prog.review}»
                      </p>
                    )}
                    {canEdit && (
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-line/50">
                        <button
                          type="button"
                          onClick={() => setRatingBook({ book: b, currentRating: prog?.rating ?? 5, currentReview: prog?.review ?? '' })}
                          className="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1"
                        >
                          <Icon n="pencil" size={11} />
                          <span>{tx('Баға / пікір өңдеу')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProgress(b.id, 'doing')}
                          className="text-[11px] text-muted hover:text-fg"
                          title={tx('«Оқып жатыр» күйіне қайтару')}
                        >
                          {tx('Қайта оқу')}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sheet 1: Pick from class library */}
      {picking && (
        <Sheet title={tx('Сынып кітапханасынан таңдау')} onClose={() => setPicking(false)}>
          <div className="grid gap-3">
            <div className="relative">
              <Icon n="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={pickSearch}
                onChange={(e) => setPickSearch(e.target.value)}
                placeholder={tx('Кітап не автор іздеу...')}
                className={`${inputCls} pl-9 h-10 text-sm`}
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto grid gap-2 pr-1">
              {!filteredUnselected.length ? (
                <div className="py-8 text-center text-xs text-muted grid gap-2">
                  <p>{tx('Қолжетімді кітаптар табылмады')}</p>
                  <div>
                    <Button kind="secondary" onClick={() => { setPicking(false); setAdding(true) }}>
                      <Icon n="plus" size={16} />
                      <span>{tx('Жаңа кітап қосу')}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                filteredUnselected.map((b) => (
                  <div key={b.id} className="p-3 rounded-lg border border-line bg-surface-2 flex items-center justify-between gap-3">
                    <div className="flex gap-2.5 items-center min-w-0">
                      <BookCover title={b.title} cover={b.cover} className="w-10 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{b.title}</p>
                        <p className="text-xs text-muted truncate">{b.author ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        kind="secondary"
                        onClick={async () => {
                          await setProgress(b.id, 'planned')
                          setPicking(false)
                        }}
                      >
                        {tx('Оқығым келеді')}
                      </Button>
                      <Button
                        onClick={async () => {
                          await setProgress(b.id, 'doing')
                          setPicking(false)
                        }}
                      >
                        {tx('Оқуды бастау')}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Sheet>
      )}

      {/* Sheet 2: Add brand new book */}
      {adding && classId && (
        <AddBookSheet
          classId={classId}
          studentId={studentId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            data.reload()
          }}
        />
      )}

      {/* Sheet 3: Rate and Review book */}
      {ratingBook && (
        <RateBookSheet
          book={ratingBook.book}
          initialRating={ratingBook.currentRating}
          initialReview={ratingBook.currentReview}
          onClose={() => setRatingBook(null)}
          onSave={(stars, rev) => handleRate(ratingBook.book.id, stars, rev)}
        />
      )}
    </div>
  )
}

function AddBookSheet({
  classId,
  studentId,
  onClose,
  onDone,
}: {
  classId: string
  studentId: string
  onClose: () => void
  onDone: () => void
}) {
  const { me } = useMe()
  const isStaff = me.role !== 'student'
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [genre, setGenre] = useState('novel')
  const [note, setNote] = useState('')
  const [targetState, setTargetState] = useState<MediaProgressState>('planned')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSave = async () => {
    if (title.trim().length < 2) {
      toast(tx('Кітап атауын енгізіңіз'))
      return
    }
    setBusy(true)
    try {
      const cover = file ? await uploadPhoto(me.id, file) : null
      const created = await addMedia({
        class_id: classId,
        kind: 'book',
        title: title.trim(),
        author: author.trim() || null,
        note: note.trim() || null,
        genre: genre || null,
        format: 'book',
        seasons: null,
        cover,
        approved: isStaff,
        proposed_by: me.id,
      })
      if (created?.id) {
        await setMediaProgress(created.id, targetState, undefined, studentId)
      }
      toast(tx('Кітап сәтті қосылды'))
      onDone()
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={tx('Жаңа кітап қосу')} onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid grid-cols-[5.5rem_1fr] gap-3">
          <label className="aspect-[2/3] rounded-md border-2 border-dashed border-line grid place-items-center text-center text-xs text-muted cursor-pointer overflow-hidden">
            {file ? <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" /> : <span className="grid justify-items-center gap-1 p-1"><Icon n="plus" size={16} />{tx('Мұқаба')}</span>}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid gap-2 content-start">
            <Field label={tx('Кітап атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputCls}
                  placeholder={tx('Мысалы: Абай жолы')}
                />
              )}
            </Field>
            <Field label={tx('Авторы')}>
              {(id) => (
                <input
                  id={id}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className={inputCls}
                  placeholder={tx('Мысалы: Мұхтар Әуезов')}
                />
              )}
            </Field>
          </div>
        </div>
        <Field label={tx('Жанры')}>
          {(id) => (
            <select
              id={id}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className={inputCls}
            >
              <option value="novel">{tx('Көркем әдебиет')}</option>
              <option value="science">{tx('Ғылыми-танымдық')}</option>
              <option value="history">{tx('Тарих')}</option>
              <option value="self">{tx('Өзін-өзі дамыту')}</option>
              <option value="fantasy">{tx('Фантастика')}</option>
              <option value="adventure">{tx('Шытырман')}</option>
              <option value="bio">{tx('Өмірбаян')}</option>
              <option value="poetry">{tx('Поэзия')}</option>
            </select>
          )}
        </Field>
        <Field label={tx('Оқу күйі')}>
          {(id) => (
            <select
              id={id}
              value={targetState}
              onChange={(e) => setTargetState(e.target.value as MediaProgressState)}
              className={inputCls}
            >
              <option value="planned">📖 {tx('Оқығым келеді')}</option>
              <option value="doing">⏳ {tx('Оқып жатырмын')}</option>
              <option value="done">✅ {tx('Аяқтадым')}</option>
            </select>
          )}
        </Field>
        <Field label={tx('Ескертпе (не үшін таңдалды)')}>
          {(id) => (
            <input
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              placeholder={tx('Мысалы: Мектеп бағдарламасы бойынша')}
            />
          )}
        </Field>
        <div className="flex gap-2 pt-2">
          <Button block onClick={handleSave} loading={busy}>
            {tx('Қосу')}
          </Button>
          <Button block kind="secondary" onClick={onClose}>
            {tx('Бас тарту')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function RateBookSheet({
  book,
  initialRating,
  initialReview,
  onClose,
  onSave,
}: {
  book: Media
  initialRating: number | null
  initialReview: string
  onClose: () => void
  onSave: (rating: number | null, review: string) => void
}) {
  const [rating, setRating] = useState<number | null>(initialRating ?? 5)
  const [review, setReview] = useState(initialReview)

  return (
    <Sheet title={tx('Кітапты бағалау')} onClose={onClose}>
      <div className="grid gap-4">
        <div>
          <p className="font-bold text-base">{book.title}</p>
          {book.author && <p className="text-xs text-muted">{book.author}</p>}
        </div>

        <Field label={tx('Бағаңыз (1-5 жұлдыз)')}>
          {() => (
            <div className="flex items-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="text-2xl transition hover:scale-125 focus:outline-none"
                  aria-label={tx('{0} жұлдыз', star)}
                >
                  <span className={(rating ?? 0) >= star ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'}>
                    ★
                  </span>
                </button>
              ))}
              <span className="text-sm font-bold ml-2 tabular-nums">{rating ?? 0} / 5</span>
            </div>
          )}
        </Field>

        <Field label={tx('Пікір / Қысқаша әсер')}>
          {(id) => (
            <textarea
              id={id}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder={tx('Кітаптан не түйдіңіз? Ұнаған тұстары...')}
            />
          )}
        </Field>

        <div className="flex gap-2 pt-2">
          <Button block onClick={() => onSave(rating, review.trim())}>
            {tx('Сақтау')}
          </Button>
          <Button block kind="secondary" onClick={onClose}>
            {tx('Бас тарту')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ==========================================================================
   Оқушының өзі үшін: Менің анкетам мен даму жоспарым
   ========================================================================== */

function StudentOwnDossier() {
  const { me } = useMe()
  const [tab, setTab] = useState<DossierTab>('info')
  return (
    <div className="grid gap-3 pb-6 w-full">
      <PageHead title={tx('Менің анкетам')} back />
      <div className="bg-surface rounded-xl shadow-card border border-[var(--card-line,transparent)] p-4 lg:p-6">
        <StudentDossierView
          student={{ id: me.id, full_name: me.full_name, photo: me.photo, class_id: me.class?.id }}
          classId={me.class?.id}
          classNameStr={me.class?.name}
          tab={tab}
          onTabChange={setTab}
        />
      </div>
    </div>
  )
}

/* ==========================================================================
   Gallup CliftonStrengths Picker Sheet (34 Themes Selector)
   ========================================================================== */

function GallupPickerSheet({
  mode,
  selectedTop,
  selectedLow,
  onClose,
  onSave,
}: {
  mode: 'top' | 'low'
  selectedTop: string[]
  selectedLow: string[]
  onClose: () => void
  onSave: (top: string[], low: string[]) => void
}) {
  const [top, setTop] = useState<string[]>(selectedTop)
  const [low, setLow] = useState<string[]>(selectedLow)
  const [activeMode, setActiveMode] = useState<'top' | 'low'>(mode)
  const [query, setQuery] = useState('')

  const toggleTheme = (name: string) => {
    if (activeMode === 'top') {
      if (top.includes(name)) {
        setTop(top.filter((x) => x !== name))
      } else {
        if (top.length >= 5) {
          toast(tx('Ең көп дегенде 5 мықты қасиет таңдалады'))
          return
        }
        setTop([...top, name])
      }
    } else {
      if (low.includes(name)) {
        setLow(low.filter((x) => x !== name))
      } else {
        setLow([...low, name])
      }
    }
  }

  const filteredThemes = GALLUP_THEMES.filter((t) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      t.nameEn.toLowerCase().includes(q) ||
      t.nameKk.toLowerCase().includes(q) ||
      t.nameRu.toLowerCase().includes(q)
    )
  })

  return (
    <Sheet
      title={tx('Gallup CliftonStrengths')}
      onClose={onClose}
    >
      <div className="grid gap-4">
        {/* Switcher: Top 5 vs Low */}
        <div className="flex rounded-lg bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setActiveMode('top')}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${
              activeMode === 'top' ? 'bg-surface text-fg shadow-xs' : 'text-muted'
            }`}
          >
            Top 5 ({top.length}/5)
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('low')}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${
              activeMode === 'low' ? 'bg-surface text-fg shadow-xs' : 'text-muted'
            }`}
          >
            Low Gallup ({low.length})
          </button>
        </div>

        {/* Selected chips bar */}
        <div className="flex flex-wrap gap-1.5 min-h-8">
          {(activeMode === 'top' ? top : low).map((name) => {
            const found = findGallup(name)
            const dom = found ? GALLUP_DOMAINS[found.domain] : GALLUP_DOMAINS.executing
            return (
              <span
                key={name}
                onClick={() => toggleTheme(name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer border ${dom.bg} ${dom.text} ${dom.border}`}
              >
                <span>{name}</span>
                <span className="opacity-70">✕</span>
              </span>
            )
          })}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Icon n="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx('Қасиет атауын іздеу (EN / KK / RU)...')}
            className={`${inputCls} pl-9 h-10 text-sm`}
          />
        </div>

        {/* Themes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
          {filteredThemes.map((t) => {
            const isSelected = activeMode === 'top' ? top.includes(t.nameEn) : low.includes(t.nameEn)
            const dom = GALLUP_DOMAINS[t.domain]

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleTheme(t.nameEn)}
                className={`text-left p-2.5 rounded-lg border transition flex flex-col justify-between ${
                  isSelected
                    ? `${dom.bg} ${dom.text} ${dom.border} shadow-xs ring-1 ring-current`
                    : 'bg-surface border-line hover:bg-surface-2 text-fg'
                }`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span className="font-bold text-sm">{t.nameEn}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${dom.bg} ${dom.text}`}>
                    {dom.label.split(' ')[0]}
                  </span>
                </div>
                <div className="text-xs text-muted mt-1">{t.nameKk}</div>
                <div className="text-[11px] text-muted opacity-80 mt-1 line-clamp-2">{t.descKk}</div>
              </button>
            )
          })}
        </div>

        {/* Action Button */}
        <Button onClick={() => onSave(top, low)}>{tx('Дайын')}</Button>
      </div>
    </Sheet>
  )
}


/* ==========================================================================
   Күрделендірілген Даму Жоспары бөлімі (RoadmapSection)
   ========================================================================== */

export function RoadmapSection({
  studentId,
  roadmap,
  onUpdate,
  onOpenAdd,
}: {
  studentId: string
  roadmap: StudentRoadmap
  onUpdate: (r: StudentRoadmap) => void
  onOpenAdd?: () => void
}) {
  const [tab, setTab] = useState<'all' | 'goals' | 'habits' | 'tasks'>('all')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [newStepInputs, setNewStepInputs] = useState<Record<string, string>>({})
  const [editingGoal, setEditingGoal] = useState<RoadmapGoal | null>(null)
  const [editingHabit, setEditingHabit] = useState<RoadmapHabit | null>(null)
  const [editingTask, setEditingTask] = useState<RoadmapTask | null>(null)
  const t = today()

  const goals = roadmap.goals ?? []
  const habits = roadmap.habits ?? []
  const tasks = roadmap.tasks ?? []

  const update = (fn: (prev: StudentRoadmap) => StudentRoadmap) => {
    const next = fn({
      goals: [...goals],
      habits: [...habits],
      tasks: [...tasks],
    })
    onUpdate(next)
    saveStudentRoadmap(studentId, next).catch((e) => toast(errText(e)))
  }

  const toggleGoal = (id: string) => {
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
    }))
  }

  const toggleStep = (goalId: string, stepId: string) => {
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => {
        if (g.id !== goalId) return g
        const nextSteps = g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))
        const allDone = nextSteps.length > 0 && nextSteps.every((s) => s.done)
        return { ...g, steps: nextSteps, done: allDone ? true : g.done }
      }),
    }))
  }

  const addStep = (goalId: string) => {
    const text = (newStepInputs[goalId] ?? '').trim()
    if (text.length < 2) return
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) =>
        g.id === goalId
          ? { ...g, steps: [...g.steps, { id: 's_' + Date.now(), title: text, done: false }] }
          : g
      ),
    }))
    setNewStepInputs({ ...newStepInputs, [goalId]: '' })
  }

  const removeGoal = (id: string, title: string) => {
    if (!confirm(tx('«{0}» мақсатын өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
    }))
  }

  const toggleHabitDate = (id: string, d: string) => {
    update((prev) => ({
      ...prev,
      habits: prev.habits.map((h) => {
        if (h.id !== id) return h
        const checks = new Set(h.checks ?? [])
        const wasDone = checks.has(d)
        if (wasDone) checks.delete(d)
        else checks.add(d)
        if (!wasDone && d === t) {
          const nextStreak = streak(checks, t)
          toast(`🔥 ${tx('Тамаша! Стрик: {0} күн!', nextStreak)}`)
        }
        return { ...h, checks: Array.from(checks) }
      }),
    }))
  }

  const removeHabit = (id: string, title: string) => {
    if (!confirm(tx('«{0}» әдетін өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
    }))
  }

  const toggleTask = (id: string) => {
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.map((tk) => (tk.id === id ? { ...tk, done: !tk.done } : tk)),
    }))
  }

  const removeTask = (id: string, title: string) => {
    if (!confirm(tx('«{0}» тапсырмасын өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((tk) => tk.id !== id),
    }))
  }

  const filterCat = (itemCat: string) => catFilter === 'all' || itemCat === catFilter

  const filteredGoals = goals.filter((g) => filterCat(g.category))
  const filteredHabits = habits.filter((h) => filterCat(h.category))
  const filteredTasks = tasks.filter((tk) => filterCat(tk.category))

  const totalVisible =
    (tab === 'all' || tab === 'goals' ? filteredGoals.length : 0) +
    (tab === 'all' || tab === 'habits' ? filteredHabits.length : 0) +
    (tab === 'all' || tab === 'tasks' ? filteredTasks.length : 0)

  // Last 7 days for habit tracker
  const last7Days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))

  return (
    <Card className="grid gap-3 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-base flex items-center gap-2">
            <span className="size-2 rounded-full bg-accent" aria-hidden />
            {tx('Жеке даму жоспары')}
          </h2>
          <p className="text-xs text-muted">
            {tx('Мақсаттар, күнделікті әдеттер және нақты тапсырмалар')}
          </p>
        </div>
        {onOpenAdd && (
          <Button kind="secondary" onClick={onOpenAdd}>
            <Icon n="plus" size={16} />
            {tx('Жоспар құру')}
          </Button>
        )}
      </div>

      {/* KPI көрсеткіштері */}
      <div className="grid grid-cols-3 gap-2 py-1">
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Мақсаттар')}</span>
          <span className="text-lg font-bold tabular-nums text-accent">
            {goals.filter((g) => g.done).length} / {goals.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Әдеттер')}</span>
          <span className="text-lg font-bold tabular-nums text-success">
            {habits.filter((h) => (h.checks ?? []).includes(t)).length} / {habits.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Тапсырмалар')}</span>
          <span className="text-lg font-bold tabular-nums text-purple-600 dark:text-purple-400">
            {tasks.filter((tk) => !tk.done).length} {tx('ашық')}
          </span>
        </div>
      </div>

      {/* Түрлері бойынша сүзгі */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'all' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          {tx('Барлығы ({0})', goals.length + habits.length + tasks.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('goals')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'goals' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          🎯 {tx('Мақсаттар ({0})', goals.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('habits')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'habits' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          🔄 {tx('Әдеттер ({0})', habits.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('tasks')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'tasks' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          ✅ {tx('Тапсырмалар ({0})', tasks.length)}
        </button>
      </div>

      {/* Санаттар чиптері */}
      <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setCatFilter('all')}
          className={`px-2.5 py-1 rounded-md transition ${catFilter === 'all' ? 'bg-accent/20 text-accent font-semibold' : 'text-muted hover:bg-surface-2'}`}
        >
          {tx('Барлық санат')}
        </button>
        {PLAN_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatFilter(c.id)}
            className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${catFilter === c.id ? `${c.bg} ${c.color} font-semibold` : 'text-muted hover:bg-surface-2'}`}
          >
            <Icon n={c.icon} size={12} />
            {c.label}
          </button>
        ))}
      </div>

      {totalVisible === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-center grid gap-2">
          <p className="text-sm text-muted">
            {tx('Бұл санатта немесе сүзгіде жазбалар жоқ.')}
          </p>
          {onOpenAdd && (
            <div>
              <Button kind="secondary" onClick={onOpenAdd}>
                <Icon n="plus" size={16} />
                {tx('+ Жоспар құру')}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* 1. Мақсаттар (Goals) */}
      {(tab === 'all' || tab === 'goals') && filteredGoals.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">🎯 {tx('Мақсаттар мен қадамдар')}</p>
          {filteredGoals.map((g) => {
            const cat = getCategoryMeta(g.category)
            const prog = calcGoalProgress(g, tasks)
            const prio = PRIORITY_LABELS[g.priority ?? 'normal']
            const linkedH = habits.filter((h) => h.goal_id === g.id)
            const linkedT = tasks.filter((tk) => tk.goal_id === g.id)

            return (
              <div
                key={g.id}
                className={`rounded-lg border bg-surface p-3.5 grid gap-2.5 shadow-sm transition ${cat.border} ${g.done ? 'opacity-70 bg-surface-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                      <Icon n={cat.icon} size={12} />
                      {cat.label}
                    </span>
                    {g.priority && g.priority !== 'normal' && (
                      <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${prio.badge}`}>
                        {prio.label}
                      </span>
                    )}
                    {g.due_on && (
                      <span className="text-muted text-[11px] flex items-center gap-1">
                        <Icon n="calendar" size={11} />
                        {fmtDate(g.due_on)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingGoal(g)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg transition"
                      aria-label={tx('Өңдеу')}
                      title={tx('Өңдеу')}
                    >
                      <Icon n="pencil" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGoal(g.id, g.title)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger transition"
                      aria-label={tx('Өшіру')}
                      title={tx('Өшіру')}
                    >
                      <Icon n="x" size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={g.done}
                    onChange={() => toggleGoal(g.id)}
                    aria-label={tx('{0} орындалды', g.title)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm leading-snug break-words ${g.done ? 'line-through text-muted' : ''}`}>
                      {g.title}
                    </p>
                    {g.metric && (
                      <p className="text-xs text-accent mt-1 flex items-center gap-1 font-medium">
                        🎯 {tx('Нәтиже:')} {g.metric}
                      </p>
                    )}
                  </div>
                </div>

                {/* Прогресс сызығы */}
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-xs text-muted tabular-nums">
                    <span>{tx('Прогресс')}</span>
                    <span className="font-semibold text-foreground">{prog}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${prog === 100 ? 'bg-success' : 'bg-accent'}`}
                      style={{ width: `${prog}%` }}
                    />
                  </div>
                </div>

                {/* Қадамдар тізімі (Milestones checklist) */}
                {g.steps.length > 0 && (
                  <div className="rounded-md bg-surface-2/60 p-2.5 grid gap-1.5 text-xs">
                    <p className="font-semibold text-muted text-[11px] uppercase tracking-wider">{tx('Қадамдары')}:</p>
                    {g.steps.map((st) => (
                      <label key={st.id} className="flex items-center gap-2 cursor-pointer hover:bg-surface-2 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={st.done}
                          onChange={() => toggleStep(g.id, st.id)}
                          className="size-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className={`flex-1 break-words ${st.done ? 'line-through text-muted' : ''}`}>
                          {st.title}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Қадам қосу inline */}
                <div className="flex gap-1.5 pt-0.5">
                  <input
                    value={newStepInputs[g.id] ?? ''}
                    onChange={(e) => setNewStepInputs({ ...newStepInputs, [g.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addStep(g.id)
                      }
                    }}
                    placeholder={tx('+ Қадам қосу...')}
                    className={`${inputCls} h-8 text-xs py-1 flex-1 min-w-0`}
                  />
                  <Button kind="secondary" onClick={() => addStep(g.id)}>
                    {tx('Қосу')}
                  </Button>
                </div>

                {/* Байланысты әдеттер мен тапсырмалар */}
                {(linkedH.length > 0 || linkedT.length > 0) && (
                  <div className="flex gap-1 flex-wrap pt-1 border-t border-line/50 text-[11px]">
                    {linkedH.map((lh) => (
                      <span key={lh.id} className="px-2 py-0.5 rounded bg-surface-2 text-muted flex items-center gap-1">
                        🔄 {lh.title}
                      </span>
                    ))}
                    {linkedT.map((lt) => (
                      <span key={lt.id} className="px-2 py-0.5 rounded bg-surface-2 text-muted flex items-center gap-1">
                        ✅ {lt.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 2. Әдеттер (Habits) */}
      {(tab === 'all' || tab === 'habits') && filteredHabits.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">🔄 {tx('Күнделікті әдеттер трекері')}</p>
          {filteredHabits.map((h) => {
            const cat = getCategoryMeta(h.category)
            const checks = new Set(h.checks ?? [])
            const isToday = checks.has(t)
            const s = streak(checks, t)
            const timeLabel = TIME_OF_DAY_LABELS[h.time_of_day ?? 'any']
            const freqLabel = FREQUENCY_LABELS[h.frequency ?? 'daily']

            return (
              <div
                key={h.id}
                className={`rounded-lg border bg-surface p-3.5 grid gap-2 shadow-sm transition ${cat.border}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                      <Icon n={cat.icon} size={12} />
                      {cat.label}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-xs transition ${
                      s > 0
                        ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
                        : 'bg-surface-2 text-muted'
                    }`}>
                      <Icon n="flame" size={12} className={s > 0 ? 'text-orange-500' : 'text-muted'} />
                      <span>{s > 0 ? tx('{0} күн стрик', s) : tx('Стрик: 0')}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium text-[11px]">
                      {timeLabel.icon} {timeLabel.label}
                    </span>
                    <span className="text-muted text-[11px]">
                      {freqLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingHabit(h)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg transition"
                      aria-label={tx('Өңдеу')}
                      title={tx('Өңдеу')}
                    >
                      <Icon n="pencil" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHabit(h.id, h.title)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger transition"
                      aria-label={tx('Өшіру')}
                      title={tx('Өшіру')}
                    >
                      <Icon n="x" size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-sm break-words flex-1">
                    {h.title}
                  </p>
                  {h.target_val && (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-accent-soft text-accent font-bold text-xs">
                      ⚡ {h.target_val}
                    </span>
                  )}
                </div>

                {h.motivation && (
                  <p className="text-xs text-muted italic">
                    «{h.motivation}»
                  </p>
                )}

                {/* 7 күндік интерактивті визуалды трекер */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40">
                  <div className="flex items-center gap-1">
                    {last7Days.map((d) => {
                      const done = checks.has(d)
                      const isT = d === t
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleHabitDate(h.id, d)}
                          title={`${fmtDate(d)} — ${done ? tx('Орындалды (басып алып тастау)') : tx('Орындалмаған (белгілеу үшін басыңыз)')}`}
                          className={`size-6 rounded-full grid place-items-center text-[10px] font-bold transition hover:scale-110 active:scale-95 ${
                            done
                              ? 'bg-success text-white shadow-xs'
                              : isT
                              ? 'border-2 border-accent text-accent hover:bg-accent-soft'
                              : 'bg-surface-2 text-muted hover:bg-surface-3'
                          }`}
                        >
                          {done ? '✓' : isT ? '•' : ''}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleHabitDate(h.id, t)}
                    className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                      isToday
                        ? 'bg-success text-white shadow-xs'
                        : 'bg-accent-soft text-accent hover:bg-accent hover:text-on-accent'
                    }`}
                  >
                    <Icon n={isToday ? 'check' : 'flame'} size={14} />
                    <span>{isToday ? tx('Бүгін жасалды ✓') : tx('Бүгін белгілеу (+1 🔥)')}</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 3. Тапсырмалар (Tasks) */}
      {(tab === 'all' || tab === 'tasks') && filteredTasks.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">✅ {tx('Нақты тапсырмалар')}</p>
          {filteredTasks.map((tk) => {
            const cat = getCategoryMeta(tk.category)
            const prio = PRIORITY_LABELS[tk.priority ?? 'normal']
            const overdue = tk.due_on && tk.due_on < t && !tk.done
            const linkedG = goals.find((g) => g.id === tk.goal_id)

            return (
              <div
                key={tk.id}
                className={`rounded-lg border bg-surface p-3 grid gap-2 shadow-sm transition ${cat.border} ${tk.done ? 'opacity-70 bg-surface-2' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                      <Icon n={cat.icon} size={12} />
                      {cat.label}
                    </span>
                    {tk.priority === 'high' && (
                      <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${prio.badge}`}>
                        ⚡ {prio.label}
                      </span>
                    )}
                    {tk.due_on && (
                      <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-danger font-bold' : 'text-muted'}`}>
                        <Icon n="calendar" size={11} />
                        {fmtDate(tk.due_on)}
                        {overdue && ` (${tx('мерзімі өтті!')})`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingTask(tk)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg transition"
                      aria-label={tx('Өңдеу')}
                      title={tx('Өңдеу')}
                    >
                      <Icon n="pencil" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTask(tk.id, tk.title)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={tx('Өшіру')}
                      title={tx('Өшіру')}
                    >
                      <Icon n="x" size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={tk.done}
                    onChange={() => toggleTask(tk.id)}
                    aria-label={tx('{0} орындалды', tk.title)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm break-words ${tk.done ? 'line-through text-muted' : ''}`}>
                      {tk.title}
                    </p>
                    {tk.notes && (
                      <p className="text-xs text-muted whitespace-pre-line mt-1 bg-surface-2 p-2 rounded-md">
                        {tk.notes}
                      </p>
                    )}
                    {linkedG && (
                      <p className="text-[11px] text-accent mt-1 flex items-center gap-1">
                        🎯 {linkedG.title}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {editingGoal && (
        <GoalEditSheet
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
          onSave={(updated) => {
            update((prev) => ({
              ...prev,
              goals: prev.goals.map((g) => (g.id === updated.id ? updated : g)),
            }))
            setEditingGoal(null)
            toast(tx('Мақсат сәтті сақталды'))
          }}
        />
      )}

      {editingHabit && (
        <HabitEditSheet
          habit={editingHabit}
          goals={goals}
          onClose={() => setEditingHabit(null)}
          onSave={(updated) => {
            update((prev) => ({
              ...prev,
              habits: prev.habits.map((h) => (h.id === updated.id ? updated : h)),
            }))
            setEditingHabit(null)
            toast(tx('Әдет сәтті сақталды'))
          }}
        />
      )}

      {editingTask && (
        <TaskEditSheet
          task={editingTask}
          goals={goals}
          onClose={() => setEditingTask(null)}
          onSave={(updated) => {
            update((prev) => ({
              ...prev,
              tasks: prev.tasks.map((tk) => (tk.id === updated.id ? updated : tk)),
            }))
            setEditingTask(null)
            toast(tx('Тапсырма сәтті сақталды'))
          }}
        />
      )}
    </Card>
  )
}

/* ==========================================================================
   Мақсатты өңдеу парағы (GoalEditSheet)
   ========================================================================== */

export function GoalEditSheet({
  goal,
  onClose,
  onSave,
}: {
  goal: RoadmapGoal
  onClose: () => void
  onSave: (goal: RoadmapGoal) => void
}) {
  const [title, setTitle] = useState(goal.title)
  const [category, setCategory] = useState<PlanCategory>(goal.category)
  const [priority, setPriority] = useState<'high' | 'normal'>(goal.priority === 'high' ? 'high' : 'normal')
  const [metric, setMetric] = useState(goal.metric ?? '')
  const [dueOn, setDueOn] = useState(goal.due_on ?? '')
  const [done, setDone] = useState(goal.done)
  const [steps, setSteps] = useState<{ id: string; title: string; done: boolean }[]>(goal.steps ?? [])
  const [newStep, setNewStep] = useState('')

  const handleAddStep = () => {
    const text = newStep.trim()
    if (!text) return
    setSteps([...steps, { id: 's_' + Date.now(), title: text, done: false }])
    setNewStep('')
  }

  const handleToggleStep = (stepId: string) => {
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)))
  }

  const handleRemoveStep = (stepId: string) => {
    setSteps(steps.filter((s) => s.id !== stepId))
  }

  const handleSave = () => {
    if (title.trim().length < 2) {
      toast(tx('Мақсат атауын енгізіңіз'))
      return
    }
    onSave({
      ...goal,
      title: title.trim(),
      category,
      priority,
      metric: metric.trim() || undefined,
      due_on: dueOn || null,
      done,
      steps,
    })
  }

  return (
    <Sheet title={tx('Мақсатты өңдеу')} onClose={onClose}>
      <div className="grid gap-4">
        <Field label={tx('Мақсат атауы')}>
          {(id) => (
            <input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder={tx('Мысалы: Олимпиададан 1-орын алу')}
            />
          )}
        </Field>

        <Field label={tx('Санаты')}>
          {(id) => (
            <select
              id={id}
              value={category}
              onChange={(e) => setCategory(e.target.value as PlanCategory)}
              className={inputCls}
            >
              {PLAN_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Маңыздылығы')}>
            {(id) => (
              <select
                id={id}
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'high' | 'normal')}
                className={inputCls}
              >
                <option value="normal">{tx('Қалыпты')}</option>
                <option value="high">⚡ {tx('Жоғары басымдық')}</option>
              </select>
            )}
          </Field>
          <Field label={tx('Мерзімі')}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className={inputCls}
              />
            )}
          </Field>
        </div>

        <Field label={tx('Нәтиже / Көрсеткіш')} hint={tx('Қалай бағалайсыз?')}>
          {(id, desc) => (
            <input
              id={id}
              aria-describedby={desc}
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className={inputCls}
              placeholder={tx('Мысалы: 90+ ұпай, B2 деңгейі, 10 кітап')}
            />
          )}
        </Field>

        {/* Қадамдарды басқару */}
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">
            {tx('Қадамдары / Кезеңдері')} ({steps.length})
          </label>
          {steps.map((st) => (
            <div key={st.id} className="flex items-center gap-2 bg-surface-2 p-2 rounded-lg text-sm">
              <input
                type="checkbox"
                checked={st.done}
                onChange={() => handleToggleStep(st.id)}
                className="size-4 shrink-0 accent-[var(--accent)]"
              />
              <span className={`flex-1 break-words text-xs ${st.done ? 'line-through text-muted' : ''}`}>
                {st.title}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveStep(st.id)}
                className="size-6 grid place-items-center rounded text-muted hover:text-danger hover:bg-surface-3 transition"
              >
                <Icon n="x" size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddStep()
                }
              }}
              placeholder={tx('+ Жаңа қадам атауы...')}
              className={`${inputCls} text-xs py-1.5 flex-1 min-w-0`}
            />
            <Button kind="secondary" onClick={handleAddStep}>
              {tx('Қосу')}
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer bg-surface-2 p-3 rounded-lg">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm font-semibold">{tx('Мақсат толық орындалды деп белгілеу')}</span>
        </label>

        <div className="flex gap-2 pt-2">
          <Button block onClick={handleSave}>
            {tx('Сақтау')}
          </Button>
          <Button block kind="secondary" onClick={onClose}>
            {tx('Бас тарту')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ==========================================================================
   Әдетті өңдеу парағы (HabitEditSheet)
   ========================================================================== */

export function HabitEditSheet({
  habit,
  goals,
  onClose,
  onSave,
}: {
  habit: RoadmapHabit
  goals?: RoadmapGoal[]
  onClose: () => void
  onSave: (habit: RoadmapHabit) => void
}) {
  const [title, setTitle] = useState(habit.title)
  const [category, setCategory] = useState<PlanCategory>(habit.category)
  const [targetVal, setTargetVal] = useState(habit.target_val ?? '')
  const [timeOfDay, setTimeOfDay] = useState(habit.time_of_day ?? 'any')
  const [frequency, setFrequency] = useState(habit.frequency ?? 'daily')
  const [motivation, setMotivation] = useState(habit.motivation ?? '')
  const [goalId, setGoalId] = useState(habit.goal_id ?? '')

  const handleSave = () => {
    if (title.trim().length < 2) {
      toast(tx('Әдет атауын енгізіңіз'))
      return
    }
    onSave({
      ...habit,
      title: title.trim(),
      category,
      target_val: targetVal.trim() || undefined,
      time_of_day: timeOfDay,
      frequency,
      motivation: motivation.trim() || undefined,
      goal_id: goalId || null,
    })
  }

  return (
    <Sheet title={tx('Әдетті өңдеу')} onClose={onClose}>
      <div className="grid gap-4">
        <Field label={tx('Әдет атауы')}>
          {(id) => (
            <input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder={tx('Мысалы: Күн сайын 20 бет кітап оқу')}
            />
          )}
        </Field>

        <Field label={tx('Санаты')}>
          {(id) => (
            <select
              id={id}
              value={category}
              onChange={(e) => setCategory(e.target.value as PlanCategory)}
              className={inputCls}
            >
              {PLAN_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        {goals && goals.length > 0 && (
          <Field label={tx('Байланысты мақсат')}>
            {(id) => (
              <select
                id={id}
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className={inputCls}
              >
                <option value="">{tx('Байланыссыз (жеке әдет)')}</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    🎯 {g.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field label={tx('Мақсатты мөлшер (норма)')} hint={tx('Мысалы: 20 бет, 30 мин, 5 есеп')}>
          {(id, desc) => (
            <input
              id={id}
              aria-describedby={desc}
              value={targetVal}
              onChange={(e) => setTargetVal(e.target.value)}
              className={inputCls}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Күн уақыты')}>
            {(id) => (
              <select
                id={id}
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value as 'morning' | 'afternoon' | 'evening' | 'any')}
                className={inputCls}
              >
                <option value="any">{tx('Кез келген уақытта')}</option>
                <option value="morning">{tx('Таңертең')}</option>
                <option value="afternoon">{tx('Түстен кейін')}</option>
                <option value="evening">{tx('Кешке')}</option>
              </select>
            )}
          </Field>
          <Field label={tx('Жиілігі')}>
            {(id) => (
              <select
                id={id}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekdays' | '3x_week')}
                className={inputCls}
              >
                <option value="daily">{tx('Күн сайын')}</option>
                <option value="weekdays">{tx('Жұмыс күндері')}</option>
                <option value="3x_week">{tx('Аптасына 3 рет')}</option>
              </select>
            )}
          </Field>
        </div>

        <Field label={tx('Мотивация («Не үшін керек?»)')}>
          {(id) => (
            <input
              id={id}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              className={inputCls}
              placeholder={tx('Мысалы: Ой-өрісті дамытып, сөздік қорды көбейтеді')}
            />
          )}
        </Field>

        <div className="flex gap-2 pt-2">
          <Button block onClick={handleSave}>
            {tx('Сақтау')}
          </Button>
          <Button block kind="secondary" onClick={onClose}>
            {tx('Бас тарту')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ==========================================================================
   Тапсырманы өңдеу парағы (TaskEditSheet)
   ========================================================================== */

export function TaskEditSheet({
  task,
  goals,
  onClose,
  onSave,
}: {
  task: RoadmapTask
  goals?: RoadmapGoal[]
  onClose: () => void
  onSave: (task: RoadmapTask) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [category, setCategory] = useState<PlanCategory>(task.category)
  const [priority, setPriority] = useState<'high' | 'normal'>(task.priority === 'high' ? 'high' : 'normal')
  const [dueOn, setDueOn] = useState(task.due_on ?? '')
  const [goalId, setGoalId] = useState(task.goal_id ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [done, setDone] = useState(task.done)

  const handleSave = () => {
    if (title.trim().length < 2) {
      toast(tx('Тапсырма атауын енгізіңіз'))
      return
    }
    onSave({
      ...task,
      title: title.trim(),
      category,
      priority,
      due_on: dueOn || null,
      goal_id: goalId || null,
      notes: notes.trim() || null,
      done,
    })
  }

  return (
    <Sheet title={tx('Тапсырманы өңдеу')} onClose={onClose}>
      <div className="grid gap-4">
        <Field label={tx('Тапсырма атауы')}>
          {(id) => (
            <input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder={tx('Мысалы: Кітапты кітапханадан алу')}
            />
          )}
        </Field>

        <Field label={tx('Санаты')}>
          {(id) => (
            <select
              id={id}
              value={category}
              onChange={(e) => setCategory(e.target.value as PlanCategory)}
              className={inputCls}
            >
              {PLAN_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        {goals && goals.length > 0 && (
          <Field label={tx('Байланысты мақсат')}>
            {(id) => (
              <select
                id={id}
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className={inputCls}
              >
                <option value="">{tx('Байланыссыз (жеке тапсырма)')}</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    🎯 {g.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Маңыздылығы')}>
            {(id) => (
              <select
                id={id}
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'high' | 'normal')}
                className={inputCls}
              >
                <option value="normal">{tx('Қалыпты')}</option>
                <option value="high">⚡ {tx('Жоғары басымдық')}</option>
              </select>
            )}
          </Field>
          <Field label={tx('Мерзімі')}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className={inputCls}
              />
            )}
          </Field>
        </div>

        <Field label={tx('Жазба / Ескертпе')}>
          {(id) => (
            <textarea
              id={id}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder={tx('Қосымша мәліметтер, сілтемелер немесе нұсқаулық...')}
            />
          )}
        </Field>

        <label className="flex items-center gap-2 cursor-pointer bg-surface-2 p-3 rounded-lg">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm font-semibold">{tx('Тапсырма орындалды деп белгілеу')}</span>
        </label>

        <div className="flex gap-2 pt-2">
          <Button block onClick={handleSave}>
            {tx('Сақтау')}
          </Button>
          <Button block kind="secondary" onClick={onClose}>
            {tx('Бас тарту')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ==========================================================================
   Күрделендірілген Жоспар Құру Шебері (RoadmapBuilderSheet)
   ========================================================================== */

function RoadmapBuilderSheet({
  student,
  currentRoadmap,
  meetings,
  onClose,
  onDone,
}: {
  student: { id: string; class_id: string; full_name: string }
  currentRoadmap: StudentRoadmap
  meetings: MentorMeeting[]
  onClose: () => void
  onDone: (r: StudentRoadmap) => void
}) {
  const [tab, setTab] = useState<'presets' | 'goal' | 'habit' | 'task'>('presets')
  const [presetCat, setPresetCat] = useState<string>('all')
  const [selectedPreset, setSelectedPreset] = useState<PlanPreset | null>(null)

  // Custom Goal form state
  const [goalCat, setGoalCat] = useState<PlanCategory>('study')
  const [goalTitle, setGoalTitle] = useState('')
  const [goalMetric, setGoalMetric] = useState('')
  const [goalDue, setGoalDue] = useState('')
  const [goalPriority, setGoalPriority] = useState<'high' | 'medium' | 'normal'>('high')
  const [goalSteps, setGoalSteps] = useState<string[]>([''])
  const [addLinkedHabit, setAddLinkedHabit] = useState(false)
  const [linkedHabitTitle, setLinkedHabitTitle] = useState('')
  const [linkedHabitTarget, setLinkedHabitTarget] = useState('')
  const [addLinkedTask, setAddLinkedTask] = useState(false)
  const [linkedTaskTitle, setLinkedTaskTitle] = useState('')
  const [linkedTaskDue, setLinkedTaskDue] = useState('')

  // Custom Habit form state
  const [habitCat, setHabitCat] = useState<PlanCategory>('discipline')
  const [habitTitle, setHabitTitle] = useState('')
  const [habitTarget, setHabitTarget] = useState('')
  const [habitTime, setHabitTime] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('evening')
  const [habitFreq, setHabitFreq] = useState<'daily' | 'weekdays' | '3x_week'>('daily')
  const [habitMotivation, setHabitMotivation] = useState('')
  const [habitGoalId, setHabitGoalId] = useState<string>('')

  // Custom Task form state
  const [taskCat, setTaskCat] = useState<PlanCategory>('study')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState<'high' | 'normal'>('high')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskGoalId, setTaskGoalId] = useState<string>('')

  const [busy, setBusy] = useState(false)

  // Sync to standard mentorAssign
  const syncMeetingItem = async (kind: 'task' | 'habit', title: string, due: string | null) => {
    try {
      let mId = meetings[0]?.id
      if (!mId) {
        const res = await addMentorMeeting({
          class_id: student.class_id,
          student_id: student.id,
          starts_at: new Date().toISOString(),
          topic: tx('Даму жоспары мен әдеттер'),
          visible: false,
        })
        mId = res.id
      }
      await mentorAssign(mId, kind, title, due)
    } catch {
      // ignore sync errors
    }
  }

  // 1. Preset Apply
  const applyPreset = async (p: PlanPreset) => {
    setBusy(true)
    try {
      const gid = 'g_' + Date.now()
      const newGoal: RoadmapGoal = {
        id: gid,
        title: p.goal.title,
        category: p.category,
        metric: p.goal.metric,
        priority: p.goal.priority,
        due_on: addDays(today(), p.goal.due_days),
        done: false,
        steps: p.goal.steps.map((st, i) => ({ id: `s_${Date.now()}_${i}`, title: st, done: false })),
        created_at: new Date().toISOString(),
      }

      const newHabits: RoadmapHabit[] = p.habits.map((h, i) => ({
        id: `h_${Date.now()}_${i}`,
        title: h.title,
        category: p.category,
        target_val: h.target_val,
        time_of_day: h.time_of_day,
        frequency: h.frequency,
        motivation: h.motivation,
        goal_id: gid,
        archived: false,
        checks: [],
        created_at: new Date().toISOString(),
      }))

      const newTasks: RoadmapTask[] = p.tasks.map((tk, i) => ({
        id: `t_${Date.now()}_${i}`,
        title: tk.title,
        category: p.category,
        due_on: addDays(today(), tk.due_days),
        priority: tk.priority,
        notes: tk.notes,
        goal_id: gid,
        done: false,
        created_at: new Date().toISOString(),
      }))

      const updatedRoadmap: StudentRoadmap = {
        goals: [newGoal, ...(currentRoadmap.goals ?? [])],
        habits: [...newHabits, ...(currentRoadmap.habits ?? [])],
        tasks: [...newTasks, ...(currentRoadmap.tasks ?? [])],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)

      // Sync habits & tasks to standard mentor tables
      for (const h of newHabits) await syncMeetingItem('habit', h.title, null)
      for (const tk of newTasks) await syncMeetingItem('task', tk.title, tk.due_on ?? null)

      toast(tx('Кешенді жоспар оқушыға бекітілді!'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  // 2. Custom Goal Save
  const saveCustomGoal = async () => {
    if (goalTitle.trim().length < 2) return toast(tx('Мақсат атауын жазыңыз'))
    setBusy(true)
    try {
      const gid = 'g_' + Date.now()
      const steps = goalSteps
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((st, i) => ({ id: `s_${Date.now()}_${i}`, title: st, done: false }))

      const newGoal: RoadmapGoal = {
        id: gid,
        title: goalTitle.trim(),
        category: goalCat,
        metric: goalMetric.trim() || undefined,
        due_on: goalDue || null,
        priority: goalPriority,
        done: false,
        steps,
        created_at: new Date().toISOString(),
      }

      const extraHabits: RoadmapHabit[] = []
      if (addLinkedHabit && linkedHabitTitle.trim().length >= 2) {
        extraHabits.push({
          id: 'h_' + Date.now(),
          title: linkedHabitTitle.trim(),
          category: goalCat,
          target_val: linkedHabitTarget.trim() || undefined,
          time_of_day: 'evening',
          frequency: 'daily',
          goal_id: gid,
          archived: false,
          checks: [],
          created_at: new Date().toISOString(),
        })
        await syncMeetingItem('habit', linkedHabitTitle.trim(), null)
      }

      const extraTasks: RoadmapTask[] = []
      if (addLinkedTask && linkedTaskTitle.trim().length >= 2) {
        extraTasks.push({
          id: 't_' + Date.now(),
          title: linkedTaskTitle.trim(),
          category: goalCat,
          due_on: linkedTaskDue || null,
          priority: 'high',
          goal_id: gid,
          done: false,
          created_at: new Date().toISOString(),
        })
        await syncMeetingItem('task', linkedTaskTitle.trim(), linkedTaskDue || null)
      }

      const updatedRoadmap: StudentRoadmap = {
        goals: [newGoal, ...(currentRoadmap.goals ?? [])],
        habits: [...extraHabits, ...(currentRoadmap.habits ?? [])],
        tasks: [...extraTasks, ...(currentRoadmap.tasks ?? [])],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)
      toast(tx('Мақсат сақталды'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  // 3. Custom Habit Save
  const saveCustomHabit = async () => {
    if (habitTitle.trim().length < 2) return toast(tx('Әдет атауын жазыңыз'))
    setBusy(true)
    try {
      const newHabit: RoadmapHabit = {
        id: 'h_' + Date.now(),
        title: habitTitle.trim(),
        category: habitCat,
        target_val: habitTarget.trim() || undefined,
        time_of_day: habitTime,
        frequency: habitFreq,
        motivation: habitMotivation.trim() || undefined,
        goal_id: habitGoalId || null,
        archived: false,
        checks: [],
        created_at: new Date().toISOString(),
      }

      const updatedRoadmap: StudentRoadmap = {
        goals: currentRoadmap.goals ?? [],
        habits: [newHabit, ...(currentRoadmap.habits ?? [])],
        tasks: currentRoadmap.tasks ?? [],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)
      await syncMeetingItem('habit', habitTitle.trim(), null)
      toast(tx('Әдет сақталды'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  // 4. Custom Task Save
  const saveCustomTask = async () => {
    if (taskTitle.trim().length < 2) return toast(tx('Тапсырма атауын жазыңыз'))
    setBusy(true)
    try {
      const newTask: RoadmapTask = {
        id: 't_' + Date.now(),
        title: taskTitle.trim(),
        category: taskCat,
        due_on: taskDue || null,
        priority: taskPriority,
        notes: taskNotes.trim() || null,
        goal_id: taskGoalId || null,
        done: false,
        created_at: new Date().toISOString(),
      }

      const updatedRoadmap: StudentRoadmap = {
        goals: currentRoadmap.goals ?? [],
        habits: currentRoadmap.habits ?? [],
        tasks: [newTask, ...(currentRoadmap.tasks ?? [])],
      }

      await saveStudentRoadmap(student.id, updatedRoadmap)
      await syncMeetingItem('task', taskTitle.trim(), taskDue || null)
      toast(tx('Тапсырма сақталды'))
      onDone(updatedRoadmap)
    } catch (e) {
      toast(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const existingGoals = currentRoadmap.goals ?? []

  return (
    <Sheet title={tx('Жеке даму жоспарын құру')} onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-xs text-muted">
          {tx('{0} үшін мақсат қою, күнделікті пайдалы әдеттерді енгізу немесе нақты тапсырмалар беру.', student.full_name)}
        </p>

        {/* Режим таңдау */}
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1 text-xs text-center font-semibold">
          <button
            type="button"
            onClick={() => { setTab('presets'); setSelectedPreset(null) }}
            className={`py-2 px-1 rounded-md transition ${tab === 'presets' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            🌟 {tx('Дайын үлгілер')}
          </button>
          <button
            type="button"
            onClick={() => setTab('goal')}
            className={`py-2 px-1 rounded-md transition ${tab === 'goal' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            🎯 {tx('Мақсат')}
          </button>
          <button
            type="button"
            onClick={() => setTab('habit')}
            className={`py-2 px-1 rounded-md transition ${tab === 'habit' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            🔄 {tx('Әдет')}
          </button>
          <button
            type="button"
            onClick={() => setTab('task')}
            className={`py-2 px-1 rounded-md transition ${tab === 'task' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            ✅ {tx('Тапсырма')}
          </button>
        </div>

        {/* 1. ДАЙЫН ҮЛГІЛЕР БАНКІ */}
        {tab === 'presets' && !selectedPreset && (
          <div className="grid gap-3">
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setPresetCat('all')}
                className={`px-3 py-1 rounded-full transition ${presetCat === 'all' ? 'bg-accent text-on-accent font-semibold' : 'bg-surface-2 text-muted'}`}
              >
                {tx('Барлығы')}
              </button>
              {PLAN_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPresetCat(c.id)}
                  className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${presetCat === c.id ? `${c.bg} ${c.color} font-bold` : 'bg-surface-2 text-muted'}`}
                >
                  <Icon n={c.icon} size={12} />
                  {c.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              {PLAN_PRESETS.filter((p) => presetCat === 'all' || p.category === presetCat).map((p) => {
                const cat = getCategoryMeta(p.category)
                return (
                  <div
                    key={p.key}
                    className={`rounded-lg border p-3.5 grid gap-2.5 bg-surface transition hover:shadow-md ${cat.border}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                          <Icon n={cat.icon} size={12} />
                          {cat.label}
                        </span>
                        <h3 className="font-bold text-sm text-foreground mt-1">{p.title}</h3>
                        <p className="text-xs text-muted">{p.desc}</p>
                      </div>
                    </div>

                    <div className="rounded-md bg-surface-2/70 p-2.5 grid gap-1.5 text-xs">
                      <p className="font-semibold text-foreground">🎯 {p.goal.title}</p>
                      <p className="text-accent text-[11px] font-medium">✨ {tx('Нәтиже:')} {p.goal.metric}</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {p.habits.map((h, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface text-muted text-[11px]">
                            🔄 {h.title} ({h.target_val})
                          </span>
                        ))}
                        {p.tasks.map((tk, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface text-muted text-[11px]">
                            ✅ {tk.title}
                          </span>
                        ))}
                      </div>
                    </div>

                    <Button loading={busy} onClick={() => applyPreset(p)}>
                      {tx('Осы кешенді жоспарды бекіту')}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 2. МАҚСАТ ҚҰРУ (Custom Goal) */}
        {tab === 'goal' && (
          <div className="grid gap-3">
            <Field label={tx('Санаты / Бағыты')}>
              {() => (
                <div className="flex gap-1.5 flex-wrap">
                  {PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setGoalCat(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                        goalCat === c.id ? `${c.bg} ${c.color} ring-2 ring-accent font-bold` : 'bg-surface-2 text-muted'
                      }`}
                    >
                      <Icon n={c.icon} size={13} />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={tx('Мақсат атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder={tx('Мысалы: Алгебрадан БЖБ/ТЖБ нәтижесін 85%-ға жеткізу')}
                  className={inputCls}
                />
              )}
            </Field>

            <Field label={tx('Күтілетін нәтиже / Өлшем')} hint={tx('Міндетті емес, SMART-өлшемі')}>
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  value={goalMetric}
                  onChange={(e) => setGoalMetric(e.target.value)}
                  placeholder={tx('Мысалы: БЖБ кемінде 17 балл, тоқсанда 5 алу')}
                  className={inputCls}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('Мерзімі (дедлайн)')}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={goalDue}
                    min={today()}
                    onChange={(e) => setGoalDue(e.target.value)}
                    className={inputCls}
                  />
                )}
              </Field>
              <Field label={tx('Басымдығы')}>
                {() => (
                  <Chips
                    label={tx('Басымдық')}
                    value={goalPriority}
                    onChange={(v) => setGoalPriority(v as 'high' | 'medium' | 'normal')}
                    items={[
                      ['high', tx('Жоғары')],
                      ['medium', tx('Орташа')],
                      ['normal', tx('Қалыпты')],
                    ]}
                  />
                )}
              </Field>
            </div>

            {/* Қадамдарды қосу */}
            <div className="grid gap-2 border-t border-line pt-3">
              <p className="font-semibold text-xs text-muted uppercase tracking-wider">
                {tx('Мақсатқа жету қадамдары (кезеңдер)')}
              </p>
              {goalSteps.map((st, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={st}
                    onChange={(e) => {
                      const next = [...goalSteps]
                      next[i] = e.target.value
                      setGoalSteps(next)
                    }}
                    placeholder={tx('{0}-қадам...', i + 1)}
                    className={`${inputCls} text-xs flex-1`}
                  />
                  {goalSteps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setGoalSteps(goalSteps.filter((_, idx) => idx !== i))}
                      className="size-10 grid place-items-center text-muted hover:text-danger rounded-md bg-surface-2"
                      aria-label={tx('Өшіру')}
                    >
                      <Icon n="x" size={16} />
                    </button>
                  )}
                </div>
              ))}
              <Button kind="secondary" onClick={() => setGoalSteps([...goalSteps, ''])}>
                <Icon n="plus" size={16} />
                {tx('+ Қадам қосу')}
              </Button>
            </div>

            {/* Осы мақсат үшін әдет те қосу */}
            <div className="grid gap-2 border-t border-line pt-3">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                <input
                  type="checkbox"
                  checked={addLinkedHabit}
                  onChange={(e) => setAddLinkedHabit(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                {tx('Осы мақсат үшін күнделікті әдет те қосу')}
              </label>
              {addLinkedHabit && (
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <input
                    value={linkedHabitTitle}
                    onChange={(e) => setLinkedHabitTitle(e.target.value)}
                    placeholder={tx('Әдет: мысалы күнде 30 мин қайталау')}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                  <input
                    value={linkedHabitTarget}
                    onChange={(e) => setLinkedHabitTarget(e.target.value)}
                    placeholder={tx('Нысана: 30 мин / 20 бет')}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                </div>
              )}
            </div>

            {/* Осы мақсат үшін тапсырма да қосу */}
            <div className="grid gap-2 border-t border-line pt-3">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm">
                <input
                  type="checkbox"
                  checked={addLinkedTask}
                  onChange={(e) => setAddLinkedTask(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                {tx('Осы мақсат үшін нақты тапсырма да қосу')}
              </label>
              {addLinkedTask && (
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <input
                    value={linkedTaskTitle}
                    onChange={(e) => setLinkedTaskTitle(e.target.value)}
                    placeholder={tx('Тапсырма: мысалы Мұғалімнен консультация алу')}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                  <input
                    type="date"
                    value={linkedTaskDue}
                    min={today()}
                    onChange={(e) => setLinkedTaskDue(e.target.value)}
                    className={`${inputCls} text-xs col-span-2`}
                  />
                </div>
              )}
            </div>

            <Button loading={busy} disabled={goalTitle.trim().length < 2} onClick={saveCustomGoal}>
              {tx('Мақсатты сақтау')}
            </Button>
          </div>
        )}

        {/* 3. ӘДЕТ ҚОСУ (Custom Habit) */}
        {tab === 'habit' && (
          <div className="grid gap-3">
            <Field label={tx('Санаты')}>
              {() => (
                <div className="flex gap-1.5 flex-wrap">
                  {PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setHabitCat(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                        habitCat === c.id ? `${c.bg} ${c.color} ring-2 ring-accent font-bold` : 'bg-surface-2 text-muted'
                      }`}
                    >
                      <Icon n={c.icon} size={13} />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={tx('Әдет атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  placeholder={tx('Мысалы: 22:30-да гаджеттерді өшіріп ұйықтау')}
                  className={inputCls}
                />
              )}
            </Field>

            {/* Дайын жылдам ұсыныстар */}
            <div className="flex gap-1 overflow-x-auto text-[11px] pb-1">
              {[
                tx('Күн сайын 20 бет кітап оқу'),
                tx('22:30-да ұйықтау'),
                tx('Күніне 3 олимпиадалық есеп'),
                tx('15 жаңа ағылшын сөзі'),
                tx('Таңғы 15 мин бой жазу'),
                tx('Күніне 1.5 литр су ішу'),
              ].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setHabitTitle(sug)}
                  className="px-2.5 py-1 rounded-full bg-surface-2 text-muted hover:text-accent whitespace-nowrap"
                >
                  + {sug}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('Көлемі / Нысанасы')} hint={tx('Мысалы: 20 бет, 30 мин, 5 есеп')}>
                {(id, d) => (
                  <input
                    id={id}
                    aria-describedby={d}
                    value={habitTarget}
                    onChange={(e) => setHabitTarget(e.target.value)}
                    placeholder={tx('20 бет / 30 мин')}
                    className={inputCls}
                  />
                )}
              </Field>

              <Field label={tx('Күн мезгілі')}>
                {() => (
                  <Chips
                    label={tx('Мезгілі')}
                    value={habitTime}
                    onChange={(v) => setHabitTime(v as 'morning' | 'afternoon' | 'evening' | 'any')}
                    items={[
                      ['morning', '🌅 ' + tx('Таңертең')],
                      ['evening', '🌙 ' + tx('Кешке')],
                      ['any', '⏱️ ' + tx('Кез келген')],
                    ]}
                  />
                )}
              </Field>
            </div>

            <Field label={tx('Жиілігі')}>
              {() => (
                <Chips
                  label={tx('Жиілік')}
                  value={habitFreq}
                  onChange={(v) => setHabitFreq(v as 'daily' | 'weekdays' | '3x_week')}
                  items={[
                    ['daily', tx('Күн сайын')],
                    ['weekdays', tx('Дс-Жм')],
                    ['3x_week', tx('Аптасына 3 рет')],
                  ]}
                />
              )}
            </Field>

            <Field label={tx('Мотивациясы')} hint={tx('Не үшін қажет? (қысқаша түсіндірме)')}>
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  value={habitMotivation}
                  onChange={(e) => setHabitMotivation(e.target.value)}
                  placeholder={tx('Мысалы: Сергек ояну және сабақта зейінді ұстау үшін')}
                  className={inputCls}
                />
              )}
            </Field>

            {existingGoals.length > 0 && (
              <Field label={tx('Қай мақсатқа байланысты?')}>
                {(id) => (
                  <select
                    id={id}
                    value={habitGoalId}
                    onChange={(e) => setHabitGoalId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{tx('Жеке әдет (мақсатпен байланыссыз)')}</option>
                    {existingGoals.map((g) => (
                      <option key={g.id} value={g.id}>🎯 {g.title}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            <Button loading={busy} disabled={habitTitle.trim().length < 2} onClick={saveCustomHabit}>
              {tx('Әдетті қосу')}
            </Button>
          </div>
        )}

        {/* 4. ТАПСЫРМА БЕРУ (Custom Task) */}
        {tab === 'task' && (
          <div className="grid gap-3">
            <Field label={tx('Санаты')}>
              {() => (
                <div className="flex gap-1.5 flex-wrap">
                  {PLAN_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTaskCat(c.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                        taskCat === c.id ? `${c.bg} ${c.color} ring-2 ring-accent font-bold` : 'bg-surface-2 text-muted'
                      }`}
                    >
                      <Icon n={c.icon} size={13} />
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field label={tx('Тапсырма атауы')}>
              {(id) => (
                <input
                  id={id}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={tx('Мысалы: Пән мұғалімінен консультация алып, қателерді талдау')}
                  className={inputCls}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('Мерзімі (дедлайн)')}>
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={taskDue}
                    min={today()}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className={inputCls}
                  />
                )}
              </Field>

              <Field label={tx('Басымдығы')}>
                {() => (
                  <Chips
                    label={tx('Басымдық')}
                    value={taskPriority}
                    onChange={(v) => setTaskPriority(v as 'high' | 'normal')}
                    items={[
                      ['high', '⚡ ' + tx('Шұғыл')],
                      ['normal', tx('Қалыпты')],
                    ]}
                  />
                )}
              </Field>
            </div>

            <Field label={tx('Мұғалім нұсқаулығы / Ескертпе')}>
              {(id) => (
                <textarea
                  id={id}
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder={tx('Мысалы: Дәптерге нақты 5 қиын сұрақты жазып бару, шешімін тексерту.')}
                  rows={2}
                  className={`${inputCls} py-2 h-auto text-xs`}
                />
              )}
            </Field>

            {existingGoals.length > 0 && (
              <Field label={tx('Қай мақсатқа байланысты?')}>
                {(id) => (
                  <select
                    id={id}
                    value={taskGoalId}
                    onChange={(e) => setTaskGoalId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{tx('Жеке тапсырма (мақсатпен байланыссыз)')}</option>
                    {existingGoals.map((g) => (
                      <option key={g.id} value={g.id}>🎯 {g.title}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            <Button loading={busy} disabled={taskTitle.trim().length < 2} onClick={saveCustomTask}>
              {tx('Тапсырманы қосу')}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/* ==========================================================================
   Анкета өңдеу, Кездесу жоспарлау және Қорытынды жазу
   ========================================================================== */


function PlanSheet({ student, onClose, onDone }: { student: { id: string; class_id: string }; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ when: '', topic: '', place: '', show: 'show' as 'show' | 'staff' })
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={tx('Кездесу жоспарлау')} onClose={onClose}>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">{TEMPLATES.map((t) => (
          <button key={t.key} type="button" aria-pressed={f.topic === t.topic} onClick={() => setF({ ...f, topic: t.topic })}
            className={`h-9 px-3 rounded-full text-sm font-semibold ${f.topic === t.topic ? 'bg-accent text-on-accent' : 'bg-surface-2'}`}>{t.topic}</button>
        ))}</div>
        <input aria-label={tx('Тақырыбы')} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={300} className={inputCls} placeholder={tx('Тақырыбы — не үлгіні таңдаңыз')} />
        <input aria-label={tx('Күні мен уақыты')} type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} className={`${inputCls} min-w-0`} />
        <Field label={tx('Өтетін орны')} hint={tx('Жатақхана орындары немесе мектеп кабинеттері')}>
          {(id) => <LocationPicker id={id} value={f.place} onChange={(place) => setF({ ...f, place })} />}
        </Field>
        <Chips label={tx('Кім көреді')} value={f.show} onChange={(show) => setF({ ...f, show })} items={[['show', tx('Оқушыға көрсету')], ['staff', tx('Тек ұстаздарға')]]} />
        <p className="text-xs text-muted">{f.show === 'show' ? tx('Оқушыға хабарлама барады, кездесуден 1 сағат бұрын еске салынады.') : tx('Оқушы бұл жазбаны көрмейді.')}</p>
        <Button loading={busy} disabled={!f.when || f.topic.trim().length < 2} onClick={async () => {
          setBusy(true)
          try { await addMentorMeeting({ class_id: student.class_id, student_id: student.id, starts_at: new Date(f.when).toISOString(), topic: f.topic.trim(), visible: f.show === 'show', place: f.place.trim() || null }); onDone() }
          catch (e) { toast(errText(e)) } finally { setBusy(false) }
        }}>{tx('Белгілеу')}</Button>
      </div>
    </Sheet>
  )
}

function FinishSheet({ m, onClose, onDone }: { m: MentorMeeting; onClose: () => void; onDone: () => void }) {
  const tpl = TEMPLATES.find((t) => t.topic === m.topic)
  const [items, setItems] = useState<{ title: string; kind: 'task' | 'habit'; due: string }[]>(() => (tpl?.items ?? []).map(([title, kind]) => ({ title, kind, due: '' })))
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const put = (k: number, v: Partial<(typeof items)[number]>) => setItems(items.map((x, j) => (j === k ? { ...x, ...v } : x)))
  const save = async () => {
    setBusy(true)
    try {
      const list = items.filter((i) => i.title.trim().length >= 2)
      for (const i of list) await mentorAssign(m.id, i.kind, i.title.trim(), i.kind === 'task' ? i.due || null : null)
      await finishMentorMeeting(m.id, list.map((i) => `• ${i.title.trim()}`).join('\n'), notes.trim())
      toast(list.length ? tx('Сақталды, міндеттер оқушының жоспарына түсті') : tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet title={m.topic} onClose={onClose}>
      <div className="grid gap-4">
        {tpl && <div className="rounded-md bg-accent-soft p-3 text-sm"><p className="font-semibold text-accent mb-1">{tx('Сұрақтар')}</p>
          <ul className="list-disc pl-5 grid gap-0.5">{tpl.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>}
        <div className="grid gap-2">
          <p className="font-semibold">{tx('Оқушыға міндеттер')}</p>
          <p className="text-xs text-muted">{m.visible ? tx('Тапсырма оқушының Жоспарына, әдет — Әдеттеріне түседі. Орындалғанын осы беттен көресіз.') : tx('Кездесу жабық болса да, міндеттер оқушының жоспарына түседі.')}</p>
          {items.map((i, k) => (
            <div key={k} className="grid gap-2 rounded-md bg-surface-2 p-2">
              <div className="flex gap-2">
                <input aria-label={tx('Міндет')} value={i.title} onChange={(e) => put(k, { title: e.target.value })} maxLength={200} className={`${inputCls} flex-1 min-w-0`} placeholder={tx('Міндет')} />
                <button type="button" aria-label={tx('Өшіру')} onClick={() => setItems(items.filter((_, j) => j !== k))} className="size-11 grid place-items-center rounded-md text-muted"><Icon n="x" size={16} /></button>
              </div>
              <div className="flex gap-2 items-center">
                {(['task', 'habit'] as const).map((kind) => <button key={kind} type="button" aria-pressed={i.kind === kind} onClick={() => put(k, { kind })}
                  className={`h-9 px-3 rounded-full text-sm font-semibold ${i.kind === kind ? 'bg-accent text-on-accent' : 'bg-surface'}`}>{kind === 'task' ? tx('Тапсырма') : tx('Әдет')}</button>)}
                {i.kind === 'task' && <input aria-label={tx('Дедлайн')} type="date" value={i.due} onChange={(e) => put(k, { due: e.target.value })} className={`${inputCls} h-9 flex-1 min-w-0 text-sm`} />}
              </div>
            </div>
          ))}
          <Button kind="secondary" onClick={() => setItems([...items, { title: '', kind: 'task', due: '' }])}><Icon n="plus" size={18} />{tx('Міндет қосу')}</Button>
        </div>
        <label className="grid gap-1 text-sm"><span className="font-semibold flex items-center gap-1"><Icon n="lock" size={14} />{tx('Жабық жазба')}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className={`${inputCls} h-24 py-2`} placeholder={tx('Тек ұстаздар көреді.')} />
        </label>
        <Button loading={busy} onClick={save}>{tx('Кездесуді аяқтау')}</Button>
      </div>
    </Sheet>
  )
}
