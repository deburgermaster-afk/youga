import { Plus, Search } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { MetaLine, Poster } from '@/components/poster'
import { JobRow } from '@/components/job-row'
import type { Job, Movie } from '@/lib/api'
import { getProgress } from '@/lib/profiles'
import { useApp } from '@/lib/app-context'
import { kind, pr, prText } from '@/lib/movie'

export function Section({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between px-4">
        <h2 className="font-display text-[19px] font-bold tracking-tight">{title}</h2>
        {aside && <span className="text-xs text-white/45">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export function StatusBadge({ m }: { m: Movie }) {
  if (m.pending?.length) return <span className="rounded-full bg-blue-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Downloading</span>
  if (!m.files.length) return <span className="glass-dark rounded-full px-2 py-0.5 text-[10px] font-medium text-white/90">No file</span>
  return null
}

export function HomePage({ library, jobs, refresh, onOpen, onSearch, onAdd }: {
  library: Movie[] | null
  jobs: Job[] | null
  refresh: () => void
  onOpen: (id: number) => void
  onSearch: () => void
  onAdd: () => void
}) {
  const { profile, play, rate } = useApp()
  const working = jobs?.filter(j => j.status !== 'done') ?? []
  const continueRows = getProgress(profile)
    .map(p => ({ p, m: library?.find(m => m.id === p.movieId) }))
    .filter(x => x.m || !x.p.movieId)
    .slice(0, 12)

  if (library === null) {
    return (
      <div className="grid grid-cols-2 gap-3 px-4 pt-2">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="aspect-[2/3] rounded-[20px]" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-32">
      {continueRows.length > 0 && (
        <Section title="Continue watching">
          <div className="scrollbar-none flex gap-2.5 overflow-x-auto px-4">
            {continueRows.map(({ p, m }) => (
              <Poster
                key={p.url}
                className="w-[104px] shrink-0"
                title={m?.title || p.name}
                poster={m?.poster}
                progress={p.d ? p.t / p.d : 0}
                sub={p.d ? `${Math.max(1, Math.round((p.d - p.t) / 60))} min left` : undefined}
                onClick={() => (m ? onOpen(m.id) : play({ url: p.url, name: p.name }))}
              />
            ))}
          </div>
        </Section>
      )}

      {working.length > 0 && (
        <Section title="Downloading">
          <div className="space-y-2 px-4">{working.map(j => <JobRow key={j.id} job={j} onChange={refresh} />)}</div>
        </Section>
      )}

      {library.length > 0 ? (
        <Section title="Your vault" aside={`${library.length} movie${library.length === 1 ? '' : 's'}`}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {library.map(m => (
              <Poster
                key={m.id}
                big
                title={m.title}
                poster={m.poster}
                sub={<MetaLine parts={[kind(m.genres), m.year]} pr={prText(pr(m))} />}
                onClick={() => onOpen(m.id)}
                onRate={() => rate({ id: m.id, title: m.title, poster: m.poster })}
                rated={!!m.ratings?.[profile]}
                badge={<StatusBadge m={m} />}
              />
            ))}
          </div>
        </Section>
      ) : (
        <div className="glass mx-4 space-y-3 rounded-3xl p-5 text-center">
          <h2 className="font-display text-xl font-bold">Your vault is empty</h2>
          <p className="text-sm text-white/60">Search for a movie, then add it with a link.</p>
          <div className="flex justify-center gap-2">
            <button onClick={onSearch} className="flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-4 text-sm font-semibold"><Search className="size-4" /> Search movies</button>
            <button onClick={onAdd} className="glass flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"><Plus className="size-4" /> Add movie</button>
          </div>
        </div>
      )}
    </div>
  )
}
