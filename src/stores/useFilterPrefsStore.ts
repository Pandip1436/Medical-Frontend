import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

// Per-user page filter preferences, keyed by page key (e.g. 'billing.sales').
// Persisted two ways:
//   1. localStorage (zustand persist) — instant first paint, same pattern as column prefs.
//   2. Server — GET/PUT /users/me/preferences ({ filters: {...} }).
//      Server state wins on boot so preferences follow the user across devices.

type FilterMap = Record<string, Record<string, unknown>>

interface FilterPrefsState {
  filters: FilterMap
  loaded: boolean
  setFilter: (pageKey: string, filterKey: string, value: unknown) => void
  loadFromServer: () => Promise<void>
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSync(filters: FilterMap) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    api.put('/users/me/preferences', { filters }).catch(() => {
      // offline / transient — localStorage still holds the change
    })
  }, 800)
}

export const useFilterPrefsStore = create<FilterPrefsState>()(
  persist(
    (set, get) => ({
      filters: {},
      loaded: false,

      setFilter: (pageKey, filterKey, value) => {
        const filters: FilterMap = {
          ...get().filters,
          [pageKey]: { ...(get().filters[pageKey] ?? {}), [filterKey]: value },
        }
        set({ filters })
        scheduleSync(filters)
      },

      loadFromServer: async () => {
        try {
          const { data } = await api.get('/users/me/preferences')
          const serverFilters: FilterMap =
            data?.filters && typeof data.filters === 'object'
              ? (data.filters as FilterMap)
              : {}
          set((state) => ({
            filters: { ...state.filters, ...serverFilters },
            loaded: true,
          }))
        } catch {
          set({ loaded: true })
        }
      },
    }),
    {
      name: 'pbims-filter-prefs-storage',
      partialize: (state) => ({ filters: state.filters }),
    },
  ),
)
