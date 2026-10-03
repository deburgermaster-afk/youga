import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen, House, Settings2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Player } from '@/components/player'
import { HomePage } from '@/pages/home'
import { FilesPage } from '@/pages/files'
import { SettingsPage } from '@/pages/settings'
import { LoginPage } from '@/pages/login'
import { useJobs } from '@/hooks/use-jobs'
import { api, speed } from '@/lib/api'
import { loadPrefs, savePrefs, setLinkToken, type Prefs } from '@/lib/links'
import { AppContext, type Media } from '@/lib/app-context'
import { cn } from '@/lib/utils'

const PAGES = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

const PAGE_KEY = 'cloudbox:page'
const initialPage = () => {
  try {
    const p = localStorage.getItem(PAGE_KEY)
    return PAGES.some(x => x.id === p) ? p! : 'home'
  } catch { return 'home' }
}

export default function App() {
  const [auth, setAuth] = useState<{ required: boolean; ok: boolean } | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [media, setMedia] = useState<Media | null>(null)
  const [page, setPage] = useState(initialPage)
  const { jobs, online, refresh } = useJobs(!!auth?.ok)

  useEffect(() => {
    api.me().then(m => {
      setLinkToken(m.linkToken)
      setAuth({ required: m.authRequired, ok: m.authed })
    }).catch(() => setAuth({ required: false, ok: true }))
  }, [])

  const goto = (p: string) => {
    setPage(p)
    window.scrollTo({ top: 0 })
    try { localStorage.setItem(PAGE_KEY, p) } catch { /* ignore */ }
  }

  const setPrefs = useCallback((p: Prefs) => { setPrefsState(p); savePrefs(p) }, [])
  const ctx = useMemo(() => ({ prefs, setPrefs, play: setMedia }), [prefs, setPrefs])

  if (!auth) return <div className="flex min-h-dvh items-center justify-center"><Spinner className="size-6" /></div>
  if (!auth.ok) {
    return (
      <>
        <LoginPage onDone={tok => { setLinkToken(tok); setAuth({ required: true, ok: true }) }} />
        <Toaster theme="dark" position="top-center" />
      </>
    )
  }

  const copying = jobs?.filter(j => j.status === 'copying' || j.status === 'queued' || j.status === 'remote') ?? []
  const rate = copying.reduce((n, j) => n + (j.status === 'remote' ? j.remoteStats?.down || 0 : j.bps || 0), 0)

  return (
    <AppContext.Provider value={ctx}>
      <Tabs value={page} onValueChange={goto} className="min-h-dvh gap-0">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <div className="min-w-0">
              <h1 className="text-xl leading-none font-bold tracking-tight">Seedbox</h1>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', online ? 'animate-pulse bg-white' : 'bg-neutral-600')} />
                {online ? 'Cloud' : 'Offline'}{copying.length ? ` · copying ${copying.length}` : ''}
              </p>
            </div>
            <TabsList variant="line" className="ml-6 hidden h-10 gap-1 bg-transparent p-0 md:flex">
              {PAGES.map(p => (
                <TabsTrigger key={p.id} value={p.id} className="h-10 flex-none gap-2 px-3 text-sm">
                  <p.icon className="size-4" strokeWidth={1.75} />
                  {p.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {copying.length > 0 && (
              <div className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-emerald-400">
                ↓ {speed(rate)}
              </div>
            )}
          </div>
        </header>

        <main className="w-full px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10">
          <TabsContent value="home" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <HomePage jobs={jobs} refresh={refresh} onViewAll={() => goto('files')} />
          </TabsContent>
          <TabsContent value="files" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <FilesPage />
          </TabsContent>
          <TabsContent value="settings" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <SettingsPage authRequired={auth.required} onLogout={async () => { await api.logout(); setAuth({ required: true, ok: false }) }} />
          </TabsContent>
        </main>

        <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden">
          <TabsList className="grid h-16 w-full grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-neutral-950/85 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl group-data-horizontal/tabs:h-16">
            {PAGES.map(p => (
              <TabsTrigger
                key={p.id}
                value={p.id}
                aria-label={p.label}
                className="group relative h-full flex-col gap-1 rounded-xl border-0 px-0 py-0 text-[10px] font-medium tracking-wide text-neutral-500 transition-all duration-300 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-none dark:data-[state=active]:bg-white dark:data-[state=active]:text-black"
              >
                <p.icon className="size-5 transition-transform duration-300 group-data-[state=active]:scale-105" strokeWidth={1.75} />
                <span>{p.label}</span>
                {p.id === 'home' && copying.length > 0 && (
                  <span className="absolute top-1 right-[calc(50%-24px)] flex size-4 items-center justify-center rounded-full bg-white font-mono text-[9px] font-bold text-black ring-2 ring-neutral-950 group-data-[state=active]:bg-black group-data-[state=active]:text-white group-data-[state=active]:ring-white">
                    {copying.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
      </Tabs>

      <Player media={media} onClose={() => setMedia(null)} />
      <Toaster theme="dark" position="top-center" />
    </AppContext.Provider>
  )
}
