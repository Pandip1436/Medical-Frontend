import { useEffect } from 'react'
import { CheckCircle2, Loader2, XCircle, X, ArrowRight } from 'lucide-react'
import { useImportStore } from '@/stores/importStore'
import { ImportProgressBar } from '@/components/shared/ImportProgressBar'
import { navigate } from '@/lib/router'

const LABEL: Record<string, string> = {
  products: 'Products',
  suppliers: 'Suppliers',
  customers: 'Customers',
}

// Where clicking the pill takes you — the list the imported rows land in.
const ROUTE: Record<string, string> = {
  products: '/inventory/products?view=table',
  suppliers: '/purchase/suppliers?view=table',
  customers: '/customers?view=table',
}

/**
 * Floating, app-wide import indicator. Because the import runs in importStore
 * (not the drawer), it keeps going when the user closes the drawer or navigates
 * away — this pill shows the live count and the final result from anywhere.
 */
export function ImportProgressPill() {
  const active = useImportStore((s) => s.active)
  const entity = useImportStore((s) => s.entity)
  const done = useImportStore((s) => s.done)
  const total = useImportStore((s) => s.total)
  const result = useImportStore((s) => s.result)
  const error = useImportStore((s) => s.error)
  const dismiss = useImportStore((s) => s.dismiss)

  // Auto-dismiss the success/error card a few seconds after it settles.
  useEffect(() => {
    if (active) return
    if (!result && !error) return
    const id = setTimeout(() => dismiss(), error ? 8000 : 5000)
    return () => clearTimeout(id)
  }, [active, result, error, dismiss])

  if (!active && !result && !error) return null

  const label = (entity && LABEL[entity]) || 'Records'
  const route = entity ? ROUTE[entity] : undefined
  const go = () => { if (route) navigate(route) }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex justify-end">
      <div
        role={route ? 'button' : undefined}
        tabIndex={route ? 0 : undefined}
        onClick={route ? go : undefined}
        onKeyDown={
          route
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  go()
                }
              }
            : undefined
        }
        aria-label={route ? `View ${label.toLowerCase()}` : undefined}
        className={
          'pointer-events-auto w-72 rounded-xl border border-border/60 bg-background/95 p-3 shadow-lg backdrop-blur-sm ' +
          (route ? 'cursor-pointer transition-colors hover:border-emerald-500/60 hover:bg-accent/40' : '')
        }
      >
        <div className="mb-1.5 flex items-center gap-2">
          {active ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
          ) : error ? (
            <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <span className="flex-1 truncate text-xs font-semibold">
            {active
              ? `Importing ${label.toLowerCase()}…`
              : error
                ? `${label} import failed`
                : `${label} import complete`}
          </span>
          {!active && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                dismiss()
              }}
              aria-label="Dismiss"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {active ? (
          <ImportProgressBar done={done} total={total} />
        ) : error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Done — {total.toLocaleString('en-IN')} row{total === 1 ? '' : 's'} processed.
          </p>
        )}

        {route && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            {active ? 'Keeps running in the background — tap to view' : `View ${label.toLowerCase()}`}
            <ArrowRight className="h-3 w-3" />
          </p>
        )}
      </div>
    </div>
  )
}
