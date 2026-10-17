import { createClient } from '@supabase/supabase-js'
import type { Extra, TimeSlot } from './time'
import { tx, type Lang } from './i18n'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)

export type Role = 'student' | 'teacher' | 'class_teacher' | 'deputy' | 'admin'
export type ActivityType = 'olympiad_prep' | 'club' | 'course' | 'event' | 'competition' | 'tournament' | 'challenge'
export type ActivityStatus = 'pending_class_teacher' | 'pending_deputy' | 'approved' | 'rejected' | 'cancelled'
export type Feature = 'chat' | 'syllabus' | 'schedule' | 'tasks' | 'attendance'
export type Mark = 'present' | 'late' | 'excused' | 'absent'

export type Me = { id: string; full_name: string; role: Role; title: string | null; school_id: string; parliament: boolean; photo: string | null; lang: Lang | null
  class: { id: string; name: string; grade: number; teacher_id: string | null } | null; school: { name: string } }

/** importance: 1 орташа, 2 маңызды, 3 өте маңызды */
export type SessionType = { id: string; name: string; importance: 1 | 2 | 3 }

export type Activity = {
  id: string; type: ActivityType; title: string; description: string; place: string; status: ActivityStatus
  audience_grades: number[]; capacity: number | null; schedule: 'once' | 'weekly'
  on_date: string | null; weekdays: number[] | null; date_from: string | null; date_to: string | null
  start_time: string; end_time: string; author_id: string; supervisor_id: string; curator_id: string | null; created_at: string
  curators: { student_id: string; student: { full_name: string; photo: string | null; class: { name: string } | null } }[]
  features: Feature[]; enrollment_open: boolean; archived_at: string | null
  slots: TimeSlot[] | null; extra: Extra[]
  default_type_id: string | null; types: SessionType[]; tg_chat_title: string | null
  author: { full_name: string; class: { name: string; teacher_id: string | null } | null }
  supervisor: { full_name: string }
  enrollments: { student_id: string; waitlisted: boolean }[]
}

export type ActivityFull = Omit<Activity, 'enrollments'> & {
  approvals: { id: number; step: ActivityStatus; decision: string; comment: string | null; created_at: string; actor: { full_name: string } }[]
  enrollments: { student_id: string; waitlisted: boolean; created_at: string; student: { full_name: string; photo: string | null; class: { name: string } | null } }[]
}

// Postgres errors raised by our RPCs are already in Kazakh; map the few the database itself produces.
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (m.includes('Invalid login credentials')) return tx('ЖСН немесе құпия сөз қате')
  if (m.includes('check constraint')) return tx('Өрістерді тексеріңіз: кейбір мәндер тым қысқа немесе қате')
  if (m.includes('Failed to fetch')) return tx('Интернет байланысын тексеріңіз')
  if (m.includes('duplicate key')) return tx('Мұндай жазба бұрыннан бар')
  return tx(m)   // our RPCs raise Kazakh text, which is a dictionary key
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ok<T = any>(p: PromiseLike<{ data: any; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(errText(error))
  return data
}

export const emailFor = (iin: string) => `${iin}@users.lyceum-life.app`

export const signIn = (iin: string, password: string) =>
  ok(supabase.auth.signInWithPassword({ email: emailFor(iin.trim()), password }))
export const signOut = () => supabase.auth.signOut()

export const getMe = (id: string) =>
  ok(supabase.from('profiles').select('id, full_name, role, title, school_id, parliament, photo, lang, class:classes!class_id(id, name, grade, teacher_id), school:schools(name)')
    .eq('id', id).single()) as unknown as Promise<Me>

const ACT = 'id, type, title, description, place, status, audience_grades, capacity, schedule, on_date, weekdays, date_from, date_to, start_time, end_time, author_id, supervisor_id, curator_id, created_at, features, enrollment_open, archived_at, slots, default_type_id, tg_chat_title, extra:activity_sessions!activity_sessions_activity_id_fkey(id, on_date, start_time, end_time, note, type_id, series_id), types:activity_session_types!activity_session_types_activity_id_fkey(id, name, importance), author:profiles!author_id(full_name, class:classes!class_id(name, teacher_id)), supervisor:profiles!supervisor_id(full_name), curators:activity_curators(student_id, student:profiles!student_id(full_name, photo, class:classes!class_id(name))), enrollments(student_id, waitlisted)'

export const listActivities = () =>
  ok(supabase.from('activities').select(ACT).order('created_at', { ascending: false })) as unknown as Promise<Activity[]>

export const getActivity = (id: string) =>
  ok(supabase.from('activities').select(ACT.replace('enrollments(student_id, waitlisted)',
    'enrollments(student_id, waitlisted, created_at, student:profiles!student_id(full_name, photo, class:classes!class_id(name))), approvals(id, step, decision, comment, created_at, actor:profiles!actor_id(full_name))'))
    .eq('id', id).single()) as unknown as Promise<ActivityFull>

export const listStaff = () =>
  ok(supabase.from('profiles').select('id, full_name, title, role').neq('role', 'student').order('full_name')) as Promise<{ id: string; full_name: string; title: string | null; role: Role }[]>

export const listClasses = () =>
  ok(supabase.from('classes').select('id, name, grade, teacher_id, tutor_id').order('grade').order('name')) as Promise<{ id: string; name: string; grade: number; teacher_id: string | null; tutor_id: string | null }[]>

export type MarkRow = { status: Mark; late_min?: number | null; excuse?: 'sick' | 'other' | null }
export const getAttendance = (activityId: string, date: string) =>
  ok(supabase.from('attendance').select('student_id, status, late_min, excuse').eq('activity_id', activityId).eq('session_date', date)) as Promise<({ student_id: string } & MarkRow)[]>

export const myAttendance = (me: string) =>
  ok(supabase.from('attendance').select('activity_id, session_date, status, activity:activities(title)').eq('student_id', me)
    .order('session_date', { ascending: false })) as unknown as Promise<{ activity_id: string; session_date: string; status: Mark; activity: { title: string } }[]>

export type AbsenceRequest = { id: string; student_id: string; activity_id: string; session_date: string; category: string; reason: string
  status: 'pending' | 'approved' | 'rejected'; decision_note: string | null; student: { full_name: string } }
export const listRequests = (activityId?: string) => {
  let q = supabase.from('absence_requests').select('id, student_id, activity_id, session_date, category, reason, status, decision_note, student:profiles!student_id(full_name)').order('created_at', { ascending: false })
  if (activityId) q = q.eq('activity_id', activityId)
  return ok(q) as unknown as Promise<AbsenceRequest[]>
}

export type Notice = { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export const listNotifications = () =>
  ok(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) as Promise<Notice[]>
export const unreadCount = async () =>
  (await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)).count ?? 0

const rpc = <T,>(fn: string, args: Record<string, unknown>) => ok(supabase.rpc(fn, args)) as Promise<T>
export const submitActivity = (p: Record<string, unknown>, id?: string) => rpc<string>('submit_activity', { p, p_id: id ?? null })
export const decideActivity = (id: string, approve: boolean, comment?: string) => rpc('decide_activity', { p_id: id, p_approve: approve, p_comment: comment ?? null })
export const cancelActivity = (id: string, reason: string) => rpc('cancel_activity', { p_id: id, p_reason: reason })
export const joinActivity = (id: string) => rpc<boolean>('join_activity', { p_id: id })
// leave_activity also moves the first waitlisted student in and notifies them
export const leaveActivity = (id: string) => rpc('leave_activity', { p_id: id })
export const markAttendance = (id: string, date: string, rows: ({ student_id: string } & MarkRow)[]) =>
  rpc<number>('mark_attendance', { p_id: id, p_date: date, p_rows: rows })
export const requestAbsence = (activity: string, date: string, category: string, reason: string) =>
  rpc('request_absence', { p_activity: activity, p_date: date, p_category: category, p_reason: reason })
export const decideAbsence = (id: string, approve: boolean, note?: string) => rpc('decide_absence', { p_id: id, p_approve: approve, p_note: note ?? null })
export const markRead = () => rpc('mark_notifications_read', {})
export const attendanceRate = (student: string) => rpc<number | null>('attendance_rate', { p_student: student })

async function adminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    const msg = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(msg?.error ?? errText(error))
  }
  return data as T
}

/* ---------- self sign-up: a pending account until an admin or the class teacher approves ---------- */
export const signupOptions = () => adminUsers<{ schools: { id: string; name: string }[]; classes: { id: string; name: string; school_id: string }[] }>({ action: 'schools' })
export const registerAccount = (b: { iin: string; password: string; full_name: string; role: 'student' | 'teacher'; school_id: string; class_id?: string; title?: string }) =>
  adminUsers<{ ok: boolean }>({ action: 'register', ...b })
export type Registration = { user_id: string; full_name: string; role: 'student' | 'teacher'; title: string | null; status: 'pending' | 'approved' | 'rejected'; note: string | null; created_at: string; class: { name: string } | null }
const REG = 'user_id, full_name, role, title, status, note, created_at, class:classes(name)'
export const myRegistration = (uid: string) => ok(supabase.from('registrations').select(REG).eq('user_id', uid).maybeSingle()) as unknown as Promise<Registration | null>
export const listRegistrations = () => ok(supabase.from('registrations').select(REG).eq('status', 'pending').order('created_at')) as unknown as Promise<Registration[]>
export const decideRegistration = (id: string, approve: boolean, note?: string) => rpc('decide_registration', { p_user: id, p_approve: approve, p_note: note ?? null })

export async function addUser(body: { full_name: string; iin: string; role: Role; class_id?: string; title?: string }) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'create', ...body } })
  if (error) {
    const msg = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(msg?.error ?? errText(error))
  }
  return data as { full_name: string; iin: string; password: string }
}

/* ---------- booking ---------- */
export type Resource = { id: string; group_id: string; name: string; capacity: number | null; manager_id: string; slot_minutes: number
  open_from: string; open_to: string; active: boolean; manager: { full_name: string } }
export type Group = { id: string; name: string; sort: number }
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type Booking = { id: string; code: string; resource_id: string; user_id: string; on_date: string; start_time: string; end_time: string
  purpose: string; status: BookingStatus; note: string | null; created_at: string
  user: { full_name: string }; resource: { name: string; manager_id: string; group: { name: string } } }

export const listGroups = () => ok(supabase.from('resource_groups').select('id, name, sort').order('sort').order('name')) as Promise<Group[]>
export const listResources = () =>
  ok(supabase.from('resources').select('id, group_id, name, capacity, manager_id, slot_minutes, open_from, open_to, active, manager:profiles!manager_id(full_name)').order('name')) as unknown as Promise<Resource[]>
const BOOK = 'id, code, resource_id, user_id, on_date, start_time, end_time, purpose, status, note, created_at, user:profiles!user_id(full_name), resource:resources(name, manager_id, group:resource_groups(name))'
export const bookingsFor = (resource: string, date: string) =>
  ok(supabase.from('bookings').select(BOOK).eq('resource_id', resource).eq('on_date', date).in('status', ['pending', 'approved'])) as unknown as Promise<Booking[]>
export const listBookings = (filter: { user?: string; from?: string }) => {
  let q = supabase.from('bookings').select(BOOK).order('on_date', { ascending: false }).order('start_time').limit(200)
  if (filter.user) q = q.eq('user_id', filter.user)
  if (filter.from) q = q.gte('on_date', filter.from)
  return ok(q) as unknown as Promise<Booking[]>
}
export const createBooking = (resource: string, date: string, start: string, end: string, purpose: string) =>
  rpc<string>('create_booking', { p_resource: resource, p_date: date, p_start: start, p_end: end, p_purpose: purpose })
export const decideBooking = (id: string, approve: boolean, note?: string) => rpc('decide_booking', { p_id: id, p_approve: approve, p_note: note ?? null })
export const cancelBooking = (id: string) => rpc('cancel_booking', { p_id: id })
export const updateResource = (id: string, slot: number, from: string, to: string, active: boolean) =>
  rpc('update_resource', { p_id: id, p_slot: slot, p_from: from, p_to: to, p_active: active })
export const createResource = (group: string, name: string, manager: string, capacity: number | null) =>
  rpc<string>('create_resource', { p_group: group, p_name: name, p_manager: manager, p_capacity: capacity })

/* ---------- leave ---------- */
export type LeaveStatus = 'pending_class_teacher' | 'pending_deputy' | 'pending_teacher' | 'approved' | 'rejected' | 'cancelled'
export type Leave = { id: string; code: string; student_id: string; kind: 'outside' | 'lesson'; starts_at: string; ends_at: string; category: string
  reason: string; teacher_id: string | null; class_teacher_id: string | null; status: LeaveStatus; ct_opinion: boolean | null; ct_note: string | null
  escalated: boolean; assigned_deputy: string | null; deadline_at: string | null; decision_note: string | null; created_at: string
  student: { full_name: string; class: { name: string } | null }; teacher: { full_name: string } | null; decider: { full_name: string } | null }
const LEAVE = '*, student:profiles!student_id(full_name, class:classes!class_id(name)), teacher:profiles!teacher_id(full_name), decider:profiles!decided_by(full_name)'
export const listLeaves = (filter: { student?: string; since?: string; until?: string; pending?: boolean }) => {
  let q = supabase.from('leave_requests').select(LEAVE).order('created_at', { ascending: false }).limit(200)
  if (filter.student) q = q.eq('student_id', filter.student)
  if (filter.since) q = q.gte('ends_at', filter.since)
  if (filter.until) q = q.lte('starts_at', filter.until)
  if (filter.pending) q = q.like('status', 'pending%')
  return ok(q) as unknown as Promise<Leave[]>
}
export const createLeave = (kind: 'outside' | 'lesson', starts: string, ends: string, category: string, reason: string, teacher?: string) =>
  rpc<string>('create_leave', { p_kind: kind, p_starts: starts, p_ends: ends, p_category: category, p_reason: reason, p_teacher: teacher ?? null })
export const decideLeave = (id: string, approve: boolean, note?: string) => rpc<LeaveStatus>('decide_leave', { p_id: id, p_approve: approve, p_note: note ?? null })
export const cancelLeave = (id: string) => rpc('cancel_leave', { p_id: id })
export const verifyCode = (code: string) => rpc<Record<string, string | boolean> | null>('verify_code', { p_code: code })
export const listDuty = () => ok(supabase.from('duty_roster').select('weekday, deputy_id, class_id')) as Promise<{ weekday: number; deputy_id: string | null; class_id: string | null }[]>
export const setDutyClass = (weekday: number, classId: string | null) => rpc('set_duty_class', { p_weekday: weekday, p_class: classId })
export const setDuty = (weekday: number, deputy: string | null) => rpc('set_duty', { p_weekday: weekday, p_deputy: deputy })
export const setCurators = (activity: string, students: string[]) => rpc('set_curators', { p_activity: activity, p_students: students })
export const setCurator = (activity: string, student: string | null) => setCurators(activity, student ? [student] : [])

/* ---------- calendars ---------- */
export type CalKind = 'personal' | 'class' | 'school' | 'olympiad'
export type Calendar = { id: string; kind: CalKind; name: string; color: string; class_id: string | null; owner_id: string | null }
export type CalEvent = { id: string; calendar_id: string; title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null; notes: string | null; responsible_name: string | null }
export type Lesson = { id: string; class_id: string; weekday: number; start_time: string; end_time: string; subject: string; teacher_id: string | null; teacher_name: string | null; room: string | null
  teacher: { full_name: string } | null; class: { name: string } }

export const ensureCalendars = () => rpc('ensure_calendars', {})
export const listCalendars = () => ok(supabase.from('calendars').select('id, kind, name, color, class_id, owner_id').order('kind')) as Promise<Calendar[]>
export const listEvents = (from: string, to: string) =>
  ok(supabase.from('calendar_events').select('id, calendar_id, title, starts_at, ends_at, all_day, location, notes, responsible_name').lt('starts_at', to).gt('ends_at', from).order('starts_at')) as Promise<CalEvent[]>
export const addEvents = async (rows: { calendar_id: string; title: string; starts_at: string; ends_at: string; all_day?: boolean; location?: string | null; notes?: string | null; responsible_name?: string | null; import_uid?: string }[]) => {
  const manual = rows.filter((r) => !r.import_uid)
  const imported = rows.filter((r) => !!r.import_uid)
  const [inserted, deduplicated] = await Promise.all([
    manual.length
      ? ok(supabase.from('calendar_events').insert(manual).select('id')) as Promise<{ id: string }[]>
      : Promise.resolve([] as { id: string }[]),
    imported.length
      ? ok(supabase.from('calendar_events').upsert(imported, { onConflict: 'calendar_id,import_uid', ignoreDuplicates: true }).select('id')) as Promise<{ id: string }[]>
      : Promise.resolve([] as { id: string }[]),
  ])
  return [...inserted, ...deduplicated]
}
export const removeEvent = (id: string) => ok(supabase.from('calendar_events').delete().eq('id', id))
export const listHidden = async () => ((await ok(supabase.from('calendar_hidden').select('cal_key'))) as { cal_key: string }[]).map((r) => r.cal_key)
export const setHidden = (key: string, hidden: boolean) =>
  hidden ? ok(supabase.from('calendar_hidden').upsert({ cal_key: key })) : ok(supabase.from('calendar_hidden').delete().eq('cal_key', key))
export const canEditCalendar = (id: string) => rpc<boolean>('can_edit_calendar', { p_cal: id })


/* ---------- timetable & syllabus ---------- */
const LESSON = 'id, class_id, weekday, start_time, end_time, subject, teacher_id, teacher_name, room, teacher:profiles!teacher_id(full_name), class:classes(name)'
export const listLessons = (f: { classId?: string; teacher?: string }) => {
  let q = supabase.from('timetable').select(LESSON).order('weekday').order('start_time')
  if (f.classId) q = q.eq('class_id', f.classId)
  if (f.teacher) q = q.eq('teacher_id', f.teacher)
  return ok(q) as unknown as Promise<Lesson[]>
}
export const addLesson = (row: { class_id: string; weekday: number; start_time: string; end_time: string; subject: string; teacher_id: string | null; room: string | null }) =>
  ok(supabase.from('timetable').insert(row))
export const removeLesson = (id: string) => ok(supabase.from('timetable').delete().eq('id', id))

export type Topic = { id: string; activity_id: string; sort: number; title: string; body: string | null; problems: string | null }
export const listTopics = (activityIds: string[]) =>
  ok(supabase.from('activity_topics').select('*').in('activity_id', activityIds).order('sort')) as Promise<Topic[]>
export const addTopic = (row: Omit<Topic, 'id'>) => ok(supabase.from('activity_topics').insert(row))
export const removeTopic = (id: string) => ok(supabase.from('activity_topics').delete().eq('id', id))
export const myProgress = async (me: string) => ((await ok(supabase.from('topic_progress').select('topic_id').eq('student_id', me))) as { topic_id: string }[]).map((r) => r.topic_id)
export const setProgress = (topic: string, done: boolean) =>
  done ? ok(supabase.from('topic_progress').upsert({ topic_id: topic })) : ok(supabase.from('topic_progress').delete().eq('topic_id', topic))

export type TeacherDuty = { id: string; weekday: number; user_id: string; post: string; user: { full_name: string } }
export const listTeacherDuty = () =>
  ok(supabase.from('teacher_duty').select('id, weekday, user_id, post, user:profiles!user_id(full_name)').order('weekday').order('post')) as unknown as Promise<TeacherDuty[]>
export const addTeacherDuty = (weekday: number, user_id: string, post: string) => ok(supabase.from('teacher_duty').insert({ weekday, user_id, post }))
export const removeTeacherDuty = (id: string) => ok(supabase.from('teacher_duty').delete().eq('id', id))

/* ---------- chats ---------- */
export type ChatKind = 'activity' | 'class' | 'channel' | 'direct'
export type ChatRow = { id: string; kind: ChatKind; title: string; locked: boolean; last_body: string | null; last_at: string; last_author: string | null; unread: number }
export type ChatInfo = { id: string; kind: ChatKind; title: string; locked: boolean; pinned_id: number | null; activity_id: string | null
  audience: string | null; moderator: boolean; can_post: boolean; members: number }
export type Message = { id: number; chat_id: string; author_id: string; body: string; poll: { options: string[] } | null; created_at: string
  removed_at: string | null; author: { full_name: string; role: Role } }
export type Person = { id: string; full_name: string; role: Role; class_name: string | null }

export const ensureChats = () => rpc('ensure_chats', {})
export const myChats = () => rpc<ChatRow[]>('my_chats', {})
export const chatInfo = (id: string) => rpc<ChatInfo | null>('chat_info', { p_chat: id })
export const chatPeople = (id: string) => rpc<Person[]>('chat_people', { p_chat: id })
export const listMessages = (chat: string) =>
  ok(supabase.from('messages').select('id, chat_id, author_id, body, poll, created_at, removed_at, author:profiles!author_id(full_name, role)')
    .eq('chat_id', chat).order('id', { ascending: false }).limit(200)).then((r) => (r as Message[]).reverse())
export const listVotes = (ids: number[]) =>
  ok(supabase.from('poll_votes').select('message_id, user_id, option').in('message_id', ids)) as Promise<{ message_id: number; user_id: string; option: number }[]>
export const sendMessage = (chat: string, body: string, poll?: { options: string[] }) => rpc<number>('send_message', { p_chat: chat, p_body: body, p_poll: poll ?? null })
export const readChat = (chat: string) => rpc('read_chat', { p_chat: chat })
export const messageReaders = (msg: number) => rpc<{ full_name: string; class_name: string | null; read_at: string | null }[]>('message_readers', { p_msg: msg })
export const openDirect = (user: string) => rpc<string>('open_direct', { p_user: user })
export const createChannel = (title: string, audience: string, classId?: string) => rpc<string>('create_channel', { p_title: title, p_audience: audience, p_class: classId ?? null })
export const setChatLocked = (chat: string, locked: boolean) => rpc('set_chat_locked', { p_chat: chat, p_locked: locked })
export const pinMessage = (chat: string, msg: number | null) => rpc('pin_message', { p_chat: chat, p_msg: msg })
export const removeMessage = (msg: number) => rpc('remove_message', { p_msg: msg })
export const votePoll = (msg: number, option: number) => rpc('vote_poll', { p_msg: msg, p_option: option })
export const reportMessage = (msg: number, reason: string) => rpc('report_message', { p_msg: msg, p_reason: reason })
export type Report = { id: number; message_id: number | null; body: string; reason: string; created_at: string; resolved_at: string | null; removed: boolean
  reporter: { full_name: string }; author: { full_name: string; class: { name: string } | null } }
export const listReports = () =>
  ok(supabase.from('chat_reports').select('id, message_id, body, reason, created_at, resolved_at, removed, reporter:profiles!reporter_id(full_name), author:profiles!author_id(full_name, class:classes!class_id(name))')
    .order('created_at', { ascending: false }).limit(100)) as unknown as Promise<Report[]>
export const resolveReport = (id: number, remove: boolean) => rpc('resolve_report', { p_id: id, p_remove: remove })
export const listPeople = () =>
  ok(supabase.from('profiles').select('id, full_name, role, parliament, class:classes!class_id(name)').order('full_name')) as unknown as Promise<{ id: string; full_name: string; role: Role; parliament: boolean; class: { name: string } | null }[]>
/** Live updates for one chat; returns the unsubscribe function. */
export function onMessages(chat: string, cb: () => void) {
  const ch = supabase.channel(`chat-${chat}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat}` }, cb).subscribe()
  return () => { supabase.removeChannel(ch) }
}

/* ---------- tasks ---------- */
export type Task = { id: string; author_id: string; title: string; notes: string | null; due_on: string | null; class_id: string | null; activity_id: string | null
  assignee_id: string | null; created_at: string; author: { full_name: string }; assignee: { full_name: string } | null; class: { name: string } | null; activity: { title: string } | null; done: { user_id: string }[] }
export const listTasks = () =>
  ok(supabase.from('tasks').select('id, author_id, title, notes, due_on, class_id, activity_id, assignee_id, created_at, author:profiles!author_id(full_name), assignee:profiles!assignee_id(full_name), class:classes(name), activity:activities(title), done:task_done(user_id)')
    .order('due_on', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })) as unknown as Promise<Task[]>
export const addTask = (row: { title: string; notes: string | null; due_on: string | null; class_id: string | null; activity_id: string | null; assignee_id?: string | null }) => ok(supabase.from('tasks').insert(row))
export const removeTask = (id: string) => ok(supabase.from('tasks').delete().eq('id', id))
export const setTaskDone = (id: string, done: boolean) =>
  done ? ok(supabase.from('task_done').upsert({ task_id: id })) : ok(supabase.from('task_done').delete().eq('task_id', id))

/* ---------- feed posts ---------- */
export type PostKind = 'news' | 'announcement' | 'lost' | 'found' | 'proposal'
export type PostStatus = 'open' | 'resolved' | 'considering' | 'accepted' | 'rejected'
export type Post = { id: string; author_id: string; kind: PostKind; title: string; body: string; photo: string | null; place: string | null
  status: PostStatus; answer: string | null; pinned: boolean; created_at: string
  activity_id: string | null; visibility: 'public' | 'members'; activity: { title: string } | null
  addressee: 'parliament' | 'admin' | 'teacher' | null; addressee_id: string | null; to: { full_name: string } | null
  author: { full_name: string; role: Role; class: { name: string } | null }; answerer: { full_name: string } | null; votes: { user_id: string; value: number }[]
  hide_likes: boolean; comments_off: boolean; repost_of: string | null; comments: { count: number }[]
  orig: { id: string; kind: PostKind; title: string; body: string; photo: string | null; created_at: string; author: { full_name: string }; activity: { title: string } | null } | null }
const POST = 'id, author_id, kind, title, body, photo, place, status, answer, pinned, created_at, activity_id, visibility, activity:activities(title), addressee, addressee_id, to:profiles!addressee_id(full_name), author:profiles!author_id(full_name, role, class:classes!class_id(name)), answerer:profiles!answered_by(full_name), votes:post_votes(user_id, value), '
  + 'hide_likes, comments_off, repost_of, comments:post_comments(count), orig:repost_of(id, kind, title, body, photo, created_at, author:profiles!author_id(full_name), activity:activities(title))'
export const listPosts = () =>
  ok(supabase.from('posts').select(POST).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(200)) as unknown as Promise<Post[]>
export const createPost = (kind: PostKind, title: string, body: string, photo?: string | null, place?: string | null) =>
  rpc<string>('create_post', { p_kind: kind, p_title: title, p_body: body, p_photo: photo ?? null, p_place: place ?? null })
export const getPost = (id: string) => ok(supabase.from('posts').select(POST).eq('id', id).maybeSingle()) as unknown as Promise<Post | null>
/** News or announcement in the author's own name, or in an activity's name; with `repost` it shares that post. */
export const createFeedPost = (v: { kind: 'news' | 'announcement'; title: string; body: string; photo?: string | null; activity?: string | null; hideLikes?: boolean; commentsOff?: boolean; repost?: string | null }) =>
  rpc<string>('create_feed_post', { p_kind: v.kind, p_title: v.title, p_body: v.body, p_photo: v.photo ?? null, p_activity: v.activity ?? null,
    p_hide_likes: !!v.hideLikes, p_comments_off: !!v.commentsOff, p_repost_of: v.repost ?? null })
export const likePost = (id: string, on: boolean) => rpc('like_post', { p_id: id, p_on: on })
export const setPostOptions = (id: string, hideLikes: boolean, commentsOff: boolean) => rpc('set_post_options', { p_id: id, p_hide_likes: hideLikes, p_comments_off: commentsOff })
export type Comment = { id: string; author_id: string; body: string; created_at: string; author: { full_name: string; class: { name: string } | null } }
export const listComments = (post: string) =>
  ok(supabase.from('post_comments').select('id, author_id, body, created_at, author:profiles!author_id(full_name, class:classes!class_id(name))').eq('post_id', post).order('created_at')) as unknown as Promise<Comment[]>
export const addComment = (post: string, body: string) => rpc<string>('add_comment', { p_post: post, p_body: body })
export const hideComment = (id: string) => rpc('hide_comment', { p_id: id })
export const setPostStatus = (id: string, status: PostStatus, answer?: string) => rpc('set_post_status', { p_id: id, p_status: status, p_answer: answer ?? null })
export const votePost = (id: string, on: boolean) => rpc('vote_post', { p_id: id, p_on: on })
export const pinPost = (id: string, on: boolean) => rpc('pin_post', { p_id: id, p_on: on })
export const hidePost = (id: string) => rpc('hide_post', { p_id: id })
export const setParliament = (user: string, on: boolean) => rpc('set_parliament', { p_user: user, p_on: on })
export const photoUrl = (path: string) => supabase.storage.from('posts').getPublicUrl(path).data.publicUrl

/** Shrinks a photo to 1280px JPEG and stores it under the user's own folder. */
export async function uploadPhoto(userId: string, file: File) {
  const img = await createImageBitmap(file)
  const k = Math.min(1, 1280 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(tx('Фотоны өңдеу мүмкін болмады')))), 'image/jpeg', 0.82))
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('posts').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(errText(error))
  return path
}

/* ---------- telegram ---------- */
async function tgCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('telegram', { body })
  if (error) {
    const msg = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(msg?.error ?? errText(error))
  }
  return data as T
}
export const tgLogin = (initData: string) => tgCall<{ token_hash?: string }>({ action: 'login', initData })
export const tgLink = (initData: string) => tgCall<{ ok: boolean }>({ action: 'link', initData })
export const tgLinkUrl = () => tgCall<{ url: string }>({ action: 'link_url' })
export const tgStatus = async () =>
  ((await ok(supabase.from('telegram_links').select('tg_id, tg_username').not('tg_id', 'is', null).maybeSingle())) as { tg_id: number; tg_username: string | null } | null)
export const tgUnlink = () => rpc('telegram_unlink', {})
// the bot writes to this person in this language
export const setMyLang = (l: Lang) => rpc('set_my_lang', { p_lang: l })
export const tgGroupLinkUrl = (activity: string) => tgCall<{ url: string }>({ action: 'group_link_url', activity })
export const tgUnlinkGroup = (activity: string) => rpc('unlink_telegram_group', { p_activity: activity })
export const tgSendRollcall = (activity: string, date: string) => tgCall<{ ok: boolean }>({ action: 'rollcall', activity, date })

/* ---------- my class ---------- */
export type Student = { id: string; full_name: string; olympiad: string | null; club: string | null; parliament: boolean; photo: string | null }
export const classStudents = (classId: string) =>
  ok(supabase.from('profiles').select('id, full_name, olympiad, club, parliament, photo').eq('class_id', classId).eq('role', 'student').order('full_name')) as Promise<Student[]>
export const classAttendance = (ids: string[]) =>
  ok(supabase.from('attendance').select('student_id, status').in('student_id', ids)) as Promise<{ student_id: string; status: Mark }[]>
export const setTutor = (classId: string, tutor: string | null) => rpc('set_tutor', { p_class: classId, p_tutor: tutor })

/* ---------- activity modules ---------- */
export const setActivityFeatures = (id: string, features: Feature[]) => rpc('set_activity_features', { p_id: id, p_features: features })
export async function classChatId(classId: string) {
  await rpc('ensure_chats', {})
  return ((await ok(supabase.from('chats').select('id').eq('class_id', classId).eq('kind', 'class').maybeSingle())) as { id: string } | null)?.id ?? null
}
export async function activityChatId(activityId: string) {
  await rpc('ensure_chats', {})
  return ((await ok(supabase.from('chats').select('id').eq('activity_id', activityId).maybeSingle())) as { id: string } | null)?.id ?? null
}

/* ---------- student photos (private bucket, signed URLs) ---------- */
const signed = new Map<string, Promise<string | null>>()
// shortcut: one signed-URL request per photo, cached for the session; batch with createSignedUrls if roll calls grow past ~50
export const avatarUrl = (path: string) => {
  if (!signed.has(path)) signed.set(path, supabase.storage.from('avatars').createSignedUrl(path, 60 * 60 * 6).then((r) => r.data?.signedUrl ?? null))
  return signed.get(path)!
}
/** Center-crops to a 512px square JPEG and stores it as the student's photo. */
export async function uploadStudentPhoto(studentId: string, file: File) {
  const img = await createImageBitmap(file)
  const side = Math.min(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = c.height = Math.min(512, side)
  c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(tx('Суретті өңдеу мүмкін болмады')))), 'image/jpeg', 0.85))
  const path = `${studentId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(errText(error))
  await rpc('set_student_photo', { p_student: studentId, p_path: path })
  return path
}

type SessionRow = { activity_id: string; on_date: string; start_time: string; end_time: string; note: string | null; type_id: string | null; series_id?: string | null }
// a date already holding a session at that start time is skipped, not an error
export const addSessions = (rows: SessionRow[]) => ok(supabase.from('activity_sessions').upsert(rows, { onConflict: 'activity_id,on_date,start_time', ignoreDuplicates: true }))
export const saveSessionType = (t: { id?: string; activity_id: string; name: string; importance: number }) =>
  ok(supabase.from('activity_session_types').upsert(t).select('id, name, importance').single()) as Promise<SessionType>
export const removeSessionType = (id: string) => ok(supabase.from('activity_session_types').delete().eq('id', id))
export const setDefaultSessionType = (activity: string, type: string | null) => rpc('set_default_session_type', { p_activity: activity, p_type: type })
// a repeating plan: change or remove its sessions from `from` on (past ones keep their journal)
export const updateSeries = (series: string, from: string, v: { start_time: string; end_time: string; type_id: string | null; note: string | null }) =>
  ok(supabase.from('activity_sessions').update(v).eq('series_id', series).gte('on_date', from))
export const removeSeries = (series: string, from: string) => ok(supabase.from('activity_sessions').delete().eq('series_id', series).gte('on_date', from))
export const removeSession = (id: string) => ok(supabase.from('activity_sessions').delete().eq('id', id))
export const activityAttendance = (activityId: string) =>
  ok(supabase.from('attendance').select('student_id, session_date, status').eq('activity_id', activityId)) as Promise<{ student_id: string; session_date: string; status: Mark }[]>

export const listActivityPosts = (activityId: string) =>
  ok(supabase.from('posts').select(POST).eq('activity_id', activityId).order('created_at', { ascending: false }).limit(100)) as unknown as Promise<Post[]>
export const createActivityPost = (activityId: string, title: string, body: string, photo: string | null, visibility: 'public' | 'members') =>
  rpc<string>('create_activity_post', { p_activity: activityId, p_title: title, p_body: body, p_photo: photo, p_visibility: visibility })

/* ---------- managing an activity ---------- */
export const updateActivity = (id: string, p: Record<string, unknown>) => rpc('update_activity', { p_id: id, p })
export const setActivityFlags = (id: string, open: boolean | null, archived: boolean | null) => rpc('set_activity_flags', { p_id: id, p_open: open, p_archived: archived })
export const removeActivity = (id: string) => rpc('remove_activity', { p_id: id })
export const addParticipant = (activity: string, student: string) => ok(supabase.from('enrollments').insert({ activity_id: activity, student_id: student, waitlisted: false }))
export const removeParticipant = (activity: string, student: string) => ok(supabase.from('enrollments').delete().eq('activity_id', activity).eq('student_id', student))
export const acceptWaitlisted = (activity: string, student: string) => ok(supabase.from('enrollments').update({ waitlisted: false }).eq('activity_id', activity).eq('student_id', student))

export const createProposal = (to: 'parliament' | 'admin' | 'teacher', teacher: string | null, title: string, body: string) =>
  rpc<string>('create_proposal', { p_to: to, p_teacher: teacher, p_title: title, p_body: body })

/* ---------- surveys ---------- */
export type Question = { q: string; type: 'single' | 'multi' | 'text'; options?: string[] }
export type Survey = { id: string; author_id: string; title: string; description: string | null; questions: Question[]; audience: 'all' | 'students' | 'staff' | 'class' | 'activity'
  class_id: string | null; activity_id: string | null; anonymous: boolean; closes_at: string | null; closed: boolean; created_at: string; kind: 'weekend' | null
  author: { full_name: string }; class: { name: string } | null; activity: { title: string } | null; mine: { answers: unknown[] }[] }
const SURVEY = 'id, kind, author_id, title, description, questions, audience, class_id, activity_id, anonymous, closes_at, closed, created_at, author:profiles!author_id(full_name), class:classes(name), activity:activities(title), mine:survey_responses(answers)'
export const listSurveys = () => ok(supabase.from('surveys').select(SURVEY).order('created_at', { ascending: false }).limit(100)) as unknown as Promise<Survey[]>
export const getSurvey = (id: string) => ok(supabase.from('surveys').select(SURVEY).eq('id', id).single()) as unknown as Promise<Survey>
export const createSurvey = (p: Record<string, unknown>) => rpc<string>('create_survey', { p })
export const answerSurvey = (id: string, answers: unknown[]) => rpc('answer_survey', { p_id: id, p_answers: answers })
export const closeSurvey = (id: string, closed: boolean) => rpc('close_survey', { p_id: id, p_closed: closed })
export const surveyResults = (id: string) => rpc<{ respondent: string | null; class_name: string | null; answers: unknown[]; answered_at: string }[]>('survey_results', { p_id: id })

/* ---------- canteen menu ---------- */
export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner'
export const listMenu = (date: string) => ok(supabase.from('menus').select('meal, items').eq('on_date', date)) as Promise<{ meal: Meal; items: string }[]>
export const saveMenu = (date: string, meal: Meal, items: string) =>
  items.trim() ? ok(supabase.from('menus').upsert({ on_date: date, meal, items: items.trim(), updated_at: new Date().toISOString() }))
    : ok(supabase.from('menus').delete().eq('on_date', date).eq('meal', meal))

/* ---------- suggestions to develop the app ---------- */
export type Feedback = { id: number; body: string; created_at: string; user_id: string; author: { full_name: string } | null }
export const sendAppFeedback = (body: string) => rpc('send_app_feedback', { p_body: body })
export const listAppFeedback = () =>
  ok(supabase.from('app_feedback').select('id, body, created_at, user_id, author:profiles!user_id(full_name)').order('created_at', { ascending: false }).limit(200)) as unknown as Promise<Feedback[]>
