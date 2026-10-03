// Builds shareable absolute links (with the link token when a password is
// set) and deep links that open media directly in mobile player apps.

let linkToken = ''
export const setLinkToken = (t: string) => { linkToken = t }

export function absolute(url: string, download = false) {
  const u = new URL(url, window.location.origin)
  if (u.origin !== window.location.origin) return u.toString() // e.g. archive.org: never send our token
  if (linkToken) u.searchParams.set('t', linkToken)
  if (download) u.searchParams.set('download', '1')
  return u.toString()
}

export type Platform = 'android' | 'ios' | 'desktop'

export function platform(): Platform {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return 'desktop'
}

export type PlayerApp = {
  id: string
  label: string
  platforms: Platform[]
  build: (url: string, title: string) => string
}

function androidIntent(url: string, title: string, pkg?: string) {
  const u = new URL(url)
  const scheme = u.protocol.replace(':', '')
  const rest = url.slice(u.protocol.length + 2)
  return `intent://${rest}#Intent;action=android.intent.action.VIEW;scheme=${scheme};type=video/*;` +
    (pkg ? `package=${pkg};` : '') +
    `S.title=${encodeURIComponent(title)};S.browser_fallback_url=${encodeURIComponent(url)};end`
}

export const PLAYERS: PlayerApp[] = [
  { id: 'kmplayer-android', label: 'KMPlayer', platforms: ['android'], build: (u, t) => androidIntent(u, t, 'com.kmplayer') },
  // KMPlayer for iOS doesn't document a URL scheme; this is a best effort
  // and openInApp() warns if nothing opens.
  { id: 'kmplayer-ios', label: 'KMPlayer', platforms: ['ios'], build: u => `kmplayer://${u}` },
  { id: 'android-choose', label: 'Choose app…', platforms: ['android'], build: (u, t) => androidIntent(u, t) },
  { id: 'vlc-android', label: 'VLC', platforms: ['android'], build: (u, t) => androidIntent(u, t, 'org.videolan.vlc') },
  { id: 'mx', label: 'MX Player', platforms: ['android'], build: (u, t) => androidIntent(u, t, 'com.mxtech.videoplayer.ad') },
  { id: 'mx-pro', label: 'MX Player Pro', platforms: ['android'], build: (u, t) => androidIntent(u, t, 'com.mxtech.videoplayer.pro') },
  { id: 'just', label: 'Just Player', platforms: ['android'], build: (u, t) => androidIntent(u, t, 'com.brouken.player') },
  { id: 'vlc-ios', label: 'VLC', platforms: ['ios'], build: u => `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(u)}` },
  { id: 'infuse', label: 'Infuse', platforms: ['ios'], build: u => `infuse://x-callback-url/play?url=${encodeURIComponent(u)}` },
  { id: 'nplayer', label: 'nPlayer', platforms: ['ios'], build: u => `nplayer-${u}` },
  { id: 'outplayer', label: 'Outplayer', platforms: ['ios'], build: u => `outplayer://${u}` },
  { id: 'vlc-desktop', label: 'VLC', platforms: ['desktop'], build: u => `vlc://${u}` },
  { id: 'potplayer', label: 'PotPlayer', platforms: ['desktop'], build: u => `potplayer://${u}` },
  { id: 'iina', label: 'IINA', platforms: ['desktop'], build: u => `iina://weblink?url=${encodeURIComponent(u)}` },
]

export const playersFor = (p: Platform) => PLAYERS.filter(x => x.platforms.includes(p))

export function openInApp(app: PlayerApp, url: string, title: string, onFail?: () => void) {
  // If the page is still visible a moment later, the app didn't open.
  const t = setTimeout(() => { if (!document.hidden) onFail?.() }, 1800)
  document.addEventListener('visibilitychange', () => clearTimeout(t), { once: true })
  window.location.href = app.build(absolute(url), title)
}

export const kmplayer = () => PLAYERS.find(p => p.id === (platform() === 'ios' ? 'kmplayer-ios' : 'kmplayer-android'))

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

// ---------- Preferences (per device) ----------
export type Prefs = { player: string; autoOpen: boolean }

const KEY = 'seedbox:prefs'
export function loadPrefs(): Prefs {
  const def: Prefs = { player: '', autoOpen: false }
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return def
  }
}
export function savePrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
}
export function preferredPlayer(p: Prefs) {
  const list = playersFor(platform())
  return list.find(x => x.id === p.player) || list[0]
}
