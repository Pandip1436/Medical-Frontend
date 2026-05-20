import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InvoiceItem, PaymentMode, BillingType } from '@/types'

interface CurrentBill {
  invoiceNumber: string
  date: string
  billingType: BillingType
  customerId?: string
  customerName: string
  customerPhone?: string
  doctorName?: string
  items: InvoiceItem[]
  subtotal: number
  productDiscount: number
  taxableAmount: number
  cgst: number
  sgst: number
  igst: number
  deliveryCharge: number
  roundOff: number
  grandTotal: number
  paymentMode: PaymentMode
  paymentDetails?: Record<string, unknown>
  amountPaid: number
  changeReturned: number
}

interface Bill extends CurrentBill {
  id: string
  heldAt: string
  heldBy: string
  label?: string
}

const MAX_HELD_BILLS = 10

// Local YYYY-MM-DD (NOT UTC). The previous `toISOString().split('T')[0]`
// returned UTC date — for IST users billing after 18:30 the bill was dated
// the next calendar day, breaking daily-close reports.
function todayLocalIso(): string {
  return new Date().toLocaleDateString('en-CA') // 'en-CA' produces YYYY-MM-DD
}

function createEmptyBill(): CurrentBill {
  return {
    invoiceNumber: '',
    date: todayLocalIso(),
    billingType: 'RETAIL',
    customerName: '',
    items: [],
    subtotal: 0,
    productDiscount: 0,
    taxableAmount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    deliveryCharge: 0,
    roundOff: 0,
    grandTotal: 0,
    paymentMode: 'CASH',
    amountPaid: 0,
    changeReturned: 0,
  }
}

function calculateTotalsFromItems(items: InvoiceItem[], deliveryCharge = 0): {
  subtotal: number
  productDiscount: number
  taxableAmount: number
  cgst: number
  sgst: number
  grandTotal: number
  roundOff: number
} {
  // Indian pharma billing convention used here:
  //   - subtotal           = sum of MRP-based line totals (what customer sees as gross)
  //   - taxableAmount      = sum of RATE-based post-discount line totals (GST base)
  //   - productDiscount    = subtotal - taxableAmount (MRP-to-rate savings + line discount)
  //   - cgst/sgst          = GST applied on the rate-based taxable amount
  //   - grandTotal         = taxableAmount + cgst + sgst + delivery (then rounded)
  // Previously productDiscount was computed on the MRP base while GST was on
  // the rate base, so the printed totals didn't reconcile when MRP ≠ rate.
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.mrp, 0)

  const taxableAmount = items.reduce((sum, item) => {
    const line = item.quantity * item.rate
    const disc = line * (item.discountPercent / 100)
    return sum + (line - disc)
  }, 0)

  const productDiscount = subtotal - taxableAmount

  const cgst = items.reduce((sum, item) => {
    const line = item.quantity * item.rate
    const disc = line * (item.discountPercent / 100)
    const taxable = line - disc
    return sum + taxable * (item.gstPercent / 2 / 100)
  }, 0)

  const sgst = cgst // CGST and SGST are equal for intra-state

  // Delivery / Packaging is a non-taxable add-on. It is folded into the
  // pre-rounding total so Net Payable rounds to a whole rupee and Round Off
  // absorbs the fractional part.
  const totalBeforeRound = taxableAmount + cgst + sgst + (Number(deliveryCharge) || 0)
  const roundOff = Math.round(totalBeforeRound) - totalBeforeRound
  const grandTotal = Math.round(totalBeforeRound)

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    productDiscount: parseFloat(productDiscount.toFixed(2)),
    taxableAmount: parseFloat(taxableAmount.toFixed(2)),
    cgst: parseFloat(cgst.toFixed(2)),
    sgst: parseFloat(sgst.toFixed(2)),
    grandTotal,
    roundOff: parseFloat(roundOff.toFixed(2)),
  }
}

interface BillingState {
  currentBill: CurrentBill
  heldBills: Bill[]

  // Item actions
  addItem: (item: InvoiceItem) => void
  removeItem: (itemId: string) => void
  updateItem: (itemId: string, updates: Partial<InvoiceItem>) => void

  // Bill actions
  setCustomer: (customer: { id?: string; name: string; phone?: string; doctorName?: string }) => void
  setPayment: (payment: { mode: PaymentMode; amountPaid: number; details?: Record<string, unknown> }) => void
  setDeliveryCharge: (amount: number) => void
  holdBill: (heldBy: string, label?: string) => boolean
  resumeBill: (billId: string) => void
  clearBill: () => void
  calculateTotals: () => void
}

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      currentBill: createEmptyBill(),
      heldBills: [],

      addItem: (item: InvoiceItem) => {
        set((state) => {
          const updatedItems = [...state.currentBill.items, item]
          const totals = calculateTotalsFromItems(updatedItems, state.currentBill.deliveryCharge)
          return {
            currentBill: {
              ...state.currentBill,
              items: updatedItems,
              ...totals,
              igst: 0,
            },
          }
        })
      },

      removeItem: (itemId: string) => {
        set((state) => {
          const updatedItems = state.currentBill.items.filter((item) => item.id !== itemId)
          const totals = calculateTotalsFromItems(updatedItems, state.currentBill.deliveryCharge)
          return {
            currentBill: {
              ...state.currentBill,
              items: updatedItems,
              ...totals,
              igst: 0,
            },
          }
        })
      },

      updateItem: (itemId: string, updates: Partial<InvoiceItem>) => {
        set((state) => {
          const updatedItems = state.currentBill.items.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          )
          const totals = calculateTotalsFromItems(updatedItems, state.currentBill.deliveryCharge)
          return {
            currentBill: {
              ...state.currentBill,
              items: updatedItems,
              ...totals,
              igst: 0,
            },
          }
        })
      },

      setCustomer: (customer) => {
        set((state) => ({
          currentBill: {
            ...state.currentBill,
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            doctorName: customer.doctorName,
          },
        }))
      },

      setPayment: (payment) => {
        const { currentBill } = get()
        const changeReturned = Math.max(0, payment.amountPaid - currentBill.grandTotal)
        set((state) => ({
          currentBill: {
            ...state.currentBill,
            paymentMode: payment.mode,
            amountPaid: payment.amountPaid,
            paymentDetails: payment.details,
            changeReturned: parseFloat(changeReturned.toFixed(2)),
          },
        }))
      },

      setDeliveryCharge: (amount: number) => {
        set((state) => {
          const normalized = Math.max(0, Number(amount) || 0)
          const totals = calculateTotalsFromItems(state.currentBill.items, normalized)
          return {
            currentBill: {
              ...state.currentBill,
              deliveryCharge: parseFloat(normalized.toFixed(2)),
              ...totals,
              igst: 0,
            },
          }
        })
      },

      holdBill: (heldBy: string, label?: string): boolean => {
        const { currentBill, heldBills } = get()

        if (heldBills.length >= MAX_HELD_BILLS) {
          return false
        }

        if (currentBill.items.length === 0) {
          return false
        }

        const heldBill: Bill = {
          ...currentBill,
          id: `HOLD-${Date.now()}`,
          heldAt: new Date().toISOString(),
          heldBy,
          label,
        }

        set({
          heldBills: [...heldBills, heldBill],
          currentBill: createEmptyBill(),
        })

        return true
      },

      resumeBill: (billId: string) => {
        const { heldBills, currentBill } = get()
        const billToResume = heldBills.find((b) => b.id === billId)

        if (!billToResume) return

        // If current bill has items, don't allow resuming without clearing first
        if (currentBill.items.length > 0) return

        const { id: _id, heldAt: _heldAt, heldBy: _heldBy, label: _label, ...billData } = billToResume

        set({
          // Legacy held bills (saved before deliveryCharge existed) won't have
          // the field — default to 0 so totals stay coherent on resume.
          currentBill: { ...billData, deliveryCharge: billData.deliveryCharge ?? 0 },
          heldBills: heldBills.filter((b) => b.id !== billId),
        })
      },

      clearBill: () => {
        set({ currentBill: createEmptyBill() })
      },

      calculateTotals: () => {
        set((state) => {
          const totals = calculateTotalsFromItems(state.currentBill.items, state.currentBill.deliveryCharge)
          return {
            currentBill: {
              ...state.currentBill,
              ...totals,
              igst: 0,
            },
          }
        })
      },
    }),
    {
      name: 'pbims-billing-storage',
      partialize: (state) => ({
        heldBills: state.heldBills,
      }),
    }
  )
)
