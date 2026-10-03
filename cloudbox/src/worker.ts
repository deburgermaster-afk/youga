// Cloudbox: copies files from direct download links into R2 and streams
// them back. Runs entirely on Cloudflare Workers (free plan).
//
// Big files are copied in 100 MB parts with HTTP Range requests, so each
// step is short. A cron trigger keeps jobs moving with the app closed, and
// the open app "pumps" jobs for faster progress.

interface Env {
  BUCKET: R2Bucket
  ASSETS: Fetcher
  APP_PASSWORD?: string
  TORBOX_URL?: string // override for local testing
}

type Job = {
  id: string
  kind?: 'link' | 'magnet'
  // TorBox does the torrenting; we copy its finished files into R2.
  torbox?: { torrentId: number; fileId?: number }
  remoteProgress?: number
  remoteState?: string
  urlExpires?: number
  children?: number
  remoteStats?: { down: number; up: number; seeds: number; peers: number; eta: number; ratio: number }
  startedAt?: number
  url: string
  name: string
  key: string
  size: number // -1 when unknown
  ranges: boolean
  partSize: number
  nextPart: number // 1-based
  parts: R2UploadedPart[]
  uploadId?: string
  copied: number
  status: 'queued' | 'copying' | 'remote' | 'done' | 'error' | 'paused'
  error?: string
  lockUntil: number
  createdAt: number
  updatedAt: number
  bps?: number
}

const JOBS = '.cloudbox/jobs/'
const CONFIG = '.cloudbox/config.json'
const TORBOX = 'https://api.torbox.app/v1/api'
const isActive = (s: string) => s === 'queued' || s === 'copying' || s === 'remote'

type Config = { torboxKey?: string }
async function getConfig(env: Env): Promise<Config> {
  const o = await env.BUCKET.get(CONFIG)
  return o ? o.json() : {}
}

let torboxBase = TORBOX
async function torbox<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(torboxBase + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...(init?.headers || {}) } })
  const body = (await r.json().catch(() => ({}))) as { success?: boolean; data?: T; detail?: string; error?: string }
  if (!r.ok || body.success === false) throw new Error(`TorBox: ${body.detail || body.error || r.status}`)
  return body.data as T
}

const isMagnet = (s: string) => /^magnet:\?/i.test(s) || /^[a-f0-9]{40}$/i.test(s)
const PART = 100 * 1024 * 1024
const LOCK_MS = 3 * 60_000

// ---------- Auth ----------
const enc = new TextEncoder()
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode('cloudbox:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const cookie = (req: Request, name: string) => (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)'))?.[1] || ''

async function tokens(env: Env) {
  const pw = env.APP_PASSWORD || ''
  return { session: await hmac(pw, 'session'), link: (await hmac(pw, 'links')).slice(0, 24) }
}

async function authed(req: Request, env: Env) {
  if (!env.APP_PASSWORD) return true
  const t = await tokens(env)
  return cookie(req, 'cb') === t.session || new URL(req.url).searchParams.get('t') === t.link
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })

// ---------- Jobs ----------
async function loadJob(env: Env, id: string) {
  const o = await env.BUCKET.get(JOBS + id + '.json')
  return o ? { job: (await o.json()) as Job, etag: o.etag } : null
}

// Optimistic write: fails if someone else changed the job meanwhile.
async function saveJob(env: Env, job: Job, etag?: string) {
  job.updatedAt = Date.now()
  const r = await env.BUCKET.put(JOBS + job.id + '.json', JSON.stringify(job), {
    customMetadata: { status: job.status, createdAt: String(job.createdAt) },
    ...(etag ? { onlyIf: { etagMatches: etag } } : {}),
  })
  return r ? r.etag : null
}

// Status lives in object metadata, so finding active jobs needs no reads.
// Workers Free allows 50 subrequests per call, so load only what's needed.
async function listJobs(env: Env, { activeOnly = false, recentDone = 10 } = {}) {
  const metas: { key: string; status: string; createdAt: number }[] = []
  let cursor: string | undefined
  do {
    const l = await env.BUCKET.list({ prefix: JOBS, cursor, include: ['customMetadata'] })
    for (const o of l.objects) metas.push({ key: o.key, status: o.customMetadata?.status || 'queued', createdAt: Number(o.customMetadata?.createdAt || 0) })
    cursor = l.truncated ? l.cursor : undefined
  } while (cursor)
  metas.sort((a, b) => b.createdAt - a.createdAt)
  const active = metas.filter(m => isActive(m.status) || m.status === 'paused')
  const rest = activeOnly ? [] : metas.filter(m => !active.includes(m)).slice(0, recentDone)
  const out: Job[] = []
  for (const m of [...active, ...rest].slice(0, 30)) {
    const j = await env.BUCKET.get(m.key)
    if (j) out.push(await j.json())
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

function fileName(url: URL, res: Response) {
  const cd = res.headers.get('content-disposition') || ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  const plain = /filename="?([^";]+)"?/i.exec(cd)
  let name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
  name = name.replace(/[\\/\x00-\x1f]/g, '_').trim()
  return name || 'download-' + Date.now()
}

async function uniqueKey(env: Env, name: string) {
  let key = name
  for (let i = 1; await env.BUCKET.head(key); i++) {
    const dot = name.lastIndexOf('.')
    key = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`
  }
  return key
}

async function createMagnetJob(env: Env, magnet: string): Promise<Job> {
  const { torboxKey } = await getConfig(env)
  if (!torboxKey) throw new Error('Magnet links need a free TorBox key. Add it in Settings.')
  if (!magnet.startsWith('magnet:')) magnet = `magnet:?xt=urn:btih:${magnet}`
  const form = new FormData()
  form.set('magnet', magnet)
  const data = await torbox<{ torrent_id: number; hash: string }>(torboxKey, '/torrents/createtorrent', { method: 'POST', body: form })
  const dn = new URLSearchParams(magnet.slice(magnet.indexOf('?') + 1)).get('dn')
  const job: Job = {
    id: crypto.randomUUID(),
    kind: 'magnet',
    torbox: { torrentId: data.torrent_id },
    url: magnet,
    name: dn || data.hash || 'Torrent',
    key: '',
    size: -1,
    ranges: true,
    partSize: PART,
    nextPart: 1,
    parts: [],
    copied: 0,
    remoteProgress: 0,
    status: 'remote',
    lockUntil: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveJob(env, job)
  return job
}

const cleanKey = (p: string) => p.split('/').map(seg => seg.replace(/[\\\x00-\x1f]/g, '_').trim()).filter(Boolean).join('/')

// Torrent finished on TorBox: queue one R2 copy job per file.
async function spawnCopies(env: Env, parent: Job, files: { id: number; name: string; size: number }[]) {
  for (const f of files) {
    const name = f.name.split('/').pop() || f.name
    const job: Job = {
      id: crypto.randomUUID(),
      kind: 'link',
      torbox: { torrentId: parent.torbox!.torrentId, fileId: f.id },
      url: '',
      name,
      key: await uniqueKey(env, cleanKey(f.name)),
      size: f.size,
      ranges: true,
      partSize: Math.max(PART, Math.ceil(f.size / 9000)),
      nextPart: 1,
      parts: [],
      copied: 0,
      status: 'queued',
      lockUntil: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await saveJob(env, job)
  }
}

// TorBox download links expire; fetch a fresh one when needed.
async function resolveUrl(env: Env, job: Job) {
  // fileId can be 0, so compare against undefined rather than truthiness.
  if (job.torbox?.fileId === undefined || (job.url && (job.urlExpires || 0) > Date.now())) return
  const { torboxKey } = await getConfig(env)
  if (!torboxKey) throw new Error('TorBox key missing. Add it in Settings.')
  const q = new URLSearchParams({ token: torboxKey, torrent_id: String(job.torbox.torrentId), file_id: String(job.torbox.fileId) })
  const link = await torbox<string>(torboxKey, `/torrents/requestdl?${q}`)
  if (!/^https?:\/\//.test(link || '')) throw new Error('TorBox did not return a download link. Try again in a minute.')
  job.url = link
  job.urlExpires = Date.now() + 2 * 60 * 60 * 1000
}

async function createJob(env: Env, raw: string): Promise<Job> {
  if (isMagnet(raw)) return createMagnetJob(env, raw)
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('That is not a valid link') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http and https links work')

  // Probe size, name and Range support with a 1-byte request.
  const probe = await fetch(url.toString(), { headers: { Range: 'bytes=0-0' }, redirect: 'follow' })
  if (!probe.ok) throw new Error(`The link answered with ${probe.status}`)
  const total = /\/(\d+)$/.exec(probe.headers.get('content-range') || '')?.[1]
  const ranges = probe.status === 206 && !!total
  const size = ranges ? Number(total) : Number(probe.headers.get('content-length') || -1)
  probe.body?.cancel()
  const ct = probe.headers.get('content-type') || ''
  if (ct.startsWith('text/html')) throw new Error('That link opens a web page, not a file. Use a direct download link.')
  if (!ranges && size < 0) throw new Error('This server hides the file size, so it can’t be copied. Try another link.')
  if (!ranges && size > 5 * 1024 ** 3) throw new Error('This server doesn’t allow resuming, and files over 5 GB need that.')

  const name = fileName(url, probe)
  const job: Job = {
    id: crypto.randomUUID(),
    url: url.toString(),
    name,
    key: await uniqueKey(env, name),
    size,
    ranges,
    partSize: ranges ? Math.max(PART, Math.ceil(size / 9000)) : size,
    nextPart: 1,
    parts: [],
    copied: 0,
    status: 'queued',
    lockUntil: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveJob(env, job)
  return job
}

const mime = (name: string) => ({
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg', wav: 'audio/wav',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', srt: 'text/plain; charset=utf-8', vtt: 'text/vtt',
} as Record<string, string>)[name.split('.').pop()!.toLowerCase()] || 'application/octet-stream'

// Copy a stream of known length into R2 without touching the bytes in JS.
function sized(body: ReadableStream, length: number) {
  const { readable, writable } = new FixedLengthStream(length)
  body.pipeTo(writable).catch(() => {})
  return readable
}

// Advance one job by up to `maxParts` parts. Returns true if work was done.
async function step(env: Env, id: string, maxParts: number): Promise<boolean> {
  const loaded = await loadJob(env, id)
  if (!loaded) return false
  let { job, etag } = loaded
  if (!isActive(job.status)) return false
  if (job.lockUntil > Date.now()) return false

  // Take the lock; lose gracefully if another invocation got there first.
  job.lockUntil = Date.now() + LOCK_MS
  if (job.kind !== 'magnet') job.status = 'copying'
  const lockedEtag = await saveJob(env, job, etag)
  if (!lockedEtag) return false
  etag = lockedEtag

  try {
    if (job.kind === 'magnet') {
      const { torboxKey } = await getConfig(env)
      if (!torboxKey) throw new Error('TorBox key missing. Add it in Settings.')
      const t = await torbox<{ name: string; size: number; progress: number; download_state: string; download_finished: boolean; download_present: boolean; download_speed?: number; upload_speed?: number; seeds?: number; peers?: number; eta?: number; ratio?: number; files?: { id: number; name: string; size: number }[] }>(
        torboxKey, `/torrents/mylist?id=${job.torbox!.torrentId}&bypass_cache=true`)
      job.name = t.name || job.name
      job.size = t.size || job.size
      job.remoteProgress = t.progress ?? 0
      job.remoteState = t.download_state
      job.remoteStats = { down: t.download_speed || 0, up: t.upload_speed || 0, seeds: t.seeds || 0, peers: t.peers || 0, eta: t.eta || 0, ratio: t.ratio || 0 }
      if (/error|failed/i.test(t.download_state || '')) throw new Error(`TorBox: ${t.download_state}`)
      if ((t.download_finished || t.download_present) && t.files?.length) {
        await spawnCopies(env, job, t.files)
        job.children = t.files.length
        job.remoteProgress = 1
        job.status = 'done'
      }
      job.lockUntil = 0
      await saveJob(env, job, etag)
      return true
    }
    await resolveUrl(env, job)
    job.startedAt ||= Date.now()
    if (!job.ranges) {
      const t0 = Date.now()
      const res = await fetch(job.url)
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
      await env.BUCKET.put(job.key, sized(res.body, job.size), { httpMetadata: { contentType: mime(job.name) } })
      job.copied = job.size
      job.bps = job.size / Math.max(1, (Date.now() - t0) / 1000)
      job.status = 'done'
    } else {
      const mpu = job.uploadId
        ? env.BUCKET.resumeMultipartUpload(job.key, job.uploadId)
        : await env.BUCKET.createMultipartUpload(job.key, { httpMetadata: { contentType: mime(job.name) } })
      job.uploadId = mpu.uploadId
      const totalParts = Math.ceil(job.size / job.partSize)

      for (let n = 0; n < maxParts && job.nextPart <= totalParts; n++) {
        const start = (job.nextPart - 1) * job.partSize
        const end = Math.min(start + job.partSize, job.size) - 1
        const t0 = Date.now()
        const res = await fetch(job.url, { headers: { Range: `bytes=${start}-${end}` } })
        if (res.status !== 206 || !res.body) throw new Error(`Download failed at ${Math.round((start / job.size) * 100)}% (${res.status})`)
        const part = await mpu.uploadPart(job.nextPart, sized(res.body, end - start + 1))
        job.parts.push({ partNumber: part.partNumber, etag: part.etag })
        job.copied = end + 1
        job.bps = (end - start + 1) / Math.max(0.5, (Date.now() - t0) / 1000)
        job.nextPart++
        job.lockUntil = Date.now() + LOCK_MS
        etag = (await saveJob(env, job, etag)) || ''
        if (!etag) return true // someone paused/removed it
      }

      if (job.nextPart > totalParts) {
        await mpu.complete(job.parts)
        job.status = 'done'
      }
    }
  } catch (err) {
    job.status = 'error'
    job.error = (err as Error).message
  }
  job.lockUntil = 0
  await saveJob(env, job, etag || undefined)
  return true
}

async function pumpAll(env: Env, deadline: number, maxParts: number) {
  for (const job of await listJobs(env, { activeOnly: true })) {
    if (Date.now() > deadline) break
    if (isActive(job.status)) await step(env, job.id, maxParts)
  }
}

// ---------- Files ----------
async function listFiles(env: Env, prefix: string) {
  const folders: string[] = []
  const files: { key: string; size: number; mtime: number }[] = []
  let cursor: string | undefined
  do {
    const l = await env.BUCKET.list({ prefix, delimiter: '/', cursor })
    folders.push(...l.delimitedPrefixes.filter(p => !p.startsWith('.cloudbox/')))
    for (const o of l.objects) if (!o.key.startsWith('.cloudbox/')) files.push({ key: o.key, size: o.size, mtime: o.uploaded.getTime() })
    cursor = l.truncated ? l.cursor : undefined
  } while (cursor)
  return { folders, files }
}

const fileUrl = (key: string) => '/f/' + key.split('/').map(encodeURIComponent).join('/')

async function serveFile(req: Request, env: Env, key: string) {
  const url = new URL(req.url)
  const obj = await env.BUCKET.get(key, { range: req.headers, onlyIf: req.headers })
  if (!obj) return new Response('Not found', { status: 404 })
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('accept-ranges', 'bytes')
  const name = key.split('/').pop()!
  headers.set('content-disposition', `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`)
  if (!headers.get('content-type')) headers.set('content-type', mime(name))
  if (!('body' in obj)) return new Response(null, { status: 412, headers })
  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined
  if (r && req.headers.has('range')) {
    const offset = r.suffix !== undefined ? obj.size - r.suffix : r.offset ?? 0
    const length = r.length ?? obj.size - offset
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`)
    headers.set('content-length', String(length))
    return new Response(req.method === 'HEAD' ? null : obj.body, { status: 206, headers })
  }
  headers.set('content-length', String(obj.size))
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers })
}

// ---------- Router ----------
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    torboxBase = env.TORBOX_URL || TORBOX
    const url = new URL(req.url)
    const path = url.pathname

    if (path === '/api/me') {
      const ok = await authed(req, env)
      return json({ authRequired: !!env.APP_PASSWORD, authed: ok, linkToken: ok && env.APP_PASSWORD ? (await tokens(env)).link : '' })
    }

    if (path === '/api/login' && req.method === 'POST') {
      const { password } = (await req.json().catch(() => ({}))) as { password?: string }
      if (!env.APP_PASSWORD || !safeEqual(String(password || ''), env.APP_PASSWORD)) return json({ error: 'Wrong password' }, 401)
      const t = await tokens(env)
      return json({ ok: true, linkToken: t.link }, 200, {
        'set-cookie': `cb=${t.session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
      })
    }

    if (path === '/api/logout') return json({ ok: true }, 200, { 'set-cookie': 'cb=; Path=/; Max-Age=0' })

    if (path.startsWith('/api/') || path.startsWith('/f/')) {
      if (!(await authed(req, env))) return json({ error: 'Login required' }, 401)
    } else {
      return env.ASSETS.fetch(req)
    }

    try {
      if (path.startsWith('/f/')) {
        return serveFile(req, env, path.slice(3).split('/').map(decodeURIComponent).join('/'))
      }

      // TorBox download links embed the API key, so never send them to the browser.
      if (path === '/api/jobs' && req.method === 'GET') {
        const jobs = (await listJobs(env)).map(j => (j.torbox?.fileId !== undefined ? { ...j, url: '' } : j))
        return json({ jobs })
      }

      if (path === '/api/jobs' && req.method === 'POST') {
        const { url: link } = (await req.json().catch(() => ({}))) as { url?: string }
        if (!link) return json({ error: 'Paste a link first' }, 400)
        const job = await createJob(env, link.trim())
        // Start right away; keeps going for ~30 s after we reply.
        ctx.waitUntil(step(env, job.id, 1))
        return json(job)
      }

      // The open app calls this in a loop to speed things up.
      if (path === '/api/pump' && req.method === 'POST') {
        await pumpAll(env, Date.now() + 20_000, 1)
        return json({ ok: true })
      }

      const m = /^\/api\/jobs\/([\w-]+)(?:\/(pause|resume|retry))?$/.exec(path)
      if (m) {
        const loaded = await loadJob(env, m[1])
        if (!loaded) return json({ error: 'Not found' }, 404)
        const { job, etag } = loaded
        if (req.method === 'DELETE') {
          if (job.uploadId && job.status !== 'done') await env.BUCKET.resumeMultipartUpload(job.key, job.uploadId).abort().catch(() => {})
          await env.BUCKET.delete(JOBS + job.id + '.json')
          return new Response(null, { status: 204 })
        }
        if (m[2] === 'pause' && isActive(job.status)) job.status = 'paused'
        if (m[2] === 'resume' && job.status === 'paused') job.status = 'queued'
        if (m[2] === 'retry' && job.status === 'error') { job.status = job.kind === 'magnet' ? 'remote' : 'queued'; job.error = undefined; job.urlExpires = 0 }
        if (m[2] === 'resume' && job.status === 'queued' && job.kind === 'magnet') job.status = 'remote'
        job.lockUntil = 0
        await saveJob(env, job, etag)
        return json(job)
      }

      if (path === '/api/files' && req.method === 'GET') {
        const prefix = url.searchParams.get('prefix') || ''
        const { folders, files } = await listFiles(env, prefix)
        return json({
          prefix,
          entries: [
            ...folders.map(f => ({ name: f.slice(prefix.length, -1), path: f, isDir: true, size: 0, mtime: 0, url: null })),
            ...files.map(f => ({ name: f.key.slice(prefix.length), path: f.key, isDir: false, size: f.size, mtime: f.mtime, url: fileUrl(f.key) })),
          ],
        })
      }

      if (path === '/api/files' && req.method === 'DELETE') {
        const key = url.searchParams.get('key') || ''
        if (!key || key.startsWith('.cloudbox/')) return json({ error: 'Bad key' }, 400)
        if (key.endsWith('/')) {
          let cursor: string | undefined
          do {
            const l = await env.BUCKET.list({ prefix: key, cursor })
            if (l.objects.length) await env.BUCKET.delete(l.objects.map(o => o.key))
            cursor = l.truncated ? l.cursor : undefined
          } while (cursor)
        } else {
          await env.BUCKET.delete(key)
        }
        return new Response(null, { status: 204 })
      }

      if (path === '/api/config' && req.method === 'GET') {
        const c = await getConfig(env)
        return json({ torbox: c.torboxKey ? '••••' + c.torboxKey.slice(-4) : '' })
      }

      if (path === '/api/config' && req.method === 'POST') {
        const { torboxKey } = (await req.json().catch(() => ({}))) as { torboxKey?: string }
        const key = String(torboxKey || '').trim()
        if (key) await torbox(key, '/user/me') // validates the key
        const c = await getConfig(env)
        c.torboxKey = key || undefined
        await env.BUCKET.put(CONFIG, JSON.stringify(c))
        return json({ torbox: key ? '••••' + key.slice(-4) : '' })
      }

      if (path === '/api/usage') {
        let bytes = 0
        let count = 0
        let cursor: string | undefined
        do {
          const l = await env.BUCKET.list({ cursor })
          for (const o of l.objects) if (!o.key.startsWith('.cloudbox/')) { bytes += o.size; count++ }
          cursor = l.truncated ? l.cursor : undefined
        } while (cursor)
        return json({ bytes, count })
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      return json({ error: (err as Error).message }, 400)
    }
  },

  // Every minute: keep copying with the app closed.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    torboxBase = env.TORBOX_URL || TORBOX
    ctx.waitUntil(pumpAll(env, Date.now() + 13 * 60_000, 8))
  },
} satisfies ExportedHandler<Env>
