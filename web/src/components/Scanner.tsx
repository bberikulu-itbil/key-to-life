import { useEffect, useRef, useState } from 'react'
import { errText, sendAppFeedback } from '../lib/api'
import { tx } from '../lib/i18n'
import { Icon, toast } from './ui'

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

type Torch = MediaTrackConstraintSet & { torch?: boolean }

/** Rear camera with a QR finder; calls onText for every code it reads until the parent closes it.
 *  full: fills its parent (a full-screen scanner). A torch button shows when the camera has one. */
export default function Scanner({ onText, full }: { onText: (text: string) => void; full?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const [err, setErr] = useState('')
  const [why, setWhy] = useState('')   // the browser's own error, sent with a report
  const [torch, setTorch] = useState<boolean | null>(null)   // null: this camera has no torch
  const [sent, setSent] = useState(false)
  useEffect(() => {
    let stream: MediaStream | null = null, timer = 0, stop = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    const native = BD ? new BD({ formats: ['qr_code'] }) : null
    // Safari and older browsers have no BarcodeDetector: decode the frames in JS
    const jsqr = native ? null : import('jsqr').then((m) => m.default)
    const tick = async () => {
      const v = video.current
      if (stop || !v) return
      if (v.readyState >= 2) {
        let text: string | undefined
        if (native) text = (await native.detect(v).catch(() => []))[0]?.rawValue
        else {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          text = (await jsqr!)(img.data, img.width, img.height)?.data
        }
        if (text) onText(text)
      }
      timer = window.setTimeout(tick, 250)
    }
    if (!navigator.mediaDevices) { setErr(tx('Бұл браузерде камера жоқ. Кодты қолмен жазыңыз.')); setWhy('no mediaDevices'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((s) => {
      stream = s
      if (stop) return s.getTracks().forEach((t) => t.stop())
      video.current!.srcObject = s
      video.current!.play().catch(() => {})
      track.current = s.getVideoTracks()[0] ?? null
      const caps = track.current?.getCapabilities?.() as { torch?: boolean } | undefined
      if (caps?.torch) setTorch(false)
      tick()
    }, (e: Error) => {
      setWhy(`${e?.name ?? ''}: ${e?.message ?? e}`)
      setErr(e?.name === 'NotAllowedError' ? tx('Камераға рұқсат берілмеді. Браузер баптауларынан рұқсат беріңіз немесе кодты қолмен жазыңыз.') : tx('Камера қосылмады. Кодты қолмен жазыңыз немесе қате туралы хабарлаңыз.'))
    })
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [onText])
  const flash = async () => {
    const on = !torch
    try { await track.current!.applyConstraints({ advanced: [{ torch: on } as Torch] }); setTorch(on) } catch { toast(tx('Фонарик қосылмады')) }
  }
  const report = async () => {
    try { await sendAppFeedback(`QR: ${tx('камера қосылмады')} · ${why} · ${location.hash} · ${navigator.userAgent}`.slice(0, 1000)); setSent(true); toast(tx('Хабарланды, рахмет!')) } catch (e) { toast(errText(e)) }
  }
  if (err) return (
    <div role="alert" className={`grid gap-3 content-center justify-items-center text-center p-6 ${full ? 'size-full text-white' : 'rounded-lg bg-danger-soft text-danger'}`}>
      <Icon n="x" size={36} />
      <p className="text-sm max-w-[34ch]">{err}</p>
      <button type="button" disabled={sent} onClick={report} className={`h-11 px-4 rounded-md font-semibold disabled:opacity-50 ${full ? 'bg-white/15' : 'bg-surface'}`}>{sent ? tx('Хабарланды') : tx('Қате туралы хабарлау')}</button>
    </div>
  )
  return (
    <div className={`relative overflow-hidden bg-black ${full ? 'size-full' : 'rounded-lg aspect-square'}`}>
      <video ref={video} playsInline muted className="size-full object-cover" aria-label={tx('Камера')} />
      <span className={`absolute rounded-lg border-4 border-white/80 ${full ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[min(70vw,300px)]' : 'inset-[18%]'}`} aria-hidden />
      {torch !== null && <button type="button" onClick={flash} aria-pressed={torch} aria-label={tx('Фонарик')}
        className={`absolute right-4 bottom-4 size-12 rounded-full grid place-items-center ${torch ? 'bg-gold text-on-gold' : 'bg-black/50 text-white'}`}><Icon n="flash" size={22} /></button>}
    </div>
  )
}
