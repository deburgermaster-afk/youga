import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Job } from '@/lib/api'

const active = (j: Job) => j.status === 'queued' || j.status === 'copying' || j.status === 'remote'

// Polls job progress. While anything is copying and the app is visible, it
// also "pumps" the Worker so copies go faster than the 1-minute background
// schedule alone.
export function useJobs(enabled: boolean) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [online, setOnline] = useState(true)
  const pumping = useRef(false)
  const jobsRef = useRef<Job[]>([])

  const refresh = useCallback(async () => {
    try {
      const r = await api.jobs()
      jobsRef.current = r.jobs
      setJobs(r.jobs)
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const id = setInterval(() => { if (!document.hidden) refresh() }, 2000)
    return () => clearInterval(id)
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return
    let stop = false
    const loop = async () => {
      while (!stop) {
        if (!document.hidden && jobsRef.current.some(active) && !pumping.current) {
          pumping.current = true
          try { await api.pump() } catch { /* the cron will carry on */ }
          pumping.current = false
        } else {
          await new Promise(r => setTimeout(r, 1500))
        }
      }
    }
    loop()
    return () => { stop = true }
  }, [enabled])

  return { jobs, online, refresh }
}
