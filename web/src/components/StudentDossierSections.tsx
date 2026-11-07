import { useEffect, useState } from 'react'
import {
  errText,
  saveStudentFamilyContact,
  saveStudentHealthEvent,
  saveStudentHealthProfile,
  saveStudentProfileDetails,
  saveStudentSiblings,
  type ParentContact,
  type StudentFamilyContact,
  type StudentHealthEvent,
  type StudentHealthProfile,
  type StudentProfileDetails,
  type StudentSibling,
} from '../lib/api'
import { Button, Card, Icon, inputCls, toast } from './ui'
import { tx } from '../lib/i18n'

type Props = {
  studentId: string
  profile: StudentProfileDetails | null
  health: StudentHealthProfile | null
  healthEvents: StudentHealthEvent[]
  familyContacts: StudentFamilyContact[]
  parentContacts: ParentContact[]
  isStudent: boolean
}

const input = inputCls + ' h-10 text-sm'
const shortDate = (value?: string | null) => value ? new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('kk-KZ') : '—'

export function StudentDossierOverview({
  student,
  classNameStr,
  meetings,
  roadmap,
  profile,
  health,
  parentContacts,
}: {
  student: { full_name: string }
  classNameStr?: string
  meetings: { starts_at: string; done_at: string | null }[]
  roadmap: { goals: { done?: boolean }[]; habits: unknown[] }
  profile: StudentProfileDetails | null
  health: StudentHealthProfile | null
  parentContacts: ParentContact[]
}) {
  const lastMeeting = meetings.find((m) => Boolean(m.done_at))
  const nextMeeting = meetings.filter((m) => !m.done_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const completedGoals = roadmap.goals.filter((g) => g.done).length
  const filled = [profile?.birthday, profile?.iin, profile?.address, profile?.city, health?.diet].filter(Boolean).length
  const lastParentContact = parentContacts[0]

  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted">{tx('Оқушы')}</p>
          <p className="font-bold truncate">{student.full_name}</p>
          <p className="text-xs text-accent mt-0.5">{classNameStr || tx('Сынып көрсетілмеген')}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted">{tx('Жеке кездесу')}</p>
          <p className="font-semibold text-sm">{nextMeeting ? shortDate(nextMeeting.starts_at.slice(0, 10)) : tx('Жоспарланбаған')}</p>
          <p className="text-xs text-muted mt-0.5">
            {lastMeeting ? tx('Соңғысы') + ': ' + shortDate(lastMeeting.starts_at.slice(0, 10)) : tx('Әлі өткізілмеген')}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted">{tx('Даму жоспары')}</p>
          <p className="font-semibold text-sm">{completedGoals}/{roadmap.goals.length} {tx('мақсат орындалды')}</p>
          <p className="text-xs text-muted mt-0.5">{roadmap.habits.length} {tx('әдет')}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted">{tx('Толтырылуы')}</p>
          <p className="font-semibold text-sm">{filled}/5 {tx('маңызды дерек')}</p>
          <p className="text-xs mt-0.5">
            {health?.needs_attention ? <span className="text-danger font-semibold">{tx('Ерекше назар қажет')}</span> : <span className="text-success">{tx('Денсаулық белгісі жоқ')}</span>}
          </p>
        </Card>
      </div>
      {lastParentContact && (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="font-semibold text-fg">{tx('Ата-анамен соңғы байланыс')}:</span>{' '}
          {shortDate(lastParentContact.on_date)} · {lastParentContact.summary}
        </div>
      )}
    </div>
  )
}

export default function StudentDossierStructured({
  studentId,
  profile,
  health,
  healthEvents,
  familyContacts,
  parentContacts,
  isStudent,
}: Props) {
  const [profileState, setProfileState] = useState<StudentProfileDetails>(profile ?? { student_id: studentId })
  const [healthState, setHealthState] = useState<StudentHealthProfile>(health ?? { student_id: studentId, needs_attention: false })
  const [familyState, setFamilyState] = useState<StudentFamilyContact[]>(familyContacts)
  const [siblings, setSiblings] = useState<StudentSibling[]>(profile?.siblings ?? [])
  const [events, setEvents] = useState<StudentHealthEvent[]>(healthEvents)
  const [eventDraft, setEventDraft] = useState({ on_date: '', illness_kind: '', started_on: '', ended_on: '', impact: '', note: '' })
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { setProfileState(profile ?? { student_id: studentId }) }, [profile, studentId])
  useEffect(() => { setHealthState(health ?? { student_id: studentId, needs_attention: false }) }, [health, studentId])
  useEffect(() => { setFamilyState(familyContacts) }, [familyContacts])
  useEffect(() => { setSiblings(profile?.siblings ?? []) }, [profile?.siblings])
  useEffect(() => { setEvents(healthEvents) }, [healthEvents])

  const saveProfile = async (patch: Partial<StudentProfileDetails>) => {
    const next = { ...profileState, ...patch }
    setProfileState(next)
    setBusy('profile')
    try { await saveStudentProfileDetails(studentId, patch) } catch (e) { toast(errText(e)) } finally { setBusy(null) }
  }
  const saveHealth = async (patch: Partial<StudentHealthProfile>) => {
    const next = { ...healthState, ...patch }
    setHealthState(next)
    setBusy('health')
    try { await saveStudentHealthProfile(studentId, patch) } catch (e) { toast(errText(e)) } finally { setBusy(null) }
  }
  const contact = (relationship: StudentFamilyContact['relationship']) =>
    familyState.find((x) => x.relationship === relationship) ?? { student_id: studentId, relationship }
  const saveContact = async (relationship: StudentFamilyContact['relationship'], patch: Partial<StudentFamilyContact>) => {
    const next = { ...contact(relationship), ...patch }
    setFamilyState((prev) => [...prev.filter((x) => x.relationship !== relationship), next])
    setBusy(relationship)
    try { await saveStudentFamilyContact(studentId, relationship, patch) } catch (e) { toast(errText(e)) } finally { setBusy(null) }
  }
  const saveSiblings = async (next: StudentSibling[]) => {
    setSiblings(next)
    setBusy('siblings')
    try { await saveStudentSiblings(studentId, next) } catch (e) { toast(errText(e)) } finally { setBusy(null) }
  }
  const addEvent = async () => {
    if (eventDraft.illness_kind.trim().length < 2) return
    setBusy('event')
    try {
      const id = await saveStudentHealthEvent(studentId, null, eventDraft)
      setEvents((prev) => [{ id, student_id: studentId, ...eventDraft, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev])
      setEventDraft({ on_date: '', illness_kind: '', started_on: '', ended_on: '', impact: '', note: '' })
    } catch (e) { toast(errText(e)) } finally { setBusy(null) }
  }

  const renderText = (label: string, value: string | null | undefined, onSave: (value: string) => void, readOnly = false) => (
    <label className="grid grid-cols-1 gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input className={input} value={value ?? ''} readOnly={readOnly} onChange={e => !readOnly && onSave(e.target.value)} onBlur={e => !readOnly && onSave(e.target.value)} />
    </label>
  )
  const renderDate = (label: string, value: string | null | undefined, onSave: (value: string) => void, readOnly = false) => (
    <label className="grid grid-cols-1 gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input className={input} type="date" value={value ?? ''} readOnly={readOnly} onChange={e => !readOnly && onSave(e.target.value)} onBlur={e => !readOnly && onSave(e.target.value)} />
      <span className="text-[11px] text-muted">{tx('Формат: YYYY-MM-DD, мысалы 2010-05-21')}</span>
    </label>
  )

  const father = contact('father')
  const mother = contact('mother')

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-bold"><Icon n="shield" size={16} />{tx('Анкета бөлімдері')}</div>
        <p className="text-xs text-muted mt-1">{tx('Маңызды деректер бөлек сақталады. ЖСН мен құжат нөмірі оқушыға read-only көрсетіледі.')}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card className="p-3 grid gap-3">
          <div><p className="font-bold">{tx('Жеке мәліметтер')}</p><p className="text-xs text-muted">{tx('Негізгі және жатақхана деректері')}</p></div>
          <div className="grid sm:grid-cols-2 gap-2">
            {renderDate(tx('Туған күні'), profileState.birthday, v => saveProfile({ birthday: v || null }), isStudent)}
            {renderText(tx('ЖСН'), profileState.iin, v => saveProfile({ iin: v || null }), isStudent)}
            {renderText(tx('Құжат нөмірі'), profileState.document_number, v => saveProfile({ document_number: v || null }), isStudent)}
            {renderText(tx('Ұлты'), profileState.nation, v => saveProfile({ nation: v || null }))}
            {renderText(tx('Қала/ауыл'), profileState.city, v => saveProfile({ city: v || null }))}
            {renderText(tx('Оқушы телефоны'), profileState.phone, v => saveProfile({ phone: v || null }))}
            {renderText(tx('Руы'), profileState.tribe, v => saveProfile({ tribe: v || null }))}
            {renderText(tx('Жатақхана бөлмесі'), profileState.dorm_room, v => saveProfile({ dorm_room: v || null }))}
            {renderText(tx('Төсек орны'), profileState.dorm_bed, v => saveProfile({ dorm_bed: v || null }))}
          </div>
          <label className="grid grid-cols-1 gap-1"><span className="text-xs font-semibold text-muted">{tx('Мекенжай')}</span><textarea className="min-h-20 rounded-md border border-input bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" value={profileState.address ?? ''} onChange={e => setProfileState({ ...profileState, address: e.target.value })} onBlur={() => saveProfile({ address: profileState.address ?? '' })} /></label>
          {busy === 'profile' && <span className="text-xs text-muted">{tx('Сақталуда...')}</span>}
        </Card>

        <Card className="p-3 grid gap-3">
          <div><p className="font-bold">{tx('Денсаулық және тұрмыс')}</p><p className="text-xs text-muted">{tx('Денсаулық жазбалары шектеулі рөлдерге ғана көрінеді.')}</p></div>
          {renderText(tx('Созылмалы аурулар'), healthState.chronic_conditions, v => saveHealth({ chronic_conditions: v || null }))}
          {renderText(tx('Аллергия'), healthState.allergies, v => saveHealth({ allergies: v || null }))}
          {renderText(tx('Диета'), healthState.diet, v => saveHealth({ diet: v || null }))}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(healthState.needs_attention)} onChange={e => saveHealth({ needs_attention: e.target.checked })} />{tx('Ерекше назар қажет')}</label>
          <label className="grid grid-cols-1 gap-1"><span className="text-xs font-semibold text-muted">{tx('Қосымша түсініктеме')}</span><textarea className="min-h-20 rounded-md border border-input bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent" value={healthState.extra_notes ?? ''} onChange={e => setHealthState({ ...healthState, extra_notes: e.target.value })} onBlur={() => saveHealth({ extra_notes: healthState.extra_notes ?? '' })} /></label>
          {busy === 'health' && <span className="text-xs text-muted">{tx('Сақталуда...')}</span>}
        </Card>
      </div>

      <Card className="p-3 grid gap-3">
        <div><p className="font-bold">{tx('Отбасы және байланыс')}</p><p className="text-xs text-muted">{tx('Ата-ана деректері оқушыға және сынып кеңесіне ғана ашылады.')}</p></div>
        <div className="grid md:grid-cols-2 gap-4">
          {(['father', 'mother'] as const).map(rel => {
            const item = rel === 'father' ? father : mother
            const title = rel === 'father' ? tx('Әкесі') : tx('Анасы')
            return <div key={rel} className="grid gap-2 rounded-lg bg-surface-2 p-3">
              <p className="font-semibold text-sm">{title}</p>
              {renderText(tx('Аты-жөні'), item.full_name, v => saveContact(rel, { full_name: v || null }))}
              {renderText(tx('Жұмыс орны'), item.workplace, v => saveContact(rel, { workplace: v || null }))}
              {renderText(tx('Лауазымы'), item.position, v => saveContact(rel, { position: v || null }))}
              {renderText(tx('Телефон'), item.phone, v => saveContact(rel, { phone: v || null }))}
              {renderText('Telegram', item.telegram, v => saveContact(rel, { telegram: v || null }))}
              {renderText('WhatsApp', item.whatsapp, v => saveContact(rel, { whatsapp: v || null }))}
            </div>
          })}
        </div>
        <div className="border-t border-line pt-3 grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div><p className="font-semibold text-sm flex items-center gap-2"><Icon n="users" size={15} />{tx('Бауырлары')}</p><p className="text-xs text-muted">{tx('Әр бауырды жеке жолмен енгізіңіз. Туған күн форматы: YYYY-MM-DD.')}</p></div>
            <Button kind="secondary" onClick={() => saveSiblings([...siblings, { full_name: '', relationship: 'other', birthday: null, school_or_work: '' }])}><Icon n="plus" size={15} />{tx('Бауыр қосу')}</Button>
          </div>
          {siblings.length === 0 && <p className="text-sm text-muted rounded-lg bg-surface-2 p-3">{tx('Бауыр туралы ақпарат әлі енгізілмеген.')}</p>}
          {siblings.map((sibling, index) => {
            const updateSibling = (patch: Partial<StudentSibling>) => setSiblings(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
            return <div key={index} className="grid gap-2 rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">{tx('Бауыр {0}', index + 1)}</p><button type="button" className="size-8 rounded-md grid place-items-center text-muted hover:bg-surface hover:text-danger" aria-label={tx('Өшіру')} onClick={() => saveSiblings(siblings.filter((_, i) => i !== index))}><Icon n="x" size={15} /></button></div>
              <div className="grid sm:grid-cols-2 gap-2">
                {renderText(tx('Аты-жөні'), sibling.full_name, value => updateSibling({ full_name: value }))}
                <label className="grid grid-cols-1 gap-1"><span className="text-xs font-semibold text-muted">{tx('Туыстық түрі')}</span><select className={input} value={sibling.relationship} onChange={e => updateSibling({ relationship: e.target.value as StudentSibling['relationship'] })} onBlur={() => saveSiblings(siblings)}><option value="brother">{tx('Ағасы/інісі')}</option><option value="sister">{tx('Әпкесі/қарындасы')}</option><option value="other">{tx('Басқа')}</option></select></label>
                {renderDate(tx('Туған күні'), sibling.birthday, value => updateSibling({ birthday: value || null }))}
                {renderText(tx('Оқу/жұмыс орны'), sibling.school_or_work, value => updateSibling({ school_or_work: value }))}
              </div>
              <button type="button" className="justify-self-end text-xs font-semibold text-accent hover:underline" onClick={() => saveSiblings(siblings)}>{tx('Сақтау')}</button>
            </div>
          })}
          {busy === 'siblings' && <span className="text-xs text-muted">{tx('Сақталуда...')}</span>}
        </div>
        {parentContacts.length > 0 && <div className="border-t border-line pt-3 grid gap-2">
          <p className="text-xs font-bold uppercase text-muted">{tx('Ата-анамен байланыс тарихы')}</p>
          {parentContacts.slice(0, 5).map(c => <div key={c.id} className="text-sm rounded-lg bg-surface-2 p-2"><span className="text-xs text-muted">{shortDate(c.on_date)} · {c.channel}</span><p>{c.summary}</p></div>)}
        </div>}
      </Card>

      <Card className="p-3 grid gap-3">
        <div className="flex items-center justify-between gap-2"><div><p className="font-bold">{tx('Ауырған кезеңдер')}</p><p className="text-xs text-muted">{tx('Аурудың басталуы, аяқталуы және үлгерімге әсерін тіркеңіз.')} {tx('Күн форматы: YYYY-MM-DD')}</p></div><span className="text-xs text-muted">{events.length}</span></div>
        <div className="grid md:grid-cols-3 gap-2">
          <input className={input} type="date" value={eventDraft.on_date} onChange={e => setEventDraft({ ...eventDraft, on_date: e.target.value })} />
          <input className={input} placeholder={tx('Ауру түрі')} value={eventDraft.illness_kind} onChange={e => setEventDraft({ ...eventDraft, illness_kind: e.target.value })} />
          <input className={input} placeholder={tx('Үлгерімге/сабаққа әсері')} value={eventDraft.impact} onChange={e => setEventDraft({ ...eventDraft, impact: e.target.value })} />
          <input className={input} type="date" value={eventDraft.started_on} onChange={e => setEventDraft({ ...eventDraft, started_on: e.target.value })} />
          <input className={input} type="date" value={eventDraft.ended_on} onChange={e => setEventDraft({ ...eventDraft, ended_on: e.target.value })} />
          <input className={input} placeholder={tx('Қысқаша түсініктеме')} value={eventDraft.note} onChange={e => setEventDraft({ ...eventDraft, note: e.target.value })} />
        </div>
        <Button kind="secondary" onClick={addEvent} disabled={busy === 'event'}><Icon n="plus" size={15} />{tx('Ауру кезеңін қосу')}</Button>
        {events.map(e => <div key={e.id} className="rounded-lg bg-surface-2 p-2 text-sm"><div className="flex justify-between gap-2"><strong>{e.illness_kind}</strong><span className="text-xs text-muted">{shortDate(e.started_on || e.on_date)} — {shortDate(e.ended_on)}</span></div>{e.impact && <p className="text-xs mt-1">{e.impact}</p>}{e.note && <p className="text-xs text-muted mt-1">{e.note}</p>}</div>)}
      </Card>
    </div>
  )
}
