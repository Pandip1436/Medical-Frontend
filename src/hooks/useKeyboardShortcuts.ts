import { useEffect } from 'react'
import { navigate } from '@/lib/router'

interface ShortcutMap {
  [key: string]: () => void
}

/**
 * Register global keyboard shortcuts.
 * Keys are formatted as "ctrl+k", "f1", "alt+n", etc.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      parts.push(e.key.toLowerCase())
      const combo = parts.join('+')

      if (shortcuts[combo]) {
        e.preventDefault()
        shortcuts[combo]()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [shortcuts])
}

/**
 * Pre-configured global shortcuts for the app.
 * F1 = New Sale, F2 = New Purchase, Ctrl+K = Command Palette, etc.
 */
export function useGlobalShortcuts() {
  useKeyboardShortcuts({
    f1: () => navigate('/billing/new'),
    f2: () => navigate('/purchase/orders'),
  })
}
