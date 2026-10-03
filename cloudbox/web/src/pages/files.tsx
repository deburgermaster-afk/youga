import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FileRow } from '@/components/file-row'
import { api, bytes, type Entry } from '@/lib/api'

type Source = 'torbox' | 'cloud'

export function FilesPage() {
  const [source, setSource] = useState<Source>('torbox')
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [usage, setUsage] = useState<{ bytes: number; count: number } | null>(null)
  const [del, setDel] = useState<Entry | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async (p: string) => {
    try {
      setEntries(source === 'torbox'
        ? (await api.torboxFiles()).entries.sort((a, b) => b.mtime - a.mtime)
        : (await api.files(p ? p + '/' : '')).entries.map(e => ({ ...e, source: 'cloud' as const })))
    } catch (e) {
      toast.error((e as Error).message)
      setEntries([])
    }
  }, [source])

  useEffect(() => { load(path) }, [path, load])
  useEffect(() => { api.usage().then(setUsage).catch(() => {}) }, [entries])

  const go = (p: string) => { setEntries(null); setQ(''); setPath(p.replace(/\/$/, '')) }

  const remove = async () => {
    if (!del) return
    try {
      await (del.source === 'torbox' ? api.torboxDelete(del.torrentId!) : api.removeFile(del.path))
      toast.success('Deleted', { description: del.name })
      load(path)
    } catch (e) { toast.error((e as Error).message) }
    setDel(null)
  }

  const crumbs = path ? path.split('/') : []
  const shown = entries?.filter(e => !q || e.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <ToggleGroup type="single" variant="outline" value={source} onValueChange={v => { if (v) { setSource(v as Source); setEntries(null); setPath(''); setQ('') } }} className="w-full">
        <ToggleGroupItem value="torbox" className="h-11 flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">TorBox</ToggleGroupItem>
        <ToggleGroupItem value="cloud" className="h-11 flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Cloud</ToggleGroupItem>
      </ToggleGroup>

      {source === 'cloud' && <Card className="gap-1 py-4">
        <CardHeader className="px-4">
          <CardTitle>Your cloud</CardTitle>
          <CardDescription className="font-mono tabular-nums">
            {usage ? `${bytes(usage.bytes)} in ${usage.count} file${usage.count === 1 ? '' : 's'} · first 10 GB free` : 'Loading…'}
          </CardDescription>
        </CardHeader>
      </Card>}

      <div className="flex items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search this folder" className="h-11" type="search" />
        <Button variant="outline" className="h-11 px-4" onClick={() => load(path)}>Refresh</Button>
      </div>

      {crumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList className="text-sm">
            <BreadcrumbItem><BreadcrumbLink asChild><button onClick={() => go('')}>All files</button></BreadcrumbLink></BreadcrumbItem>
            {crumbs.map((c, i) => (
              <span key={i} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem className="max-w-[60vw]">
                  {i === crumbs.length - 1
                    ? <BreadcrumbPage className="truncate">{c}</BreadcrumbPage>
                    : <BreadcrumbLink asChild><button className="truncate" onClick={() => go(crumbs.slice(0, i + 1).join('/'))}>{c}</button></BreadcrumbLink>}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {!entries && <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>}

      {shown?.length === 0 && (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyTitle>No files</EmptyTitle>
            <EmptyDescription>{source === 'torbox' ? 'Finished torrents show up here.' : 'Files saved to Cloudflare show up here.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <ItemGroup className="gap-2">
        {shown?.map(e => e.isDir ? (
          <Item key={e.path} variant="outline" className="animate-in fade-in-0 duration-200">
            <button className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" onClick={() => go(e.path)}>
              <ItemTitle className="break-all">{e.name}/</ItemTitle>
              <ItemDescription>Folder</ItemDescription>
            </button>
            <ItemActions>
              <Button size="sm" variant="outline" onClick={() => go(e.path)}>Open</Button>
            </ItemActions>
          </Item>
        ) : (
          <FileRow key={e.path} f={e} onDelete={() => setDel(e)} />
        ))}
      </ItemGroup>

      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{del?.source === 'torbox' ? 'Remove from TorBox?' : 'Delete from your cloud?'}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {del?.source === 'torbox'
                ? `This removes the whole torrent “${del?.torrentName}” and all its files from TorBox.`
                : `${del?.name} (${bytes(del?.size ?? 0)}) will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
