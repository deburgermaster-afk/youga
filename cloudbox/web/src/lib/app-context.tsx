import { createContext, useContext } from 'react'
import type { Prefs } from '@/lib/links'
import type { MovieFile } from '@/lib/api'
import type { RateTarget } from '@/components/rate-sheet'

export type QueueItem = { f: MovieFile; ep: string }
export type Media = {
  url: string; name: string; title?: string; movieId?: number; subs?: { name: string; url: string }[]
  ep?: string // "S1 E2 · Pilot" when it's an episode
  queue?: QueueItem[] // episodes that play after this one
}

export type AppCtx = {
  prefs: Prefs
  setPrefs: (p: Prefs) => void
  play: (m: Media) => void
  profile: string
  rate: (t: RateTarget) => void
  playing: boolean // the player is open
  // Free legal copy? Add it and start playing. Otherwise ask for a magnet link.
  addOrAsk: (m: { id: number; title: string }) => Promise<void>
}

export const AppContext = createContext<AppCtx>(null!)
export const useApp = () => useContext(AppContext)
