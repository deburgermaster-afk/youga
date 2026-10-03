import { useState } from 'react'
import { ExternalLink, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { isAudio, isImage } from '@/lib/api'
import { absolute, copy, openInApp, platform, playersFor } from '@/lib/links'
import type { Media } from '@/lib/app-context'

export function Player({ media, onClose }: { media: Media | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  const players = playersFor(platform())

  return (
    <Dialog open={!!media} onOpenChange={o => { if (!o) { onClose(); setFailed(false) } }}>
      <DialogContent className="max-w-[min(96vw,1200px)] gap-0 overflow-hidden border-white/10 bg-black p-0 sm:max-w-[min(96vw,1200px)]">
        <DialogTitle className="truncate px-4 py-3 pr-12 text-sm font-medium">{media?.name}</DialogTitle>
        {media && (
          isImage(media.name)
            ? <img src={media.url} alt={media.name} className="max-h-[80vh] w-full object-contain" />
            : isAudio(media.name)
              ? <audio src={media.url} controls autoPlay className="w-full p-4" />
              : <video
                  key={media.url}
                  src={media.url}
                  controls
                  autoPlay
                  playsInline
                  preload="auto"
                  onError={() => setFailed(true)}
                  className="max-h-[80vh] w-full bg-black"
                />
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
          {failed && <span className="mr-auto text-sm text-amber-400">This format can’t play in the browser — open it in an app:</span>}
          {media && players.map(app => (
            <Button key={app.id} size="sm" variant="outline" onClick={() => openInApp(app, media.url, media.name)}>
              <ExternalLink /> {app.label}
            </Button>
          ))}
          {media && (
            <Button size="sm" variant="ghost" onClick={async () => { await copy(absolute(media.url)); toast.success('Stream link copied') }}>
              <Link2 /> Copy link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
