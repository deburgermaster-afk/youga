import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Bookmark, BookmarkCheck, Download, ExternalLink, Play, Plus, Share2, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Poster } from '@/components/poster'
import { WideProgress } from '@/components/wide-progress'
import { api, bytes, img, movieFileUrl, type Entry, type Job, type Movie, type MovieDetail, type MovieFile } from '@/lib/api'
import { absolute, copy, kmplayer, openInApp, platform, playersFor } from '@/lib/links'
import { useApp } from '@/lib/app-context'
import { subtitlesFor } from '@/components/file-row'

const hm = (min: number) => (!min ? '' : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`)

export function MoviePage({ id, library, jobs, onClose, onOpen, onAddFile, onChanged }: {
  id: number
  library: Movie[]
  jobs: Job[]
  onClose: () => void
  onOpen: (id: number) => void
  onAddFile: (movieId: number) => void
  onChanged: () => void
}) {
  const { play, profile } = useApp()
  const [d, setD] = useState<MovieDetail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const entry = library.find(m => m.id === id)
  const file = entry?.files[0]
  const pending = jobs.filter(j => entry?.pending?.includes(j.id) && j.status !== 'done')

  useEffect(() => {
    setD(null)
    setErr('')
    window.scrollTo({ top: 0 })
    api.movie(id).then(setD).catch(e => setErr((e as Error).message))
  }, [id])

  const t = d ?? (entry ? { ...entry, year: entry.year || '', poster: entry.poster || '', backdrop: entry.backdrop || '', rating: entry.rating || 0, overview: entry.overview || '' } : null)

  const addToVault = async () => {
    setBusy(true)
    try { await api.addMovie(id, profile); toast.success('Added to your vault'); onChanged() } catch (e) { toast.error((e as Error).message) }
    setBusy(false)
  }
  const removeFromVault = async () => {
    try { await api.removeMovie(id); toast('Removed from your vault'); onChanged() } catch (e) { toast.error((e as Error).message) }
  }

  // Subtitles that came with the same torrent / folder.
  const subsFor = async (f: MovieFile) => {
    try {
      if (f.source === 'torbox') {
        const all = (await api.torboxFiles()).entries
        const me = all.find(e => e.torrentId === f.torrentId && e.fileId === f.fileId)
        return me ? subtitlesFor(me, all) : []
      }
      const dir = (f.key || '').slice(0, (f.key || '').lastIndexOf('/') + 1)
      const all = (await api.files(dir)).entries.map(e => ({ ...e, source: 'cloud' as const })) as Entry[]
      const me = all.find(e => e.path === f.key)
      return me ? subtitlesFor(me, all) : []
    } catch { return [] }
  }

  const playFile = async (f: MovieFile) => {
    play({ url: movieFileUrl(f), name: f.name, title: t?.title, movieId: id, subs: await subsFor(f) })
  }

  const openKm = (f: MovieFile) => {
    const app = kmplayer()
    if (!app) return
    openInApp(app, movieFileUrl(f), t?.title || f.name, () => toast(platform() === 'ios'
      ? 'KMPlayer for iPhone doesn’t accept links from other apps. Try VLC or Infuse.'
      : 'KMPlayer didn’t open. Is it installed?'))
  }

  if (err && !t) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-white/70">{err}</p>
        <Button variant="outline" onClick={onClose}>Back</Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-40 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
      {/* Hero */}
      <div className="relative h-[58dvh] min-h-80 w-full overflow-hidden">
        {t?.poster || t?.backdrop
          ? <>
              <img src={img(t.backdrop || t.poster, 'w1280')} alt="" className="absolute inset-0 hidden size-full object-cover md:block" />
              <img src={img(t.poster || t.backdrop, 'w780')} alt={t.title} className="absolute inset-0 size-full object-cover md:hidden" />
            </>
          : <Skeleton className="size-full rounded-none" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070a] via-[#07070a]/30 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button onClick={onClose} aria-label="Back" className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-xl"><ArrowLeft className="size-5" /></button>
          {file && (
            <button aria-label="Copy stream link" onClick={async () => { await copy(absolute(movieFileUrl(file))); toast.success('Stream link copied') }}
              className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-xl"><Share2 className="size-5" /></button>
          )}
        </div>
      </div>

      <div className="relative -mt-16 space-y-5 px-5">
        {/* Title row */}
        <div className="flex items-start gap-3">
          <h1 className="flex-1 text-[28px] leading-tight font-bold tracking-tight">{t?.title ?? <Skeleton className="h-8 w-2/3" />}</h1>
          <button aria-label={entry ? 'Remove from vault' : 'Add to vault'} onClick={entry ? removeFromVault : addToVault} disabled={busy}
            className="mt-1 flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/5">
            {entry ? <BookmarkCheck className="size-5 text-orange-400" /> : <Bookmark className="size-5" />}
          </button>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {!!t?.rating && <span className="flex items-center gap-1 font-semibold text-orange-400"><Star className="size-4 fill-orange-400" />{t.rating.toFixed(1)}</span>}
          {t?.year && <span className="text-white/80">{t.year}</span>}
          {d?.certification && <Badge variant="outline" className="rounded-full border-white/25">{d.certification}</Badge>}
          {d?.country && <Badge variant="outline" className="rounded-full border-white/25">{d.country}</Badge>}
          {!!(d?.runtime || entry?.runtime) && <Badge variant="outline" className="rounded-full border-white/25">{hm(d?.runtime || entry?.runtime || 0)}</Badge>}
          {d?.imdbId && (
            <a href={`https://www.imdb.com/title/${d.imdbId}/`} target="_blank" rel="noreferrer">
              <Badge className="rounded-full bg-[#f5c518] font-bold text-black">IMDb</Badge>
            </a>
          )}
        </div>

        {/* Actions */}
        {file ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => playFile(file)} className="h-13 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-base font-semibold text-white shadow-[0_8px_30px_rgba(249,115,22,0.45)] hover:opacity-95">
                <Play className="fill-current" /> Play
              </Button>
              <Button asChild variant="outline" className="h-13 rounded-full border-white/30 bg-transparent text-base">
                <a href={absolute(movieFileUrl(file), true)} download><Download /> Download</a>
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1 rounded-full border-white/15 bg-white/5" onClick={() => openKm(file)}>
                <ExternalLink /> Open in KMPlayer
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11 rounded-full border-white/15 bg-white/5">Other apps</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Open in</DropdownMenuLabel>
                  {playersFor(platform()).filter(p => !p.id.startsWith('kmplayer')).map(p => (
                    <DropdownMenuItem key={p.id} onSelect={() => openInApp(p, movieFileUrl(file), t?.title || file.name, () => toast(`${p.label} didn’t open`))}>{p.label}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : pending.length ? (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            {pending.map(j => {
              const remote = j.status === 'remote'
              const pct = remote ? (j.remoteProgress ?? 0) * 100 : j.size > 0 ? (j.copied / j.size) * 100 : 0
              return <WideProgress key={j.id} size="md" tone="blue" value={pct} left={`${pct.toFixed(0)}%`} right={remote ? `Downloading · ${j.remoteState || 'starting'}` : 'Saving to cloud'} />
            })}
            <p className="text-xs text-white/60">Downloading. It’ll be ready to play here when it finishes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => onAddFile(id)} className="h-13 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-base font-semibold text-white shadow-[0_8px_30px_rgba(249,115,22,0.45)]">
              <Plus /> Add file
            </Button>
            {entry
              ? <Button variant="outline" className="h-13 rounded-full border-white/30 bg-transparent text-base" onClick={removeFromVault}><BookmarkCheck /> In vault</Button>
              : <Button variant="outline" className="h-13 rounded-full border-white/30 bg-transparent text-base" onClick={addToVault} disabled={busy}><Bookmark /> Save</Button>}
          </div>
        )}

        {/* Story */}
        <div className="space-y-2">
          {!!(d?.genres?.length || entry?.genres?.length) && <h2 className="font-semibold">Genre: {(d?.genres || entry?.genres || []).join(', ')}</h2>}
          {d?.tagline && <p className="text-sm italic text-orange-200/80">“{d.tagline}”</p>}
          <p className="text-[15px] leading-relaxed text-white/75">{t?.overview}</p>
          {d?.director && <p className="text-sm text-white/60">Director: <span className="text-white/85">{d.director}</span></p>}
        </div>

        {/* Cast */}
        {!!d?.cast.length && (
          <div className="space-y-3">
            <h2 className="font-semibold">Cast</h2>
            <div className="scrollbar-none -mx-5 flex gap-3 overflow-x-auto px-5">
              {d.cast.map(c => (
                <div key={c.name + c.character} className="w-20 shrink-0 text-center">
                  <div className="mx-auto size-20 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
                    {c.profile ? <img src={img(c.profile, 'w185')} alt={c.name} loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-xl font-bold text-white/40">{c.name[0]}</div>}
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-[11px] font-medium">{c.name}</p>
                  <p className="line-clamp-1 text-[10px] text-white/50">{c.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="trailers" className="gap-4">
          <TabsList variant="line" className="w-full justify-start gap-4 border-b border-white/10">
            <TabsTrigger value="trailers" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">Trailers</TabsTrigger>
            <TabsTrigger value="similar" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">More like this</TabsTrigger>
            {entry && <TabsTrigger value="files" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">Files</TabsTrigger>}
          </TabsList>
          <TabsContent value="trailers" className="space-y-3">
            {d?.trailers.length
              ? d.trailers.map(v => (
                  <div key={v.key} className="overflow-hidden rounded-2xl ring-1 ring-white/10">
                    <iframe className="aspect-video w-full" src={`https://www.youtube-nocookie.com/embed/${v.key}`} title={v.name} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                  </div>
                ))
              : <p className="text-sm text-white/50">{d ? 'No trailers found.' : 'Loading…'}</p>}
          </TabsContent>
          <TabsContent value="similar">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {d?.similar.map(m => <Poster key={m.id} title={m.title} poster={m.poster} year={m.year} rating={m.rating} onClick={() => onOpen(m.id)} />)}
            </div>
          </TabsContent>
          {entry && (
            <TabsContent value="files" className="space-y-2">
              {entry.files.map(f => (
                <div key={`${f.source}${f.key}${f.torrentId}${f.fileId}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{f.name}</p>
                    <p className="font-mono text-[11px] text-emerald-400">{bytes(f.size)} <span className="text-white/50">· {f.source === 'torbox' ? 'TorBox' : 'Cloud'}</span></p>
                  </div>
                  <Button size="icon" className="size-9 rounded-full bg-orange-500 text-white" aria-label="Play" onClick={() => playFile(f)}><Play className="fill-current" /></Button>
                  <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Unlink" onClick={async () => { await api.detach(id, f); onChanged() }}><Trash2 /></Button>
                </div>
              ))}
              <Button variant="outline" className="h-11 w-full rounded-full border-white/15 bg-white/5" onClick={() => onAddFile(id)}><Plus /> Add another file</Button>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
