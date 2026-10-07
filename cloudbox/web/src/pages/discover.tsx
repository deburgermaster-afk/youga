import { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, CaptionsOff, Check, Info, Maximize2, Minimize2, Plus, Star, Volume2, VolumeX } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { TrailerBackground } from '@/components/trailer'
import { api, img, peek, prefetchTitle, type Movie, type MovieDetail, type MovieLite } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

const NOW = new Date().getFullYear()
const RANGES = [
  { label: 'Newest', from: NOW - 1, to: NOW, days: 120 },
  { label: String(NOW), from: NOW, to: NOW },
  { label: String(NOW - 1), from: NOW - 1, to: NOW - 1 },
  { label: String(NOW - 2), from: NOW - 2, to: NOW - 2 },
  { label: '2020s', from: 2020, to: NOW },
  { label: '2010s', from: 2010, to: 2019 },
  { label: '2000s', from: 2000, to: 2009 },
]
const AHEAD = 10 // trailer info kept ready ahead of the one playing
const BEHIND = 1 // players kept alive behind it…
const BUFFER = 2 // …and ahead of it (loaded, paused, ready to go)

// The feed lives outside React so it survives tab switches and can be
// filled before the Reels tab is ever opened.
const feed: { range: number; genre: number; items: MovieLite[]; page: number; total: number; at: number; key: string; loading?: Promise<void> } =
  { range: 0, genre: 0, items: [], page: 0, total: 1, at: 0, key: '' }
let captionsOn = false
let fitOn = true

async function loadFeed(reset: boolean) {
  if (feed.loading) return feed.loading
  const page = reset ? 1 : feed.page + 1
  if (!reset && page > feed.total) return
  const r = RANGES[feed.range]
  feed.loading = (async () => {
    try {
      const res = await api.discover({ from: r.from, to: r.to, days: r.days, genre: feed.genre || undefined, page })
      const fresh = res.results.filter(m => m.poster && m.backdrop)
      feed.page = page
      feed.total = res.totalPages
      feed.key = `${feed.range}:${feed.genre}`
      feed.items = reset ? fresh : [...feed.items, ...fresh.filter(m => !feed.items.some(x => x.id === m.id))]
    } catch { /* keep what we have */ }
  })()
  await feed.loading
  feed.loading = undefined
}

// Called when the app opens: newest reels + the first 10 trailers ready.
export async function warmReels() {
  if (!feed.items.length) await loadFeed(true)
  feed.items.slice(0, AHEAD).forEach(m => prefetchTitle(m.id))
  feed.items.slice(0, 3).forEach(m => { const i = new Image(); i.src = img(m.backdrop, 'w780') })
}

export function DiscoverPage({ library, onOpen }: { library: Movie[]; onOpen: (id: number) => void }) {
  const { sound, setSound, playing, addOrAsk } = useApp()
  const [range, setRange] = useState(feed.range)
  const [genre, setGenre] = useState(feed.genre)
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
  const [items, setItems] = useState<MovieLite[]>(feed.items)
  const [active, setActive] = useState(feed.at)
  const [loading, setLoading] = useState(false)
  const [cc, setCc] = useState(captionsOn)
  const [fit, setFit] = useState(fitOn)
  const scroller = useRef<HTMLDivElement>(null)
  const key = `${range}:${genre}`

  useEffect(() => { api.genres().then(r => setGenres(r.genres)).catch(() => {}) }, [])

  const more = useCallback(async (reset: boolean) => {
    setLoading(true)
    await loadFeed(reset)
    setItems(feed.items)
    setLoading(false)
  }, [])

  // Filters changed (or first open): reuse the warmed feed when it matches.
  useEffect(() => {
    feed.range = range
    feed.genre = genre
    if (feed.key === key && feed.items.length) {
      setItems(feed.items)
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: feed.at * (scroller.current?.clientHeight || 0) }))
      return
    }
    feed.at = 0
    setActive(0)
    scroller.current?.scrollTo({ top: 0 })
    void more(true)
  }, [key, range, genre, more])

  // Keep the next 10 ready; fetch another page before the end.
  useEffect(() => {
    items.slice(active, active + AHEAD).forEach(m => prefetchTitle(m.id))
    items.slice(active + 1, active + 4).forEach(m => { const i = new Image(); i.src = img(m.backdrop, 'w780') })
    if (active >= items.length - AHEAD) void more(false)
  }, [active, items, more])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const i = Math.round(el.scrollTop / el.clientHeight)
    if (i !== active) { setActive(i); feed.at = i }
  }
  const next = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: (active + 1) * el.clientHeight, behavior: 'smooth' })
  }, [active])

  const chip = (on: boolean) => cn('h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors', on ? 'bg-white text-black' : 'glass-dark text-white/85')
  const round = 'glass-dark flex size-9 shrink-0 items-center justify-center rounded-full'

  return (
    <div className="fixed inset-0 z-20 bg-black">
      <div ref={scroller} onScroll={onScroll} className="scrollbar-none h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
        {items.map((m, i) => (
          <Reel
            key={m.id}
            m={m}
            active={i === active}
            mounted={i >= active - BEHIND && i <= active + BUFFER}
            near={i >= active - 1 && i <= active + 3}
            sound={sound}
            captions={cc}
            fit={fit}
            paused={playing}
            inVault={library.some(x => x.id === m.id && x.files.length)}
            onToggleSound={() => setSound(!sound)}
            onSoundBlocked={() => setSound(false)}
            onEnded={next}
            onOpen={() => onOpen(m.id)}
            onAdd={() => void addOrAsk({ id: m.id, title: m.title })}
          />
        ))}
        {!items.length && (
          <div className="flex h-full items-center justify-center">{loading ? <Spinner className="size-6" /> : <p className="text-sm text-white/60">Nothing found for these filters.</p>}</div>
        )}
      </div>

      {/* Filters and switches over the video */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/35 to-transparent pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
        <div className="pointer-events-auto flex items-center gap-2 px-3">
          <span className="font-display text-xl font-extrabold tracking-tight">Reels</span>
          <div className="scrollbar-none flex flex-1 gap-1.5 overflow-x-auto">
            {RANGES.map((r, i) => <button key={r.label} onClick={() => setRange(i)} className={chip(i === range)}>{r.label}</button>)}
          </div>
        </div>
        <div className="pointer-events-auto mt-2 flex items-center gap-2 px-3">
          <div className="scrollbar-none flex flex-1 gap-1.5 overflow-x-auto">
            <button onClick={() => setGenre(0)} className={chip(genre === 0)}>All</button>
            {genres.map(g => <button key={g.id} onClick={() => setGenre(g.id)} className={chip(genre === g.id)}>{g.name}</button>)}
          </div>
          <button onClick={() => { fitOn = !fit; setFit(!fit) }} aria-label={fit ? 'Fill the screen' : 'Show whole picture'} className={round}>
            {fit ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
          </button>
          <button onClick={() => { captionsOn = !cc; setCc(!cc) }} aria-label={cc ? 'Subtitles off' : 'Subtitles on'} className={round}>
            {cc ? <Captions className="size-4 text-orange-300" /> : <CaptionsOff className="size-4 text-white/60" />}
          </button>
          <button onClick={() => setSound(!sound)} aria-label={sound ? 'Mute' : 'Sound on'} className={round}>
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-white/60" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function Reel({ m, active, mounted, near, sound, captions, fit, paused, inVault, onToggleSound, onSoundBlocked, onEnded, onOpen, onAdd }: {
  m: MovieLite
  active: boolean
  mounted: boolean // player loaded (playing if active, buffering if not)
  near: boolean // images loaded
  sound: boolean
  captions: boolean
  fit: boolean
  paused: boolean
  inVault: boolean
  onToggleSound: () => void
  onSoundBlocked: () => void
  onEnded: () => void
  onOpen: () => void
  onAdd: () => void
}) {
  const [d, setD] = useState<MovieDetail | null>(() => peek.movie(m.id))
  const [ti, setTi] = useState(0)
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!near || d) return
    let on = true
    api.movie(m.id).then(x => on && setD(x)).catch(() => {})
    return () => { on = false }
  }, [near, d, m.id])

  const trailer = d?.trailers[ti]
  // No trailer: show the picture for a few seconds, then move on.
  useEffect(() => {
    if (!active || !d || trailer) return
    const t = setTimeout(onEnded, 6000)
    return () => clearTimeout(t)
  }, [active, d, trailer, onEnded])

  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden">
      {near && (fit
        ? <>
            {/* Facebook-style: blurred poster behind a sharp 16:9 picture */}
            <img src={img(m.poster, 'w342')} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-2xl" />
            <div className="absolute inset-x-0 top-[12%] bottom-[38%]">
              <img src={img(m.backdrop, 'w780')} alt="" decoding="async" className="absolute inset-x-0 top-1/2 aspect-video w-full -translate-y-1/2 object-cover shadow-[0_20px_60px_rgba(0,0,0,0.6)]" />
            </div>
          </>
        : <img src={img(m.poster, 'w780')} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />)}
      {mounted && trailer && (
        <div className={cn('absolute inset-x-0', fit ? 'top-[12%] bottom-[38%]' : 'inset-y-0')}>
        <TrailerBackground
          videoKey={trailer.key}
          muted={!active || !sound}
          paused={!active || paused}
          loop={false}
          captions={captions}
          fit={fit}
          revealMs={500}
          onPlaying={setLive}
          onError={() => setTi(i => i + 1)}
          onEnded={() => { if (active) onEnded() }}
          onSoundBlocked={() => { if (active) onSoundBlocked() }}
        />
        </div>
      )}
      {!fit && <div className={cn('absolute inset-0 bg-black/20 transition-opacity duration-700', live && 'opacity-0')} />}
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black via-black/70 to-transparent" />

      {/* Tap the picture to turn sound on/off */}
      <button aria-label={sound ? 'Mute' : 'Sound on'} onClick={onToggleSound} className="absolute inset-x-0 top-[22%] bottom-[38%]" />
      {active && !sound && (
        <button onClick={onToggleSound} className="btn-black absolute top-[37%] left-1/2 flex h-10 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full px-4 text-[13px] font-semibold">
          <VolumeX className="size-4 text-orange-400" /> Tap for sound
        </button>
      )}

      <div className="absolute inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] space-y-2 px-4">
        <h2 className="font-display text-[28px] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance drop-shadow-lg">{m.title}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/75">
          {!!m.rating && <span className="flex items-center gap-1 font-semibold text-white"><Star className="size-3.5 fill-orange-400 text-orange-400" />{m.rating.toFixed(1)}</span>}
          {d?.imdbRating ? <span className="rounded bg-[#f5c518] px-1 text-[10px] leading-4 font-black text-black">IMDb {d.imdbRating.toFixed(1)}</span> : null}
          {m.year && <span>{m.year}</span>}
          {d?.genres.length ? <span className="truncate">{d.genres.slice(0, 3).join(' · ')}</span> : null}
        </p>
        {m.overview && <p className="line-clamp-2 max-w-xl text-[13px] leading-snug text-white/70">{m.overview}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onOpen} className="btn-black flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold"><Info className="size-4" /> Details</button>
          <button onClick={onAdd} className="btn-black flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold">
            {inVault ? <><Check className="size-4 text-emerald-400" /> In vault</> : <><Plus className="size-4 text-orange-400" /> Add</>}
          </button>
        </div>
      </div>
    </section>
  )
}
