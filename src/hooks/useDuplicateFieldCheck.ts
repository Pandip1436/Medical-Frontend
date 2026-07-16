import { useEffect } from 'react'
import api from '@/lib/api'

// One field to live-check for "already used" against a backend endpoint that
// returns `{ [responseKey]: { taken: boolean; name: string } }` per field.
export interface DuplicateCheckField {
  /** react-hook-form field name to set/clear the error on. */
  name: string
  /** Query-param name sent to the endpoint (e.g. 'gstin', 'dlNumber'). */
  param: string
  /** Key in the response object for this field. */
  responseKey: string
  /** Current (trimmed) value. */
  value: string
  /** Only check once the value passes its own format validation. */
  valid: boolean
  /** Human label for the message (e.g. 'GSTIN', 'Drug License'). */
  label: string
}

/**
 * Debounced live duplicate check shared by the supplier + customer forms.
 *
 * For each field whose value is format-valid, it queries `endpoint` (500 ms
 * after the last keystroke) and, when the backend reports the value is taken,
 * pins an inline `type: 'server'` error to that field — e.g. "Another customer
 * (X) already uses this GSTIN in this branch." When the value is free it clears
 * the error. In-flight requests abort on each change so a stale response can't
 * clobber a newer format error.
 */
export function useDuplicateFieldCheck(opts: {
  /** Skip entirely when false (e.g. dialog closed). */
  enabled: boolean
  /** Backend check endpoint, e.g. '/customers/check-duplicate'. */
  endpoint: string
  /** Entity word used in the message, e.g. 'customer' / 'supplier'. */
  entity: string
  /** Record being edited — excluded from the match so it never flags itself. */
  excludeId?: string
  fields: DuplicateCheckField[]
  setError: (name: any, error: { type: 'server'; message: string }) => void // eslint-disable-line @typescript-eslint/no-explicit-any
  clearErrors: (name: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { enabled, endpoint, entity, excludeId, fields, setError, clearErrors } = opts

  // Only the format-valid, non-empty fields are worth checking. A stable string
  // key drives the effect so it re-runs exactly when a checkable value changes.
  const active = fields.filter((f) => f.valid && f.value.trim().length > 0)
  const depKey = active.map((f) => `${f.param}=${f.value.trim()}`).join('|')

  useEffect(() => {
    if (!enabled || active.length === 0) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const params: Record<string, string> = {}
        for (const f of active) params[f.param] = f.value.trim()
        if (excludeId) params.excludeId = excludeId
        const res = await api.get(endpoint, {
          params,
          signal: controller.signal,
          suppressGlobalToast: true,
        } as Record<string, unknown>)
        const data = (res.data ?? {}) as Record<string, { taken: boolean; name: string } | undefined>
        for (const f of active) {
          const hit = data[f.responseKey]
          if (hit?.taken) {
            setError(f.name, {
              type: 'server',
              message: `Another ${entity} (${hit.name}) already uses this ${f.label} in this branch.`,
            })
          } else {
            clearErrors(f.name)
          }
        }
      } catch {
        /* aborted or offline — submit-time check still guards the save */
      }
    }, 500)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, enabled, endpoint, entity, excludeId])
}
