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

          // Auto-select default branch if none selected
          const { activeBranchId } = get()
          if (!activeBranchId) {
            const def = branches.find((b) => b.isDefault) ?? branches[0]
            if (def) {
              set({ activeBranchId: def.id, activeBranch: def })
            }
          } else {
            const current = branches.find((b) => b.id === activeBranchId)
            set({ activeBranch: current ?? null })
          }
        } catch {
          set({ isLoading: false })
        }
      },

      setActiveBranch: (branchId, opts) => {
        const branch = get().branches.find((b) => b.id === branchId) ?? null
        set({ activeBranchId: branchId, activeBranch: branch })
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
