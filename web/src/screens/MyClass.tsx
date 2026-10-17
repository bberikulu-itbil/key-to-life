import { useMemo, useState } from 'react'
import { classAttendance, classChatId, classStudents, errText, listClasses, listLeaves, listLessons, listStaff, openDirect, setClassTeacher, setTutor, updateStaff, updateStudent, uploadStudentPhoto, type Student } from '../lib/api'
import Avatar from '../components/Avatar'
import { hm, isoDow, rate, today } from '../lib/time'
import { useMe } from '../App'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

export default function MyClass({ classId }: { classId?: string }) {
  const { me } = useMe()
  const deputy = me.role === 'deputy' || me.role === 'admin'
  const classes = useLoad(listClasses, [])
  const mine = (classes.data ?? []).filter((c) => c.teacher_id === me.id || c.tutor_id === me.id)
  const options = deputy ? classes.data ?? [] : mine
  const cls = options.find((c) => c.id === classId) ?? mine[0] ?? options[0]
  const cid = cls?.id

  const data = useLoad(async () => {
    if (!cid) return null
    const now = new Date().toISOString()
    const [students, lessons, leaves, staff] = await Promise.all([classStudents(cid), listLessons({ classId: cid }), listLeaves({ since: now }), listStaff()])
    const att = students.length ? await classAttendance(students.map((s) => s.id)) : []
    return { students, lessons, leaves, staff, att }
  }, [cid])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Student | null>(null)
  const [uploading, setUploading] = useState(false)
  const [staffOpen, setStaffOpen] = useState(false)
  const upload = async (s: Student, f: File) => {
    setUploading(true)
    try { const photo = await uploadStudentPhoto(s.id, f); setOpen({ ...s, photo }); toast(tx('Сурет сақталды')); data.reload() } catch (e) { toast(errText(e)) } finally { setUploading(false) }
  }

  const d = data.data
  const ids = new Set((d?.students ?? []).map((s) => s.id))
  const nowMs = Date.now()
  const outNow = (d?.leaves ?? []).filter((l) => ids.has(l.student_id) && l.status === 'approved' && new Date(l.starts_at).getTime() <= nowMs)
  const pending = (d?.leaves ?? []).filter((l) => ids.has(l.student_id) && l.status.startsWith('pending'))
  const todayLessons = (d?.lessons ?? []).filter((l) => l.weekday === isoDow(today()))
  const hmNow = new Date().toTimeString().slice(0, 5)
  const olympiads = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of d?.students ?? []) if (s.olympiad) m.set(s.olympiad, (m.get(s.olympiad) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [d])
  const rateOf = (id: string) => rate((d?.att ?? []).filter((a) => a.student_id === id).map((a) => a.status))
  const name = (id: string | null) => d?.staff.find((s) => s.id === id)?.full_name
  const list = (d?.students ?? []).filter((s) => (s.full_name + (s.olympiad ?? '') + (s.club ?? '')).toLowerCase().includes(q.trim().toLowerCase()))

  const openChat = async () => {
    try {
      const c = await classChatId(cls!.id)
      if (c) go(`/c/${c}`); else toast(tx('Сынып чаты табылмады'))
    } catch (e) { toast(errText(e)) }
  }

  if (classes.loading && !classes.data) return <><PageHead title={tx('Менің сыныбым')} back /><Skeleton /></>
  if (!cls) return <><PageHead title={tx('Менің сыныбым')} back /><Card><Empty icon="users" title={tx('Сынып бекітілмеген')} text={tx('Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады.')} /></Card></>

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Менің сыныбым')} back />
      {options.length > 1 && <Chips label={tx('Сынып')} value={cls.id} onChange={(v) => go(`/class/${v}`)} items={options.map((c) => [c.id, c.name] as [string, string])} />}

      <Card className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="size-14 rounded-lg bg-accent text-on-accent grid place-items-center text-xl font-bold">{cls.name}</span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{tx('{0} сыныбы', cls.name)}</p>
            <p className="text-sm text-muted">{d ? tx('{0} оқушы', d.students.length) : '…'}{cls.teacher_id === me.id ? tx(' · сіз сынып жетекшісісіз') : cls.tutor_id === me.id ? tx(' · сіз тәрбиешісіз') : ''}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{tx('Сынып жетекшісі')}</dt><dd className="font-medium">{name(cls.teacher_id) ?? '—'}</dd>
          <dt className="text-muted">{tx('Тәрбиеші')}</dt><dd className="font-medium">{name(cls.tutor_id) ?? '—'}</dd>
        </dl>
        {deputy && d && <Button kind="secondary" onClick={() => setStaffOpen(true)}><Icon n="settings" size={18} />{tx('Мұғалімдерді өзгерту')}</Button>}
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {([['chat', tx('Сынып чаты'), openChat], ['clock', tx('Күнтізбе'), () => go(`/calendars?class=${encodeURIComponent(cls.id)}`)], ['check', tx('Тапсырма'), () => go('/plan')], ['file', tx('Рұқсаттар'), () => go('/leaves')]] as const).map(([icon, label, fn]) => (
          <button key={label} type="button" onClick={fn} className="grid justify-items-center gap-1.5 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] py-3 px-1 text-xs font-semibold">
            <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} size={18} /></span>{label}
          </button>
        ))}
      </div>

      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (
        <>
          {(outNow.length > 0 || pending.length > 0) && (
            <Card className="grid gap-2">
              {outNow.length > 0 && <div><p className="font-semibold">{tx('Қазір рұқсатпен сыртта · {0}', outNow.length)}</p>
                <ul className="text-sm">{outNow.map((l) => <li key={l.id}>{tx('{0} · {1}-ге дейін', l.student.full_name, new Date(l.ends_at).toTimeString().slice(0, 5))}</li>)}</ul></div>}
              {pending.length > 0 && <a href="#/leaves" className="flex items-center gap-2 text-warning font-semibold"><Icon n="clock" size={18} />{pending.length}{' '}{tx('рұқсат сұрауы шешім күтуде')}<Icon n="chev" size={18} /></a>}
            </Card>
          )}

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Бүгінгі сабақтар · {0}', todayLessons.length)}</h2>
          {!todayLessons.length ? <Card><p className="text-sm text-muted">{tx('Бүгін сабақ жоқ.')}</p></Card> : (
            <Card className="p-0 divide-y divide-line">
              {todayLessons.map((l) => {
                const live = hm(l.start_time) <= hmNow && hmNow < hm(l.end_time)
                return (
                  <div key={l.id} className={`flex gap-3 px-4 py-2.5 ${live ? 'bg-accent-soft' : hm(l.end_time) <= hmNow ? 'opacity-60' : ''}`}>
                    <span className="w-12 text-sm tabular-nums">{hm(l.start_time)}</span>
                    <span className="flex-1 min-w-0"><span className="block font-medium">{l.subject}{live && <span className="ml-2 text-xs text-accent font-semibold">{tx('Қазір')}</span>}</span>
                      <span className="block text-xs text-muted truncate">{[l.teacher?.full_name ?? l.teacher_name, l.room && tx('{0}-каб.', l.room)].filter(Boolean).join(' · ')}</span></span>
                  </div>
                )
              })}
            </Card>
          )}

          {olympiads.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Олимпиада бағыттары')}</h2>
              <div className="flex flex-wrap gap-2">{olympiads.map(([o, n]) => <button key={o} type="button" onClick={() => setQ(q === o ? '' : o)} aria-pressed={q === o}
                className={`h-9 px-3 rounded-full text-sm ${q === o ? 'bg-accent text-on-accent font-semibold' : 'bg-surface-2'}`}>{o} · {n}</button>)}</div>
            </>
          )}

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">{tx('Оқушылар · {0}', d.students.length)}</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Аты, олимпиада немесе үйірме')} aria-label={tx('Оқушыны іздеу')} className={inputCls} />
          <Card className="p-0 divide-y divide-line">
            {list.map((s, i) => {
              const r = rateOf(s.id)
              const out = outNow.some((l) => l.student_id === s.id)
              return (
                <button key={s.id} type="button" onClick={() => setOpen(s)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                  <span className="w-5 text-xs text-muted tabular-nums">{i + 1}</span>
                  <Avatar name={s.full_name} photo={s.photo} size={44} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{s.full_name}</span>
                    <span className="block text-xs text-muted truncate">{[s.olympiad && tx('{0} олимпиадасы', s.olympiad), s.club].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  {out && <Badge tone="warn">{tx('Сыртта')}</Badge>}
                  <span className="text-sm tabular-nums text-muted w-10 text-right">{r === null ? '' : `${r}%`}</span>
                </button>
              )
            })}
            {!list.length && <p className="px-4 py-6 text-sm text-muted text-center">{tx('Ешкім табылмады')}</p>}
          </Card>
        </>
      )}

      {staffOpen && d && <Sheet title={tx('{0} сыныбының мұғалімдері', cls.name)} onClose={() => setStaffOpen(false)}>
        <ClassStaff classId={cls.id} teacher={cls.teacher_id} tutor={cls.tutor_id} staff={d.staff} onDone={() => { setStaffOpen(false); classes.reload(); data.reload() }} /></Sheet>}

      {open && (
        <Sheet title={open.full_name} onClose={() => setOpen(null)}>
          <div className="grid gap-3">
            <div className="grid justify-items-center gap-2">
              <Avatar name={open.full_name} photo={open.photo} size={128} />
              {(deputy || cls.teacher_id === me.id || cls.tutor_id === me.id) && (
                <label className={`h-11 px-4 rounded-md bg-accent-soft text-accent font-semibold inline-flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
                  <Icon n="user" size={18} />{uploading ? tx('Жүктелуде…') : open.photo ? tx('Суретті ауыстыру') : tx('Сурет қосу')}
                  <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(open, e.target.files[0])} />
                </label>
              )}
            </div>
            {(deputy || cls.teacher_id === me.id || cls.tutor_id === me.id) && <EditStudent key={open.id} s={open} onSaved={(v) => { setOpen({ ...open, ...v }); data.reload() }} />}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">{tx('Олимпиада')}</dt><dd>{open.olympiad ?? '—'}</dd>
              <dt className="text-muted">{tx('Үйірме')}</dt><dd>{open.club ?? '—'}</dd>
              <dt className="text-muted">{tx('Қатысу')}</dt><dd>{rateOf(open.id) === null ? tx('әлі белгі жоқ') : `${rateOf(open.id)}%`}</dd>
              {open.parliament && <><dt className="text-muted">{tx('Парламент')}</dt><dd>{tx('мүшесі')}</dd></>}
            </dl>
            <button type="button" onClick={async () => { try { go(`/c/${await openDirect(open.id)}`) } catch (e) { toast(errText(e)) } }}
              className="h-12 rounded-md bg-accent text-on-accent font-semibold inline-flex items-center justify-center gap-2"><Icon n="chat" />{tx('Жеке хат жазу')}</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

/** The class teacher, the tutor or a deputy fix a student's name, olympiad subject and club. */
function EditStudent({ s, onSaved }: { s: Student; onSaved: (v: { full_name: string; olympiad: string | null; club: string | null }) => void }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ full_name: s.full_name, olympiad: s.olympiad ?? '', club: s.club ?? '' })
  const [busy, setBusy] = useState(false)
  if (!editing) return <Button kind="secondary" onClick={() => setEditing(true)}><Icon n="settings" size={18} />{tx('Мәліметін өзгерту')}</Button>
  const save = async () => {
    setBusy(true)
    try {
      await updateStudent(s.id, f); toast(tx('Сақталды')); setEditing(false)
      onSaved({ full_name: f.full_name.trim(), olympiad: f.olympiad.trim() || null, club: f.club.trim() || null })
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-3 rounded-md bg-surface-2 p-3">
      <Field label={tx('Аты-жөні')}>{(id) => <input id={id} value={f.full_name} maxLength={120} onChange={(e) => setF({ ...f, full_name: e.target.value })} className={inputCls} />}</Field>
      <Field label={tx('Олимпиада')}>{(id) => <input id={id} value={f.olympiad} maxLength={60} onChange={(e) => setF({ ...f, olympiad: e.target.value })} className={inputCls} placeholder={tx('Мысалы: информатика')} />}</Field>
      <Field label={tx('Үйірме')}>{(id) => <input id={id} value={f.club} maxLength={120} onChange={(e) => setF({ ...f, club: e.target.value })} className={inputCls} />}</Field>
      <div className="grid grid-cols-2 gap-2"><Button kind="ghost" onClick={() => setEditing(false)}>{tx('Болдырмау')}</Button><Button loading={busy} onClick={save}>{tx('Сақтау')}</Button></div>
    </div>
  )
}

type Staff = { id: string; full_name: string; title: string | null }
/** Admin / deputy: who leads the class, who is its tutor, and the teachers' own names and titles. */
function ClassStaff({ classId, teacher, tutor, staff, onDone }: { classId: string; teacher: string | null; tutor: string | null; staff: Staff[]; onDone: () => void }) {
  const [f, setF] = useState({ teacher: teacher ?? '', tutor: tutor ?? '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      if (f.teacher !== (teacher ?? '')) await setClassTeacher(classId, f.teacher || null)
      if (f.tutor !== (tutor ?? '')) await setTutor(classId, f.tutor || null)
      toast(tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const pick = (k: 'teacher' | 'tutor', label: string) => (
    <Field label={label}>{(id) => <select id={id} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inputCls}>
      <option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}</Field>
  )
  const people = [f.teacher, f.tutor].filter((x, i, a) => x && a.indexOf(x) === i).map((id) => staff.find((s) => s.id === id)).filter(Boolean) as Staff[]
  return (
    <div className="grid gap-4">
      {pick('teacher', tx('Сынып жетекшісі'))}
      {pick('tutor', tx('Тәрбиеші'))}
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {people.map((s) => <StaffInfo key={s.id} s={s} onSaved={onDone} />)}
    </div>
  )
}

function StaffInfo({ s, onSaved }: { s: Staff; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ full_name: s.full_name, title: s.title ?? '' })
  const [busy, setBusy] = useState(false)
  if (!editing) return <Button kind="ghost" onClick={() => setEditing(true)}>{tx('{0} — мәліметін өзгерту', s.full_name)}</Button>
  const save = async () => {
    setBusy(true)
    try { await updateStaff(s.id, f.full_name, f.title); toast(tx('Сақталды')); onSaved() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-3 rounded-md bg-surface-2 p-3">
      <Field label={tx('Аты-жөні')}>{(id) => <input id={id} value={f.full_name} maxLength={120} onChange={(e) => setF({ ...f, full_name: e.target.value })} className={inputCls} />}</Field>
      <Field label={tx('Лауазымы / пәні')}>{(id) => <input id={id} value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Физика пәнінің мұғалімі')} />}</Field>
      <div className="grid grid-cols-2 gap-2"><Button kind="ghost" onClick={() => setEditing(false)}>{tx('Болдырмау')}</Button><Button loading={busy} onClick={save}>{tx('Сақтау')}</Button></div>
    </div>
  )
}
