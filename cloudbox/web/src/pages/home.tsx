import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { WideProgress } from '@/components/wide-progress'
import { api, bytes, duration, isImage, isMedia, isVideo, speed, type Entry, type Job } from '@/lib/api'
import { absolute, copy, openInApp, platform, preferredPlayer } from '@/lib/links'
import { useApp } from '@/lib/app-context'

const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s)

function PasteBox({ onAdded }: { onAdded: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  // Starts copying immediately; no extra "Add" step.
  const start = async (text: string) => {
    const links = text.split(/\s+/).map(s => s.trim()).filter(isLink)
    if (!links.length) return toast.error('Paste a direct download link (https://…)')
    setBusy(true)
    for (const l of links) {
      try {
        const job = await api.add(l)
        toast.success('Copying to your cloud', { description: job.name })
      } catch (e) {
        toast.error('Couldn’t add that link', { description: (e as Error).message })
      }
    }
    setBusy(false)
    setValue('')
    onAdded()
  }

  const fromClipboard = async () => {
    try { await start(await navigator.clipboard.readText()) } catch { toast('Clipboard blocked. Long-press the box and paste.') }
  }

  return (
    <div className="space-y-2">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); start(value) }}>
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          onPaste={e => {
            const text = e.clipboardData.getData('text')
            if (text.split(/\s+/).some(isLink)) { e.preventDefault(); start(text) }
          }}
          placeholder="Paste download link"
          className="h-14 text-base"
          inputMode="url"
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
      <p className="text-xs text-muted-foreground">Copies straight into your Cloudflare storage. Keeps going even if you close the app.</p>
    </div>
  )
}

function JobRow({ job, onChange }: { job: Job; onChange: () => void }) {
  const pct = job.size > 0 ? (job.copied / job.size) * 100 : 0
  const left = job.bps && job.size > 0 ? ((job.size - job.copied) / job.bps) * 1000 : null
  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); if (msg) toast(msg); onChange() } catch (e) { toast.error((e as Error).message) }
  }
  const right = job.status === 'paused' ? 'Paused'
    : job.status === 'queued' ? 'Starting…'
      : job.status === 'error' ? 'Failed'
        : `${job.bps ? speed(job.bps) : '…'} · ${duration(left)}`

  return (
    <Card className="gap-3 p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate pt-1 text-[15px] font-medium" title={job.name}>{job.name}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="-mr-1 -mt-1 font-mono" aria-label="Menu">···</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {job.status === 'paused' && <DropdownMenuItem onSelect={() => act(() => api.jobAction(job.id, 'resume'))}>Resume</DropdownMenuItem>}
            {(job.status === 'copying' || job.status === 'queued') && <DropdownMenuItem onSelect={() => act(() => api.jobAction(job.id, 'pause'))}>Pause</DropdownMenuItem>}
            {job.status === 'error' && <DropdownMenuItem onSelect={() => act(() => api.jobAction(job.id, 'retry'))}>Retry</DropdownMenuItem>}
            <DropdownMenuItem onSelect={async () => { await copy(job.url); toast.success('Source link copied') }}>Copy source link</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => act(() => api.removeJob(job.id), 'Cancelled')}>Cancel</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <WideProgress size="md" value={pct} left={`${pct.toFixed(1)}%`} right={right} muted={job.status === 'paused'} />
      <div className="flex items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>{bytes(job.copied)} / {job.size > 0 ? bytes(job.size) : '?'}</span>
        {job.error && <span className="truncate pl-3 text-destructive">{job.error}</span>}
      </div>
    </Card>
  )
}

function FileRow({ f }: { f: Entry }) {
  const { prefs, play } = useApp()
  const url = f.url!
  const playable = isMedia(f.name) || isImage(f.name)
  const onPlay = () => {
    if (isVideo(f.name) && prefs.autoOpen && platform() !== 'desktop') openInApp(preferredPlayer(prefs), url, f.name)
    else play({ url, name: f.name })
  }
  return (
    <Card className="gap-3 p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[15px] font-medium" title={f.name}>{f.name}</p>
        <Badge variant="outline" className="shrink-0 font-mono">{bytes(f.size)}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button className="h-11" disabled={!playable} onClick={onPlay}>Play</Button>
        <Button variant="outline" className="h-11" onClick={async () => { await copy(absolute(url)); toast.success('Link copied') }}>Copy</Button>
        <Button variant="outline" className="h-11" asChild><a href={absolute(url, true)} download>Download</a></Button>
      </div>
    </Card>
  )
}

export function HomePage({ jobs, refresh, onViewAll }: { jobs: Job[] | null; refresh: () => void; onViewAll: () => void }) {
  const [files, setFiles] = useState<Entry[] | null>(null)
  const doneCount = jobs?.filter(j => j.status === 'done').length ?? 0

  // Reload recent files whenever a copy finishes.
  useEffect(() => {
    api.files('').then(r => setFiles(r.entries.filter(e => !e.isDir).sort((a, b) => b.mtime - a.mtime))).catch(() => setFiles([]))
  }, [doneCount])

  const working = jobs?.filter(j => j.status !== 'done') ?? []
  const recent = files?.slice(0, 5) ?? []

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PasteBox onAdded={refresh} />

      {working.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Copying</h2>
          {working.map(j => <JobRow key={j.id} job={j} onChange={refresh} />)}
        </section>
      )}

      {(jobs === null || files === null) && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}

      {files && files.length === 0 && working.length === 0 && (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyTitle>Nothing yet</EmptyTitle>
            <EmptyDescription>Paste a direct download link above. It’s copied to your cloud right away.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Latest files</h2>
          {recent.map(f => <FileRow key={f.path} f={f} />)}
          <Button variant="outline" className="h-12 w-full text-base" onClick={onViewAll}>
            View all files{files!.length > 5 ? ` (${files!.length})` : ''}
          </Button>
        </section>
      )}
    </div>
  )
}
