import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@/lib/api'

// Subscribes to the server's live SSE feed; reconnects automatically.
export function useLive(enabled: boolean) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [history, setHistory] = useState<{ down: number; up: number }[]>([])
  const es = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled) return
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      const src = new EventSource('/api/events')
      es.current = src
      src.onopen = () => setConnected(true)
      src.onmessage = e => {
        const snap: Snapshot = JSON.parse(e.data)
        setData(snap)
        setHistory(h => [...h.slice(-59), { down: snap.stats.downloadSpeed, up: snap.stats.uploadSpeed }])
      }
      src.onerror = () => {
        setConnected(false)
        src.close()
        retry = setTimeout(connect, 2000)
      }
    }
    connect()
    return () => {
      clearTimeout(retry)
      es.current?.close()
    }
  }, [enabled])

  return { data, connected, history }
}
