// Telegram Mini App glue. Outside Telegram the SDK script still loads but initData is empty, so everything here is a no-op.
type WebApp = {
  initData: string; colorScheme: 'light' | 'dark'; version: string
  ready?: () => void; expand?: () => void; disableVerticalSwipes?: () => void; isVersionAtLeast?: (v: string) => boolean
  setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void; setBottomBarColor?: (c: string) => void
  onEvent?: (e: string, cb: () => void) => void
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void }
  HapticFeedback?: { selectionChanged(): void }
  openTelegramLink?: (url: string) => void
  openLink?: (url: string) => void
  showScanQrPopup?: (p: { text?: string }, cb: (text: string) => boolean | void) => void; closeScanQrPopup?: () => void
}
export const tg: WebApp | undefined = (window as unknown as { Telegram?: { WebApp: WebApp } }).Telegram?.WebApp
export const inTelegram = !!tg?.initData

/** Call before the first render: Telegram puts its launch data in the URL hash, which is our router's space. */
export function initTelegram() {
  if (!tg || !inTelegram) return
  try {
    const supports = (version: string) => tg.isVersionAtLeast?.(version) ?? false
    const r = new URLSearchParams(location.search).get('r')
    if (!location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname + '#' + (r && r.startsWith('/') ? r : '/'))
    document.documentElement.classList.add('tg')
    const theme = () => {
      document.documentElement.dataset.theme = tg.colorScheme
      if (supports('6.1')) { tg.setHeaderColor?.('secondary_bg_color'); tg.setBackgroundColor?.('secondary_bg_color') }
      if (supports('7.10')) tg.setBottomBarColor?.('section_bg_color')
    }
    theme()
    tg.onEvent?.('themeChanged', theme)
    if (supports('6.1')) tg.BackButton?.onClick(goBack)
    if (supports('7.7')) tg.disableVerticalSwipes?.()   // scrolling the feed must not close the app
    tg.expand?.()
    tg.ready?.()
  } catch (e) {
    // Telegram API differences must not prevent the web app from rendering.
    console.error('Telegram WebApp init failed', e)
  }
}

/** Telegram's own back button on every screen except the root tabs. */
export function syncBackButton(isRoot: boolean) {
  if (!tg || !inTelegram || !tg.isVersionAtLeast?.('6.1') || !tg.BackButton) return
  if (isRoot) tg.BackButton.hide(); else tg.BackButton.show()
}

export function openTelegram(url: string) {
  if (tg && inTelegram && tg.openTelegramLink) tg.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener')
}

/** Back one screen. A screen opened from a bot link has no page behind it in the webview, so then go up to its parent. */
export function goBack() {
  const at = location.hash
  const up = () => { if (location.hash === at) location.hash = at.startsWith('#/c/') ? '#/chats' : '#/' }
  if (history.length > 1) { history.back(); setTimeout(up, 250) } else up()
}

/** Telegram's own QR scanner (6.4+); false when not available here. */
export function tgScanQr(text: string, onText: (t: string) => boolean): boolean {
  if (!tg || !inTelegram || !tg.isVersionAtLeast?.('6.4') || !tg.showScanQrPopup) return false
  tg.showScanQrPopup({ text }, onText)
  return true
}

/** Prints the page (save as PDF). Telegram's webview cannot print, so there the page opens in the browser. */
export function printPage() {
  if (tg && inTelegram && tg.openLink) tg.openLink(location.href)
  else window.print()
}
