// Telegram Mini App glue. Outside Telegram the SDK script still loads but initData is empty, so everything here is a no-op.
type WebApp = {
  initData: string; colorScheme: 'light' | 'dark'; version: string
  ready(): void; expand(): void; disableVerticalSwipes?(): void; isVersionAtLeast(v: string): boolean
  setHeaderColor(c: string): void; setBackgroundColor(c: string): void; setBottomBarColor?(c: string): void
  onEvent(e: string, cb: () => void): void
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void }
  HapticFeedback?: { selectionChanged(): void }
  openTelegramLink(url: string): void
}
export const tg: WebApp | undefined = (window as unknown as { Telegram?: { WebApp: WebApp } }).Telegram?.WebApp
export const inTelegram = !!tg?.initData

/** Call before the first render: Telegram puts its launch data in the URL hash, which is our router's space. */
export function initTelegram() {
  if (!tg || !inTelegram) return
  const r = new URLSearchParams(location.search).get('r')
  if (!location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname + '#' + (r && r.startsWith('/') ? r : '/'))
  document.documentElement.classList.add('tg')
  const theme = () => {
    document.documentElement.dataset.theme = tg.colorScheme
    if (tg.isVersionAtLeast('6.1')) { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color') }
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor?.('section_bg_color')
  }
  theme()
  tg.onEvent('themeChanged', theme)
  if (tg.isVersionAtLeast('6.1')) tg.BackButton.onClick(() => history.back())
  if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.()   // scrolling the feed must not close the app
  tg.expand()
  tg.ready()
}

/** Telegram's own back button on every screen except the root tabs. */
export function syncBackButton(isRoot: boolean) {
  if (!tg || !inTelegram || !tg.isVersionAtLeast('6.1')) return
  if (isRoot) tg.BackButton.hide(); else tg.BackButton.show()
}

export function openTelegram(url: string) {
  if (tg && inTelegram) tg.openTelegramLink(url); else window.open(url, '_blank', 'noopener')
}
