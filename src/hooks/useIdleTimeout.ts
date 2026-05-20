import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'

// Activity signals — any of these resets the timer.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Auto-logout on user inactivity. Reads the threshold from
 * `settingsStore.generalSettings.sessionTimeoutMinutes` (admin-configurable
 * in Settings → General). Mounted once near the top of the authenticated
 * tree (AppLayout) so it runs for every authenticated page.
 *
 * Implementation: a single `setTimeout` that we reset on each activity event.
 * No `setInterval` polling — cheaper, and the activity-event handler is
 * throttled via `lastResetAtRef` to one reset per 5s.
 */
export function useIdleTimeout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)
  const minutes = useSettingsStore((s) => s.generalSettings.sessionTimeoutMinutes)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastResetAtRef = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return
    if (!Number.isFinite(minutes) || minutes <= 0) return

    const ms = minutes * 60 * 1000
    const RESET_THROTTLE_MS = 5_000

    const armTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        logout()
        toast.info(`Signed out after ${minutes} minutes of inactivity.`)
        navigate('/login')
      }, ms)
    }

    const onActivity = () => {
      const now = Date.now()
      if (now - lastResetAtRef.current < RESET_THROTTLE_MS) return
      lastResetAtRef.current = now
      armTimer()
    }

    armTimer()
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity))
    }
  }, [isAuthenticated, minutes, logout])
}
