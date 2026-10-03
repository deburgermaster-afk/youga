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
  TMDB_URL?: string // override for local testing
}

type Job = {
  id: string
  movieId?: number // library movie this download belongs to
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

type Config = { torboxKey?: string; copyToCloud?: boolean; tmdbToken?: string }
async function getConfig(env: Env): Promise<Config> {
  const o = await env.BUCKET.get(CONFIG)
  return o ? o.json() : {}
}

let torboxBase = TORBOX
let tmdbBase = 'https://api.themoviedb.org/3'
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

async function createMagnetJob(env: Env, magnet: string, movieId?: number): Promise<Job> {
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
    movieId,
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

// ---------- Movie library ----------
const LIBRARY = '.cloudbox/library.json'
// 'archive' = a free, legal copy streamed straight from the Internet Archive.
type MovieFile = { source: 'torbox' | 'cloud' | 'archive'; torrentId?: number; fileId?: number; key?: string; url?: string; name: string; size: number }
type Movie = {
  id: number
  imdbId?: string
  title: string
  year?: string
  poster?: string
  backdrop?: string
  rating?: number
  runtime?: number
  genres?: string[]
  overview?: string
  addedAt: number
  addedBy?: string
  files: MovieFile[]
  pending?: string[] // job ids still downloading
  tv?: boolean // a series (id is the negative TMDB TV id)
  ratings?: Record<string, number> // personal rating (1-10) per profile
  watches?: { by: string; t: number }[] // who watched it and when
}

const PROFILE_ID = /^[a-z0-9]{1,16}$/

async function readLibrary(env: Env): Promise<Movie[]> {
  const o = await env.BUCKET.get(LIBRARY)
  return o ? o.json() : []
}

// Read-modify-write with an etag check so parallel updates don't clobber.
async function updateLibrary(env: Env, fn: (movies: Movie[]) => Movie[] | void) {
  for (let i = 0; i < 6; i++) {
    const o = await env.BUCKET.get(LIBRARY)
    const list: Movie[] = o ? await o.json() : []
    const next = fn(list) || list
    const r = await env.BUCKET.put(LIBRARY, JSON.stringify(next), o ? { onlyIf: { etagMatches: o.etag } } : undefined)
    if (r) return next
  }
  throw new Error('Library is busy, try again')
}

const sameFile = (a: MovieFile, b: MovieFile) =>
  a.source === b.source && (a.source === 'cloud' ? a.key === b.key : a.source === 'archive' ? a.url === b.url : a.torrentId === b.torrentId && a.fileId === b.fileId)

async function attachFiles(env: Env, movieId: number, files: MovieFile[], jobId?: string) {
  await updateLibrary(env, list => {
    const m = list.find(x => x.id === movieId)
    if (!m) return
    for (const file of files) if (!m.files.some(f => sameFile(f, file))) m.files.push(file)
    if (jobId) m.pending = (m.pending || []).filter(id => id !== jobId)
  })
}
const attachFile = (env: Env, movieId: number, file: MovieFile, jobId?: string) => attachFiles(env, movieId, [file], jobId)

const VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv)$/i
// The movie file in a torrent: the biggest video, ignoring samples.
function mainVideo<T extends { name: string; size: number }>(files: T[]) {
  const vids = files.filter(f => VIDEO.test(f.name) && !/sample/i.test(f.name))
  return (vids.length ? vids : files).slice().sort((a, b) => b.size - a.size)[0]
}

// ---------- TMDB (movie info) ----------
async function tmdb<T>(env: Env, path: string, params: Record<string, string> = {}, token?: string): Promise<T> {
  const key = token ?? (await getConfig(env)).tmdbToken
  if (!key) throw new Error('Add your TMDB key in Settings to search movies.')
  const u = new URL(tmdbBase + path)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  // v4 "read access tokens" are long JWTs; v3 API keys are 32 hex chars.
  const bearer = key.length > 40
  if (!bearer) u.searchParams.set('api_key', key)
  const r = await fetch(u.toString(), { headers: bearer ? { Authorization: `Bearer ${key}` } : {}, cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
  const body = (await r.json().catch(() => ({}))) as T & { status_message?: string }
  if (!r.ok) throw new Error(`TMDB: ${body.status_message || r.status}`)
  return body
}

// Movies keep their TMDB id; TV series are stored with a negative id so
// both fit the same library and URLs (TMDB movie and TV ids overlap).
type TmdbLite = {
  id: number; title?: string; name?: string; release_date?: string; first_air_date?: string
  poster_path?: string; backdrop_path?: string; vote_average?: number; overview?: string; media_type?: string
}
const lite = (m: TmdbLite, tv = m.media_type === 'tv') => ({
  id: tv ? -m.id : m.id, title: m.title || m.name || '', year: (m.release_date || m.first_air_date || '').slice(0, 4),
  poster: m.poster_path || '', backdrop: m.backdrop_path || '',
  rating: Math.round((m.vote_average || 0) * 10) / 10, overview: m.overview || '', tv,
})
const moviesAndShows = (r: TmdbLite[]) => r.filter(m => m.media_type === 'movie' || m.media_type === 'tv').map(m => lite(m))

type Video = { key: string; name: string; site: string; type: string; official?: boolean }
type Credits = { cast?: { name: string; character: string; profile_path?: string }[]; crew?: { job: string; name: string }[] }
// Official trailers first; the page autoplays the first one.
const trailersOf = (v?: Video[]) => (v || [])
  .filter(x => x.site === 'YouTube' && /Trailer|Teaser/.test(x.type))
  .map((x, i) => ({ x, score: (x.type === 'Trailer' ? 2 : 0) + (x.official ? 1 : 0), i }))
  .sort((a, b) => b.score - a.score || a.i - b.i)
  .slice(0, 6)
  .map(({ x }) => ({ key: x.key, name: x.name }))
const castOf = (c?: Credits) => (c?.cast || []).slice(0, 15).map(x => ({ name: x.name, character: x.character, profile: x.profile_path || '' }))

// IMDb ratings, many titles in one request, via IMDb's public GraphQL
// endpoint (limited personal use).
async function imdbRatings(ids: string[]): Promise<Record<string, { rating: number; votes: number }>> {
  const valid = [...new Set(ids.filter(id => /^tt\d+$/.test(id)))].slice(0, 25)
  if (!valid.length) return {}
  const query = '{ ' + valid.map((id, i) => `t${i}: title(id: "${id}") { ratingsSummary { aggregateRating voteCount } }`).join(' ') + ' }'
  const r = await fetch('https://caching.graphql.imdb.com/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-imdb-client-name': 'imdb-web-next-localized', 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query }),
  })
  if (!r.ok) return {}
  const d = (await r.json().catch(() => ({}))) as { data?: Record<string, { ratingsSummary?: { aggregateRating?: number; voteCount?: number } } | null> }
  const out: Record<string, { rating: number; votes: number }> = {}
  valid.forEach((id, i) => {
    const s = d.data?.[`t${i}`]?.ratingsSummary
    if (s?.aggregateRating) out[id] = { rating: s.aggregateRating, votes: s.voteCount || 0 }
  })
  return out
}

async function movieDetail(env: Env, id: number) {
  type D = TmdbLite & {
    imdb_id?: string; runtime?: number; tagline?: string; genres?: { name: string }[]; vote_count?: number
    production_countries?: { iso_3166_1: string; name: string }[]
    credits?: Credits
    videos?: { results?: Video[] }
    similar?: { results?: TmdbLite[] }
    release_dates?: { results?: { iso_3166_1: string; release_dates: { certification: string }[] }[] }
  }
  const d = await tmdb<D>(env, `/movie/${id}`, { append_to_response: 'credits,videos,similar,release_dates' })
  const cert = (d.release_dates?.results || []).find(r => r.iso_3166_1 === 'US')?.release_dates.find(x => x.certification)?.certification || ''
  return {
    ...lite(d, false),
    imdbId: d.imdb_id || '',
    runtime: d.runtime || 0,
    tagline: d.tagline || '',
    votes: d.vote_count || 0,
    genres: (d.genres || []).map(g => g.name),
    country: d.production_countries?.[0]?.iso_3166_1 || '',
    certification: cert,
    director: d.credits?.crew?.find(c => c.job === 'Director')?.name || '',
    cast: castOf(d.credits),
    trailers: trailersOf(d.videos?.results),
    similar: (d.similar?.results || []).slice(0, 15).map(m => lite(m, false)),
    seasons: [] as { n: number; name: string; episodes: number; poster: string; year: string }[],
  }
}

async function tvDetail(env: Env, id: number) {
  type D = TmdbLite & {
    tagline?: string; genres?: { name: string }[]; vote_count?: number; episode_run_time?: number[]
    origin_country?: string[]; created_by?: { name: string }[]; last_episode_to_air?: { runtime?: number }
    seasons?: { season_number: number; name: string; episode_count: number; poster_path?: string; air_date?: string }[]
    credits?: Credits; videos?: { results?: Video[] }; similar?: { results?: TmdbLite[] }
    content_ratings?: { results?: { iso_3166_1: string; rating: string }[] }
    external_ids?: { imdb_id?: string }
  }
  const d = await tmdb<D>(env, `/tv/${id}`, { append_to_response: 'credits,videos,similar,content_ratings,external_ids' })
  const seasons = (d.seasons || []).filter(x => x.episode_count > 0)
  const main = seasons.filter(x => x.season_number > 0)
  return {
    ...lite(d, true),
    imdbId: d.external_ids?.imdb_id || '',
    runtime: d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || 0,
    tagline: d.tagline || '',
    votes: d.vote_count || 0,
    genres: (d.genres || []).map(g => g.name),
    country: d.origin_country?.[0] || '',
    certification: (d.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US')?.rating || '',
    director: (d.created_by || []).map(c => c.name).join(', '),
    cast: castOf(d.credits),
    trailers: trailersOf(d.videos?.results),
    similar: (d.similar?.results || []).slice(0, 15).map(m => lite(m, true)),
    // Specials (season 0) go last.
    seasons: [...main, ...seasons.filter(x => x.season_number === 0)]
      .map(x => ({ n: x.season_number, name: x.name, episodes: x.episode_count, poster: x.poster_path || '', year: x.air_date?.slice(0, 4) || '' })),
  }
}

async function titleDetail(env: Env, id: number) {
  const d = id < 0 ? await tvDetail(env, -id) : await movieDetail(env, id)
  const r = d.imdbId ? (await imdbRatings([d.imdbId]).catch(() => ({})) as Record<string, { rating: number; votes: number }>)[d.imdbId] : undefined
  return { ...d, imdbRating: r?.rating || 0, imdbVotes: r?.votes || 0 }
}

async function seasonDetail(env: Env, id: number, n: number) {
  type E = { episode_number: number; name: string; still_path?: string; runtime?: number; overview?: string; air_date?: string; vote_average?: number }
  const d = await tmdb<{ episodes?: E[] }>(env, `/tv/${id}/season/${n}`)
  return {
    episodes: (d.episodes || []).map(e => ({
      n: e.episode_number, name: e.name, still: e.still_path || '', runtime: e.runtime || 0,
      overview: e.overview || '', airDate: e.air_date || '', rating: Math.round((e.vote_average || 0) * 10) / 10,
    })),
  }
}

// ---------- Free & legal copies (Internet Archive) ----------
// Only films we can be confident are free to watch:
//  - in one of the Archive's curated public-domain film collections, or
//  - released in 1930 or earlier (public domain in the US by age), or
//  - Creative Commons and uploaded by the film's own studio, or made by a
//    studio that releases everything under Creative Commons (Blender).
// Open "Community Video" uploads claiming a free license are NOT trusted on
// their own: people upload pirated films there with fake licenses.
const ARCHIVE_FILE = /^https:\/\/archive\.org\/download\/[^/]+\/.+/
const CURATED = new Set(['feature_films', 'silent_films', 'film_noir', 'SciFi_Horror', 'Comedy_Films', 'classic_cartoons', 'classic_tv', 'film_scifi'])
const COLLECTION_NAME: Record<string, string> = { feature_films: 'Feature Films', silent_films: 'Silent Films', film_noir: 'Film Noir', SciFi_Horror: 'Sci-Fi / Horror', Comedy_Films: 'Comedy Films', classic_cartoons: 'Classic Cartoons', classic_tv: 'Classic TV', film_scifi: 'Sci-Fi' }
const PD_YEAR = new Date().getFullYear() - 96 // US: published 95+ years ago

const normTitle = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(the|a|an) /, '').trim()
const list = <T,>(v: T | T[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v])

type Free = {
  found: boolean
  why?: string // "Public domain" / "Creative Commons (Blender Foundation)"
  source?: string // collection or license, for display
  page?: string
  file?: MovieFile
  checkedAt: number
}

async function freeCopy(env: Env, id: number): Promise<Free> {
  if (id <= 0) return { found: false, checkedAt: Date.now() } // movies only
  const key = `.cloudbox/cache/free/${id}.json`
  const cached = await env.BUCKET.get(key)
  if (cached) {
    const c = (await cached.json()) as Free
    if (Date.now() - c.checkedAt < (c.found ? 30 : 3) * 86400_000) return c
  }
  const result = await findFreeCopy(env, id).catch(() => ({ found: false, checkedAt: Date.now() }) as Free)
  await env.BUCKET.put(key, JSON.stringify(result))
  return result
}

async function findFreeCopy(env: Env, id: number): Promise<Free> {
  const none: Free = { found: false, checkedAt: Date.now() }
  const m = await tmdb<{ title: string; original_title?: string; release_date?: string; production_companies?: { name: string }[] }>(env, `/movie/${id}`)
  const year = Number((m.release_date || '').slice(0, 4)) || 0
  const titles = [...new Set([m.title, m.original_title].filter(Boolean).map(t => normTitle(t!)))]
  const studios = (m.production_companies || []).map(c => normTitle(c.name)).filter(s => s.length > 3)
  // Studios that release all their films under Creative Commons, so any copy may be shared.
  const openStudio = (m.production_companies || []).find(c => /blender/i.test(c.name))?.name

  const q = `title:(${JSON.stringify(m.title)}) AND mediatype:movies AND -collection:(movie_trailers)`
  const u = new URL('https://archive.org/advancedsearch.php')
  u.searchParams.set('q', q)
  for (const f of ['identifier', 'title', 'year', 'date', 'downloads', 'collection', 'licenseurl', 'creator']) u.searchParams.append('fl[]', f)
  u.searchParams.set('rows', '25')
  u.searchParams.append('sort[]', 'downloads desc')
  u.searchParams.set('output', 'json')
  const r = await fetch(u.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit)
  if (!r.ok) return none
  type Doc = { identifier: string; title?: string; year?: string | number; date?: string; downloads?: number; collection?: string | string[]; licenseurl?: string; creator?: string | string[] }
  const docs = ((await r.json()) as { response?: { docs?: Doc[] } }).response?.docs || []

  const candidates = docs.flatMap(d => {
    const t = normTitle(String(d.title || ''))
    if (/\btrailer\b|\bteaser\b|\bclip\b|\breview\b|\bpodcast\b/.test(t)) return []
    const y = Number(d.year) || Number(String(d.date || '').slice(0, 4)) || Number(/\b(18|19|20)\d\d\b/.exec(String(d.title))?.[0]) || 0
    if (y && year && Math.abs(y - year) > 1) return []
    // Exact title, or the title plus edition words ("restored", "1922"), or a
    // short subtitle when the year matches too.
    const titleOk = titles.some(x => {
      if (t === x) return true
      if (!t.startsWith(x + ' ')) return false
      const rest = t.slice(x.length).trim()
      return /^((19|20)\d\d|restored|remastered|complete|uncut|hd|dvd|quality|full|movie|film|colori[sz]ed|version|\d+p|\d+ mins?|\s)+$/.test(rest)
        || (!!y && rest.split(' ').length <= 6)
    })
    if (!titleOk) return []
    const cols = list(d.collection)
    const curated = cols.find(c => CURATED.has(c))
    const license = String(d.licenseurl || '')
    const creators = list(d.creator).map(c => normTitle(String(c)))
    const byStudio = /creativecommons\.org/.test(license) && studios.some(s => creators.some(c => c.includes(s) || s.includes(c)))
    const byAge = year > 0 && year <= PD_YEAR
    if (!curated && !byAge && !byStudio && !openStudio) return []
    if (!y && !curated) return []
    const why = curated || byAge ? 'Public domain' : `Creative Commons (${openStudio || list(d.creator)[0]})`
    const source = curated ? `Internet Archive · ${COLLECTION_NAME[curated]}` : 'Internet Archive'
    return [{ id: d.identifier, why, source }]
  })

  // First candidate with a video file a browser can play.
  for (const c of candidates.slice(0, 3)) {
    const md = await fetch(`https://archive.org/metadata/${encodeURIComponent(c.id)}`)
    if (!md.ok) continue
    const files = ((await md.json()) as { files?: { name: string; size?: string; format?: string }[] }).files || []
    const vids = files
      .filter(f => /\.(mp4|m4v|webm|mkv|ogv)$/i.test(f.name) && !/trailer|sample/i.test(f.name) && Number(f.size || 0) > 20_000_000)
      // MP4 plays everywhere (iPhone too); otherwise the biggest file.
      .sort((a, b) => Number(/\.(mp4|m4v)$/i.test(b.name)) - Number(/\.(mp4|m4v)$/i.test(a.name)) || Number(b.size || 0) - Number(a.size || 0))
    const best = vids[0]
    if (!best) continue
    const url = `https://archive.org/download/${encodeURIComponent(c.id)}/${best.name.split('/').map(encodeURIComponent).join('/')}`
    return {
      found: true, why: c.why, source: c.source, page: `https://archive.org/details/${encodeURIComponent(c.id)}`,
      file: { source: 'archive', url, name: best.name.split('/').pop() || best.name, size: Number(best.size || 0) },
      checkedAt: Date.now(),
    }
  }
  return none
}

// Small facts for search rows (IMDb rating, top cast), cached in R2 and in
// memory so lists fill in instantly the second time.
type Meta = { imdbId: string; imdb: number; votes: number; cast: string[]; t: number }
const metaMem = new Map<number, Meta>()
const META_TTL = 7 * 24 * 3600_000
async function metaFor(env: Env, ids: number[]) {
  const out: Record<number, Meta> = {}
  const missing: number[] = []
  await Promise.all(ids.map(async id => {
    const mem = metaMem.get(id)
    if (mem && Date.now() - mem.t < META_TTL) return void (out[id] = mem)
    const o = await env.BUCKET.get(`.cloudbox/cache/meta/${id}.json`)
    const m = o ? ((await o.json()) as Meta) : null
    if (m && Date.now() - m.t < META_TTL) { metaMem.set(id, m); out[id] = m } else missing.push(id)
  }))
  if (!missing.length) return out
  const fresh = await Promise.all(missing.map(async id => {
    try {
      const d = id < 0
        ? await tmdb<{ external_ids?: { imdb_id?: string }; credits?: Credits }>(env, `/tv/${-id}`, { append_to_response: 'credits,external_ids' })
        : await tmdb<{ imdb_id?: string; credits?: Credits }>(env, `/movie/${id}`, { append_to_response: 'credits' })
      const imdbId = ('imdb_id' in d ? d.imdb_id : (d as { external_ids?: { imdb_id?: string } }).external_ids?.imdb_id) || ''
      return { id, imdbId, cast: (d.credits?.cast || []).slice(0, 3).map(c => c.name) }
    } catch { return null }
  }))
  const ratings = await imdbRatings(fresh.map(f => f?.imdbId || '')).catch(() => ({} as Record<string, { rating: number; votes: number }>))
  await Promise.all(fresh.map(async f => {
    if (!f) return
    const m: Meta = { imdbId: f.imdbId, imdb: ratings[f.imdbId]?.rating || 0, votes: ratings[f.imdbId]?.votes || 0, cast: f.cast, t: Date.now() }
    out[f.id] = m
    metaMem.set(f.id, m)
    await env.BUCKET.put(`.cloudbox/cache/meta/${f.id}.json`, JSON.stringify(m))
  }))
  return out
}

// Per-isolate cache of TorBox download links (they're valid for hours), so
// seeking in a video doesn't call the TorBox API for every range request.
const linkCache = new Map<string, { url: string; exp: number }>()
async function torboxLink(key: string, torrentId: number, fileId: number) {
  const id = `${torrentId}:${fileId}`
  const hit = linkCache.get(id)
  if (hit && hit.exp > Date.now()) return hit.url
  const q = new URLSearchParams({ token: key, torrent_id: String(torrentId), file_id: String(fileId) })
  const url = await torbox<string>(key, `/torrents/requestdl?${q}`)
  if (!/^https?:\/\//.test(url || '')) throw new Error('TorBox did not return a download link')
  linkCache.set(id, { url, exp: Date.now() + 60 * 60 * 1000 })
  return url
}

type TbTorrent = { id: number; name: string; size: number; created_at?: string; updated_at?: string; download_finished: boolean; download_present: boolean; files?: { id: number; name: string; short_name?: string; size: number }[] }

async function torboxFiles(env: Env) {
  const { torboxKey } = await getConfig(env)
  if (!torboxKey) return []
  const list = await torbox<TbTorrent[]>(torboxKey, '/torrents/mylist?bypass_cache=true')
  return (list || [])
    .filter(t => (t.download_finished || t.download_present) && t.files?.length)
    .flatMap(t => t.files!.map(f => {
      const name = f.short_name || f.name.split('/').pop() || f.name
      return {
        name,
        path: `tb:${t.id}:${f.id}`,
        isDir: false,
        size: f.size,
        mtime: Date.parse(t.updated_at || t.created_at || '') || 0,
        url: `/tb/${t.id}/${f.id}/${encodeURIComponent(name)}`,
        source: 'torbox' as const,
        torrentId: t.id,
        fileId: f.id,
        torrentName: t.name,
      }
    }))
}

// Relay a TorBox file through the Worker so the API key never reaches the
// browser or a copied link. Range requests pass straight through.
async function serveTorbox(req: Request, env: Env, torrentId: number, fileId: number, name: string) {
  const { torboxKey } = await getConfig(env)
  if (!torboxKey) return new Response('TorBox not connected', { status: 404 })
  const link = await torboxLink(torboxKey, torrentId, fileId)
  const fwd = new Headers()
  for (const h of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
    const v = req.headers.get(h)
    if (v) fwd.set(h, v)
  }
  const up = await fetch(link, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: fwd })
  if (up.status >= 400) linkCache.delete(`${torrentId}:${fileId}`)
  const headers = new Headers()
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = up.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (!headers.get('content-type') || headers.get('content-type') === 'application/octet-stream') headers.set('content-type', mime(name))
  headers.set('accept-ranges', 'bytes')
  headers.set('content-disposition', `${new URL(req.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`)
  return new Response(up.body, { status: up.status, headers })
}

async function createJob(env: Env, raw: string, movieId?: number): Promise<Job> {
  const job = await createJobInner(env, raw, movieId)
  if (movieId) {
    await updateLibrary(env, list => {
      const m = list.find(x => x.id === movieId)
      if (m) m.pending = [...(m.pending || []), job.id]
    })
  }
  return job
}

async function createJobInner(env: Env, raw: string, movieId?: number): Promise<Job> {
  if (isMagnet(raw)) return createMagnetJob(env, raw, movieId)
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
    movieId,
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
        // TorBox is the engine: files play straight from it. Copying into
        // R2 is optional (permanent storage, but slower).
        if ((await getConfig(env)).copyToCloud) {
          await spawnCopies(env, job, t.files)
          job.children = t.files.length
        }
        job.remoteProgress = 1
        job.status = 'done'
        if (job.movieId) {
          // A series gets every episode in the torrent; a movie its main file.
          const eps = t.files.filter(f => VIDEO.test(f.name) && !/sample/i.test(f.name))
          const pick = job.movieId < 0 && eps.length ? eps : [mainVideo(t.files)]
          await attachFiles(env, job.movieId, pick.map(f => ({ source: 'torbox' as const, torrentId: job.torbox!.torrentId, fileId: f.id, name: f.name.split('/').pop() || f.name, size: f.size })), job.id)
        }
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
  if (job.status === 'done' && job.movieId) {
    await attachFile(env, job.movieId, { source: 'cloud', key: job.key, name: job.name, size: job.size }, job.id).catch(() => {})
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
    tmdbBase = env.TMDB_URL || 'https://api.themoviedb.org/3'
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

    if (path.startsWith('/api/') || path.startsWith('/f/') || path.startsWith('/tb/')) {
      if (!(await authed(req, env))) return json({ error: 'Login required' }, 401)
    } else {
      return env.ASSETS.fetch(req)
    }

    try {
      const tb = /^\/tb\/(\d+)\/(\d+)(?:\/(.*))?$/.exec(path)
      if (tb) return serveTorbox(req, env, Number(tb[1]), Number(tb[2]), decodeURIComponent(tb[3] || 'file'))

      if (path === '/api/torbox/files' && req.method === 'GET') return json({ entries: await torboxFiles(env) })

      const tbDel = /^\/api\/torbox\/(\d+)$/.exec(path)
      if (tbDel && req.method === 'DELETE') {
        const { torboxKey } = await getConfig(env)
        if (!torboxKey) return json({ error: 'TorBox not connected' }, 400)
        await torbox(torboxKey, '/torrents/controltorrent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ torrent_id: Number(tbDel[1]), operation: 'delete' }),
        })
        return new Response(null, { status: 204 })
      }

      // Copy one TorBox file into R2 for permanent storage.
      if (path === '/api/torbox/save' && req.method === 'POST') {
        const b = (await req.json().catch(() => ({}))) as { torrentId?: number; fileId?: number; name?: string; size?: number; torrentName?: string }
        if (b.torrentId === undefined || b.fileId === undefined || !b.name || !b.size) return json({ error: 'Missing file details' }, 400)
        const parent = { torbox: { torrentId: b.torrentId } } as Job
        const folder = b.torrentName && b.torrentName !== b.name ? `${b.torrentName}/` : ''
        await spawnCopies(env, parent, [{ id: b.fileId, name: folder + b.name, size: b.size }])
        ctx.waitUntil(pumpAll(env, Date.now() + 25_000, 1))
        return json({ ok: true })
      }

      if (path.startsWith('/f/')) {
        return serveFile(req, env, path.slice(3).split('/').map(decodeURIComponent).join('/'))
      }

      // TorBox download links embed the API key, so never send them to the browser.
      if (path === '/api/jobs' && req.method === 'GET') {
        const jobs = (await listJobs(env)).map(j => (j.torbox?.fileId !== undefined ? { ...j, url: '' } : j))
        return json({ jobs })
      }

      if (path === '/api/jobs' && req.method === 'POST') {
        const { url: link, movieId } = (await req.json().catch(() => ({}))) as { url?: string; movieId?: number }
        if (!link) return json({ error: 'Paste a link first' }, 400)
        const job = await createJob(env, link.trim(), movieId ? Number(movieId) : undefined)
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

      // ---- Movie & series info (TMDB) ----
      // Browser-cacheable, so lists and pages come back instantly.
      const cache = (secs: number) => ({ 'cache-control': `private, max-age=${secs}` })
      if (path === '/api/tmdb/search') {
        const q = url.searchParams.get('q') || ''
        if (!q.trim()) return json({ results: [] })
        const r = await tmdb<{ results: TmdbLite[] }>(env, '/search/multi', { query: q, include_adult: 'false' })
        return json({ results: moviesAndShows(r.results) }, 200, cache(600))
      }
      if (path === '/api/tmdb/trending') {
        const r = await tmdb<{ results: TmdbLite[] }>(env, '/trending/all/week')
        return json({ results: moviesAndShows(r.results) }, 200, cache(3600))
      }
      const tm = /^\/api\/tmdb\/(?:movie|title)\/(-?\d+)$/.exec(path)
      if (tm) return json(await titleDetail(env, Number(tm[1])), 200, cache(3600))
      const ts = /^\/api\/tmdb\/tv\/(\d+)\/season\/(\d+)$/.exec(path)
      if (ts) return json(await seasonDetail(env, Number(ts[1]), Number(ts[2])), 200, cache(3600))
      const fr = /^\/api\/free\/(-?\d+)$/.exec(path)
      if (fr) return json(await freeCopy(env, Number(fr[1])), 200, cache(3600))
      if (path === '/api/meta') {
        const ids = (url.searchParams.get('ids') || '').split(',').map(Number).filter(n => Number.isInteger(n) && n !== 0).slice(0, 12)
        return json(await metaFor(env, ids), 200, cache(86400))
      }

      // ---- Library ----
      if (path === '/api/library' && req.method === 'GET') return json({ movies: (await readLibrary(env)).sort((a, b) => b.addedAt - a.addedAt) })
      if (path === '/api/library' && req.method === 'POST') {
        const b = (await req.json().catch(() => ({}))) as { id?: number; addedBy?: string }
        if (!b.id) return json({ error: 'Missing movie id' }, 400)
        const id = Number(b.id)
        const d = id < 0 ? await tvDetail(env, -id) : await movieDetail(env, id)
        const next = await updateLibrary(env, list => {
          if (list.some(m => m.id === d.id)) return
          list.push({
            id: d.id, imdbId: d.imdbId, title: d.title, year: d.year, poster: d.poster, backdrop: d.backdrop, rating: d.rating,
            runtime: d.runtime, genres: d.genres, overview: d.overview, addedAt: Date.now(), addedBy: b.addedBy, files: [],
            ...(d.tv ? { tv: true } : {}),
          })
        })
        return json(next.find(m => m.id === d.id))
      }
      const lib = /^\/api\/library\/(-?\d+)(\/attach|\/detach|\/rate|\/watched)?$/.exec(path)
      if (lib) {
        const id = Number(lib[1])
        if (req.method === 'DELETE' && !lib[2]) {
          await updateLibrary(env, list => list.filter(m => m.id !== id))
          return new Response(null, { status: 204 })
        }
        if (req.method === 'POST' && lib[2] === '/attach') {
          const b = (await req.json().catch(() => ({}))) as MovieFile & { files?: MovieFile[] }
          const files = (b.files || [b]).filter(f => f && f.source && f.name)
            .filter(f => f.source !== 'archive' || ARCHIVE_FILE.test(f.url || ''))
            .map(f => ({ source: f.source, torrentId: f.torrentId, fileId: f.fileId, key: f.key, url: f.source === 'archive' ? f.url : undefined, name: f.name, size: f.size || 0 }))
          if (!files.length) return json({ error: 'Missing file' }, 400)
          await attachFiles(env, id, files)
          return json({ ok: true })
        }
        if (req.method === 'POST' && lib[2] === '/detach') {
          const f = (await req.json().catch(() => ({}))) as MovieFile
          await updateLibrary(env, list => { const m = list.find(x => x.id === id); if (m) m.files = m.files.filter(x => !sameFile(x, f)) })
          return json({ ok: true })
        }
        // Personal rating: 1-10 per profile; 0 clears it.
        if (req.method === 'POST' && lib[2] === '/rate') {
          const b = (await req.json().catch(() => ({}))) as { by?: string; value?: number }
          const v = Math.round(Number(b.value))
          if (!b.by || !PROFILE_ID.test(b.by) || !(v >= 0 && v <= 10)) return json({ error: 'Bad rating' }, 400)
          let found = false
          await updateLibrary(env, list => {
            const m = list.find(x => x.id === id)
            if (!m) return
            found = true
            const r = { ...m.ratings }
            if (v) r[b.by!] = v
            else delete r[b.by!]
            m.ratings = r
          })
          return found ? json({ ok: true }) : json({ error: 'Not in your vault' }, 404)
        }
        // Watch log for the contributions calendar; one entry per person per 6 hours.
        if (req.method === 'POST' && lib[2] === '/watched') {
          const b = (await req.json().catch(() => ({}))) as { by?: string }
          if (!b.by || !PROFILE_ID.test(b.by)) return json({ error: 'Bad profile' }, 400)
          const now = Date.now()
          await updateLibrary(env, list => {
            const m = list.find(x => x.id === id)
            if (!m) return
            const w = (m.watches || []).filter(x => !(x.by === b.by && now - x.t < 6 * 3600_000))
            w.push({ by: b.by!, t: now })
            m.watches = w.slice(-100)
          })
          return json({ ok: true })
        }
      }

      const mask = (k?: string) => (k ? '••••' + k.slice(-4) : '')
      const publicConfig = (c: Config) => ({ torbox: mask(c.torboxKey), tmdb: mask(c.tmdbToken), copyToCloud: !!c.copyToCloud })

      if (path === '/api/config' && req.method === 'GET') return json(publicConfig(await getConfig(env)))

      // Only fields present in the body change.
      if (path === '/api/config' && req.method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as { torboxKey?: string; copyToCloud?: boolean; tmdbToken?: string }
        const c = await getConfig(env)
        if (body.torboxKey !== undefined) {
          const key = String(body.torboxKey).trim()
          if (key) await torbox(key, '/user/me') // validates the key
          c.torboxKey = key || undefined
        }
        if (typeof body.copyToCloud === 'boolean') c.copyToCloud = body.copyToCloud
        if (body.tmdbToken !== undefined) {
          const t = String(body.tmdbToken).trim()
          if (t) await tmdb(env, '/configuration', {}, t) // validates the key
          c.tmdbToken = t || undefined
        }
        await env.BUCKET.put(CONFIG, JSON.stringify(c))
        return json(publicConfig(c))
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
    tmdbBase = env.TMDB_URL || 'https://api.themoviedb.org/3'
    ctx.waitUntil(pumpAll(env, Date.now() + 13 * 60_000, 8))
  },
} satisfies ExportedHandler<Env>
