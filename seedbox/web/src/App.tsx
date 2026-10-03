import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChartNoAxesColumn, House, ListChecks, ScrollText, Settings2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { addMany } from '@/components/add-torrent'
import { Player } from '@/components/player'
import { TorrentPanel } from '@/components/torrent-panel'
import { DownloadsPage } from '@/pages/downloads'
import { HomePage } from '@/pages/home'
import { LogsPage } from '@/pages/logs'
import { SettingsPage } from '@/pages/settings'
import { LoginPage } from '@/pages/login'
import { useLive } from '@/hooks/use-live'
import { api, speed } from '@/lib/api'
import { loadPrefs, savePrefs, setLinkToken, type Prefs } from '@/lib/links'
import { AppContext, type Media } from '@/lib/app-context'
import { cn } from '@/lib/utils'

// Charts are heavy; load the Stats page only when opened.
const StatsPage = lazy(() => import('@/pages/stats').then(m => ({ default: m.StatsPage })))

const PAGES = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'downloads', label: 'All', icon: ListChecks },
  { id: 'stats', label: 'Stats', icon: ChartNoAxesColumn },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const

const PAGE_KEY = 'seedbox:page'
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
  const [openHash, setOpenHash] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const { data, connected, history, logs, clearLogs } = useLive(!!auth?.ok)

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
  const cloudEnabled = !!data?.stats.cloud?.enabled
  const ctx = useMemo(() => ({ prefs, setPrefs, play: setMedia, cloudEnabled }), [prefs, setPrefs, cloudEnabled])

  // Drop .torrent files or magnet links anywhere.
  useEffect(() => {
    if (!auth?.ok) return
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false) }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files || []).filter(f => f.name.endsWith('.torrent'))
      const text = e.dataTransfer?.getData('text') || ''
      const magnets = text.split(/\s+/).filter(s => s.startsWith('magnet:'))
      if (files.length || magnets.length) addMany([...files, ...magnets])
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [auth?.ok])

  if (!auth) {
    return <div className="flex min-h-dvh items-center justify-center"><Spinner className="size-6" /></div>
  }
  if (!auth.ok) {
    return (
      <>
        <LoginPage onDone={tok => { setLinkToken(tok); setAuth({ required: true, ok: true }) }} />
        <Toaster theme="dark" position="top-center" />
      </>
    )
  }

  const stats = data?.stats
  const torrents = data?.torrents ?? []
  const openTorrent = torrents.find(t => t.infoHash === openHash) ?? null

  const active = stats?.active ?? 0

  // Desktop: text tabs in the header.
  const topNav = (
    <TabsList variant="line" className="ml-6 hidden h-10 gap-1 bg-transparent p-0 md:flex">
      {PAGES.map(p => (
        <TabsTrigger key={p.id} value={p.id} className="h-10 flex-none gap-2 px-3 text-sm">
          <p.icon className="size-4" strokeWidth={1.75} />
          {p.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )

  // Phone: floating glass bar with icon pills.
  const bottomNav = (
    <TabsList className="grid h-16 w-full grid-cols-5 group-data-horizontal/tabs:h-16 gap-1 rounded-2xl border border-white/10 bg-neutral-950/85 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {PAGES.map(p => (
        <TabsTrigger
          key={p.id}
          value={p.id}
          aria-label={p.label}
          className="group relative h-full flex-col gap-1 rounded-xl py-0 border-0 px-0 text-[10px] font-medium tracking-wide text-neutral-500 transition-all duration-300 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-none dark:data-[state=active]:bg-white dark:data-[state=active]:text-black"
        >
          <p.icon className="size-5 transition-transform duration-300 group-data-[state=active]:-translate-y-px group-data-[state=active]:scale-105" strokeWidth={1.75} />
          <span>{p.label}</span>
          {p.id === 'downloads' && active > 0 && (
            <span className="absolute top-1 right-[calc(50%-24px)] flex size-4 items-center justify-center rounded-full bg-white font-mono text-[9px] font-bold text-black ring-2 ring-neutral-950 group-data-[state=active]:bg-black group-data-[state=active]:text-white group-data-[state=active]:ring-white">
              {active}
            </span>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  )

  return (
    <AppContext.Provider value={ctx}>
      <Tabs value={page} onValueChange={goto} className="min-h-dvh gap-0">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <div className="min-w-0">
              <h1 className="text-xl leading-none font-bold tracking-tight">Seedbox</h1>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', connected ? 'animate-pulse bg-white' : 'bg-neutral-600')} />
                {connected ? 'Live' : 'Offline'} · {torrents.length} torrent{torrents.length === 1 ? '' : 's'}
              </p>
            </div>
            {topNav}
            <div className="ml-auto flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs tabular-nums">
              <span className="flex items-center gap-1"><ArrowDown className="size-3.5" />{speed(stats?.downloadSpeed ?? 0)}</span>
              <span className="flex items-center gap-1 text-muted-foreground"><ArrowUp className="size-3.5" />{speed(stats?.uploadSpeed ?? 0)}</span>
            </div>
          </div>
        </header>

        <main className="w-full px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10">
          <TabsContent value="home" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <HomePage torrents={torrents} loading={!data} onOpen={setOpenHash} onViewAll={() => goto('downloads')} />
          </TabsContent>
          <TabsContent value="downloads" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <DownloadsPage torrents={torrents} loading={!data} onOpen={setOpenHash} onAdd={() => goto('home')} />
          </TabsContent>
          <TabsContent value="stats" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <Suspense fallback={<div className="flex justify-center py-16"><Spinner className="size-6" /></div>}>
              <StatsPage stats={stats} torrents={torrents} history={history} />
            </Suspense>
          </TabsContent>
          <TabsContent value="logs" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <LogsPage logs={logs} onClear={clearLogs} />
          </TabsContent>
          <TabsContent value="settings" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <SettingsPage
              stats={stats}
              connected={connected}
              authRequired={auth.required}
              onLogout={async () => { await api.logout(); setAuth({ required: true, ok: false }) }}
            />
          </TabsContent>
        </main>

        <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden">
          {bottomNav}
        </nav>
      </Tabs>

      <TorrentPanel t={openTorrent} onClose={() => setOpenHash(null)} />
      <Player media={media} onClose={() => setMedia(null)} />
      <Toaster theme="dark" position="top-center" />

      <div className={cn(
        'pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-200',
        dragging ? 'opacity-100' : 'opacity-0',
      )}>
        <p className="rounded-xl border border-dashed px-10 py-8 text-lg font-medium">Drop .torrent files to add</p>
      </div>
    </AppContext.Provider>
  )
}
