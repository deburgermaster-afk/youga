import { useCallback, useEffect, useState } from 'react'
import type { LogEntry, Snapshot } from '@/lib/api'

export type Point = { t: number; down: number; up: number }

// Subscribes to the server's live SSE feed; reconnects automatically.
export function useLive(enabled: boolean) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [history, setHistory] = useState<Point[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    if (!enabled) return
    let src: EventSource | null = null
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      src = new EventSource('/api/events')
      src.onopen = () => setConnected(true)
      src.onmessage = e => {
        const snap: Snapshot = JSON.parse(e.data)
        setData(snap)
        setHistory(h => [...h.slice(-89), { t: Date.now(), down: snap.stats.downloadSpeed, up: snap.stats.uploadSpeed }])
        if (snap.logs?.length) {
          setLogs(prev => {
            const seen = new Set(prev.map(l => l.id))
            return [...prev, ...snap.logs!.filter(l => !seen.has(l.id))].slice(-500)
          })
        }
      }
      src.onerror = () => {
        setConnected(false)
        src?.close()
        retry = setTimeout(connect, 2000)
      }
    }
    connect()
    return () => {
      clearTimeout(retry)
      src?.close()
    }
  }, [enabled])

  const clearLogs = useCallback(() => setLogs([]), [])
  return { data, connected, history, logs, clearLogs }
}
