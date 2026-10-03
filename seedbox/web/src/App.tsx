import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddTorrent, addMany } from '@/components/add-torrent'
import { Player } from '@/components/player'
import { TorrentPanel } from '@/components/torrent-panel'
import { DownloadsPage } from '@/pages/downloads'
import { FilesPage } from '@/pages/files'
import { LogsPage } from '@/pages/logs'
import { SettingsPage } from '@/pages/settings'
import { LoginPage } from '@/pages/login'
import { useLive } from '@/hooks/use-live'
import { api, bytes, speed } from '@/lib/api'
import { loadPrefs, savePrefs, setLinkToken, type Prefs } from '@/lib/links'
import { AppContext, type Media } from '@/lib/app-context'
import { cn } from '@/lib/utils'

// Charts are heavy; load the Stats page only when opened.
const StatsPage = lazy(() => import('@/pages/stats').then(m => ({ default: m.StatsPage })))

const PAGES = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'files', label: 'Files' },
  { id: 'stats', label: 'Stats' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
] as const

const PAGE_KEY = 'seedbox:page'
const initialPage = () => {
  try { return localStorage.getItem(PAGE_KEY) || 'downloads' } catch { return 'downloads' }
}

export default function App() {
  const [auth, setAuth] = useState<{ required: boolean; ok: boolean } | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [media, setMedia] = useState<Media | null>(null)
  const [page, setPage] = useState(initialPage)
  const [adding, setAdding] = useState(false)
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
  const ctx = useMemo(() => ({ prefs, setPrefs, play: setMedia }), [prefs, setPrefs])

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

  const nav = (className: string, mobile: boolean) => (
    <TabsList
      variant="line"
      className={cn(className, mobile
        ? 'h-auto w-full rounded-none bg-black p-0'
        : 'h-10 gap-1 bg-transparent p-0')}
    >
      {PAGES.map(p => (
        <TabsTrigger
          key={p.id}
          value={p.id}
          className={cn(mobile
            ? 'h-14 flex-1 rounded-none border-0 px-0 text-[13px] after:hidden data-[state=active]:font-semibold data-[state=active]:shadow-[inset_0_2px_0_0_var(--foreground)]'
            : 'h-10 flex-none px-3 text-sm')}
        >
          {p.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )

  return (
    <AppContext.Provider value={ctx}>
      <Tabs value={page} onValueChange={goto} className="min-h-dvh gap-0">
        <header className="sticky top-0 z-40 border-b bg-black pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <h1 className="text-lg font-semibold tracking-tight">Seedbox</h1>
            <Badge variant={connected ? 'secondary' : 'outline'} className="font-normal">{connected ? 'Live' : 'Offline'}</Badge>
            {nav('ml-4 hidden md:flex', false)}
            <Button className="ml-auto h-10 px-5" onClick={() => setAdding(true)}>Add</Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-3 font-mono text-[13px] tabular-nums md:px-6">
            <span className="shrink-0"><span className="text-muted-foreground">Down </span>{speed(stats?.downloadSpeed ?? 0)}</span>
            <span className="shrink-0"><span className="text-muted-foreground">Up </span>{speed(stats?.uploadSpeed ?? 0)}</span>
            <span className="shrink-0"><span className="text-muted-foreground">Peers </span>{stats?.peers ?? 0}</span>
            <span className="shrink-0"><span className="text-muted-foreground">Free </span>{bytes(stats?.disk.free ?? 0)}</span>
          </div>
        </header>

        <main className="w-full px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10">
          <TabsContent value="downloads" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <DownloadsPage torrents={torrents} loading={!data} onOpen={setOpenHash} onAdd={() => setAdding(true)} />
          </TabsContent>
          <TabsContent value="files" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            <FilesPage stats={stats} />
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

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-black pb-[env(safe-area-inset-bottom)] md:hidden">
          {nav('flex', true)}
        </nav>
      </Tabs>

      <AddTorrent open={adding} onOpenChange={setAdding} />
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
