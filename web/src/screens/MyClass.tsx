import { useMemo, useState } from 'react'
import { classAttendance, classStudents, ensureChats, errText, listClasses, listLeaves, listLessons, listStaff, myChats, openDirect, setTutor, uploadStudentPhoto, type Student } from '../lib/api'
import Avatar from '../components/Avatar'
import { hm, isoDow, rate, today } from '../lib/time'
import { useMe } from '../App'
import { Badge, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'

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
  const upload = async (s: Student, f: File) => {
    setUploading(true)
    try { const photo = await uploadStudentPhoto(s.id, f); setOpen({ ...s, photo }); toast('Сурет сақталды'); data.reload() } catch (e) { toast(errText(e)) } finally { setUploading(false) }
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
      await ensureChats()
      const c = (await myChats()).find((x) => x.kind === 'class' && x.title === `${cls!.name} сыныбы`)
      if (c) go(`/c/${c.id}`); else toast('Сынып чаты табылмады')
    } catch (e) { toast(errText(e)) }
  }
  const changeTutor = async (v: string) => { try { await setTutor(cid!, v || null); toast('Сақталды'); classes.reload() } catch (e) { toast(errText(e)) } }

  if (classes.loading && !classes.data) return <><PageHead title="Менің сыныбым" back /><Skeleton /></>
  if (!cls) return <><PageHead title="Менің сыныбым" back /><Card><Empty icon="users" title="Сынып бекітілмеген" text="Сынып жетекшісі немесе тәрбиеші болып белгіленгенде, сыныбыңыз осында шығады." /></Card></>
  const canSetTutor = deputy || cls.teacher_id === me.id

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Менің сыныбым" back />
      {options.length > 1 && <Chips label="Сынып" value={cls.id} onChange={(v) => go(`/class/${v}`)} items={options.map((c) => [c.id, c.name] as [string, string])} />}

      <Card className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="size-14 rounded-lg bg-accent text-on-accent grid place-items-center text-xl font-bold">{cls.name}</span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{cls.name} сыныбы</p>
            <p className="text-sm text-muted">{d ? `${d.students.length} оқушы` : '…'}{cls.teacher_id === me.id ? ' · сіз сынып жетекшісісіз' : cls.tutor_id === me.id ? ' · сіз тәрбиешісіз' : ''}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Сынып жетекшісі</dt><dd className="font-medium">{name(cls.teacher_id) ?? '—'}</dd>
          <dt className="text-muted">Тәрбиеші</dt><dd className="font-medium">{name(cls.tutor_id) ?? '—'}</dd>
        </dl>
        {canSetTutor && d && (
          <Field label="Тәрбиешіні өзгерту">{(id) => <select id={id} value={cls.tutor_id ?? ''} onChange={(e) => changeTutor(e.target.value)} className={inputCls}>
            <option value="">Белгіленбеген</option>{d.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}</Field>
        )}
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {([['chat', 'Сынып чаты', openChat], ['clock', 'Күнтізбе', () => go(`/calendars?class=${encodeURIComponent(cls.id)}`)], ['check', 'Тапсырма', () => go('/plan')], ['file', 'Рұқсаттар', () => go('/leaves')]] as const).map(([icon, label, fn]) => (
          <button key={label} type="button" onClick={fn} className="grid justify-items-center gap-1.5 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] py-3 px-1 text-xs font-semibold">
            <span className="size-9 rounded-sm bg-accent-soft text-accent grid place-items-center"><Icon n={icon} size={18} /></span>{label}
          </button>
        ))}
      </div>

      {data.loading && !d ? <Skeleton /> : data.error ? <ErrorBox text={data.error} retry={data.reload} /> : d && (
        <>
          {(outNow.length > 0 || pending.length > 0) && (
            <Card className="grid gap-2">
              {outNow.length > 0 && <div><p className="font-semibold">Қазір рұқсатпен сыртта · {outNow.length}</p>
                <ul className="text-sm">{outNow.map((l) => <li key={l.id}>{l.student.full_name} · {new Date(l.ends_at).toTimeString().slice(0, 5)}-ге дейін</li>)}</ul></div>}
              {pending.length > 0 && <a href="#/leaves" className="flex items-center gap-2 text-warning font-semibold"><Icon n="clock" size={18} />{pending.length} рұқсат сұрауы шешім күтуде<Icon n="chev" size={18} /></a>}
            </Card>
          )}

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">Бүгінгі сабақтар · {todayLessons.length}</h2>
          {!todayLessons.length ? <Card><p className="text-sm text-muted">Бүгін сабақ жоқ.</p></Card> : (
            <Card className="p-0 divide-y divide-line">
              {todayLessons.map((l) => {
                const live = hm(l.start_time) <= hmNow && hmNow < hm(l.end_time)
                return (
                  <div key={l.id} className={`flex gap-3 px-4 py-2.5 ${live ? 'bg-accent-soft' : hm(l.end_time) <= hmNow ? 'opacity-60' : ''}`}>
                    <span className="w-12 text-sm tabular-nums">{hm(l.start_time)}</span>
                    <span className="flex-1 min-w-0"><span className="block font-medium">{l.subject}{live && <span className="ml-2 text-xs text-accent font-semibold">Қазір</span>}</span>
                      <span className="block text-xs text-muted truncate">{[l.teacher?.full_name ?? l.teacher_name, l.room && `${l.room}-каб.`].filter(Boolean).join(' · ')}</span></span>
                  </div>
                )
              })}
            </Card>
          )}

          {olympiads.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">Олимпиада бағыттары</h2>
              <div className="flex flex-wrap gap-2">{olympiads.map(([o, n]) => <button key={o} type="button" onClick={() => setQ(q === o ? '' : o)} aria-pressed={q === o}
                className={`h-9 px-3 rounded-full text-sm ${q === o ? 'bg-accent text-on-accent font-semibold' : 'bg-surface-2'}`}>{o} · {n}</button>)}</div>
            </>
          )}

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">Оқушылар · {d.students.length}</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Аты, олимпиада немесе үйірме" aria-label="Оқушыны іздеу" className={inputCls} />
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
                    <span className="block text-xs text-muted truncate">{[s.olympiad && `${s.olympiad} олимпиадасы`, s.club].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  {out && <Badge tone="warn">Сыртта</Badge>}
                  <span className="text-sm tabular-nums text-muted w-10 text-right">{r === null ? '' : `${r}%`}</span>
                </button>
              )
            })}
            {!list.length && <p className="px-4 py-6 text-sm text-muted text-center">Ешкім табылмады</p>}
          </Card>
        </>
      )}

      {open && (
        <Sheet title={open.full_name} onClose={() => setOpen(null)}>
          <div className="grid gap-3">
            <div className="grid justify-items-center gap-2">
              <Avatar name={open.full_name} photo={open.photo} size={128} />
              {(deputy || cls.teacher_id === me.id || cls.tutor_id === me.id) && (
                <label className={`h-11 px-4 rounded-md bg-accent-soft text-accent font-semibold inline-flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
                  <Icon n="user" size={18} />{uploading ? 'Жүктелуде…' : open.photo ? 'Суретті ауыстыру' : 'Сурет қосу'}
                  <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(open, e.target.files[0])} />
                </label>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Олимпиада</dt><dd>{open.olympiad ?? '—'}</dd>
              <dt className="text-muted">Үйірме</dt><dd>{open.club ?? '—'}</dd>
              <dt className="text-muted">Қатысу</dt><dd>{rateOf(open.id) === null ? 'әлі белгі жоқ' : `${rateOf(open.id)}%`}</dd>
              {open.parliament && <><dt className="text-muted">Парламент</dt><dd>мүшесі</dd></>}
            </dl>
            <button type="button" onClick={async () => { try { go(`/c/${await openDirect(open.id)}`) } catch (e) { toast(errText(e)) } }}
              className="h-12 rounded-md bg-accent text-on-accent font-semibold inline-flex items-center justify-center gap-2"><Icon n="chat" />Жеке хат жазу</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
