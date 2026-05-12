import { create } from 'zustand'
import api from '@/lib/api'
import type { Product, Customer, Batch, Supplier, PurchaseOrder, Category } from '@/types'

interface MasterDataState {
  products: Product[]
  batches: Batch[]
  customers: Customer[]
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  categories: Category[]
  isLoading: boolean
  hasLoaded: boolean   // true once at least one successful fetch completed
  fetchMasterData: () => Promise<void>
  fetchProducts: () => Promise<void>
  fetchCustomers: () => Promise<void>
  fetchSuppliers: () => Promise<void>
  fetchCategories: () => Promise<void>
  addCustomer: (data: any) => Promise<any>
  deleteCustomer: (id: string) => Promise<void>
  updateCustomerLocally: (id: string, partialData: Partial<Customer>) => void
  updateBatchLocally: (batchId: string, adjustmentQty: number) => void
  importCustomers: (customers: any[]) => Promise<any>
  importSuppliers: (suppliers: any[]) => Promise<any>
  importProducts: (products: any[]) => Promise<any>
  importProductsHsn: (items: any[]) => Promise<any>
}

export const useMasterDataStore = create<MasterDataState>((set, get) => ({
  products: [],
  batches: [],
  customers: [],
  suppliers: [],
  purchaseOrders: [],
  categories: [],
  isLoading: false,
  hasLoaded: false,

  fetchMasterData: async () => {
    if (get().isLoading) return  // prevent duplicate in-flight calls
    set({ isLoading: true })
    try {
      const results = await Promise.allSettled([
        api.get('/products'),
        api.get('/customers'),
        api.get('/suppliers'),
        api.get('/purchase-orders'),
      ])

      const [prodRes, custRes, suppRes, poRes] = results

      const products: Product[] = prodRes.status === 'fulfilled'
        ? (prodRes.value.data?.data ?? prodRes.value.data ?? [])
        : get().products

      const customers: Customer[] = custRes.status === 'fulfilled'
        ? (Array.isArray(custRes.value.data) ? custRes.value.data : [])
        : get().customers

      const suppliers: Supplier[] = suppRes.status === 'fulfilled'
        ? (Array.isArray(suppRes.value.data) ? suppRes.value.data : [])
        : get().suppliers

      const purchaseOrders: PurchaseOrder[] = poRes.status === 'fulfilled'
        ? (Array.isArray(poRes.value.data) ? poRes.value.data : (poRes.value.data?.data ?? []))
        : get().purchaseOrders

      const batches: Batch[] = products.flatMap((p: any) =>
        (p.batches || []).map((b: any) => ({ ...b, productName: p.name }))
      )

      set({ products, customers, suppliers, purchaseOrders, batches, hasLoaded: true })
    } catch (error) {
      console.error('Failed to fetch master data', error)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchProducts: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/products')
      const products: Product[] = res.data?.data ?? (Array.isArray(res.data) ? res.data : [])
      const batches: Batch[] = products.flatMap((p: any) =>
        (p.batches || []).map((b: any) => ({ ...b, productName: p.name }))
      )
      set({ products, batches, hasLoaded: true })
    } catch (error) {
      console.error('Failed to fetch products', error)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchCustomers: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/customers')
      const customers: Customer[] = Array.isArray(res.data) ? res.data : []
      set({ customers })
    } catch (error) {
      console.error('Failed to fetch customers', error)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchSuppliers: async () => {
    set({ isLoading: true })
    try {
      const res = await api.get('/suppliers')
      const suppliers: Supplier[] = Array.isArray(res.data) ? res.data : []
      set({ suppliers })
    } catch (error) {
      console.error('Failed to fetch suppliers', error)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchCategories: async () => {
    try {
      const res = await api.get('/categories')
      const categories: Category[] = Array.isArray(res.data) ? res.data : []
      set({ categories })
    } catch {
      // silently fail — categories are non-critical
    }
  },

  addCustomer: async (data: any) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/customers', data)
      const result = res.data
      // If backend queued for approval, don't add to local state
      if (result?.approvalRequested) {
        set({ isLoading: false })
        return result
      }
      set((state) => ({
        customers: [result, ...state.customers],
        isLoading: false,
      }))
      return result
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

  importCustomers: async (customers: any[]) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/customers/bulk', customers)
      await get().fetchCustomers()
      set({ isLoading: false })
      return res.data
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  importProducts: async (products: any[]) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/products/bulk', products)
      await get().fetchProducts()
      set({ isLoading: false })
      return res.data
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  importProductsHsn: async (items: any[]) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/products/bulk-hsn', items)
      await get().fetchProducts()
      set({ isLoading: false })
      return res.data
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  importSuppliers: async (suppliers: any[]) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/suppliers/bulk', suppliers)
      await get().fetchSuppliers()
      set({ isLoading: false })
      return res.data
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
