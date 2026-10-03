import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TorrentItem } from '@/components/torrent-item'
import { api, type Torrent } from '@/lib/api'

type Filter = 'all' | 'active' | 'seeding' | 'paused'
type Sort = 'added' | 'name' | 'progress' | 'size' | 'speed'

const match: Record<Filter, (t: Torrent) => boolean> = {
  all: () => true,
  active: t => !t.paused && !t.done,
  seeding: t => !t.paused && t.done,
  paused: t => t.paused,
}

const sorters: Record<Sort, (a: Torrent, b: Torrent) => number> = {
  added: (a, b) => b.addedAt - a.addedAt,
  name: (a, b) => a.name.localeCompare(b.name),
  progress: (a, b) => b.progress - a.progress,
  size: (a, b) => b.length - a.length,
  speed: (a, b) => b.downloadSpeed - a.downloadSpeed,
}

export function DownloadsPage({ torrents, loading, onOpen, onAdd }: {
  torrents: Torrent[]; loading: boolean; onOpen: (hash: string) => void; onAdd: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('added')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return torrents
      .filter(match[filter])
      .filter(t => !needle || t.name.toLowerCase().includes(needle))
      .sort(sorters[sort])
  }, [torrents, filter, sort, q])

  const count = (f: Filter) => torrents.filter(match[f]).length

  const all = async (a: 'pause' | 'resume') => {
    try { await api.all(a); toast.success(a === 'pause' ? 'All paused' : 'All resumed') } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search downloads" className="h-11" type="search" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-11 px-4">Sort</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={v => setSort(v as Sort)}>
              <DropdownMenuRadioItem value="added">Recently added</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="progress">Progress</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="speed">Speed</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => all('pause')}>Pause all</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => all('resume')}>Resume all</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={v => v && setFilter(v as Filter)}
        className="no-scrollbar w-full justify-start overflow-x-auto"
      >
        {(['all', 'active', 'seeding', 'paused'] as Filter[]).map(f => (
          <ToggleGroupItem key={f} value={f} className="h-10 flex-1 px-4 capitalize data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {f} <span className="font-mono tabular-nums opacity-70">{count(f)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {loading && (
        <div className="grid gap-3 xl:grid-cols-2">
          {[0, 1].map(i => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
        </div>
      )}

      {!loading && list.length === 0 && (
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyTitle>{torrents.length ? 'Nothing matches' : 'No downloads yet'}</EmptyTitle>
            <EmptyDescription>
              {torrents.length ? 'Try another filter or search.' : 'Add a magnet link or a .torrent file. It downloads on the server and you can stream it here.'}
            </EmptyDescription>
          </EmptyHeader>
          {!torrents.length && (
            <EmptyContent>
              <Button size="lg" className="h-12 px-8" onClick={onAdd}>Add torrent</Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {list.map(t => <TorrentItem key={t.infoHash} t={t} onOpen={onOpen} />)}
      </div>
    </div>
  )
}
