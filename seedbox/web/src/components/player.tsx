import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isAudio, isImage } from '@/lib/api'
import { absolute, copy, openInApp, platform, playersFor } from '@/lib/links'
import type { Media } from '@/lib/app-context'

export function Player({ media, onClose }: { media: Media | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false)
  const players = playersFor(platform())

  return (
    <Dialog open={!!media} onOpenChange={o => { if (!o) { onClose(); setFailed(false) } }}>
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
                : <video
                    key={media.url}
                    src={media.url}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    onError={() => setFailed(true)}
                    className="max-h-full w-full bg-black md:max-h-[75dvh]"
                  />
          )}
        </div>
        <div className="space-y-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {failed && <p className="text-sm text-muted-foreground">This format can’t play in the browser. Open it in a player app:</p>}
          <div className="flex flex-wrap gap-2">
            {media && players.map(app => (
              <Button key={app.id} size="sm" variant="outline" onClick={() => openInApp(app, media.url, media.name)}>{app.label}</Button>
            ))}
            {media && (
              <Button size="sm" variant="secondary" onClick={async () => { await copy(absolute(media.url)); toast.success('Stream link copied') }}>
                Copy link
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
