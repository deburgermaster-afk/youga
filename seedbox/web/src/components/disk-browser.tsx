import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Folder, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { api, bytes, type DiskEntry } from '@/lib/api'
import { FileActions } from '@/components/file-actions'
import { FileIcon } from '@/components/file-tree'

export function DiskBrowser() {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<DiskEntry[] | null>(null)
  const [del, setDel] = useState<DiskEntry | null>(null)

  const load = useCallback(async (p: string) => {
    try {
      const r = await api.disk(p)
      setEntries(r.entries)
    } catch (e) {
      toast.error((e as Error).message)
      setEntries([])
    }
  }, [])

  useEffect(() => { load(path) }, [path, load])

  const crumbs = path ? path.split('/') : []

  const remove = async () => {
    if (!del) return
    try {
      await api.diskDelete(del.path)
      toast.success('Deleted', { description: del.name })
      load(path)
    } catch (e) { toast.error((e as Error).message) }
    setDel(null)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 text-sm">
        <Button size="sm" variant="ghost" onClick={() => setPath('')}><HardDrive /> Server</Button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <Button size="sm" variant="ghost" className="max-w-[40vw] truncate" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))}>{c}</Button>
          </span>
        ))}
        <Button size="icon-sm" variant="ghost" className="ml-auto shrink-0" onClick={() => load(path)} aria-label="Refresh"><RefreshCw /></Button>
      </div>

      <div className="p-2">
        {!entries && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="my-2 h-10 w-full" />)}
        {entries?.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
        <AnimatePresence mode="popLayout">
          {entries?.map((e, i) => (
            <motion.div
              key={e.path}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0, transition: { delay: Math.min(i * 0.02, 0.3) } }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5"
            >
              {e.isDir
                ? <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setPath(e.path)}>
                    <Folder className="size-5 shrink-0 text-amber-300" />
                    <span className="truncate text-sm font-medium">{e.name}</span>
                  </button>
                : <div className="flex min-w-0 flex-1 items-center gap-3">
                    <FileIcon name={e.name} className="size-5" />
                    <span className="truncate text-sm">{e.name}</span>
                  </div>}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{bytes(e.size)}</span>
              {e.url && <FileActions url={e.url} name={e.name} compact />}
              <Button size="icon-sm" variant="ghost" className="shrink-0 hover:text-destructive" onClick={() => setDel(e)} aria-label="Delete"><Trash2 /></Button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Dialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete from server?</DialogTitle>
            <DialogDescription className="break-all">{del?.name} ({bytes(del?.size || 0)}) will be permanently deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={remove}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
