import { useEffect, useRef, useState } from 'react'

// A YouTube trailer used as a silent, chrome-less background video.
// It stays invisible until it's actually playing, then fades in over the
// poster, so the YouTube loading screen, title and errors never show.
// Talks to the embed with YouTube's postMessage protocol (no script needed).
export function TrailerBackground({ videoKey, muted, paused, onPlaying, onError, onEnded, onSoundBlocked, loop = true, captions = false, fit = false, revealMs = 1200 }: {
  videoKey: string
  muted: boolean
  paused: boolean
  onPlaying: (playing: boolean) => void
  onError: () => void
  onEnded?: () => void // fires when it finishes (with loop off)
  onSoundBlocked?: () => void // the phone stopped it when sound came on
  loop?: boolean
  captions?: boolean // YouTube subtitles on
  fit?: boolean // whole 16:9 picture centred (reels) instead of filling the box
  revealMs?: number // wait before showing it, so YouTube's title overlay is gone
}) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [visible, setVisible] = useState(false)
  const [onScreen, setOnScreen] = useState(true)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const blockedRef = useRef(onSoundBlocked)
  blockedRef.current = onSoundBlocked
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const onScreenRef = useRef(true)
  const unmutedAt = useRef(0)

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
      const s = (fit ? Math.min(el.clientWidth / 16, el.clientHeight / 9) : Math.max(el.clientWidth / 16, el.clientHeight / 9) * 1.18)
      setSize({ w: Math.ceil(16 * s), h: Math.ceil(9 * s) })
    })
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => { onScreenRef.current = e.intersectionRatio > 0.15; setOnScreen(onScreenRef.current) }, { threshold: [0, 0.15, 0.5] })
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
        // Preloaded in the background: buffer, then wait until it's on screen.
        if (pausedRef.current || !onScreenRef.current) send('pauseVideo')
      }
      const state = data.event === 'onStateChange' ? data.info : data.event === 'infoDelivery' ? (data.info as { playerState?: number })?.playerState : undefined
      if (state === 1 && !reveal && !pausedRef.current) {
        if (!mutedRef.current) { send('unMute'); unmutedAt.current = Date.now() } // a new trailer starts muted
        // Wait a beat so YouTube's opening title overlay is gone.
        reveal = setTimeout(() => { setVisible(true); onPlaying(true) }, revealMs)
      }
      if (state === 0) onEndedRef.current?.()
      // iPhone may pause a video that gets sound without a tap: go back to
      // silent playback and let the page ask for a tap.
      if (state === 2 && !pausedRef.current && Date.now() - unmutedAt.current < 2500) {
        send('mute'); send('playVideo'); blockedRef.current?.()
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

  useEffect(() => { send(muted ? 'mute' : 'unMute'); if (!muted) { send('setVolume', [100]); unmutedAt.current = Date.now() } }, [muted])
  useEffect(() => { send(paused || !onScreen ? 'pauseVideo' : 'playVideo') }, [paused, onScreen])

  const src = `https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&mute=1&controls=0${loop ? `&loop=1&playlist=${videoKey}` : ''}`
    + `&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
    + (captions ? '&cc_load_policy=1&cc_lang_pref=en&hl=en' : '&cc_load_policy=0')

  const frameEl = size.w > 0 && (
    <iframe
      key={videoKey}
      ref={frame}
      src={src}
      title="Trailer"
      tabIndex={-1}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-700"
      // fit: a little larger than its 16:9 box, which crops YouTube's edge overlays
      style={{ width: fit ? size.w * 1.12 : size.w, height: fit ? size.h * 1.12 : size.h, opacity: visible ? 1 : 0 }}
    />
  )

  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {fit
        ? <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden" style={{ width: size.w, height: size.h }}>{frameEl}</div>
        : frameEl}
    </div>
  )
}
