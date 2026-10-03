import { useMemo, useState } from 'react'
import { Panel } from '@/components/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { img, type Movie } from '@/lib/api'
import { PROFILES, profileById } from '@/lib/profiles'
import { cn } from '@/lib/utils'

type Ev = { t: number; by?: string; kind: 'added' | 'watched'; m: Movie }

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Calendar of what the family added and watched, one poster per day.
export function ContributionsPage({ library, onOpen }: { library: Movie[] | null; onOpen: (id: number) => void }) {
  const [who, setWho] = useState<string>('all')
  const [day, setDay] = useState<{ label: string; events: Ev[] } | null>(null)

  const events = useMemo(() => {
    const out: Ev[] = []
    for (const m of library || []) {
      out.push({ t: m.addedAt, by: m.addedBy, kind: 'added', m })
      for (const w of m.watches || []) out.push({ t: w.t, by: w.by, kind: 'watched', m })
    }
    return out.filter(e => who === 'all' || e.by === who).sort((a, b) => b.t - a.t)
  }, [library, who])

  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>()
    for (const e of events) {
      const k = dayKey(new Date(e.t))
      map.set(k, [...(map.get(k) || []), e])
    }
    return map
  }, [events])

  if (library === null) return <div className="px-4"><Skeleton className="h-80 rounded-3xl" /></div>

  const now = new Date()
  const today = dayKey(now)
  const oldest = events.length ? new Date(events[events.length - 1].t) : now
  const span = Math.min(24, (now.getFullYear() - oldest.getFullYear()) * 12 + now.getMonth() - oldest.getMonth() + 1)
  const months = Array.from({ length: Math.max(1, span) }, (_, i) => new Date(now.getFullYear(), now.getMonth() - i, 1))

  const thisMonth = events.filter(e => { const d = new Date(e.t); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
  const added = thisMonth.filter(e => e.kind === 'added').length
  const watched = thisMonth.filter(e => e.kind === 'watched').length

  const openDay = (label: string, evs: Ev[]) => {
    const ids = new Set(evs.map(e => e.m.id))
    if (ids.size === 1) onOpen(evs[0].m.id)
    else setDay({ label, events: evs })
  }

  return (
    <div className="space-y-4 px-4 pb-32">
      <div>
        <h2 className="font-display text-[19px] font-bold tracking-tight">Contributions</h2>
        <p className="text-xs text-white/45">This month: {added} added · {watched} watched</p>
      </div>

      <div className="glass flex rounded-full p-1">
        {[{ id: 'all', name: 'All' }, ...PROFILES].map(p => (
          <button
            key={p.id}
            onClick={() => setWho(p.id)}
            className={cn('h-8 flex-1 rounded-full text-xs font-semibold transition-colors', who === p.id ? 'btn-black text-white' : 'border border-transparent text-white/60')}
          >
            {p.name}
          </button>
        ))}
      </div>

      {months.map(first => {
        const y = first.getFullYear()
        const mo = first.getMonth()
        const days = new Date(y, mo + 1, 0).getDate()
        const lead = first.getDay() // weeks start on Sunday
        return (
          <section key={`${y}-${mo}`} className="space-y-2">
            <h3 className="text-[13px] font-medium text-white/55">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <div className="grid grid-cols-7 gap-x-1.5 gap-y-2">
              {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
              {Array.from({ length: days }, (_, i) => {
                const d = new Date(y, mo, i + 1)
                const k = dayKey(d)
                const evs = byDay.get(k)
                const future = d > now && k !== today
                const top = evs?.[0]
                const label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                const person = top?.by ? profileById(top.by) : undefined
                return (
                  <button
                    key={k}
                    disabled={!evs}
                    onClick={() => evs && openDay(label, evs)}
                    aria-label={evs ? `${label}: ${evs.map(e => e.m.title).join(', ')}` : label}
                    className="flex min-w-0 flex-col items-stretch"
                  >
                  <span
                    className={cn(
                      'relative block aspect-square overflow-hidden rounded-[14px] transition-transform active:scale-95',
                      evs ? 'ring-1 ring-white/15 shadow-[0_4px_14px_rgba(0,0,0,0.45)]' : 'bg-white/[0.035] ring-1 ring-white/[0.06]',
                      future && 'opacity-40',
                      k === today && 'ring-2 ring-orange-400 shadow-[0_0_18px_rgba(249,115,22,0.55)]',
                    )}
                  >
                    {top?.m.poster && <img src={img(top.m.poster, 'w185')} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
                    {evs && <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />}
                    <span className={cn('absolute inset-x-0 bottom-0.5 text-center text-[12px] font-semibold', evs ? 'text-shadow text-white' : 'text-white/25')}>{i + 1}</span>
                    {evs && evs.length > 1 && (
                      <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">{evs.length}</span>
                    )}
                    {person && (
                      <span className={cn('absolute top-0.5 left-0.5 flex size-3.5 items-center justify-center rounded-full bg-gradient-to-br text-[7px] font-black text-white', person.color)}>{person.name[0]}</span>
                    )}
                  </span>
                  {top && <span className="mt-0.5 truncate text-center text-[8.5px] leading-tight font-medium text-white/70">{top.m.title}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      {!events.length && <p className="text-center text-sm text-white/50">Add or watch a movie and it shows up here.</p>}

      <Panel open={!!day} onOpenChange={o => { if (!o) setDay(null) }} title={day?.label ?? ''}>
        <div className="space-y-2">
          {day?.events.map((e, i) => (
            <button key={i} onClick={() => { setDay(null); onOpen(e.m.id) }} className="glass flex w-full items-center gap-3 rounded-2xl p-2 text-left">
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5">{e.m.poster && <img src={img(e.m.poster, 'w185')} alt="" className="size-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.m.title}</p>
                <p className="text-xs text-white/55">
                  {e.kind === 'added' ? 'Added' : 'Watched'}{e.by ? ` by ${profileById(e.by)?.name ?? e.by}` : ''} · {new Date(e.t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}
