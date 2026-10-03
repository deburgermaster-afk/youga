import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { api, speed, type Stats } from '@/lib/api'
import { platform, playersFor } from '@/lib/links'
import { useApp } from '@/lib/app-context'

const KB = 1024
const MB = 1024 * KB
// Slider steps; the last one means unlimited.
const STEPS = [64 * KB, 256 * KB, 512 * KB, MB, 2 * MB, 5 * MB, 10 * MB, 20 * MB, 50 * MB, 100 * MB, -1]
const toStep = (limit: number) =>
  limit <= 0 ? STEPS.length - 1 : STEPS.reduce((best, s, i) => (s > 0 && Math.abs(s - limit) < Math.abs(STEPS[best] - limit) ? i : best), 0)
const label = (v: number) => (v <= 0 ? 'Unlimited' : speed(v))

function Limit({ title, value, onCommit }: { title: string; value: number; onCommit: (v: number) => void }) {
  const [step, setStep] = useState(toStep(value))
  useEffect(() => setStep(toStep(value)), [value])
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{title}</FieldLabel>
        <span className="font-mono text-sm tabular-nums">{label(STEPS[step])}</span>
      </div>
      <Slider className="py-3" min={0} max={STEPS.length - 1} step={1} value={[step]} onValueChange={([v]) => setStep(v)} onValueCommit={([v]) => onCommit(STEPS[v])} />
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground"><span>64 KB/s</span><span>Unlimited</span></div>
    </Field>
  )
}

export function SettingsPage({ stats, connected, authRequired, onLogout }: {
  stats?: Stats; connected: boolean; authRequired: boolean; onLogout: () => void
}) {
  const { prefs, setPrefs } = useApp()
  const plat = platform()
  const players = playersFor(plat)

  const setLimit = async (key: 'downloadLimit' | 'uploadLimit', v: number) => {
    try {
      await api.settings({ [key]: v })
      toast.success(`${key === 'downloadLimit' ? 'Download' : 'Upload'} limit: ${label(v)}`)
    } catch (e) { toast.error((e as Error).message) }
  }

  const saveCloud = async (v: { autoUpload?: boolean }) => {
    try { await api.settings(v); toast.success('Saved') } catch (e) { toast.error((e as Error).message) }
  }

  const all = async (a: 'pause' | 'resume') => {
    try { await api.all(a); toast.success(a === 'pause' ? 'All paused' : 'All resumed') } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle>Speed limits</CardTitle>
          <CardDescription>Leave on Unlimited for maximum speed.</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <FieldGroup>
            <Limit title="Download" value={stats?.downloadLimit ?? -1} onCommit={v => setLimit('downloadLimit', v)} />
            <FieldSeparator />
            <Limit title="Upload (seeding)" value={stats?.uploadLimit ?? -1} onCommit={v => setLimit('uploadLimit', v)} />
            <FieldDescription>More upload usually makes peers send you data faster.</FieldDescription>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle>Playback on this device</CardTitle>
          <CardDescription>{{ ios: 'iPhone / iPad', android: 'Android', desktop: 'Computer' }[plat]}</CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="auto">Open videos in app automatically</FieldLabel>
                <FieldDescription>Play launches your player app instead of the browser.</FieldDescription>
              </FieldContent>
              <Switch id="auto" checked={prefs.autoOpen} onCheckedChange={v => setPrefs({ ...prefs, autoOpen: v })} />
            </Field>
            <FieldSeparator />
            <Field>
              <FieldTitle>Preferred player</FieldTitle>
              <RadioGroup value={prefs.player || players[0]?.id} onValueChange={v => setPrefs({ ...prefs, player: v })} className="gap-2">
                {players.map(p => (
                  <FieldLabel key={p.id} htmlFor={p.id} className="cursor-pointer">
                    <Field orientation="horizontal" className="rounded-lg border px-4 py-3 has-data-[state=checked]:border-foreground">
                      <FieldContent><FieldTitle>{p.label}</FieldTitle></FieldContent>
                      <RadioGroupItem value={p.id} id={p.id} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle>Cloud storage</CardTitle>
          <CardDescription>
            {stats?.cloud.enabled
              ? <>Connected to bucket <span className="font-mono text-foreground">{stats.cloud.bucket}</span></>
              : 'Not set up yet. Add your Cloudflare R2 keys to the server.'}
          </CardDescription>
        </CardHeader>
        {stats?.cloud.enabled && (
          <CardContent className="px-4">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="autoUpload">Upload finished downloads</FieldLabel>
                  <FieldDescription>Copies every completed torrent to the cloud automatically.</FieldDescription>
                </FieldContent>
                <Switch id="autoUpload" checked={stats.cloud.autoUpload} onCheckedChange={v => saveCloud({ autoUpload: v })} />
              </Field>
            </FieldGroup>
          </CardContent>
        )}
      </Card>

      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle>Torrents</CardTitle>
          <CardDescription>Apply to every torrent at once.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 px-4">
          <Button variant="outline" className="h-11" onClick={() => all('pause')}>Pause all</Button>
          <Button variant="outline" className="h-11" onClick={() => all('resume')}>Resume all</Button>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="px-4">
          <CardTitle>Session</CardTitle>
          <CardDescription>
            Server connection <Badge variant={connected ? 'default' : 'outline'} className="ml-1">{connected ? 'Live' : 'Offline'}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4">
          {authRequired
            ? <Button variant="outline" className="h-11 w-full" onClick={onLogout}>Log out</Button>
            : <p className="text-sm text-muted-foreground">No password set. Set APP_PASSWORD on the server to require login.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
