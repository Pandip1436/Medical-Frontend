import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/lib/api'
import { toast } from 'sonner'

interface BusinessProfile {
  id?: string
  name: string
  address: string
  phone: string
  email: string
  gstin: string
  drugLicense: string
  invoicePrefix?: string
}

interface DiscountRule {
  id: string
  name: string
  type: 'PERCENTAGE' | 'FLAT'
  value: number
  applicableTo?: string
  validFrom?: string
  validTo?: string
  isActive: boolean
}

// Generic JSON-shaped bag for settings entries. Callers know the concrete
// shape per-key (e.g. notification_settings, barcode_settings).
type SettingBag = Record<string, unknown>

interface SettingsState {
  businessProfile: BusinessProfile | null
  taxSettings: SettingBag | null
  discountRules: DiscountRule[]
  isLoading: boolean

  // Actions
  fetchSettings: () => Promise<void>
  updateBusinessProfile: (data: Partial<BusinessProfile>) => Promise<void>

  fetchDiscountRules: () => Promise<void>
  addDiscountRule: (data: Omit<DiscountRule, 'id'>) => Promise<void>
  updateDiscountRule: (id: string, data: Partial<DiscountRule>) => Promise<void>
  deleteDiscountRule: (id: string) => Promise<void>

  // Generic key-value setting accessor. Callers cast the returned bag to the
  // expected shape per setting key. Default of `any` preserves backwards
  // compatibility with existing call sites that do dot-access on the result.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSetting: <T = any>(key: string) => Promise<T | null>
  updateSetting: (key: string, value: SettingBag) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      businessProfile: null,
      taxSettings: null,
      discountRules: [],
      isLoading: false,

      fetchSettings: async () => {
        set({ isLoading: true })
        try {
          const res = await api.get('/settings/business')
          if (res.data) {
            // Map backend 'name' to what frontend might expect if needed
            set({ businessProfile: res.data })
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error)
        } finally {
          set({ isLoading: false })
        }
      },

      updateBusinessProfile: async (data: Partial<BusinessProfile> & { companyName?: string }) => {
        try {
          set({ isLoading: true })
          // Map frontend companyName back to name if necessary
          const payload: Partial<BusinessProfile> = {
            ...data,
            name: data.companyName || data.name || '',
          }
          await api.put('/settings/business', payload)

          set((state) => ({
            businessProfile: state.businessProfile
              ? { ...state.businessProfile, ...payload }
              : (payload as BusinessProfile),
          }))
          toast.success('Business profile updated')
        } catch (error) {
          console.error('Failed to update business profile:', error)
          toast.error('Failed to update business profile')
          throw error
        } finally {
          set({ isLoading: false })
        }
      },

      fetchDiscountRules: async () => {
        try {
          const res = await api.get('/settings/discounts')
          set({ discountRules: res.data || [] })
        } catch (error) {
          console.error('Failed to fetch discount rules:', error)
        }
      },

      addDiscountRule: async (data) => {
        try {
          const res = await api.post('/settings/discounts', data)
          set((state) => ({
            discountRules: [...state.discountRules, res.data]
          }))
          toast.success('Discount rule added')
        } catch {
          toast.error('Failed to add discount rule')
        }
      },

      updateDiscountRule: async (id, data) => {
        try {
          await api.patch(`/settings/discounts/${id}`, data)
          set((state) => ({
            discountRules: state.discountRules.map(r => r.id === id ? { ...r, ...data } : r)
          }))
          toast.success('Discount rule updated')
        } catch {
          toast.error('Failed to update discount rule')
        }
      },

      deleteDiscountRule: async (id) => {
        try {
          await api.delete(`/settings/discounts/${id}`)
          set((state) => ({
            discountRules: state.discountRules.filter(r => r.id !== id)
          }))
          toast.success('Discount rule deleted')
        } catch {
          toast.error('Failed to delete discount rule')
        }
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getSetting: async <T = any>(key: string): Promise<T | null> => {
        try {
          const res = await api.get(`/settings/${key}`)
          return (res.data ?? null) as T | null
        } catch (error) {
          console.error(`Failed to fetch setting ${key}:`, error)
          return null
        }
      },

      updateSetting: async (key: string, value: SettingBag) => {
        try {
          await api.put(`/settings/${key}`, value)
          toast.success('Settings saved')
        } catch {
          toast.error('Failed to save settings')
        }
      }
    }),
    {
      name: 'pbims-settings-storage',
      partialize: (state) => ({
        businessProfile: state.businessProfile,
      }),
    }
  )
)
