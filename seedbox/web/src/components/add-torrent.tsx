import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Panel } from '@/components/panel'
import { api } from '@/lib/api'

const parse = (text: string) =>
  text.split(/\s+/).map(s => s.trim()).filter(s => /^magnet:\?/i.test(s) || /^[a-f0-9]{40}$/i.test(s) || /^https?:\/\/.+\.torrent/i.test(s))

export async function addMany(items: (string | File)[]) {
  const results = await Promise.allSettled(items.map(i => (typeof i === 'string' ? api.addMagnet(i) : api.addFile(i))))
  const ok = results.filter(r => r.status === 'fulfilled').length
  const failed = results.length - ok
  if (ok) toast.success(ok === 1 ? 'Torrent added' : `${ok} torrents added`)
  if (failed) {
    const reason = (results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined)?.reason
    toast.error(`${failed} failed`, { description: reason?.message })
  }
  return ok
}

export function AddTorrent({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const links = parse(text)

  const run = async (items: (string | File)[]) => {
    if (!items.length) return
    setBusy(true)
    const ok = await addMany(items)
    setBusy(false)
    if (ok) { setText(''); onOpenChange(false) }
  }

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      setText(t => (t ? t + '\n' : '') + clip.trim())
    } catch {
      toast('Clipboard blocked. Long-press the box and paste.')
    }
  }

  return (
    <Panel
      open={open}
      onOpenChange={onOpenChange}
      title="Add torrents"
      description="Paste magnet links or info hashes, or choose .torrent files."
      footer={
        <Button size="lg" className="h-12 w-full text-base" disabled={busy || !links.length} onClick={() => run(links)}>
          {busy && <Spinner />}
          {links.length > 1 ? `Add ${links.length} torrents` : 'Add torrent'}
        </Button>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="magnets">Magnet links</FieldLabel>
          <Textarea
            id="magnets"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'magnet:?xt=urn:btih:...\nOne per line'}
            className="min-h-36 font-mono text-sm"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <FieldDescription>
            {links.length ? `${links.length} link${links.length > 1 ? 's' : ''} detected` : 'Add as many as you like at once.'}
          </FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={paste}>Paste</Button>
          <Button variant="outline" className="h-11" onClick={() => fileRef.current?.click()}>Choose .torrent</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".torrent,application/x-bittorrent"
          multiple
          hidden
          onChange={e => { run(Array.from(e.target.files || [])); e.target.value = '' }}
        />
      </FieldGroup>
    </Panel>
  )
}
