
export function Sparkline({ data }: { data: { down: number; up: number }[] }) {
  const w = 300
  const h = 60
  const max = Math.max(1024, ...data.map(d => Math.max(d.down, d.up)))
  const pts = (k: 'down' | 'up') => {
    const n = Math.max(data.length - 1, 1)
    return data.map((d, i) => `${(i / n) * w},${h - (d[k] / max) * (h - 4) - 2}`).join(' ')
  }
  const area = (k: 'down' | 'up') => (data.length < 2 ? '' : `M0,${h} L${pts(k).replaceAll(' ', ' L')} L${w},${h} Z`)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-16 w-full">
      <defs>
        <linearGradient id="sp-d" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".35" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient>
        <linearGradient id="sp-u" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#a855f7" stopOpacity=".3" /><stop offset="1" stopColor="#a855f7" stopOpacity="0" /></linearGradient>
      </defs>
      <path d={area('down')} fill="url(#sp-d)" className="transition-all duration-700" />
      <path d={area('up')} fill="url(#sp-u)" />
      {data.length > 1 && <polyline points={pts('down')} fill="none" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
      {data.length > 1 && <polyline points={pts('up')} fill="none" stroke="#a855f7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}
