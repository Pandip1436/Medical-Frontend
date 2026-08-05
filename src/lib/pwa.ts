import { registerSW } from 'virtual:pwa-register'

// Backstop poll interval for a tab that stays open AND focused across a deploy
// (rare — during a maintenance window staff are usually away from the tab, and
// the focus/visibility checks below catch that case instantly). Kept short so
// even a continuously-focused tab lands on the new build within a minute.
const UPDATE_CHECK_INTERVAL_MS = 30 * 1000 // 1 minute

// Update policy: fully automatic. vite.config.ts sets registerType:
// 'autoUpdate', so a newly-deployed service worker skips waiting, activates
// immediately, and the plugin reloads the page onto the new build itself. No
// toast, no prompt — deploys roll out silently and every open tab lands on the
// new build on its own.
//
// Because of that, this module deliberately does NOT pass onNeedRefresh and
// does not call the returned updateSW(): in autoUpdate mode the plugin never
// fires onNeedRefresh, and updateSW() is a no-op — it only sends the
// skip-waiting message in 'prompt' mode. Wiring those up here would look like
// it was driving the update while actually doing nothing.
//
// What this module does own is *when* the browser looks for a new worker.
// That part is not automatic: a long-lived tab would otherwise only check on
// navigation, so a deploy could go unnoticed for hours. Making it effectively
// instant for a maintenance-window deploy:
//   • a fresh page load always gets the latest build;
//   • a tab regaining focus / becoming visible (staff resuming after the hold)
//     checks right then, so it reloads onto the new build immediately;
//   • a 1-minute poll backs up the edge case of a tab left open AND focused.
// Browsers can't let the server push a reload to an open tab, so the tab has
// to check — these three triggers make that as close to instant as possible.
//
// Safe to reload without warning: the two long-lived data-entry forms persist
// their in-progress draft and restore it on load — the billing cart
// (NewSalePage → localStorage) and the purchase-entry draft (GRNPage) — so an
// auto-reload mid-entry doesn't lose work.
export function registerPwa() {
  registerSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => registration.update().catch(() => {})

      // Check immediately on app open.
      check()
      // Backstop poll.
      setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      // The instant a tab regains focus or becomes visible again — e.g. staff
      // resuming after a maintenance-window deploy — check right away so the
      // new build is picked up and auto-reloaded without waiting for the poll.
      window.addEventListener('focus', check)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
