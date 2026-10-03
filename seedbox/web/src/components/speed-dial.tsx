import { useEffect } from 'react'
import { animate, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { speed } from '@/lib/api'

const MAX = 125 * 1024 * 1024 // 1 Gbit/s
const SWEEP = 240
const START = -210

// Log scale so both 50 KB/s and 80 MB/s move the needle visibly.
const frac = (v: number) => Math.min(1, Math.log10(1 + v / 1024) / Math.log10(1 + MAX / 1024))

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arc(r: number, from: number, to: number) {
  const [x1, y1] = polar(100, 100, r, from)
  const [x2, y2] = polar(100, 100, r, to)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

const TICKS = [0, 100 * 1024, 1024 ** 2, 10 * 1024 ** 2, 100 * 1024 ** 2]
const TICK_LABEL = ['0', '100K', '1M', '10M', '100M']

export function SpeedDial({ value, label, limit, color }: { value: number; label: string; limit: number; color: 'cyan' | 'violet' }) {
  const target = useMotionValue(0)
  const f = useSpring(target, { stiffness: 60, damping: 16, mass: 0.8 })
  const nx = useTransform(f, v => polar(100, 100, 66, START + v * SWEEP)[0])
  const ny = useTransform(f, v => polar(100, 100, 66, START + v * SWEEP)[1])
  const dash = useTransform(f, v => `${v * 100} 200`)
  const glow = useTransform(f, v => (v < 0.005 ? 0 : 1))
  const display = useMotionValue(0)
  const text = useTransform(display, v => speed(v))

  useEffect(() => {
    target.set(frac(value))
    const c = animate(display, value, { duration: 0.8, ease: 'easeOut' })
    return () => c.stop()
  }, [value, target, display])

  const stops = color === 'cyan' ? ['#22d3ee', '#3b82f6'] : ['#a855f7', '#ec4899']
  const id = `g-${color}`

  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox="0 0 200 170" className="w-full max-w-[220px] overflow-visible">
        <defs>
          <linearGradient id={id} x1="0" x2="1">
            <stop offset="0" stopColor={stops[0]} />
            <stop offset="1" stopColor={stops[1]} />
          </linearGradient>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={arc(80, START, START + SWEEP)} stroke="currentColor" className="text-white/10" strokeWidth="12" fill="none" strokeLinecap="round" />
        <motion.path
          d={arc(80, START, START + SWEEP)}
          pathLength={100}
          stroke={`url(#${id})`}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          filter={`url(#${id}-glow)`}
          style={{ strokeDasharray: dash, opacity: glow }}
        />
        {limit > 0 && (() => {
          const a = START + frac(limit) * SWEEP
          const [x1, y1] = polar(100, 100, 66, a)
          const [x2, y2] = polar(100, 100, 94, a)
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
        })()}
        {TICKS.map((t, i) => {
          const a = START + frac(t) * SWEEP
          const [x, y] = polar(100, 100, 58, a)
          return <text key={i} x={x} y={y} fontSize="8" textAnchor="middle" dominantBaseline="middle" className="fill-white/40 font-mono">{TICK_LABEL[i]}</text>
        })}
        <motion.line x1="100" y1="100" x2={nx} y2={ny} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="100" cy="100" r="7" className="fill-white" />
        <circle cx="100" cy="100" r="3" fill={stops[0]} />
      </svg>
      <div className="-mt-6 text-center">
        <motion.div className="font-mono text-base font-semibold tabular-nums tracking-tight sm:text-xl">{text}</motion.div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground sm:text-xs">{label}</div>
      </div>
    </div>
  )
}
