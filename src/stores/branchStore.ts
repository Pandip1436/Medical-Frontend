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
  setActiveBranch: (branchId: string | null) => void
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

      setActiveBranch: (branchId) => {
        const branch = get().branches.find((b) => b.id === branchId) ?? null
        set({ activeBranchId: branchId, activeBranch: branch })
        // Full reload so every page, store, and API call picks up the new branchId cleanly
        window.location.href = '/'
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
