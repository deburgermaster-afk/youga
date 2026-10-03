import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ClipboardPaste, FileUp, Loader2, Magnet, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AddTorrent() {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const add = async (fn: () => Promise<{ name: string }>) => {
    setBusy(true)
    try {
      const t = await fn()
      toast.success('Added', { description: t.name })
      setValue('')
    } catch (e) {
      toast.error('Could not add torrent', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const v = value.trim()
    if (v) add(() => api.addMagnet(v))
  }

  const addFiles = (files: FileList | null) => {
    for (const f of Array.from(files || [])) add(() => api.addFile(f))
  }

  // Drop .torrent files anywhere on the page.
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDrag(true) }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDrag(false) }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDrag(false)
      const text = e.dataTransfer?.getData('text')
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files)
      else if (text?.startsWith('magnet:')) add(() => api.addMagnet(text))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  })

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (!text) return toast('Clipboard is empty')
      setValue(text)
      if (/^magnet:|^[a-f0-9]{40}$/i.test(text)) add(() => api.addMagnet(text))
    } catch {
      toast('Allow clipboard access, or paste manually')
    }
  }

  return (
    <>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-card/60 p-2 shadow-2xl shadow-cyan-500/5 backdrop-blur-xl sm:flex-row"
      >
        <div className="relative flex-1">
          <Magnet className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cyan-400" />
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Paste magnet link or info hash…"
            className="h-11 border-0 bg-transparent pl-9 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-11 flex-1 sm:flex-none" onClick={paste}>
            <ClipboardPaste /> Paste
          </Button>
          <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => fileRef.current?.click()}>
            <FileUp /> .torrent
          </Button>
          <Button type="submit" disabled={busy || !value.trim()} className="h-11 flex-1 bg-gradient-to-r from-cyan-400 to-violet-500 px-5 text-slate-950 hover:opacity-90 sm:flex-none">
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".torrent,application/x-bittorrent" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      </motion.form>

      <div className={cn(
        'pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300',
        drag ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="rounded-3xl border-2 border-dashed border-cyan-400/60 px-12 py-10 text-center">
          <FileUp className="mx-auto size-10 text-cyan-400" />
          <p className="mt-3 text-lg font-medium">Drop .torrent files or magnet links</p>
        </div>
      </div>
    </>
  )
}
