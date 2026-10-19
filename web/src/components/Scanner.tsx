import { useEffect, useRef, useState } from 'react'
import { tx } from '../lib/i18n'

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

/** Rear camera with a QR finder; calls onText for every code it reads until the parent closes it. */
export default function Scanner({ onText }: { onText: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
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
    if (!navigator.mediaDevices) { setErr(tx('Бұл браузерде камера жоқ. Кодты қолмен жазыңыз.')); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((s) => {
      stream = s
      if (stop) return s.getTracks().forEach((t) => t.stop())
      video.current!.srcObject = s
      video.current!.play().catch(() => {})
      tick()
    }, () => setErr(tx('Камераға рұқсат берілмеді. Браузер баптауларынан рұқсат беріңіз немесе кодты қолмен жазыңыз.')))
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [onText])
  return err ? <p role="alert" className="text-sm text-danger">{err}</p> : (
    <div className="relative overflow-hidden rounded-lg bg-black aspect-square">
      <video ref={video} playsInline muted className="size-full object-cover" aria-label={tx('Камера')} />
      <span className="absolute inset-[18%] rounded-lg border-4 border-white/80" aria-hidden />
    </div>
  )
}
