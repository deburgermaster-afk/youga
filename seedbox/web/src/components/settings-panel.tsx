import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Gauge, LogOut, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { api, speed, type Stats } from '@/lib/api'
import { platform, playersFor } from '@/lib/links'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

const KB = 1024
const MB = 1024 * KB
// Slider steps; the last step means "unlimited".
const STEPS = [64 * KB, 256 * KB, 512 * KB, 1 * MB, 2 * MB, 5 * MB, 10 * MB, 20 * MB, 50 * MB, 100 * MB, -1]
const toStep = (limit: number) => (limit <= 0 ? STEPS.length - 1 : STEPS.reduce((best, s, i) => (s > 0 && Math.abs(s - limit) < Math.abs(STEPS[best] - limit) ? i : best), 0))
const label = (v: number) => (v <= 0 ? 'Unlimited' : speed(v))

function LimitSlider({ icon, title, value, onCommit, color }: {
  icon: React.ReactNode; title: string; value: number; onCommit: (v: number) => void; color: string
}) {
  const [step, setStep] = useState(toStep(value))
  useEffect(() => setStep(toStep(value)), [value])
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">{icon}{title}</Label>
        <span className={cn('font-mono text-sm tabular-nums', color)}>{label(STEPS[step])}</span>
      </div>
      <Slider min={0} max={STEPS.length - 1} step={1} value={[step]} onValueChange={([v]) => setStep(v)} onValueCommit={([v]) => onCommit(STEPS[v])} />
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>64 KB/s</span><span>∞</span></div>
    </div>
  )
}

export function SettingsPanel({ stats, authRequired, onLogout }: { stats: Stats | undefined; authRequired: boolean; onLogout: () => void }) {
  const { prefs, setPrefs } = useApp()
  const players = playersFor(platform())

  const setLimit = async (key: 'downloadLimit' | 'uploadLimit', v: number) => {
    try {
      await api.settings({ [key]: v })
      toast.success(`${key === 'downloadLimit' ? 'Download' : 'Upload'} limit: ${label(v)}`)
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-6 rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 font-semibold"><Gauge className="size-4 text-cyan-400" /> Speed limits</h2>
        <LimitSlider icon={<ArrowDown className="size-4 text-cyan-400" />} title="Download" color="text-cyan-300" value={stats?.downloadLimit ?? -1} onCommit={v => setLimit('downloadLimit', v)} />
        <LimitSlider icon={<ArrowUp className="size-4 text-violet-400" />} title="Upload / seeding" color="text-violet-300" value={stats?.uploadLimit ?? -1} onCommit={v => setLimit('uploadLimit', v)} />
        <p className="text-xs text-muted-foreground">Leave both on Unlimited for maximum speed. More upload (seeding) usually makes peers send you data faster.</p>
      </section>

      <section className="space-y-5 rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4 text-violet-400" /> Playback on this device</h2>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="auto" className="flex-col items-start gap-1">
            <span>Auto-open videos in app</span>
            <span className="text-xs font-normal text-muted-foreground">Tapping Play launches your player app instead of the browser.</span>
          </Label>
          <Switch id="auto" checked={prefs.autoOpen} onCheckedChange={v => setPrefs({ ...prefs, autoOpen: v })} />
        </div>
        <div className="space-y-2">
          <Label>Preferred player</Label>
          <div className="flex flex-wrap gap-2">
            {players.map(p => {
              const active = (prefs.player || players[0].id) === p.id
              return (
                <Button key={p.id} size="sm" variant={active ? 'default' : 'outline'} onClick={() => setPrefs({ ...prefs, player: p.id })}
                  className={cn(active && 'bg-gradient-to-r from-cyan-400 to-violet-500 text-slate-950')}>
                  {p.label}
                </Button>
              )
            })}
          </div>
        </div>
        {authRequired && (
          <Button variant="outline" onClick={onLogout} className="w-full"><LogOut /> Log out</Button>
        )}
      </section>
    </div>
  )
}
