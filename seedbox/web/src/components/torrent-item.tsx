import { memo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WideProgress } from '@/components/wide-progress'
import { RemoveTorrent } from '@/components/remove-torrent'
import { api, bytes, duration, speed, type Torrent } from '@/lib/api'
import { absolute, copy } from '@/lib/links'
import { useApp } from '@/lib/app-context'

export function statusOf(t: Torrent) {
  if (t.paused) return 'Paused'
  if (!t.ready) return 'Connecting'
  if (t.done) return 'Seeding'
  return 'Downloading'
}

export async function uploadToCloud(t: Torrent) {
  try {
    await api.upload(t.infoHash)
    toast.success('Uploading to cloud', { description: t.name })
  } catch (e) {
    toast.error((e as Error).message)
  }
}

export function CloudBadge({ t }: { t: Torrent }) {
  const c = t.cloud
  if (!c) return null
  if (c.status === 'done') return <Badge variant="secondary">In cloud</Badge>
  if (c.status === 'error') return <Badge variant="destructive" title={c.error}>Cloud upload failed</Badge>
  if (c.status === 'queued') return <Badge variant="outline">Cloud: queued</Badge>
  return <Badge variant="outline" className="font-mono tabular-nums">Cloud {(c.progress * 100).toFixed(0)}%</Badge>
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}

export const TorrentItem = memo(function TorrentItem({ t, onOpen }: { t: Torrent; onOpen: (hash: string) => void }) {
  const [confirm, setConfirm] = useState(false)
  const { cloudEnabled } = useApp()
  const pct = t.progress * 100
  const status = statusOf(t)

  const toggle = async () => {
    try { await api.action(t.infoHash, t.paused ? 'resume' : 'pause') } catch (e) { toast.error((e as Error).message) }
  }

  const right = t.paused ? 'Paused'
    : t.done ? 'Complete'
      : !t.ready ? 'Finding peers'
        : `${speed(t.downloadSpeed)} · ${duration(t.timeRemaining)}`

  return (
    <Card className="gap-4 py-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <CardHeader className="px-4">
        <CardTitle className="line-clamp-2 break-all text-[15px] leading-snug">{t.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant={status === 'Downloading' ? 'default' : status === 'Seeding' ? 'secondary' : 'outline'}>{status}</Badge>
          <span className="font-mono text-xs tabular-nums">{bytes(t.length)}</span>
          {t.files.length > 0 && <span className="text-xs">{t.files.length} file{t.files.length > 1 ? 's' : ''}</span>}
          <CloudBadge t={t} />
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="-mr-2 font-mono text-base" aria-label="Menu">···</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => onOpen(t.infoHash)}>Files and details</DropdownMenuItem>
              <DropdownMenuItem onSelect={toggle}>{t.paused ? 'Resume' : 'Pause'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => { await copy(t.magnet); toast.success('Magnet link copied') }}>Copy magnet link</DropdownMenuItem>
              {cloudEnabled && t.done && (
                <DropdownMenuItem onSelect={() => uploadToCloud(t)}>{t.cloud?.status === 'done' ? 'Upload to cloud again' : 'Upload to cloud'}</DropdownMenuItem>
              )}
              {t.files.length > 0 && (
                <DropdownMenuItem asChild><a href={absolute(`/api/torrents/${t.infoHash}/playlist.m3u`)}>Download M3U playlist</a></DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4 px-4">
        <WideProgress value={pct} left={`${pct.toFixed(1)}%`} right={right} muted={t.paused} />
        <div className="grid grid-cols-4 gap-3">
          <Cell label="Down" value={speed(t.downloadSpeed)} />
          <Cell label="Up" value={speed(t.uploadSpeed)} />
          <Cell label="Peers" value={t.peers} />
          <Cell label="Ratio" value={(t.ratio || 0).toFixed(2)} />
        </div>
      </CardContent>

      <CardFooter className="grid grid-cols-2 gap-2 px-4">
        <Button variant="outline" className="h-11" onClick={toggle}>{t.paused ? 'Resume' : 'Pause'}</Button>
        <Button className="h-11" onClick={() => onOpen(t.infoHash)}>Files</Button>
      </CardFooter>

      <RemoveTorrent t={t} open={confirm} onOpenChange={setConfirm} />
    </Card>
  )
})
