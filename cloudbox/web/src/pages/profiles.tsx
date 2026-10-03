import { PROFILES, type ProfileId } from '@/lib/profiles'
import { cn } from '@/lib/utils'

export function ProfilesPage({ onPick }: { onPick: (id: ProfileId) => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-10">
      <h1 className="mb-3 flex items-baseline gap-1">
        <span className="font-display text-xl font-extrabold tracking-[-0.04em] text-white/90">Seedbox</span>
        <span className="size-1.5 rounded-full bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.9)]" />
      </h1>
      <h2 className="mb-10 font-display text-[34px] font-extrabold tracking-[-0.035em]">Who’s watching?</h2>
      <div className="grid grid-cols-3 gap-5 sm:gap-8">
        {PROFILES.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className="group flex flex-col items-center gap-3 animate-in fade-in-0 zoom-in-90 fill-mode-both duration-500"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className={cn(
              'flex size-24 items-center justify-center rounded-[28px] bg-gradient-to-br font-display text-4xl font-extrabold text-white shadow-[0_12px_40px_rgba(249,115,22,0.35)] ring-2 ring-transparent transition-all duration-300 group-hover:scale-105 group-hover:ring-white group-active:scale-95 sm:size-32 sm:text-4xl',
              p.color,
            )}>
              {p.name[0]}
            </span>
            <span className="text-sm font-semibold tracking-wide text-white/80 group-hover:text-white">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
