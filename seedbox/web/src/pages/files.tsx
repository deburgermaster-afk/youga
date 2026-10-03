import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { FileMenu } from '@/components/file-menu'
import { WideProgress } from '@/components/wide-progress'
import { api, bytes, ext, type DiskEntry, type Stats } from '@/lib/api'

export function FilesPage({ stats }: { stats?: Stats }) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<DiskEntry[] | null>(null)
  const [del, setDel] = useState<DiskEntry | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(async (p: string) => {
    try {
      setEntries((await api.disk(p)).entries)
    } catch (e) {
      toast.error((e as Error).message)
      setEntries([])
    }
  }, [])

  useEffect(() => {
    load(path)
    const id = setInterval(() => load(path), 5000)
    return () => clearInterval(id)
  }, [path, load])

  const go = (p: string) => { setEntries(null); setQ(''); setPath(p) }

  const remove = async () => {
    if (!del) return
    try {
      await api.diskDelete(del.path)
      toast.success('Deleted', { description: del.name })
      load(path)
    } catch (e) { toast.error((e as Error).message) }
    setDel(null)
  }

  const crumbs = path ? path.split('/') : []
  const used = stats ? stats.disk.total - stats.disk.free : 0
  const pct = stats?.disk.total ? (used / stats.disk.total) * 100 : 0
  const shown = entries?.filter(e => !q || e.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="space-y-4">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Storage</CardTitle>
          <CardDescription className="font-mono tabular-nums">{bytes(used)} used of {bytes(stats?.disk.total ?? 0)} · {bytes(stats?.disk.free ?? 0)} free</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <WideProgress value={pct} size="md" left={`${pct.toFixed(0)}% used`} right={`${bytes(stats?.disk.free ?? 0)} free`} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter this folder" className="h-11" type="search" />
        <Button variant="outline" className="h-11 px-4" onClick={() => load(path)}>Refresh</Button>
      </div>

      <Breadcrumb>
        <BreadcrumbList className="text-sm">
          <BreadcrumbItem>
            {crumbs.length ? <BreadcrumbLink asChild><button onClick={() => go('')}>All files</button></BreadcrumbLink> : <BreadcrumbPage>All files</BreadcrumbPage>}
          </BreadcrumbItem>
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

      {!entries && <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>}

      {shown?.length === 0 && (
        <Empty className="border border-dashed py-14">
          <EmptyHeader>
            <EmptyTitle>Empty</EmptyTitle>
            <EmptyDescription>Finished downloads show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <ItemGroup className="gap-2">
        {path && (
          <Item variant="outline" asChild>
            <button onClick={() => go(crumbs.slice(0, -1).join('/'))} className="text-left">
              <ItemContent><ItemTitle>..</ItemTitle><ItemDescription>Up one folder</ItemDescription></ItemContent>
            </button>
          </Item>
        )}
        {shown?.map(e => e.isDir ? (
          <Item key={e.path} variant="outline" className="animate-in fade-in-0 duration-200">
            <button className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" onClick={() => go(e.path)}>
              <ItemTitle className="break-all">{e.name}/</ItemTitle>
              <ItemDescription className="font-mono text-xs tabular-nums">Folder · {bytes(e.size)}</ItemDescription>
            </button>
            <ItemActions>
              <Button size="sm" variant="outline" onClick={() => go(e.path)}>Open</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDel(e)}>Delete</Button>
            </ItemActions>
          </Item>
        ) : (
          <Item key={e.path} variant="outline" className="animate-in fade-in-0 duration-200">
            <ItemContent className="min-w-0 basis-full sm:basis-0">
              <ItemTitle className="break-all">{e.name}</ItemTitle>
              <ItemDescription className="flex items-center gap-2 font-mono text-xs tabular-nums">
                <Badge variant="outline" className="font-mono">{ext(e.name)}</Badge>
                {bytes(e.size)} · {new Date(e.mtime).toLocaleDateString()}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="ml-auto">
              <FileMenu url={e.url!} name={e.name} onDelete={() => setDel(e)} />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>

      <AlertDialog open={!!del} onOpenChange={o => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from server?</AlertDialogTitle>
            <AlertDialogDescription className="break-all">{del?.name} ({bytes(del?.size ?? 0)}) will be permanently deleted.</AlertDialogDescription>
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
