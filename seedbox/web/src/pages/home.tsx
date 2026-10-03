import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { WideProgress } from '@/components/wide-progress'
import { RemoveTorrent } from '@/components/remove-torrent'
import { addMany } from '@/components/add-torrent'
import { api, bytes, duration, fileLink, isImage, isMedia, isVideo, mainFile, speed, type Torrent } from '@/lib/api'
import { absolute, copy, openInApp, platform, preferredPlayer } from '@/lib/links'
import { useApp } from '@/lib/app-context'

const LIMIT = 5
const isTorrentLink = (s: string) => /^magnet:\?/i.test(s) || /^[a-f0-9]{40}$/i.test(s) || /^https?:\/\/\S+\.torrent(\?\S*)?$/i.test(s)

function PasteBox() {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Starts downloading immediately; no extra "Add" step.
  const start = async (items: (string | File)[]) => {
    if (!items.length) return
    setBusy(true)
    await addMany(items)
    setBusy(false)
    setValue('')
  }

  const links = (text: string) => text.split(/\s+/).map(s => s.trim()).filter(isTorrentLink)

  const fromClipboard = async () => {
    try {
      const found = links(await navigator.clipboard.readText())
      if (found.length) start(found)
      else toast('No torrent link in clipboard')
    } catch {
      toast('Clipboard blocked. Long-press the box and paste.')
    }
  }

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          const found = links(value)
          if (found.length) start(found)
          else if (value.trim()) toast.error('That doesn’t look like a magnet link')
        }}
      >
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          onPaste={e => {
            const found = links(e.clipboardData.getData('text'))
            if (found.length) { e.preventDefault(); start(found) }
          }}
          placeholder="Paste magnet link"
          className="h-14 text-base"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          disabled={busy}
        />
        <Button type="button" className="h-14 px-5 text-base" onClick={fromClipboard} disabled={busy}>
          {busy ? <Spinner /> : 'Paste'}
        </Button>
      </form>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Downloads start as soon as you paste.</span>
        <button className="underline underline-offset-4 hover:text-foreground" onClick={() => fileRef.current?.click()}>
          Use .torrent file
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".torrent,application/x-bittorrent"
        multiple
        hidden
        onChange={e => { start(Array.from(e.target.files || [])); e.target.value = '' }}
      />
    </div>
  )
}

function Row({ t, onOpen }: { t: Torrent; onOpen: (hash: string) => void }) {
  const { prefs, play } = useApp()
  const [confirm, setConfirm] = useState(false)
  const f = mainFile(t)
  const pct = t.progress * 100
  const link = f ? fileLink(t, f) : ''
  const playable = !!f && (isMedia(f.name) || isImage(f.name))

  const onPlay = () => {
    if (!f) return
    if (isVideo(f.name) && prefs.autoOpen && platform() !== 'desktop') openInApp(preferredPlayer(prefs), link, f.name)
    else play({ url: link, name: f.name })
  }

  const right = t.paused ? 'Paused'
    : t.done ? bytes(t.length)
      : !t.ready ? 'Finding peers'
        : `${speed(t.downloadSpeed)} · ${duration(t.timeRemaining)}`

  return (
    <Card className="gap-3 p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate pt-1 text-[15px] font-medium" title={t.name}>{t.name}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="-mr-1 -mt-1 font-mono" aria-label="Menu">···</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => onOpen(t.infoHash)}>All files</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => api.action(t.infoHash, t.paused ? 'resume' : 'pause')}>{t.paused ? 'Resume' : 'Pause'}</DropdownMenuItem>
            <DropdownMenuItem onSelect={async () => { await copy(t.magnet); toast.success('Magnet link copied') }}>Copy magnet</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <WideProgress size="md" value={pct} left={t.done ? 'Done' : `${pct.toFixed(1)}%`} right={right} muted={t.paused} />

      <div className="grid grid-cols-3 gap-2">
        <Button className="h-11" disabled={!playable} onClick={onPlay}>Play</Button>
        <Button variant="outline" className="h-11" disabled={!f} onClick={async () => { await copy(absolute(link)); toast.success('Link copied') }}>Copy</Button>
        <Button variant="outline" className="h-11" disabled={!f} asChild={!!f}>
          {f ? <a href={absolute(link, true)} download>Download</a> : <span>Download</span>}
        </Button>
      </div>

      <RemoveTorrent t={t} open={confirm} onOpenChange={setConfirm} />
    </Card>
  )
}

export function HomePage({ torrents, loading, onOpen, onViewAll }: {
  torrents: Torrent[]; loading: boolean; onOpen: (hash: string) => void; onViewAll: () => void
}) {
  const shown = torrents.slice(0, LIMIT)
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PasteBox />

      {loading && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}

      {!loading && torrents.length === 0 && (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyTitle>Nothing yet</EmptyTitle>
            <EmptyDescription>Paste a magnet link above. It starts downloading right away.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="space-y-3">
        {shown.map(t => <Row key={t.infoHash} t={t} onOpen={onOpen} />)}
      </div>

      {torrents.length > 0 && (
        <Button variant="outline" className="h-12 w-full text-base" onClick={onViewAll}>
          View all{torrents.length > LIMIT ? ` (${torrents.length})` : ''} with full stats
        </Button>
      )}
    </div>
  )
}
