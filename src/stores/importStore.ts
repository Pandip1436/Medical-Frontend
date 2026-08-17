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

/** One chunk that was sent and rejected. Rows in it were NOT written. */
export interface ChunkFailure {
  /** 0-based position in the chunk list. */
  index: number
  /** Rows this chunk carried — all of them failed together. */
  rows: number
  /** HTTP status, when there was a response at all. */
  status?: number
  message: string
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
  /**
   * Some chunks committed, some did not. `merged` covers only what succeeded,
   * and is null when nothing at all committed. `notAttempted` is rows in
   * chunks the run never sent because it aborted — they are missing too.
   */
  onPartial?: (
    merged: unknown | null,
    failures: ChunkFailure[],
    notAttempted: number,
  ) => void
}

interface ImportStoreState {
  active: boolean
  entity: string | null
  done: number
  total: number
  result: unknown | null
  error: string | null
  failures: ChunkFailure[]
  /** Rows in chunks that were never sent because the run aborted early. */
  notAttempted: number
  run: (p: RunParams) => Promise<unknown>
  dismiss: () => void
}

/**
 * Should the run keep going after this chunk failed?
 *
 * A 4xx means the server looked at these 50 rows and rejected them — the next
 * 50 are unrelated and deserve their chance. A 401/403 means the session is
 * gone, a 5xx means the server is unwell, and no response at all means the
 * network dropped; in each of those, firing the remaining requests just
 * multiplies the damage.
 */
function shouldContinueAfter(status?: number): boolean {
  if (status === undefined) return false // network / no response
  if (status === 401 || status === 403) return false
  return status >= 400 && status < 500
}

/** NestJS ValidationPipe replies with `message: string[]`; axios errors give a string. */
function messageOf(e: unknown): string {
  const err = e as {
    response?: { data?: { message?: string | string[] } }
  }
  const m = err?.response?.data?.message
  if (Array.isArray(m)) return m.slice(0, 3).join('; ')
  if (m) return m
  return e instanceof Error ? e.message : 'Request failed'
}

export const useImportStore = create<ImportStoreState>((set, get) => ({
  active: false,
  entity: null,
  done: 0,
  total: 0,
  result: null,
  error: null,
  failures: [],
  notAttempted: 0,

  // Each chunk is its own request and its own transaction, so a failure is
  // per-chunk, not per-run. This loop used to sit inside one try/catch: the
  // first failure abandoned every remaining chunk AND discarded `results`
  // without merging, so the caller was told nothing about the rows that had
  // already committed. That is how a single dropped request cost 425 rows.
  run: async ({
    endpoint, entity, chunks, total, mergeResults, onComplete, onError, onPartial,
  }) => {
    // One at a time. The store holds a single set of counters, so a second
    // run would overwrite the first's progress and both would report nonsense.
    if (get().active) {
      throw new Error(
        `An import is already running (${get().entity ?? 'records'}). Wait for it to finish.`,
      )
    }
    set({
      active: true, entity, done: 0, total,
      result: null, error: null, failures: [], notAttempted: 0,
    })
    const results: unknown[] = []
    const failures: ChunkFailure[] = []
    let done = 0
    let stoppedAt = -1

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      try {
        const res = await api.post(endpoint, c.payload)
        results.push(res.data)
        done += c.count
        set({ done })
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status
        failures.push({ index: i, rows: c.count, status, message: messageOf(e) })
        set({ failures: [...failures] })
        if (!shouldContinueAfter(status)) {
          stoppedAt = i
          break
        }
      }
    }

    // Rows in chunks we never sent because the run aborted. Counting only the
    // chunks that came back with an error is how an operator gets told
    // "50 rows were not imported" when 2,223 are actually missing — the exact
    // under-report this store exists to prevent.
    const notAttempted =
      stoppedAt === -1
        ? 0
        : chunks.slice(stoppedAt + 1).reduce((n, c) => n + c.count, 0)

    if (failures.length === 0) {
      const merged = mergeResults(results)
      set({ result: merged, active: false, done: total })
      onComplete?.(merged)
      return merged
    }

    // Callers' mergeResults destructures the first element, so an empty list
    // throws — and it would throw HERE, after the loop and outside any caller's
    // try, leaving `active: true` set forever with no way to dismiss the
    // floating pill. Nothing committed means there is nothing to merge.
    const merged = results.length > 0 ? mergeResults(results) : null

    const rejected = failures.reduce((n, f) => n + f.rows, 0)
    const lost = rejected + notAttempted
    const abortedNote =
      notAttempted > 0
        ? `, and it stopped before sending ${chunks.length - stoppedAt - 1} more`
        : ''
    const msg =
      `${failures.length} of ${chunks.length} batches failed${abortedNote} — ` +
      `${lost} of ${total} row${lost === 1 ? '' : 's'} were not imported. ` +
      `First failure: ${failures[0].message}`
    set({ result: merged, failures, notAttempted, active: false, error: msg })
    onPartial?.(merged, failures, notAttempted)
    onError?.(msg)
    // Still throw: the sibling drawers catch this to leave their committing
    // stage. The partial result is on the store for anyone who wants it.
    throw new Error(msg)
  },

  dismiss: () =>
    set({
      active: false, entity: null, done: 0, total: 0,
      result: null, error: null, failures: [], notAttempted: 0,
    }),
}))
