import { useEffect, useRef, useState } from 'react'
import { Play, Plus, Search, Star, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { MetaLine, Poster } from '@/components/poster'
import { api, peek, img, prefetchTitle, type FreeItem, type Job, type Meta, type Movie, type MovieLite } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { kind, playMovie, pr, prText } from '@/lib/movie'

// Coming back to Search keeps what you last looked for.
let lastQuery = ''

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

// IMDb score (TMDB's as a fallback until IMDb's arrives) and the top cast.
function Facts({ meta, tmdb }: { meta?: Meta; tmdb?: number }) {
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5">
      {meta?.imdb
        ? <span className="shrink-0 rounded bg-[#f5c518] px-1 text-[10px] leading-4 font-black text-black">IMDb {meta.imdb.toFixed(1)}</span>
        : tmdb ? <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-white/60"><Star className="size-3 fill-orange-400 text-orange-400" />{tmdb.toFixed(1)}</span> : null}
      {meta?.cast.length ? <span className="truncate text-[11px] text-white/50">{meta.cast.join(', ')}</span> : null}
    </div>
  )
}

function Row({ id, index = 0, poster, title, sub, facts, action, onClick }: { id: number; index?: number; poster?: string; title: string; sub: React.ReactNode; facts: React.ReactNode; action: React.ReactNode; onClick: () => void }) {
  return (
    <div className="glass stagger flex items-center gap-3 rounded-2xl p-1.5 pr-2.5 transition-transform active:scale-[0.98]" style={{ '--i': index } as React.CSSProperties}>
      <button onClick={onClick} onPointerDown={() => prefetchTitle(id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="h-[78px] w-[52px] shrink-0 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
          {poster && <img src={img(poster, 'w185')} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight">{title}</p>
          <p className="truncate text-xs text-white/55">{sub}</p>
          {facts}
        </div>
      </button>
      {action}
    </div>
  )
}

export function SearchPage({ library, jobs, onOpen, onAdd, onSettings }: {
  library: Movie[]
  jobs: Job[]
  onOpen: (id: number) => void
  onAdd: (movieId: number) => void
  onSettings: () => void
}) {
  const { play, addOrAsk } = useApp()
  const [adding, setAdding] = useState<number | null>(null)
  // Movies: play a free copy if there is one, else ask for a magnet. Series: ask.
  const add = async (m: { id: number; title: string; tv?: boolean }) => {
    if (m.tv) return onAdd(m.id)
    setAdding(m.id)
    await addOrAsk(m)
    setAdding(null)
  }
  const [q, setQ] = useState(lastQuery)
  const [results, setResults] = useState<MovieLite[] | null>(() => peek.search(lastQuery))
  const [trending, setTrending] = useState<MovieLite[] | null>(peek.trending)
  const [free, setFree] = useState<FreeItem[] | null>(peek.freeCatalog)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState<number | null>(null)
  const [meta, setMeta] = useState<Record<string, Meta>>({})
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!lastQuery) input.current?.focus()
    api.trending().then(r => setTrending(r.results)).catch(e => setErr((e as Error).message))
    api.freeCatalog().then(r => setFree(r.items)).catch(() => {})
  }, [])

  // Search as you type (debounced).
  useEffect(() => {
    lastQuery = q
    setResults(peek.search(q))
    if (!q.trim()) return
    const id = setTimeout(() => {
      api.search(q).then(r => { setResults(r.results); setErr('') }).catch(e => setErr((e as Error).message))
    }, 300)
    return () => clearTimeout(id)
  }, [q])

  const query = norm(q)
  const tmdbIds = new Set(results?.map(r => r.id))
  // Your own movies first: title match, or TMDB says it's the same film.
  const mine = query ? library.filter(m => norm(m.title).includes(query) || tmdbIds.has(m.id)) : []
  const mineIds = new Set(mine.map(m => m.id))
  const others = results?.filter(r => !mineIds.has(r.id)) ?? null

  // Fill in IMDb ratings and cast for what's on screen (in two small batches).
  const ids = [...mine.map(m => m.id), ...(others ?? []).map(m => m.id)].slice(0, 20)
  const idsKey = ids.join(',')
  useEffect(() => {
    if (!idsKey) return
    let live = true
    const want = idsKey.split(',').map(Number)
    for (const batch of [want.slice(0, 10), want.slice(10, 20)]) {
      if (batch.length) api.meta(batch).then(r => live && setMeta(m => ({ ...m, ...r }))).catch(() => {})
    }
    return () => { live = false }
  }, [idsKey])

  // One tap: add the free copy to the vault and start playing.
  const playFree = async (m: FreeItem) => {
    setAdding(m.id)
    await addOrAsk({ id: m.id, title: m.title })
    setAdding(null)
  }

  const playNow = async (m: Movie) => {
    setStarting(m.id)
    await playMovie(play, m, m.files[0])
    setStarting(null)
  }

  const vaultAction = (m: Movie) => {
    if (m.files.length) {
      return (
        <button aria-label={`Play ${m.title}`} onClick={() => (m.tv ? onOpen(m.id) : playNow(m))} className="btn-black flex size-11 shrink-0 items-center justify-center rounded-full">
          {starting === m.id ? <Spinner /> : <Play className="size-5 fill-orange-400 text-orange-400" />}
        </button>
      )
    }
    if (m.pending?.some(id => jobs.some(j => j.id === id && j.status !== 'done'))) {
      return <span className="shrink-0 rounded-full bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300">Downloading</span>
    }
    return <AddButton busy={adding === m.id} onClick={() => add(m)} />
  }

  return (
    <div className="space-y-4 px-4 pb-32">
      <div className="relative">
        <Search className="absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-white/50" />
        <input
          ref={input}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search movies"
          enterKeyHint="search"
          className="glass h-12 w-full rounded-full pr-11 pl-11 text-base outline-none placeholder:text-white/40 focus:border-orange-400/60"
        />
        {q && <button aria-label="Clear" onClick={() => setQ('')} className="absolute top-1/2 right-3.5 -translate-y-1/2 text-white/60"><X className="size-5" /></button>}
      </div>

      {err && (
        <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-3 text-sm">
          {err}{' '}
          {/TMDB key/.test(err) && <button onClick={onSettings} className="font-semibold text-orange-300 underline underline-offset-4">Open Settings</button>}
        </div>
      )}

      {query ? (
        <>
          {mine.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-display text-[17px] font-bold tracking-tight">In your vault</h2>
              {mine.map((m, i) => (
                <Row key={m.id} index={i} id={m.id} poster={m.poster} title={m.title} onClick={() => onOpen(m.id)}
                  sub={<MetaLine parts={[m.tv ? 'Series' : kind(m.genres), m.year]} pr={prText(pr(m))} />}
                  facts={<Facts meta={meta[m.id]} tmdb={m.rating} />}
                  action={vaultAction(m)} />
              ))}
            </section>
          )}
          <section className="space-y-2">
            <h2 className="font-display text-[17px] font-bold tracking-tight">{mine.length ? 'More from TMDB' : 'Results'}</h2>
            {!others && !err && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[90px] rounded-2xl" />)}
            {others?.length === 0 && <p className="text-sm text-white/55">{mine.length ? 'Nothing else found.' : 'No movies found.'}</p>}
            {others?.map((m, i) => (
              <Row key={m.id} index={i + mine.length} id={m.id} poster={m.poster} title={m.title} onClick={() => onOpen(m.id)}
                sub={[m.tv ? 'Series' : 'Movie', m.year].filter(Boolean).join(' · ')}
                facts={<Facts meta={meta[m.id]} tmdb={m.rating} />}
                action={<AddButton busy={adding === m.id} onClick={() => add(m)} />} />
            ))}
          </section>
        </>
      ) : (
        <>
        <section className="space-y-2.5">
          <h2 className="font-display text-[17px] font-bold tracking-tight">Trending this week</h2>
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 lg:grid-cols-7">
            {!trending && !err && Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />)}
            {trending?.map((m, i) => (
              <Poster key={m.id} index={i} id={m.id} title={m.title} poster={m.poster} sub={[m.tv ? 'Series' : '', m.year].filter(Boolean).join(' · ')} rating={m.rating} onClick={() => onOpen(m.id)}
                badge={library.some(x => x.id === m.id) ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold">Vault</span> : undefined} />
            ))}
          </div>
        </section>
          {!!free?.length && (
            <section className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[17px] font-bold tracking-tight">Free to watch</h2>
                <span className="text-[11px] text-white/45">Public domain & open movies · one tap</span>
              </div>
              <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 lg:grid-cols-7">
                {free.map((m, i) => (
                  <Poster
                    key={m.id}
                    id={m.id}
                    index={i}
                    title={m.title}
                    poster={m.poster}
                    sub={[m.year, m.why === 'Public domain' ? 'Public domain' : 'Open movie'].filter(Boolean).join(' · ')}
                    rating={m.rating}
                    onClick={() => playFree(m)}
                    badge={adding === m.id
                      ? <span className="btn-black flex size-7 items-center justify-center rounded-full"><Spinner /></span>
                      : <span className="flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-black"><Play className="size-2.5 fill-black" />Free</span>}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function AddButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="btn-black flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold">
      {busy ? <Spinner /> : <Plus className="size-4 text-orange-400" strokeWidth={2.6} />} Add
    </button>
  )
}
