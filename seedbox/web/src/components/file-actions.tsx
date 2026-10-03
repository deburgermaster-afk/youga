import { Check, Copy, Download, ExternalLink, Link2, MoreVertical, Play, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isMedia, isVideo, isImage } from '@/lib/api'
import { absolute, copy, openInApp, platform, playersFor, preferredPlayer } from '@/lib/links'
import { useApp } from '@/lib/app-context'

export function FileActions({ url, name, compact = false }: { url: string; name: string; compact?: boolean }) {
  const { prefs, play } = useApp()
  const p = platform()
  const players = playersFor(p)
  const media = isMedia(name)

  const onPlay = () => {
    if (isVideo(name) && prefs.autoOpen && p !== 'desktop') {
      const app = preferredPlayer(prefs)
      toast(`Opening in ${app.label}…`)
      openInApp(app, url, name)
    } else {
      play({ url, name })
    }
  }

  const copyLink = async (download: boolean) => {
    await copy(absolute(url, download))
    toast.success(download ? 'Download link copied' : 'Stream link copied', { icon: <Check className="size-4" /> })
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {(media || isImage(name)) && (
        <Button size={compact ? 'icon-sm' : 'sm'} onClick={onPlay} aria-label="Play" className="bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:opacity-90">
          <Play className="fill-current" />
          {!compact && 'Play'}
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" asChild aria-label="Download">
        <a href={absolute(url, true)} download><Download /></a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="More"><MoreVertical /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {media && (
            <>
              <DropdownMenuLabel className="flex items-center gap-2"><Smartphone className="size-3.5" /> Open in app</DropdownMenuLabel>
              {players.map(app => (
                <DropdownMenuItem key={app.id} onSelect={() => openInApp(app, url, name)}>
                  <ExternalLink /> {app.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => copyLink(false)}><Link2 /> Copy stream link</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copyLink(true)}><Copy /> Copy download link</DropdownMenuItem>
          <DropdownMenuItem asChild><a href={absolute(url)} target="_blank" rel="noreferrer"><ExternalLink /> Open in new tab</a></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
