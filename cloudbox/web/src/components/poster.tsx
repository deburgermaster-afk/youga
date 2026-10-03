import { Star } from 'lucide-react'
import { img } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Poster({ title, poster, year, rating, badge, progress, onClick, className }: {
  title: string; poster?: string; year?: string; rating?: number; badge?: React.ReactNode; progress?: number; onClick?: () => void; className?: string
}) {
  return (
    <button onClick={onClick} className={cn('group w-full text-left', className)}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 transition-transform duration-300 group-active:scale-[0.97] group-hover:ring-orange-400/50">
        {poster
          ? <img src={img(poster, 'w342')} alt={title} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="flex size-full items-center justify-center p-3 text-center text-sm text-white/60">{title}</div>}
        {!!rating && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur">
            <Star className="size-3 fill-orange-400 text-orange-400" />{rating.toFixed(1)}
          </span>
        )}
        {badge && <span className="absolute top-1.5 right-1.5">{badge}</span>}
        {progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="h-full bg-orange-500" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>
        )}
      </div>
      <p className="mt-1.5 truncate text-[13px] font-medium">{title}</p>
      {year && <p className="text-[11px] text-white/50">{year}</p>}
    </button>
  )
}
