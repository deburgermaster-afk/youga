import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Captions, Gauge, Link2, PictureInPicture2, SkipForward, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isAudio, isImage } from '@/lib/api'
import { absolute, copy } from '@/lib/links'
import { OpenIn } from '@/components/open-in'
import { useApp, type Media } from '@/lib/app-context'
import { markDone, positionFor, saveProgress } from '@/lib/profiles'
import { playMovie } from '@/lib/movie'

// SRT -> WebVTT so the browser's <track> can show it.
function srtToVtt(srt: string) {
  return 'WEBVTT\n\n' + srt
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')
}


const langName = (name: string) => {
  const code = /\.([a-z]{2,3})\.(srt|vtt)$/i.exec(name)?.[1]
  try { return code ? new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code : name } catch { return code || name }
}

export function Player({ media, onClose }: { media: Media | null; onClose: () => void }) {
  const { profile, play } = useApp()
  // "Continue watching" is saved per profile.
  const loadPos = (url: string) => positionFor(profile, url)
  const savePos = (url: string, t: number) => {
    const v = video.current
    if (!media) return
    saveProgress(profile, { movieId: media.movieId, url, name: media.title || media.name, ep: media.ep, t, d: v?.duration || 0, at: Date.now() })
  }
  // Series: go on to the next episode.
  const next = media?.queue?.[0]
  const playNext = () => {
    if (!media || !next) return
    void playMovie(play, { id: media.movieId ?? 0, title: media.title || '' }, next.f, { ep: next.ep, queue: media.queue!.slice(1) })
  }
  const [failed, setFailed] = useState(false)
  const [tracks, setTracks] = useState<{ label: string; src: string; lang: string }[]>([])
  const [sub, setSub] = useState('off')
  const [rate, setRate] = useState('1')
  const video = useRef<HTMLVideoElement>(null)

  // Load subtitle files and convert them for the browser.
  useEffect(() => {
    setTracks([])
    setSub('off')
    setFailed(false)
    if (!media?.subs?.length) return
    let urls: string[] = []
    Promise.all(media.subs.map(async s => {
      const text = await (await fetch(s.url)).text()
      const src = URL.createObjectURL(new Blob([s.name.toLowerCase().endsWith('.vtt') ? text : srtToVtt(text)], { type: 'text/vtt' }))
      urls.push(src)
      return { label: langName(s.name), src, lang: /\.([a-z]{2,3})\.(srt|vtt)$/i.exec(s.name)?.[1] || '' }
    })).then(t => {
      setTracks(t)
      const en = t.find(x => x.lang === 'en')
      if (en) setSub(en.src)
    }).catch(() => {})
    return () => { urls.forEach(URL.revokeObjectURL); urls = [] }
  }, [media])

  useEffect(() => { if (video.current) video.current.playbackRate = Number(rate) }, [rate])

  const close = () => {
    if (media && video.current) savePos(media.url, video.current.currentTime)
    onClose()
  }

  return (
    <Dialog open={!!media} onOpenChange={o => { if (!o) close() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 sm:max-w-none md:h-auto md:max-h-[92dvh] md:w-[min(94vw,1280px)] md:rounded-xl md:border
          data-open:duration-500 data-open:zoom-in-75 data-open:ease-[cubic-bezier(.16,1,.3,1)] data-closed:duration-300 data-closed:zoom-out-90"
      >
        {/* Header clears the iPhone status bar / Dynamic Island. */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate font-display text-base font-bold">{media?.title || media?.name}</DialogTitle>
            <DialogDescription className="truncate text-xs text-white/50">{media?.ep || 'Now playing'}</DialogDescription>
          </div>
          <button onClick={close} aria-label="Close player" className="btn-black flex size-10 shrink-0 items-center justify-center rounded-full">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          {media && (
            isImage(media.name)
              ? <img src={media.url} alt={media.name} className="max-h-full max-w-full object-contain" />
              : isAudio(media.name)
                ? <audio src={media.url} controls autoPlay className="w-full p-4" />
                : (
                  <video
                    ref={video}
                    key={media.url}
                    src={media.url}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    onLoadedMetadata={e => {
                      const at = loadPos(media.url)
                      const v = e.currentTarget
                      v.playbackRate = Number(rate)
                      if (at > 10 && at < v.duration - 30) {
                        v.currentTime = at
                        toast(`Resumed at ${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, '0')}`)
                      }
                    }}
                    onTimeUpdate={e => { const t = e.currentTarget.currentTime; if (Math.floor(t) % 5 === 0) savePos(media.url, t) }}
                    onEnded={() => {
                      markDone(profile, media.url)
                      savePos(media.url, 0)
                      if (next) { toast(`Up next: ${next.ep}`); playNext() }
                    }}
                    onError={() => setFailed(true)}
                    className="max-h-full w-full bg-black md:max-h-[72dvh]"
                  >
                    {/* Only the chosen track is attached, so exactly one shows. */}
                    {tracks.filter(t => t.src === sub).map(t => <track key={t.src} kind="subtitles" src={t.src} label={t.label} srcLang={t.lang} default />)}
                  </video>
                )
          )}
        </div>

        <div className="space-y-3 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {failed && (
            <p className="text-sm text-amber-400">
              Your browser can’t play this format (common with MKV, HEVC/4K or Dolby audio). Open it in a player app:
            </p>
          )}
          {media && !isImage(media.name) && !isAudio(media.name) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!tracks.length}>
                    <Captions /> {tracks.length ? (tracks.find(t => t.src === sub)?.label ?? 'Subtitles off') : 'No subtitles'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sub} onValueChange={setSub}>
                    <DropdownMenuRadioItem value="off">Off</DropdownMenuRadioItem>
                    {tracks.map(t => <DropdownMenuRadioItem key={t.src} value={t.src}>{t.label}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline"><Gauge /> {rate}×</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuLabel>Speed</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={rate} onValueChange={setRate}>
                    {['0.5', '0.75', '1', '1.25', '1.5', '2'].map(r => <DropdownMenuRadioItem key={r} value={r}>{r}×</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {'pictureInPictureEnabled' in document && (
                <Button size="sm" variant="outline" aria-label="Picture in picture" onClick={() => video.current?.requestPictureInPicture().catch(() => toast('Picture-in-picture not available'))}>
                  <PictureInPicture2 />
                </Button>
              )}
              {next && (
                <Button size="sm" variant="outline" onClick={() => { if (video.current) savePos(media.url, video.current.currentTime); playNext() }}>
                  <SkipForward /> Next episode
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={async () => { if (media) { await copy(absolute(media.url)); toast.success('Stream link copied') } }}>
                <Link2 /> Copy link
              </Button>
            </div>
          )}
          {media && !isImage(media.name) && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Open in another player</p>
              <OpenIn url={media.url} title={media.title || media.name} compact highlight="kmplayer" onOpen={() => { if (video.current) { savePos(media.url, video.current.currentTime); video.current.pause() } }} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
