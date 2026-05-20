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

// Module-scoped in-flight Promise cache. If a fetch is already running for a
// given resource, subsequent callers receive the same Promise instead of
// firing a fresh request. Cleared in the `finally` block of each fetcher.
const inFlight: Record<'products' | 'customers' | 'suppliers' | 'categories', Promise<void> | null> = {
  products: null,
  customers: null,
  suppliers: null,
  categories: null,
}

// Unwrap an API response that may be either `[ ... ]` (raw array) or
// `{ data: [ ... ] }` (wrapped). Used everywhere so behavior is consistent.
function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  const wrapped = (data as { data?: unknown })?.data
  return Array.isArray(wrapped) ? (wrapped as T[]) : []
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
        ? unwrapList<Product>(prodRes.value.data)
        : get().products

      const customers: Customer[] = custRes.status === 'fulfilled'
        ? unwrapList<Customer>(custRes.value.data)
        : get().customers

      const suppliers: Supplier[] = suppRes.status === 'fulfilled'
        ? unwrapList<Supplier>(suppRes.value.data)
        : get().suppliers

      const purchaseOrders: PurchaseOrder[] = poRes.status === 'fulfilled'
        ? unwrapList<PurchaseOrder>(poRes.value.data)
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
    if (inFlight.products) return inFlight.products
    inFlight.products = (async () => {
      set({ isLoading: true })
      try {
        const res = await api.get('/products')
        const products: Product[] = unwrapList<Product>(res.data)
        const batches: Batch[] = products.flatMap((p: any) =>
          (p.batches || []).map((b: any) => ({ ...b, productName: p.name }))
        )
        set({ products, batches, hasLoaded: true })
      } catch (error) {
        console.error('Failed to fetch products', error)
      } finally {
        set({ isLoading: false })
        inFlight.products = null
      }
    })()
    return inFlight.products
  },

  fetchCustomers: async () => {
    if (inFlight.customers) return inFlight.customers
    inFlight.customers = (async () => {
      set({ isLoading: true })
      try {
        const res = await api.get('/customers')
        const customers: Customer[] = unwrapList<Customer>(res.data)
        set({ customers })
      } catch (error) {
        console.error('Failed to fetch customers', error)
      } finally {
        set({ isLoading: false })
        inFlight.customers = null
      }
    })()
    return inFlight.customers
  },

  fetchSuppliers: async () => {
    if (inFlight.suppliers) return inFlight.suppliers
    inFlight.suppliers = (async () => {
      set({ isLoading: true })
      try {
        const res = await api.get('/suppliers')
        const suppliers: Supplier[] = unwrapList<Supplier>(res.data)
        set({ suppliers })
      } catch (error) {
        console.error('Failed to fetch suppliers', error)
      } finally {
        set({ isLoading: false })
        inFlight.suppliers = null
      }
    })()
    return inFlight.suppliers
  },

  fetchCategories: async () => {
    if (inFlight.categories) return inFlight.categories
    inFlight.categories = (async () => {
      try {
        const res = await api.get('/categories')
        const categories: Category[] = unwrapList<Category>(res.data)
        set({ categories })
      } catch {
        // silently fail — categories are non-critical
      } finally {
        inFlight.categories = null
      }
    })()
    return inFlight.categories
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

      // Update parent product totalStock. Guard with `?? 0` so an undefined
      // totalStock can't turn into NaN.
      const newProducts = state.products.map(p => {
        if (p.id === productIdToUpdate) {
          return { ...p, totalStock: (p.totalStock ?? 0) + adjustmentQty }
        }
        return p;
      });

      return { batches: newBatches, products: newProducts }
    })
  }
}))
