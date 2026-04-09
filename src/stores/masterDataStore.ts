import { create } from 'zustand'
import api from '@/lib/api'
import type { Product, Customer } from '@/types'

interface MasterDataState {
  products: Product[]
  batches: any[]
  customers: Customer[]
  isLoading: boolean
  fetchMasterData: () => Promise<void>
}

export const useMasterDataStore = create<MasterDataState>((set) => ({
  products: [],
  batches: [],
  customers: [],
  isLoading: false,

  fetchMasterData: async () => {
    set({ isLoading: true })
    try {
      const [prodRes, custRes] = await Promise.all([
        api.get('/products'),
        api.get('/customers')
      ])
      
      const products = prodRes.data
      const customers = custRes.data
      const batches = products.flatMap((p: any) => p.batches || [])
      
      set({ products, customers, batches, isLoading: false })
    } catch (error) {
      console.error("Failed to fetch master data", error)
      set({ isLoading: false })
    }
  }
}))
