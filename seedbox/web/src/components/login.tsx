import { useState } from 'react'
import { motion } from 'motion/react'
import { Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

export function Login({ onDone }: { onDone: (token: string) => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api.login(pw)
      onDone(r.linkToken)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1, x: err ? [0, -10, 10, -6, 6, 0] : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-card/70 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/20">
          <Lock className="size-6 text-slate-950" />
        </div>
        <h1 className="text-center text-xl font-semibold">Seedbox</h1>
        <Input type="password" autoFocus placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} className="h-11" />
        {err && <p className="text-center text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy || !pw} className="h-11 w-full bg-gradient-to-r from-cyan-400 to-violet-500 text-slate-950">
          {busy && <Loader2 className="animate-spin" />} Unlock
        </Button>
      </motion.form>
    </div>
  )
}
