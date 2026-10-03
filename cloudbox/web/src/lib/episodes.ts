import { movieFileUrl, type MovieFile } from '@/lib/api'
import { getProgress, isDone } from '@/lib/profiles'

// Season/episode from a file name: "Show.S02E05.1080p.mkv", "show 2x05.mp4".
export function epOf(name: string): { s: number; e: number } | null {
  const m = /S(\d{1,2})[ ._-]*E(\d{1,3})/i.exec(name) || /(?:^|[^\d])(\d{1,2})x(\d{2,3})(?!\d)/i.exec(name)
  return m ? { s: +m[1], e: +m[2] } : null
}

export type EpFile = { f: MovieFile; s: number; e: number; url: string }
export const epLabel = (s: number, e: number) => `S${s} E${e}`

// A series' files that look like episodes, in watching order.
export function episodeFiles(files: MovieFile[]): EpFile[] {
  return files
    .map(f => ({ f, ep: epOf(f.name) }))
    .filter((x): x is { f: MovieFile; ep: { s: number; e: number } } => !!x.ep)
    .map(({ f, ep }) => ({ f, s: ep.s, e: ep.e, url: movieFileUrl(f) }))
    .sort((a, b) => a.s - b.s || a.e - b.e)
}

// Where to pick up: the episode you're in the middle of, else the one after
// the last finished episode, else the first.
export function nextEpisode(profile: string, eps: EpFile[]): { ep: EpFile; resume: boolean } | null {
  if (!eps.length) return null
  const urls = new Set(eps.map(x => x.url))
  const inProgress = getProgress(profile).filter(p => urls.has(p.url)).sort((a, b) => b.at - a.at)[0]
  if (inProgress) return { ep: eps.find(x => x.url === inProgress.url)!, resume: true }
  let last = -1
  eps.forEach((x, i) => { if (isDone(profile, x.url)) last = i })
  return { ep: eps[last + 1] ?? eps[0], resume: false }
}
