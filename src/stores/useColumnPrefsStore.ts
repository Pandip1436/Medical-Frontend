import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

// Per-user table column visibility + card-field positioning, keyed by a stable
// table key (e.g. 'billing.sales'). Persisted two ways:
//   1. localStorage (zustand persist) — instant correct first paint.
//   2. The user's account — GET/PUT /users/me/preferences ({ columns, positions }),
//      so choices follow them across devices. Server state wins on boot.

type ColumnsMap = Record<string, string[]>
type PositionsMap = Record<string, Record<string, 'left' | 'right'>>

interface ColumnPrefsState {
  prefs: ColumnsMap
  positions: PositionsMap
  loaded: boolean
  setTable: (tableKey: string, visibleIds: string[]) => void
  setPosition: (tableKey: string, fieldId: string, position: 'left' | 'right') => void
  loadFromServer: () => Promise<void>
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSync(columns: ColumnsMap, positions: PositionsMap) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    api.put('/users/me/preferences', { columns, positions }).catch(() => {
      /* offline / transient — localStorage still holds the change */
    })
  }, 600)
}

export const useColumnPrefsStore = create<ColumnPrefsState>()(
  persist(
    (set, get) => ({
      prefs: {},
      positions: {},
      loaded: false,

      setTable: (tableKey, visibleIds) => {
        const prefs = { ...get().prefs, [tableKey]: visibleIds }
        set({ prefs })
        scheduleSync(prefs, get().positions)
      },

      setPosition: (tableKey, fieldId, position) => {
        const positions: PositionsMap = {
          ...get().positions,
          [tableKey]: { ...(get().positions[tableKey] ?? {}), [fieldId]: position },
        }
        set({ positions })
        scheduleSync(get().prefs, positions)
      },

      loadFromServer: async () => {
        try {
          const { data } = await api.get('/users/me/preferences')
          const cols: ColumnsMap =
            data?.columns && typeof data.columns === 'object'
              ? (data.columns as ColumnsMap)
              : {}
          const pos: PositionsMap =
            data?.positions && typeof data.positions === 'object'
              ? (data.positions as PositionsMap)
              : {}
          set((state) => ({
            prefs: { ...state.prefs, ...cols },
            positions: { ...state.positions, ...pos },
            loaded: true,
          }))
        } catch {
          set({ loaded: true })
        }
      },
    }),
    {
      name: 'pbims-column-prefs-storage',
      partialize: (state) => ({ prefs: state.prefs, positions: state.positions }),
    },
  ),
)
