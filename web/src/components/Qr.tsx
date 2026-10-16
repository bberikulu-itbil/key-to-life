import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Link that any teacher's phone camera opens straight into the check page. */
export const verifyUrl = (code: string) => `${location.origin}${location.pathname}#/v/${code}`

export default function Qr({ code, label }: { code: string; label: string }) {
  const [svg, setSvg] = useState('')
  // black on white on purpose: scanners need the contrast in both themes
  useEffect(() => { QRCode.toString(verifyUrl(code), { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } }).then(setSvg) }, [code])
  return (
    <figure className="grid justify-items-center gap-2">
      <div role="img" aria-label={`${label} QR коды`} className="w-56 max-w-full aspect-square rounded-md bg-white p-2 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="text-xl font-bold tabular-nums tracking-wider select-all">{code}</figcaption>
    </figure>
  )
}
