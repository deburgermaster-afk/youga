import { Star } from 'lucide-react'
import { img } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Poster({ title, poster, sub, rating, badge, progress, onClick, onRate, rated, big, className }: {
  title: string
  poster?: string
  sub?: React.ReactNode // line under the title, e.g. "Drama · 2014 · PR 8"
  rating?: number // TMDB score chip
  badge?: React.ReactNode
  progress?: number
  onClick?: () => void
  onRate?: () => void // shows a star button on the poster
  rated?: boolean
  big?: boolean
  className?: string
}) {
  return (
    <div className={cn('group relative w-full', className)}>
      <button onClick={onClick} className="block w-full text-left">
        <div className={cn(
          'relative aspect-[2/3] overflow-hidden bg-white/5 ring-1 ring-white/10 transition-transform duration-300 group-active:scale-[0.97]',
          big ? 'rounded-[20px] shadow-[0_12px_30px_rgba(0,0,0,0.45)]' : 'rounded-2xl',
        )}>
          {poster
            ? <img src={img(poster, big ? 'w500' : 'w342')} alt={title} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            : <div className="flex size-full items-center justify-center p-3 text-center text-sm text-white/60">{title}</div>}
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" />
          {!!rating && (
            <span className="glass-dark absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              <Star className="size-3 fill-orange-400 text-orange-400" />{rating.toFixed(1)}
            </span>
          )}
          {badge && <span className="absolute top-2 left-2">{badge}</span>}
          {progress !== undefined && (
            <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
          )}
        </div>
        <p className={cn('truncate font-semibold tracking-tight', big ? 'mt-2 text-[15px]' : 'mt-1.5 text-[13px]')}>{title}</p>
        {sub && <p className={cn('truncate text-white/55', big ? 'text-[12.5px]' : 'text-[11px]')}>{sub}</p>}
      </button>
      {onRate && (
        <button
          onClick={onRate}
          aria-label={`Rate ${title}`}
          className={cn('glass-dark absolute top-2 right-2 flex items-center justify-center rounded-full', big ? 'size-9' : 'size-7')}
        >
          <Star className={cn(big ? 'size-[18px]' : 'size-3.5', rated ? 'fill-orange-400 text-orange-400' : 'text-white')} />
        </button>
      )}
    </div>
  )
}

// "Drama · 2014 · PR 8"
export function MetaLine({ parts, pr }: { parts: (string | undefined)[]; pr?: string }) {
  return (
    <>
      {parts.filter(Boolean).join(' · ')}
      {pr !== undefined && <> · <span className={pr === '–' ? 'text-white/40' : 'font-semibold text-orange-400'}>PR {pr}</span></>}
    </>
  )
}
