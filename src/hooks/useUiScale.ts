import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

/**
 * Applies the user's display-scale preference by scaling the ROOT font-size.
 * Because this app is Tailwind v4 (spacing, sizing and most text are `rem`),
 * shrinking the root font-size shrinks the whole UI proportionally — without
 * any coordinate transform, so popover/dropdown positioning (Radix Floating UI)
 * and viewport units (dvh/vh) keep working. This counteracts Windows/OS display
 * scaling, which otherwise makes a dense ERP feel oversized/cramped at e.g. 150%.
 * (CSS `zoom` was tried first but broke all floating-element positioning.)
 *
 * Mounted once at the App root so it covers the login screen and the whole app.
 * In 'auto' mode it re-resolves when devicePixelRatio changes (window moved to
 * a monitor with different scaling, or OS scale changed).
 */
export function useUiScale() {
  const uiScale = useAuthStore((s) => s.uiScale)
  const resolvedUiScale = useAuthStore((s) => s.resolvedUiScale)

  useEffect(() => {
    const apply = () => {
      const factor = resolvedUiScale()
      // Percentage of the browser's default font-size; respects a user's own
      // browser font preference. Empty string = leave the default (factor 1).
      document.documentElement.style.fontSize = factor === 1 ? '' : `${factor * 100}%`
    }
    apply()

    // Only 'auto' depends on devicePixelRatio; fixed factors never change.
    if (uiScale !== 'auto') return

    const dpr = window.devicePixelRatio || 1
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    // When dpr changes this query stops matching and fires once; re-applying
    // re-registers a fresh query for the new dpr.
    mq.addEventListener('change', apply)
    window.addEventListener('resize', apply)
    return () => {
      mq.removeEventListener('change', apply)
      window.removeEventListener('resize', apply)
    }
  }, [uiScale, resolvedUiScale])
}
