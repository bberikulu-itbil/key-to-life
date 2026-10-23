import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { getCertificate, listCertificates } from '../lib/api'
import { useMe } from '../App'
import { TYPE_LABEL, fmtDate } from '../lib/time'
import { printPage } from '../lib/telegram'
import { Button, Card, Empty, ErrorBox, Icon, PageHead, Skeleton, useLoad } from '../components/ui'
import { tx } from '../lib/i18n'

/** A certificate: the page its QR opens, printable as a PDF. */
export default function Certificate({ code }: { code: string }) {
  const c = useLoad(() => getCertificate(code), [code])
  const [qr, setQr] = useState('')
  const url = `${location.origin}${location.pathname}#/cert/${code}`
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#16264f', light: '#ffffff' } }).then(setQr) }, [url])
  const d = c.data
  return (
    <div className="grid gap-3 pb-6">
      <div className="print:hidden"><PageHead title={tx('Сертификат')} back /></div>
      {c.loading && !d ? <Skeleton rows={3} /> : c.error ? <ErrorBox text={c.error} retry={c.reload} /> : !d ? (
        <Card><Empty icon="x" title={tx('Мұндай сертификат табылмады')} text={tx('Код қате немесе сертификат басқа мектепке тиесілі.')} /></Card>
      ) : (
        <>
          {/* black on white for print, navy and gold like the lyceum logo */}
          <article className="relative overflow-hidden rounded-lg bg-white text-[#16264f] border-[6px] border-[#16264f] p-6 grid gap-4 text-center print:rounded-none print:shadow-none">
            <span aria-hidden className="absolute inset-2 rounded-md border border-[#c9a23c]" />
            <div className="relative grid justify-items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo-192.png`} alt="" className="size-14 rounded-[12px]" />
              <p className="text-xs font-semibold tracking-[0.16em] uppercase text-[#a8852b]">{d.school}</p>
              <h1 className="text-2xl font-bold tracking-wide">{tx('СЕРТИФИКАТ')}</h1>
            </div>
            <div className="relative grid gap-1">
              <p className="text-sm text-[#4b5675]">{tx('Беріледі')}</p>
              <p className="font-display text-xl font-bold break-words">{d.student}</p>
              {d.class && <p className="text-sm text-[#4b5675]">{tx('{0} сынып оқушысы', d.class)}</p>}
            </div>
            <p className="relative text-[15px] leading-relaxed">
              {tx('«{0}» ({1}) бастамасында', d.activity, TYPE_LABEL[d.type])}<br /><b className="text-lg">{d.title}</b>
            </p>
            <div className="relative grid grid-cols-[1fr_auto] items-end gap-3 text-left text-sm">
              <div><p className="text-[#4b5675]">{tx('Жетекші')}</p><p className="font-semibold">{d.issuer}</p><p className="text-[#4b5675] mt-1">{fmtDate(d.issued_at.slice(0, 10))} · {d.code}</p></div>
              <div className="size-20 [&_svg]:size-full" role="img" aria-label={tx('Тексеру QR коды')} dangerouslySetInnerHTML={{ __html: qr }} />
            </div>
          </article>
          <p className="print:hidden flex items-center gap-2 text-sm text-success"><Icon n="check" size={18} />{tx('Сертификат жарамды: Key To Life жүйесінде тіркелген.')}</p>
          <div className="print:hidden"><Button block onClick={printPage}>{tx('PDF ретінде сақтау')}</Button></div>
        </>
      )}
    </div>
  )
}

/** The student's own certificates. */
export function MyCertificates() {
  const { me } = useMe()
  const list = useLoad(() => listCertificates({ student: me.id }), [me.id])
  return (
    <div className="grid gap-3 pb-6">
      <PageHead title={tx('Сертификаттарым')} back />
      {list.loading && !list.data ? <Skeleton rows={2} /> : !list.data?.length ? (
        <Card><Empty icon="trophy" title={tx('Әзірге сертификат жоқ')} text={tx('Жарыста жеңсеңіз немесе бастамаға белсенді қатыссаңыз, жетекші сертификат береді.')} /></Card>
      ) : list.data.map((c) => (
        <a key={c.id} href={`#/cert/${c.code}`} className="flex items-center gap-3 rounded-lg bg-surface shadow-card border border-[var(--card-line,transparent)] px-4 py-3">
          <span className="size-10 rounded-md bg-gold text-on-gold grid place-items-center shrink-0"><Icon n="trophy" size={20} /></span>
          <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{c.activity.title}</span><span className="block text-sm text-muted">{c.title} · {fmtDate(c.issued_at.slice(0, 10))}</span></span>
          <Icon n="chev" className="text-muted" />
        </a>
      ))}
    </div>
  )
}
