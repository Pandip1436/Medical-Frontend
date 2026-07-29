import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

// How often to ask the browser to re-check for a new service worker while
// the app stays open (e.g. a desk/reception instance left open all day).
// Without this, an update deployed mid-session only surfaces the next time
// the tab/app is fully closed and reopened.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// Once an update is waiting, how long the user must be inactive before it
// applies itself. Long enough that we're confident they've stepped away from
// any in-progress form (billing / GRN entry) rather than just pausing to
// think — any real activity resets the countdown, so we never reload mid-edit.
const IDLE_REFRESH_MS = 3 * 60 * 1000 // 3 minutes

// User-activity signals that reset the idle countdown. `scroll` catches
// long-page reading; pointermove/wheel catch mouse use without clicking.
const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'pointermove',
  'wheel',
  'touchstart',
  'scroll',
] as const

// Manual registration (vite.config.ts sets injectRegister: null) so we can
// drive the update ourselves: a new version applies automatically once the
// user is idle, with a "Refresh now" toast for anyone who wants it sooner.
export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      let idleTimer = 0
      let applied = false

      // Reset the idle countdown on any activity.
      function bump() {
        window.clearTimeout(idleTimer)
        idleTimer = window.setTimeout(apply, IDLE_REFRESH_MS)
      }
      function cleanup() {
        window.clearTimeout(idleTimer)
        for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, bump)
      }
      // Activate the waiting service worker and reload onto the new version.
      // Guarded so the idle timer and the "Refresh now" button can't both fire.
      function apply() {
        if (applied) return
        applied = true
        cleanup()
        void updateSW(true)
      }

      bump() // start the countdown immediately (from the moment the update lands)
      for (const ev of ACTIVITY_EVENTS) {
        window.addEventListener(ev, bump, { passive: true })
      }

      toast('A new version of PBIMS is available', {
        description: "It'll refresh automatically once you're idle.",
        duration: Infinity,
        action: {
          label: 'Refresh now',
          onClick: apply,
        },
      })
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Check for a newer version immediately on app open, so a just-deployed
      // update surfaces its toast right away instead of waiting for the first
      // 30-minute sweep (or the browser's own opaque revalidation timing).
      registration.update().catch(() => {})
      setInterval(() => {
        // A failed check (e.g. offline) just retries next interval — no need
        // to surface it, the user isn't blocked on anything.
        registration.update().catch(() => {})
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })
}
