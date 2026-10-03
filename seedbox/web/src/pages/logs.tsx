import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, type LogEntry } from '@/lib/api'
import { copy } from '@/lib/links'

type Level = 'all' | LogEntry['level']

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour12: false })

export function LogsPage({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const [level, setLevel] = useState<Level>('all')
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const needle = q.toLowerCase()
    return logs.filter(l => (level === 'all' || l.level === level) && (!needle || l.msg.toLowerCase().includes(needle))).slice().reverse()
  }, [logs, level, q])

  const clear = async () => {
    try { await api.clearLogs(); onClear(); toast.success('Logs cleared') } catch (e) { toast.error((e as Error).message) }
  }

  const exportLogs = async () => {
    await copy(shown.map(l => `${new Date(l.ts).toISOString()} ${l.level.toUpperCase()} ${l.msg}`).join('\n'))
    toast.success(`${shown.length} lines copied`)
  }

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>Activity log</CardTitle>
        <CardDescription>Live server events, newest first</CardDescription>
        <CardAction className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportLogs} disabled={!shown.length}>Copy</Button>
          <Button size="sm" variant="outline" onClick={clear}>Clear</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search logs" className="h-11" type="search" />
        <ToggleGroup type="single" variant="outline" value={level} onValueChange={v => v && setLevel(v as Level)} className="no-scrollbar w-full justify-start overflow-x-auto">
          {(['all', 'info', 'success', 'warn', 'error'] as Level[]).map(l => (
            <ToggleGroupItem key={l} value={l} className="h-10 flex-1 px-3 capitalize data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>

        {shown.length === 0 && (
          <Empty className="border border-dashed py-12">
            <EmptyHeader>
              <EmptyTitle>No log entries</EmptyTitle>
              <EmptyDescription>Events like added, completed and errors appear here in real time.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <div className="divide-y rounded-lg border">
          {shown.map(l => (
            <div key={l.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 font-mono text-xs animate-in fade-in-0 duration-300 sm:grid-cols-[auto_auto_1fr] sm:items-start">
              <span className="pt-0.5 tabular-nums text-muted-foreground">{time(l.ts)}</span>
              <Badge
                variant={l.level === 'error' ? 'destructive' : l.level === 'success' ? 'default' : l.level === 'warn' ? 'secondary' : 'outline'}
                className="w-16 justify-self-start font-mono uppercase"
              >
                {l.level}
              </Badge>
              <span className="col-span-2 min-w-0 leading-relaxed [overflow-wrap:anywhere] sm:col-span-1 sm:pt-0.5">{l.msg}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
