import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { WideProgress } from '@/components/wide-progress'
import { bytes, speed, type Stats, type Torrent } from '@/lib/api'
import type { Point } from '@/hooks/use-live'

const config = {
  down: { label: 'Download', color: 'var(--chart-1)' },
  up: { label: 'Upload', color: 'var(--chart-2)' },
} satisfies ChartConfig

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription className="text-xs uppercase tracking-wider">{label}</CardDescription>
        <CardTitle className="font-mono text-2xl tabular-nums sm:text-3xl">{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="px-4 text-xs text-muted-foreground">{sub}</CardContent>}
    </Card>
  )
}

export function StatsPage({ stats, torrents, history }: { stats?: Stats; torrents: Torrent[]; history: Point[] }) {
  const s = stats
  const total = torrents.reduce((n, t) => n + t.length, 0)
  const have = torrents.reduce((n, t) => n + t.downloaded, 0)
  const uploaded = torrents.reduce((n, t) => n + t.uploaded, 0)
  const used = s ? s.disk.total - s.disk.free : 0
  const data = history.map((p, i) => ({ i, down: p.down, up: p.up }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Download" value={speed(s?.downloadSpeed ?? 0)} sub={s && s.downloadLimit > 0 ? `Limit ${speed(s.downloadLimit)}` : 'No limit'} />
        <Tile label="Upload" value={speed(s?.uploadSpeed ?? 0)} sub={s && s.uploadLimit > 0 ? `Limit ${speed(s.uploadLimit)}` : 'No limit'} />
        <Tile label="Peers" value={s?.peers ?? 0} sub={`${s?.active ?? 0} downloading · ${s?.seeding ?? 0} seeding`} />
        <Tile label="Ratio" value={(s?.ratio || 0).toFixed(2)} sub={`${bytes(uploaded)} uploaded`} />
      </div>

      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle>Live speed</CardTitle>
          <CardDescription>Last 90 seconds</CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <ChartContainer config={config} className="aspect-auto h-56 w-full sm:h-72">
            <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis width={64} domain={[0, (max: number) => Math.max(max, 1024)]} tickLine={false} axisLine={false} tickFormatter={v => `${bytes(Number(v), 0)}/s`} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{config[name as keyof typeof config]?.label}</span>
                  <span className="font-mono tabular-nums">{speed(Number(v))}</span>
                </div>
              )} />} />
              <Area dataKey="down" type="monotone" stroke="var(--color-down)" fill="var(--color-down)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <Area dataKey="up" type="monotone" stroke="var(--color-up)" fill="var(--color-up)" fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 3" isAnimationActive={false} />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle>All downloads</CardTitle>
            <CardDescription className="font-mono tabular-nums">{bytes(have)} of {bytes(total)} · {torrents.length} torrents</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <WideProgress value={total ? (have / total) * 100 : 0} left={`${total ? ((have / total) * 100).toFixed(1) : '0.0'}%`} right={bytes(total - have) + ' left'} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle>Server storage</CardTitle>
            <CardDescription className="font-mono tabular-nums">{bytes(used)} of {bytes(s?.disk.total ?? 0)}</CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <WideProgress value={s?.disk.total ? (used / s.disk.total) * 100 : 0} left={`${s?.disk.total ? ((used / s.disk.total) * 100).toFixed(0) : 0}% used`} right={`${bytes(s?.disk.free ?? 0)} free`} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
