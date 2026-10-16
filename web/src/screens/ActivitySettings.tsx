import { useEffect, useMemo, useState } from 'react'
import { acceptWaitlisted, addParticipant, cancelActivity, errText, getActivity, listPeople, removeActivity, removeParticipant, setActivityFlags, setCurators, type ActivityFull } from '../lib/api'
import { useMe } from '../App'
import Avatar from '../components/Avatar'
import { Modules } from './ActivityDetail'
import { Badge, Button, Card, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, go, inputCls, toast, useLoad } from '../components/ui'

const H = ({ children }: { children: string }) => <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-3">{children}</h2>

export default function ActivitySettings({ id }: { id: string }) {
  const { me } = useMe()
  const { data: a, error, loading, reload } = useLoad(() => getActivity(id), [id])
  const [sheet, setSheet] = useState<null | 'modules' | 'add' | 'cancel' | 'remove'>(null)
  const [curators, setCuratorsState] = useState<string[]>([])
  const [savingCurators, setSavingCurators] = useState(false)
  useEffect(() => setCuratorsState(a?.curators?.map((x) => x.student_id) ?? (a?.curator_id ? [a.curator_id] : [])), [a?.curators, a?.curator_id])
  if (loading && !a) return <><PageHead title="Баптаулар" back /><Skeleton /></>
  if (error || !a) return <><PageHead title="Баптаулар" back /><ErrorBox text={error ?? 'Табылмады'} retry={reload} /></>
  const manager = a.supervisor_id === me.id || me.role === 'deputy' || me.role === 'admin'
  if (!manager) return <><PageHead title="Баптаулар" back /><Card><p>Іс-шараны жетекші немесе орынбасар баптайды.</p></Card></>

  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast(done); reload() } catch (e) { toast(errText(e)) } }
  const saveCurators = async () => { setSavingCurators(true); try { await setCurators(a.id, curators); toast(curators.length ? 'Жауапты оқушылар сақталды' : 'Жауапты оқушылар алынды'); reload() } catch (e) { toast(errText(e)) } finally { setSavingCurators(false) } }
  const joined = a.enrollments.filter((e) => !e.waitlisted)
  const waiting = a.enrollments.filter((e) => e.waitlisted)

  const csv = () => {
    const rows = [['№', 'Аты-жөні', 'Сынып', 'Күйі'], ...a.enrollments.map((e, i) => [String(i + 1), e.student.full_name, e.student.class?.name ?? '', e.waitlisted ? 'күту тізімі' : 'қатысушы'])]
    const blob = new Blob(['﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob); link.download = `${a.title}.csv`; link.click()
  }

  return (
    <div className="grid gap-2 pb-8">
      <PageHead title="Баптаулар" back />
      <p className="text-sm text-muted -mt-2 truncate">{a.title}</p>

      <H>Негізгі</H>
      <Card className="p-0 divide-y divide-line">
        <Item icon="file" title="Атауы, сипаттамасы, орны, уақыты" hint="Жетекшіні де осы жерде ауыстырасыз" onClick={() => go(`/a/${a.id}/edit`)} />
        <Item icon="grid" title="Бөлімдер" hint="Чат, тапсырмалар, силабус, күнтізбе, келу есебі" onClick={() => setSheet('modules')} />
      </Card>

      <H>Тіркелу</H>
      <Card className="grid gap-3">
        <Toggle label="Тіркелу ашық" hint="Жабық болса, оқушылар өздері жазыла алмайды, тек сіз қосасыз" on={a.enrollment_open}
          onChange={(v) => act(() => setActivityFlags(a.id, v, null), v ? 'Тіркелу ашылды' : 'Тіркелу жабылды')} />
        {joined.length > 0 && (
          <div className="grid gap-2">
            <div>
              <p className="text-sm font-semibold">Жауапты оқушылар</p>
              <p className="text-sm text-muted">Бірнеше оқушыны таңдауға болады. Олар рұқсат сұрауларын көріп, іс-шара лентасына жаза алады.</p>
            </div>
            <div className="grid divide-y divide-line rounded-md border border-line">
              {joined.map((e) => (
                <label key={e.student_id} className="flex items-center gap-3 min-h-14 px-3">
                  <input type="checkbox" checked={curators.includes(e.student_id)} onChange={() => setCuratorsState(curators.includes(e.student_id) ? curators.filter((x) => x !== e.student_id) : [...curators, e.student_id])} className="size-5 accent-[var(--accent)]" />
                  <Avatar name={e.student.full_name} photo={e.student.photo} size={32} />
                  <span className="flex-1 min-w-0"><span className="block truncate">{e.student.full_name}</span><span className="block text-xs text-muted">{e.student.class?.name ?? ''}</span></span>
                </label>
              ))}
            </div>
            <Button kind="secondary" loading={savingCurators} onClick={saveCurators}>Сақтау</Button>
          </div>
        )}
      </Card>

      <div className="flex items-baseline justify-between">
        <H>{`Қатысушылар · ${joined.length}${a.capacity ? `/${a.capacity}` : ''}`}</H>
        <div className="flex gap-1">
          {a.enrollments.length > 0 && <Button kind="ghost" onClick={csv}>Жүктеу</Button>}
          <Button kind="ghost" onClick={() => setSheet('add')}>Қосу</Button>
        </div>
      </div>
      {!a.enrollments.length ? <Card><p className="text-sm text-muted">Әзірге ешкім жоқ. «Қосу» арқылы оқушыларды өзіңіз тіркей аласыз.</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {[...joined, ...waiting].map((e) => (
            <div key={e.student_id} className="flex items-center gap-3 px-4 py-2">
              <Avatar name={e.student.full_name} photo={e.student.photo} size={36} />
              <span className="flex-1 min-w-0"><span className="block truncate">{e.student.full_name}</span><span className="block text-xs text-muted">{e.student.class?.name ?? ''}</span></span>
              {e.waitlisted && <Button kind="secondary" onClick={() => act(() => acceptWaitlisted(a.id, e.student_id), 'Қабылданды')}>Қабылдау</Button>}
              <button type="button" onClick={() => act(() => removeParticipant(a.id, e.student_id), 'Шығарылды')} aria-label={`${e.student.full_name} — шығару`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>
            </div>
          ))}
        </Card>
      )}

      <H>Басқа</H>
      <Card className="p-0 divide-y divide-line">
        <Item icon="plus" title="Көшірмесін жасау" hint="Келесі тоқсанға немесе басқа топқа" onClick={() => go(`/a/copy/${a.id}`)} />
        <Item icon="inbox" title={a.archived_at ? 'Архивтен шығару' : 'Архивтеу'} hint={a.archived_at ? 'Қайта лентада көрінеді' : 'Лентадан жасырылады, деректері мен журналы сақталады'}
          onClick={() => act(() => setActivityFlags(a.id, null, !a.archived_at), a.archived_at ? 'Архивтен шығарылды' : 'Архивке жіберілді')} />
        {a.status === 'approved' && <Item icon="clock" title="Тоқтату" hint="Қатысушыларға себебімен хабар барады" danger onClick={() => setSheet('cancel')} />}
        <Item icon="x" title="Жою" hint="Іс-шара барлығынан жасырылады" danger onClick={() => setSheet('remove')} />
      </Card>

      {sheet === 'modules' && <Sheet title="Бөлімдер" onClose={() => setSheet(null)}><Modules a={a} onDone={() => { setSheet(null); reload() }} /></Sheet>}
      {sheet === 'add' && <Sheet title="Оқушы қосу" onClose={() => setSheet(null)}><AddPeople a={a} onAdded={reload} /></Sheet>}
      {sheet === 'cancel' && <Sheet title="Тоқтату" onClose={() => setSheet(null)}><Confirm label="Себебі" hint="Қатысушыларға хабар барады" button="Тоқтату" min={3}
        onConfirm={(v) => act(() => cancelActivity(a.id, v), 'Іс-шара тоқтатылды').then(() => setSheet(null))} /></Sheet>}
      {sheet === 'remove' && <Sheet title="Жою" onClose={() => setSheet(null)}><Confirm label={`Растау үшін атауын жазыңыз: «${a.title}»`} button="Біржола жою" match={a.title}
        onConfirm={() => removeActivity(a.id).then(() => { toast('Жойылды'); go('/') }, (e) => toast(errText(e)))} /></Sheet>}
    </div>
  )
}

const Item = ({ icon, title, hint, onClick, danger }: { icon: string; title: string; hint?: string; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 min-h-14 px-4 py-2 text-left ${danger ? 'text-danger' : ''}`}>
    <span className={`size-9 rounded-sm grid place-items-center ${danger ? 'bg-danger-soft' : 'bg-accent-soft text-accent'}`}><Icon n={icon} size={18} /></span>
    <span className="flex-1 min-w-0"><span className="block font-medium">{title}</span>{hint && <span className="block text-sm text-muted">{hint}</span>}</span>
    <Icon n="chev" className="text-muted" />
  </button>
)

const Toggle = ({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-3 min-h-12">
    <span className="flex-1"><span className="block font-semibold">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--accent)]" />
  </label>
)

function AddPeople({ a, onAdded }: { a: ActivityFull; onAdded: () => void }) {
  const people = useLoad(listPeople, [])
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const inIt = new Set([...a.enrollments.map((e) => e.student_id), ...added])
  const list = useMemo(() => (people.data ?? []).filter((p) => p.role === 'student' && !inIt.has(p.id)
    && (p.full_name + (p.class?.name ?? '')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60), [people.data, q, inIt.size])
  const add = async (id: string) => { try { await addParticipant(a.id, id); setAdded([...added, id]); onAdded() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Аты-жөні немесе сынып, мысалы 7B" aria-label="Оқушыны іздеу" className={inputCls} autoFocus />
      {added.length > 0 && <p className="text-sm text-success">{added.length} оқушы қосылды, оларға хабар кетті</p>}
      {people.loading ? <Skeleton rows={2} /> : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 min-h-12">
              <span className="flex-1 min-w-0 truncate">{p.full_name} <span className="text-sm text-muted">{p.class?.name}</span></span>
              <Button kind="secondary" onClick={() => add(p.id)}>Қосу</Button>
            </li>
          ))}
          {!list.length && <li className="py-4 text-sm text-muted text-center">Ешкім табылмады</li>}
        </ul>
      )}
      {a.capacity && a.enrollments.filter((e) => !e.waitlisted).length + added.length >= a.capacity && <Badge tone="warn">Орын саны толды, бірақ өзіңіз қоса аласыз</Badge>}
    </div>
  )
}

function Confirm({ label, hint, button, min = 0, match, onConfirm }: { label: string; hint?: string; button: string; min?: number; match?: string; onConfirm: (v: string) => void }) {
  const [v, setV] = useState('')
  const ok = match ? v.trim() === match.trim() : v.trim().length >= min
  return (
    <div className="grid gap-4">
      <Field label={label} hint={hint}>{(id, d) => <input id={id} aria-describedby={d} value={v} onChange={(e) => setV(e.target.value)} className={inputCls} />}</Field>
      <Button block kind="danger" disabled={!ok} onClick={() => onConfirm(v.trim())}>{button}</Button>
    </div>
  )
}
