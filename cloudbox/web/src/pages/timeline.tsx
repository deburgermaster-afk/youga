import { Skeleton } from '@/components/ui/skeleton'
import { MetaLine, Poster } from '@/components/poster'
import { StatusBadge } from '@/pages/home'
import type { Movie } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { kind, pr, prText } from '@/lib/movie'

// Vault movies grouped by release year, newest first.
export function TimelinePage({ library, onOpen }: { library: Movie[] | null; onOpen: (id: number) => void }) {
  const { profile, rate } = useApp()
  if (library === null) return <div className="grid grid-cols-3 gap-2.5 px-4">{[0, 1, 2].map(i => <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />)}</div>

  const years = new Map<string, Movie[]>()
  for (const m of [...library].sort((a, b) => (b.year || '0').localeCompare(a.year || '0') || b.addedAt - a.addedAt)) {
    const y = m.year || 'Unknown'
    years.set(y, [...(years.get(y) || []), m])
  }

  if (!library.length) return <p className="px-4 pt-6 text-center text-sm text-white/55">Your timeline fills up as you add movies.</p>

  return (
    <div className="pb-32">
      <h2 className="px-4 pb-1 font-display text-[19px] font-bold tracking-tight">Timeline</h2>
      <p className="px-4 pb-4 text-xs text-white/45">By release year · {library.length} title{library.length === 1 ? '' : 's'}</p>
      <div className="relative space-y-5">
        {[...years].map(([year, movies]) => (
          <section key={year} className="relative">
            <div className="flex items-baseline gap-2 px-4 pb-2">
              <span className="font-display text-[34px] leading-none font-extrabold tracking-[-0.04em] text-white">{year}</span>
              <span className="h-px flex-1 translate-y-[-6px] bg-gradient-to-r from-orange-500/60 to-transparent" />
              <span className="text-xs text-white/45">{movies.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 px-4 sm:grid-cols-4 md:grid-cols-6">
              {movies.map(m => (
                <Poster
                  key={m.id}
                  id={m.id}
                  title={m.title}
                  poster={m.poster}
                  sub={<MetaLine parts={[m.tv ? 'Series' : kind(m.genres)]} pr={prText(pr(m))} />}
                  onClick={() => onOpen(m.id)}
                  onRate={() => rate({ id: m.id, title: m.title, poster: m.poster })}
                  rated={!!m.ratings?.[profile]}
                  badge={<StatusBadge m={m} />}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
