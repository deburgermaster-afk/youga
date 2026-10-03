import { useEffect, useRef } from 'react'

// Animated backdrop: drifting gradient glows + faint falling code glyphs.
// Glyph speed reacts to download speed so the page "feels" the transfer.
export function Background({ intensity = 0 }: { intensity?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const speedRef = useRef(intensity)
  speedRef.current = intensity

  useEffect(() => {
    const c = canvas.current!
    const ctx = c.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const glyphs = '01ABCDEF<>/{}[]#$%*+=;:'.split('')
    const size = 14
    let cols: number[] = []
    let raf = 0
    let last = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = window.innerWidth * dpr
      c.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Array.from({ length: Math.ceil(window.innerWidth / size) }, () => Math.random() * -50)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const boost = 1 + Math.min(4, speedRef.current)
      if (t - last < 60 / boost) return
      last = t
      ctx.fillStyle = 'rgba(11, 13, 23, 0.12)'
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.font = `${size - 2}px ui-monospace, monospace`
      for (let i = 0; i < cols.length; i++) {
        if (Math.random() > 0.6) continue
        const y = cols[i] * size
        const hue = 185 + (i % 7) * 12
        ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${0.05 + Math.random() * 0.1})`
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, y)
        cols[i] = y > window.innerHeight && Math.random() > 0.97 ? 0 : cols[i] + 1
      }
    }
    if (!reduce) raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0b0d17]">
      <div className="absolute -left-40 -top-40 size-[36rem] animate-[drift_18s_ease-in-out_infinite] rounded-full bg-cyan-500/20 blur-[120px]" />
      <div className="absolute -right-40 top-1/3 size-[32rem] animate-[drift_22s_ease-in-out_infinite_reverse] rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="absolute bottom-[-12rem] left-1/4 size-[28rem] animate-[drift_26s_ease-in-out_infinite] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      <canvas ref={canvas} className="absolute inset-0 size-full opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#0b0d17_100%)]" />
    </div>
  )
}
