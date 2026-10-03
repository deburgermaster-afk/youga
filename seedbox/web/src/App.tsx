import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Activity, ArrowDownToLine, HardDrive, Settings2, Sprout, Users, Zap } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Background } from '@/components/background'
import { SpeedDial } from '@/components/speed-dial'
import { Sparkline } from '@/components/sparkline'
import { AddTorrent } from '@/components/add-torrent'
import { TorrentCard } from '@/components/torrent-card'
import { DiskBrowser } from '@/components/disk-browser'
import { SettingsPanel } from '@/components/settings-panel'
import { Player } from '@/components/player'
import { Login } from '@/components/login'
import { useLive } from '@/hooks/use-live'
import { api, bytes } from '@/lib/api'
import { loadPrefs, savePrefs, setLinkToken, type Prefs } from '@/lib/links'
import { AppContext, type Media } from '@/lib/app-context'
import { cn } from '@/lib/utils'

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-white/5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState<{ required: boolean; ok: boolean } | null>(null)
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [media, setMedia] = useState<Media | null>(null)
  const [tab, setTab] = useState('torrents')
  const { data, connected, history } = useLive(!!auth?.ok)

  useEffect(() => {
    api.me().then(m => {
      setLinkToken(m.linkToken)
      setAuth({ required: m.authRequired, ok: m.authed })
    }).catch(() => setAuth({ required: false, ok: true }))
  }, [])

  const setPrefs = useCallback((p: Prefs) => { setPrefsState(p); savePrefs(p) }, [])
  const ctx = useMemo(() => ({ prefs, setPrefs, play: setMedia }), [prefs, setPrefs])

  const stats = data?.stats
  const torrents = data?.torrents ?? []
  const diskUsed = stats ? stats.disk.total - stats.disk.free : 0
  const diskPct = stats?.disk.total ? (diskUsed / stats.disk.total) * 100 : 0

  if (!auth) return <Background />
  if (!auth.ok) {
    return (
      <>
        <Background />
        <Login onDone={tok => { setLinkToken(tok); setAuth({ required: true, ok: true }) }} />
      </>
    )
  }

  return (
    <AppContext.Provider value={ctx}>
      <Background intensity={(stats?.downloadSpeed ?? 0) / (5 * 1024 * 1024)} />
      <div className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-16 sm:px-6">
        <header className="flex items-center justify-between py-4">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/30">
              <ArrowDownToLine className="size-5 text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-lg font-bold tracking-tight text-transparent">Seedbox</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('relative flex size-2')}>
                  {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                  <span className={cn('relative inline-flex size-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-amber-400')} />
                </span>
                {connected ? 'Live' : 'Reconnecting…'}
              </div>
            </div>
          </motion.div>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 200, damping: 24 }}
          className="mb-5 grid gap-4 rounded-3xl border border-white/10 bg-card/50 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl grid-cols-2 sm:p-6 lg:grid-cols-[1fr_1fr_1.2fr]"
        >
          <SpeedDial value={stats?.downloadSpeed ?? 0} limit={stats?.downloadLimit ?? -1} label="Download" color="cyan" />
          <SpeedDial value={stats?.uploadSpeed ?? 0} limit={stats?.uploadLimit ?? -1} label="Upload / Seed" color="violet" />
          <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={<Zap className="size-4 text-cyan-400" />} label="Active" value={stats?.active ?? 0} />
              <Stat icon={<Sprout className="size-4 text-emerald-400" />} label="Seeding" value={stats?.seeding ?? 0} />
              <Stat icon={<Users className="size-4 text-violet-400" />} label="Peers" value={stats?.peers ?? 0} />
              <Stat icon={<Activity className="size-4 text-fuchsia-400" />} label="Ratio" value={(stats?.ratio ?? 0).toFixed(2)} />
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground"><HardDrive className="size-3.5" /> Storage</span>
                <span className="font-mono tabular-nums">{bytes(diskUsed)} / {bytes(stats?.disk.total ?? 0)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={cn('h-full rounded-full', diskPct > 90 ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-400 to-cyan-400')}
                  animate={{ width: `${diskPct}%` }}
                  transition={{ type: 'spring', stiffness: 60, damping: 20 }}
                />
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-2 pt-2">
              <Sparkline data={history} />
            </div>
          </div>
        </motion.section>

        <div className="mb-5"><AddTorrent /></div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 bg-white/5">
            <TabsTrigger value="torrents"><ArrowDownToLine /> Torrents {torrents.length > 0 && <span className="ml-1 rounded-full bg-white/10 px-1.5 text-[10px]">{torrents.length}</span>}</TabsTrigger>
            <TabsTrigger value="files"><HardDrive /> Server files</TabsTrigger>
            <TabsTrigger value="settings"><Settings2 /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="torrents">
            <motion.div layout className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {torrents.map(t => <TorrentCard key={t.infoHash} t={t} />)}
              </AnimatePresence>
              {data && torrents.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-dashed border-white/10 py-16 text-center">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>
                    <ArrowDownToLine className="mx-auto size-10 text-cyan-400/70" />
                  </motion.div>
                  <p className="mt-3 font-medium">No torrents yet</p>
                  <p className="text-sm text-muted-foreground">Paste a magnet link, or drop a .torrent file anywhere.</p>
                </motion.div>
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="files">
            {tab === 'files' && <DiskBrowser />}
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel
              stats={stats}
              authRequired={auth.required}
              onLogout={async () => { await api.logout(); setAuth({ required: true, ok: false }) }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <Player media={media} onClose={() => setMedia(null)} />
      <Toaster theme="dark" position="top-center" richColors />
    </AppContext.Provider>
  )
}
