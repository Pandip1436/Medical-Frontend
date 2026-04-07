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

function createEmptyBill(): CurrentBill {
  return {
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    billingType: 'retail',
    customerName: '',
    items: [],
    subtotal: 0,
    productDiscount: 0,
    taxableAmount: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    roundOff: 0,
    grandTotal: 0,
    paymentMode: 'cash',
    amountPaid: 0,
    changeReturned: 0,
  }
}

function calculateTotalsFromItems(items: InvoiceItem[]): {
  subtotal: number
  productDiscount: number
  taxableAmount: number
  cgst: number
  sgst: number
  grandTotal: number
  roundOff: number
} {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.mrp, 0)

  const productDiscount = items.reduce((sum, item) => {
    const lineTotal = item.quantity * item.mrp
    return sum + lineTotal * (item.discountPercent / 100)
  }, 0)

  const taxableAmount = subtotal - productDiscount

  const cgst = items.reduce((sum, item) => {
    const lineTotal = item.quantity * item.rate
    const discount = lineTotal * (item.discountPercent / 100)
    const taxable = lineTotal - discount
    return sum + taxable * (item.gstPercent / 2 / 100)
  }, 0)

  const sgst = cgst // CGST and SGST are equal for intra-state

  const totalBeforeRound = taxableAmount + cgst + sgst
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
          const totals = calculateTotalsFromItems(updatedItems)
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
          const totals = calculateTotalsFromItems(updatedItems)
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
          const totals = calculateTotalsFromItems(updatedItems)
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
          currentBill: billData,
          heldBills: heldBills.filter((b) => b.id !== billId),
        })
      },

      clearBill: () => {
        set({ currentBill: createEmptyBill() })
      },

      calculateTotals: () => {
        set((state) => {
          const totals = calculateTotalsFromItems(state.currentBill.items)
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
