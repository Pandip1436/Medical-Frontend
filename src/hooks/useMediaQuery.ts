import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Tailwind breakpoints
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)')
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)')
}

export function useIsMobileOrTablet() {
  return useMediaQuery('(max-width: 1023px)')
}

// ANY touch device up to tablet width — phone OR tablet (<=1279px CSS px),
// e.g. an iPhone or an iPad Pro. Hides the sidebar entirely behind a
// hamburger sheet and shows the fixed bottom tab bar instead. A non-touch
// window never matches this, no matter how narrow (display scaling or a
// small restored browser window) — it falls through to useIsCompactChrome
// instead, which keeps a docked (just collapsed) sidebar. Only real desktops
// (non-touch, any width) are excluded from the bottom-bar shell.
export function useIsTouchCompact() {
  return useMediaQuery('(hover: none) and (max-width: 1279px)')
}

// Non-touch windows narrower than desktop `xl` (1280px) — a real
// desktop/laptop browser window shrunk by Windows display scaling or just a
// small restored window. Docks a collapsed icon-rail sidebar (with
// overlay-on-expand, see Sidebar.tsx) instead of either the full desktop
// sidebar or the touch-compact bottom-bar shell above. Touch devices never
// reach this — they're always caught by useIsTouchCompact first.
export function useIsCompactChrome() {
  const isTouchCompact = useIsTouchCompact()
  const isNarrow = useMediaQuery('(max-width: 1279px)')
  return !isTouchCompact && isNarrow
}
