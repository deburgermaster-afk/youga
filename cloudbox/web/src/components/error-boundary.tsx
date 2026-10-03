import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <Empty className="min-h-dvh">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription className="break-all font-mono text-xs">{this.state.error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => location.reload()}>Reload</Button>
        </EmptyContent>
      </Empty>
    )
  }
}
