import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Poster } from '@/components/poster'
import { api, type Movie, type MovieLite } from '@/lib/api'

export function SearchPage({ library, onOpen, onSettings }: { library: Movie[]; onOpen: (id: number) => void; onSettings: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MovieLite[] | null>(null)
  const [trending, setTrending] = useState<MovieLite[] | null>(null)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    api.trending().then(r => setTrending(r.results)).catch(e => setErr((e as Error).message))
  }, [])

  // Search as you type (debounced).
  useEffect(() => {
    if (!q.trim()) { setResults(null); return }
    const id = setTimeout(() => {
      api.search(q).then(r => { setResults(r.results); setErr('') }).catch(e => setErr((e as Error).message))
    }, 350)
    return () => clearTimeout(id)
  }, [q])

  const list = q.trim() ? results : trending
  const inVault = (id: number) => library.some(m => m.id === id)

  return (
    <div className="space-y-5 px-5 pb-40">
      <div className="relative">
        <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-white/50" />
        <input
          ref={input}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search movies"
          enterKeyHint="search"
          className="h-14 w-full rounded-full border border-white/15 bg-white/[0.07] pr-12 pl-12 text-base outline-none backdrop-blur-xl placeholder:text-white/40 focus:border-orange-400/60"
        />
        {q && <button aria-label="Clear" onClick={() => setQ('')} className="absolute top-1/2 right-4 -translate-y-1/2 text-white/60"><X className="size-5" /></button>}
      </div>

      {err && (
        <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4 text-sm">
          {err}{' '}
          {/TMDB key/.test(err) && <button onClick={onSettings} className="font-semibold text-orange-300 underline underline-offset-4">Open Settings</button>}
        </div>
      )}

      <h2 className="text-lg font-bold">{q.trim() ? 'Results' : 'Trending this week'}</h2>
      {!list && !err && <div className="grid grid-cols-3 gap-3">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-xl" />)}</div>}
      {list?.length === 0 && <p className="text-sm text-white/60">No movies found.</p>}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
        {list?.map(m => (
          <Poster
            key={m.id}
            title={m.title}
            poster={m.poster}
            year={m.year}
            rating={m.rating}
            onClick={() => onOpen(m.id)}
            badge={inVault(m.id) ? <Badge className="bg-orange-500 text-white">Vault</Badge> : undefined}
          />
        ))}
      </div>
    </div>
  )
}
