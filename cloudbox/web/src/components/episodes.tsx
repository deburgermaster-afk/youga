import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { api, img, type Episode, type Season } from '@/lib/api'
import { epLabel, type EpFile } from '@/lib/episodes'
import { getProgress, isDone } from '@/lib/profiles'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

const seasonCache = new Map<string, Promise<{ episodes: Episode[] }>>()
function loadSeason(id: number, n: number) {
  const k = `${id}:${n}`
  let p = seasonCache.get(k)
  if (!p) { p = api.season(id, n); p.catch(() => seasonCache.delete(k)); seasonCache.set(k, p) }
  return p
}

// Season chips + episode list. Episodes with a matching file get a play button.
export function Episodes({ id, seasons, eps, start, fallback, onPlay }: {
  id: number
  fallback?: string // series backdrop for episodes without a still
  seasons: Season[]
  eps: EpFile[]
  start?: number // season to open first
  onPlay: (ep: EpFile) => void
}) {
  const { profile } = useApp()
  const [n, setN] = useState(start ?? seasons[0]?.n ?? 1)
  const [list, setList] = useState<Episode[] | null>(null)

  useEffect(() => {
    let live = true
    setList(null)
    loadSeason(id, n).then(r => live && setList(r.episodes)).catch(() => live && setList([]))
    return () => { live = false }
  }, [id, n])

  const progress = getProgress(profile)
  const mine = eps.filter(x => x.s === n)
  // Files whose episode number TMDB doesn't list (still playable).
  const extra = list ? mine.filter(x => !list.some(e => e.n === x.e)) : []

  return (
    <div className="space-y-3">
      {seasons.length > 1 && (
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          {seasons.map(s => {
            const have = eps.filter(x => x.s === s.n).length
            return (
              <button
                key={s.n}
                onClick={() => setN(s.n)}
                className={cn('btn-black flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold', s.n === n && 'ring-1 ring-orange-400/70 text-orange-300')}
              >
                {s.n === 0 ? 'Specials' : `Season ${s.n}`}
                {have > 0 && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/70">{have}</span>}
              </button>
            )
          })}
        </div>
      )}

      {!list && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-2xl" />)}
      {list?.length === 0 && !mine.length && <p className="text-sm text-white/50">No episode info for this season.</p>}

      {list?.map(e => {
        const file = mine.find(x => x.e === e.n)
        const p = file && progress.find(x => x.url === file.url)
        const done = file && isDone(profile, file.url)
        return (
          <button
            key={e.n}
            disabled={!file}
            onClick={() => file && onPlay(file)}
            className={cn('glass flex w-full items-center gap-3 rounded-2xl p-1.5 pr-2.5 text-left', !file && 'opacity-55')}
          >
            <div className="relative aspect-video w-[120px] shrink-0 overflow-hidden rounded-xl bg-white/5">
              {e.still
                ? <img src={img(e.still, 'w300')} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                : <>
                    {fallback && <img src={img(fallback, 'w300')} alt="" loading="lazy" decoding="async" className="size-full object-cover opacity-45" />}
                    <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-extrabold text-white/90">E{e.n}</span>
                  </>}
              {p && p.d > 0 && <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/25"><div className="h-full bg-orange-500" style={{ width: `${(p.t / p.d) * 100}%` }} /></div>}
              {done && <span className="absolute top-1 left-1 rounded-full bg-black/70 px-1.5 text-[9px] font-semibold text-white/85">Watched</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{e.n}. {e.name}</p>
              <p className="text-[11px] text-white/50">{[e.runtime ? `${e.runtime}m` : '', e.airDate?.slice(0, 4)].filter(Boolean).join(' · ') || epLabel(n, e.n)}</p>
              {e.overview && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">{e.overview}</p>}
            </div>
            {file && <span className="btn-black flex size-9 shrink-0 items-center justify-center rounded-full"><Play className="size-4 fill-white" /></span>}
          </button>
        )
      })}

      {extra.map(x => (
        <button key={x.url} onClick={() => onPlay(x)} className="glass flex w-full items-center gap-3 rounded-2xl p-2.5 text-left">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{epLabel(x.s, x.e)}</p>
            <p className="truncate text-[11px] text-white/50">{x.f.name}</p>
          </div>
          <span className="btn-black flex size-9 shrink-0 items-center justify-center rounded-full"><Play className="size-4 fill-white" /></span>
        </button>
      ))}
    </div>
  )
}
