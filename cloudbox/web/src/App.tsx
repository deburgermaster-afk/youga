import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Toaster } from '@/components/ui/sonner'
import { GlowBackground } from '@/components/glow-bg'
import { Dock, type Page } from '@/components/dock'
import type { RateTarget } from '@/components/rate-sheet'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { ProfilesPage } from '@/pages/profiles'
import { useJobs } from '@/hooks/use-jobs'
import { api, type Movie } from '@/lib/api'
import { loadPrefs, savePrefs, setLinkToken, type Prefs } from '@/lib/links'
import { profileById, sessionProfile, setSessionProfile, type ProfileId } from '@/lib/profiles'
import { AppContext, type Media } from '@/lib/app-context'
import { cn } from '@/lib/utils'

// Everything but the home screen loads in the background, so the app opens fast.
const load = {
  movie: () => import('@/pages/movie'),
  search: () => import('@/pages/search'),
  timeline: () => import('@/pages/timeline'),
  contributions: () => import('@/pages/contributions'),
  settings: () => import('@/pages/settings'),
  files: () => import('@/pages/files'),
  player: () => import('@/components/player'),
  add: () => import('@/components/add-sheet'),
  rate: () => import('@/components/rate-sheet'),
}
const MoviePage = lazy(() => load.movie().then(m => ({ default: m.MoviePage })))
const SearchPage = lazy(() => load.search().then(m => ({ default: m.SearchPage })))
const TimelinePage = lazy(() => load.timeline().then(m => ({ default: m.TimelinePage })))
const ContributionsPage = lazy(() => load.contributions().then(m => ({ default: m.ContributionsPage })))
const SettingsPage = lazy(() => load.settings().then(m => ({ default: m.SettingsPage })))
const FilesPage = lazy(() => load.files().then(m => ({ default: m.FilesPage })))
const Player = lazy(() => load.player().then(m => ({ default: m.Player })))
const AddSheet = lazy(() => load.add().then(m => ({ default: m.AddSheet })))
const RateSheet = lazy(() => load.rate().then(m => ({ default: m.RateSheet })))

// Last known login + library, so the app paints immediately and refreshes after.
const AUTH = 'cloudbox:authed'
const LIB = 'cloudbox:library'
const remembered = <T,>(key: string): T | null => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
const remember = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* full or blocked */ } }

type Overlay = { type: 'movie'; id: number } | { type: 'files' } | null

export default function App() {
  const [auth, setAuth] = useState<{ required: boolean; ok: boolean } | null>(() => remembered(AUTH))
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs)
  const [media, setMedia] = useState<Media | null>(null)
  const [profile, setProfile] = useState<ProfileId | null>(sessionProfile)
  const [page, setPage] = useState<Page>('home')
  const [overlay, setOverlayState] = useState<Overlay>(null)
  const [add, setAdd] = useState<{ open: boolean; movieId?: number }>({ open: false })
  const [library, setLibrary] = useState<Movie[] | null>(() => remembered(LIB))
  const [rating, setRating] = useState<RateTarget | null>(null)
  const { jobs, refresh } = useJobs(!!auth?.ok && !!profile)

  useEffect(() => {
    api.me().then(m => {
      setLinkToken(m.linkToken)
      const a = { required: m.authRequired, ok: m.authed }
      setAuth(a)
      remember(AUTH, a.ok ? a : null)
    }).catch(() => setAuth(a => a ?? { required: false, ok: true }))
    // Warm up the other screens once the first one is up.
    const warm = () => Object.values(load).forEach(f => f().catch(() => {}))
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(warm)
    else setTimeout(warm, 1200)
  }, [])

  const loadLibrary = useCallback(() => {
    api.library().then(r => { setLibrary(r.movies); remember(LIB, r.movies) }).catch(() => setLibrary(l => l ?? []))
  }, [])

  // Reload the library when downloads start or finish.
  const jobsKey = (jobs ?? []).map(j => j.id + j.status).join()
  useEffect(() => { if (auth?.ok && profile) loadLibrary() }, [auth?.ok, profile, jobsKey, loadLibrary])

  // Overlays (movie page, files) work with the phone's back button.
  const setOverlay = useCallback((o: Overlay) => {
    if (o) history.pushState({ overlay: o }, '')
    setOverlayState(o)
    window.scrollTo({ top: 0 })
  }, [])
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOverlayState((e.state?.overlay as Overlay) ?? null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const closeOverlay = () => (history.state?.overlay ? history.back() : setOverlayState(null))

  const setPrefs = useCallback((p: Prefs) => { setPrefsState(p); savePrefs(p) }, [])
  // Playing a vault movie logs it for the contributions calendar.
  const play = useCallback((m: Media) => {
    setMedia(m)
    if (m.movieId && profile) api.watched(m.movieId, profile).then(loadLibrary).catch(() => {})
  }, [profile, loadLibrary])
  const ctx = useMemo(() => ({ prefs, setPrefs, play, profile: profile || 'tj', rate: setRating, playing: !!media }), [prefs, setPrefs, play, profile, media])

  if (!auth) return <div className="flex min-h-dvh items-center justify-center bg-[#07070a]"><Spinner className="size-6" /></div>
  if (!auth.ok) {
    return (
      <>
        <GlowBackground />
        <LoginPage onDone={tok => { setLinkToken(tok); setAuth({ required: true, ok: true }); remember(AUTH, { required: true, ok: true }) }} />
        <Toaster theme="dark" position="top-center" />
      </>
    )
  }
  if (!profile) {
    return (
      <>
        <GlowBackground />
        <ProfilesPage onPick={id => { setSessionProfile(id); setProfile(id) }} />
      </>
    )
  }

  const me = profileById(profile)!
  const active = (jobs ?? []).filter(j => j.status === 'copying' || j.status === 'queued' || j.status === 'remote').length
  const goto = (p: Page) => { if (overlay) setOverlayState(null); setPage(p); window.scrollTo({ top: 0 }) }
  const openMovie = (id: number) => setOverlay({ type: 'movie', id })
  const switchProfile = () => { setSessionProfile(null); setProfile(null); setOverlayState(null); setPage('home') }

  return (
    <AppContext.Provider value={ctx}>
      <GlowBackground />

      <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><Spinner className="size-6" /></div>}>
      {overlay?.type === 'movie' ? (
        <MoviePage
          key={overlay.id}
          id={overlay.id}
          library={library ?? []}
          jobs={jobs ?? []}
          onClose={closeOverlay}
          onOpen={openMovie}
          onAddFile={movieId => setAdd({ open: true, movieId })}
          onChanged={() => { loadLibrary(); refresh() }}
        />
      ) : overlay?.type === 'files' ? (
        <div className="min-h-dvh px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-40">
          <div className="mb-4 flex items-center gap-3">
            <button onClick={closeOverlay} aria-label="Back" className="btn-black flex size-11 items-center justify-center rounded-full"><ArrowLeft className="size-5" /></button>
            <h1 className="text-xl font-bold">Files</h1>
          </div>
          <FilesPage />
        </div>
      ) : (
        <>
          <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
            <div aria-hidden className="absolute inset-0 bg-[#07070a]/75 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
            <div className="relative flex h-[60px] items-center justify-between px-4">
              <button onClick={() => goto('home')} className="flex items-baseline gap-1" aria-label="Seedbox home">
                <span className="font-display bg-gradient-to-b from-white via-white to-orange-100/80 bg-clip-text text-[30px] leading-none font-extrabold tracking-[-0.05em] text-transparent">Seedbox</span>
                <span className="size-2 rounded-full bg-orange-500 shadow-[0_0_14px_rgba(249,115,22,0.9)]" />
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => goto('settings')} aria-label="Settings" className={cn('btn-black flex size-10 items-center justify-center rounded-full', page === 'settings' && 'ring-1 ring-orange-400/70 text-orange-300')}>
                  <Settings2 className="size-[18px]" />
                </button>
                <button onClick={switchProfile} aria-label={`Watching as ${me.name}. Switch profile`} className={cn('flex size-10 items-center justify-center rounded-full bg-gradient-to-br font-display text-[15px] font-extrabold ring-2 ring-white/15', me.color)}>
                  {me.name[0]}
                </button>
              </div>
            </div>
          </header>
          <main className="pt-1 animate-in fade-in-0 duration-300" key={page}>
            {page === 'home' && (
              <HomePage library={library} jobs={jobs} refresh={() => { refresh(); loadLibrary() }} onOpen={openMovie} onSearch={() => goto('search')} onAdd={() => setAdd({ open: true })} />
            )}
            {page === 'timeline' && <TimelinePage library={library} onOpen={openMovie} />}
            {page === 'contributions' && <ContributionsPage library={library} onOpen={openMovie} />}
            {page === 'search' && <SearchPage library={library ?? []} jobs={jobs ?? []} onOpen={openMovie} onAdd={movieId => setAdd({ open: true, movieId })} onSettings={() => goto('settings')} />}
            {page === 'settings' && (
              <SettingsPage
                authRequired={auth.required}
                profileName={me.name}
                onSwitchProfile={switchProfile}
                onFiles={() => setOverlay({ type: 'files' })}
                onLogout={async () => { await api.logout(); remember(AUTH, null); remember(LIB, null); setAuth({ required: true, ok: false }) }}
              />
            )}
          </main>
        </>
      )}
      </Suspense>

      <Dock page={page} onPage={goto} onAdd={() => setAdd({ open: true, movieId: overlay?.type === 'movie' ? overlay.id : undefined })} badge={active} />
      <Suspense fallback={null}>
        <AddSheet open={add.open} onOpenChange={o => setAdd(a => ({ ...a, open: o }))} movieId={add.movieId} library={library ?? []} onDone={() => { refresh(); loadLibrary() }} />
        <RateSheet target={rating} library={library ?? []} onClose={() => setRating(null)} onChanged={loadLibrary} />
        <Player media={media} onClose={() => setMedia(null)} />
      </Suspense>
      <Toaster theme="dark" position="top-center" />
    </AppContext.Provider>
  )
}
