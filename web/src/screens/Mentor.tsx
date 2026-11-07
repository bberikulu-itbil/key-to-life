import { useEffect, useState } from 'react'
import {
  addMentorMeeting, classMentorMeetings, classStudentForms, classStudentProfileDetails, classStudents, errText, finishMentorMeeting, listClasses, listStaff,
  mentorAssign, mentorEvery, patchStudentForm, patchStudentRoadmap, removeMentorMeeting,
  isCurrentTrajectory, listStudentTrajectory, removeStudentTrajectory, saveStudentRoadmap, saveStudentTrajectory, studentMentor, type MentorMeeting, type StudentTrajectoryDraft, type StudentTrajectoryItem, type StudentTrajectoryKind,
} from '../lib/api'
import { mbtiScore } from '../lib/mbti'
import { MI_KINDS, miScore } from '../lib/mi'
import { RIASEC, hollandScore } from '../lib/holland'
import {
  calcGoalProgress, fmtBirthday, FORM, FREQUENCY_LABELS, getCategoryMeta, habitCurrentStreak, habitDueOn, habitWeekProgress, MBTI_TYPES, mentorStatus, PLAN_CATEGORIES, PLAN_PRESETS,
  PRIORITY_LABELS, TEMPLATES, TIME_OF_DAY_LABELS, type PlanCategory, type PlanPreset, type RoadmapGoal,
  type HabitFrequency, type RoadmapHabit, type RoadmapTask, type StudentRoadmap,
} from '../lib/mentor'
import { GALLUP_DOMAINS, GALLUP_THEMES, findGallup } from '../lib/gallup'
import { addDays, fmtDate, today } from '../lib/time'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import LocationPicker from '../components/LocationPicker'
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { lang, tx } from '../lib/i18n'
import StudentDossierStructured, { StudentDossierOverview } from '../components/StudentDossierSections'

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
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]

  const data = useLoad(async () => {
    if (!cls) return null
    const [students, meetings, every] = await Promise.all([
      classStudents(cls.id),
      classMentorMeetings(cls.id),
      mentorEvery(cls.id),
    ])
    const sids = students.map((s) => s.id)
    const [formsMap, detailsMap] = await Promise.all([classStudentForms(sids), classStudentProfileDetails(sids)])
    return { students, meetings, every, formsMap, detailsMap }
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
        <PageHead title={tx('Оқушылар анкетасы')} back />
        <Empty
          icon="user"
          title={tx('Сынып бекітілмеген')}
          text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')}
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
    const details = data.data?.detailsMap[s.id]
    const trajectoryText = s.trajectory.map((item) => item.title).join(' ').toLowerCase()
    const matchIin = (details?.iin ?? '').toLowerCase().includes(q)
    const matchBday = (details?.birthday ?? '').toLowerCase().includes(q)
    const matchTrajectory = trajectoryText.includes(q)
    const matchNation = (form.nation ?? '').toLowerCase().includes(q)
    return matchName || matchIin || matchBday || matchTrajectory || matchNation
  })

  return (
    <div className="grid gap-3 pb-6 w-full">
      {/* Top Header */}
      <PageHead
        title={tx('Оқушылар анкетасы')}
        back
        right={
          <div className="flex items-center gap-2">
            {options.length > 1 && (
              <select
                aria-label={tx('Сынып')}
                value={cls.id}
                onChange={(e) => go(`/mentor?class=${e.target.value}`)}
                className={`${inputCls} w-auto font-medium h-10 py-1`}
              >
                {options.map((c) => (
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
                placeholder={tx('Search')}
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
                <div className="py-8 text-center text-xs text-muted">
                  {tx('Оқушы табылмады')}
                </div>
              ) : (
                filtered.map(({ s, st }) => {
                  const isSelected = s.id === selectedId
                  const details = data.data?.detailsMap[s.id]
                  const trajectoryDisplay = s.trajectory.filter(isCurrentTrajectory).map((item) => item.title).filter(Boolean).join(' · ')
                  const bdayDisplay = details?.birthday
                    ? fmtBirthday(details.birthday)
                    : details?.iin
                    ? `ЖСН: ${details.iin}`
                    : trajectoryDisplay || '—'

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
  classId,
  classNameStr,
  tab,
  onTabChange,
  onBack,
  sidebarCollapsed,
  onToggleSidebar,
  onFormUpdated,
}: {
  student: { id: string; full_name: string; photo: string | null; class_id?: string; olympiad?: string | null; club?: string | null }
  classId?: string
  classNameStr?: string
  tab: DossierTab
  onTabChange: (t: DossierTab) => void
  onBack?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onFormUpdated?: (answers: Record<string, string>) => void
}) {
  const { me } = useMe()
  const data = useLoad(async () => Promise.all([studentMentor(student.id), listStaff()]), [student.id])
  const [d, staff] = data.data ?? [null, []]

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [roadmap, setRoadmap] = useState<StudentRoadmap>({ goals: [], habits: [], tasks: [] })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [dotsMenuOpen, setDotsMenuOpen] = useState(false)
  const [gallupPicker, setGallupPicker] = useState<'top' | 'low' | null>(null)
  const [addPlan, setAddPlan] = useState(false)
  const [addPlanTab, setAddPlanTab] = useState<'presets' | 'goal' | 'habit' | 'task'>('presets')
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
      await patchStudentForm(student.id, { [key]: val })
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
      await patchStudentForm(student.id, patch)
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

  const displayStudent = { ...student, ...d.student }
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
    { id: 'info', label: tx('Жеке мәліметтер'), icon: 'file' },
    { id: 'tests', label: tx('Бағыт-бағдар'), icon: 'list' },
    { id: 'plan', label: tx('Даму жоспары'), icon: 'grid' },
    { id: 'meetings', label: tx('Кездесулер'), icon: 'calendar' },
    { id: 'resources', label: tx('Медиатека'), icon: 'book' },
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

        {/* Right Action Icons: ⋮ and ⤢ */}
        <div className="flex items-center gap-1 shrink-0 relative">
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
          <Avatar name={displayStudent.full_name} photo={displayStudent.photo} size={48} />
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-fg">
              {displayStudent.full_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted">
              {classNameStr && <span className="font-semibold text-accent">{classNameStr}</span>}
              {displayStudent.olympiad && <span>· {displayStudent.olympiad}</span>}
              {displayStudent.club && <span>· {displayStudent.club}</span>}
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
      </div>

      {/* ====================================================================
          TAB 1: INFO (2-Column Property Grid matching screenshot)
          ==================================================================== */}
      <StudentDossierOverview
        student={displayStudent}
        classNameStr={classNameStr}
        meetings={d.meetings}
        roadmap={roadmap}
        profile={d.profileDetails}
        health={d.health}
        parentContacts={d.contacts}
      />

      {tab === 'info' && (
        <div className="grid gap-6">
          <StudentDossierStructured
            studentId={student.id}
            profile={d.profileDetails}
            health={d.health}
            healthEvents={d.healthEvents}
            familyContacts={d.familyContacts}
            parentContacts={d.contacts}
            isStudent={me.role === 'student'}
          />

          {/* Quick Previews of Low Gallup & MBTI (from bottom of screenshot) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line">
            <div
              onClick={() => onTabChange('tests')}
              className="p-3.5 rounded-lg bg-surface-2 hover:bg-surface-2/80 transition cursor-pointer flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-muted block">Low Gallup</span>
                <span className="text-sm font-medium mt-0.5 block">
                  {lowGallupList.length ? lowGallupList.join(', ') : tx('Белгіленбеген (толтыру →)')}
                </span>
              </div>
              <Icon n="chev" size={16} className="text-muted" />
            </div>

            <div
              onClick={() => onTabChange('tests')}
              className="p-3.5 rounded-lg bg-surface-2 hover:bg-surface-2/80 transition cursor-pointer flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-muted block">MBTI</span>
                <span className="text-sm font-bold text-accent mt-0.5 block tracking-wider">
                  {mbtiDisplayType}
                </span>
              </div>
              <Icon n="chev" size={16} className="text-muted" />
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
          <StudentTrajectory studentId={student.id} />
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
                      <span className="text-xs font-bold text-accent tabular-nums">{score} балл</span>
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
            onOpenAdd={(kind) => {
              setAddPlanTab(kind ?? 'presets')
              setAddPlan(true)
            }}
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
          <Card className="grid gap-3">
            <p className="font-bold text-base">{tx('Оқушыға ұсынылған ресурстар')}</p>
            <p className="text-sm text-muted">
              {tx('Оқушының мақсаттарына, олимпиада бағытына және қызығушылығына сай кітаптар, материалдар мен құжаттар.')}
            </p>
            {d.notes.length > 0 && (
              <div className="grid gap-2 border-t border-line pt-3">
                <p className="text-xs font-bold uppercase text-muted">{tx('Сынып кеңесінің жазбалары')}</p>
                {d.notes.map((n) => (
                  <div key={n.id} className="p-3 rounded-lg bg-surface-2 text-sm">
                    <span className="text-xs text-muted block mb-1">
                      {staffName(n.author_id)} · {fmtDate(n.created_at.slice(0, 10))}
                    </span>
                    <p className="whitespace-pre-line">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
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
          initialTab={addPlanTab}
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
    </div>
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

const TRAJECTORY_META: Record<StudentTrajectoryKind, { label: string; icon: string }> = {
  hobby: { label: tx('Хобби'), icon: 'heart' },
  sport: { label: tx('Спорт'), icon: 'ball' },
  olympiad: { label: tx('Олимпиада'), icon: 'trophy' },
  club: { label: tx('Үйірме'), icon: 'users' },
}
const TRAJECTORY_DAYS = ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс']
const isPeriodTrajectory = (kind: StudentTrajectoryKind) => kind === 'olympiad' || kind === 'club'
const trajectoryDuration = (startedOn: string, endedOn?: string | null) => {
  const from = new Date(`${startedOn}T00:00:00`)
  const to = new Date(`${endedOn ?? today()}T00:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth()
  if (to.getDate() < from.getDate()) months -= 1
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const rest = months % 12
    return rest ? tx('{0} жыл {1} ай', years, rest) : tx('{0} жыл', years)
  }
  if (months > 0) return tx('{0} ай', months)
  return tx('{0} күн', Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)))
}

function StudentTrajectory({ studentId }: { studentId: string }) {
  const data = useLoad(() => listStudentTrajectory(studentId), [studentId])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<StudentTrajectoryItem | null>(null)
  const rows = data.data ?? []

  const openAdd = () => { setEditing(null); setSheetOpen(true) }
  const remove = async (item: StudentTrajectoryItem) => {
    if (!confirm(tx('«{0}» жазбасын өшіресіз бе?', item.title))) return
    try { await removeStudentTrajectory(item.id); data.reload() } catch (e) { toast(errText(e)) }
  }

  return (
    <Card className="grid gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-base flex items-center gap-2"><Icon n="list" size={17} className="text-accent" />{tx('Қызығушылықтар және бағыттар')}</p>
          <p className="text-xs text-muted">{tx('Хобби мен спортты апталық уақытымен, олимпиада мен үйірмені қатысу кезеңімен бірге сақтаңыз.')}</p>
        </div>
        <Button kind="secondary" onClick={openAdd}><Icon n="plus" size={15} />{tx('Қосу')}</Button>
      </div>
      {data.loading && !data.data ? <p className="text-sm text-muted">{tx('Жүктелуде...')}</p> : !rows.length ? <Empty icon="list" title={tx('Бағыттар әлі қосылмаған')} text={tx('Хобби мен спортқа уақыт кестесін, олимпиада мен үйірмеге қатысу кезеңін қосыңыз.')} /> : (
        <div className="grid gap-2">
          {rows.map((item) => {
            const meta = TRAJECTORY_META[item.kind]
            const period = isPeriodTrajectory(item.kind)
            const days = item.days_of_week.map((day) => TRAJECTORY_DAYS[day - 1]).filter(Boolean).join(' · ')
            const time = item.start_time || item.end_time ? `${item.start_time?.slice(0, 5) ?? '—'}–${item.end_time?.slice(0, 5) ?? '—'}` : tx('Уақыты белгіленбеген')
            const participation = item.started_on ? `${fmtDate(item.started_on)} — ${item.ended_on ? fmtDate(item.ended_on) : tx('бүгінге дейін')}` : tx('Қатысу кезеңі белгіленбеген')
            const duration = item.started_on ? trajectoryDuration(item.started_on, item.ended_on) : null
            return <div key={item.id} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
              <span className="size-9 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={meta.icon} size={17} /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-sm break-words">{item.title}</p><span className="text-[11px] rounded-full bg-surface px-2 py-0.5 text-muted">{meta.label}</span></div><p className="text-xs text-muted mt-1">{period ? participation : `${days || tx('Апта күні белгіленбеген')} · ${time}`}{duration ? ` · ${tx('ұзақтығы')}: ${duration}` : ''}{item.coach_or_place ? ` · ${item.coach_or_place}` : ''}</p>{item.note && <p className="text-xs text-muted mt-1 whitespace-pre-line">{item.note}</p>}</div>
              <div className="flex gap-1 shrink-0"><button type="button" className="size-8 rounded-md grid place-items-center text-muted hover:bg-surface hover:text-accent" aria-label={tx('Өзгерту')} onClick={() => { setEditing(item); setSheetOpen(true) }}><Icon n="compose" size={15} /></button><button type="button" className="size-8 rounded-md grid place-items-center text-muted hover:bg-surface hover:text-danger" aria-label={tx('Өшіру')} onClick={() => remove(item)}><Icon n="x" size={15} /></button></div>
            </div>
          })}
        </div>
      )}
      {sheetOpen && <Sheet title={editing ? tx('Бағытты өзгерту') : tx('Бағыт қосу')} onClose={() => setSheetOpen(false)}><TrajectoryForm studentId={studentId} item={editing} onDone={() => { setSheetOpen(false); data.reload() }} /></Sheet>}
    </Card>
  )
}

function TrajectoryForm({ studentId, item, onDone }: { studentId: string; item: StudentTrajectoryItem | null; onDone: () => void }) {
  const [draft, setDraft] = useState<StudentTrajectoryDraft>(item ?? { kind: 'hobby', title: '', days_of_week: [], start_time: null, end_time: null, started_on: null, ended_on: null, coach_or_place: '', note: '' })
  const [busy, setBusy] = useState(false)
  const update = (patch: Partial<StudentTrajectoryDraft>) => setDraft((prev) => ({ ...prev, ...patch }))
  const toggleDay = (day: number) => update({ days_of_week: draft.days_of_week.includes(day) ? draft.days_of_week.filter((x) => x !== day) : [...draft.days_of_week, day].sort((a, b) => a - b) })
  const period = isPeriodTrajectory(draft.kind)
  const current = draft.ended_on == null
  const save = async () => {
    if (draft.title.trim().length < 2) return toast(tx('Атауын жазыңыз'))
    if (period && !draft.started_on) return toast(tx('Қатысу басталған күнді енгізіңіз'))
    if (period && !current && !draft.ended_on) return toast(tx('Қатысу аяқталған күнді енгізіңіз'))
    if (draft.start_time && draft.end_time && draft.end_time < draft.start_time) return toast(tx('Аяқталу уақыты басталу уақытынан кейін болуы керек'))
    setBusy(true)
    try { await saveStudentTrajectory(studentId, { ...draft, title: draft.title.trim(), coach_or_place: draft.coach_or_place?.trim() || null, note: draft.note?.trim() || null, start_time: period ? null : draft.start_time || null, end_time: period ? null : draft.end_time || null, started_on: period ? draft.started_on || null : null, ended_on: period ? draft.ended_on || null : null }); toast(tx('Сақталды')); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return <div className="grid gap-4">
    <Field label={tx('Бағыт түрі')}>{(id) => <select id={id} className={inputCls} value={draft.kind} onChange={(e) => { const kind = e.target.value as StudentTrajectoryKind; update({ kind, ...(isPeriodTrajectory(kind) ? { start_time: null, end_time: null } : { started_on: null, ended_on: null }) }) }}>{(Object.keys(TRAJECTORY_META) as StudentTrajectoryKind[]).map((kind) => <option key={kind} value={kind}>{TRAJECTORY_META[kind].label}</option>)}</select>}</Field>
    <Field label={tx('Атауы')} hint={tx('Мысалы: футбол, робототехника, математика олимпиадасы')}>{(id) => <input id={id} className={inputCls} value={draft.title} onChange={(e) => update({ title: e.target.value })} />}</Field>
    {period ? <div className="grid gap-3 rounded-lg bg-surface-2 p-3"><p className="text-sm font-semibold">{tx('Қатысу кезеңі')}</p><div className="grid grid-cols-2 gap-2"><Field label={tx('Қатыса бастаған күні')} hint={tx('Формат: YYYY-MM-DD')}>{(id) => <input id={id} type="date" className={inputCls} value={draft.started_on ?? ''} onChange={(e) => update({ started_on: e.target.value || null })} />}</Field>{current ? <div className="grid content-start gap-1"><span className="text-sm font-semibold">{tx('Аяқталған күні')}</span><span className="h-12 rounded-md bg-surface px-3 flex items-center text-sm text-muted">{tx('Бүгінге дейін')}</span></div> : <Field label={tx('Қатысу аяқталған күні')} hint={tx('Формат: YYYY-MM-DD')}>{(id) => <input id={id} type="date" className={inputCls} value={draft.ended_on ?? ''} onChange={(e) => update({ ended_on: e.target.value || null })} />}</Field>}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={current} onChange={(e) => update({ ended_on: e.target.checked ? null : today() })} />{tx('Қазір қатысып келеді')}</label><p className="text-xs text-muted">{tx('Қатысу ұзақтығы автоматты есептеледі.')}</p></div> : <><div className="grid gap-2"><p className="text-sm font-semibold">{tx('Апта күндері')}</p><div className="grid grid-cols-7 gap-1">{TRAJECTORY_DAYS.map((label, index) => <button key={label} type="button" onClick={() => toggleDay(index + 1)} className={`h-9 rounded-md text-xs font-semibold ${draft.days_of_week.includes(index + 1) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}>{label}</button>)}</div></div><div className="grid grid-cols-2 gap-2"><Field label={tx('Басталу уақыты')} hint={tx('Формат: 09:00')}>{(id) => <input id={id} type="time" className={inputCls} value={draft.start_time ?? ''} onChange={(e) => update({ start_time: e.target.value || null })} />}</Field><Field label={tx('Аяқталу уақыты')} hint={tx('Мысалы: 10:30')}>{(id) => <input id={id} type="time" className={inputCls} value={draft.end_time ?? ''} onChange={(e) => update({ end_time: e.target.value || null })} />}</Field></div></>}
    <Field label={tx('Жетекші немесе орын')} hint={tx('Мысалы: спортзал, Айбек ағай')}>{(id) => <input id={id} className={inputCls} value={draft.coach_or_place ?? ''} onChange={(e) => update({ coach_or_place: e.target.value })} />}</Field>
    <Field label={tx('Қысқаша түсініктеме')} hint={tx('Міндетті емес')}>{(id) => <textarea id={id} className={`${inputCls} h-24 py-2`} value={draft.note ?? ''} onChange={(e) => update({ note: e.target.value })} />}</Field>
    <Button block loading={busy} onClick={save}><Icon n="check" size={16} />{tx('Сақтау')}</Button>
  </div>
}

function RoadmapSection({
  studentId,
  roadmap,
  onUpdate,
  onOpenAdd,
}: {
  studentId: string
  roadmap: StudentRoadmap
  onUpdate: (r: StudentRoadmap) => void
  onOpenAdd?: (kind?: 'goal' | 'habit' | 'task') => void
}) {
  const [tab, setTab] = useState<'today' | 'all' | 'goals' | 'habits' | 'tasks' | 'archive'>('today')
  const [catFilter, setCatFilter] = useState<string>('all')
  const [newStepInputs, setNewStepInputs] = useState<Record<string, string>>({})
  const [editingGoal, setEditingGoal] = useState<RoadmapGoal | null>(null)
  const [editingHabit, setEditingHabit] = useState<RoadmapHabit | null>(null)
  const t = today()

  const goals = roadmap.goals ?? []
  const allHabits = roadmap.habits ?? []
  const archive = tab === 'archive'
  const habits = allHabits.filter((h) => archive ? h.archived : !h.archived)
  const tasks = roadmap.tasks ?? []

  const update = (fn: (prev: StudentRoadmap) => StudentRoadmap, lane?: 'goals' | 'habits' | 'tasks') => {
    const next = fn({
      goals: [...goals],
      habits: [...allHabits],
      tasks: [...tasks],
    })
    onUpdate(next)
    const save = lane ? patchStudentRoadmap(studentId, { [lane]: next[lane] }) : saveStudentRoadmap(studentId, next)
    save.catch((e) => toast(errText(e)))
  }

  const toggleGoal = (id: string) => {
    update((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
    }), 'goals')
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
    }), 'goals')
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
    }), 'goals')
    setNewStepInputs({ ...newStepInputs, [goalId]: '' })
  }

  const removeGoal = (id: string, title: string) => {
    if (!confirm(tx('«{0}» мақсатын өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      goals: prev.goals.filter((g) => g.id !== id),
    }), 'goals')
  }

  const toggleHabit = (id: string) => {
    update((prev) => ({
      ...prev,
      habits: prev.habits.map((h) => {
        if (h.id !== id) return h
        const checks = new Set(h.checks ?? [])
        if (checks.has(t)) checks.delete(t)
        else checks.add(t)
        return { ...h, checks: Array.from(checks) }
      }),
    }), 'habits')
  }

  const removeHabit = (id: string, title: string) => {
    const archived = allHabits.find((h) => h.id === id)?.archived ?? false
    if (!confirm(archived ? tx('«{0}» әдетін қайта белсендіресіз бе?', title) : tx('«{0}» әдетін архивке жібересіз бе? Сериясы сақталады.', title))) return
    update((prev) => ({
      ...prev,
      habits: prev.habits.map((h) => (h.id === id ? { ...h, archived: !archived } : h)),
    }), 'habits')
  }

  const toggleTask = (id: string) => {
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.map((tk) => (tk.id === id ? { ...tk, done: !tk.done } : tk)),
    }), 'tasks')
  }

  const removeTask = (id: string, title: string) => {
    if (!confirm(tx('«{0}» тапсырмасын өшіресіз бе?', title))) return
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((tk) => tk.id !== id),
    }), 'tasks')
  }

  const filterCat = (itemCat: string) => catFilter === 'all' || itemCat === catFilter

  // Done goals and tasks leave the working lists and live in «Архив», together with archived habits.
  const filteredGoals = goals.filter((g) => filterCat(g.category) && (archive ? g.done : !g.done))
  const filteredHabits = habits.filter((h) => filterCat(h.category) && (tab !== 'today' || habitDueOn(h, t)))
  const filteredTasks = tasks.filter((tk) => filterCat(tk.category) && (archive ? tk.done : !tk.done && (tab !== 'today' || !tk.due_on || tk.due_on <= t)))

  const totalVisible =
    (tab === 'today' || tab === 'all' || tab === 'goals' || archive ? filteredGoals.length : 0) +
    (tab === 'today' || tab === 'all' || tab === 'habits' || archive ? filteredHabits.length : 0) +
    (tab === 'today' || tab === 'all' || tab === 'tasks' || archive ? filteredTasks.length : 0)

  // Last 7 days for habit tracker
  const last7Days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6))
  const activeHabits = allHabits.filter((h) => !h.archived)
  const dueTodayHabits = activeHabits.filter((h) => habitDueOn(h, t))
  const doneTodayHabits = dueTodayHabits.filter((h) => (h.checks ?? []).includes(t))
  const bestCurrentStreak = activeHabits.reduce((best, h) => Math.max(best, habitCurrentStreak(h, t)), 0)

  return (
    <>
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
          <div className="flex flex-wrap items-center gap-1.5">
            <Button kind="secondary" onClick={() => onOpenAdd()}><Icon n="plus" size={16} />{tx('Жоспар құру')}</Button>
            <button type="button" onClick={() => onOpenAdd('goal')} className="h-9 px-2.5 rounded-md bg-accent-soft text-accent text-xs font-semibold inline-flex items-center gap-1.5"><Icon n="target" size={14} />{tx('Мақсат')}</button>
            <button type="button" onClick={() => onOpenAdd('habit')} className="h-9 px-2.5 rounded-md bg-success-soft text-success text-xs font-semibold inline-flex items-center gap-1.5"><Icon n="repeat" size={14} />{tx('Әдет')}</button>
          </div>
        )}
      </div>

      {/* KPI көрсеткіштері */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-1">
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Мақсаттар')}</span>
          <span className="text-lg font-bold tabular-nums text-accent">
            {goals.filter((g) => g.done).length} / {goals.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Бүгін')}</span>
          <span className="text-lg font-bold tabular-nums text-success">
            {doneTodayHabits.length} / {dueTodayHabits.length}
          </span>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5 text-center">
          <span className="block text-xs text-muted mb-0.5">{tx('Серия')}</span>
          <span className="text-lg font-bold tabular-nums text-warning">{bestCurrentStreak} {tx('күн')}</span>
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
          onClick={() => setTab('today')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'today' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          <Icon n="sun" size={14} /> {tx('Бүгін')}
        </button>
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
          <Icon n="target" size={14} /> {tx('Мақсаттар ({0})', goals.filter((g) => !g.done).length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('habits')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'habits' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          <Icon n="repeat" size={14} /> {tx('Әдеттер ({0})', habits.length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('tasks')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${tab === 'tasks' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          <Icon n="check" size={14} /> {tx('Тапсырмалар ({0})', tasks.filter((tk) => !tk.done).length)}
        </button>
        <button
          type="button"
          onClick={() => setTab('archive')}
          className={`px-3 py-1.5 rounded-full font-semibold transition ${archive ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
        >
          <Icon n="inbox" size={14} /> {tx('Архив ({0})', goals.filter((g) => g.done).length + tasks.filter((tk) => tk.done).length + allHabits.filter((h) => h.archived).length)}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {tx('Әдетті аз-аздан, бірақ тұрақты орындау маңызды. Бүгінгі бет тек керек қадамдарды көрсетеді.')}
        </p>
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
      {(tab === 'today' || tab === 'all' || tab === 'goals' || archive) && filteredGoals.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5"><Icon n="target" size={13} />{tx('Мақсаттар мен қадамдар')}</p>
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
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-accent"
                      aria-label={tx('Өзгерту')}
                    >
                      <Icon n="compose" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGoal(g.id, g.title)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={tx('Өшіру')}
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
                        <Icon n="target" size={12} /> {tx('Нәтиже:')} {g.metric}
                      </p>
                    )}
                    {g.why && <p className="text-xs text-muted mt-1">💡 {g.why}</p>}
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
                        <Icon n="repeat" size={12} /> {lh.title}
                      </span>
                    ))}
                    {linkedT.map((lt) => (
                      <span key={lt.id} className="px-2 py-0.5 rounded bg-surface-2 text-muted flex items-center gap-1">
                        <Icon n="check" size={12} /> {lt.title}
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
      {(tab === 'today' || tab === 'all' || tab === 'habits' || archive) && filteredHabits.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5"><Icon n="repeat" size={13} />{tx('Күнделікті әдеттер трекері')}</p>
          {filteredHabits.map((h) => {
            const cat = getCategoryMeta(h.category)
            const checks = new Set(h.checks ?? [])
            const isToday = checks.has(t)
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
                    <span className="px-2 py-0.5 rounded-full bg-surface-2 text-muted font-medium text-[11px]">
                      <Icon n={timeLabel.icon} size={12} /> {timeLabel.label}
                    </span>
                    <span className="text-muted text-[11px]">
                      {freqLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingHabit(h)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-accent"
                      aria-label={tx('Өзгерту')}
                    >
                      <Icon n="compose" size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHabit(h.id, h.title)}
                      className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={h.archived ? tx('Қайта белсендіру') : tx('Архивке жіберу')}
                    >
                      <Icon n={h.archived ? 'repeat' : 'archive'} size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-sm break-words flex-1">
                    {h.title}
                  </p>
                  {h.target_val && (
                    <span className="shrink-0 px-2 py-0.5 rounded bg-accent-soft text-accent font-bold text-xs">
                      <Icon n="flash" size={12} /> {h.target_val}
                    </span>
                  )}
                </div>

                {h.motivation && (
                  <p className="text-xs text-muted italic">
                    «{h.motivation}»
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span>{tx('Осы апта')}: <b className="text-fg">{habitWeekProgress(h, t).done}/{habitWeekProgress(h, t).total}</b></span>
                  <span className="inline-flex items-center gap-1"><Icon n="fire" size={12} />{habitCurrentStreak(h, t)} {tx('күндік серия')}</span>
                  {h.reminder_time && <span className="inline-flex items-center gap-1"><Icon n="clock" size={12} />{h.reminder_time.slice(0, 5)}</span>}
                </div>

                {/* 7 күндік визуалды трекер */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40">
                  <div className="flex items-center gap-1">
                    {last7Days.map((d) => {
                      const done = checks.has(d)
                      const isT = d === t
                      return (
                        <span
                          key={d}
                          title={fmtDate(d)}
                          className={`size-5 rounded-full grid place-items-center text-[10px] font-bold ${
                            done
                              ? 'bg-success text-white'
                              : isT
                              ? 'border-2 border-accent text-accent'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {done ? '✓' : ''}
                        </span>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleHabit(h.id)}
                    className={`h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1 transition ${
                      isToday
                        ? 'bg-success text-white'
                        : 'bg-accent-soft text-accent hover:bg-accent hover:text-on-accent'
                    }`}
                  >
                    <Icon n="check" size={14} />
                    {isToday ? tx('Бүгін жасалды') : tx('Бүгін белгілеу')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 3. Тапсырмалар (Tasks) */}
      {(tab === 'today' || tab === 'all' || tab === 'tasks' || archive) && filteredTasks.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5"><Icon n="check" size={13} />{tx('Нақты тапсырмалар')}</p>
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
                        <Icon n="flash" size={12} /> {prio.label}
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
                  <button
                    type="button"
                    onClick={() => removeTask(tk.id, tk.title)}
                    className="size-7 grid place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                    aria-label={tx('Өшіру')}
                  >
                    <Icon n="x" size={14} />
                  </button>
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
                        <Icon n="target" size={12} /> {linkedG.title}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
    {editingGoal && (
      <RoadmapGoalEditorSheet
        goal={editingGoal}
        onClose={() => setEditingGoal(null)}
        onSave={(next) => {
          update((prev) => ({ ...prev, goals: prev.goals.map((g) => (g.id === next.id ? next : g)) }), 'goals')
          setEditingGoal(null)
          toast(tx('Мақсат өзгертілді'))
        }}
      />
    )}
    {editingHabit && (
      <RoadmapHabitEditorSheet
        habit={editingHabit}
        goals={goals}
        onClose={() => setEditingHabit(null)}
        onSave={(next) => {
          update((prev) => ({ ...prev, habits: prev.habits.map((h) => (h.id === next.id ? next : h)) }), 'habits')
          setEditingHabit(null)
          toast(tx('Әдет өзгертілді'))
        }}
      />
    )}
    </>
  )
}

function RoadmapGoalEditorSheet({
  goal,
  onClose,
  onSave,
}: {
  goal: RoadmapGoal
  onClose: () => void
  onSave: (goal: RoadmapGoal) => void
}) {
  const [category, setCategory] = useState<PlanCategory>(goal.category)
  const [title, setTitle] = useState(goal.title)
  const [metric, setMetric] = useState(goal.metric ?? '')
  const [why, setWhy] = useState(goal.why ?? '')
  const [dueOn, setDueOn] = useState(goal.due_on ?? '')
  const [priority, setPriority] = useState<'high' | 'medium' | 'normal'>(goal.priority ?? 'normal')
  const [steps, setSteps] = useState<RoadmapGoal['steps']>(goal.steps ?? [])

  const save = () => {
    if (title.trim().length < 2) return toast(tx('Мақсат атауын жазыңыз'))
    onSave({
      ...goal,
      title: title.trim(),
      category,
      metric: metric.trim() || undefined,
      why: why.trim() || undefined,
      due_on: dueOn || null,
      priority,
      steps: steps.filter((s) => s.title.trim().length > 0).map((s) => ({ ...s, title: s.title.trim() })),
    })
  }

  return (
    <Sheet title={tx('Мақсатты өзгерту')} onClose={onClose}>
      <div className="grid gap-4">
        <Field label={tx('Бағыты')}>
          {() => (
            <div className="flex gap-1.5 flex-wrap">
              {PLAN_CATEGORIES.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${category === c.id ? `${c.bg} ${c.color} ring-2 ring-accent` : 'bg-surface-2 text-muted'}`}>
                  <Icon n={c.icon} size={12} />{c.label}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label={tx('Мақсат атауы')}>
          {(id) => <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />}
        </Field>
        <Field label={tx('Күтілетін нәтиже / өлшем')} hint={tx('Нәтиже өлшенетін болса, тұрақты орындау жеңілдейді.') }>
          {(id, describedBy) => <input id={id} aria-describedby={describedBy} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder={tx('Мысалы: БЖБ-дан 17 балл')} className={inputCls} />}
        </Field>
        <Field label={tx('Неге бұл маңызды?')}>
          {(id) => <textarea id={id} value={why} onChange={(e) => setWhy(e.target.value)} rows={2} className={`${inputCls} h-auto py-3 resize-y`} placeholder={tx('Өзіңе қысқа себеп жаз')} />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx('Мерзімі')}>
            {(id) => <input id={id} type="date" value={dueOn} min={today()} onChange={(e) => setDueOn(e.target.value)} className={inputCls} />}
          </Field>
          <Field label={tx('Басымдығы')}>
            {(id) => <select id={id} value={priority} onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'normal')} className={inputCls}><option value="high">{tx('Жоғары')}</option><option value="medium">{tx('Орташа')}</option><option value="normal">{tx('Қалыпты')}</option></select>}
          </Field>
        </div>
        <div className="grid gap-2 border-t border-line pt-3">
          <p className="font-semibold text-xs text-muted uppercase tracking-wider">{tx('Қадамдар')}</p>
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-2 items-center">
              <input value={step.title} onChange={(e) => setSteps(steps.map((s) => s.id === step.id ? { ...s, title: e.target.value } : s))} className={`${inputCls} text-sm flex-1`} placeholder={tx('{0}-қадам', i + 1)} />
              <button type="button" onClick={() => setSteps(steps.filter((s) => s.id !== step.id))} className="size-10 grid place-items-center rounded-md bg-surface-2 text-muted hover:text-danger" aria-label={tx('Қадамды өшіру')}><Icon n="x" size={15} /></button>
            </div>
          ))}
          <Button kind="secondary" onClick={() => setSteps([...steps, { id: `s_${Date.now()}`, title: '', done: false }])}><Icon n="plus" size={15} />{tx('Қадам қосу')}</Button>
        </div>
        <Button onClick={save}>{tx('Сақтау')}</Button>
      </div>
    </Sheet>
  )
}

function RoadmapHabitEditorSheet({
  habit,
  goals,
  onClose,
  onSave,
}: {
  habit: RoadmapHabit
  goals: RoadmapGoal[]
  onClose: () => void
  onSave: (habit: RoadmapHabit) => void
}) {
  const initialDays = habit.days_of_week ?? (habit.frequency === 'weekdays' ? [1, 2, 3, 4, 5] : habit.frequency === '3x_week' ? [1, 3, 5] : [])
  const [category, setCategory] = useState<PlanCategory>(habit.category)
  const [title, setTitle] = useState(habit.title)
  const [target, setTarget] = useState(habit.target_val ?? '')
  const [timeOfDay, setTimeOfDay] = useState<NonNullable<RoadmapHabit['time_of_day']>>(habit.time_of_day ?? 'any')
  const [frequency, setFrequency] = useState<HabitFrequency>(habit.frequency ?? 'daily')
  const [days, setDays] = useState<number[]>(initialDays)
  const [targetPerWeek, setTargetPerWeek] = useState(String(habit.target_per_week ?? (habit.frequency === '3x_week' ? 3 : habit.frequency === 'weekdays' ? 5 : 7)))
  const [reminderTime, setReminderTime] = useState(habit.reminder_time ?? '')
  const [motivation, setMotivation] = useState(habit.motivation ?? '')
  const [goalId, setGoalId] = useState(habit.goal_id ?? '')

  const toggleDay = (day: number) => setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b))
  const save = () => {
    if (title.trim().length < 2) return toast(tx('Әдет атауын жазыңыз'))
    const selectedDays = frequency === 'weekdays' ? [1, 2, 3, 4, 5] : frequency === '3x_week' && days.length === 0 ? [1, 3, 5] : days
    onSave({
      ...habit,
      title: title.trim(),
      category,
      target_val: target.trim() || undefined,
      time_of_day: timeOfDay,
      frequency,
      days_of_week: frequency === 'daily' ? undefined : selectedDays,
      target_per_week: Math.max(1, Math.min(7, Number(targetPerWeek) || 1)),
      reminder_time: reminderTime || null,
      motivation: motivation.trim() || undefined,
      goal_id: goalId || null,
    })
  }

  return (
    <Sheet title={tx('Әдетті өзгерту')} onClose={onClose}>
      <div className="grid gap-4">
        <Field label={tx('Бағыты')}>
          {() => <div className="flex gap-1.5 flex-wrap">{PLAN_CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${category === c.id ? `${c.bg} ${c.color} ring-2 ring-accent` : 'bg-surface-2 text-muted'}`}><Icon n={c.icon} size={12} />{c.label}</button>)}</div>}
        </Field>
        <Field label={tx('Әдет атауы')}>
          {(id) => <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx('Күнделікті мөлшері')} hint={tx('Мысалы: 20 бет, 30 минут')}>
            {(id, describedBy) => <input id={id} aria-describedby={describedBy} value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />}
          </Field>
          <Field label={tx('Еске салу уақыты')}>
            {(id) => <input id={id} type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className={inputCls} />}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx('Қай уақытта')}>
            {(id) => <select id={id} value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value as NonNullable<RoadmapHabit['time_of_day']>)} className={inputCls}>{(Object.entries(TIME_OF_DAY_LABELS) as [NonNullable<RoadmapHabit['time_of_day']>, { label: string; icon: string }][]).map(([key, val]) => <option key={key} value={key}>{val.icon} {val.label}</option>)}</select>}
          </Field>
          <Field label={tx('Жиілігі')}>
            {(id) => <select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as HabitFrequency)} className={inputCls}>{(Object.entries(FREQUENCY_LABELS) as [HabitFrequency, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
          </Field>
        </div>
        {frequency !== 'daily' && (
          <div className="grid gap-2">
            <p className="text-sm font-semibold">{tx('Орындайтын күндер')}</p>
            <div className="grid grid-cols-7 gap-1">
              {['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс'].map((label, i) => <button key={label} type="button" onClick={() => toggleDay(i + 1)} className={`h-9 rounded-md text-xs font-semibold ${days.includes(i + 1) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}>{label}</button>)}
            </div>
            <p className="text-xs text-muted">{tx('Аптасына мақсат')}: <input type="number" min={1} max={7} value={targetPerWeek} onChange={(e) => setTargetPerWeek(e.target.value)} className="w-14 h-8 rounded-md border border-input bg-surface px-2 text-center" /> {tx('рет')}</p>
          </div>
        )}
        {goals.length > 0 && <Field label={tx('Қай мақсатқа байланысты?')}>
          {(id) => <select id={id} value={goalId} onChange={(e) => setGoalId(e.target.value)} className={inputCls}><option value="">{tx('Байланыстырмау')}</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
        </Field>}
        <Field label={tx('Неге бұл маңызды?')}>
          {(id) => <textarea id={id} value={motivation} onChange={(e) => setMotivation(e.target.value)} rows={2} className={`${inputCls} h-auto py-3 resize-y`} placeholder={tx('Өзіңе қысқа себеп жаз')} />}
        </Field>
        <Button onClick={save}>{tx('Сақтау')}</Button>
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
  initialTab = 'presets',
  onClose,
  onDone,
}: {
  student: { id: string; class_id: string; full_name: string }
  currentRoadmap: StudentRoadmap
  meetings: MentorMeeting[]
  initialTab?: 'presets' | 'goal' | 'habit' | 'task'
  onClose: () => void
  onDone: (r: StudentRoadmap) => void
}) {
  const [tab, setTab] = useState<'presets' | 'goal' | 'habit' | 'task'>(initialTab)
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
  const [habitFreq, setHabitFreq] = useState<HabitFrequency>('daily')
  const [habitDays, setHabitDays] = useState<number[]>([1, 3, 5])
  const [habitReminderTime, setHabitReminderTime] = useState('')
  const [habitTargetPerWeek, setHabitTargetPerWeek] = useState('7')
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
        days_of_week: habitFreq === 'daily' ? undefined : habitFreq === 'weekdays' ? [1, 2, 3, 4, 5] : habitDays,
        target_per_week: Math.max(1, Math.min(7, Number(habitTargetPerWeek) || (habitFreq === '3x_week' ? 3 : 7))),
        reminder_time: habitReminderTime || null,
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
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1 text-xs text-center font-semibold [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => { setTab('presets'); setSelectedPreset(null) }}
            className={`min-w-[8.5rem] py-2 px-2 rounded-md transition ${tab === 'presets' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            <Icon n="star" size={14} /> {tx('Дайын үлгілер')}
          </button>
          <button
            type="button"
            onClick={() => setTab('goal')}
            className={`min-w-[5rem] py-2 px-2 rounded-md transition ${tab === 'goal' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            <Icon n="target" size={14} /> {tx('Мақсат')}
          </button>
          <button
            type="button"
            onClick={() => setTab('habit')}
            className={`min-w-[5rem] py-2 px-2 rounded-md transition ${tab === 'habit' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            <Icon n="repeat" size={14} /> {tx('Әдет')}
          </button>
          <button
            type="button"
            onClick={() => setTab('task')}
            className={`min-w-[6rem] py-2 px-2 rounded-md transition ${tab === 'task' ? 'bg-surface shadow text-accent' : 'text-muted'}`}
          >
            <Icon n="check" size={14} /> {tx('Тапсырма')}
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
                      <p className="font-semibold text-foreground flex items-center gap-1.5"><Icon n="target" size={13} />{p.goal.title}</p>
                      <p className="text-accent text-[11px] font-medium flex items-center gap-1.5"><Icon n="check" size={12} />{tx('Нәтиже:')} {p.goal.metric}</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        {p.habits.map((h, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface text-muted text-[11px]">
                            <Icon n="repeat" size={11} /> {h.title} ({h.target_val})
                          </span>
                        ))}
                        {p.tasks.map((tk, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-surface text-muted text-[11px]">
                            <Icon n="check" size={11} /> {tk.title}
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
                      ['morning', tx('Таңертең')],
                      ['evening', tx('Кешке')],
                      ['any', tx('Кез келген')],
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
                  onChange={(v) => {
                    const next = v as HabitFrequency
                    setHabitFreq(next)
                    if (next === '3x_week') setHabitTargetPerWeek('3')
                    if (next === 'weekdays') setHabitTargetPerWeek('5')
                    if (next === 'daily') setHabitTargetPerWeek('7')
                  }}
                  items={[
                    ['daily', tx('Күн сайын')],
                    ['weekdays', tx('Дс-Жм')],
                    ['3x_week', tx('Аптасына 3 рет')],
                    ['custom', tx('Өз күндерім')],
                  ]}
                />
              )}
            </Field>

            {habitFreq !== 'daily' && (
              <div className="grid gap-2 rounded-lg bg-surface-2 p-3">
                <p className="text-sm font-semibold">{tx('Қай күндері орындау?')}</p>
                <div className="grid grid-cols-7 gap-1">
                  {['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс'].map((label, i) => (
                    <button key={label} type="button" onClick={() => setHabitDays(habitDays.includes(i + 1) ? habitDays.filter((d) => d !== i + 1) : [...habitDays, i + 1].sort((a, b) => a - b))} className={`h-9 rounded-md text-xs font-semibold ${habitDays.includes(i + 1) ? 'bg-accent text-on-accent' : 'bg-surface text-muted'}`}>{label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={tx('Апталық мақсат')}>
                    {(id) => <input id={id} type="number" min={1} max={7} value={habitTargetPerWeek} onChange={(e) => setHabitTargetPerWeek(e.target.value)} className={inputCls} />}
                  </Field>
                  <Field label={tx('Еске салу уақыты')}>
                    {(id) => <input id={id} type="time" value={habitReminderTime} onChange={(e) => setHabitReminderTime(e.target.value)} className={inputCls} />}
                  </Field>
                </div>
              </div>
            )}

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
                      <option key={g.id} value={g.id}>{g.title}</option>
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
                      ['high', tx('Шұғыл')],
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
                      <option key={g.id} value={g.id}>{g.title}</option>
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
