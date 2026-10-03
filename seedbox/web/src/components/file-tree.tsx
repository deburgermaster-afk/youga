import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, File, FileAudio, FileImage, FileVideo, Folder, FolderOpen } from 'lucide-react'
import { bytes, isAudio, isImage, isVideo, type TFile } from '@/lib/api'
import { FileActions } from '@/components/file-actions'
import { cn } from '@/lib/utils'

type Node = { name: string; path: string; children: Map<string, Node>; file?: TFile; size: number; done: number }

function build(files: TFile[], root: string): Node {
  const tree: Node = { name: '', path: '', children: new Map(), size: 0, done: 0 }
  for (const f of files) {
    let parts = f.path.split(/[\\/]/)
    if (parts.length > 1 && parts[0] === root) parts = parts.slice(1)
    let node = tree
    parts.forEach((part, i) => {
      node.size += f.length
      node.done += f.length * f.progress
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: parts.slice(0, i + 1).join('/'), children: new Map(), size: 0, done: 0 })
      }
      node = node.children.get(part)!
    })
    node.file = f
    node.size = f.length
    node.done = f.length * f.progress
  }
  return tree
}

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const Icon = isVideo(name) ? FileVideo : isAudio(name) ? FileAudio : isImage(name) ? FileImage : File
  const color = isVideo(name) ? 'text-cyan-400' : isAudio(name) ? 'text-fuchsia-400' : isImage(name) ? 'text-amber-400' : 'text-muted-foreground'
  return <Icon className={cn('size-4 shrink-0', color, className)} />
}

function sorted(n: Node) {
  return [...n.children.values()].sort((a, b) => (Number(!!a.file) - Number(!!b.file)) || a.name.localeCompare(b.name, undefined, { numeric: true }))
}

function Row({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const pct = node.size ? node.done / node.size : 0

  if (node.file) {
    const f = node.file
    return (
      <div className="group flex items-center gap-2 rounded-md py-1.5 pr-1 hover:bg-white/5" style={{ paddingLeft: depth * 16 + 22 }}>
        <FileIcon name={f.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{node.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{bytes(f.length)}</span>
            {f.progress < 1 && (
              <>
                <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full bg-cyan-400 transition-[width] duration-700" style={{ width: `${f.progress * 100}%` }} />
                </span>
                <span className="tabular-nums">{(f.progress * 100).toFixed(0)}%</span>
              </>
            )}
          </div>
        </div>
        <FileActions url={f.url} name={f.name} compact />
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left hover:bg-white/5"
        style={{ paddingLeft: depth * 16 }}
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
          <ChevronRight className="size-4 text-muted-foreground" />
        </motion.span>
        {open ? <FolderOpen className="size-4 text-amber-300" /> : <Folder className="size-4 text-amber-300" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{bytes(node.size)}{pct < 1 && ` · ${(pct * 100).toFixed(0)}%`}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="overflow-hidden"
          >
            {sorted(node).map(c => <Row key={c.path} node={c} depth={depth + 1} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function FileTree({ files, root }: { files: TFile[]; root: string }) {
  const tree = useMemo(() => build(files, root), [files, root])
  return <div className="space-y-0.5">{sorted(tree).map(c => <Row key={c.path} node={c} depth={0} />)}</div>
}
