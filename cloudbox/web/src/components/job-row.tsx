import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pause, Play, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WideProgress } from '@/components/wide-progress'
import { api, bytes, duration, speed, type Job } from '@/lib/api'

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

export function JobRow({ job, onChange }: { job: Job; onChange: () => void }) {
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

