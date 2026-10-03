import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// Thick progress bar with its label drawn inside. mix-blend-difference keeps
// the text crisp: white over the empty track, black over the filled part.
export function WideProgress({
  value, left, right, muted = false, size = 'lg', className,
}: {
  value: number
  left?: React.ReactNode
  right?: React.ReactNode
  muted?: boolean
  size?: 'lg' | 'md' | 'sm'
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Progress
        value={Math.max(0, Math.min(100, value))}
        className={cn(
          'bg-muted [&_[data-slot=progress-indicator]]:duration-700 [&_[data-slot=progress-indicator]]:ease-out',
          size === 'lg' && 'h-10 rounded-md',
          size === 'md' && 'h-7 rounded-md',
          size === 'sm' && 'h-5 rounded',
          muted && '[&_[data-slot=progress-indicator]]:bg-neutral-500',
        )}
      />
      {(left || right) && (
        <div className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-between gap-3 font-mono font-semibold tabular-nums text-white mix-blend-difference',
          size === 'sm' ? 'px-2 text-[11px]' : 'px-3 text-xs sm:text-sm',
        )}>
          <span className="shrink-0">{left}</span>
          <span className="truncate">{right}</span>
        </div>
      )}
    </div>
  )
}
