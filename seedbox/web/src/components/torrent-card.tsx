import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, ChevronDown, Clock, Copy, ListMusic, Magnet, Pause, Play, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { api, bytes, duration, speed, type Torrent } from '@/lib/api'
import { absolute, copy } from '@/lib/links'
import { FileTree } from '@/components/file-tree'
import { cn } from '@/lib/utils'

function Status({ t }: { t: Torrent }) {
  if (t.paused) return <Badge variant="secondary">Paused</Badge>
  if (!t.ready) return <Badge variant="outline" className="border-amber-400/40 text-amber-300">Finding peers</Badge>
  if (t.done) return <Badge className="bg-emerald-500/15 text-emerald-300">Seeding</Badge>
  return <Badge className="bg-cyan-500/15 text-cyan-300">Downloading</Badge>
}

export function TorrentCard({ t }: { t: Torrent }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const pct = t.progress * 100
  const active = !t.paused && !t.done && t.ready

  const toggle = async () => {
    try { await api.action(t.infoHash, t.paused ? 'resume' : 'pause') } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (files: boolean) => {
    setConfirm(false)
    try {
      await api.remove(t.infoHash, files)
      toast.success(files ? 'Removed torrent and files' : 'Removed torrent (files kept)')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 shadow-xl shadow-black/20 backdrop-blur-xl"
    >
      {active && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-y-0 w-1/2 animate-[shimmer_2.5s_linear_infinite] bg-gradient-to-r from-transparent via-cyan-400/5 to-transparent" />
        </div>
      )}
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          <button onClick={() => setOpen(o => !o)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <Status t={t} />
              <span className="text-xs tabular-nums text-muted-foreground">{bytes(t.length)}</span>
            </div>
            <h3 className="mt-1.5 line-clamp-2 break-all font-medium leading-snug">{t.name}</h3>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label={t.paused ? 'Resume' : 'Pause'}>
              {t.paused ? <Play /> : <Pause />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setConfirm(true)} aria-label="Remove" className="hover:text-destructive">
              <Trash2 />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setOpen(o => !o)} aria-label="Files">
              <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown /></motion.span>
            </Button>
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={cn('h-full rounded-full bg-gradient-to-r', t.done ? 'from-emerald-400 to-teal-400' : 'from-cyan-400 via-blue-500 to-violet-500')}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 20 }}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{pct.toFixed(1)}%</span>
          <span className="flex items-center gap-1"><ArrowDown className="size-3 text-cyan-400" />{speed(t.downloadSpeed)}</span>
          <span className="flex items-center gap-1"><ArrowUp className="size-3 text-violet-400" />{speed(t.uploadSpeed)}</span>
          <span className="flex items-center gap-1"><Users className="size-3" />{t.peers}</span>
          {!t.done && <span className="flex items-center gap-1"><Clock className="size-3" />{duration(t.timeRemaining)}</span>}
          <span>{bytes(t.downloaded)} / {bytes(t.length)}</span>
          <span>ratio {t.ratio.toFixed(2)}</span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="relative overflow-hidden border-t border-white/10"
          >
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              <Button size="xs" variant="outline" onClick={async () => { await copy(t.magnet); toast.success('Magnet copied') }}>
                <Magnet /> Copy magnet
              </Button>
              {t.files.length > 0 && (
                <Button size="xs" variant="outline" asChild>
                  <a href={absolute(`/api/torrents/${t.infoHash}/playlist.m3u`)}><ListMusic /> M3U playlist</a>
                </Button>
              )}
              {t.files.length > 0 && (
                <Button size="xs" variant="outline" onClick={async () => {
                  await copy(t.files.map(f => absolute(f.url)).join('\n'))
                  toast.success(`${t.files.length} links copied`)
                }}>
                  <Copy /> Copy all links
                </Button>
              )}
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2 sm:p-3">
              {t.files.length
                ? <FileTree files={t.files} root={t.name} />
                : <p className="p-4 text-center text-sm text-muted-foreground">Waiting for metadata from peers…</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove torrent?</DialogTitle>
            <DialogDescription className="break-all">{t.name}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => remove(false)}>Keep files</Button>
            <Button variant="destructive" onClick={() => remove(true)}>Delete files too</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
