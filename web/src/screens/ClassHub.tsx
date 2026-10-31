import { useState } from 'react'
import { addClassHubResource, addTask, classStudents, errText, listClassHubResources, listClasses, listTasks, setClassHubResourceProgress, setTaskDone, type ClassIngredient, type ClassResource, type ClassResourceKind, type ClassResourceProgress, type Student, type Task } from '../lib/api'
import { useMe } from '../App'
import { Badge, Button, Card, Chips, Empty, ErrorBox, Field, Icon, PageHead, Sheet, Skeleton, inputCls, toast, useLoad } from '../components/ui'
import { fmtDate, today } from '../lib/time'
import { tx } from '../lib/i18n'

const KIND_LABEL: Record<ClassResourceKind, string> = { book: tx('Кітап'), movie: tx('Фильм'), recipe: tx('Рецепт') }
const KIND_ICON: Record<ClassResourceKind, string> = { book: 'book', movie: 'file', recipe: 'utensils' }
const STATUS_LABEL: Record<ClassResourceProgress['status'], string> = { saved: tx('Тізімімде'), in_progress: tx('Басталды'), done: tx('Орындалды') }

export default function ClassHub({ classId }: { classId?: string }) {
  const { me } = useMe()
  const [tab, setTab] = useState<'resources' | 'plans'>('resources')
  const [kind, setKind] = useState<'all' | ClassResourceKind>('all')
  const [mine, setMine] = useState(false)
  const [resourceForm, setResourceForm] = useState(false)
  const [planForm, setPlanForm] = useState(false)
  const data = useLoad(async () => {
    if (!classId) return null
    const [classes, students, resources, tasks] = await Promise.all([listClasses(), classStudents(classId), listClassHubResources(classId), listTasks()])
    return { cls: classes.find((c) => c.id === classId) ?? null, students, resources, tasks: tasks.filter((t) => t.class_id === classId) }
  }, [classId])
  const d = data.data
  const manager = !!d?.cls && (me.role === 'deputy' || me.role === 'admin' || d.cls.teacher_id === me.id || d.cls.tutor_id === me.id)
  const resources = (d?.resources ?? []).filter((r) => (kind === 'all' || r.kind === kind) && (!mine || r.progress.some((p) => p.user_id === me.id)))

  const progress = async (resourceId: string, volume: number, status: ClassResourceProgress['status'], rating: number | null) => {
    try { await setClassHubResourceProgress(resourceId, me.id, volume, status, rating); data.reload() } catch (e) { toast(errText(e)) }
  }

  if (data.loading && !d) return <><PageHead title={tx('Сынып жобалары')} back /><Skeleton /></>
  if (data.error) return <><PageHead title={tx('Сынып жобалары')} back /><ErrorBox text={data.error} retry={data.reload} /></>
  if (!classId || !d?.cls) return <><PageHead title={tx('Сынып жобалары')} back /><Card><Empty icon="users" title={tx('Сынып табылмады')} /></Card></>

  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сынып жобалары')} back right={manager && <Button kind="secondary" onClick={() => tab === 'resources' ? setResourceForm(true) : setPlanForm(true)}><Icon n="plus" size={18} />{tx('Қосу')}</Button>} />
      <Card className="grid gap-1 bg-accent-soft">
        <p className="font-bold">{tx('{0} сыныбы', d.cls.name)}</p>
        <p className="text-sm text-muted">{tx('Кітап, фильм, рецепт және сынып жоспары бір жерде.')}</p>
      </Card>
      <Chips label={tx('Бөлім')} value={tab} onChange={setTab} items={[["resources", tx('Кітап · фильм · рецепт')], ['plans', tx('Сынып жоспары')]]} />
      {tab === 'resources' ? (
        <>
          <Chips label={tx('Түрі')} value={kind} onChange={setKind} items={[["all", tx('Барлығы')], ['book', tx('Кітап')], ['movie', tx('Фильм')], ['recipe', tx('Рецепт')]]} />
          <button type="button" onClick={() => setMine(!mine)} aria-pressed={mine} className={`h-11 rounded-md text-sm font-semibold ${mine ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}>{tx('Менің тізімім')}</button>
          {!resources.length ? <Card><Empty icon={kind === 'recipe' ? 'utensils' : 'book'} title={mine ? tx('Тізіміңіз әзірге бос') : tx('Әзірге ештеңе қосылмады')} text={manager ? tx('Оқушыларға пайдалы кітап, фильм немесе рецепт қосыңыз.') : undefined} /></Card>
            : resources.map((r) => <ResourceCard key={r.id} resource={r} me={me.id} onProgress={progress} />)}
        </>
      ) : <PlansTab tasks={d.tasks} students={d.students} me={me.id} manager={manager} onAdd={() => setPlanForm(true)} onReload={data.reload} />}
      {resourceForm && <Sheet title={tx('Кітап, фильм немесе рецепт қосу')} onClose={() => setResourceForm(false)}><ResourceForm classId={classId} onDone={() => { setResourceForm(false); data.reload() }} /></Sheet>}
      {planForm && <Sheet title={tx('Сынып жоспарына қосу')} onClose={() => setPlanForm(false)}><PlanForm classId={classId} students={d.students} onDone={() => { setPlanForm(false); data.reload() }} /></Sheet>}
    </div>
  )
}

function ResourceCard({ resource: r, me, onProgress }: { resource: ClassResource; me: string; onProgress: (id: string, volume: number, status: ClassResourceProgress['status'], rating: number | null) => void }) {
  const [servings, setServings] = useState(r.servings ?? 1)
  const volumes = r.kind === 'book' ? Math.max(1, r.volumes) : 1
  const mine = (v: number) => r.progress.find((p) => p.user_id === me && p.volume === v)
  const completed = r.progress.filter((p) => p.status === 'done').map((p) => p.user.full_name)
  const ratio = r.kind === 'recipe' && r.servings ? servings / r.servings : 1
  const total = r.ingredients.reduce((s, x) => s + (Number(x.price) || 0), 0) * ratio
  const scaled = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

  return (
    <Card className="grid gap-3">
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-md bg-accent-soft text-accent grid place-items-center shrink-0"><Icon n={KIND_ICON[r.kind]} size={20} /></span>
        <div className="flex-1 min-w-0"><p className="text-lg font-bold break-words">{r.title}</p><p className="text-xs text-muted">{KIND_LABEL[r.kind]} · {tx('ұсынған')}: {r.author.full_name}</p></div>
      </div>
      {r.original_title && <p className="text-sm"><span className="text-muted">{tx('Түпнұсқа атауы')}:</span> {r.original_title}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {r.release_year && <Badge tone="muted">{r.release_year}</Badge>}
        {r.country && <Badge tone="muted">{r.country}</Badge>}
        {r.duration_minutes && <Badge tone="accent">{r.duration_minutes} {tx('минут')}</Badge>}
        {r.pages && <Badge tone="accent">{r.pages} {tx('бет')}</Badge>}
        {r.kind === 'book' && <Badge tone="muted">{r.volumes} {tx('том')}</Badge>}
        {r.kind === 'recipe' && r.servings && <Badge tone="accent">{r.servings} {tx('адамға')}</Badge>}
        {r.kind === 'recipe' && r.prep_minutes && <Badge tone="muted">{r.prep_minutes} {tx('минут')}</Badge>}
      </div>
      {r.description && <p className="text-sm whitespace-pre-line">{r.description}</p>}
      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{r.kind === 'book' && volumes > 1 ? tx('Томдар') : tx('Менің белгіім')}</p>
        {Array.from({ length: volumes }, (_, i) => {
          const v = i + 1; const p = mine(v); const done = p?.status === 'done'
          return <div key={v} className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
            <button type="button" onClick={() => onProgress(r.id, v, done ? 'saved' : 'done', p?.rating ?? null)} aria-pressed={done} className={`size-8 rounded-full grid place-items-center shrink-0 ${done ? 'bg-success text-white' : 'bg-surface border border-line'}`}><Icon n="check" size={17} /></button>
            <span className="flex-1 min-w-0 text-sm font-medium">{r.kind === 'book' && volumes > 1 ? tx('{0}-том', v) : p ? STATUS_LABEL[p.status] : tx('Тізіміме қосу')}</span>
            <select aria-label={tx('{0} бағасы', r.title)} value={p?.rating ?? ''} onChange={(e) => onProgress(r.id, v, p?.status ?? 'saved', e.target.value ? Number(e.target.value) : null)} className="h-9 rounded-md border border-input bg-surface px-2 text-sm">
              <option value="">{tx('Баға')}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
            </select>
          </div>
        })}
      </div>
      {completed.length > 0 && <p className="text-xs text-muted">{tx('Орындағандар')}: {completed.join(', ')}</p>}
      {r.kind === 'recipe' && r.ingredients.length > 0 && (
        <div className="grid gap-2 border-t border-line pt-3">
          <div className="flex items-center gap-2"><p className="font-semibold flex-1">{tx('Ингредиенттер')}</p><label className="text-sm flex items-center gap-2">{tx('Адам саны')} <input type="number" min={1} value={servings} onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))} className="h-10 w-20 rounded-md border border-input bg-surface px-2 text-center" /></label></div>
          <ul className="grid gap-1 text-sm">{r.ingredients.map((x, i) => <li key={i} className="flex gap-2"><span className="flex-1">{x.name}</span><span>{scaled(Number(x.amount) * ratio)} {x.unit}</span><span className="text-muted w-20 text-right">{Math.round(Number(x.price) * ratio)} ₸</span></li>)}</ul>
          <p className="text-sm font-semibold text-right">{tx('Жалпы шығын')}: {Math.round(total)} ₸</p>
          {!!r.steps.length && <ol className="grid gap-1 text-sm list-decimal pl-5">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
        </div>
      )}
    </Card>
  )
}

function ResourceForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [kind, setKind] = useState<ClassResourceKind>('book')
  const [f, setF] = useState({ title: '', original: '', year: '', country: '', minutes: '', pages: '', volumes: '1', servings: '14', prep: '', description: '', ingredients: '', steps: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Атауын жазыңыз'))
    const lines = f.ingredients.split('\n').map((x) => x.trim()).filter(Boolean)
    const ingredients: ClassIngredient[] = lines.map((line) => { const [name, amount, unit, price] = line.split('|').map((x) => x.trim()); return { name, amount: Number(amount), unit, price: Number(price) } })
    if (kind === 'recipe' && (!ingredients.length || ingredients.some((x) => !x.name || !x.unit || !Number.isFinite(x.amount) || x.amount <= 0 || !Number.isFinite(x.price) || x.price < 0))) return toast(tx('Ингредиенттерді «атауы | мөлшері | өлшемі | бағасы» түрінде жазыңыз'))
    setBusy(true)
    try {
      await addClassHubResource({ class_id: classId, kind, title: f.title.trim(), original_title: f.original.trim() || null, release_year: f.year ? Number(f.year) : null, country: f.country.trim() || null,
        duration_minutes: kind === 'movie' && f.minutes ? Number(f.minutes) : null, pages: kind === 'book' && f.pages ? Number(f.pages) : null, volumes: kind === 'book' ? Math.max(1, Number(f.volumes) || 1) : 1,
        servings: kind === 'recipe' ? Math.max(1, Number(f.servings) || 1) : null, prep_minutes: kind === 'recipe' && f.prep ? Number(f.prep) : null, description: f.description.trim() || null,
        ingredients: kind === 'recipe' ? ingredients : [], steps: kind === 'recipe' ? f.steps.split('\n').map((x) => x.trim()).filter(Boolean) : [] })
      toast(tx('Қосылды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return <div className="grid gap-4">
    <Chips label={tx('Түрі')} value={kind} onChange={setKind} items={[["book", tx('Кітап')], ['movie', tx('Фильм')], ['recipe', tx('Рецепт')]]} />
    <Field label={tx('Атауы')}>{(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} />}</Field>
    <Field label={tx('Түпнұсқа атауы')} hint={tx('Міндетті емес')}>{(id) => <input id={id} value={f.original} onChange={(e) => setF({ ...f, original: e.target.value })} className={inputCls} />}</Field>
    <div className="grid grid-cols-2 gap-3"><Field label={tx('Жылы')} hint={tx('Міндетті емес')}>{(id) => <input id={id} type="number" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} className={inputCls} />}</Field><Field label={tx('Елі')} hint={tx('Міндетті емес')}>{(id) => <input id={id} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className={inputCls} />}</Field></div>
    {kind === 'movie' && <Field label={tx('Ұзақтығы, минут')}>{(id) => <input id={id} type="number" min={1} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} className={inputCls} />}</Field>}
    {kind === 'book' && <div className="grid grid-cols-2 gap-3"><Field label={tx('Бет саны')}>{(id) => <input id={id} type="number" min={1} value={f.pages} onChange={(e) => setF({ ...f, pages: e.target.value })} className={inputCls} />}</Field><Field label={tx('Том саны')} hint={tx('Әр том жеке белгіленеді')}>{(id) => <input id={id} type="number" min={1} value={f.volumes} onChange={(e) => setF({ ...f, volumes: e.target.value })} className={inputCls} />}</Field></div>}
    {kind === 'recipe' && (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('Неше адамға')}>{(id) => <input id={id} type="number" min={1} value={f.servings} onChange={(e) => setF({ ...f, servings: e.target.value })} className={inputCls} />}</Field>
          <Field label={tx('Дайындау уақыты, минут')} hint={tx('Міндетті емес')}>{(id) => <input id={id} type="number" min={1} value={f.prep} onChange={(e) => setF({ ...f, prep: e.target.value })} className={inputCls} />}</Field>
        </div>
        <Field label={tx('Ингредиенттер')} hint={tx('Әр жол: атауы | мөлшері | өлшемі | бағасы')}>
          {(id, d) => <textarea id={id} aria-describedby={d} value={f.ingredients} onChange={(e) => setF({ ...f, ingredients: e.target.value })} className={`${inputCls} h-32 py-2`} placeholder={tx('Ұн | 500 | г | 250')} />}
        </Field>
        <Field label={tx('Қадамдар')} hint={tx('Әр қадамды жаңа жолға жазыңыз')}>
          {(id, d) => <textarea id={id} aria-describedby={d} value={f.steps} onChange={(e) => setF({ ...f, steps: e.target.value })} className={`${inputCls} h-32 py-2`} />}
        </Field>
      </>
    )}
    <Field label={tx('Қысқаша түсініктеме')} hint={tx('Міндетті емес')}>
      {(id) => <textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={`${inputCls} h-24 py-2`} />}
    </Field>
    <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
  </div>
}

function PlansTab({ tasks, students, me, manager, onAdd, onReload }: { tasks: Task[]; students: Student[]; me: string; manager: boolean; onAdd: () => void; onReload: () => void }) {
  const run = async (task: Task, done: boolean) => { try { await setTaskDone(task.id, done); onReload() } catch (e) { toast(errText(e)) } }
  return <div className="grid gap-3">
    {manager && <Card className="grid gap-2 bg-accent-soft"><p className="font-semibold">{tx('Сынып жоспары')}</p><p className="text-sm text-muted">{tx('Барлық сыныпқа немесе бір оқушыға мерзімі бар жоспар беріңіз.')}</p><Button kind="secondary" onClick={onAdd}><Icon n="plus" size={18} />{tx('Жоспар қосу')}</Button></Card>}
    {!tasks.length ? <Card><Empty icon="check" title={tx('Сынып жоспары әзірге бос')} text={manager ? tx('Алғашқы жоспарды қосыңыз.') : tx('Сынып жетекшісі жоспар қосқанда осында көрінеді.')} /></Card> : tasks.map((t) => {
      const done = t.done.some((x) => x.user_id === me); const count = new Set(t.done.map((x) => x.user_id)).size; const total = t.assignee_id ? 1 : students.length
      return <Card key={t.id} className={`flex items-start gap-3 ${done ? 'opacity-60' : ''}`}>
        {!manager && <input type="checkbox" checked={done} onChange={(e) => run(t, e.target.checked)} aria-label={tx('{0} — орындалды', t.title)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />}
        <div className="flex-1 min-w-0"><p className={`font-semibold break-words ${done ? 'line-through' : ''}`}>{t.title}</p>{t.notes && <p className="text-sm text-muted whitespace-pre-line">{t.notes}</p>}<p className="text-xs text-muted">{t.assignee ? tx('Жауапты: {0}', t.assignee.full_name) : tx('Бүкіл сыныпқа')}{t.due_on ? ` · ${tx('дейін')} ${fmtDate(t.due_on)}` : ''}</p></div>
        {manager && <Badge tone={count === total ? 'ok' : 'muted'}>{count}/{total}</Badge>}
      </Card>
    })}
  </div>
}

function PlanForm({ classId, students, onDone }: { classId: string; students: Student[]; onDone: () => void }) {
  const [f, setF] = useState({ title: '', notes: '', due: '', assignee: '' }); const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 2) return toast(tx('Жоспар атауын жазыңыз'))
    setBusy(true)
    try { await addTask({ title: f.title.trim(), notes: f.notes.trim() || null, due_on: f.due || null, class_id: classId, activity_id: null, assignee_id: f.assignee || null }); toast(tx('Жоспар қосылды')); onDone() }
    catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return <div className="grid gap-4">
    <Field label={tx('Жоспар')}>
      {(id) => <input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Мысалы: сыныппен фильм талқылау')} />}
    </Field>
    <Field label={tx('Кімге')}>
      {(id) => <select id={id} value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} className={inputCls}>
        <option value="">{tx('Бүкіл сыныпқа')}</option>
        {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>}
    </Field>
    <Field label={tx('Мерзімі')} hint={tx('Міндетті емес')}>
      {(id) => <input id={id} type="date" min={today()} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className={inputCls} />}
    </Field>
    <Field label={tx('Түсініктеме')} hint={tx('Міндетті емес')}>
      {(id) => <textarea id={id} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${inputCls} h-24 py-2`} />}
    </Field>
    <Button block loading={busy} onClick={save}>{tx('Сақтау')}</Button>
  </div>
}
