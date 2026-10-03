import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isImage, isMedia, isVideo } from '@/lib/api'
import { absolute, copy, openInApp, platform, playersFor, preferredPlayer } from '@/lib/links'
import { useApp } from '@/lib/app-context'

export function FileMenu({ url, name, onDelete }: { url: string; name: string; onDelete?: () => void }) {
  const { prefs, play } = useApp()
  const p = platform()
  const players = playersFor(p)
  const media = isMedia(name)

  const onPlay = () => {
    if (isVideo(name) && prefs.autoOpen && p !== 'desktop') {
      const app = preferredPlayer(prefs)
      toast(`Opening in ${app.label}`)
      openInApp(app, url, name)
    } else {
      play({ url, name })
    }
  }

  const copyLink = async (download: boolean) => {
    await copy(absolute(url, download))
    toast.success(download ? 'Download link copied' : 'Stream link copied')
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {(media || isImage(name)) && <Button size="sm" onClick={onPlay}>Play</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {media && (
            <>
              <DropdownMenuLabel>Open in app</DropdownMenuLabel>
              <DropdownMenuGroup>
                {players.map(app => (
                  <DropdownMenuItem key={app.id} onSelect={() => openInApp(app, url, name)}>{app.label}</DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => copyLink(false)}>Copy stream link</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyLink(true)}>Copy download link</DropdownMenuItem>
            <DropdownMenuItem asChild><a href={absolute(url, true)} download>Download to device</a></DropdownMenuItem>
            <DropdownMenuItem asChild><a href={absolute(url)} target="_blank" rel="noreferrer">Open in new tab</a></DropdownMenuItem>
          </DropdownMenuGroup>
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
