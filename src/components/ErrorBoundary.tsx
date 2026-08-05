import { Component, type ReactNode } from 'react'
import { isChunkLoadError, recoverFromChunkError } from '@/lib/chunkRecovery'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  /** A stale-build chunk failure — we're reloading onto the new build. */
  updating: boolean
  /** Chunk failure whose automatic reloads were exhausted — needs the user. */
  updateFailed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, updating: false, updateFailed: false }

  static getDerivedStateFromError(error: Error): State {
    // A failed lazy import isn't an app bug — it means this shell was built
    // against chunks the server no longer has. Show "updating", not "broken".
    return { hasError: true, error, updating: isChunkLoadError(error), updateFailed: false }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info)
    }
    if (isChunkLoadError(error)) {
      void recoverFromChunkError().then((reloading) => {
        // Automatic recovery has given up after repeated reloads. This is still
        // a version-mismatch, not an app crash, so keep saying so and hand the
        // user a working button — the generic "unexpected error, contact
        // support" screen would be a plain lie about what happened.
        if (!reloading) this.setState({ updating: false, updateFailed: true })
      })
    }
  }

  /**
   * "Try again" after a chunk failure has to bypass the reload guard and purge
   * the stale service-worker cache — a plain reload() would just re-serve the
   * same broken shell.
   */
  reset = () => {
    if (isChunkLoadError(this.state.error)) {
      void recoverFromChunkError({ force: true })
      return
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.state.updating) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Updating to the latest version…</p>
        </div>
      )
    }

    if (this.state.updateFailed) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
            <svg className="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16.023 9.348h4.992V4.356M3 12a9 9 0 0115.362-6.364L21 8m-3.362 10.364A9 9 0 013 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">A new version is available</h2>
            <p className="mt-2 max-w-sm text-muted-foreground">
              This tab is running an old version of the app. Reload to get the latest one.
            </p>
          </div>
          <button
            onClick={this.reset}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Reload now
          </button>
        </div>
      )
    }

    if (this.props.fallback) return this.props.fallback

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/10">
          <svg className="h-10 w-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
          <p className="mt-2 max-w-sm text-muted-foreground">
            The page hit an unexpected error. Try reloading. If the problem persists, contact support.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-4 max-w-xl overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={this.reset}
            className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard' }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }
}
