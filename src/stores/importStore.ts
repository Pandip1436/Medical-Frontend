import { create } from 'zustand'
import api from '@/lib/api'

// One in-flight bulk import at a time, run OUTSIDE any React component so it
// survives the import drawer closing / the user navigating away. The drawer
// (while open) and a global floating pill both read progress from here.

export interface ImportChunk {
  /** Request body for this chunk. */
  payload: unknown
  /** How many rows this chunk commits (drives the progress counter). */
  count: number
}

interface RunParams {
  endpoint: string
  /** Display label: 'products' | 'suppliers' | 'customers'. */
  entity: string
  chunks: ImportChunk[]
  total: number
  mergeResults: (results: unknown[]) => unknown
  /** Runs in the store (fires even if the drawer was closed) — do toast + refresh here. */
  onComplete?: (merged: unknown) => void
  onError?: (message: string) => void
}

interface ImportStoreState {
  active: boolean
  entity: string | null
  done: number
  total: number
  result: unknown | null
  error: string | null
  run: (p: RunParams) => Promise<unknown>
  dismiss: () => void
}

export const useImportStore = create<ImportStoreState>((set) => ({
  active: false,
  entity: null,
  done: 0,
  total: 0,
  result: null,
  error: null,

  run: async ({ endpoint, entity, chunks, total, mergeResults, onComplete, onError }) => {
    set({ active: true, entity, done: 0, total, result: null, error: null })
    const results: unknown[] = []
    let done = 0
    try {
      for (const c of chunks) {
        const res = await api.post(endpoint, c.payload)
        results.push(res.data)
        done += c.count
        set({ done })
      }
      const merged = mergeResults(results)
      set({ result: merged, active: false, done: total })
      onComplete?.(merged)
      return merged
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : 'Import failed')
      set({ error: String(msg), active: false })
      onError?.(String(msg))
      throw e
    }
  },

  dismiss: () =>
    set({ active: false, entity: null, done: 0, total: 0, result: null, error: null }),
}))
