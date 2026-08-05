// Recovery from stale-build chunk load failures.
//
// The app is code-split: every page is a lazy import() of a content-hashed
// chunk (assets/DashboardPage-<hash>.js). After a deploy the old hashes are
// gone from the host, but a tab — or a service-worker-precached index.html, or
// an index.html still sitting in the browser HTTP cache — can still be
// referencing them. The import() then fails with either a 404 or, on hosts
// with an SPA catch-all rewrite, a 200 that hands back index.html and trips
// "Expected a JavaScript-or-Wasm module script but the server responded with a
// MIME type of text/html".
//
// Neither failure is recoverable in-page: the running shell is simply the wrong
// version. The fix is to throw away the stale shell — drop the caches, drop the
// service worker, and reload from the network onto the current build.
//
// A reload guard is essential here. If the reload lands on the same stale shell
// (e.g. an unrevalidated CDN edge copy) an unguarded handler would spin the tab
// in an infinite reload loop, which is worse than the error screen. So we
// recover at most once per RELOAD_WINDOW_MS and otherwise let the error surface.

const RELOAD_STAMP_KEY = 'pbims-chunk-recovery-at'
const RELOAD_WINDOW_MS = 60 * 1000
const CACHE_BUST_PARAM = '_v'

// One chunk failure now reaches recovery twice: the vite:preloadError listener
// starts it, and the rethrown error reaches the boundary a moment later. The
// purge is async, so the second call would otherwise hit the reload guard,
// report "suppressed", and drop the boundary onto the error screen while the
// reload it's waiting for is already in flight. This flag lets the second
// caller know a reload is coming and to keep showing "Updating…".
let reloadInFlight = false

/**
 * Does this error mean "the JS chunk I asked for isn't there / isn't JS"?
 *
 * Message text differs per browser and per failure mode, so match broadly —
 * a false positive costs one reload, a false negative leaves the app bricked.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false

  const err = error as { name?: string; message?: string }
  if (err.name === 'ChunkLoadError') return true

  const message = typeof err.message === 'string' ? err.message : String(error)

  return (
    // Chrome / Edge
    /Failed to fetch dynamically imported module/i.test(message) ||
    // Firefox
    /error loading dynamically imported module/i.test(message) ||
    // Safari
    /Importing a module script failed/i.test(message) ||
    // The SPA-rewrite case: host answered a .js request with index.html
    /Failed to load module script/i.test(message) ||
    /expected a javascript(-or-wasm)? module script/i.test(message) ||
    // Vite's CSS preload helper
    /Unable to preload CSS/i.test(message) ||
    // Second-order form of the same failure: when the module never loads,
    // React.lazy is handed an undefined module object and blows up reading
    // `.default` off it. The message names no chunk, so this pattern is the
    // only thing tying it back to a stale build — without it the failure
    // reaches the boundary as a generic app crash and nothing recovers.
    // (Chrome/Firefox wording, then Safari's.)
    /Cannot read propert(?:y|ies) of undefined \(reading '?default'?\)/i.test(message) ||
    /undefined is not an object \(evaluating '.*\.default'\)/i.test(message)
  )
}

function readStamp(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_STAMP_KEY)) || 0
  } catch {
    return 0 // storage blocked (private mode / partitioned) — allow the attempt
  }
}

function writeStamp(at: number) {
  try {
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(at))
  } catch {
    /* no-op */
  }
}

async function purgeStaleShell() {
  // Order matters: kill the service worker first so it can't re-serve the old
  // precached index.html to the reload we're about to trigger.
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(registrations.map((registration) => registration.unregister()))
  } catch {
    /* no SW support, or unregister blocked — the cache purge below still helps */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    /* no-op */
  }
}

/**
 * Drop the stale shell and reload onto the current build.
 *
 * Returns false when the reload guard suppressed the attempt, so callers can
 * fall back to showing an error instead of silently doing nothing.
 */
export async function recoverFromChunkError({ force = false } = {}): Promise<boolean> {
  // A reload is already on its way — report success so the caller keeps the
  // "updating" state rather than falling through to the error screen.
  if (reloadInFlight) return true

  const now = Date.now()
  if (!force && now - readStamp() < RELOAD_WINDOW_MS) return false
  writeStamp(now)
  reloadInFlight = true

  await purgeStaleShell()

  // A plain reload() can still be answered from the HTTP cache with the same
  // stale index.html. A changing query string guarantees a fresh document; the
  // param is stripped again on the next boot (see installChunkErrorRecovery).
  const url = new URL(window.location.href)
  url.searchParams.set(CACHE_BUST_PARAM, String(now))
  window.location.replace(url.toString())
  return true
}

/**
 * Install global handlers for chunk failures that never reach a React error
 * boundary — <link rel="modulepreload"> failures during boot, and rejected
 * import()s outside of render.
 */
export function installChunkErrorRecovery() {
  // Tidy the cache-bust param left by a previous recovery so it doesn't stick
  // to the URL, get bookmarked, or leak into shared links.
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has(CACHE_BUST_PARAM)) {
      url.searchParams.delete(CACHE_BUST_PARAM)
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
  } catch {
    /* no-op */
  }

  // Vite fires this when a modulepreload for a lazy route fails — this is the
  // boot-time version of the failure, before any component renders.
  //
  // Deliberately NOT calling event.preventDefault() here. Vite's preload helper
  // is `return baseModule().catch(reportPreloadError)`, and reportPreloadError
  // only rethrows when the event was left un-prevented. Preventing it makes the
  // catch swallow the error and return undefined, so the import() *resolves
  // with undefined* — React.lazy then dies on `undefined.default`, a TypeError
  // that names no chunk and reads like an app bug. Letting Vite rethrow keeps
  // the real "failed to load module script" error attached to the import, so
  // the error boundary can identify it and show "Updating…" instead of
  // "Something went wrong".
  //
  // Recovery still starts here rather than waiting for the rethrow: purging the
  // service worker and caches is async, so kicking it off at the earliest
  // signal gets the reload going sooner. The rethrown error is handled below
  // (unhandledrejection) or by the boundary; recoverFromChunkError's own guard
  // makes the duplicate call a no-op.
  window.addEventListener('vite:preloadError', () => {
    void recoverFromChunkError()
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault()
      void recoverFromChunkError()
    }
  })

  window.addEventListener('error', (event) => {
    if (isChunkLoadError(event.error ?? event.message)) {
      void recoverFromChunkError()
    }
  })
}
