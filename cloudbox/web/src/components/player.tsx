import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Captions, Gauge, Link2, PictureInPicture2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isAudio, isImage } from '@/lib/api'
import { absolute, copy, openInApp, platform, playersFor } from '@/lib/links'
import type { Media } from '@/lib/app-context'

// SRT -> WebVTT so the browser's <track> can show it.
function srtToVtt(srt: string) {
  return 'WEBVTT\n\n' + srt
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')
}

const POS_KEY = 'cloudbox:pos:'
const loadPos = (url: string) => { try { return Number(localStorage.getItem(POS_KEY + url)) || 0 } catch { return 0 } }
const savePos = (url: string, t: number) => { try { localStorage.setItem(POS_KEY + url, String(Math.floor(t))) } catch { /* private mode */ } }

const langName = (name: string) => {
  const code = /\.([a-z]{2,3})\.(srt|vtt)$/i.exec(name)?.[1]
  try { return code ? new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code : name } catch { return code || name }
}

export function Player({ media, onClose }: { media: Media | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  const [tracks, setTracks] = useState<{ label: string; src: string; lang: string }[]>([])
  const [sub, setSub] = useState('off')
  const [rate, setRate] = useState('1')
  const video = useRef<HTMLVideoElement>(null)
  const players = playersFor(platform())

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
      <DialogContent className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 sm:max-w-none md:h-auto md:max-h-[92dvh] md:w-[min(94vw,1280px)] md:rounded-xl md:border">
        <div className="border-b px-4 py-3 pr-12">
          <DialogTitle className="truncate text-sm">{media?.name}</DialogTitle>
          <DialogDescription className="sr-only">Media player</DialogDescription>
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
                    onEnded={() => savePos(media.url, 0)}
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
              <Button size="sm" variant="ghost" onClick={async () => { if (media) { await copy(absolute(media.url)); toast.success('Stream link copied') } }}>
                <Link2 /> Copy link
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Open in</span>
            {media && players.map(app => (
              <Button key={app.id} size="sm" variant={failed ? 'default' : 'outline'} onClick={() => { close(); openInApp(app, media.url, media.name) }}>{app.label}</Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
