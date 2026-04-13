import { create } from 'zustand'
import api from '@/lib/api'
import type { Product, Customer, Batch, Supplier, PurchaseOrder } from '@/types'

interface MasterDataState {
  products: Product[]
  batches: Batch[]
  customers: Customer[]
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  isLoading: boolean
  fetchMasterData: () => Promise<void>
}

export const useMasterDataStore = create<MasterDataState>((set) => ({
  products: [],
  batches: [],
  customers: [],
  suppliers: [],
  purchaseOrders: [],
  isLoading: false,

  fetchMasterData: async () => {
    set({ isLoading: true })
    try {
      const [prodRes, custRes, suppRes, poRes] = await Promise.all([
        api.get('/products'),
        api.get('/customers'),
        api.get('/suppliers'),
        api.get('/purchase-orders')
      ])

      const products = prodRes.data
      const customers = custRes.data
      const suppliers = suppRes.data
      const purchaseOrders = poRes.data
      const batches = products.flatMap((p: any) => p.batches || [])

      set({ products, customers, suppliers, purchaseOrders, batches, isLoading: false })
    } catch (error) {
      console.error("Failed to fetch master data", error)
      set({ isLoading: false })
    }
  }
}))
