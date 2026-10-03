import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/panel'
import { Spinner } from '@/components/ui/spinner'
import { api, img, type Movie } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { pr, prText } from '@/lib/movie'
import { PROFILES } from '@/lib/profiles'
import { cn } from '@/lib/utils'

export type RateTarget = { id: number; title: string; poster?: string }

// Personal rating (PR): each profile gives 1-10; the movie shows the family average.
export function RateSheet({ target, library, onClose, onChanged }: {
  target: RateTarget | null
  library: Movie[]
  onClose: () => void
  onChanged: () => void
}) {
  const { profile } = useApp()
  const [busy, setBusy] = useState<number | null>(null)
  const entry = target ? library.find(m => m.id === target.id) : undefined
  const mine = entry?.ratings?.[profile] || 0
  const me = PROFILES.find(p => p.id === profile)

  const set = async (v: number) => {
    if (!target) return
    setBusy(v)
    try {
      if (!entry) await api.addMovie(target.id, profile) // rating a movie saves it to the vault
      await api.rate(target.id, profile, v)
      toast.success(v ? `${me?.name ?? 'You'} rated ${target.title} ${v}/10` : 'Rating cleared')
      onChanged()
      onClose()
    } catch (e) { toast.error((e as Error).message) }
    setBusy(null)
  }

  return (
    <Panel open={!!target} onOpenChange={o => { if (!o) onClose() }} title={target ? `Rate ${target.title}` : ''} description="Your personal rating. PR is the average of everyone’s ratings.">
      {target && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10">
              {target.poster && <img src={img(target.poster, 'w185')} alt="" className="size-full object-cover" />}
            </div>
            <div>
              <p className="text-xs text-white/50">PR</p>
              <p className="font-display text-3xl font-bold text-orange-400">{prText(pr(entry))}</p>
            </div>
            <div className="ml-auto flex gap-1.5">
              {PROFILES.map(p => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <span className={cn('flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-black', p.color, p.id !== profile && 'opacity-70')}>{p.name[0]}</span>
                  <span className="font-mono text-[11px] text-white/70">{entry?.ratings?.[p.id] ?? '–'}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{me?.name}, your rating</p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                <button
                  key={v}
                  disabled={busy !== null}
                  onClick={() => set(v)}
                  className={cn(
                    'flex h-12 items-center justify-center rounded-2xl font-display text-lg font-bold transition-all active:scale-95',
                    'btn-black', v === mine ? 'text-orange-400 ring-2 ring-orange-400/80' : 'text-white/85',
                  )}
                >
                  {busy === v ? <Spinner /> : v}
                </button>
              ))}
            </div>
            {!!mine && (
              <button onClick={() => set(0)} disabled={busy !== null} className="mt-3 text-sm text-white/50 underline underline-offset-4">Clear my rating</button>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
