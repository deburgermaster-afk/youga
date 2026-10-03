import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/panel'
import { api, bytes, img, type Entry, type Movie, type MovieLite } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

const isLink = (s: string) => /^magnet:\?/i.test(s) || /^https?:\/\/\S+$/i.test(s) || /^[a-f0-9]{40}$/i.test(s)
const VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv)$/i

// "Some.Movie.2014.1080p.BluRay.x264" -> { title: "Some Movie", year: "2014" }
export function guessTitle(link: string) {
  let name = ''
  if (/^magnet:/i.test(link)) name = new URLSearchParams(link.slice(link.indexOf('?') + 1)).get('dn') || ''
  else { try { name = decodeURIComponent(new URL(link).pathname.split('/').pop() || '') } catch { name = link } }
  name = name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ')
  const m = /^(.*?)[\s([]*((?:19|20)\d{2})(?!\d)/.exec(name)
  const title = (m ? m[1] : name.split(/\b(2160p|1080p|720p|480p|4k|bluray|web-?dl|webrip|hdr|x264|x265|hevc|remux)\b/i)[0]).replace(/[([\-–]+$/, '').trim()
  return { title, year: m?.[2] }
}

function MovieChoice({ m, selected, onClick }: { m: MovieLite; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors', selected ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-white/[0.03]')}>
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-white/5">{m.poster && <img src={img(m.poster, 'w185')} alt="" className="size-full object-cover" />}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.title}</p>
        <p className="text-xs text-white/50">{m.year}</p>
      </div>
      {selected && <Check className="mr-1 size-5 text-orange-400" />}
    </button>
  )
}

export function AddSheet({ open, onOpenChange, movieId, library, onDone }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  movieId?: number
  library: Movie[]
  onDone: () => void
}) {
  const { profile } = useApp()
  const [link, setLink] = useState('')
  const [movie, setMovie] = useState<MovieLite | null>(null)
  const [choices, setChoices] = useState<MovieLite[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [existing, setExisting] = useState<Entry[] | null>(null)

  // Reset; preselect the movie when opened from its page.
  useEffect(() => {
    if (!open) return
    setLink(''); setQ(''); setChoices([]); setExisting(null)
    if (movieId) {
      const m = library.find(x => x.id === movieId)
      setMovie(m ? { id: m.id, title: m.title, year: m.year || '', poster: m.poster || '', backdrop: m.backdrop || '', rating: m.rating || 0, overview: m.overview || '' } : null)
      if (!m) api.movie(movieId).then(d => setMovie(d)).catch(() => {})
    } else setMovie(null)
  }, [open, movieId, library])

  // Guess the movie from the pasted link's file name.
  useEffect(() => {
    if (movieId || !isLink(link.trim())) return
    const { title, year } = guessTitle(link.trim())
    if (!title) return
    setQ(year ? `${title} ${year}` : title)
    api.search(title).then(r => {
      const sorted = [...r.results].sort((a, b) => Number(b.year === year) - Number(a.year === year))
      setChoices(sorted.slice(0, 6))
      setMovie(sorted[0] ?? null)
    }).catch(() => {})
  }, [link, movieId])

  const searchMovies = async () => {
    if (!q.trim()) return
    try { const r = await api.search(q); setChoices(r.results.slice(0, 8)) } catch (e) { toast.error((e as Error).message) }
  }

  const ensureInVault = async (m: MovieLite) => {
    if (!library.some(x => x.id === m.id)) await api.addMovie(m.id, profile)
  }

  const start = async () => {
    const l = link.trim()
    if (!isLink(l)) return toast.error('Paste a magnet link or a direct download link')
    setBusy(true)
    try {
      if (movie) await ensureInVault(movie)
      const job = await api.add(l, movie?.id)
      toast.success(movie ? `Adding ${movie.title}` : 'Adding movie', { description: job.name })
      onDone(); onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
    setBusy(false)
  }

  const saveOnly = async () => {
    if (!movie) return
    setBusy(true)
    try { await ensureInVault(movie); toast.success(`Saved ${movie.title}`); onDone(); onOpenChange(false) } catch (e) { toast.error((e as Error).message) }
    setBusy(false)
  }

  const loadExisting = async () => {
    if (existing) return
    const [tb, cloud] = await Promise.all([
      api.torboxFiles().then(r => r.entries).catch(() => [] as Entry[]),
      api.files('').then(r => r.entries.filter(e => !e.isDir).map(e => ({ ...e, source: 'cloud' as const }))).catch(() => [] as Entry[]),
    ])
    setExisting([...tb, ...cloud].filter(e => VIDEO.test(e.name)).sort((a, b) => b.size - a.size))
  }

  const attach = async (e: Entry) => {
    if (!movie) return toast.error('Pick the movie first')
    setBusy(true)
    try {
      await ensureInVault(movie)
      await api.attach(movie.id, e.source === 'torbox'
        ? { source: 'torbox', torrentId: e.torrentId, fileId: e.fileId, name: e.name, size: e.size }
        : { source: 'cloud', key: e.path, name: e.name, size: e.size })
      toast.success(`Linked to ${movie.title}`)
      onDone(); onOpenChange(false)
    } catch (err) { toast.error((err as Error).message) }
    setBusy(false)
  }

  const moviePicker = (
    <Field>
      <FieldLabel>Movie</FieldLabel>
      {movieId && movie
        ? <MovieChoice m={movie} selected onClick={() => {}} />
        : (
          <div className="space-y-2">
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); searchMovies() }}>
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the movie" className="h-11" />
              <Button type="submit" variant="outline" className="h-11" aria-label="Search"><Search /></Button>
            </form>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {choices.map(m => <MovieChoice key={m.id} m={m} selected={movie?.id === m.id} onClick={() => setMovie(movie?.id === m.id ? null : m)} />)}
            </div>
            <FieldDescription>{movie ? `Will be saved as “${movie.title}”.` : 'Optional. Pick one so it shows with its poster.'}</FieldDescription>
          </div>
        )}
    </Field>
  )

  return (
    <Panel open={open} onOpenChange={onOpenChange} title={movieId && movie ? `Add movie: ${movie.title}` : 'Add a movie'} description="Paste a magnet or download link you have the rights to.">
      <Tabs defaultValue="link" onValueChange={v => v === 'existing' && loadExisting()} className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="link">Link</TabsTrigger>
          <TabsTrigger value="existing">Already downloaded</TabsTrigger>
        </TabsList>
        <TabsContent value="link">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="link">Magnet or link</FieldLabel>
              <Textarea id="link" value={link} onChange={e => setLink(e.target.value)} placeholder="magnet:?xt=urn:btih:… or https://…" className="min-h-24 font-mono text-sm" autoComplete="off" spellCheck={false} />
            </Field>
            {moviePicker}
            <Button className="h-12 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 text-base font-semibold text-white" disabled={busy || !isLink(link.trim())} onClick={start}>
              {busy && <Spinner />} Add movie
            </Button>
            {movie && !library.some(x => x.id === movie.id) && (
              <button disabled={busy} onClick={saveOnly} className="text-sm text-white/60 underline underline-offset-4">Just save it to the vault for now</button>
            )}
          </FieldGroup>
        </TabsContent>
        <TabsContent value="existing">
          <FieldGroup>
            {moviePicker}
            <Field>
              <FieldLabel>Your files</FieldLabel>
              {!existing && <Spinner />}
              {existing?.length === 0 && <FieldDescription>No video files on TorBox or in your cloud yet.</FieldDescription>}
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {existing?.map(e => (
                  <button key={e.path} disabled={busy || !movie} onClick={() => attach(e)} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-left disabled:opacity-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.name}</p>
                      <p className="font-mono text-[11px] text-emerald-400">{bytes(e.size)} <span className="text-white/50">· {e.source === 'torbox' ? 'TorBox' : 'Cloud'}</span></p>
                    </div>
                    <span className="text-xs text-orange-300">Link</span>
                  </button>
                ))}
              </div>
            </Field>
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </Panel>
  )
}
