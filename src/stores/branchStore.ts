import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'

export interface Branch {
  id: string
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  gstin?: string
  drugLicense?: string
  isActive: boolean
  isDefault: boolean
  createdAt: string
}

interface BranchState {
  branches: Branch[]
  activeBranchId: string | null
  activeBranch: Branch | null
  isLoading: boolean

  fetchBranches: () => Promise<void>
  // `opts.skipNavigate` lets callers (specifically the post-login bootstrap)
  // pin the active branch without the soft-switch redirect to /dashboard,
  // which would otherwise race with the role-aware redirect in App.tsx.
  setActiveBranch: (branchId: string | null, opts?: { skipNavigate?: boolean }) => void
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      branches: [],
      activeBranchId: null,
      activeBranch: null,
      isLoading: false,

      fetchBranches: async () => {
        set({ isLoading: true })
        try {
          const res = await api.get('/branches')
          const branches: Branch[] = res.data?.data ?? res.data ?? []
          set({ branches, isLoading: false })

          // Auto-select default branch if none selected — also the recovery
          // path when a persisted activeBranchId no longer matches anything
          // (branch deleted/recreated, or a stale id left over from another
          // account on a shared browser — branchStore isn't cleared on
          // logout). Without this fallback, activeBranch silently sticks at
          // null forever and the header's branch switcher just disappears,
          // since it's gated entirely on `{activeBranch && (...)}` — every
          // later fetchBranches() call repeats the exact same failure.
          const { activeBranchId } = get()
          const current = activeBranchId
            ? branches.find((b) => b.id === activeBranchId)
            : undefined
          if (current) {
            set({ activeBranch: current })
          } else {
            const def = branches.find((b) => b.isDefault) ?? branches[0]
            if (def) {
              set({ activeBranchId: def.id, activeBranch: def })
              // The id actually changed under us (self-heal, not a plain
              // first-load default-select) — businessProfile was likely
              // already fetched once at app mount against the now-discarded
              // id, so refresh it too. Mirrors the refetch in setActiveBranch.
              if (activeBranchId) {
                void import('@/stores/settingsStore').then(({ useSettingsStore }) => {
                  useSettingsStore.getState().fetchSettings()
                })
              }
            }
          }
        } catch (err) {
          // Previously silent — a flaky /branches request (network blip,
          // Neon cold-start timeout) left activeBranch stuck at null with
          // no visibility into why. Logged so it's diagnosable; deliberately
          // not retried here since every page that needs branches already
          // calls fetchBranches() on its own mount, which naturally retries.
          console.error('[branchStore] fetchBranches failed:', err)
          set({ isLoading: false })
        }
      },

      setActiveBranch: (branchId, opts) => {
        const branch = get().branches.find((b) => b.id === branchId) ?? null
        set({ activeBranchId: branchId, activeBranch: branch })
        // Tell any already-mounted page to refetch its own branch-scoped data
        // (see useBranchRefresh — ~25 pages, including Dashboard, listen for
        // this). Was never actually dispatched anywhere: a page that's
        // already mounted when you switch (most commonly Dashboard, since
        // the soft-switch below always routes there) had no way to know the
        // branch changed and just sat on stale data until its own polling
        // interval happened to tick, or a manual refresh forced a remount.
        window.dispatchEvent(new CustomEvent('pbims:branch-changed'))
        // Soft switch: invalidate cached master data and route back to the
        // dashboard so the user lands on a clean page that will re-fetch
        // against the new branchId. Beats the previous full-page reload
        // (which caused a visible flicker and re-ran auth bootstrap).
        void Promise.all([
          import('@/stores/masterDataStore').then(({ useMasterDataStore }) => {
            useMasterDataStore.setState({
              products: [], customers: [], suppliers: [], purchaseOrders: [],
              batches: [], categories: [], hasLoaded: false,
            })
          }),
          import('@/stores/notificationStore').then(({ useNotificationStore }) => {
            useNotificationStore.setState({ notifications: [] })
            useNotificationStore.getState().fetchNotifications()
          }),
          // businessProfile (Settings → Business) is branch-scoped on the
          // backend (GET /settings/business?branchId=...) but was only ever
          // fetched once at login — the sidebar name and dashboard greeting
          // it drives went stale after switching branches. Re-fetch here so
          // they track the branch you actually just switched to.
          import('@/stores/settingsStore').then(({ useSettingsStore }) => {
            useSettingsStore.getState().fetchSettings()
          }),
          opts?.skipNavigate
            ? Promise.resolve()
            : import('@/lib/router').then(({ navigate }) => navigate('/dashboard')),
        ]).catch(() => { /* best-effort */ })
      },
    }),
    {
      name: 'pbims-branch-storage',
      partialize: (state) => ({
        activeBranchId: state.activeBranchId,
      }),
    }
  )
)
