import { useState } from 'react'
import { addResult, decideJoin, listRoles, removeRole, saveRole, type ActRole, errText, issueCertificates, listCertificates, listJoinRequests, listMatches, listResults, removeMatch, removeResult, requestJoin, saveMatch,
  type ActivityFull, type Match, type Me } from '../lib/api'
import { fmtDate } from '../lib/time'
import { Button, Card, Field, Icon, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

/* ---------- join by request ---------- */

/** Student side: send a request, then see its state. */
export function JoinRequestBox({ a, onSent }: { a: ActivityFull; onSent: () => void }) {
  const mine = useLoad(() => listJoinRequests(a.id), [a.id])
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const r = mine.data?.[0]
  const send = async () => {
    setBusy(true)
    try { await requestJoin(a.id, note); toast(tx('Өтінім жіберілді')); setOpen(false); mine.reload(); onSent() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  if (mine.loading && !mine.data) return <Skeleton rows={1} />
  if (r?.status === 'pending') return <Card className="bg-accent-soft"><p className="font-semibold">{tx('Өтініміңіз қаралуда')}</p><p className="text-sm text-muted">{tx('Жетекші шешкенде хабарлама келеді.')}</p></Card>
  return (
    <>
      {r?.status === 'declined' && <p className="text-sm text-muted">{tx('Алдыңғы өтініміңіз қабылданбады. Қайта жібере аласыз.')}</p>}
      <Button kind="gold" block onClick={() => setOpen(true)}>{tx('Қатысуға өтінім беру')}</Button>
      {open && <Sheet title={tx('Қатысуға өтінім')} onClose={() => setOpen(false)}>
        <div className="grid gap-4">
          <Field label={tx('Өзіңіз туралы қысқаша')} hint={tx('Міндетті емес: неге қатысқыңыз келеді, тәжірибеңіз')}>{(id, d) =>
            <textarea id={id} aria-describedby={d} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={`${inputCls} h-24 py-2`} />}</Field>
          <Button block loading={busy} onClick={send}>{tx('Жіберу')}</Button>
        </div>
      </Sheet>}
    </>
  )
}

/** Leader side: pending requests with accept / decline. */
export function JoinRequestsPanel({ a, onChange }: { a: ActivityFull; onChange: () => void }) {
  const list = useLoad(() => listJoinRequests(a.id), [a.id])
  const pending = (list.data ?? []).filter((r) => r.status === 'pending')
  const decide = async (student: string, ok: boolean) => {
    try { await decideJoin(a.id, student, ok); toast(ok ? tx('Қабылданды') : tx('Қабылданбады')); list.reload(); onChange() } catch (e) { toast(errText(e)) }
  }
  if (!pending.length) return null
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-2">{tx('Қатысуға өтінімдер · {0}', pending.length)}</h2>
      <Card className="p-0 divide-y divide-line">
        {pending.map((r) => (
          <div key={r.student_id} className="grid gap-2 px-4 py-3">
            <p><span className="font-semibold">{r.student.full_name}</span> <span className="text-sm text-muted">{r.student.class?.name}</span></p>
            {r.note && <p className="text-sm text-muted whitespace-pre-line break-words">{r.note}</p>}
            <div className="grid grid-cols-2 gap-2"><Button kind="secondary" onClick={() => decide(r.student_id, false)}>{tx('Бас тарту')}</Button><Button onClick={() => decide(r.student_id, true)}>{tx('Қабылдау')}</Button></div>
          </div>
        ))}
      </Card>
    </section>
  )
}

/* ---------- results: matches by round, final places, certificates ---------- */

export function Results({ a, canEdit, me }: { a: ActivityFull; canEdit: boolean; me: Me }) {
  const data = useLoad(() => Promise.all([listMatches(a.id), listResults(a.id), listCertificates({ activity: a.id })]), [a.id])
  const [sheet, setSheet] = useState<null | { kind: 'match'; m?: Match } | { kind: 'place' } | { kind: 'cert' }>(null)
  const [matches, results, certs] = data.data ?? [[], [], []]
  const rounds = [...new Set(matches.map((m) => m.round))]
  const done = () => { setSheet(null); data.reload() }
  const run = async (f: () => Promise<unknown>) => { try { await f(); data.reload() } catch (e) { toast(errText(e)) } }
  const myCerts = certs.filter((c) => c.student_id === me.id)
  if (data.loading && !data.data) return <Skeleton rows={2} />
  return (
    <div className="grid gap-3">
      {myCerts.map((c) => (
        <a key={c.id} href={`#/cert/${c.code}`} className="flex items-center gap-3 rounded-lg bg-gold-soft px-4 py-3">
          <span className="size-10 rounded-md bg-gold text-on-gold grid place-items-center"><Icon n="trophy" size={20} /></span>
          <span className="flex-1"><span className="block font-semibold">{tx('Сертификатыңыз')}</span><span className="block text-sm text-muted">{c.title}</span></span><Icon n="chev" />
        </a>
      ))}

      <div className="flex items-baseline justify-between mt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Орындар')}</h2>
        {canEdit && <button type="button" onClick={() => setSheet({ kind: 'place' })} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Қосу')}</button>}
      </div>
      {!results.length ? <Card><p className="text-sm text-muted">{tx('Қорытынды орындар әлі жазылмаған.')}</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`size-9 rounded-full grid place-items-center font-display font-bold shrink-0 ${r.place === 1 ? 'bg-gold text-on-gold' : 'bg-surface-2'}`}>{r.place}</span>
              <span className="flex-1 min-w-0"><span className="block font-semibold break-words">{r.name}</span>{r.note && <span className="block text-sm text-muted">{r.note}</span>}</span>
              {canEdit && <button type="button" onClick={() => run(() => removeResult(r.id))} aria-label={tx('{0} — өшіру', r.name)} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
            </div>
          ))}
        </Card>
      )}

      <div className="flex items-baseline justify-between mt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Ойындар')}</h2>
        {canEdit && <button type="button" onClick={() => setSheet({ kind: 'match' })} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Ойын қосу')}</button>}
      </div>
      {!matches.length ? <Card><p className="text-sm text-muted">{tx('Ойындар кестесі әлі жоқ.')}</p></Card> : rounds.map((round) => (
        <section key={round} className="grid gap-1.5">
          <h3 className="text-sm font-semibold">{round}</h3>
          <Card className="p-0 divide-y divide-line">
            {matches.filter((m) => m.round === round).map((m) => {
              const win = m.score_a !== null && m.score_b !== null ? (m.score_a > m.score_b ? 'a' : m.score_b > m.score_a ? 'b' : '') : ''
              const body = (
                <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 w-full">
                  <span className={`text-right break-words ${win === 'a' ? 'font-bold' : ''}`}>{m.side_a}</span>
                  <span className="font-display tabular-nums px-2 py-0.5 rounded-md bg-surface-2 text-sm">{m.score_a ?? '–'} : {m.score_b ?? '–'}</span>
                  <span className={`break-words ${win === 'b' ? 'font-bold' : ''}`}>{m.side_b}</span>
                  {m.played_on && <span className="col-span-3 text-center text-xs text-muted">{fmtDate(m.played_on)}</span>}
                </span>
              )
              return canEdit ? <button key={m.id} type="button" onClick={() => setSheet({ kind: 'match', m })} className="w-full text-left">{body}</button> : <div key={m.id}>{body}</div>
            })}
          </Card>
        </section>
      ))}

      {canEdit && <Button kind="secondary" onClick={() => setSheet({ kind: 'cert' })}><Icon n="trophy" size={18} />{tx('Сертификат беру')}</Button>}
      {canEdit && certs.length > 0 && <p className="text-sm text-muted">{tx('Берілген сертификаттар: {0}', certs.length)}</p>}

      {sheet?.kind === 'match' && <Sheet title={sheet.m ? tx('Ойын') : tx('Жаңа ойын')} onClose={() => setSheet(null)}>
        <MatchForm a={a} m={sheet.m} next={matches.length} lastRound={rounds[rounds.length - 1] ?? ''} onDone={done} /></Sheet>}
      {sheet?.kind === 'place' && <Sheet title={tx('Орын қосу')} onClose={() => setSheet(null)}><PlaceForm a={a} next={results.length + 1} onDone={done} /></Sheet>}
      {sheet?.kind === 'cert' && <Sheet title={tx('Сертификат беру')} onClose={() => setSheet(null)}><CertForm a={a} onDone={done} /></Sheet>}
    </div>
  )
}

function MatchForm({ a, m, next, lastRound, onDone }: { a: ActivityFull; m?: Match; next: number; lastRound: string; onDone: () => void }) {
  const [f, setF] = useState({ round: m?.round ?? lastRound, side_a: m?.side_a ?? '', side_b: m?.side_b ?? '', score_a: m?.score_a?.toString() ?? '', score_b: m?.score_b?.toString() ?? '', played_on: m?.played_on ?? '' })
  const [busy, setBusy] = useState(false)
  const num = (v: string) => (v === '' ? null : Math.min(999, Number(v)))
  const save = async () => {
    if (!f.round.trim() || !f.side_a.trim() || !f.side_b.trim()) return toast(tx('Кезеңді және екі жақты жазыңыз'))
    setBusy(true)
    try {
      await saveMatch({ ...(m ? { id: m.id } : { sort: next }), activity_id: a.id, round: f.round.trim(), side_a: f.side_a.trim(), side_b: f.side_b.trim(),
        score_a: num(f.score_a), score_b: num(f.score_b), played_on: f.played_on || null })
      toast(tx('Сақталды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const del = async () => { if (!m) return; try { await removeMatch(m.id); onDone() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-4">
      <Field label={tx('Кезең')} hint={tx('Мысалы: 1/4 финал, Финал, 2-тур')}>{(id, d) => <input id={id} aria-describedby={d} value={f.round} maxLength={40} onChange={(e) => setF({ ...f, round: e.target.value })} className={inputCls} />}</Field>
      <div className="grid grid-cols-[1fr_72px] gap-2 items-end">
        <Field label={tx('1-жақ')}>{(id) => <input id={id} value={f.side_a} maxLength={80} onChange={(e) => setF({ ...f, side_a: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Ұпай')}>{(id) => <input id={id} inputMode="numeric" value={f.score_a} onChange={(e) => setF({ ...f, score_a: e.target.value.replace(/\D/g, '') })} className={`${inputCls} tabular-nums`} />}</Field>
        <Field label={tx('2-жақ')}>{(id) => <input id={id} value={f.side_b} maxLength={80} onChange={(e) => setF({ ...f, side_b: e.target.value })} className={inputCls} />}</Field>
        <Field label={tx('Ұпай')}>{(id) => <input id={id} inputMode="numeric" value={f.score_b} onChange={(e) => setF({ ...f, score_b: e.target.value.replace(/\D/g, '') })} className={`${inputCls} tabular-nums`} />}</Field>
      </div>
      <Field label={tx('Күні')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} type="date" value={f.played_on} onChange={(e) => setF({ ...f, played_on: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {m && <Button block kind="danger" onClick={del}>{tx('Өшіру')}</Button>}
    </div>
  )
}

function PlaceForm({ a, next, onDone }: { a: ActivityFull; next: number; onDone: () => void }) {
  const [f, setF] = useState({ place: String(next), name: '', note: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!f.name.trim()) return toast(tx('Атауын жазыңыз'))
    setBusy(true)
    try { await addResult({ activity_id: a.id, place: Math.max(1, Number(f.place) || 1), name: f.name.trim(), note: f.note.trim() || null }); toast(tx('Қосылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <Field label={tx('Орын')}>{(id) => <input id={id} inputMode="numeric" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value.replace(/\D/g, '') })} className={`${inputCls} tabular-nums`} />}</Field>
        <Field label={tx('Кім')}>{(id) => <input id={id} value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder={tx('Оқушы немесе команда')} />}</Field>
      </div>
      <Field label={tx('Ескерту')} hint={tx('Міндетті емес')}>{(id, d) => <input id={id} aria-describedby={d} value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} />}</Field>
      <Button block loading={busy} onClick={save}>{tx('Қосу')}</Button>
    </div>
  )
}

function CertForm({ a, onDone }: { a: ActivityFull; onDone: () => void }) {
  const people = a.enrollments.filter((e) => !e.waitlisted)
  const [sel, setSel] = useState<string[]>([])
  const [title, setTitle] = useState(tx('Белсенді қатысқаны үшін'))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const save = async () => {
    if (!sel.length) return toast(tx('Кемінде бір оқушыны таңдаңыз'))
    setBusy(true)
    try { const n = await issueCertificates(a.id, sel, title); toast(tx('{0} сертификат берілді', n)); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label={tx('Не үшін')} hint={tx('Мысалы: 1-орын, Жүлдегер, Белсенді қатысқаны үшін')}>{(id, d) => <input id={id} aria-describedby={d} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputCls} />}</Field>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{tx('Кімге · {0}', sel.length)}</p>
        <button type="button" onClick={() => setSel(sel.length === people.length ? [] : people.map((p) => p.student_id))} className="text-sm text-accent font-semibold min-h-10">{sel.length === people.length ? tx('Ешкім') : tx('Барлығы')}</button>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-line divide-y divide-line">
        {people.map((p) => (
          <label key={p.student_id} className="flex items-center gap-3 min-h-11 px-3">
            <input type="checkbox" checked={sel.includes(p.student_id)} onChange={() => toggle(p.student_id)} className="size-5 accent-[var(--accent)]" />
            <span className="flex-1 min-w-0 truncate">{p.student.full_name}</span><span className="text-xs text-muted">{p.student.class?.name}</span>
          </label>
        ))}
      </div>
      <Button block loading={busy} onClick={save}>{tx('Беру')}</Button>
    </div>
  )
}

/* ---------- roles inside the initiative: «Капитан», «Мәдениет министрі» ---------- */

export function Roles({ a, canEdit }: { a: ActivityFull; canEdit: boolean }) {
  const list = useLoad(() => listRoles(a.id), [a.id])
  const [edit, setEdit] = useState<null | { r?: ActRole }>(null)
  const roles = list.data ?? []
  if (!roles.length && !canEdit) return null
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between mt-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{tx('Командадағы рөлдер')}</h2>
        {canEdit && <button type="button" onClick={() => setEdit({})} className="text-sm text-accent font-semibold min-h-11 px-1">{tx('Рөл қосу')}</button>}
      </div>
      {!roles.length ? <Card><p className="text-sm text-muted">{tx('Рөл беріңіз: капитан, министр, хатшы. Рөл иесі лентаға сол рөлдің атынан жаза алады.')}</p></Card> : (
        <Card className="p-0 divide-y divide-line">
          {roles.map((r) => {
            const body = (
              <span className="flex items-center gap-3 px-4 py-3 w-full text-left">
                <span className="size-9 rounded-full bg-gold-soft text-[var(--on-gold)] grid place-items-center shrink-0"><Icon n="star" size={16} /></span>
                <span className="flex-1 min-w-0"><span className="block font-semibold break-words">{r.title}</span><span className="block text-sm text-muted">{r.holder?.full_name ?? tx('Бос')}</span></span>
                {canEdit && <Icon n="chev" size={16} className="text-muted" />}
              </span>
            )
            return canEdit ? <button key={r.id} type="button" onClick={() => setEdit({ r })} className="w-full">{body}</button> : <div key={r.id}>{body}</div>
          })}
        </Card>
      )}
      {edit && <Sheet title={edit.r ? tx('Рөл') : tx('Жаңа рөл')} onClose={() => setEdit(null)}>
        <RoleForm a={a} r={edit.r} next={roles.length} onDone={() => { setEdit(null); list.reload() }} />
      </Sheet>}
    </section>
  )
}

function RoleForm({ a, r, next, onDone }: { a: ActivityFull; r?: ActRole; next: number; onDone: () => void }) {
  const [f, setF] = useState({ title: r?.title ?? '', holder: r?.holder_id ?? '' })
  const [busy, setBusy] = useState(false)
  // the leader and the participants may hold a role
  const people = [{ id: a.supervisor_id, name: a.supervisor.full_name }, ...a.enrollments.filter((e) => !e.waitlisted).map((e) => ({ id: e.student_id, name: e.student.full_name }))]
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Рөлдің атауын жазыңыз'))
    setBusy(true)
    try { await saveRole({ ...(r ? { id: r.id } : { sort: next }), activity_id: a.id, title: f.title.trim(), holder_id: f.holder || null }); toast(tx('Сақталды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  const del = async () => { if (!r) return; try { await removeRole(r.id); onDone() } catch (e) { toast(errText(e)) } }
  return (
    <div className="grid gap-4">
      <Field label={tx('Рөл')}>{(id) => <input id={id} value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Мысалы: Мәдениет министрі')} />}</Field>
      <Field label={tx('Кімде')}>{(id) => <select id={id} value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} className={inputCls}>
        <option value="">{tx('Бос')}</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>}</Field>
      <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
      {r && <Button block kind="danger" onClick={del}>{tx('Өшіру')}</Button>}
    </div>
  )
}
