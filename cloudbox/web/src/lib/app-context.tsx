import { createContext, useContext } from 'react'
import type { Prefs } from '@/lib/links'
import type { RateTarget } from '@/components/rate-sheet'

export type Media = { url: string; name: string; title?: string; movieId?: number; subs?: { name: string; url: string }[] }

export type AppCtx = {
  prefs: Prefs
  setPrefs: (p: Prefs) => void
  play: (m: Media) => void
  profile: string
  rate: (t: RateTarget) => void
  playing: boolean // the player is open
}

export const AppContext = createContext<AppCtx>(null!)
export const useApp = () => useContext(AppContext)
