import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'

// How often to ask the browser to re-check for a new service worker while
// the app stays open (e.g. a desk/reception instance left open all day).
// Without this, an update deployed mid-session only surfaces the next time
// the tab/app is fully closed and reopened.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// Manual registration (vite.config.ts sets injectRegister: null) so an
// available update surfaces as a dismissible toast instead of silently
// swapping the app under an in-progress form.
export function registerPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('A new version of PBIMS is available', {
        duration: Infinity,
        action: {
          label: 'Refresh',
          onClick: () => updateSW(true),
        },
      })
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        // A failed check (e.g. offline) just retries next interval — no need
        // to surface it, the user isn't blocked on anything.
        registration.update().catch(() => {})
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })
}
