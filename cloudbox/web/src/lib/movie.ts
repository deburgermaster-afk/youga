import { api, movieFileUrl, type Entry, type Movie, type MovieFile } from '@/lib/api'
import { subtitlesFor } from '@/components/file-row'
import type { Media, QueueItem } from '@/lib/app-context'
import { opensExternally } from '@/lib/links'

// PR = personal rating: the family's average of 1-10 scores.
export function pr(m?: Pick<Movie, 'ratings'> | null) {
  const v = Object.values(m?.ratings || {})
  if (!v.length) return 0
  return v.reduce((a, b) => a + b, 0) / v.length
}
export const prText = (n: number) => (n ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '–')

const SHORT: Record<string, string> = { 'Science Fiction': 'Sci-Fi', Documentary: 'Docu', 'TV Movie': 'TV' }
export const kind = (genres?: string[]) => (genres?.[0] ? SHORT[genres[0]] || genres[0] : 'Movie')

// Subtitles that came with the same torrent / folder.
export async function subsFor(f: MovieFile) {
  try {
    if (f.source === 'archive') return []
    if (f.source === 'torbox') {
      const all = (await api.torboxFiles()).entries
      const me = all.find(e => e.torrentId === f.torrentId && e.fileId === f.fileId)
      return me ? subtitlesFor(me, all) : []
    }
    const dir = (f.key || '').slice(0, (f.key || '').lastIndexOf('/') + 1)
    const all = (await api.files(dir)).entries.map(e => ({ ...e, source: 'cloud' as const })) as Entry[]
    const me = all.find(e => e.path === f.key)
    return me ? subtitlesFor(me, all) : []
  } catch { return [] }
}

export async function playMovie(play: (m: Media) => void, m: Pick<Movie, 'id' | 'title'>, f: MovieFile, opts: { ep?: string; queue?: QueueItem[] } = {}) {
  const base = { url: movieFileUrl(f), name: f.name, title: m.title, movieId: m.id, ...opts }
  // Opening another app must happen right in the tap (iOS blocks it after a
  // wait), so skip loading subtitles first; the app finds its own.
  if (opensExternally()) return play(base)
  play({ ...base, subs: await subsFor(f) })
}
