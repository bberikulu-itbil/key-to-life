import { useState } from 'react'
import { addTeacherDuty, errText, listDuty, listStaff, listTeacherDuty, removeTeacherDuty, setDuty } from '../lib/api'
import { isoDow, today } from '../lib/time'
import { useMe } from '../App'
import { Badge, Button, Card, Field, Icon, PageHead, Sheet, Skeleton, inputCls, toast, useLoad } from '../components/ui'

const DAYS = ['Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі']

export default function Duty() {
  const { me } = useMe()
  const deputyDuty = useLoad(listDuty, [])
  const posts = useLoad(listTeacherDuty, [])
  const staff = useLoad(listStaff, [])
  const [wd, setWd] = useState(isoDow(today()))
  const [adding, setAdding] = useState(false)
  const canEdit = me.role === 'deputy' || me.role === 'admin'
  const deputies = (staff.data ?? []).filter((s) => s.role === 'deputy' || s.role === 'admin')
  const name = (id?: string | null) => staff.data?.find((s) => s.id === id)?.full_name
  const depId = deputyDuty.data?.find((x) => x.weekday === wd)?.deputy_id ?? ''
  const dayPosts = (posts.data ?? []).filter((p) => p.weekday === wd)
  const mine = (posts.data ?? []).filter((p) => p.user_id === me.id)
  const myDeputyDays = (deputyDuty.data ?? []).filter((x) => x.deputy_id === me.id).map((x) => x.weekday)

  const saveDeputy = async (v: string) => { try { await setDuty(wd, v || null); toast('Сақталды'); deputyDuty.reload() } catch (e) { toast(errText(e)) } }
  const remove = async (id: string) => { try { await removeTeacherDuty(id); posts.reload() } catch (e) { toast(errText(e)) } }

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title="Кезекшіліктер" back />
      {(mine.length > 0 || myDeputyDays.length > 0) && (
        <Card className="bg-accent-soft">
          <p className="font-semibold text-accent">Менің кезекшілігім</p>
          <p className="text-sm">{[...myDeputyDays.map((d) => `${DAYS[d - 1]}: кезекші орынбасар`), ...mine.map((p) => `${DAYS[p.weekday - 1]}: ${p.post}`)].join(' · ')}</p>
        </Card>
      )}
      <div role="tablist" aria-label="Апта күні" className="grid grid-cols-7 gap-1 bg-surface-2 rounded-md p-1">
        {DAYS.map((d, i) => <button key={d} type="button" role="tab" aria-selected={wd === i + 1} aria-label={d} onClick={() => setWd(i + 1)}
          className={`h-10 rounded-sm text-sm font-semibold ${wd === i + 1 ? 'bg-surface shadow-card' : 'text-muted'} ${i + 1 === isoDow(today()) ? 'underline underline-offset-4' : ''}`}>{d.slice(0, 2)}</button>)}
      </div>
      {deputyDuty.loading || posts.loading || staff.loading ? <Skeleton /> : (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">Кезекші орынбасар · {DAYS[wd - 1]}</h2>
          <Card>
            {canEdit ? (
              <Field label="Орынбасар" hint="Сынып жетекшісі 20 минутта жауап бермесе, сыртқа шығу өтініші осы кісіге барады">
                {(id, d) => <select id={id} aria-describedby={d} value={depId} onChange={(e) => saveDeputy(e.target.value)} className={inputCls}>
                  <option value="">Белгіленбеген (барлық орынбасарға)</option>{deputies.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}
              </Field>
            ) : <p className="font-semibold">{name(depId) ?? 'Белгіленбеген'}</p>}
          </Card>

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mt-1">Кезекші мұғалімдер · {DAYS[wd - 1]}</h2>
          {!dayPosts.length ? <Card><p className="text-sm text-muted">Бұл күнге кезекшілік белгіленбеген.</p></Card> : (
            <Card className="p-0 divide-y divide-line">
              {dayPosts.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-4 min-h-14">
                  <span className="flex-1 min-w-0"><span className="block font-medium">{p.user.full_name}</span><span className="block text-sm text-muted">{p.post}</span></span>
                  {p.user_id === me.id && <Badge tone="accent">Мен</Badge>}
                  {canEdit && <button type="button" onClick={() => remove(p.id)} aria-label={`${p.user.full_name}, ${p.post} — алып тастау`} className="size-11 grid place-items-center text-muted"><Icon n="x" size={18} /></button>}
                </div>
              ))}
            </Card>
          )}
          {canEdit && <Button kind="secondary" onClick={() => setAdding(true)}>Кезекшілік қосу</Button>}
        </>
      )}
      {adding && <Sheet title={`Кезекшілік · ${DAYS[wd - 1]}`} onClose={() => setAdding(false)}>
        <AddPost wd={wd} staff={(staff.data ?? []).filter((s) => s.role !== 'student')} onDone={() => { setAdding(false); posts.reload() }} /></Sheet>}
    </div>
  )
}

function AddPost({ wd, staff, onDone }: { wd: number; staff: { id: string; full_name: string }[]; onDone: () => void }) {
  const [user, setUser] = useState('')
  const [post, setPost] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!user || post.trim().length < 2) return toast('Мұғалім мен кезекшілік орнын толтырыңыз')
    setBusy(true)
    try { await addTeacherDuty(wd, user, post.trim()); toast('Қосылды'); onDone() } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <Field label="Мұғалім">{(id) => <select id={id} value={user} onChange={(e) => setUser(e.target.value)} className={inputCls}><option value="">Таңдаңыз</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>}</Field>
      <Field label="Кезекшілік орны">{(id) => <><input id={id} list="posts" value={post} onChange={(e) => setPost(e.target.value)} className={inputCls} placeholder="1-қабат, Асхана, Жатақхана…" />
        <datalist id="posts">{['1-қабат дәлізі', '2-қабат дәлізі', '3-қабат дәлізі', 'Асхана', 'Кіреберіс', 'Жатақхана'].map((p) => <option key={p} value={p} />)}</datalist></>}</Field>
      <Button block loading={busy} onClick={save}>Қосу</Button>
    </div>
  )
}
