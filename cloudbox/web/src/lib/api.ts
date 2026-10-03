export type Job = {
  id: string
  url: string
  name: string
  key: string
  size: number
  copied: number
  status: 'queued' | 'copying' | 'remote' | 'done' | 'error' | 'paused'
  kind?: 'link' | 'magnet'
  remoteProgress?: number
  remoteState?: string
  children?: number
  remoteStats?: { down: number; up: number; seeds: number; peers: number; eta: number; ratio: number }
  startedAt?: number
  error?: string
  bps?: number
  createdAt: number
  updatedAt: number
}

export type Entry = {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
  url: string | null
  source?: 'torbox' | 'cloud'
  torrentId?: number
  fileId?: number
  torrentName?: string
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${r.status})`)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  me: () => req<{ authRequired: boolean; authed: boolean; linkToken: string }>('/api/me'),
  login: (password: string) => req<{ linkToken: string }>('/api/login', post({ password })),
  logout: () => req('/api/logout', post()),
  jobs: () => req<{ jobs: Job[] }>('/api/jobs'),
  add: (url: string) => req<Job>('/api/jobs', post({ url })),
  jobAction: (id: string, action: 'pause' | 'resume' | 'retry') => req<Job>(`/api/jobs/${id}/${action}`, post()),
  removeJob: (id: string) => req(`/api/jobs/${id}`, { method: 'DELETE' }),
  pump: () => req('/api/pump', post()),
  files: (prefix: string) => req<{ prefix: string; entries: Entry[] }>(`/api/files?prefix=${encodeURIComponent(prefix)}`),
  removeFile: (key: string) => req(`/api/files?key=${encodeURIComponent(key)}`, { method: 'DELETE' }),
  config: () => req<{ torbox: string; copyToCloud: boolean }>('/api/config'),
  saveConfig: (c: { torboxKey?: string; copyToCloud?: boolean }) => req<{ torbox: string; copyToCloud: boolean }>('/api/config', post(c)),
  torboxFiles: () => req<{ entries: Entry[] }>('/api/torbox/files'),
  torboxDelete: (torrentId: number) => req(`/api/torbox/${torrentId}`, { method: 'DELETE' }),
  saveToCloud: (e: Entry) => req('/api/torbox/save', post({ torrentId: e.torrentId, fileId: e.fileId, name: e.name, size: e.size, torrentName: e.torrentName })),
  usage: () => req<{ bytes: number; count: number }>('/api/usage'),
}

// ---------- Formatting ----------
export function bytes(n: number, digits = 1) {
  if (!n || n < 1) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.max(0, Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024))))
  return `${(n / 1024 ** i).toFixed(i ? digits : 0)} ${u[i]}`
}

export const speed = (n: number) => `${bytes(n)}/s`

export function duration(ms: number | null) {
  if (!ms || !isFinite(ms) || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export const isVideo = (name: string) => /\.(mp4|m4v|webm|mkv|mov|avi|ts)$/i.test(name)
export const isAudio = (name: string) => /\.(mp3|m4a|flac|ogg|wav|aac|opus)$/i.test(name)
export const isImage = (name: string) => /\.(jpe?g|png|gif|webp|avif)$/i.test(name)
export const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 4) : 'FILE')
export const isMedia = (name: string) => isVideo(name) || isAudio(name)
export const fileUrl = (key: string) => '/f/' + key.split('/').map(encodeURIComponent).join('/')
