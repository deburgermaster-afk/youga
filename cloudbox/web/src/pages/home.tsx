import { Play, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Poster } from '@/components/poster'
import { JobRow } from '@/components/job-row'
import { img, type Job, type Movie } from '@/lib/api'
import { getProgress } from '@/lib/profiles'
import { useApp } from '@/lib/app-context'

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-5 text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export function HomePage({ library, jobs, refresh, onOpen, onSearch, onAdd }: {
  library: Movie[] | null
  jobs: Job[] | null
  refresh: () => void
  onOpen: (id: number) => void
  onSearch: () => void
  onAdd: () => void
}) {
  const { profile, play } = useApp()
  const working = jobs?.filter(j => j.status !== 'done') ?? []
  const progress = getProgress(profile)
  const continueRows = progress
    .map(p => ({ p, m: library?.find(m => m.id === p.movieId) }))
    .filter(x => x.m || !x.p.movieId)
    .slice(0, 12)
  const hero = library?.find(m => m.backdrop && m.files.length) || library?.[0]

  if (library === null) {
    return (
      <div className="space-y-6 px-5 pt-2">
        <Skeleton className="h-56 w-full rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="aspect-[2/3] rounded-xl" />)}</div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-40">
      {/* Featured */}
      {hero ? (
        <button onClick={() => onOpen(hero.id)} className="group relative mx-5 block h-60 w-[calc(100%-2.5rem)] overflow-hidden rounded-3xl text-left ring-1 ring-white/10 sm:h-80">
          <img src={img(hero.backdrop || hero.poster, 'w1280')} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-5">
            <Badge className="bg-orange-500/90 text-white">{hero.files.length ? 'Ready to watch' : 'In your vault'}</Badge>
            <h2 className="text-2xl leading-tight font-bold">{hero.title}</h2>
            <p className="line-clamp-2 text-sm text-white/70">{hero.overview}</p>
          </div>
          {hero.files.length > 0 && (
            <span className="absolute right-5 bottom-5 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_8px_30px_rgba(249,115,22,0.5)]">
              <Play className="size-6 fill-white text-white" />
            </span>
          )}
        </button>
      ) : (
        <div className="mx-5 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur">
          <h2 className="text-xl font-bold">Your vault is empty</h2>
          <p className="text-sm text-white/60">Search for a movie to add it, then attach a file with the + button.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={onSearch} className="rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-white"><Search /> Search movies</Button>
            <Button onClick={onAdd} variant="outline" className="rounded-full border-white/20 bg-transparent"><Plus /> Add file</Button>
          </div>
        </div>
      )}

      {continueRows.length > 0 && (
        <Row title="Continue watching">
          <div className="scrollbar-none flex gap-3 overflow-x-auto px-5">
            {continueRows.map(({ p, m }) => (
              <Poster
                key={p.url}
                className="w-28 shrink-0"
                title={m?.title || p.name}
                poster={m?.poster}
                progress={p.d ? p.t / p.d : 0}
                onClick={() => (m ? onOpen(m.id) : play({ url: p.url, name: p.name }))}
              />
            ))}
          </div>
        </Row>
      )}

      {working.length > 0 && (
        <Row title="Downloading">
          <div className="space-y-3 px-5">{working.map(j => <JobRow key={j.id} job={j} onChange={refresh} />)}</div>
        </Row>
      )}

      {library.length > 0 && (
        <Row title="Your vault">
          <div className="grid grid-cols-3 gap-3 px-5 sm:grid-cols-5 lg:grid-cols-7">
            {library.map(m => (
              <Poster
                key={m.id}
                title={m.title}
                poster={m.poster}
                year={m.year}
                rating={m.rating}
                onClick={() => onOpen(m.id)}
                badge={m.pending?.length
                  ? <Badge className="bg-blue-500 text-white">Downloading</Badge>
                  : !m.files.length ? <Badge variant="secondary" className="bg-black/60">No file</Badge> : undefined}
              />
            ))}
          </div>
        </Row>
      )}
    </div>
  )
}
