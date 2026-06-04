import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

// Per-user table column visibility, keyed by a stable table key (e.g.
// 'billing.sales'). Each value is the list of *visible* column ids for that
// table. Persisted two ways:
//   1. localStorage (zustand persist) — instant correct first paint, same
//      pattern as settingsStore's cached generalSettings.
//   2. The user's account — GET/PUT /users/me/preferences ({ columns: {...} }),
//      so choices follow them across devices. Server state wins on boot.

type ColumnsMap = Record<string, string[]>

interface ColumnPrefsState {
  prefs: ColumnsMap
  loaded: boolean
  setTable: (tableKey: string, visibleIds: string[]) => void
  loadFromServer: () => Promise<void>
}

// Debounced server sync — coalesces rapid toggles into one PUT. Sends the whole
// columns map so the server row is always the full canonical copy.
let syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSync(columns: ColumnsMap) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    api.put('/users/me/preferences', { columns }).catch(() => {
      /* offline / transient — localStorage still holds the change; retried on next toggle */
    })
  }, 600)
}

export const useColumnPrefsStore = create<ColumnPrefsState>()(
  persist(
    (set, get) => ({
      prefs: {},
      loaded: false,

      setTable: (tableKey, visibleIds) => {
        const prefs = { ...get().prefs, [tableKey]: visibleIds }
        set({ prefs })
        scheduleSync(prefs)
      },

      loadFromServer: async () => {
        try {
          const { data } = await api.get('/users/me/preferences')
          const cols =
            data && typeof data === 'object' && data.columns && typeof data.columns === 'object'
              ? (data.columns as ColumnsMap)
              : {}
          // Server wins over the local cache for any table it knows about.
          set((state) => ({ prefs: { ...state.prefs, ...cols }, loaded: true }))
        } catch {
          set({ loaded: true })
        }
      },
    }),
    {
      name: 'pbims-column-prefs-storage',
      // Only the prefs map is cached; `loaded` always re-resolves from the server on boot.
      partialize: (state) => ({ prefs: state.prefs }),
    },
  ),
)
