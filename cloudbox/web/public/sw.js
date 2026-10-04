// Seedbox service worker: opens instantly and keeps posters/movie info cached.
// Video streams (/tb, /f, any Range request) always go straight to the network.
const SHELL = 'shell-v2'
const ASSETS = 'assets-v1'
const IMG = 'img-v1'
const API = 'api-v1'
const KEEP = [SHELL, ASSETS, IMG, API]

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest'])).catch(() => {}))
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  const r = e.request
  if (r.method !== 'GET' || r.headers.has('range')) return
  const u = new URL(r.url)
  if (u.origin === location.origin) {
    if (u.pathname.startsWith('/tb/') || u.pathname.startsWith('/f/')) return
    if (r.mode === 'navigate') return e.respondWith(page())
    if (u.pathname.startsWith('/assets/') || /\.(png|webmanifest|woff2)$/.test(u.pathname)) return e.respondWith(cacheFirst(r, ASSETS))
    if (u.pathname.startsWith('/api/tmdb/') || u.pathname === '/api/meta') return e.respondWith(fresh(e, r, API))
    return
  }
  if (u.hostname === 'image.tmdb.org' || u.hostname === 'i.ytimg.com') return e.respondWith(image(r))
})

// The app page: network first so updates show on the next open; cached copy
// if offline or the network takes longer than 1.5 s.
async function page() {
  const cache = await caches.open(SHELL)
  const net = fetch('/').then(res => { if (res.ok) cache.put('/', res.clone()); return res })
  const slow = new Promise(ok => setTimeout(ok, 1500)).then(() => cache.match('/'))
  try {
    return (await Promise.race([net, slow])) || (await net)
  } catch {
    return (await cache.match('/')) || Response.error()
  }
}

// Stale-while-revalidate: answer from cache right away, refresh in the background.
async function fresh(e, r, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(r)
  const net = fetch(r).then(res => {
    if (res.ok) cache.put(r, res.clone())
    return res
  })
  if (hit) { e.waitUntil(net.catch(() => {})); return hit }
  return net
}

async function cacheFirst(r, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(r)
  if (hit) return hit
  const res = await fetch(r)
  if (res.ok) cache.put(r, res.clone())
  return res
}

// Posters: fetched with CORS so the cache stores real (not padded opaque) responses.
let puts = 0
async function image(r) {
  const cache = await caches.open(IMG)
  const hit = await cache.match(r.url)
  if (hit) return hit
  try {
    const res = await fetch(r.url, { mode: 'cors', credentials: 'omit' })
    if (res.ok) {
      await cache.put(r.url, res.clone())
      if (++puts % 50 === 0) trim(cache, 600)
    }
    return res
  } catch {
    return fetch(r)
  }
}

async function trim(cache, max) {
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k)
}
