/** The pass or booking code inside a scanned QR: our verify link (…#/v/L-3F9A2C) or the bare code. */
export function codeFrom(text: string) {
  const m = text.trim().match(/#\/v\/([A-Za-z0-9-]+)/) ?? text.trim().match(/^([A-Za-z]-[A-Za-z0-9]+)$/)
  return m ? m[1].toUpperCase() : null
}
