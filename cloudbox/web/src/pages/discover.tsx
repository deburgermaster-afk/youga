import { useCallback, useEffect, useRef, useState } from 'react'
import { Captions, Check, Info, Plus, SlidersHorizontal, Star, Volume2, VolumeX } from 'lucide-react'
import { Panel } from '@/components/panel'
import { Spinner } from '@/components/ui/spinner'
import { TrailerBackground } from '@/components/trailer'
import { api, img, prefetchTitle, type Movie, type ReelItem } from '@/lib/api'
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
// Players kept alive around the one you're watching. They sit on screen
// (iPhone won't buffer off-screen video), invisible behind the active one,
// already buffered and rewound, so a swipe just reveals one that's ready.
const BEHIND = 1
const AHEAD = 3

// The feed lives outside React: it survives tab switches and is filled
// (trailers included) as soon as the app opens.
const feed: { range: number; genre: number; items: ReelItem[]; page: number; total: number; at: number; key: string; loading?: Promise<void> } =
  { range: 0, genre: 0, items: [], page: 0, total: 1, at: 0, key: '' }
let captionsOn = false
let fitOn = false // full-screen 9:16 by default

async function loadFeed(reset: boolean) {
  if (feed.loading) return feed.loading
  const page = reset ? 1 : feed.page + 1
  if (!reset && page > feed.total) return
  const r = RANGES[feed.range]
  feed.loading = (async () => {
    try {
      const res = await api.reels({ from: r.from, to: r.to, days: r.days, genre: feed.genre || undefined, page })
      feed.page = page
      feed.total = res.totalPages
      feed.key = `${feed.range}:${feed.genre}`
      feed.items = reset ? res.results : [...feed.items, ...res.results.filter(m => !feed.items.some(x => x.id === m.id))]
    } catch { /* keep what we have */ }
  })()
  await feed.loading
  feed.loading = undefined
}

const preloadImage = (src: string) => { const i = new Image(); i.decoding = 'async'; i.src = src }

// Called when the app opens: the newest reels with their trailers, and the first pictures.
export async function warmReels() {
  if (!feed.items.length) await loadFeed(true)
  feed.items.slice(0, 5).forEach(m => preloadImage(img(m.poster, 'w780')))
}

export function DiscoverPage({ library, onOpen }: { library: Movie[]; onOpen: (id: number) => void }) {
  const { sound, setSound, playing, addOrAsk } = useApp()
  const [range, setRange] = useState(feed.range)
  const [genre, setGenre] = useState(feed.genre)
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
  const [items, setItems] = useState<ReelItem[]>(feed.items)
  const [active, setActive] = useState(feed.at)
  const [scrolling, setScrolling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cc, setCc] = useState(captionsOn)
  const [fit, setFit] = useState(fitOn)
  const [filters, setFilters] = useState(false)
  const [skip, setSkip] = useState<Record<number, number>>({}) // trailer index per movie after errors
  const scroller = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
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

  // Pictures for the next few, details for the next ten, next page early.
  useEffect(() => {
    items.slice(active + 1, active + 6).forEach(m => preloadImage(img(m.poster, 'w780')))
    items.slice(active, active + 10).forEach(m => prefetchTitle(m.id))
    if (active >= items.length - 8) void more(false)
  }, [active, items, more])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setScrolling(true)
    clearTimeout(settle.current)
    settle.current = setTimeout(() => setScrolling(false), 90)
    const i = Math.round(el.scrollTop / el.clientHeight)
    if (i !== active) { setActive(i); feed.at = i }
  }
  const next = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: (active + 1) * el.clientHeight, behavior: 'smooth' })
  }, [active])

  const chip = (on: boolean) => cn('h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors', on ? 'bg-white text-black' : 'glass-dark text-white/85')
  const round = 'glass-dark relative flex size-9 shrink-0 items-center justify-center rounded-full'
  const pool = items.map((m, i) => ({ m, i })).filter(({ i }) => i >= active - BEHIND && i <= active + AHEAD)
  const cur = items[active]

  return (
    <div className="fixed inset-0 z-20 bg-black">
      {/* Pictures scroll; videos live in the fixed layer above them */}
      <div ref={scroller} onScroll={onScroll} className="scrollbar-none h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
        {items.map((m, i) => <ReelPicture key={m.id} m={m} near={i >= active - 1 && i <= active + 4} fit={fit} />)}
        {!items.length && (
          <div className="flex h-full items-center justify-center">{loading ? <Spinner className="size-6" /> : <p className="text-sm text-white/60">Nothing found for these filters.</p>}</div>
        )}
      </div>

      {/* Player layer: the active one shows; the others wait, buffered, behind it */}
      <div className={cn('pointer-events-none absolute inset-x-0 transition-opacity duration-150', fit ? 'top-[12%] bottom-[38%]' : 'inset-y-0', scrolling && 'opacity-0')}>
        {pool.map(({ m, i }) => {
          const t = m.trailers[skip[m.id] || 0]
          if (!t) return null
          const isActive = i === active
          return (
            <div key={m.id} className="absolute inset-0" style={{ opacity: isActive ? 1 : 0.011, zIndex: isActive ? 2 : 1 }}>
              <TrailerBackground
                videoKey={t}
                muted={!isActive || !sound}
                paused={!isActive || playing}
                preload
                loop={false}
                captions={cc}
                fit={fit}
                revealMs={150}
                onPlaying={() => {}}
                onError={() => setSkip(s => ({ ...s, [m.id]: (s[m.id] || 0) + 1 }))}
                onEnded={() => { if (isActive) next() }}
                onSoundBlocked={() => { if (isActive) setSound(false) }}
              />
            </div>
          )
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Tap the picture for sound */}
      <button aria-label={sound ? 'Mute' : 'Sound on'} onClick={() => setSound(!sound)} className="absolute inset-x-0 top-[12%] bottom-[22%]" />
      {!sound && (
        <button onClick={() => setSound(true)} className="btn-black absolute top-1/2 left-1/2 flex h-10 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full px-4 text-[13px] font-semibold">
          <VolumeX className="size-4 text-orange-400" /> Tap for sound
        </button>
      )}

      {cur && (
        <ReelInfo
          m={cur}
          inVault={library.some(x => x.id === cur.id && x.files.length)}
          onOpen={() => onOpen(cur.id)}
          onAdd={() => void addOrAsk({ id: cur.id, title: cur.title })}
        />
      )}

      {/* Just two small corner buttons; the rest is in the Filters sheet */}
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex gap-2">
        <button onClick={() => setSound(!sound)} aria-label={sound ? 'Mute' : 'Sound on'} className={round}>
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-white/60" />}
        </button>
        <button onClick={() => setFilters(true)} aria-label="Filters" className={round}>
          <SlidersHorizontal className="size-4" />
          {(range !== 0 || genre !== 0) && <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-orange-500" />}
        </button>
      </div>

      <Panel open={filters} onOpenChange={setFilters} title="Reels filters">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Released</p>
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((r, i) => <button key={r.label} onClick={() => setRange(i)} className={chip(i === range)}>{r.label}</button>)}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Genre</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setGenre(0)} className={chip(genre === 0)}>All</button>
              {genres.map(g => <button key={g.id} onClick={() => setGenre(g.id)} className={chip(genre === g.id)}>{g.name}</button>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { captionsOn = !cc; setCc(!cc) }} className={chip(cc)}><Captions className="mr-1 inline size-4" />Subtitles</button>
            <button onClick={() => { fitOn = !fit; setFit(!fit) }} className={chip(fit)}>Show whole 16:9 picture</button>
          </div>
          <button onClick={() => setFilters(false)} className="btn-black h-11 w-full rounded-full text-sm font-semibold">Done</button>
        </div>
      </Panel>
    </div>
  )
}

// One reel's picture: shown under its video, and while swiping.
function ReelPicture({ m, near, fit }: { m: ReelItem; near: boolean; fit: boolean }) {
  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden">
      {near && (fit
        ? <>
            <img src={img(m.poster, 'w342')} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-2xl" />
            <div className="absolute inset-x-0 top-[12%] bottom-[38%]">
              <img src={img(m.backdrop || m.poster, 'w780')} alt="" decoding="async" className="absolute inset-x-0 top-1/2 aspect-video w-full -translate-y-1/2 object-cover" />
            </div>
          </>
        : <img src={img(m.poster, 'w780')} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />)}
    </section>
  )
}

// Small, out of the way: title + facts, buttons on the right.
function ReelInfo({ m, inVault, onOpen, onAdd }: { m: ReelItem; inVault: boolean; onOpen: () => void; onAdd: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.4rem)] flex items-end gap-2 px-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-[16px] leading-tight font-bold tracking-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">{m.title}</h2>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {!!m.rating && <span className="flex items-center gap-0.5 font-semibold text-white"><Star className="size-3 fill-orange-400 text-orange-400" />{m.rating.toFixed(1)}</span>}
          {m.year && <span>{m.year}</span>}
          {m.genres.length ? <span className="truncate">{m.genres.slice(0, 2).join(' · ')}</span> : null}
        </p>
      </div>
      <button onClick={onOpen} aria-label="Details" className="glass-dark flex size-8 shrink-0 items-center justify-center rounded-full"><Info className="size-4" /></button>
      <button onClick={onAdd} aria-label={inVault ? 'In vault' : 'Add'} className="glass-dark flex size-8 shrink-0 items-center justify-center rounded-full">
        {inVault ? <Check className="size-4 text-emerald-400" /> : <Plus className="size-4 text-orange-400" />}
      </button>
    </div>
  )
}
