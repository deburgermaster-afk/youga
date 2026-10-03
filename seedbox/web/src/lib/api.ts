export type TFile = {
  index: number
  name: string
  path: string
  length: number
  progress: number
  url: string
}

export type Torrent = {
  infoHash: string
  name: string
  magnet: string
  ready: boolean
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  uploaded: number
  ratio: number
  peers: number
  length: number
  downloaded: number
  timeRemaining: number | null
  paused: boolean
  done: boolean
  addedAt: number
  cloud: { status: 'queued' | 'uploading' | 'done' | 'error'; progress: number; error?: string } | null
  files: TFile[]
}

export type Stats = {
  downloadSpeed: number
  uploadSpeed: number
  ratio: number
  peers: number
  active: number
  seeding: number
  downloadLimit: number
  uploadLimit: number
  disk: { total: number; free: number }
  cloud: { enabled: boolean; bucket: string; autoUpload: boolean; deleteLocal: boolean }
}

export type LogEntry = { id: number; ts: number; level: 'info' | 'success' | 'warn' | 'error'; msg: string }

export type Snapshot = { stats: Stats; torrents: Torrent[]; logs?: LogEntry[] }

export type DiskEntry = {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
  url: string | null
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${r.status})`)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  me: () => req<{ authRequired: boolean; authed: boolean; linkToken: string }>('/api/me'),
  login: (password: string) => req<{ linkToken: string }>('/api/login', json({ password })),
  logout: () => req('/api/logout', { method: 'POST' }),
  addMagnet: (magnet: string) => req<Torrent>('/api/torrents', json({ magnet })),
  addFile: (file: File) =>
    req<Torrent>('/api/torrents/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-bittorrent' },
      body: file,
    }),
  all: (action: 'pause' | 'resume') => req('/api/all/' + action, { method: 'POST' }),
  clearLogs: () => req('/api/logs', { method: 'DELETE' }),
  action: (hash: string, action: 'pause' | 'resume') => req<Torrent>(`/api/torrents/${hash}/${action}`, { method: 'POST' }),
  remove: (hash: string, files: boolean) => req(`/api/torrents/${hash}?files=${files ? 1 : 0}`, { method: 'DELETE' }),
  settings: (s: { downloadLimit?: number; uploadLimit?: number; autoUpload?: boolean; deleteLocal?: boolean }) => req('/api/settings', json(s)),
  upload: (hash: string) => req<Torrent>(`/api/torrents/${hash}/upload`, { method: 'POST' }),
  cloud: (prefix: string) => req<{ prefix: string; entries: DiskEntry[] }>(`/api/cloud?prefix=${encodeURIComponent(prefix)}`),
  cloudUsage: () => req<{ bytes: number; count: number }>('/api/cloud/usage'),
  cloudDelete: (key: string) => req(`/api/cloud?key=${encodeURIComponent(key)}`, { method: 'DELETE' }),
  disk: (path: string) => req<{ path: string; entries: DiskEntry[] }>(`/api/disk?path=${encodeURIComponent(path)}`),
  diskDelete: (path: string) => req(`/api/disk?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
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
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export const isVideo = (name: string) => /\.(mp4|m4v|webm|mkv|mov|avi|ts)$/i.test(name)
export const isAudio = (name: string) => /\.(mp3|m4a|flac|ogg|wav|aac|opus)$/i.test(name)
export const isImage = (name: string) => /\.(jpe?g|png|gif|webp|avif)$/i.test(name)
export const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 4) : 'FILE')
export const isMedia = (name: string) => isVideo(name) || isAudio(name)
// Formats browsers play natively; others (mkv/avi) go to an external app.
export const browserPlayable = (name: string) => /\.(mp4|m4v|webm|mov|mp3|m4a|ogg|wav|flac|aac|opus)$/i.test(name)

// The file most people want from a torrent: the biggest video/audio file,
// otherwise the biggest file.
export function mainFile(t: Torrent): TFile | undefined {
  const bySize = [...t.files].sort((a, b) => b.length - a.length)
  return bySize.find(f => isMedia(f.name)) ?? bySize[0]
}

// Prefer the cloud copy once uploaded: it streams from Cloudflare.
export function fileLink(t: Torrent, f: TFile) {
  return t.cloud?.status === 'done' ? '/cloud/' + f.path.split(/[\\/]/).map(encodeURIComponent).join('/') : f.url
}
