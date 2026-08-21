import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { handleApiError } from '@/lib/api'
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

// App-wide preferences (persisted as JSON under the `general_settings` key in
// the backend GlobalSetting key-value table). All four fields are consumed by
// real code: see utils.ts (dateFormat), NewSalePage (autoPrint, fefoEnforcement),
// and useIdleTimeout (sessionTimeoutMinutes).
export type DateFormat = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd' | 'dd-mmm-yyyy'

export interface GeneralSettings {
  dateFormat: DateFormat
  autoPrint: boolean
  fefoEnforcement: boolean
  sessionTimeoutMinutes: number
  // Master switch for the whole inventory side of the app (admin-only, set in
  // Settings → General → Inventory). TRUE is the historical behaviour: a sale
  // must pick a batch that holds enough stock, and billing decrements it.
  //
  // FALSE puts the app in "infinite stock" mode, for operators who never record
  // purchases and only ever sell. Then: no batch is required on a sale line, no
  // quantity is clamped, batches and totalStock are frozen (never mutated), and
  // out-of-stock / low-stock signals are hidden because every product would
  // otherwise read as permanently out of stock. Batch No. and Expiry become
  // free-text fields the operator fills in per line so the printed invoice can
  // still carry them.
  //
  // The backend enforces the same flag off the same GlobalSetting row — see
  // SettingsService.isStockTrackingEnabled. This copy only drives the UI.
  stockTracking: boolean
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  dateFormat: 'dd/mm/yyyy',
  autoPrint: true,
  fefoEnforcement: true,
  sessionTimeoutMinutes: 60,
  // Defaults ON so an install that predates this setting keeps stock control.
  stockTracking: true,
}

// What the printed invoice / challan shows. Persisted under the
// `invoice_settings` GlobalSetting key and read by BOTH renderers: this app's
// jsPDF generator (lib/pdf/invoicePdf.ts, used for browser Print / Save as PDF)
// and the backend Handlebars template (used for the WhatsApp attachment). They
// are separate implementations of the same document, so a change here has to be
// applied to both or the two copies drift apart.
//
// Kept in the store (not fetched per call) because PDF generation is
// synchronous — invoicePdf.ts reads it via getState(), exactly as it already
// reads businessProfile.
export interface InvoicePrintSettings {
  documentTitle: string
  hideBusinessGstin: boolean
  hideBusinessDl: boolean
  hideCustomerGstin: boolean
  hideCustomerDl: boolean
  gpay: Array<{ name: string; number: string }>
  bankName: string
  bankAccountNumber: string
  bankIfsc: string
}

// Mirrors InvoicePdfService.getPrintOptions() on the backend. Keep the two in
// step: they are the fallbacks an install sees before anything is configured.
export const DEFAULT_INVOICE_PRINT: InvoicePrintSettings = {
  documentTitle: 'DELIVERY CHALLAN',
  hideBusinessGstin: false,
  hideBusinessDl: false,
  hideCustomerGstin: false,
  hideCustomerDl: false,
  gpay: [],
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
}

// Generic JSON-shaped bag for settings entries. Callers know the concrete
// shape per-key (e.g. notification_settings, barcode_settings).
type SettingBag = Record<string, unknown>

interface SettingsState {
  businessProfile: BusinessProfile | null
  taxSettings: SettingBag | null
  generalSettings: GeneralSettings
  isLoading: boolean

  // Actions
  fetchSettings: () => Promise<void>
  updateBusinessProfile: (data: Partial<BusinessProfile>) => Promise<void>

  fetchGeneralSettings: () => Promise<void>
  updateGeneralSettings: (data: Partial<GeneralSettings>) => Promise<void>

  invoicePrint: InvoicePrintSettings
  fetchInvoicePrintSettings: () => Promise<void>

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
      generalSettings: DEFAULT_GENERAL_SETTINGS,
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
          // Suppress the global interceptor toast so we can render our own
          // contextual one ("business profile") on failure without duplicating.
          await api.put('/settings/business', payload, { suppressGlobalToast: true } as any)

          set((state) => ({
            businessProfile: state.businessProfile
              ? { ...state.businessProfile, ...payload }
              : (payload as BusinessProfile),
          }))
          toast.success('Business profile updated')
        } catch (error) {
          toast.error('Failed to update business profile')
          throw error
        } finally {
          set({ isLoading: false })
        }
      },

      fetchGeneralSettings: async () => {
        try {
          const res = await api.get('/settings/general_settings')
          // Backend returns `{}` when the key doesn't exist yet — merge onto
          // defaults so all four fields are always present.
          const raw = (res.data && typeof res.data === 'object') ? res.data : {}
          set({ generalSettings: { ...DEFAULT_GENERAL_SETTINGS, ...raw } })
        } catch (error) {
          console.error('Failed to fetch general settings:', error)
        }
      },

      invoicePrint: DEFAULT_INVOICE_PRINT,

      fetchInvoicePrintSettings: async () => {
        try {
          const res = await api.get('/settings/invoice_settings')
          const raw = (res.data && typeof res.data === 'object' ? res.data : {}) as Partial<InvoicePrintSettings>
          set({
            invoicePrint: {
              ...DEFAULT_INVOICE_PRINT,
              ...raw,
              // Normalise here so the PDF code never has to defend against a
              // malformed array — it runs mid-render with nowhere to report.
              gpay: Array.isArray(raw.gpay)
                ? raw.gpay
                    .map((g) => ({ name: String(g?.name ?? '').trim(), number: String(g?.number ?? '').trim() }))
                    .filter((g) => g.name || g.number)
                : [],
            },
          })
        } catch (error) {
          console.error('Failed to fetch invoice print settings:', error)
        }
      },

      updateGeneralSettings: async (data) => {
        try {
          const next = { ...DEFAULT_GENERAL_SETTINGS, ...(useSettingsStore.getState().generalSettings), ...data }
          await api.put('/settings/general_settings', next)
          set({ generalSettings: next })
          toast.success('General settings saved')
        } catch (err) {
          handleApiError(err, 'Failed to save general settings')
          throw new Error('save_failed')
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
          await api.put(`/settings/${key}`, value, { suppressGlobalToast: true } as any)
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
        // Persist generalSettings so date format / FEFO toggle / etc. are
        // available synchronously on first paint (before the network fetch
        // completes). The fetchGeneralSettings() call still runs on app boot
        // and overwrites with fresh server state.
        generalSettings: state.generalSettings,
        // Persisted for the same reason as generalSettings: PDF generation is
        // synchronous and can fire before the boot fetch resolves, and a
        // freshly-loaded tab must not print last-week's defaults.
        invoicePrint: state.invoicePrint,
      }),
      // Zustand's default merge is shallow, so a `generalSettings` object
      // persisted before a new field existed would REPLACE the defaults
      // wholesale and leave that field `undefined` until the network fetch
      // lands. For a boolean like `stockTracking` an undefined first paint
      // reads as "off" and would briefly drop every stock guard in the sale
      // screen. Re-merge onto the defaults so a missing field always falls back
      // to its default rather than undefined.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>
        return {
          ...current,
          ...saved,
          generalSettings: {
            ...DEFAULT_GENERAL_SETTINGS,
            ...(saved.generalSettings ?? {}),
          },
          invoicePrint: {
            ...DEFAULT_INVOICE_PRINT,
            ...(saved.invoicePrint ?? {}),
          },
        }
      },
    }
  )
)

// Is the app counting stock at all? Read this instead of reaching into
// generalSettings directly — see GeneralSettings.stockTracking for what the
// two modes mean. Component-level subscription: re-renders on an admin flip.
export const useStockTracking = () =>
  useSettingsStore((s) => s.generalSettings.stockTracking)

// Non-reactive read, for event handlers and callbacks that just need the
// current value (mirrors how NewSalePage reads fefoEnforcement/autoPrint).
export const isStockTrackingOn = () =>
  useSettingsStore.getState().generalSettings.stockTracking !== false
