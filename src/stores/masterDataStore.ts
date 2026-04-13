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
  fetchProducts: () => Promise<void>
  fetchCustomers: () => Promise<void>
  fetchSuppliers: () => Promise<void>
  addCustomer: (data: any) => Promise<any>
  deleteCustomer: (id: string) => Promise<void>
  updateCustomerLocally: (id: string, partialData: Partial<Customer>) => void
  updateBatchLocally: (batchId: string, adjustmentQty: number) => void
}

export const useMasterDataStore = create<MasterDataState>((set, get) => ({
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

      const products = prodRes.data.data || prodRes.data // Handle pagination wrapper
      const customers = custRes.data
      const suppliers = suppRes.data
      const purchaseOrders = poRes.data
      const batches = products.flatMap((p: any) =>
        (p.batches || []).map((b: any) => ({ ...b, productName: p.name }))
      )

      set({ products, customers, suppliers, purchaseOrders, batches, isLoading: false })
    } catch (error) {
      console.error("Failed to fetch master data", error)
      set({ isLoading: false })
    }
  },

  fetchProducts: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/products')
      const products = res.data.data || res.data // Handle pagination wrapper
      // Enrich each batch with its parent product name for easy display
      const batches = products.flatMap((p: any) =>
        (p.batches || []).map((b: any) => ({ ...b, productName: p.name }))
      )
      set({ products, batches, isLoading: false })
    } catch (error) {
      console.error("Failed to fetch products", error)
      set({ isLoading: false })
    }
  },

  fetchCustomers: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/customers')
      set({ customers: res.data, isLoading: false })
    } catch (error) {
      console.error("Failed to fetch customers", error)
      set({ isLoading: false })
    }
  },

  fetchSuppliers: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/suppliers')
      set({ suppliers: res.data, isLoading: false })
    } catch (error) {
      console.error("Failed to fetch suppliers", error)
      set({ isLoading: false })
    }
  },

  addCustomer: async (data: any) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/customers', data)
      const newCustomer = res.data
      set((state) => ({ 
        customers: [newCustomer, ...state.customers],
        isLoading: false 
      }))
      return newCustomer
    } catch (error) {
      console.error("Failed to add customer", error)
      set({ isLoading: false })
      throw error
    }
  },

  deleteCustomer: async (id: string) => {
    set({ isLoading: true })
    try {
      await api.delete(`/customers/${id}`)
      set((state) => ({
        customers: state.customers.filter(c => c.id !== id),
        isLoading: false
      }))
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  updateCustomerLocally: (id: string, partialData: Partial<Customer>) => {
    set((state) => ({
      customers: state.customers.map(c => 
        c.id === id ? { ...c, ...partialData } : c
      )
    }))
  },

  updateBatchLocally: (batchId: string, adjustmentQty: number) => {
    set((state) => {
      let productIdToUpdate: string | null = null;
      // Update batch quantity
      const newBatches = state.batches.map(b => {
        if (b.id === batchId) {
          productIdToUpdate = b.productId;
          return { ...b, quantity: b.quantity + adjustmentQty }
        }
        return b;
      });

      // Update parent product totalStock
      const newProducts = state.products.map(p => {
        if (p.id === productIdToUpdate) {
          return { ...p, totalStock: p.totalStock + adjustmentQty }
        }
        return p;
      });

      return { batches: newBatches, products: newProducts }
    })
  }
}))
