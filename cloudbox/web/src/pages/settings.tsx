import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldTitle } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { platform, playersFor } from '@/lib/links'
import { useApp } from '@/lib/app-context'

export function SettingsPage({ authRequired, onLogout }: { authRequired: boolean; onLogout: () => void }) {
  const { prefs, setPrefs } = useApp()
  const plat = platform()
  const players = playersFor(plat)

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
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
          <CardTitle>How it works</CardTitle>
          <CardDescription className="space-y-2 leading-relaxed">
            <span className="block">Paste a direct download link. Cloudflare copies the file into your R2 storage in 100 MB pieces, about once a minute in the background, and faster while this app is open.</span>
            <span className="block">Streaming and downloading from your cloud is free. Storage is free up to 10 GB, then about $0.015 per GB each month.</span>
            <span className="block">Magnet links and .torrent files aren’t supported here.</span>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="py-4">
        <CardHeader className="px-4"><CardTitle>Session</CardTitle></CardHeader>
        <CardContent className="px-4">
          {authRequired
            ? <Button variant="outline" className="h-11 w-full" onClick={onLogout}>Log out</Button>
            : <p className="text-sm text-muted-foreground">No password set.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
