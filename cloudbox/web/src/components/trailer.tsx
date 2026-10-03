import { useEffect, useRef, useState } from 'react'

// A YouTube trailer used as a silent, chrome-less background video.
// It stays invisible until it's actually playing, then fades in over the
// poster, so the YouTube loading screen, title and errors never show.
// Talks to the embed with YouTube's postMessage protocol (no script needed).
export function TrailerBackground({ videoKey, muted, paused, onPlaying, onError }: {
  videoKey: string
  muted: boolean
  paused: boolean
  onPlaying: (playing: boolean) => void
  onError: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [visible, setVisible] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const ready = useRef(false)
  // Commands only once the player has answered; earlier ones make it throw.
  const send = (func: string, args: unknown[] = []) => {
    if (ready.current) frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  }

  // Cover the box like object-fit: cover, plus extra zoom to crop YouTube's overlays.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const s = Math.max(el.clientWidth / 16, el.clientHeight / 9) * 1.18
      setSize({ w: Math.ceil(16 * s), h: Math.ceil(9 * s) })
    })
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => setOnScreen(e.intersectionRatio > 0.15), { threshold: [0, 0.15, 0.5] })
    io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [])

  useEffect(() => {
    setVisible(false)
    onPlaying(false)
    ready.current = false
    let heard = false
    let reveal: ReturnType<typeof setTimeout> | undefined
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      let data: { event?: string; info?: unknown }
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      if (!heard) {
        heard = true
        ready.current = true
        send('addEventListener', ['onStateChange'])
        send('addEventListener', ['onError'])
      }
      const state = data.event === 'onStateChange' ? data.info : data.event === 'infoDelivery' ? (data.info as { playerState?: number })?.playerState : undefined
      if (state === 1 && !reveal) {
        if (!mutedRef.current) send('unMute') // a new trailer starts muted
        // Wait a beat so YouTube's opening title overlay is gone.
        reveal = setTimeout(() => { setVisible(true); onPlaying(true) }, 1200)
      }
      if (data.event === 'onError') onError()
    }
    window.addEventListener('message', onMsg)
    // Handshake until the player answers.
    let tries = 0
    const hello = setInterval(() => {
      if (heard || ++tries > 40) return clearInterval(hello)
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: videoKey, channel: 'widget' }), '*')
    }, 250)
    return () => { window.removeEventListener('message', onMsg); clearInterval(hello); clearTimeout(reveal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey])

  useEffect(() => { send(muted ? 'mute' : 'unMute'); if (!muted) send('setVolume', [100]) }, [muted])
  useEffect(() => { send(paused || !onScreen ? 'pauseVideo' : 'playVideo') }, [paused, onScreen])

  const src = `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}`
    + `&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {size.w > 0 && (
        <iframe
          key={videoKey}
          ref={frame}
          src={src}
          title="Trailer"
          tabIndex={-1}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-1000"
          style={{ width: size.w, height: size.h, opacity: visible ? 1 : 0 }}
        />
      )}
    </div>
  )
}
