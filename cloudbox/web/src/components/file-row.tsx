import { toast } from 'sonner'
import { Download, Link2, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { bytes, isImage, isMedia, isVideo, type Entry } from '@/lib/api'
import { absolute, copy, openInApp, platform, preferredPlayer } from '@/lib/links'
import { useApp } from '@/lib/app-context'

// Compact one-line file row with icon actions on the right.
export function FileRow({ f, onDelete }: { f: Entry; onDelete?: () => void }) {
  const { prefs, play } = useApp()
  const url = f.url!
  const playable = isMedia(f.name) || isImage(f.name)
  const onPlay = () => {
    if (isVideo(f.name) && prefs.autoOpen && platform() !== 'desktop') openInApp(preferredPlayer(prefs), url, f.name)
    else play({ url, name: f.name })
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card/60 py-1.5 pr-1.5 pl-3 animate-in fade-in-0 duration-300">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={f.name}>{f.name}</p>
        <p className="font-mono text-[11px] tabular-nums text-emerald-400">{bytes(f.size)}</p>
      </div>
      <Button size="icon" className="size-9 rounded-full bg-blue-500 text-white hover:bg-blue-400" disabled={!playable} onClick={onPlay} aria-label="Play">
        <Play className="fill-current" />
      </Button>
      <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Copy link" onClick={async () => { await copy(absolute(url)); toast.success('Link copied') }}>
        <Link2 />
      </Button>
      <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Download" asChild>
        <a href={absolute(url, true)} download><Download /></a>
      </Button>
      {onDelete && (
        <Button size="icon" variant="ghost" className="size-9 rounded-full text-muted-foreground hover:text-destructive" aria-label="Delete" onClick={onDelete}>
          <Trash2 />
        </Button>
      )}
    </div>
  )
}

