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

// Touch devices (no hover) narrower than desktop `xl` (1280px) — real
// tablets like an iPad Pro at 1024px land here, but a desktop/laptop
// browser window resized to the same width never matches (it has
// `hover: hover`), so desktop layout stays untouched.
export function useIsCompactTouchDevice() {
  return useMediaQuery('(hover: none) and (max-width: 1279px)')
}

// Any viewport narrower than desktop `xl` (1280px), regardless of input type.
// Used to hide the side rail and switch to the fixed bottom tab bar on ALL
// phones and tablets — including desktop browsers resized narrow for testing,
// which the touch-only check above deliberately ignores. Real desktops
// (>=1280px) keep the sidebar.
export function useIsCompactViewport() {
  return useMediaQuery('(max-width: 1279px)')
}
