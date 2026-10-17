import { useState } from 'react'
import { createActivityPost, errText, hidePost, listActivityPosts, photoUrl, uploadPhoto, type ActivityFull, type Me } from '../lib/api'
import { chatTime } from '../lib/time'
import { Badge, Button, Card, Empty, Field, Sheet, Skeleton, inputCls, toast, useLoad } from './ui'
import { tx } from '../lib/i18n'

/** Posts of one activity: public ones also reach the school feed, members-only ones stay here. */
export default function ActivityFeed({ a, me }: { a: ActivityFull; me: Me }) {
  const posts = useLoad(() => listActivityPosts(a.id), [a.id])
  const [writing, setWriting] = useState(false)
  const canWrite = me.id === a.supervisor_id || me.id === a.curator_id || me.role === 'deputy' || me.role === 'admin'
  const hide = async (id: string) => { try { await hidePost(id); toast(tx('Жойылды')); posts.reload() } catch (e) { toast(errText(e)) } }
  const list = posts.data ?? []
  return (
    <section className="grid gap-3">
      {canWrite && <Button kind="secondary" onClick={() => setWriting(true)}>{tx('Жазба қосу')}</Button>}
      {posts.loading && !posts.data ? <Skeleton rows={2} /> : !list.length ? (
        <Card><Empty icon="file" title={tx('Әзірге жазба жоқ')} text={canWrite ? tx('Хабар, нәтиже немесе фото жариялаңыз. Барлығына немесе тек қатысушыларға.') : tx('Жетекші жариялаған хабарлар осында шығады.')} /></Card>
      ) : list.map((p) => (
        <article key={p.id} className="rounded-lg overflow-hidden bg-surface shadow-card border border-[var(--card-line,transparent)]">
          {p.photo && <img src={photoUrl(p.photo)} alt="" loading="lazy" className="w-full max-h-[420px] object-cover bg-surface-2" />}
          <div className="p-4 grid gap-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted">
              <span>{p.author.full_name} · {chatTime(p.created_at)}</span>
              {p.visibility === 'members' ? <Badge tone="warn">{tx('Тек қатысушыларға')}</Badge> : <Badge tone="muted">{tx('Барлығына')}</Badge>}
            </div>
            <h3 className="text-lg font-bold leading-snug break-words">{p.title}</h3>
            {p.body && <p className="whitespace-pre-line break-words">{p.body}</p>}
            {(p.author_id === me.id || me.role === 'deputy' || me.role === 'admin') && <div><Button kind="ghost" onClick={() => hide(p.id)}>{tx('Жою')}</Button></div>}
          </div>
        </article>
      ))}
      {writing && <Sheet title={tx('Лентаға жазба')} onClose={() => setWriting(false)}><Write a={a} me={me} onDone={() => { setWriting(false); posts.reload() }} /></Sheet>}
    </section>
  )
}

function Write({ a, me, onDone }: { a: ActivityFull; me: Me; onDone: () => void }) {
  const [f, setF] = useState({ title: '', body: '', visibility: 'public' as 'public' | 'members' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.title.trim().length < 3) return toast(tx('Тақырыпты жазыңыз'))
    setBusy(true)
    try {
      const path = file ? await uploadPhoto(me.id, file) : null
      await createActivityPost(a.id, f.title, f.body, path, f.visibility)
      toast(f.visibility === 'public' ? tx('Жарияланды — мектеп лентасында да шығады') : tx('Қатысушыларға жарияланды')); onDone()
    } catch (e) { toast(errText(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label={tx('Кімге көрінеді')} className="grid grid-cols-2 gap-1 bg-surface-2 rounded-md p-1">
        {([['public', tx('Барлығына')], ['members', tx('Тек қатысушыларға')]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={f.visibility === k} onClick={() => setF({ ...f, visibility: k })}
            className={`h-10 rounded-sm text-sm font-semibold ${f.visibility === k ? 'bg-surface shadow-card' : 'text-muted'}`}>{label}</button>
        ))}
      </div>
      <p className="text-sm text-muted">{f.visibility === 'public' ? tx('Мектептің ортақ лентасында «Жаңалықтар» бөлімінде де шығады.') : tx('Тек осы бастамаға жазылғандар мен жетекшілер көреді.')}</p>
      <Field label={tx('Тақырып')}>{(id) => <input id={id} value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={tx('Мысалы: облыстық олимпиада нәтижесі')} />}</Field>
      <Field label={tx('Мәтін')}>{(id) => <textarea id={id} value={f.body} maxLength={5000} onChange={(e) => setF({ ...f, body: e.target.value })} className={`${inputCls} h-28 py-2`} />}</Field>
      <Field label={tx('Фото')} hint={tx('Міндетті емес')}>{(id, d) => (
        <div className="flex items-center gap-3">
          <input id={id} aria-describedby={d} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:h-10 file:px-3 file:rounded-md file:border-0 file:bg-accent-soft file:text-accent file:font-semibold" />
          {file && <img src={URL.createObjectURL(file)} alt={tx('Таңдалған фото')} className="size-14 rounded-md object-cover" />}
        </div>
      )}</Field>
      <Button block loading={busy} onClick={save}>{tx('Жариялау')}</Button>
    </div>
  )
}
