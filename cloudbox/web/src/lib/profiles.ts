// Who's watching. Each profile keeps its own "continue watching" list.
export const PROFILES = [
  { id: 'tj', name: 'TJ', color: 'from-orange-500 to-amber-400' },
  { id: 'shaha', name: 'SHAHA', color: 'from-rose-500 to-orange-400' },
  { id: 'rif', name: 'RIF', color: 'from-amber-500 to-yellow-300' },
] as const

export type ProfileId = (typeof PROFILES)[number]['id']
export const profileById = (id: string | null) => PROFILES.find(p => p.id === id)

// The picker shows once per visit (per browser tab session).
const KEY = 'cloudbox:profile'
export function sessionProfile(): ProfileId | null {
  try { return (sessionStorage.getItem(KEY) as ProfileId) || null } catch { return null }
}
export function setSessionProfile(id: ProfileId | null) {
  try { if (id) sessionStorage.setItem(KEY, id); else sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

// ---------- Continue watching ----------
export type Progress = { movieId?: number; url: string; name: string; t: number; d: number; at: number; ep?: string }
const cwKey = (p: string) => `cloudbox:cw:${p}`

export function getProgress(profile: string): Progress[] {
  try { return JSON.parse(localStorage.getItem(cwKey(profile)) || '[]') } catch { return [] }
}
export function saveProgress(profile: string, p: Progress) {
  try {
    const list = getProgress(profile).filter(x => x.url !== p.url)
    // Finished (last 3%) or barely started items don't belong in the row.
    if (p.d > 0 && p.t / p.d < 0.97 && p.t > 15) list.unshift(p)
    if (p.d > 0 && p.t / p.d >= 0.97) markDone(profile, p.url)
    localStorage.setItem(cwKey(profile), JSON.stringify(list.slice(0, 20)))
  } catch { /* ignore */ }
}
export const positionFor = (profile: string, url: string) => getProgress(profile).find(x => x.url === url)?.t || 0

// ---------- Finished episodes / movies ----------
const doneKey = (p: string) => `cloudbox:done:${p}`
function doneSet(profile: string): string[] {
  try { return JSON.parse(localStorage.getItem(doneKey(profile)) || '[]') } catch { return [] }
}
export const isDone = (profile: string, url: string) => doneSet(profile).includes(url)
export function markDone(profile: string, url: string) {
  try {
    const list = doneSet(profile).filter(u => u !== url)
    list.push(url)
    localStorage.setItem(doneKey(profile), JSON.stringify(list.slice(-2000)))
  } catch { /* ignore */ }
}
