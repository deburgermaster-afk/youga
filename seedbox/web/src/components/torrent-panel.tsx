import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Panel } from '@/components/panel'
import { FileMenu } from '@/components/file-menu'
import { WideProgress } from '@/components/wide-progress'
import { RemoveTorrent } from '@/components/remove-torrent'
import { CloudBadge, statusOf, uploadToCloud } from '@/components/torrent-item'
import { useApp } from '@/lib/app-context'
import { api, bytes, duration, ext, speed, type TFile, type Torrent } from '@/lib/api'
import { absolute, copy } from '@/lib/links'
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

const sorted = (n: Node) =>
  [...n.children.values()].sort((a, b) => (Number(!!a.file) - Number(!!b.file)) || a.name.localeCompare(b.name, undefined, { numeric: true }))

function FileRow({ f, name }: { f: TFile; name: string }) {
  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="min-w-0 basis-full sm:basis-0">
        <ItemTitle className="break-all leading-snug">{name}</ItemTitle>
        <ItemDescription className="flex items-center gap-2 font-mono text-xs tabular-nums">
          <Badge variant="outline" className="font-mono">{ext(f.name)}</Badge>
          {bytes(f.length)}
        </ItemDescription>
        {f.progress < 1 && <WideProgress className="mt-2" size="sm" value={f.progress * 100} left={`${(f.progress * 100).toFixed(0)}%`} />}
      </ItemContent>
      <ItemActions className="ml-auto">
        <FileMenu url={f.url} name={f.name} />
      </ItemActions>
    </Item>
  )
}

function Folder({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth === 0)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="secondary" className="h-11 w-full justify-between px-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="w-3 font-mono text-muted-foreground">{open ? '−' : '+'}</span>
            <span className="truncate font-medium">{node.name}</span>
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {bytes(node.size)}{node.done < node.size && ` · ${((node.done / node.size) * 100).toFixed(0)}%`}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-l pl-3 data-open:animate-in data-open:fade-in-0">
        <Tree node={node} depth={depth + 1} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function Tree({ node, depth }: { node: Node; depth: number }) {
  return (
    <ItemGroup className="gap-2">
      {sorted(node).map(c => (c.file ? <FileRow key={c.path} f={c.file} name={c.name} /> : <Folder key={c.path} node={c} depth={depth} />))}
    </ItemGroup>
  )
}

export function TorrentPanel({ t, onClose }: { t: Torrent | null; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const { cloudEnabled } = useApp()
  const tree = useMemo(() => (t ? build(t.files, t.name) : null), [t])
  const pct = (t?.progress ?? 0) * 100

  const rows: [string, React.ReactNode][] = t ? [
    ['Status', statusOf(t)],
    ['Size', bytes(t.length)],
    ['Downloaded', bytes(t.downloaded)],
    ['Uploaded', bytes(t.uploaded)],
    ['Ratio', (t.ratio || 0).toFixed(2)],
    ['Download speed', speed(t.downloadSpeed)],
    ['Upload speed', speed(t.uploadSpeed)],
    ['Peers', t.peers],
    ['Time left', t.done ? 'Done' : duration(t.timeRemaining)],
    ['Added', t.addedAt ? new Date(t.addedAt).toLocaleString() : '—'],
    ['Info hash', <span className="break-all">{t.infoHash}</span>],
  ] : []

  return (
    <>
      <Panel
        open={!!t}
        onOpenChange={o => !o && onClose()}
        title={t?.name ?? ''}
        description={t ? `${bytes(t.length)} · ${t.files.length} files` : undefined}
        footer={t && (
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={async () => { await copy(t.magnet); toast.success('Magnet link copied') }}>Copy magnet</Button>
            <Button variant="outline" className="h-11" onClick={async () => {
              await copy(t.files.map(f => absolute(f.url)).join('\n'))
              toast.success(`${t.files.length} links copied`)
            }} disabled={!t.files.length}>Copy all links</Button>
            <Button variant="outline" className="h-11" asChild disabled={!t.files.length}>
              <a href={absolute(`/api/torrents/${t.infoHash}/playlist.m3u`)}>M3U playlist</a>
            </Button>
            <Button variant="destructive" className="h-11" onClick={() => setConfirm(true)}>Remove</Button>
          </div>
        )}
      >
        {t && (
          <div className="space-y-4">
            <WideProgress value={pct} left={`${pct.toFixed(1)}%`} right={t.done ? 'Complete' : `${speed(t.downloadSpeed)} · ${duration(t.timeRemaining)}`} muted={t.paused} />
            {t.cloud && t.cloud.status !== 'done' && (
              <WideProgress size="md" value={t.cloud.progress * 100} left={`Cloud ${(t.cloud.progress * 100).toFixed(0)}%`} right={t.cloud.status === 'error' ? 'Failed' : t.cloud.status === 'queued' ? 'Queued' : 'Uploading'} />
            )}
            <div className="flex flex-wrap items-center gap-2"><CloudBadge t={t} /></div>
            <div className="grid grid-cols-2 gap-2">
              {cloudEnabled && t.done && (
                <Button className="col-span-2 h-11" onClick={() => uploadToCloud(t)} disabled={t.cloud?.status === 'uploading' || t.cloud?.status === 'queued'}>
                  {t.cloud?.status === 'done' ? 'Upload to cloud again' : 'Upload to cloud'}
                </Button>
              )}
              <Button variant="outline" className="h-11" onClick={() => api.action(t.infoHash, t.paused ? 'resume' : 'pause')}>{t.paused ? 'Resume' : 'Pause'}</Button>
              <Button variant="outline" className="h-11" onClick={async () => { await copy(t.infoHash); toast.success('Info hash copied') }}>Copy hash</Button>
            </div>
            <Tabs defaultValue="files">
              <TabsList className="w-full">
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
              </TabsList>
              <TabsContent value="files" className="mt-3">
                {tree && t.files.length
                  ? <Tree node={tree} depth={0} />
                  : <p className="py-8 text-center text-sm text-muted-foreground">Waiting for file list from peers…</p>}
              </TabsContent>
              <TabsContent value="info" className="mt-3">
                <Table>
                  <TableBody>
                    {rows.map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell className="w-36 text-muted-foreground">{k}</TableCell>
                        <TableCell className={cn('whitespace-normal font-mono text-xs tabular-nums')}>{v}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </Panel>
      <RemoveTorrent t={t} open={confirm} onOpenChange={setConfirm} onDone={onClose} />
    </>
  )
}
