import { useEffect, useRef } from 'react'
import { navigate } from '@/lib/router'

interface ShortcutMap {
  [key: string]: () => void
}

/**
 * Register global keyboard shortcuts.
 * Keys are formatted as "ctrl+k", "f1", "alt+n", etc.
 *
 * Callers commonly pass an inline object literal which would re-bind the
 * keydown listener on every render. We stash the latest map in a ref and
 * register a single stable handler so binding happens exactly once.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  const ref = useRef(shortcuts)
  ref.current = shortcuts

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // IME composition / synthetic events can fire keydown without `key`.
      if (!e.key) return
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      parts.push(e.key.toLowerCase())
      const combo = parts.join('+')

      const fn = ref.current[combo]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}

/**
 * Pre-configured global shortcuts for the app.
 * Ctrl+N / F1 = New Sale, F2 = New Purchase, Ctrl+K = Command Palette, etc.
 * (Ctrl covers Cmd on Mac — see the handler above.)
 */
const GLOBAL_SHORTCUTS: ShortcutMap = {
  'ctrl+n': () => navigate('/billing/new'),
  f1: () => navigate('/billing/new'),
  f2: () => navigate('/purchase/orders'),
}

export function useGlobalShortcuts() {
  useKeyboardShortcuts(GLOBAL_SHORTCUTS)
}
