import { useEffect, useRef, useState } from 'react'
import { Play, Plus, Search, Star, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { MetaLine, Poster } from '@/components/poster'
import { api, img, type Job, type Movie, type MovieLite } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { kind, playMovie, pr, prText } from '@/lib/movie'

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

function Row({ poster, title, sub, action, onClick }: { poster?: string; title: string; sub: React.ReactNode; action: React.ReactNode; onClick: () => void }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-1.5 pr-2.5">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="h-[72px] w-12 shrink-0 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
          {poster && <img src={img(poster, 'w185')} alt="" loading="lazy" className="size-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight">{title}</p>
          <p className="truncate text-xs text-white/55">{sub}</p>
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
  const { play } = useApp()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MovieLite[] | null>(null)
  const [trending, setTrending] = useState<MovieLite[] | null>(null)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    api.trending().then(r => setTrending(r.results)).catch(e => setErr((e as Error).message))
  }, [])

  // Search as you type (debounced).
  useEffect(() => {
    setResults(null)
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

  const playNow = async (m: Movie) => {
    setStarting(m.id)
    await playMovie(play, m, m.files[0])
    setStarting(null)
  }

  const vaultAction = (m: Movie) => {
    if (m.files.length) {
      return (
        <button aria-label={`Play ${m.title}`} onClick={() => playNow(m)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_6px_20px_rgba(249,115,22,0.45)]">
          {starting === m.id ? <Spinner /> : <Play className="size-5 fill-white text-white" />}
        </button>
      )
    }
    if (m.pending?.some(id => jobs.some(j => j.id === id && j.status !== 'done'))) {
      return <span className="shrink-0 rounded-full bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300">Downloading</span>
    }
    return <AddButton onClick={() => onAdd(m.id)} />
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
              {mine.map(m => (
                <Row key={m.id} poster={m.poster} title={m.title} onClick={() => onOpen(m.id)}
                  sub={<MetaLine parts={[kind(m.genres), m.year]} pr={prText(pr(m))} />}
                  action={vaultAction(m)} />
              ))}
            </section>
          )}
          <section className="space-y-2">
            <h2 className="font-display text-[17px] font-bold tracking-tight">{mine.length ? 'More from TMDB' : 'Results'}</h2>
            {!others && !err && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[84px] rounded-2xl" />)}
            {others?.length === 0 && <p className="text-sm text-white/55">{mine.length ? 'Nothing else found.' : 'No movies found.'}</p>}
            {others?.map(m => (
              <Row key={m.id} poster={m.poster} title={m.title} onClick={() => onOpen(m.id)}
                sub={<>{m.year || '—'}{!!m.rating && <> · <Star className="inline size-3 -translate-y-px fill-orange-400 text-orange-400" /> {m.rating.toFixed(1)}</>}</>}
                action={<AddButton onClick={() => onAdd(m.id)} />} />
            ))}
          </section>
        </>
      ) : (
        <section className="space-y-2.5">
          <h2 className="font-display text-[17px] font-bold tracking-tight">Trending this week</h2>
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5 lg:grid-cols-7">
            {!trending && !err && Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />)}
            {trending?.map(m => (
              <Poster key={m.id} title={m.title} poster={m.poster} sub={m.year} rating={m.rating} onClick={() => onOpen(m.id)}
                badge={library.some(x => x.id === m.id) ? <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold">Vault</span> : undefined} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-3.5 text-[13px] font-semibold text-black active:scale-95">
      <Plus className="size-4" strokeWidth={2.6} /> Add
    </button>
  )
}
