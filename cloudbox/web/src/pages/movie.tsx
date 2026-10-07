import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Bookmark, BookmarkCheck, Download, Play, Plus, Share2, Star, Trash2, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Poster } from '@/components/poster'
import { OpenIn } from '@/components/open-in'
import { Episodes } from '@/components/episodes'
import { TrailerBackground } from '@/components/trailer'
import { WideProgress } from '@/components/wide-progress'
import { api, peek, bytes, img, movieFileUrl, type FreeCopy, type Job, type Movie, type MovieDetail, type MovieFile } from '@/lib/api'
import { absolute, copy } from '@/lib/links'
import { useApp } from '@/lib/app-context'
import { kind, playMovie, pr, prText } from '@/lib/movie'
import { episodeFiles, epLabel, nextEpisode, type EpFile } from '@/lib/episodes'
import { cn } from '@/lib/utils'

const hm = (min: number) => (!min ? '' : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`)
const circle = 'btn-black flex size-10 items-center justify-center rounded-full'
const onImage = 'btn-black flex size-10 items-center justify-center rounded-full !bg-black/55 backdrop-blur-md'

export function MoviePage({ id, library, jobs, onClose, onOpen, onAddFile, onChanged }: {
  id: number
  library: Movie[]
  jobs: Job[]
  onClose: () => void
  onOpen: (id: number) => void
  onAddFile: (movieId: number) => void
  onChanged: () => void
}) {
  const { play, profile, rate, playing, addOrAsk, sound, setSound } = useApp()
  const [d, setD] = useState<MovieDetail | null>(() => peek.movie(id))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [more, setMore] = useState(false)
  // Trailer: which one, whether it's showing, sound.
  const [ti, setTi] = useState(0)
  const [live, setLive] = useState(false)
  const [muted, setMuted] = useState(!sound) // trailers start with sound once it's been turned on
  const entry = library.find(m => m.id === id)
  const isTv = id < 0
  const eps = isTv ? episodeFiles(entry?.files || []) : []
  const upNext = isTv ? nextEpisode(profile, eps) : null
  const file = isTv ? (upNext?.ep.f ?? entry?.files[0]) : entry?.files[0]
  const pending = jobs.filter(j => entry?.pending?.includes(j.id) && j.status !== 'done')

  // Movies without a file: look for a free, legal copy up front.
  const [free, setFree] = useState<FreeCopy | null>(null)
  const [adding, setAdding] = useState(false)
  const needsFile = id > 0 && !entry?.files.length && !entry?.pending?.length
  useEffect(() => {
    if (!needsFile) return
    let live = true
    api.free(id).then(r => live && setFree(r)).catch(() => live && setFree({ found: false }))
    return () => { live = false }
  }, [id, needsFile])

  useEffect(() => {
    setD(peek.movie(id))
    setErr('')
    setTi(0)
    window.scrollTo({ top: 0 })
    api.movie(id).then(setD).catch(e => setErr((e as Error).message))
  }, [id])

  // Show what we already know (vault entry or the list it was tapped in) right away.
  const t = d ?? (entry ? { ...entry, year: entry.year || '', poster: entry.poster || '', backdrop: entry.backdrop || '', rating: entry.rating || 0, overview: entry.overview || '' } : peek.lite(id))
  const genres = d?.genres || entry?.genres
  const runtime = d?.runtime || entry?.runtime || 0
  const trailer = d?.trailers[ti]
  const score = pr(entry)

  const addToVault = async () => {
    setBusy(true)
    try { await api.addMovie(id, profile); toast.success('Saved to your vault'); onChanged() } catch (e) { toast.error((e as Error).message) }
    setBusy(false)
  }
  const removeFromVault = async () => {
    if (!confirm(`Remove ${t?.title || 'this'} from your vault? Its ratings and watch history go too. Files on TorBox stay.`)) return
    try { await api.removeMovie(id); toast('Removed from your vault'); onChanged() } catch (e) { toast.error((e as Error).message) }
  }

  const playFile = async (f: MovieFile) => {
    setStarting(true)
    await playMovie(play, { id, title: t?.title || f.name }, f)
    setStarting(false)
  }
  // An episode plays with the rest of the series queued after it.
  const playEp = async (ep: EpFile) => {
    setStarting(true)
    const i = eps.indexOf(ep)
    await playMovie(play, { id, title: t?.title || ep.f.name }, ep.f, {
      ep: epLabel(ep.s, ep.e),
      queue: eps.slice(i + 1).map(x => ({ f: x.f, ep: epLabel(x.s, x.e) })),
    })
    setStarting(false)
  }
  const playMain = () => (isTv && upNext ? playEp(upNext.ep) : file && playFile(file))



  if (err && !t) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-white/70">{err}</p>
        <Button variant="outline" onClick={onClose}>Back</Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-32 animate-in fade-in-0 duration-300">
      {/* Hero: poster, with the trailer fading in over it once it plays */}
      <div className="relative h-[62dvh] max-h-[720px] min-h-[400px] w-full overflow-hidden">
        {t?.poster || t?.backdrop
          ? <>
              <img src={img(t.backdrop || t.poster, 'w1280')} alt="" className="absolute inset-0 hidden size-full object-cover md:block" />
              <img src={img(t.poster || t.backdrop, 'w780')} alt={t.title} className="absolute inset-0 size-full object-cover md:hidden" />
            </>
          : <Skeleton className="size-full rounded-none" />}
        {trailer && (
          <TrailerBackground
            videoKey={trailer.key}
            muted={muted}
            paused={playing}
            onPlaying={setLive}
            onError={() => setTi(i => i + 1)}
            onSoundBlocked={() => setMuted(true)}
          />
        )}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#07070a] via-[#07070a]/45 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button onClick={onClose} aria-label="Back" className={onImage}><ArrowLeft className="size-5" /></button>
          <div className="flex gap-2">
            {live && (
              <button onClick={() => { setMuted(m => !m); setSound(muted) }} aria-label={muted ? 'Unmute trailer' : 'Mute trailer'} className={onImage}>
                {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
              </button>
            )}
            {file && (
              <button aria-label="Copy stream link" onClick={async () => { await copy(absolute(movieFileUrl(file))); toast.success('Stream link copied') }} className={onImage}>
                <Share2 className="size-[18px]" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative -mt-28 space-y-4 px-4">
        {/* Title + meta */}
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[32px] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance">{t?.title ?? <Skeleton className="h-8 w-2/3" />}</h1>
            <p className="mt-1.5 text-[13px] text-white/65">
              {[isTv ? 'Series' : '', genres?.slice(0, 2).join(', ') || kind(genres), t?.year,
                isTv ? (d?.seasons.filter(x => x.n > 0).length ? `${d.seasons.filter(x => x.n > 0).length} season${d.seasons.filter(x => x.n > 0).length > 1 ? 's' : ''}` : '') : hm(runtime),
                d?.certification].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button aria-label={entry ? 'Remove from vault' : 'Save to vault'} onClick={entry ? removeFromVault : addToVault} disabled={busy} className={cn(circle, 'size-11 shrink-0')}>
            {entry ? <BookmarkCheck className="size-5 text-orange-400" /> : <Bookmark className="size-5" />}
          </button>
        </div>

        {/* Scores: TMDB, IMDb, and our personal rating */}
        <div className="flex flex-wrap items-center gap-2">
          {!!t?.rating && (
            <span className="glass flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold">
              <Star className="size-3.5 fill-orange-400 text-orange-400" />{t.rating.toFixed(1)} <span className="text-[11px] font-normal text-white/50">TMDB</span>
            </span>
          )}
          {d?.imdbId && (
            <a href={`https://www.imdb.com/title/${d.imdbId}/`} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-full bg-[#f5c518] px-3 text-[13px] font-black text-black">
              IMDb{!!d.imdbRating && <span className="font-bold">{d.imdbRating.toFixed(1)}</span>}
            </a>
          )}
          <button
            onClick={() => t && rate({ id, title: t.title, poster: t.poster })}
            className="btn-black flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-orange-300"
          >
            <Star className={cn('size-3.5', entry?.ratings?.[profile] ? 'fill-orange-400 text-orange-400' : '')} />
            PR {prText(score)}
            <span className="font-normal text-orange-200/70">· {entry?.ratings?.[profile] ? 'Change' : 'Rate'}</span>
          </button>
        </div>

        {/* Actions */}
        {file ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button onClick={playMain} className="btn-black flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold">
                {starting ? <Spinner /> : <Play className="size-5 fill-orange-400 text-orange-400" />}
                {isTv && upNext ? `${upNext.resume ? 'Resume' : 'Play'} ${epLabel(upNext.ep.s, upNext.ep.e)}` : 'Play'}
              </button>
              {isTv
                ? <button onClick={() => onAddFile(id)} className="btn-black flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold"><Plus className="size-[18px]" /> Episodes</button>
                : <a href={absolute(movieFileUrl(file), true)} download className="btn-black flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold">
                    <Download className="size-[18px]" /> Download
                  </a>}
            </div>
            <OpenIn url={movieFileUrl(file)} title={t?.title || file.name} highlight="kmplayer" />
          </div>
        ) : pending.length ? (
          <div className="glass space-y-2 rounded-2xl p-3">
            {pending.map(j => {
              const remote = j.status === 'remote'
              const pct = remote ? (j.remoteProgress ?? 0) * 100 : j.size > 0 ? (j.copied / j.size) * 100 : 0
              return <WideProgress key={j.id} size="md" tone="blue" value={pct} left={`${pct.toFixed(0)}%`} right={remote ? `Downloading · ${j.remoteState || 'starting'}` : 'Saving to cloud'} />
            })}
            <p className="text-xs text-white/60">Downloading. Play shows up here when it’s done.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                disabled={adding}
                onClick={async () => {
                  if (isTv) return onAddFile(id)
                  setAdding(true)
                  await addOrAsk({ id, title: t?.title || '' })
                  setAdding(false)
                }}
                className="btn-black flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
              >
                {adding ? <Spinner /> : free?.found
                  ? <Play className="size-5 fill-orange-400 text-orange-400" />
                  : <Plus className="size-5 text-orange-400" strokeWidth={2.5} />}
                {isTv ? 'Add series' : free?.found ? 'Play' : 'Add movie'}
              </button>
              {!entry && (
                <button onClick={addToVault} disabled={busy} className="btn-black flex h-12 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold">
                  <Bookmark className="size-[18px]" /> Save
                </button>
              )}
            </div>
            {!isTv && (
              <p className="px-1 text-[12px] text-white/50">
                {free?.found
                  ? <>Ready to watch · <a href={free.page} target="_blank" rel="noreferrer" className="underline underline-offset-2">{free.source}</a>{free.file?.size ? ` · ${bytes(free.file.size)}` : ''}</>
                  : free ? 'Add movie asks for a magnet link.' : '\u00a0'}
              </p>
            )}
          </div>
        )}

        {/* Story */}
        {(d?.tagline || t?.overview) && (
          <button onClick={() => setMore(m => !m)} className="block space-y-1 text-left">
            {d?.tagline && <p className="text-[13px] font-medium text-orange-200/85 italic">“{d.tagline}”</p>}
            <p className={cn('text-[14px] leading-relaxed text-white/75', !more && 'line-clamp-3')}>{t?.overview}</p>
            {d?.director && <p className="pt-0.5 text-[13px] text-white/50">{isTv ? 'Created by' : 'Director'} <span className="text-white/85">{d.director}</span></p>}
          </button>
        )}

        {/* Cast */}
        {!!d?.cast.length && (
          <div className="scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4">
            {d.cast.map(c => (
              <div key={c.name + c.character} className="w-[68px] shrink-0 text-center">
                <div className="mx-auto size-[68px] overflow-hidden rounded-[18px] bg-white/5 ring-1 ring-white/10">
                  {c.profile ? <img src={img(c.profile, 'w185')} alt={c.name} loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-lg font-bold text-white/40">{c.name[0]}</div>}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] font-medium">{c.name}</p>
                <p className="line-clamp-1 text-[10px] text-white/45">{c.character}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue={isTv ? 'episodes' : 'similar'} className="gap-3">
          <TabsList variant="line" className="scrollbar-none w-full justify-start gap-4 overflow-x-auto border-b border-white/10">
            {isTv && <TabsTrigger value="episodes" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">Episodes</TabsTrigger>}
            <TabsTrigger value="similar" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">More like this</TabsTrigger>
            <TabsTrigger value="trailers" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">Trailers</TabsTrigger>
            {entry && <TabsTrigger value="files" className="data-[state=active]:text-orange-400 data-[state=active]:after:bg-orange-500">Files</TabsTrigger>}
          </TabsList>
          {isTv && (
            <TabsContent value="episodes">
              {d ? <Episodes id={id} seasons={d.seasons} eps={eps} start={upNext?.ep.s} fallback={d.backdrop || d.poster} onPlay={playEp} /> : <Skeleton className="h-40 rounded-2xl" />}
            </TabsContent>
          )}
          <TabsContent value="similar">
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-5">
              {d?.similar.map((m, i) => <Poster key={m.id} index={i} id={m.id} title={m.title} poster={m.poster} sub={m.year} rating={m.rating} onClick={() => onOpen(m.id)} />)}
            </div>
            {d && !d.similar.length && <p className="text-sm text-white/50">Nothing similar found.</p>}
          </TabsContent>
          <TabsContent value="trailers" className="space-y-2">
            {d?.trailers.length
              ? d.trailers.map((v, i) => (
                  <button
                    key={v.key}
                    onClick={() => { setTi(i); setMuted(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className={cn('glass flex w-full items-center gap-3 rounded-2xl p-1.5 pr-3 text-left', i === ti && 'ring-1 ring-orange-400/60')}
                  >
                    <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      <img src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`} alt="" loading="lazy" className="size-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center"><Play className="size-6 fill-white/90 text-white/90 drop-shadow" /></span>
                    </div>
                    <p className="line-clamp-2 text-[13px] font-medium">{v.name}</p>
                  </button>
                ))
              : <p className="text-sm text-white/50">{d ? 'No trailers found.' : 'Loading…'}</p>}
          </TabsContent>
          {entry && (
            <TabsContent value="files" className="space-y-2">
              {entry.files.map(f => (
                <div key={`${f.source}${f.key}${f.torrentId}${f.fileId}`} className="glass flex items-center gap-2 rounded-2xl p-2 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{f.name}</p>
                    <p className="font-mono text-[11px] text-emerald-400">{bytes(f.size)} <span className="text-white/50">· {f.source === 'torbox' ? 'TorBox' : f.source === 'archive' ? 'Internet Archive' : 'Cloud'}</span></p>
                  </div>
                  <button className="btn-black flex size-9 items-center justify-center rounded-full" aria-label="Play" onClick={() => playFile(f)}><Play className="size-4 fill-white" /></button>
                  <button className="flex size-9 items-center justify-center rounded-full text-white/70" aria-label="Unlink" onClick={async () => { await api.detach(id, f); onChanged() }}><Trash2 className="size-4" /></button>
                </div>
              ))}
              <button className="btn-black flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium" onClick={() => onAddFile(id)}><Plus className="size-4" /> {isTv ? 'Add episodes' : 'Add another file'}</button>
            </TabsContent>
          )}
        </Tabs>

        {entry && (
          <button onClick={removeFromVault} className="btn-black flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-medium text-red-400">
            <Trash2 className="size-4" /> Remove from vault
          </button>
        )}
      </div>
    </div>
  )
}
