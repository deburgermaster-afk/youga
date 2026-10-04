import { toast } from 'sonner'
import { Link2, Share } from 'lucide-react'
import { absolute, copy, platform, playersFor, watchFail } from '@/lib/links'
import { cn } from '@/lib/utils'

// "Open in" buttons as real links: iPhone home-screen apps only follow app
// links on a real tap. Each tap also copies the stream link, so an app that
// opens without starting playback can just paste it.
export function OpenIn({ url, title, onOpen, compact, highlight }: {
  url: string
  title: string
  onOpen?: () => void // e.g. close our player first
  compact?: boolean
  highlight?: string // app id to show first and bigger (KMPlayer)
}) {
  const abs = absolute(url)
  const apps = playersFor(platform()).filter(a => a.id !== 'android-choose' || platform() === 'android')
  const sorted = highlight ? [...apps].sort((a, b) => Number(b.id.startsWith(highlight)) - Number(a.id.startsWith(highlight))) : apps
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const tapped = (label: string) => {
    void copy(abs)
    onOpen?.()
    watchFail(() => toast(`${label} didn’t open`, {
      description: `The link is copied. Open ${label}, choose “Network/URL stream”, and paste.`,
      duration: 7000,
    }))
  }

  const pill = cn('btn-black inline-flex items-center justify-center gap-1.5 rounded-full font-medium', compact ? 'h-9 px-3.5 text-[13px]' : 'h-10 px-4 text-[13px]')
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map(app => (
        <a key={app.id} href={app.build(abs, title)} onClick={() => tapped(app.label)} className={cn(pill, highlight && app.id.startsWith(highlight) && 'ring-1 ring-orange-400/60 text-orange-300')}>
          {app.label}
        </a>
      ))}
      {canShare && (
        <button className={pill} onClick={() => { onOpen?.(); navigator.share({ title, url: abs }).catch(() => {}) }}>
          <Share className="size-3.5" /> Share…
        </button>
      )}
      <button className={pill} onClick={async () => { await copy(abs); toast.success('Stream link copied', { description: 'Paste it into any player’s “open URL”.' }) }}>
        <Link2 className="size-3.5" /> Copy link
      </button>
    </div>
  )
}
