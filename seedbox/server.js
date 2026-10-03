import express from 'express'
import WebTorrent from 'webtorrent'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads'))
const PASSWORD = process.env.APP_PASSWORD || ''
const STATE_FILE = path.join(DOWNLOAD_DIR, '.seedbox.json')
const PUBLIC_DIR = path.join(__dirname, 'public')

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

// ---------- Auth ----------
// Session cookie for the UI, plus a link token (?t=) so copied links work
// in external players (VLC, MX Player, Infuse) that can't log in.
const SECRET = crypto.createHash('sha256').update('seedbox:' + PASSWORD).digest()
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url')
const SESSION = sign('session')
const LINK_TOKEN = sign('links').slice(0, 24)

function cookie (req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : ''
}
const authed = req => !PASSWORD || cookie(req, 'sb') === SESSION || req.query.t === LINK_TOKEN
const requireAuth = (req, res, next) => authed(req) ? next() : res.status(401).json({ error: 'Login required' })

// ---------- State ----------
const state = { torrents: [], downloadLimit: -1, uploadLimit: -1 }
try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))) } catch {}

const client = new WebTorrent({ maxConns: 300 })
client.on('error', err => console.error('client error:', err.message))
client.throttleDownload(state.downloadLimit)
client.throttleUpload(state.uploadLimit)

const addedAt = new Map(state.torrents.map(t => [t.infoHash, t.addedAt]))

function saveState () {
  state.torrents = client.torrents
    .filter(t => t.infoHash)
    .map(t => ({ magnet: t.magnetURI, infoHash: t.infoHash, addedAt: addedAt.get(t.infoHash) || Date.now(), paused: t.paused }))
  fs.writeFile(STATE_FILE, JSON.stringify(state), () => {})
}

function findTorrent (hash) {
  return client.torrents.find(t => t.infoHash === hash)
}

function addTorrent (id, { paused = false } = {}) {
  return new Promise((resolve, reject) => {
    let torrent
    try {
      torrent = client.add(id, { path: DOWNLOAD_DIR, paused }, t => { saveState(); resolve(t) })
    } catch (err) {
      return reject(err)
    }
    torrent.once('error', reject)
    torrent.once('infoHash', () => {
      if (!addedAt.has(torrent.infoHash)) addedAt.set(torrent.infoHash, Date.now())
      saveState()
    })
    // Don't wait for metadata; the UI shows it while peers are found.
    setTimeout(() => resolve(torrent), 1200)
  })
}

for (const t of state.torrents) {
  addTorrent(t.magnet, { paused: t.paused }).catch(err => console.error('resume failed:', err.message))
}

// ---------- Serialization ----------
const fileUrl = (t, i) => `/files/${t.infoHash}/${i}/${encodeURIComponent(t.files[i].name)}`

function serialize (t) {
  return {
    infoHash: t.infoHash,
    name: t.name || 'Fetching metadata…',
    magnet: t.magnetURI,
    ready: t.ready,
    progress: t.progress,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    uploaded: t.uploaded,
    ratio: t.ratio,
    peers: t.numPeers,
    length: t.length || 0,
    downloaded: t.downloaded,
    timeRemaining: t.timeRemaining,
    paused: t.paused,
    done: t.done,
    addedAt: addedAt.get(t.infoHash) || 0,
    files: (t.files || []).map((f, i) => ({
      index: i, name: f.name, path: f.path, length: f.length, progress: f.progress, url: fileUrl(t, i)
    }))
  }
}

function diskStats () {
  try {
    const s = fs.statfsSync(DOWNLOAD_DIR)
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }
  } catch {
    return { total: 0, free: 0 }
  }
}

function snapshot () {
  return {
    stats: {
      downloadSpeed: client.downloadSpeed,
      uploadSpeed: client.uploadSpeed,
      ratio: client.ratio,
      peers: client.torrents.reduce((n, t) => n + t.numPeers, 0),
      active: client.torrents.filter(t => !t.paused && !t.done).length,
      seeding: client.torrents.filter(t => !t.paused && t.done).length,
      downloadLimit: state.downloadLimit,
      uploadLimit: state.uploadLimit,
      disk: diskStats()
    },
    torrents: client.torrents.map(serialize).sort((a, b) => b.addedAt - a.addedAt)
  }
}

// ---------- App ----------
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)

app.get('/api/me', (req, res) => {
  res.json({ authRequired: !!PASSWORD, authed: authed(req), linkToken: authed(req) && PASSWORD ? LINK_TOKEN : '' })
})

app.post('/api/login', express.json(), (req, res) => {
  const ok = PASSWORD && crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(req.body.password || '')).digest(),
    crypto.createHash('sha256').update(PASSWORD).digest()
  )
  if (!ok) return res.status(401).json({ error: 'Wrong password' })
  res.set('Set-Cookie', `sb=${SESSION}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${req.secure ? '; Secure' : ''}`)
  res.json({ ok: true, linkToken: LINK_TOKEN })
})

app.post('/api/logout', (req, res) => {
  res.set('Set-Cookie', 'sb=; Path=/; Max-Age=0').json({ ok: true })
})

app.use(['/api', '/files', '/disk'], requireAuth)

app.get('/api/state', (req, res) => res.json(snapshot()))

// Live updates via Server-Sent Events: one push per second.
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  const send = () => res.write(`data: ${JSON.stringify(snapshot())}\n\n`)
  send()
  const timer = setInterval(send, 1000)
  req.on('close', () => clearInterval(timer))
})

app.post('/api/torrents', express.json(), async (req, res) => {
  const magnet = String(req.body.magnet || '').trim()
  if (!magnet) return res.status(400).json({ error: 'Magnet link or info hash required' })
  try {
    res.json(serialize(await addTorrent(magnet)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/torrents/file', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    res.json(serialize(await addTorrent(req.body)))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/torrents/:hash/:action', (req, res) => {
  const t = findTorrent(req.params.hash)
  if (!t) return res.sendStatus(404)
  if (req.params.action === 'pause') t.pause()
  else if (req.params.action === 'resume') t.resume()
  else return res.sendStatus(400)
  saveState()
  res.json(serialize(t))
})

app.delete('/api/torrents/:hash', async (req, res) => {
  const t = findTorrent(req.params.hash)
  if (!t) return res.sendStatus(404)
  await t.destroy({ destroyStore: req.query.files === '1' })
  addedAt.delete(req.params.hash)
  saveState()
  res.sendStatus(204)
})

// M3U playlist of a torrent's media files, for one-tap playback in VLC etc.
app.get('/api/torrents/:hash/playlist.m3u', (req, res) => {
  const t = findTorrent(req.params.hash)
  if (!t?.files) return res.sendStatus(404)
  const base = `${req.protocol}://${req.get('host')}`
  const tok = PASSWORD ? `?t=${LINK_TOKEN}` : ''
  const lines = ['#EXTM3U']
  t.files.forEach((f, i) => {
    if (/\.(mp4|mkv|webm|avi|mov|m4v|ts|mp3|flac|m4a|ogg|wav)$/i.test(f.name)) {
      lines.push(`#EXTINF:-1,${f.name}`, base + fileUrl(t, i) + tok)
    }
  })
  res.set({ 'Content-Type': 'audio/x-mpegurl', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(t.name)}.m3u` })
  res.send(lines.join('\n') + '\n')
})

app.post('/api/settings', express.json(), (req, res) => {
  const limit = v => (v === undefined ? undefined : Number(v) > 0 ? Number(v) : -1)
  const down = limit(req.body.downloadLimit)
  const up = limit(req.body.uploadLimit)
  if (down !== undefined) { state.downloadLimit = down; client.throttleDownload(down) }
  if (up !== undefined) { state.uploadLimit = up; client.throttleUpload(up) }
  saveState()
  res.json({ downloadLimit: state.downloadLimit, uploadLimit: state.uploadLimit })
})

// Browse everything stored on the server (finished and in-progress).
function safePath (rel) {
  const p = path.resolve(DOWNLOAD_DIR, '.' + path.posix.normalize('/' + String(rel || '')))
  if (p !== DOWNLOAD_DIR && !p.startsWith(DOWNLOAD_DIR + path.sep)) throw new Error('Bad path')
  return p
}

function dirSize (p) {
  let total = 0
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name)
    total += e.isDirectory() ? dirSize(full) : fs.statSync(full).size
  }
  return total
}

app.get('/api/disk', (req, res) => {
  try {
    const dir = safePath(req.query.path)
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        const full = path.join(dir, e.name)
        const st = fs.statSync(full)
        const rel = path.relative(DOWNLOAD_DIR, full).split(path.sep).join('/')
        return {
          name: e.name,
          path: rel,
          isDir: e.isDirectory(),
          size: e.isDirectory() ? dirSize(full) : st.size,
          mtime: st.mtimeMs,
          url: e.isDirectory() ? null : '/disk/' + rel.split('/').map(encodeURIComponent).join('/')
        }
      })
      .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name))
    res.json({ path: path.relative(DOWNLOAD_DIR, dir).split(path.sep).join('/'), entries })
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
})

app.delete('/api/disk', async (req, res) => {
  try {
    const p = safePath(req.query.path)
    if (p === DOWNLOAD_DIR) return res.status(400).json({ error: 'Refusing to delete root' })
    // Stop any torrent that owns these files first.
    for (const t of client.torrents) {
      if (t.name && path.join(DOWNLOAD_DIR, t.name) === p) {
        addedAt.delete(t.infoHash)
        await t.destroy()
      }
    }
    fs.rmSync(p, { recursive: true, force: true })
    saveState()
    res.sendStatus(204)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/disk/*splat', (req, res) => {
  try {
    const p = safePath([].concat(req.params.splat).join('/'))
    if (req.query.download) res.attachment(path.basename(p))
    res.sendFile(p, { dotfiles: 'deny', acceptRanges: true, headers: { 'Content-Type': mimeFor(p) } })
  } catch {
    res.sendStatus(404)
  }
})

// Stream or download any torrent file at original quality, with Range
// support for seeking. Works mid-download: requested pieces are prioritized.
app.get('/files/:hash/:index{/:name}', (req, res) => {
  const t = findTorrent(req.params.hash)
  const file = t?.files?.[Number(req.params.index)]
  if (!file) return res.sendStatus(404)

  // Finished files are served straight from disk (fastest path).
  const onDisk = path.join(DOWNLOAD_DIR, file.path)
  if (file.progress === 1 && fs.existsSync(onDisk)) {
    if (req.query.download) res.attachment(file.name)
    return res.sendFile(onDisk, { acceptRanges: true, headers: { 'Content-Type': mimeFor(file.name) } })
  }

  const size = file.length
  res.set({
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeFor(file.name),
    'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`
  })

  let start = 0
  let end = size - 1
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
  if (range) {
    start = range[1] ? Number(range[1]) : size - Number(range[2])
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) return res.status(416).set('Content-Range', `bytes */${size}`).end()
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  res.set('Content-Length', String(end - start + 1))
  if (req.method === 'HEAD') return res.end()

  const stream = file.createReadStream({ start, end })
  stream.on('error', () => res.destroy())
  req.on('close', () => stream.destroy())
  stream.pipe(res)
})

function mimeFor (name) {
  const ext = path.extname(name).toLowerCase()
  return {
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t',
    '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt'
  }[ext] || 'application/octet-stream'
}

// SPA
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }))
app.get('/{*splat}', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')))

app.listen(PORT, () => console.log(`Seedbox running on http://localhost:${PORT} (files in ${DOWNLOAD_DIR})`))

// Keep the server up if a single torrent misbehaves.
process.on('uncaughtException', err => console.error('uncaught:', err))
process.on('unhandledRejection', err => console.error('unhandled:', err))
