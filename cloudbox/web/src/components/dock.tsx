import { CalendarDays, GalleryVerticalEnd, House, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Page = 'home' | 'timeline' | 'contributions' | 'search' | 'settings'

const ITEMS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'timeline', label: 'Timeline', icon: GalleryVerticalEnd },
  { id: 'contributions', label: 'Contributions', icon: CalendarDays },
  { id: 'search', label: 'Search', icon: Search },
] as const

// Floating glass bar: the pages in one pill, with a separate round Add button.
export function Dock({ page, onPage, onAdd, badge = 0 }: { page: Page; onPage: (p: Page) => void; onAdd: () => void; badge?: number }) {
  const index = ITEMS.findIndex(it => it.id === page)
  return (
    <nav className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-center gap-2.5 px-4">
      <div className="glass-strong relative flex h-14 items-center rounded-full p-1">
        {/* Sliding highlight behind the active icon */}
        {index >= 0 && (
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 w-14 rounded-full bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_12px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]"
            style={{ transform: `translateX(${index * 3.5}rem)` }}
          />
        )}
        {ITEMS.map(it => {
          const active = page === it.id
          return (
            <button
              key={it.id}
              onClick={() => onPage(it.id)}
              aria-label={it.label}
              title={it.label}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex h-full w-14 items-center justify-center rounded-full transition-colors duration-200', active ? 'text-white' : 'text-white/55 hover:text-white/85')}
            >
              <it.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
              {it.id === 'home' && badge > 0 && (
                <span className="absolute top-2 right-2.5 flex size-4 items-center justify-center rounded-full bg-orange-500 font-mono text-[9px] font-bold text-white ring-2 ring-black/60">{badge}</span>
              )}
            </button>
          )
        })}
      </div>
      <button
        onClick={onAdd}
        aria-label="Add movie"
        className="flex size-14 items-center justify-center rounded-full border border-orange-300/40 bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-[0_10px_34px_rgba(249,115,22,0.45),inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-200 active:scale-95"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </button>
    </nav>
  )
}
