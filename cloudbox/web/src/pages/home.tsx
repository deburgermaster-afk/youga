import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pause, Play, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { WideProgress } from '@/components/wide-progress'
import { FileRow } from '@/components/file-row'
import { api, bytes, duration, speed, type Entry, type Job } from '@/lib/api'

const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s) || /^magnet:\?\S+$/i.test(s) || /^[a-f0-9]{40}$/i.test(s)

function PasteBox({ onAdded }: { onAdded: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  // Starts copying immediately; no extra "Add" step.
  const start = async (text: string) => {
    const links = text.split(/\s+/).map(s => s.trim()).filter(isLink)
    if (!links.length) return toast.error('Paste a magnet link or a direct download link')
    setBusy(true)
    for (const l of links) {
      try {
        const job = await api.add(l)
        toast.success(job.kind === 'magnet' ? 'Torrent added' : 'Copying to your cloud', { description: job.name })
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
          placeholder="Paste magnet or download link"
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
      <p className="text-xs text-muted-foreground">Starts right away and keeps going after you close the app. Magnet links use TorBox (set it up in Settings).</p>
    </div>
  )
}

// A small labeled stat; values are green so live numbers stand out.
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-white/[0.03] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-[13px] font-semibold tabular-nums text-emerald-400">{value}</div>
    </div>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function JobRow({ job, onChange }: { job: Job; onChange: () => void }) {
  const remote = job.status === 'remote' || (job.kind === 'magnet' && job.status !== 'done')
  const running = job.status === 'copying' || job.status === 'remote' || job.status === 'queued'
  const now = useNow(running)
  const rs = job.remoteStats
  const pct = remote ? (job.remoteProgress ?? 0) * 100 : job.size > 0 ? (job.copied / job.size) * 100 : 0
  const elapsed = now - (job.startedAt || job.createdAt)
  const avg = !remote && job.copied > 0 ? job.copied / Math.max(1, elapsed / 1000) : 0
  const down = remote ? rs?.down || 0 : job.bps || 0
  const eta = remote ? (rs?.eta ? rs.eta * 1000 : null) : job.bps && job.size > 0 ? ((job.size - job.copied) / job.bps) * 1000 : null
  const totalParts = job.size > 0 ? Math.max(1, Math.ceil(job.size / (100 * 1024 * 1024))) : 0
  const host = (() => { try { return job.url && !job.url.startsWith('magnet:') ? new URL(job.url).host : 'TorBox' } catch { return '—' } })()

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); if (msg) toast(msg); onChange() } catch (e) { toast.error((e as Error).message) }
  }
  const right = job.status === 'paused' ? 'Paused'
    : job.status === 'error' ? 'Failed'
      : job.status === 'queued' ? 'Starting…'
        : remote ? (job.remoteState || 'Starting…')
          : eta ? `${duration(eta)} left` : `Part ${Math.min(totalParts, Math.floor(job.copied / (100 * 1024 * 1024)) + 1)}/${totalParts} in progress`

  return (
    <Card className="gap-2.5 p-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium" title={job.name}>{job.name}</p>
          <p className="text-[11px] text-muted-foreground">{remote ? 'Step 1 of 2 · TorBox downloading' : 'Copying to cloud'}</p>
        </div>
        {job.status === 'paused'
          ? <Button size="icon" variant="ghost" aria-label="Resume" onClick={() => act(() => api.jobAction(job.id, 'resume'))}><Play /></Button>
          : job.status === 'error'
            ? <Button size="icon" variant="ghost" aria-label="Retry" onClick={() => act(() => api.jobAction(job.id, 'retry'))}><RotateCw /></Button>
            : <Button size="icon" variant="ghost" aria-label="Pause" onClick={() => act(() => api.jobAction(job.id, 'pause'))}><Pause /></Button>}
        <Button size="icon" variant="ghost" aria-label="Cancel" className="hover:text-destructive" onClick={() => act(() => api.removeJob(job.id), 'Cancelled')}><X /></Button>
      </div>

      <WideProgress size="md" tone="blue" value={pct} left={`${pct.toFixed(1)}%`} right={right} muted={job.status === 'paused'} />

      {job.error
        ? <p className="text-xs text-destructive">{job.error}</p>
        : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            <Stat label="↓ Down" value={speed(down)} />
            <Stat label={remote ? '↑ Up' : '↑ To cloud'} value={speed(remote ? rs?.up || 0 : job.bps || 0)} />
            <Stat label="ETA" value={duration(eta)} />
            {remote ? (
              <>
                <Stat label="Seeds" value={rs?.seeds ?? 0} />
                <Stat label="Peers" value={rs?.peers ?? 0} />
                <Stat label="Size" value={job.size > 0 ? bytes(job.size) : '…'} />
              </>
            ) : (
              <>
                <Stat label="Done" value={`${bytes(job.copied)} / ${job.size > 0 ? bytes(job.size) : '?'}`} />
                <Stat label="Avg" value={speed(avg)} />
                <Stat label="Part" value={totalParts ? `${Math.min(totalParts, Math.floor(job.copied / (100 * 1024 * 1024)) + 1)}/${totalParts}` : '—'} />
              </>
            )}
          </div>
        )}
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">{host}</span>
        <span>{duration(elapsed)} elapsed</span>
      </div>
    </Card>
  )
}

export function HomePage({ jobs, refresh }: { jobs: Job[] | null; refresh: () => void }) {
  const [files, setFiles] = useState<Entry[] | null>(null)
  const doneCount = jobs?.filter(j => j.status === 'done').length ?? 0

  // Reload recent files whenever a copy finishes.
  useEffect(() => {
    Promise.all([
      api.torboxFiles().then(r => r.entries).catch(() => [] as Entry[]),
      api.files('').then(r => r.entries.filter(e => !e.isDir).map(e => ({ ...e, source: 'cloud' as const }))).catch(() => [] as Entry[]),
    ]).then(([tb, cloud]) => setFiles([...tb, ...cloud].sort((a, b) => b.mtime - a.mtime)))
  }, [doneCount])

  const working = jobs?.filter(j => j.status !== 'done') ?? []
  const recent = files?.slice(0, 12) ?? []

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
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Latest files</h2>
          {recent.map(f => <FileRow key={f.path} f={f} siblings={files!} />)}
        </section>
      )}
    </div>
  )
}
