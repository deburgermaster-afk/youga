import { createContext, useContext } from 'react'
import type { Prefs } from '@/lib/links'

export type Media = { url: string; name: string }

export type AppCtx = {
  prefs: Prefs
  setPrefs: (p: Prefs) => void
  play: (m: Media) => void
  cloudEnabled: boolean
}

export const AppContext = createContext<AppCtx>(null!)
export const useApp = () => useContext(AppContext)
