import { House, Plus, Search, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Page = 'home' | 'search' | 'settings'

const ITEMS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

// Floating "liquid glass" bar: Home / Search / Settings grouped in one pill,
// with a separate round Add button on the right.
export function Dock({ page, onPage, onAdd, badge = 0 }: { page: Page; onPage: (p: Page) => void; onAdd: () => void; badge?: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-center gap-3 px-4">
      <div className="flex h-16 items-center gap-1 rounded-full border border-white/15 bg-white/[0.07] p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-2xl backdrop-saturate-150">
        {ITEMS.map(it => {
          const active = page === it.id
          return (
            <button
              key={it.id}
              onClick={() => onPage(it.id)}
              aria-label={it.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-full items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-300 ease-out',
                active ? 'bg-white text-black shadow-[0_4px_18px_rgba(255,255,255,0.25)]' : 'text-white/70 hover:text-white',
              )}
            >
              <it.icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
              <span className={cn('overflow-hidden transition-all duration-300', active ? 'max-w-20 opacity-100' : 'max-w-0 opacity-0')}>{it.label}</span>
              {it.id === 'home' && badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-orange-500 font-mono text-[9px] font-bold text-white ring-2 ring-black/60">{badge}</span>
              )}
            </button>
          )
        })}
      </div>
      <button
        onClick={onAdd}
        aria-label="Add"
        className="flex size-16 items-center justify-center rounded-full border border-orange-300/40 bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-[0_10px_40px_rgba(249,115,22,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform duration-200 active:scale-95"
      >
        <Plus className="size-7" strokeWidth={2.4} />
      </button>
    </nav>
  )
}
