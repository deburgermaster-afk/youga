import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'

export function LoginPage({ onDone }: { onDone: (token: string) => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      onDone((await api.login(pw)).linkToken)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-95 duration-300">
        <CardHeader>
          <CardTitle className="text-2xl">Seedbox</CardTitle>
          <CardDescription>Enter your password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field data-invalid={!!err}>
                <FieldLabel htmlFor="pw">Password</FieldLabel>
                <Input id="pw" type="password" autoFocus autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} className="h-12" aria-invalid={!!err} />
                {err && <FieldError>{err}</FieldError>}
              </Field>
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy || !pw}>
                {busy && <Spinner />} Unlock
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
