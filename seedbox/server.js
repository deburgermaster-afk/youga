import express from 'express'
import WebTorrent from 'webtorrent'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads')
const PASSWORD = process.env.APP_PASSWORD || ''
const STATE_FILE = path.join(DOWNLOAD_DIR, '.torrents.json')

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

const client = new WebTorrent({ maxConns: 200 })
client.on('error', err => console.error('client error:', err.message))

// Remember added torrents so they resume after a restart/redeploy.
function saveState () {
  const ids = client.torrents.map(t => t.magnetURI)
  fs.writeFileSync(STATE_FILE, JSON.stringify(ids))
}

function addTorrent (id) {
  return new Promise((resolve, reject) => {
    const existing = client.torrents.find(t => t.magnetURI === id || t.infoHash === id)
    if (existing) return resolve(existing)
    const torrent = client.add(id, { path: DOWNLOAD_DIR }, t => { saveState(); resolve(t) })
    torrent.once('error', reject)
    // Resolve early so the UI shows it while metadata is fetched.
    setTimeout(() => resolve(torrent), 1500)
  })
}

if (fs.existsSync(STATE_FILE)) {
  for (const id of JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))) {
    addTorrent(id).catch(err => console.error('resume failed:', err.message))
  }
}

const app = express()

// Optional basic auth so strangers can't use your server.
if (PASSWORD) {
  app.use((req, res, next) => {
    const [, b64 = ''] = (req.headers.authorization || '').split(' ')
    const pass = Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':')
    if (pass === PASSWORD) return next()
    res.set('WWW-Authenticate', 'Basic realm="seedbox"').status(401).send('Auth required')
  })
}

app.use(express.static(path.join(__dirname, 'public')))

function serialize (t) {
  return {
    infoHash: t.infoHash,
    name: t.name || 'Fetching metadata…',
    ready: t.ready,
    progress: t.progress,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    peers: t.numPeers,
    length: t.length || 0,
    downloaded: t.downloaded,
    timeRemaining: t.timeRemaining,
    paused: t.paused,
    done: t.done,
    files: (t.files || []).map((f, i) => ({
      index: i, name: f.name, path: f.path, length: f.length, progress: f.progress
    }))
  }
}

app.get('/api/torrents', (req, res) => {
  res.json(client.torrents.map(serialize))
})

app.post('/api/torrents', express.json(), async (req, res) => {
  try {
    const t = await addTorrent(String(req.body.magnet || '').trim())
    res.json(serialize(t))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// Upload a .torrent file (raw body).
app.post('/api/torrents/file', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const t = await addTorrent(req.body)
    res.json(serialize(t))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/torrents/:hash/:action', (req, res) => {
  if (!['pause', 'resume'].includes(req.params.action)) return res.sendStatus(400)
  const t = client.torrents.find(t => t.infoHash === req.params.hash)
  if (!t) return res.sendStatus(404)
  req.params.action === 'pause' ? t.pause() : t.resume()
  res.json(serialize(t))
})

app.delete('/api/torrents/:hash', async (req, res) => {
  const t = client.torrents.find(t => t.infoHash === req.params.hash)
  if (!t) return res.sendStatus(404)
  const deleteFiles = req.query.files === '1'
  await t.destroy({ destroyStore: deleteFiles })
  saveState()
  res.sendStatus(204)
})

// Stream or download any file at original quality, with HTTP Range support
// so video players can seek. Works while the torrent is still downloading:
// requested pieces are prioritized.
app.get('/files/:hash/:index', (req, res) => {
  const t = client.torrents.find(t => t.infoHash === req.params.hash)
  const file = t?.files?.[Number(req.params.index)]
  if (!file) return res.sendStatus(404)

  const size = file.length
  const disposition = req.query.download ? 'attachment' : 'inline'
  res.set({
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeFor(file.name),
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`
  })

  let start = 0
  let end = size - 1
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '')
  if (range) {
    start = range[1] ? Number(range[1]) : size - Number(range[2])
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      return res.status(416).set('Content-Range', `bytes */${size}`).end()
    }
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
    '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
    '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt'
  }[ext] || 'application/octet-stream'
}

app.listen(PORT, () => console.log(`Seedbox running on http://localhost:${PORT}`))

// Keep the server up if a single torrent misbehaves.
process.on('uncaughtException', err => console.error('uncaught:', err))
