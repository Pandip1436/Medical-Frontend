import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Minus,
  Trash2,
  Search,
  Printer,
  Share2,
  Save,
  Pause,
  X,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  SplitSquareHorizontal,
  Package,
  ChevronDown,
  Receipt,
  History,
  Users,
  FileText,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Upload,
  Camera,
  FileImage,
  CalendarClock,
  Pencil,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { navigate } from '@/lib/router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const MotionTableRow = motion(TableRow)

import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchStore } from '@/stores/branchStore'
import { useAuthStore } from '@/stores/authStore'
import { cn, formatCurrency, generateInvoiceNumber } from '@/lib/utils'
import type { Product, Customer, Invoice, Quotation } from '@/types'
import { printInvoicePdf, shareInvoiceViaWhatsApp } from '@/lib/pdf/invoicePdf'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface BillingItem {
  id: string
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  expiryDate: string
  quantity: number
  mrp: number
  rate: number
  discountPercent: number
  gstPercent: number
  amount: number
  schedule: string
}

type PaymentMode = 'CASH' | 'CARD' | 'UPI' | 'CREDIT' | 'SPLIT'

interface SplitPayment {
  id: string
  mode: 'CASH' | 'CARD' | 'UPI'
  amount: number
}

interface PaymentDetails {
  amountReceived: number
  cardLast4: string
  cardRef: string
  upiRef: string
  creditDueDate: string
  splits: SplitPayment[]
}

// ─────────────────────────────────────────────────────────────
// CUSTOMER SCHEMA
// ─────────────────────────────────────────────────────────────

// Quotation mode requires only name + phone. Invoice mode keeps the full
// strict ruleset (address, referredBy, type-conditional GSTIN/DL/registration).
// The resolver is rebuilt when invoiceType flips so the form revalidates.
function buildCustomerSchema(mode: 'invoice' | 'quotation') {
  const base = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z
      .string()
      .min(10, 'Phone must be 10 digits')
      .max(10, 'Phone must be 10 digits')
      .regex(/^\d{10}$/, 'Must be exactly 10 digits'),
    type: z.enum(['RETAIL', 'WHOLESALE', 'DOCTOR']),
    email: z.string().email('Invalid email').or(z.literal('')).optional(),
    address: mode === 'invoice' ? z.string().min(1, 'Address is required') : z.string().optional(),
    gstin: z.string().optional(),
    dlNumber: z.string().optional(),
    registrationNumber: z.string().optional(),
    referredBy: mode === 'invoice' ? z.string().min(1, 'Please select a salesperson') : z.string().optional(),
    notes: z.string().optional(),
  })
  if (mode === 'quotation') return base
  return base.superRefine((data, ctx) => {
    if (data.type === 'WHOLESALE') {
      if (!data.gstin || data.gstin.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN is required for Wholesale' })
      }
      if (!data.dlNumber || data.dlNumber.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['dlNumber'], message: 'DL Number is required for Wholesale' })
      }
    }
    if (data.type === 'DOCTOR') {
      if (!data.registrationNumber || data.registrationNumber.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['registrationNumber'], message: 'Registration Number is required for Doctor' })
      }
    }
  })
}

const customerSchema = buildCustomerSchema('invoice')

type CustomerFormValues = z.input<typeof customerSchema>

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function generateRowId() {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isExpired(expiryDate: string): boolean {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  expiry.setHours(23, 59, 59, 999)
  return expiry < new Date()
}

function isNearExpiry(expiryDate: string): boolean {
  if (!expiryDate || isExpired(expiryDate)) return false
  const expiry = new Date(expiryDate)
  const now = new Date()
  const threeMonths = 90 * 24 * 60 * 60 * 1000
  return expiry.getTime() - now.getTime() < threeMonths
}

function formatExpiryShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase()
}


function createEmptyItem(): BillingItem {
  return {
    id: generateRowId(),
    productId: '',
    productName: '',
    batchId: '',
    batchNumber: '',
    expiryDate: '',
    quantity: 0,
    mrp: 0,
    rate: 0,
    discountPercent: 0,
    gstPercent: 0,
    amount: 0,
    schedule: 'none',
  }
}

function calculateItemAmount(item: BillingItem): number {
  const baseAmount = item.quantity * item.rate
  const discount = baseAmount * (item.discountPercent / 100)
  const taxable = baseAmount - discount
  const gst = taxable * (item.gstPercent / 100)
  return taxable + gst
}

// When a product is selected (from hero search or row picker), the response
// from /products already includes its `batches`. Merge them into the master
// store so the rest of the page (FEFO sorting, batch dropdown, stock checks,
// batch lookups by id) keeps working when we no longer preload everything.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncProductBatchesIntoStore(product: any) {
  if (!product?.id) return
  const incoming = Array.isArray(product.batches) ? product.batches : []
  useMasterDataStore.setState((prev) => {
    const others = prev.batches.filter((b) => b.productId !== product.id)
    return { batches: [...others, ...incoming] }
  })
  // Also make sure the product itself is reachable by id (FEFO/MRP lookups
  // in BillingRow use `products.find(p => p.id === ...)`).
  useMasterDataStore.setState((prev) => {
    const others = prev.products.filter((p) => p.id !== product.id)
    return { products: [...others, product] }
  })
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: PillToggle
// ─────────────────────────────────────────────────────────────

function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-semibold transition-colors duration-150',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Inline Compact Billing Row
// ─────────────────────────────────────────────────────────────

function BillingRow({
  item,
  index,
  billingType,
  invoiceType,
  onUpdate,
  onRemove,
  customerLastRates,
  customerInvoices,
  showInlineHistory = true,
}: {
  item: BillingItem
  index: number
  billingType: 'retail' | 'wholesale'
  invoiceType: 'invoice' | 'quotation'
  onUpdate: (id: string, updates: Partial<BillingItem>) => void
  onRemove: (id: string) => void
  customerLastRates: Record<string, number>
  customerInvoices: Invoice[]
  showInlineHistory?: boolean
}) {
  const products = useMasterDataStore(s => s.products)
  const batches = useMasterDataStore(s => s.batches)
  const isLoading = useMasterDataStore(s => s.isLoading)

  const [productSearch, setProductSearch] = useState(item.productName)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 400 })
  const [historyOpen, setHistoryOpen] = useState(true)

  const productRef = useRef<HTMLTableCellElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const batchRef = useRef<HTMLButtonElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  // Server-paginated product search for this row's picker (20 + scroll).
  const rowProductSearch = usePaginatedSearch<Product>({
    endpoint: '/products',
    pageSize: 20,
    enabled: showProductDropdown,
  })

  useEffect(() => {
    rowProductSearch.setQuery(productSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch])

  const filteredProducts = rowProductSearch.items

  // Alternative suggestions: same salt composition, different product, has stock
  const alternatives = useMemo(() => {
    const selected = products.find((p) => p.id === item.productId)
    if (!selected || !selected.saltComposition) return []
    if (selected.totalStock > selected.minStock) return [] // only show when low/out
    return products.filter(
      (p) =>
        p.id !== selected.id &&
        p.saltComposition &&
        p.saltComposition.toLowerCase() === selected.saltComposition!.toLowerCase() &&
        p.totalStock > 0
    ).slice(0, 4)
  }, [item.productId, products])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const productBatches = useMemo(() => {
    if (!item.productId) return []
    return batches
      .filter((b) => b.productId === item.productId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
  }, [item.productId])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === item.productId)
  }, [item.productId])

  // Product-specific purchase history for the selected customer
  const productHistory = useMemo(() => {
    if (!item.productId) return []
    const hits: { date: string; invoiceNumber: string; batchNumber: string; qty: number; rate: number; status: string }[] = []
    for (const inv of customerInvoices) {
      for (const it of (inv as any).items ?? []) {
        if (it.productId === item.productId) {
          hits.push({
            date: (inv as any).date ?? inv.createdAt,
            invoiceNumber: inv.invoiceNumber,
            batchNumber: it.batchNumber ?? '—',
            qty: Number(it.quantity),
            rate: Number(it.rate),
            status: inv.status,
          })
        }
      }
    }
    return hits.slice(0, 5)
  }, [item.productId, customerInvoices])

  // Auto-open history when product first gets history entries
  useEffect(() => {
    if (productHistory.length > 0) setHistoryOpen(true)
  }, [productHistory.length])

  const handleProductSelect = useCallback(
    (product: Product) => {
      // Ensure the selected product's batches and full record are in the
      // store before we read FEFO/MRP from them.
      syncProductBatchesIntoStore(product)
      const productBatches = useMasterDataStore.getState().batches
        .filter((b) => b.productId === product.id && b.quantity > 0)
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

      const firstBatch = productBatches[0]
      const defaultRate = billingType === 'wholesale' ? product.wholesaleRate : product.sellingRate
      const lastRate = customerLastRates[product.id]
      const rate = lastRate ?? defaultRate
      if (lastRate !== undefined) {
        toast.info(`Using last sale price ₹${lastRate} for ${product.name}`, { duration: 2000 })
      }

      const updates: Partial<BillingItem> = {
        productId: product.id,
        productName: product.name,
        gstPercent: product.gstRate,
        mrp: Number(firstBatch?.mrp || product.mrp) || 0,
        rate: Number(rate) || 0,
        schedule: product.schedule,
        batchId: firstBatch?.id ?? '',
        batchNumber: firstBatch?.batchNumber ?? '',
        expiryDate: firstBatch?.expiryDate ?? '',
        quantity: item.quantity || 1,
        discountPercent: item.discountPercent,
      }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)

      setProductSearch(product.name)
      setShowProductDropdown(false)
      setSelectedIndex(0)
      onUpdate(item.id, updates)

      // Auto-focus next field
      setTimeout(() => {
        if (batches.length > 1) {
          batchRef.current?.focus()
        } else {
          qtyRef.current?.focus()
          qtyRef.current?.select()
        }
      }, 50)
    },
    [billingType, item, onUpdate, batches, customerLastRates]
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleBatchChange = useCallback(
    (batchId: string) => {
      const batch = batches.find((b) => b.id === batchId)
      if (!batch) return
      // FEFO check: warn if the user picks a batch other than the
      // earliest-expiry one. We don't block — sometimes the soonest batch is
      // damaged or held — but pharmacists should know they're skipping it.
      const fefoBatch = productBatches[0]
      if (fefoBatch && fefoBatch.id !== batch.id) {
        toast.warning(
          `FEFO: ${fefoBatch.batchNumber} expires sooner (${formatExpiryShort(fefoBatch.expiryDate)}). Selling later-expiry stock first risks write-offs.`,
          { duration: 4500 },
        )
      }
      const updates: Partial<BillingItem> = {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        mrp: Number(batch.mrp || selectedProduct?.mrp) || 0,
      }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)
      onUpdate(item.id, updates)
    },
    [item, onUpdate, productBatches]
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleQtyChange = useCallback(
    (qty: number) => {
      // Quotation mode: no stock clamp — the product may not even be in
      // inventory yet (the whole point of quoting before procuring).
      let nextQty: number
      if (invoiceType === 'quotation') {
        nextQty = Math.max(0, qty)
      } else {
        const selectedBatch = batches.find((b) => b.id === item.batchId)
        const maxQty = selectedBatch?.quantity ?? 9999
        nextQty = Math.min(Math.max(0, qty), maxQty)
      }
      const updates: Partial<BillingItem> = { quantity: nextQty }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)
      onUpdate(item.id, updates)
    },
    [item, onUpdate, invoiceType]
  )

  const handleDiscountChange = useCallback(
    (disc: number) => {
      const clamped = Math.min(Math.max(0, disc), 100)
      const updates: Partial<BillingItem> = { discountPercent: clamped }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)
      onUpdate(item.id, updates)
    },
    [item, onUpdate]
  )

  const handleRateChange = useCallback(
    (rate: number) => {
      let clamped = Math.max(0, rate)
      if (item.mrp > 0 && clamped > item.mrp) {
        clamped = item.mrp
        toast.warning(`Rate capped at MRP ₹${item.mrp}`, {
          id: `rate-mrp-${item.id}`,
          duration: 2500,
        })
      }
      const updates: Partial<BillingItem> = { rate: clamped }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)
      onUpdate(item.id, updates)
    },
    [item, onUpdate]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filteredProducts.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Quotation mode: Enter commits the typed text as the product name
      // (no inventory pick required). The user can still click a row in the
      // dropdown to auto-fill if they want.
      if (invoiceType === 'quotation') {
        onUpdate(item.id, { productName: productSearch })
        setShowProductDropdown(false)
        qtyRef.current?.focus()
        return
      }
      if (filteredProducts[selectedIndex]) {
        handleProductSelect(filteredProducts[selectedIndex])
      }
    } else if (e.key === 'Tab' && showProductDropdown && filteredProducts.length > 0) {
      // Invoice mode only: Tab auto-picks the highlighted suggestion.
      // Quotation mode leaves Tab alone so the typed text stays as-is.
      if (invoiceType !== 'quotation') {
        handleProductSelect(filteredProducts[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false)
    }
  }

  const selectedBatch = batches.find((b) => b.id === item.batchId)
  // Quotation mode: no batch tie, so we never flag qty as exceeding stock.
  const qtyExceeds = invoiceType === 'invoice' && selectedBatch ? item.quantity > selectedBatch.quantity : false

  return (
    <>
    <MotionTableRow
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group transition-colors hover:bg-muted/25 data-[state=selected]:bg-muted",
        productHistory.length > 0 && historyOpen ? '' : 'border-b border-border/40',
        !item.productId && 'opacity-90'
      )}
    >
      {/* S.No */}
      <TableCell className="w-10 px-2 py-2.5 text-center align-middle">
        <div className="flex flex-col gap-0.5 items-center">
          <div className="h-3.5" aria-hidden />
          <span className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold font-mono',
            item.productId
              ? 'bg-primary/10 text-primary'
              : 'bg-muted/40 text-muted-foreground/50'
          )}>
            {index + 1}
          </span>
        </div>
      </TableCell>

      {/* Product + Schedule + Generic */}
      <TableCell className="min-w-55 px-3 py-2.5 align-middle" ref={productRef}>
        <div className="flex flex-col gap-0.5">
          {/* Helper row (top) — manufacturer · generic */}
          <div className="h-3.5 flex items-center">
            {selectedProduct && (selectedProduct.manufacturer || selectedProduct.genericName) && (
              <div className="px-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground truncate">
                {selectedProduct.manufacturer && <span className="truncate">{selectedProduct.manufacturer}</span>}
                {selectedProduct.manufacturer && selectedProduct.genericName && <span className="opacity-40">·</span>}
                {selectedProduct.genericName && <span className="truncate">{selectedProduct.genericName}</span>}
              </div>
            )}
          </div>
        <div className="relative group/search">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value)
                setSelectedIndex(0)
                // Quotation mode: free-text product name. Persist every keystroke
                // to the item so the payload carries it without requiring a pick.
                if (invoiceType === 'quotation') {
                  onUpdate(item.id, { productName: e.target.value })
                }
                if (inputRef.current) {
                  const rect = inputRef.current.getBoundingClientRect()
                  setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
                }
                setShowProductDropdown(true)
              }}
              onFocus={() => {
                if (inputRef.current) {
                  const rect = inputRef.current.getBoundingClientRect()
                  setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
                }
                setShowProductDropdown(true)
              }}
              onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="Search product..."
              className={cn(
                'flex-1 min-w-0 h-8 rounded-lg border border-transparent bg-transparent px-2 text-xs font-bold transition-all',
                'placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:italic',
                'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-muted/40 focus:border-primary/20'
              )}
            />
            {selectedProduct && (selectedProduct.schedule === 'H' || selectedProduct.schedule === 'H1') && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-rose-600 dark:text-rose-400 shrink-0">
                <ShieldAlert className="h-2.5 w-2.5" />
                Sch {selectedProduct.schedule}
              </span>
            )}
            {productHistory.length > 0 ? (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setHistoryOpen(v => !v) }}
                title={historyOpen ? 'Hide purchase history' : `${productHistory.length} past purchase${productHistory.length > 1 ? 's' : ''}`}
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 bg-violet-500/10 hover:bg-violet-500/20 transition-colors shrink-0"
              >
                <History className="h-3 w-3 text-violet-500" />
                <span className="text-[9px] font-bold text-violet-500">{productHistory.length}</span>
              </button>
            ) : (
              <Search className="h-3 w-3 text-muted-foreground/20 group-hover/search:text-muted-foreground/40 transition-colors shrink-0" />
            )}
          </div>
          {showProductDropdown && createPortal(
            <div
              style={{ 
                position: 'fixed', 
                top: dropdownPos.top, 
                width: Math.min(dropdownPos.width, window.innerWidth - 32), 
                zIndex: 9999,
                maxWidth: 'calc(100vw - 32px)',
                left: Math.max(16, Math.min(dropdownPos.left, window.innerWidth - (dropdownPos.width || 400) - 16))
              }}
              className="rounded-xl border border-border/60 bg-popover shadow-2xl overflow-hidden"
            >
              <div className="px-3 py-1.5 border-b border-border/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 bg-muted/30">
                {rowProductSearch.loading && filteredProducts.length === 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Searching…
                  </span>
                ) : (
                  <>
                    {rowProductSearch.total || filteredProducts.length} Product{(rowProductSearch.total || filteredProducts.length) !== 1 ? 's' : ''}
                    {rowProductSearch.total > filteredProducts.length && ` · showing ${filteredProducts.length}`}
                  </>
                )}
              </div>
              <div
                className="max-h-70 overflow-y-auto"
                onScroll={(e) => {
                  const el = e.currentTarget
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
                    rowProductSearch.loadMore()
                  }
                }}
              >
                {filteredProducts.length === 0 && !rowProductSearch.loading ? (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    {productSearch ? `No products match "${productSearch}"` : 'Start typing to search products'}
                  </div>
                ) : (
                  <>
                    {filteredProducts.map((p, idx) => (
                      <div
                        key={p.id}
                        className={cn(
                          "cursor-pointer px-3 py-2.5 transition-all border-b border-border/5 last:border-0 group/item",
                          idx === selectedIndex ? "bg-primary/5 text-primary" : "hover:bg-primary/5"
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleProductSelect(p)
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold truncate group-hover/item:text-primary transition-colors">
                                {p.name}
                              </span>
                              {(p.schedule === 'H' || p.schedule === 'H1') && (
                                <Badge variant="destructive" size="sm" className="h-4 px-1 text-[8px] font-black">{p.schedule}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground/60">
                              <span className="truncate">{p.manufacturer}</span>
                              <span className="opacity-20">|</span>
                              <span className="truncate">{p.genericName}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-black font-mono text-foreground/80">₹{p.mrp}</span>
                            <Badge variant={p.totalStock <= p.minStock ? 'destructive' : p.totalStock > 20 ? 'secondary' : 'warning'} className="text-[9px] px-1 h-3.5">
                              {p.totalStock === 0 ? 'OUT' : `Stk: ${p.totalStock}`}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredProducts.length > 0 && rowProductSearch.loading && (
                      <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading more…</div>
                    )}
                  </>
                )}
              </div>
              {/* Alternative drug suggestions */}
              {alternatives.length > 0 && (
                <div className="border-t border-amber-200/60 bg-amber-50/40 dark:bg-amber-900/10">
                  <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <span>⚡</span> Alternatives with same salt
                  </div>
                  {alternatives.map((p) => (
                    <div
                      key={p.id}
                      className="cursor-pointer px-3 py-2 transition-all border-t border-amber-100/60 dark:border-amber-800/30 hover:bg-amber-100/40 dark:hover:bg-amber-900/20 group/alt"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleProductSelect(p)
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-semibold truncate group-hover/alt:text-amber-700 dark:group-hover/alt:text-amber-300 transition-colors">
                            {p.name}
                          </span>
                          <div className="text-[10px] text-muted-foreground/60 truncate">{p.manufacturer}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs font-bold font-mono">₹{p.mrp}</span>
                          <Badge variant="success" className="text-[9px] px-1 h-3.5">Stk: {p.totalStock}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>,
            document.body
          )}
        </div>
        </div>
      </TableCell>

      {/* Batch + Expiry — helper on top, control below */}
      <TableCell className="w-37.5 px-2 py-2.5 align-middle">
        <div className="flex flex-col gap-0.5">
          {/* Helper row (top) — expiry chip */}
          <div className="h-3.5 flex items-center justify-center">
            {item.batchId && item.expiryDate ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
                  isExpired(item.expiryDate)
                    ? 'text-rose-600 dark:text-rose-400'
                    : isNearExpiry(item.expiryDate)
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {isExpired(item.expiryDate) ? '⚠ Exp' : 'Exp'} {formatExpiryShort(item.expiryDate)}
              </span>
            ) : null}
          </div>
          {/* Main control */}
          <Select
            value={item.batchId}
            onValueChange={handleBatchChange}
            disabled={!item.productId}
          >
            <SelectTrigger
              ref={batchRef}
              className={cn(
                'h-8 w-full bg-muted/30 border border-border/30 hover:border-primary/30 px-2 text-xs font-bold rounded-lg transition-all focus:ring-1 focus:ring-primary/30',
                !item.batchId && 'text-muted-foreground/50 italic font-normal'
              )}>
              <SelectValue placeholder="Select Batch" />
            </SelectTrigger>
            <SelectContent className="bg-popover/95 backdrop-blur-xl">
              {productBatches.map((b, idx) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  <div className="flex items-center justify-between gap-3 w-full min-w-40">
                    <span className="font-mono font-bold tracking-tight">{b.batchNumber}</span>
                    <div className="flex items-center gap-1.5">
                      {idx === 0 && (
                        <Badge variant="success" className="text-[8px] px-1 h-3.5">FEFO</Badge>
                      )}
                      <span className="text-[10px] opacity-60">Qty: {b.quantity}</span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>

      {/* MRP — editable in quotation mode (product may not exist in inventory),
          read-only reference in invoice mode (auto-filled from batch). */}
      <TableCell className="w-20 px-2 py-2.5 align-middle">
        <div className="flex flex-col gap-0.5 items-end">
          <div className="h-3.5" aria-hidden />
          {invoiceType === 'quotation' ? (
            <input
              type="number"
              step={0.01}
              min={0}
              value={item.mrp || ''}
              onChange={(e) => {
                const mrp = Math.max(0, parseFloat(e.target.value) || 0)
                onUpdate(item.id, { mrp })
              }}
              placeholder="0"
              className="h-8 w-full rounded-md border border-border/40 bg-muted/30 px-2 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-background"
            />
          ) : item.productId && item.mrp > 0 ? (
            <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground h-8 inline-flex items-center">
              {formatCurrency(item.mrp)}
            </span>
          ) : (
            <span className="text-muted-foreground/30 text-xs h-8 inline-flex items-center">—</span>
          )}
        </div>
      </TableCell>

      {/* Qty — helper on top, stepper below */}
      <TableCell className="w-27.5 px-2 py-2.5 align-middle">
        <div className="flex flex-col gap-0.5">
          {/* Helper row (top) — stock available */}
          <div className="h-3.5 flex items-center justify-center">
            {selectedBatch && item.quantity > 0 ? (
              <span className={cn(
                'text-[11px] font-semibold tabular-nums',
                qtyExceeds ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
              )}>
                {qtyExceeds ? `Max ${selectedBatch.quantity}` : `of ${selectedBatch.quantity}`}
              </span>
            ) : null}
          </div>
          {/* Stepper */}
          <div className={cn(
            "flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5 border transition-all",
            qtyExceeds ? 'border-rose-400/50 bg-rose-50/30 dark:bg-rose-900/10' : 'border-border/30 focus-within:border-primary/40'
          )}>
            <button
              type="button"
              onClick={() => handleQtyChange(item.quantity - 1)}
              disabled={(invoiceType === 'invoice' && !item.productId) || item.quantity <= 0}
              className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
            >
              <Minus className="h-3 w-3" />
            </button>
            <input
              ref={qtyRef}
              type="number"
              min={0}
              max={invoiceType === 'quotation' ? undefined : (selectedBatch?.quantity ?? 9999)}
              value={item.quantity || ''}
              onChange={(e) => handleQtyChange(parseInt(e.target.value) || 0)}
              className={cn(
                'w-full h-7 border-0 bg-transparent text-sm text-center font-black font-mono',
                'focus:outline-none focus:ring-0',
                'disabled:opacity-40 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                qtyExceeds && 'text-rose-600'
              )}
              disabled={invoiceType === 'invoice' && !item.productId}
            />
            <button
              type="button"
              onClick={() => handleQtyChange(item.quantity + 1)}
              disabled={invoiceType === 'invoice' && !item.productId}
              className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </TableCell>

      {/* Rate — original price diff on top (MRP moved to its own column), editable stepper below */}
      <TableCell className="w-40 px-2 py-2.5 align-middle">
        {(() => {
          const originalRate = selectedProduct
            ? Number(billingType === 'wholesale' ? selectedProduct.wholesaleRate : selectedProduct.sellingRate)
            : 0
          const isModified = originalRate > 0 && Math.abs(Number(item.rate) - originalRate) > 0.001
          const overMrp = item.mrp > 0 && Number(item.rate) > item.mrp
          return (
            <div className="flex flex-col gap-0.5">
              {/* Helper row (top) — original rate diff only */}
              <div className="h-3.5 flex items-center justify-center gap-2 text-[11px] font-mono px-1">
                {item.productId && originalRate > 0 && (
                  <span className={cn(
                    'inline-flex items-center gap-0.5 font-semibold tabular-nums',
                    isModified ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                  )}>
                    {isModified ? (
                      <span className="line-through">{formatCurrency(originalRate)}</span>
                    ) : (
                      <span>orig {formatCurrency(originalRate)}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Editable rate stepper */}
              <div className={cn(
                'flex items-center gap-0.5 rounded-lg border bg-muted/30 p-0.5 transition-all focus-within:border-primary/40',
                isModified ? 'border-amber-400/50 bg-amber-50/30 dark:bg-amber-900/15' : 'border-border/30',
                overMrp && 'border-rose-400/50 bg-rose-50/30 dark:bg-rose-900/10'
              )}>
                <button
                  type="button"
                  onClick={() => handleRateChange(Math.max(0, Number(item.rate) - 1))}
                  disabled={invoiceType === 'invoice' && !item.productId}
                  className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  max={item.mrp > 0 ? item.mrp : undefined}
                  value={item.rate || ''}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)}
                  title={item.mrp > 0 ? `Maximum: MRP ₹${item.mrp}` : undefined}
                  className={cn(
                    'w-full h-7 border-0 bg-transparent text-sm text-center font-black font-mono tabular-nums',
                    'focus:outline-none focus:ring-0',
                    'disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                    overMrp ? 'text-rose-600 dark:text-rose-400'
                      : isModified ? 'text-amber-600 dark:text-amber-400'
                      : 'text-foreground'
                  )}
                  disabled={invoiceType === 'invoice' && !item.productId}
                />
                <button
                  type="button"
                  onClick={() => handleRateChange(Number(item.rate) + 1)}
                  disabled={invoiceType === 'invoice' && !item.productId}
                  className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })()}
      </TableCell>

      {/* Disc% — helper spacer on top to align with other cells */}
      <TableCell className="w-20 px-2 py-2.5 align-middle">
        <div className="flex flex-col gap-0.5">
          <div className="h-3.5" aria-hidden />
          <div className={cn(
            'relative flex items-center rounded-lg border bg-muted/30 transition-all focus-within:border-primary/40 focus-within:bg-background',
            item.discountPercent > 0 ? 'border-rose-300/50 bg-rose-50/30 dark:bg-rose-900/10' : 'border-border/30'
          )}>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={item.discountPercent || ''}
              onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className={cn(
                'w-full h-8 border-0 bg-transparent text-xs text-center font-bold font-mono tabular-nums',
                'placeholder:text-muted-foreground/30',
                'focus:outline-none focus:ring-0',
                'disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                item.discountPercent > 0 ? 'text-rose-600 dark:text-rose-400 pr-4' : 'text-foreground pr-4'
              )}
              disabled={invoiceType === 'invoice' && !item.productId}
            />
            <span className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none',
              item.discountPercent > 0 ? 'text-rose-500/70' : 'text-muted-foreground/40'
            )}>%</span>
          </div>
        </div>
      </TableCell>

      {/* GST — editable in quotation mode (no fixed product GST rate), badge in invoice mode */}
      <TableCell className="w-14 px-1 py-2.5 text-center align-middle">
        <div className="flex flex-col gap-0.5 items-center">
          <div className="h-3.5" aria-hidden />
          {invoiceType === 'quotation' ? (
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={item.gstPercent || ''}
              onChange={(e) => {
                const gst = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                const updates: Partial<BillingItem> = { gstPercent: gst }
                const tempItem = { ...item, ...updates }
                updates.amount = calculateItemAmount(tempItem)
                onUpdate(item.id, updates)
              }}
              placeholder="0"
              className="h-8 w-full rounded-md border border-border/40 bg-muted/30 px-1 text-center font-mono text-[11px] font-bold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-background"
            />
          ) : item.gstPercent ? (
            <span className="inline-flex items-center rounded-md bg-muted/40 px-1.5 py-1.5 text-[10px] font-black font-mono text-muted-foreground/80 tabular-nums">
              {item.gstPercent}%
            </span>
          ) : (
            <span className="text-muted-foreground/30 text-xs py-1.5">—</span>
          )}
        </div>
      </TableCell>

      {/* Amount */}
      <TableCell className="w-27.5 px-3 py-2.5 text-right align-middle">
        <div className="flex flex-col gap-0.5 items-end">
          <div className="h-3.5" aria-hidden />
          <span className={cn(
            'font-mono tracking-tight tabular-nums h-8 inline-flex items-center',
            item.amount > 0
              ? 'text-base font-black text-primary'
              : 'text-sm font-bold text-muted-foreground/30'
          )}>
            {item.amount > 0 ? formatCurrency(item.amount) : '₹0.00'}
          </span>
        </div>
      </TableCell>

      {/* Delete */}
      <TableCell className="w-10 px-1 py-2.5 align-middle">
        <div className="flex flex-col gap-0.5 items-center">
          <div className="h-3.5" aria-hidden />
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            title="Remove row"
            className="rounded-md p-1.5 h-8 w-8 flex items-center justify-center text-muted-foreground/60 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </TableCell>
    </MotionTableRow>

    {/* ── Per-product purchase history sub-rows — aligned with parent columns ── */}
    {showInlineHistory && productHistory.length > 0 && historyOpen && (
      <>
        {/* Title strip */}
        <TableRow className="bg-violet-500/4 dark:bg-violet-500/6 hover:bg-violet-500/4 dark:hover:bg-violet-500/6">
          <TableCell className="w-10 px-2 py-1.5 text-center align-middle text-violet-500/70">↳</TableCell>
          <TableCell colSpan={9} className="px-3 py-1.5 align-middle">
            <div className="flex items-center gap-1.5">
              <History className="h-3 w-3 text-violet-500/70" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-violet-500/80">
                Purchase history for <span className="font-black text-violet-600 dark:text-violet-300 bg-violet-400/10 px-1 py-0.5 rounded">{item.productName}</span>
              </span>
            </div>
          </TableCell>
        </TableRow>
        {/* Column labels for the sub-rows */}
        <TableRow className="bg-violet-500/4 dark:bg-violet-500/6 hover:bg-violet-500/4 dark:hover:bg-violet-500/6 border-b border-violet-200/30 dark:border-violet-800/20">
          <TableCell className="w-10 px-2 py-1 align-middle"></TableCell>
          <TableCell className="min-w-55 px-3 py-1 text-left text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 align-middle">Date · Invoice #</TableCell>
          <TableCell className="w-37.5 px-2 py-1 text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 align-middle">Batch</TableCell>
          <TableCell className="w-20 px-2 py-1 align-middle"></TableCell>
          <TableCell className="w-27.5 px-2 py-1 text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 align-middle">Qty</TableCell>
          <TableCell className="w-40 px-2 py-1 text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 align-middle">Rate / Qty</TableCell>
          <TableCell className="w-20 px-2 py-1 align-middle"></TableCell>
          <TableCell className="w-14 px-1 py-1 align-middle"></TableCell>
          <TableCell className="w-27.5 px-3 py-1 text-right text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 align-middle">Status</TableCell>
          <TableCell className="w-10 px-1 py-1 align-middle"></TableCell>
        </TableRow>
        {/* Per-history record rows */}
        {productHistory.map((h, i) => (
          <TableRow
            key={i}
            className={cn(
              'bg-violet-500/3 dark:bg-violet-500/5 hover:bg-violet-500/6',
              i === productHistory.length - 1 ? 'border-b border-border/40' : 'border-b border-violet-100/30 dark:border-violet-900/20'
            )}
          >
            <TableCell className="w-10 px-2 py-1.5 align-middle"></TableCell>
            <TableCell className="min-w-55 px-3 py-1.5 align-middle">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground/60 whitespace-nowrap shrink-0">
                  {new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                </span>
                <span className="font-mono font-semibold text-primary/70 truncate">{h.invoiceNumber}</span>
              </div>
            </TableCell>
            <TableCell className="w-37.5 px-2 py-1.5 text-center align-middle font-mono text-[10px] text-muted-foreground/70">{h.batchNumber}</TableCell>
            <TableCell className="w-20 px-2 py-1.5 align-middle"></TableCell>
            <TableCell className="w-27.5 px-2 py-1.5 text-center align-middle font-mono font-bold text-[10px] tabular-nums">{h.qty}</TableCell>
            <TableCell className="w-40 px-2 py-1.5 text-center align-middle font-mono font-bold text-[10px] tabular-nums text-foreground/80">₹{h.rate}</TableCell>
            <TableCell className="w-20 px-2 py-1.5 align-middle"></TableCell>
            <TableCell className="w-14 px-1 py-1.5 align-middle"></TableCell>
            <TableCell className="w-27.5 px-3 py-1.5 text-right align-middle">
              <Badge
                variant={h.status === 'PAID' ? 'success' : h.status === 'UNPAID' ? 'warning' : h.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                size="sm"
                className="text-[8px] px-1.5 h-3.5"
              >
                {h.status}
              </Badge>
            </TableCell>
            <TableCell className="w-10 px-1 py-1.5 align-middle"></TableCell>
          </TableRow>
        ))}
      </>
    )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Mobile Compact Billing Card
// ─────────────────────────────────────────────────────────────

function MobileBillingCard({
  item,
  index,
  billingType,
  onUpdate,
  onRemove,
}: {
  item: BillingItem
  index: number
  billingType: 'retail' | 'wholesale'
  onUpdate: (id: string, updates: Partial<BillingItem>) => void
  onRemove: (id: string) => void
}) {
  const products = useMasterDataStore(s => s.products)
  const batches = useMasterDataStore(s => s.batches)
  
  const [productSearch, setProductSearch] = useState(item.productName)
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  const productBatches = useMemo(() => {
    if (!item.productId) return []
    return batches
      .filter((b) => b.productId === item.productId && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
  }, [item.productId, batches])

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === item.productId)
  }, [item.productId, products])

  // Server-paginated product search (20 + scroll) — mirrors BillingRow on desktop.
  const mobileProductSearch = usePaginatedSearch<Product>({
    endpoint: '/products',
    pageSize: 20,
    enabled: showProductDropdown,
  })

  useEffect(() => {
    mobileProductSearch.setQuery(productSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch])

  const filteredProducts = mobileProductSearch.items

  const handleProductSelect = (product: Product) => {
    syncProductBatchesIntoStore(product)
    const pBatches = useMasterDataStore.getState().batches
      .filter((b) => b.productId === product.id && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

    const firstBatch = pBatches[0]
    const rate = billingType === 'wholesale' ? product.wholesaleRate : product.sellingRate

    const updates: Partial<BillingItem> = {
      productId: product.id,
      productName: product.name,
      gstPercent: product.gstRate,
      mrp: Number(firstBatch?.mrp ?? product.mrp) || 0,
      rate: Number(rate) || 0,
      batchId: firstBatch?.id ?? '',
      batchNumber: firstBatch?.batchNumber ?? '',
      expiryDate: firstBatch?.expiryDate ?? '',
      quantity: item.quantity || 1,
    }
    const tempItem = { ...item, ...updates }
    updates.amount = calculateItemAmount(tempItem)

    setProductSearch(product.name)
    setShowProductDropdown(false)
    onUpdate(item.id, updates)
  }

  const handleQtyChange = (qty: number) => {
    const updates: Partial<BillingItem> = { quantity: Math.max(0, qty) }
    const tempItem = { ...item, ...updates }
    updates.amount = calculateItemAmount(tempItem)
    onUpdate(item.id, updates)
  }

  const handleRateChange = (rate: number) => {
    let clamped = Math.max(0, rate)
    if (item.mrp > 0 && clamped > item.mrp) {
      clamped = item.mrp
      toast.warning(`Rate capped at MRP ₹${item.mrp}`, {
        id: `rate-mrp-${item.id}`,
        duration: 2500,
      })
    }
    const updates: Partial<BillingItem> = { rate: clamped }
    const tempItem = { ...item, ...updates }
    updates.amount = calculateItemAmount(tempItem)
    onUpdate(item.id, updates)
  }

  return (
    <Card className="mb-3 border border-border shadow-sm overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <input
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value)
                  setShowProductDropdown(true)
                }}
                onFocus={() => setShowProductDropdown(true)}
                onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                placeholder="Product name..."
                className="w-full h-10 bg-muted/40 rounded-md px-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {showProductDropdown && (filteredProducts.length > 0 || mobileProductSearch.loading || productSearch) && (
                <div
                  className="absolute z-50 left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-popover border border-border rounded-md shadow-lg divide-y divide-border/40"
                  onScroll={(e) => {
                    const el = e.currentTarget
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
                      mobileProductSearch.loadMore()
                    }
                  }}
                >
                  {filteredProducts.length === 0 && mobileProductSearch.loading && (
                    <div className="px-3 py-3 text-center text-xs text-muted-foreground">Searching…</div>
                  )}
                  {filteredProducts.length === 0 && !mobileProductSearch.loading && productSearch && (
                    <div className="px-3 py-3 text-center text-xs text-muted-foreground">No products match "{productSearch}"</div>
                  )}
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className="px-3 py-2 hover:bg-accent cursor-pointer"
                      onClick={() => handleProductSelect(p)}
                    >
                      <p className="text-xs font-semibold">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.manufacturer}</p>
                    </div>
                  ))}
                  {filteredProducts.length > 0 && mobileProductSearch.loading && (
                    <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading more…</div>
                  )}
                </div>
              )}
            </div>
            {selectedProduct && (
              <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-1">
                <Badge variant="outline" className="text-[9px] px-1.5 h-4 whitespace-nowrap tabular-nums">MRP: ₹{item.mrp}</Badge>
                {selectedProduct.schedule !== 'NONE' && (
                  <Badge variant="destructive" className="text-[9px] px-1.5 h-4 whitespace-nowrap">Sch {selectedProduct.schedule}</Badge>
                )}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(item.id)}
            className="text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch & Expiry</Label>
            <Select value={item.batchId} onValueChange={(vid) => {
              const b = batches.find(x => x.id === vid)
              if (!b) return
              const fefoBatch = productBatches[0]
              if (fefoBatch && fefoBatch.id !== b.id) {
                toast.warning(
                  `FEFO: ${fefoBatch.batchNumber} expires sooner. Selling later-expiry stock first risks write-offs.`,
                  { duration: 4500 },
                )
              }
              onUpdate(item.id, { batchId: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, mrp: Number(b.mrp || selectedProduct?.mrp) || 0 })
            }}>
              <SelectTrigger className="h-9 text-xs font-mono">
                <SelectValue placeholder="Batch" />
              </SelectTrigger>
              <SelectContent>
                {productBatches.map((b, idx) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    <span className="flex items-center gap-1.5 tabular-nums">
                      {b.batchNumber} ({b.quantity})
                      {idx === 0 && <Badge variant="success" className="text-[8px] px-1 h-3.5">FEFO</Badge>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.expiryDate && (
              <div className={cn(
                "text-[10px] font-semibold uppercase tracking-wider tabular-nums",
                isExpired(item.expiryDate)
                  ? "text-rose-600 dark:text-rose-400"
                  : isNearExpiry(item.expiryDate)
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              )}>
                {isExpired(item.expiryDate) ? 'Expired: ' : 'Exp: '}
                {formatExpiryShort(item.expiryDate)}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</Label>
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="outline" className="h-9 w-9 shrink-0" onClick={() => handleQtyChange(item.quantity - 1)}>−</Button>
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => handleQtyChange(parseInt(e.target.value) || 0)}
                className="w-full h-9 text-center bg-muted/40 border-0 text-sm font-semibold font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              />
              <Button size="icon-sm" variant="outline" className="h-9 w-9 shrink-0" onClick={() => handleQtyChange(item.quantity + 1)}>+</Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate (₹)</Label>
            <input
              type="number"
              step={0.01}
              value={item.rate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)}
              className="w-full h-9 px-2.5 bg-muted/40 border-0 text-sm font-semibold font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            />
          </div>
          <div className="space-y-1.5 text-right">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</Label>
            <div className="h-9 flex items-center justify-end text-base font-semibold font-mono tabular-nums">
              {formatCurrency(item.amount)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: PaymentPanel (with quick denominations)
// ─────────────────────────────────────────────────────────────

function PaymentPanel({
  mode,
  onModeChange,
  grandTotal,
  details,
  onDetailsChange,
  customer,
}: {
  mode: PaymentMode
  onModeChange: (m: PaymentMode) => void
  grandTotal: number
  details: PaymentDetails
  onDetailsChange: (d: Partial<PaymentDetails>) => void
  customer: Customer | null
}) {
  const splitTotal = useMemo(() => {
    return details.splits.reduce((sum, s) => sum + s.amount, 0)
  }, [details.splits])

  const splitRemaining = grandTotal - splitTotal

  const paymentModes: { label: string; value: PaymentMode; icon: React.ReactNode; shortcut?: string }[] = [
    { label: 'Cash', value: 'CASH', icon: <Banknote className="h-3.5 w-3.5" /> },
    { label: 'UPI', value: 'UPI', icon: <Smartphone className="h-3.5 w-3.5" /> },
    { label: 'Credit', value: 'CREDIT', icon: <Clock className="h-3.5 w-3.5" /> },
  ]

  const isExact = details.amountReceived > 0 && Math.abs(details.amountReceived - grandTotal) < 0.01
  const isPartial = details.amountReceived > 0 && details.amountReceived < grandTotal

  return (
    <div className="space-y-3">
      {/* Mode segmented control */}
      <div className="grid grid-cols-3 gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
        {paymentModes.map((pm) => (
          <button
            key={pm.value}
            type="button"
            onClick={() => onModeChange(pm.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
              mode === pm.value
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border/40'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {pm.icon}
            {pm.label}
          </button>
        ))}
      </div>

      {/* Cash */}
      {mode === 'CASH' && (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount Received
            </label>
            <Input
              type="number"
              value={details.amountReceived || ''}
              onChange={(e) =>
                onDetailsChange({ amountReceived: parseFloat(e.target.value) || 0 })
              }
              className="h-10 font-mono text-base font-semibold tabular-nums"
              placeholder={grandTotal.toFixed(2)}
            />
          </div>

          {/* Payment type — Exact / Partial */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onDetailsChange({ amountReceived: grandTotal })}
              disabled={grandTotal <= 0}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                isExact
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-border bg-background text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400'
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Exact
            </button>
            <button
              type="button"
              onClick={() => onDetailsChange({ amountReceived: Math.round((grandTotal / 2) * 100) / 100 })}
              disabled={grandTotal <= 0}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[11px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                isPartial
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-border bg-background text-muted-foreground hover:border-amber-500/40 hover:text-amber-700 dark:hover:text-amber-400'
              )}
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              Partial (½)
            </button>
          </div>

        </div>
      )}

      {/* Card */}
      {mode === 'CARD' && (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount Paid
            </label>
            <Input
              type="number"
              value={details.amountReceived || ''}
              onChange={(e) => onDetailsChange({ amountReceived: parseFloat(e.target.value) || 0 })}
              className="h-10 font-mono text-base font-semibold tabular-nums"
              placeholder={grandTotal.toFixed(2)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Last 4 Digits
              </label>
              <Input
                maxLength={4}
                value={details.cardLast4}
                onChange={(e) => onDetailsChange({ cardLast4: e.target.value.replace(/\D/g, '') })}
                className="h-9 font-mono text-sm tabular-nums"
                placeholder="1234"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reference #
              </label>
              <Input
                value={details.cardRef}
                onChange={(e) => onDetailsChange({ cardRef: e.target.value })}
                className="h-9 text-xs"
                placeholder="Txn ref"
              />
            </div>
          </div>
        </div>
      )}

      {/* UPI */}
      {mode === 'UPI' && (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount Paid
            </label>
            <Input
              type="number"
              value={details.amountReceived || ''}
              onChange={(e) => onDetailsChange({ amountReceived: parseFloat(e.target.value) || 0 })}
              className="h-10 font-mono text-base font-semibold tabular-nums"
              placeholder={grandTotal.toFixed(2)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              UPI Reference #
            </label>
            <Input
              value={details.upiRef}
              onChange={(e) => onDetailsChange({ upiRef: e.target.value })}
              className="h-9 text-xs"
              placeholder="UPI transaction ID"
            />
          </div>
        </div>
      )}

      {/* Credit */}
      {mode === 'CREDIT' && (
        <div className="space-y-2.5">
          {customer && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Outstanding</span>
                <span className="font-semibold font-mono tabular-nums text-foreground">
                  {formatCurrency(Number(customer.currentOutstanding) || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Pending Invoices</span>
                <span className={cn(
                  'font-semibold font-mono tabular-nums',
                  (customer.pendingCreditCount ?? 0) >= 3 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'
                )}>
                  {customer.pendingCreditCount ?? 0} / 3
                </span>
              </div>
              {(customer.pendingCreditCount ?? 0) >= 3 && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold border-t border-amber-500/20 pt-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3" />
                  Credit blocked — clear pending invoices first
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Due Date
            </label>
            <DatePicker
              value={details.creditDueDate}
              onChange={(v) => onDetailsChange({ creditDueDate: v })}
              className="h-9 text-xs"
            />
          </div>
        </div>
      )}

      {/* Split */}
      {mode === 'SPLIT' && (
        <div className="space-y-2">
          {details.splits.map((split, idx) => (
            <div key={split.id} className="flex items-center gap-1.5">
              <select
                value={split.mode}
                onChange={(e) => {
                  const newSplits = [...details.splits]
                  newSplits[idx] = { ...split, mode: e.target.value as 'CASH' | 'CARD' | 'UPI' }
                  onDetailsChange({ splits: newSplits })
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="UPI">UPI</option>
              </select>
              <Input
                type="number"
                value={split.amount || ''}
                onChange={(e) => {
                  const newSplits = [...details.splits]
                  newSplits[idx] = { ...split, amount: parseFloat(e.target.value) || 0 }
                  onDetailsChange({ splits: newSplits })
                }}
                placeholder="Amount"
                className="flex-1 h-9 text-sm font-mono tabular-nums"
              />
              <button
                type="button"
                onClick={() => {
                  onDetailsChange({ splits: details.splits.filter((s) => s.id !== split.id) })
                }}
                className="rounded-md p-1.5 h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => {
              onDetailsChange({
                splits: [
                  ...details.splits,
                  { id: generateRowId(), mode: 'CASH', amount: Math.max(0, splitRemaining) },
                ],
              })
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Split
          </Button>
          {details.splits.length > 0 && (
            <div
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold',
                Math.abs(splitRemaining) < 0.01
                  ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-400'
              )}
            >
              {Math.abs(splitRemaining) < 0.01
                ? <><ShieldCheck className="h-3.5 w-3.5" /> Amounts match total</>
                : <span className="tabular-nums">Remaining: {formatCurrency(splitRemaining)}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function NewSalePage() {
  const products = useMasterDataStore(s => s.products)
  const customers = useMasterDataStore(s => s.customers)
  const batches = useMasterDataStore(s => s.batches)
  const fetchMasterData = useMasterDataStore(s => s.fetchMasterData)
  const activeBranchId = useBranchStore(s => s.activeBranchId)
  const { sidebarCollapsed, toggleSidebar, user: authUser } = useAuthStore()
  const isPharmacist = authUser?.role === 'PHARMACIST'

  // Auto-collapse sidebar for full-screen billing experience, restore on leave
  useEffect(() => {
    if (!sidebarCollapsed) toggleSidebar()
    return () => {
      if (useAuthStore.getState().sidebarCollapsed) toggleSidebar()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // NOTE: We deliberately do NOT call fetchMasterData() here anymore.
    // The customer + product dropdowns now use server-side pagination
    // (usePaginatedSearch), and batches are merged into the store on demand
    // when a product is selected (syncProductBatchesIntoStore).
    // The 22 other pages that depend on the full master data still call
    // fetchMasterData() themselves when they mount.
    // Read URL params
    const params = new URLSearchParams(window.location.search)
    if (params.get('type') === 'quotation') {
      setInvoiceType('quotation')
    }
    // ?leadId=… → ties this sale/quote back to a CRM Lead. We stash it so
    // the create payload picks it up below; the actual prefill (customer
    // name/phone/email) comes from sessionStorage['lead_prefill'].
    const leadIdParam = params.get('leadId')
    if (leadIdParam) {
      setLinkedLeadId(leadIdParam)
      try {
        const stored = sessionStorage.getItem('lead_prefill')
        if (stored) {
          const blob = JSON.parse(stored) as {
            leadId: string
            customerName?: string
            customerPhone?: string
            customerEmail?: string
          }
          // Only consume if it matches the leadId from the URL.
          if (blob.leadId === leadIdParam) {
            const stub = {
              id: '',
              name: blob.customerName ?? '',
              phone: blob.customerPhone ?? '',
              email: blob.customerEmail ?? '',
              type: 'RETAIL' as const,
              creditLimit: 0,
              currentOutstanding: 0,
              loyaltyPoints: 0,
              createdAt: new Date().toISOString(),
            }
            setSelectedCustomer(stub)
            setCustomerSearch(stub.name)
            sessionStorage.removeItem('lead_prefill')
          }
        }
      } catch {
        /* malformed prefill — ignore */
      }
    }
    const dupId = params.get('duplicateId')
    const draftId = params.get('draftId')
    const editId = params.get('editId')
    // `?draftId=…` resumes a server-side draft: prefill the same way `duplicateId`
    // does, but also remember the id so subsequent saves PATCH instead of POST.
    // `?editId=…` edits an existing UNPAID/PARTIAL invoice: prefill the cart
    // and route the save through PATCH /:id/edit-invoice.
    const prefillId = editId ?? draftId ?? dupId
    if (prefillId) {
      api.get(`/billing/${prefillId}`).then((res) => {
        const inv = res.data
        // Pre-fill items from the original/draft invoice
        if (Array.isArray(inv.items) && inv.items.length > 0) {
          setItems(inv.items.map((it: Record<string, unknown>) => ({
            id: crypto.randomUUID(),
            productId: it.productId ?? '',
            productName: it.productName ?? '',
            batchId: it.batchId ?? '',
            batchNumber: it.batchNumber ?? '',
            expiryDate: it.expiryDate ?? '',
            quantity: it.quantity ?? 1,
            mrp: Number(it.mrp ?? 0),
            rate: Number(it.rate ?? it.mrp ?? 0),
            discountPercent: Number(it.discountPercent ?? it.discount ?? 0),
            gstPercent: Number(it.gstPercent ?? it.gstRate ?? 0),
            amount: Number(it.amount ?? it.total ?? 0),
            schedule: it.schedule ?? '',
          })))
        }
        // Drafts and existing-invoice edits restore the customer + payment
        // intent so the user returns to exactly where they left off.
        if (draftId || editId) {
          if (draftId) setEditingDraftId(draftId)
          if (editId) {
            setEditingInvoiceId(editId)
            setEditingInvoiceNumber(inv.invoiceNumber ?? null)
          }
          if (inv.billingType) setBillingType(String(inv.billingType).toLowerCase() as typeof billingType)
          if (inv.paymentMode) setPaymentMode(inv.paymentMode as PaymentMode)
          if (inv.deliveryCharge !== undefined) setDeliveryCharge(Number(inv.deliveryCharge) || 0)
          if (inv.customerId) {
            // Try local cache first (works whether or not master data has loaded);
            // fall back to a direct /customers/:id fetch so this works when the
            // page no longer eagerly preloads the customer list.
            const cached = useMasterDataStore.getState().customers.find((x) => x.id === inv.customerId)
            if (cached) {
              setSelectedCustomer(cached)
              setCustomerSearch(cached.name)
            } else {
              api.get(`/customers/${inv.customerId}`)
                .then((r) => {
                  if (r.data) {
                    setSelectedCustomer(r.data)
                    setCustomerSearch(r.data.name)
                  }
                })
                .catch(() => { /* customer may have been deleted — leave unset */ })
            }
          }
        }
      }).catch(() => {/* ignore if not found */ })
    }
  }, [])

  // ── Auto-draft (crash/reload recovery) ───────────────────
  // Mirrors the in-progress cart to localStorage on every change so the
  // user never loses work to an accidental reload, navigation, or net drop.
  // Cleared on successful save & print, on Hold (since the bill is safely
  // parked in HOLD_KEY), and when the cart becomes empty.
  const AUTO_DRAFT_KEY = 'pbims_newsale_autodraft'
  interface AutoDraftSnapshot {
    items: BillingItem[]
    selectedCustomer: Customer | null
    customerSearch: string
    paymentMode: PaymentMode
    paymentDetails: PaymentDetails
    billingType: 'retail' | 'wholesale'
    invoiceType: 'invoice' | 'quotation'
    deliveryCharge: number
    savedAt: string
  }

  // ── Held Bills ───────────────────────────────────────────
  const HOLD_KEY = 'pbims_held_bills'
  interface HeldBill {
    id: string
    heldAt: string
    customerName: string
    itemCount: number
    total: number
    snapshot: {
      invoiceType: string
      billingType: string
      selectedCustomer: Customer | null
      items: BillingItem[]
      paymentMode: PaymentMode
      paymentDetails: PaymentDetails
      deliveryCharge?: number
    }
  }
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try { return JSON.parse(localStorage.getItem(HOLD_KEY) ?? '[]') } catch { return [] }
  })
  const [heldBillsOpen, setHeldBillsOpen] = useState(false)

  const saveHeldBills = (bills: HeldBill[]) => {
    setHeldBills(bills)
    localStorage.setItem(HOLD_KEY, JSON.stringify(bills))
  }

  const holdCurrentBill = () => {
    const activeItems = items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0)
    if (activeItems.length === 0) { toast.info('Nothing to hold'); return }
    const bill: HeldBill = {
      id: crypto.randomUUID(),
      heldAt: new Date().toISOString(),
      customerName: selectedCustomer?.name ?? '',
      itemCount: activeItems.length,
      total: totals.grandTotal,
      snapshot: { invoiceType, billingType, selectedCustomer, items, paymentMode, paymentDetails, deliveryCharge },
    }
    saveHeldBills([...heldBills, bill])
    // Clear current bill
    setItems([createEmptyItem()])
    setSelectedCustomer(null)
    setCustomerSearch('')
    setPaymentMode('CASH')
    setPaymentDetails({ amountReceived: 0, cardLast4: '', cardRef: '', upiRef: '', creditDueDate: '', splits: [] })
    setDeliveryCharge(0)
    toast.success('Bill held — you can resume it anytime')
  }

  const resumeHeldBill = (bill: HeldBill) => {
    const s = bill.snapshot
    setInvoiceType(s.invoiceType as 'invoice' | 'quotation')
    setBillingType(s.billingType as 'retail' | 'wholesale')
    setSelectedCustomer(s.selectedCustomer)
    setCustomerSearch(s.selectedCustomer?.name ?? '')
    setItems(s.items)
    setPaymentMode(s.paymentMode)
    setPaymentDetails(s.paymentDetails)
    setDeliveryCharge(Number(s.deliveryCharge) || 0)
    saveHeldBills(heldBills.filter((b) => b.id !== bill.id))
    setHeldBillsOpen(false)
    toast.success(`Resumed bill for ${bill.customerName}`)
  }

  const discardHeldBill = (id: string) => {
    saveHeldBills(heldBills.filter((b) => b.id !== id))
  }


  useEffect(() => {
    api.get('/salespersons').then((res) => {
      setSalespersons(Array.isArray(res.data) ? res.data.filter((s: { isActive: boolean }) => s.isActive).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })) : [])
    }).catch(() => setSalespersons([]))
  }, [])

  // ── State ────────────────────────────────────────────────
  const [invoiceType, setInvoiceType] = useState<'invoice' | 'quotation'>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('type') === 'quotation' ? 'quotation' : 'invoice'
  })
  const [billingType, setBillingType] = useState<'retail' | 'wholesale'>('retail')
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  // ?leadId=… → forward as `leadId` on the create payload so the new
  // quote/invoice shows up under the lead's Quotations/Invoices tabs.
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(null)

  // Derive salesperson from selected customer's referredBy field
  const selectedSalesperson = useMemo(() => {
    if (!selectedCustomer?.referredBy) return null
    return salespersons.find((sp) => sp.name === selectedCustomer.referredBy) ?? { id: '', name: selectedCustomer.referredBy }
  }, [selectedCustomer, salespersons])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false)
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [docPreviews, setDocPreviews] = useState<{ name: string; preview: string | null }[]>([])
  const multiDocInputRef = useRef<HTMLInputElement>(null)
  const [nsPhoneCheckError, setNsPhoneCheckError] = useState('')
  const [nsPhoneChecking, setNsPhoneChecking] = useState(false)

  const handleDocFile = (file: File | null) => {
    if (!file) return
    setDocFiles(prev => [...prev, file])
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setDocPreviews(prev => [...prev, { name: file.name, preview: e.target?.result as string }])
      reader.readAsDataURL(file)
    } else {
      setDocPreviews(prev => [...prev, { name: file.name, preview: null }])
    }
  }

  const handleMultiDocFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(file => handleDocFile(file))
  }

  const removeDocFile = (idx: number) => {
    setDocFiles(prev => prev.filter((_, i) => i !== idx))
    setDocPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const checkNsPhoneDuplicate = async (phone: string) => {
    if (!/^\d{10}$/.test(phone)) { setNsPhoneCheckError(''); return }
    setNsPhoneChecking(true)
    setNsPhoneCheckError('')
    try {
      const res = await api.get(`/customers?q=${phone}`)
      const list = Array.isArray(res.data) ? res.data : []
      const dup = list.find((c: any) => c.phone?.replace(/\D/g, '') === phone)
      if (dup) setNsPhoneCheckError(`Phone already used by "${dup.name}". Please verify.`)
    } catch { /* ignore */ } finally { setNsPhoneChecking(false) }
  }

  const [quotationSource, setQuotationSource] = useState<{ id: string; number: string; customerName: string } | null>(null)

  const [items, setItems] = useState<BillingItem[]>(() => {
    // Check quotation prefill first
    const qtStored = sessionStorage.getItem('quotation_prefill')
    if (qtStored) {
      try {
        const qt = JSON.parse(qtStored)
        if (Array.isArray(qt.items) && qt.items.length > 0) {
          return qt.items.map((it: Partial<BillingItem>) => ({ ...createEmptyItem(), ...it, id: generateRowId() }))
        }
      } catch { /* ignore */ }
    }
    const stored = sessionStorage.getItem('repurchase_items')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Partial<BillingItem>) => ({ ...createEmptyItem(), ...item, id: generateRowId() }))
        }
      } catch { /* ignore */ }
    }
    return [createEmptyItem()]
  })

  // Clear prefill data after loaded, set customer name from quotation
  useEffect(() => {
    const qtStored = sessionStorage.getItem('quotation_prefill')
    if (qtStored) {
      try {
        const qt = JSON.parse(qtStored)
        setQuotationSource({ id: qt.quotationId, number: qt.quotationNumber, customerName: qt.customerName })
        if (qt.deliveryCharge !== undefined) setDeliveryCharge(Number(qt.deliveryCharge) || 0)
        // Conversion → invoice. Two paths:
        //   A) Quotation has a real customerId — look it up from master and
        //      select it directly. Do NOT open Add Customer panel.
        //   B) Quotation has only name+phone (stub) — open Add Customer panel
        //      prefilled. User fills the strict-invoice fields and Save
        //      creates the real customer master record.
        if (qt.customerId) {
          // Resolve from master. fetchMasterData runs separately, so we may
          // need to defer until customers list is populated.
          const tryResolve = () => {
            const c = useMasterDataStore.getState().customers.find((x) => x.id === qt.customerId)
            if (c) {
              setSelectedCustomer(c)
              setCustomerSearch(c.name)
              return true
            }
            return false
          }
          if (!tryResolve()) {
            // Customers not loaded yet — retry once next tick after fetchMasterData
            setTimeout(tryResolve, 250)
          }
        } else if (qt.customerName || qt.customerPhone) {
          customerForm.reset({
            name: qt.customerName ?? '',
            phone: qt.customerPhone ?? '',
            type: 'RETAIL',
            email: '',
            address: '',
            gstin: '',
            dlNumber: '',
            registrationNumber: '',
            referredBy: '',
            notes: '',
          })
          // Clear any stale document selections so a previous session's file
          // doesn't auto-attach to the converted customer.
          setDocFiles([])
          setDocPreviews([])
          setNsPhoneCheckError('')
          setAddCustomerDialogOpen(true)
        }
        toast.info(`Items pre-loaded from quotation ${qt.quotationNumber}`)
      } catch { /* ignore */ }
      sessionStorage.removeItem('quotation_prefill')
    } else if (sessionStorage.getItem('repurchase_items')) {
      toast.info(`Items pre-loaded from previous invoice`)
      sessionStorage.removeItem('repurchase_items')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-populate customer + resolve product/batch after quotation prefill.
  // We no longer wait for a full master-data load; we issue targeted server
  // queries by name (/customers?q=, /products?q=) and pick the closest match.
  useEffect(() => {
    if (!quotationSource) return
    let cancelled = false

    ;(async () => {
      // 1) Resolve the customer by name (one focused query, not full catalog)
      try {
        const cRes = await api.get('/customers', { params: { q: quotationSource.customerName, take: 5 } })
        const cData = Array.isArray(cRes.data) ? cRes.data : (cRes.data?.data ?? [])
        const matched = cData.find((c: Customer) => c.name.toLowerCase() === quotationSource.customerName.toLowerCase())
          ?? cData[0]
        if (matched && !cancelled) setSelectedCustomer(matched)
      } catch { /* non-blocking */ }

      // 2) Resolve each item's product by name and merge its batches into the store
      const currentItems = items
      const resolved = await Promise.all(currentItems.map(async (it) => {
        if (!it.productName || it.productId) return it
        try {
          const pRes = await api.get('/products', { params: { q: it.productName, take: 5 } })
          const pData = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.data ?? [])
          const product = pData.find((p: Product) => p.name.toLowerCase() === it.productName.toLowerCase())
            ?? pData[0]
          if (!product) return it
          syncProductBatchesIntoStore(product)
          const productBatches = useMasterDataStore.getState().batches
            .filter((b) => b.productId === product.id && b.quantity > 0)
            .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
          const batch = productBatches[0]
          const rate = it.rate || product.sellingRate || 0
          const qty = it.quantity || 1
          const gstPercent = product.gstRate || 0
          const discountPercent = it.discountPercent || 0
          const baseAmount = rate * qty * (1 - discountPercent / 100)
          const gstAmount = baseAmount * (gstPercent / 100)
          const amount = baseAmount + gstAmount
          return {
            ...it,
            productId: product.id,
            mrp: batch?.mrp || product.mrp || rate,
            rate,
            gstPercent,
            amount,
            ...(batch && {
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              expiryDate: batch.expiryDate,
            }),
            schedule: product.schedule ?? 'NONE',
          }
        } catch {
          return it
        }
      }))

      if (!cancelled) setItems(resolved)
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationSource])

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CREDIT')
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({
    amountReceived: 0,
    cardLast4: '',
    cardRef: '',
    upiRef: '',
    creditDueDate: '',
    splits: [],
  })

  // Editable Delivery / Packaging fee. Non-taxable add-on folded into the
  // pre-rounding total so Net Payable rounds to a whole rupee.
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0)

  // ── Auto-draft restore (run once on mount, after state is initialized) ──
  // Skip restoration if the page is opened for an explicit prefill (draftId,
  // duplicateId, quotation conversion, or re-purchase) — those paths already
  // populate the cart from their own source of truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hasExplicitPrefill = !!(
      params.get('draftId') ||
      params.get('duplicateId') ||
      params.get('editId') ||
      sessionStorage.getItem('quotation_prefill') ||
      sessionStorage.getItem('repurchase_items')
    )
    if (hasExplicitPrefill) return

    try {
      const stored = localStorage.getItem(AUTO_DRAFT_KEY)
      if (!stored) return
      const snap = JSON.parse(stored) as AutoDraftSnapshot
      const hasContent = Array.isArray(snap.items) && snap.items.some((i) => i.productId)
      if (!hasContent) {
        localStorage.removeItem(AUTO_DRAFT_KEY)
        return
      }

      setItems(snap.items)
      if (snap.selectedCustomer) {
        setSelectedCustomer(snap.selectedCustomer)
        setCustomerSearch(snap.customerSearch ?? snap.selectedCustomer.name)
      }
      if (snap.paymentMode) setPaymentMode(snap.paymentMode)
      if (snap.paymentDetails) setPaymentDetails(snap.paymentDetails)
      if (snap.billingType) setBillingType(snap.billingType)
      if (snap.invoiceType) setInvoiceType(snap.invoiceType)
      if (typeof snap.deliveryCharge === 'number') setDeliveryCharge(snap.deliveryCharge)

      const itemCount = snap.items.filter((i) => i.productId).length
      const minutesAgo = Math.max(1, Math.round((Date.now() - new Date(snap.savedAt).getTime()) / 60000))
      toast.info(
        `Restored your in-progress sale (${itemCount} item${itemCount !== 1 ? 's' : ''}, ${minutesAgo} min ago)`,
        { duration: 5000 },
      )

      // Re-hydrate batches for the restored products so FEFO + batch dropdowns
      // work immediately after restore. Background fetches, one per unique id.
      const uniqueProductIds = Array.from(new Set(snap.items.filter((i) => i.productId).map((i) => i.productId)))
      uniqueProductIds.forEach((pid) => {
        api.get(`/products/${pid}`)
          .then((r) => syncProductBatchesIntoStore(r.data))
          .catch(() => { /* product may have been deleted — keep the stale row */ })
      })
    } catch {
      // Corrupted snapshot — drop it
      localStorage.removeItem(AUTO_DRAFT_KEY)
    }
  }, [])

  // ── Auto-draft save (mirrors cart state to localStorage on every change) ──
  useEffect(() => {
    const hasContent = items.some((i) => i.productId) || !!selectedCustomer
    if (!hasContent) {
      localStorage.removeItem(AUTO_DRAFT_KEY)
      return
    }
    const snap: AutoDraftSnapshot = {
      items,
      selectedCustomer,
      customerSearch,
      paymentMode,
      paymentDetails,
      billingType,
      invoiceType,
      deliveryCharge,
      savedAt: new Date().toISOString(),
    }
    try {
      localStorage.setItem(AUTO_DRAFT_KEY, JSON.stringify(snap))
    } catch { /* localStorage full / unavailable — non-fatal */ }
  }, [items, selectedCustomer, customerSearch, paymentMode, paymentDetails, billingType, invoiceType, deliveryCharge])

  // ── Customer last-sale price cache: productId → rate ─────
  const [customerLastRates, setCustomerLastRates] = useState<Record<string, number>>({})

  // ── Table view tabs ───────────────────────────────────────
  type TableView = 'products' | 'customer-history' | 'customer-reminders' | 'product-history' | 'quotations'
  const [tableView, setTableView] = useState<TableView>('customer-history')
  const [mobileStep, setMobileStep] = useState<'items' | 'checkout'>('items')
  // Toggle: show inline purchase-history sub-rows under each product row in the
  // Products tab. Off by default — Product History tab provides the same view.
  const [showInlineHistory, setShowInlineHistory] = useState(false)

  // ── Customer invoice history ──────────────────────────────
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([])
  const [customerInvoicesLoading, setCustomerInvoicesLoading] = useState(false)
  const [selectedHistoryInvoice, setSelectedHistoryInvoice] = useState<Invoice | null>(null)
  const [historyInvoiceOpen, setHistoryInvoiceOpen] = useState(false)

  // ── Quotations tab ─────────────────────────────────────────
  // Lazy-loaded: only fires when the user opens the Quotations tab, and refetches
  // when the selected customer changes (id or phone) so the filter is live.
  const [quotationsList, setQuotationsList] = useState<Quotation[]>([])
  const [quotationsLoading, setQuotationsLoading] = useState(false)

  useEffect(() => {
    if (tableView !== 'quotations') return
    setQuotationsLoading(true)
    const params: Record<string, string> = {}
    if (activeBranchId) params.branchId = activeBranchId
    // Real customer → filter by id. Stub customer (id='') → filter by phone.
    // No customer → no filter, fetch all.
    if (selectedCustomer?.id) params.customerId = selectedCustomer.id
    else if (selectedCustomer?.phone) params.customerPhone = selectedCustomer.phone
    api.get('/quotations', { params })
      .then((res) => {
        const list: Quotation[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
        // Sort newest first
        list.sort((a, b) => new Date(b.date ?? b.createdAt).getTime() - new Date(a.date ?? a.createdAt).getTime())
        setQuotationsList(list)
      })
      .catch(() => setQuotationsList([]))
      .finally(() => setQuotationsLoading(false))
  }, [tableView, selectedCustomer, activeBranchId])

  // ── Customer reminders tab ────────────────────────────────
  const [customerReminders, setCustomerReminders] = useState<any[]>([])
  const [customerRemindersLoading, setCustomerRemindersLoading] = useState(false)

  useEffect(() => {
    // Stub quotation customer (id='') has no reminders in DB. Skip fetch.
    if (tableView !== 'customer-reminders' || !selectedCustomer || !selectedCustomer.id) {
      setCustomerReminders([])
      return
    }
    setCustomerRemindersLoading(true)
    api.get('/reminders', { params: { branchId: activeBranchId || undefined } })
      .then(res => {
        const all: any[] = Array.isArray(res.data) ? res.data : []
        setCustomerReminders(all.filter((r: any) => r.customerId === selectedCustomer.id))
      })
      .catch(() => setCustomerReminders([]))
      .finally(() => setCustomerRemindersLoading(false))
  }, [tableView, selectedCustomer, activeBranchId])


  // Fetch customer invoices whenever customer changes — used for both history panel and last-rate cache
  useEffect(() => {
    // Stub quotation customer (id='') has no master record — there is no
    // history to fetch and an empty customerId would otherwise return ALL
    // invoices from the backend.
    if (!selectedCustomer || !selectedCustomer.id) {
      setCustomerInvoices([])
      setCustomerLastRates({})
      return
    }
    setCustomerInvoicesLoading(true)
    api.get(`/billing?customerId=${selectedCustomer.id}`)
      .then((res) => {
        const invoices: Invoice[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
        invoices.sort((a: any, b: any) => new Date(b.date ?? b.createdAt).getTime() - new Date(a.date ?? a.createdAt).getTime())
        setCustomerInvoices(invoices)
        // Build last-rate cache
        const rates: Record<string, number> = {}
        for (const inv of invoices) {
          for (const it of ((inv as any).items ?? [])) {
            if (it.productId && rates[it.productId] === undefined) {
              rates[it.productId] = Number(it.rate)
            }
          }
        }
        setCustomerLastRates(rates)
      })
      .catch(() => { setCustomerInvoices([]); setCustomerLastRates({}) })
      .finally(() => setCustomerInvoicesLoading(false))
  }, [selectedCustomer])

  // Keep history tab fetch in sync for tab-switch (no-op now since customer effect covers it)
  useEffect(() => {
    if (tableView === 'customer-history' && selectedCustomer && selectedCustomer.id && customerInvoices.length === 0 && !customerInvoicesLoading) {
      setCustomerInvoicesLoading(true)
      api.get(`/billing?customerId=${selectedCustomer.id}`)
        .then((res) => setCustomerInvoices(Array.isArray(res.data) ? res.data : res.data?.data ?? []))
        .catch(() => setCustomerInvoices([]))
        .finally(() => setCustomerInvoicesLoading(false))
    }
  }, [tableView, selectedCustomer])

  // ── Refs ──────────────────────────────────────────────────
  const heroSearchRef = useRef<HTMLInputElement>(null)
  const customerRef = useRef<HTMLDivElement>(null)
  const lastKeypressTimeRef = useRef<number>(0)
  const barcodeCharCountRef = useRef<number>(0)

  // ── Hero search state ─────────────────────────────────────
  const [heroSearch, setHeroSearch] = useState('')
  const [showHeroResults, setShowHeroResults] = useState(false)
  const [heroSelectedIdx, setHeroSelectedIdx] = useState(0)

  // ── Auto-focus hero search on mount ──────────────────────
  useEffect(() => {
    setTimeout(() => heroSearchRef.current?.focus(), 100)
  }, [])

  // ── Close dropdowns on outside click ──────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const invoiceNumber = useMemo(
    () => generateInvoiceNumber(invoiceType === 'invoice' ? 'INV' : 'QTN', 127),
    [invoiceType]
  )

  // ── Hero product search — server-paginated (20 + infinite scroll) ──
  // Only fetches while results popover is open. Server searches name/generic/
  // manufacturer/hsnCode/barcode (Phase A backend fix expanded the q clause).
  const heroSearchResults = usePaginatedSearch<Product>({
    endpoint: '/products',
    pageSize: 20,
    enabled: showHeroResults,
  })

  useEffect(() => {
    heroSearchResults.setQuery(heroSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroSearch])

  const heroResults = heroSearchResults.items

  // ── Customer dropdown — server-paginated search (20 + infinite scroll) ──
  // Only fetches while the dropdown is open. Resets on every debounced query change.
  const customerSearchResults = usePaginatedSearch<Customer>({
    endpoint: '/customers',
    pageSize: 20,
    enabled: showCustomerDropdown,
  })

  // Wire the dropdown's text input to the hook's debounced query
  useEffect(() => {
    customerSearchResults.setQuery(customerSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSearch])

  const filteredCustomers = customerSearchResults.items

  // ── Hero product add ──────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const addProductFromSearch = useCallback(
    (product: Product) => {
      if (!selectedCustomer) {
        toast.error('Please select a customer before adding products')
        setShowCustomerDropdown(true)
        setHeroSearch('')
        setShowHeroResults(false)
        setTimeout(() => heroSearchRef.current?.focus(), 300)
        return
      }

      // Merge this product's batches + full record into the store so FEFO
      // and downstream batch operations resolve correctly even when the page
      // didn't preload the master catalog.
      syncProductBatchesIntoStore(product)

      const existingIdx = items.findIndex((i) => i.productId === product.id)
      if (existingIdx !== -1) {
        // Increment quantity of existing item
        const existing = items[existingIdx]
        const newQty = existing.quantity + 1
        const updates: Partial<BillingItem> = { quantity: newQty }
        const tempItem = { ...existing, ...updates }
        updates.amount = calculateItemAmount(tempItem)
        setItems((prev) =>
          prev.map((item) => (item.id === existing.id ? { ...item, ...updates } : item))
        )
      } else {
        // Create new pre-filled item
        const productBatches = useMasterDataStore.getState().batches
          .filter((b) => b.productId === product.id && b.quantity > 0)
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

        const firstBatch = productBatches[0]
        const defaultRate = billingType === 'wholesale' ? product.wholesaleRate : product.sellingRate
        // Use last sold rate to this customer if available
        const lastRate = customerLastRates[product.id]
        const rate = lastRate ?? defaultRate
        if (lastRate !== undefined) {
          toast.info(`Using last sale price ₹${lastRate} for ${product.name}`, { duration: 2000 })
        }

        const newItem: BillingItem = {
          ...createEmptyItem(),
          productId: product.id,
          productName: product.name,
          gstPercent: product.gstRate,
          mrp: Number(firstBatch?.mrp || product.mrp) || 0,
          rate: Number(rate) || 0,
          schedule: product.schedule,
          batchId: firstBatch?.id ?? '',
          batchNumber: firstBatch?.batchNumber ?? '',
          expiryDate: firstBatch?.expiryDate ?? '',
          quantity: 1,
        }
        newItem.amount = calculateItemAmount(newItem)

        setItems((prev) => {
          // Remove any empty items first
          const nonEmpty = prev.filter((i) => i.productId)
          return [...nonEmpty, newItem]
        })
      }

      // Clear search and re-focus
      setHeroSearch('')
      setShowHeroResults(false)
      setHeroSelectedIdx(0)
      setTimeout(() => heroSearchRef.current?.focus(), 50)
    },
    [items, billingType, selectedCustomer, customerLastRates]
  )

  // ── Hero keyboard navigation ──────────────────────────────
  const handleHeroKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const now = Date.now()
      const delta = now - lastKeypressTimeRef.current
      lastKeypressTimeRef.current = now

      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') {
        // Track rapid keystrokes — barcode scanners fire < 30ms apart
        barcodeCharCountRef.current = delta < 50 ? barcodeCharCountRef.current + 1 : 1
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHeroSelectedIdx((prev) => Math.min(prev + 1, heroResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHeroSelectedIdx((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const isBarcodeScanner = barcodeCharCountRef.current >= 4 && delta < 100
        barcodeCharCountRef.current = 0

        if (isBarcodeScanner) {
          // Server-side exact barcode lookup (we no longer hold every product
          // in memory). The debounce hasn't fired yet at Enter time, so issue
          // a direct take=1 query for the exact match.
          const barcode = heroSearchRef.current?.value ?? ''
          if (!barcode) return
          api.get('/products', { params: { q: barcode, take: 1 } })
            .then((res) => {
              const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
              const exact = data.find((p: Product) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase())
                ?? data[0]
              if (exact) {
                addProductFromSearch(exact)
                toast.success(`Scanned: ${exact.name}`)
              } else {
                toast.error(`Barcode not found: ${barcode}`)
                setHeroSearch('')
              }
            })
            .catch(() => {
              toast.error(`Barcode lookup failed: ${barcode}`)
            })
          return
        }

        if (heroResults.length > 0) {
          addProductFromSearch(heroResults[heroSelectedIdx])
        }
      } else if (e.key === 'Escape') {
        setShowHeroResults(false)
        setHeroSearch('')
        barcodeCharCountRef.current = 0
      }
    },
    [heroResults, heroSelectedIdx, addProductFromSearch]
  )

  // ── Item management ─────────────────────────────────────
  const updateItem = useCallback((id: string, updates: Partial<BillingItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const filtered = prev.filter((item) => item.id !== id)
      return filtered.length === 0 ? [createEmptyItem()] : filtered
    })
  }, [])

  const addItem = useCallback(() => {
    if (!selectedCustomer) {
      toast.error('Please select a customer before adding products')
      setShowCustomerDropdown(true)
      return
    }
    setItems((prev) => [...prev, createEmptyItem()])
  }, [selectedCustomer])

  // ── Calculations ──────────────────────────────────────
  const totals = useMemo(() => {
    const activeItems = items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0)

    let subtotal = 0
    let productDiscount = 0
    let taxableAmount = 0
    let totalCgst = 0
    let totalSgst = 0

    activeItems.forEach((item) => {
      const base = item.quantity * item.rate
      const disc = base * (item.discountPercent / 100)
      const taxable = base - disc
      const gst = taxable * (item.gstPercent / 100)
      const cgstVal = gst / 2
      const sgstVal = gst / 2

      subtotal += base
      productDiscount += disc
      taxableAmount += taxable
      totalCgst += cgstVal
      totalSgst += sgstVal
    })

    const delivery = Math.max(0, Number(deliveryCharge) || 0)
    const rawTotal = taxableAmount + totalCgst + totalSgst + delivery
    const rounded = Math.round(rawTotal)
    const roundOff = rounded - rawTotal

    return {
      subtotal,
      productDiscount,
      taxableAmount,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: 0,
      deliveryCharge: delivery,
      roundOff,
      grandTotal: rounded,
    }
  }, [items, deliveryCharge, invoiceType])

  // ── Pending credit check (max 3 open UNPAID/PARTIAL invoices) ──
  const pendingCreditCount = selectedCustomer?.pendingCreditCount ?? 0
  const isCreditBlocked = pendingCreditCount >= 3

  // State for the pay-pending-credits dialog
  const [creditPayDialogOpen, setCreditPayDialogOpen] = useState(false)
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([])
  const [pendingInvoicesLoading, setPendingInvoicesLoading] = useState(false)
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMode, setCollectMode] = useState('CASH')

  const openCreditPayDialog = useCallback(async () => {
    if (!selectedCustomer) return
    setCreditPayDialogOpen(true)
    setPendingInvoicesLoading(true)
    try {
      const res = await api.get(`/billing?customerId=${selectedCustomer.id}`)
      const all: Invoice[] = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
      setPendingInvoices(all.filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL'))
    } catch {
      toast.error('Failed to load pending invoices')
    } finally {
      setPendingInvoicesLoading(false)
    }
  }, [selectedCustomer])

  const handleCollectOne = async (invoiceId: string) => {
    if (!collectAmount || Number(collectAmount) <= 0) {
      toast.error('Enter an amount to collect')
      return
    }
    // Re-entry guard: rapid double-click would fire two PATCHes and double-credit.
    if (payingInvoiceId) return
    setPayingInvoiceId(invoiceId)
    try {
      await api.patch(`/billing/${invoiceId}/collect-payment`, {
        amountReceived: parseFloat(collectAmount),
        paymentMode: collectMode,
      })
      toast.success('Payment collected')
      setCollectAmount('')
      // Refresh pending list and customer
      const [invRes, custRes] = await Promise.all([
        api.get(`/billing?customerId=${selectedCustomer!.id}`),
        api.get(`/customers/${selectedCustomer!.id}`),
      ])
      const all: Invoice[] = Array.isArray(invRes.data) ? invRes.data : (invRes.data.data ?? [])
      const updated = all.filter((inv) => inv.status === 'UNPAID' || inv.status === 'PARTIAL')
      setPendingInvoices(updated)
      // Refresh selectedCustomer so pendingCreditCount updates
      if (custRes.data) setSelectedCustomer({ ...selectedCustomer!, ...custRes.data, pendingCreditCount: updated.length })
    } catch {
      toast.error('Failed to collect payment')
    } finally {
      setPayingInvoiceId(null)
    }
  }

  const handleCollectAll = async () => {
    if (!selectedCustomer) return
    // Re-entry guard: if a collect is already in flight, swallow this click.
    // Without it, rapid double-clicks fire two POSTs that both apply the same
    // payment — customer's outstanding would go negative.
    if (payingInvoiceId === 'all') return
    setPayingInvoiceId('all')
    try {
      const res = await api.post(`/customers/${selectedCustomer.id}/payment`, {
        amount: pendingInvoices.reduce((s, inv) => s + (Number(inv.grandTotal) - Number(inv.amountPaid)), 0),
        paymentMode: collectMode,
      })
      toast.success(`All pending credits cleared. Receipt: ${res.data.receiptNumber}`)
      setPendingInvoices([])
      setSelectedCustomer({ ...selectedCustomer!, currentOutstanding: 0, pendingCreditCount: 0 })
      setCreditPayDialogOpen(false)
    } catch {
      toast.error('Failed to collect all payments')
    } finally {
      setPayingInvoiceId(null)
    }
  }

  // ── Submit Invoice ──────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSavedInvoice, setLastSavedInvoice] = useState<Invoice | null>(null)
  // When resuming a server-side draft (?draftId=…), this holds the id so
  // saves re-route to PATCH instead of POST and "Save & Print" finalizes.
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  // When editing an existing UNPAID / PARTIAL invoice (?editId=…), this holds
  // the id so the save call routes to PATCH /billing/:id/edit-invoice (which
  // reverses the original stock/ledger/loyalty and re-applies the new figures)
  // instead of POSTing a brand-new invoice.
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  // ── Invoice Preview ────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false)

  // Build a local Invoice object from current form state for preview (no save)
  const buildPreviewInvoice = (): Invoice => ({
    id: '__preview__',
    invoiceNumber: invoiceNumber,
    date: new Date().toISOString(),
    type: invoiceType === 'invoice' ? 'INVOICE' : 'QUOTATION',
    billingType: billingType.toUpperCase() as 'RETAIL' | 'WHOLESALE',
    customerId: selectedCustomer?.id,
    customerName: selectedCustomer?.name ?? '—',
    items: items
      .filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0)
      .map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        batchId: i.batchId,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
        quantity: i.quantity,
        mrp: i.mrp,
        rate: i.rate,
        discountPercent: i.discountPercent,
        gstPercent: i.gstPercent,
        amount: i.amount,
      })),
    subtotal: totals.subtotal,
    productDiscount: totals.productDiscount,
    taxableAmount: totals.taxableAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: 0,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    paymentMode: paymentMode as Invoice['paymentMode'],
    status: paymentMode === 'CREDIT' ? 'UNPAID' : 'PAID',
    amountPaid: paymentMode === 'CASH' ? (paymentDetails.amountReceived || totals.grandTotal) : totals.grandTotal,
    changeReturned: paymentMode === 'CASH' ? Math.max(0, paymentDetails.amountReceived - totals.grandTotal) : 0,
    salespersonName: selectedSalesperson?.name,
    createdBy: 'Preview',
    createdAt: new Date().toISOString(),
  })

  // ── Quick Reminder ────────────────────────────────────────
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderDay, setReminderDay] = useState('')
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  const [reminderSaving, setReminderSaving] = useState(false)

  const handleSaveReminder = async () => {
    if (!selectedCustomer || !reminderDay || !reminderTitle) {
      toast.error('Day and title are required')
      return
    }
    setReminderSaving(true)
    try {
      await api.post('/reminders', {
        customerId: selectedCustomer.id,
        dayOfMonth: parseInt(reminderDay),
        title: reminderTitle,
        notes: reminderNotes || undefined,
        branchId: activeBranchId || undefined,
      })
      toast.success(`Reminder set for ${selectedCustomer.name} on day ${reminderDay} of every month`)
      setReminderOpen(false)
      setReminderDay('')
      setReminderTitle('')
      setReminderNotes('')
    } catch {
      toast.error('Failed to set reminder')
    } finally {
      setReminderSaving(false)
    }
  }
  // Save the current bill as a server-side draft (no stock movement, no
  // payment, no loyalty). New draft → POST; resuming an existing one → PATCH.
  // User can come back later (different device, different session) and finish.
  const saveAsDraft = async () => {
    if (editingInvoiceId) {
      // You can't demote a real invoice back to DRAFT — it already has stock,
      // ledger, and loyalty side effects in place. The only way out is the
      // regular Save & Print, which routes through the edit-invoice endpoint.
      toast.info('This is an existing invoice — use Save & Print to apply your changes.')
      return
    }
    const activeItems = items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0)
    if (activeItems.length === 0) {
      toast.info('Add at least one item before saving as draft')
      return
    }
    if (!selectedCustomer) {
      toast.error('Please select a customer before saving as draft')
      setShowCustomerDropdown(true)
      return
    }
    if (invoiceType === 'quotation') {
      // Quotations already live in their own flow with status DRAFT — fall
      // back to the regular submit so we don't accidentally split the path.
      submitInvoice()
      return
    }

    // Invoice-draft path requires a real customer record; reject lightweight
    // stubs (id='') by re-opening the Add Customer panel with prefilled data.
    if (!selectedCustomer.id) {
      toast.error('Complete the customer details before saving as draft')
      customerForm.reset({
        name: selectedCustomer.name ?? '',
        phone: selectedCustomer.phone ?? '',
        type: selectedCustomer.type ?? 'RETAIL',
        email: selectedCustomer.email ?? '',
        address: selectedCustomer.address ?? '',
        gstin: selectedCustomer.gstin ?? '',
        dlNumber: selectedCustomer.dlNumber ?? '',
        registrationNumber: '',
        referredBy: selectedCustomer.referredBy ?? '',
        notes: selectedCustomer.notes ?? '',
      })
      setAddCustomerDialogOpen(true)
      return
    }

    setIsSavingDraft(true)
    try {
      const payload: Record<string, unknown> = {
        type: 'INVOICE',
        billingType: billingType.toUpperCase(),
        customerName: selectedCustomer.name,
        customerId: selectedCustomer.id,
        paymentMode: paymentMode.toUpperCase(),
        subtotal: Number(totals.subtotal) || 0,
        productDiscount: Number(totals.productDiscount) || 0,
        taxableAmount: Number(totals.taxableAmount) || 0,
        cgst: Number(totals.cgst) || 0,
        sgst: Number(totals.sgst) || 0,
        igst: 0,
        deliveryCharge: Number(totals.deliveryCharge) || 0,
        roundOff: Number(totals.roundOff) || 0,
        grandTotal: Number(totals.grandTotal) || 0,
        amountPaid: 0,
        changeReturned: 0,
        status: 'DRAFT',
        ...(activeBranchId && { branchId: activeBranchId }),
        ...(selectedSalesperson && { salespersonId: selectedSalesperson.id, salespersonName: selectedSalesperson.name }),
        items: activeItems.map((item) => {
          const d = item.expiryDate ? new Date(item.expiryDate) : null
          const safeIso = d && !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString()
          return {
            productId: item.productId,
            productName: item.productName,
            batchId: item.batchId,
            batchNumber: item.batchNumber,
            expiryDate: safeIso,
            quantity: Number(item.quantity) || 1,
            mrp: Number(item.mrp) || 0,
            rate: Number(item.rate) || 0,
            discountPercent: Number(item.discountPercent) || 0,
            gstPercent: Number(item.gstPercent) || 0,
            amount: Number(item.amount) || 0,
          }
        }),
      }

      if (editingDraftId) {
        await api.patch(`/billing/${editingDraftId}/save-draft`, payload)
      } else {
        await api.post('/billing', payload)
      }
      localStorage.removeItem(AUTO_DRAFT_KEY)
      toast.success('Saved as draft — find it in Sales under Drafts')
      navigate('/billing/sales?status=DRAFT')
    } catch (error: unknown) {
      const errorMsg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save draft'
      console.error(error)
      toast.error(errorMsg)
    } finally {
      setIsSavingDraft(false)
    }
  }

  const submitInvoice = async (forcePaymentMode?: string) => {
    const activeItems = items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0)
    const effectivePaymentMode = forcePaymentMode ?? paymentMode
    if (activeItems.length === 0) {
      toast.error('Please add items to the bill')
      return;
    }

    if (!selectedCustomer) {
      toast.error('Please select a customer before saving')
      setShowCustomerDropdown(true)
      return;
    }

    // Guard: a stub (id='') was created in quotation mode. Don't let it through
    // the invoice path — backend would reject the empty FK. Force the user to
    // complete the full customer record via the existing inline panel.
    if (invoiceType !== 'quotation' && !selectedCustomer.id) {
      toast.error('Complete the customer details before saving the invoice')
      customerForm.reset({
        name: selectedCustomer.name ?? '',
        phone: selectedCustomer.phone ?? '',
        type: selectedCustomer.type ?? 'RETAIL',
        email: selectedCustomer.email ?? '',
        address: selectedCustomer.address ?? '',
        gstin: selectedCustomer.gstin ?? '',
        dlNumber: selectedCustomer.dlNumber ?? '',
        registrationNumber: '',
        referredBy: selectedCustomer.referredBy ?? '',
        notes: selectedCustomer.notes ?? '',
      })
      setAddCustomerDialogOpen(true)
      return
    }

    if (effectivePaymentMode === 'CREDIT' && isCreditBlocked && !isPharmacist) {
      toast.error(`${selectedCustomer.name} has ${pendingCreditCount} unpaid credit invoices. Please clear pending credits first.`)
      openCreditPayDialog()
      return
    }

    // Validate qty against batch stock — skipped for quotations because the
    // product may not be in inventory yet (the whole point of quoting first).
    if (invoiceType !== 'quotation') {
      for (const item of activeItems) {
        const batch = batches.find((b) => b.id === item.batchId)
        if (batch && item.quantity > batch.quantity) {
          toast.error(`"${item.productName}" qty (${item.quantity}) exceeds available stock (${batch.quantity})`)
          return
        }
      }
    } else {
      // Quotation-only validation: name + 10-digit phone on the customer stub.
      if (!selectedCustomer.name?.trim() || !/^\d{10}$/.test(selectedCustomer.phone || '')) {
        toast.error('Quotation customer needs a name and 10-digit phone')
        return
      }
      // At least one item must have a product name typed.
      if (!activeItems.some((it) => (it.productName || '').trim() !== '')) {
        toast.error('Type at least one product name for the quotation')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        type: invoiceType.toUpperCase(),
        billingType: billingType.toUpperCase(),
        customerName: selectedCustomer!.name,
        customerId: selectedCustomer!.id,
        paymentMode: effectivePaymentMode.toUpperCase(),

        subtotal: Number(totals.subtotal) || 0,
        productDiscount: Number(totals.productDiscount) || 0,
        taxableAmount: Number(totals.taxableAmount) || 0,
        cgst: Number(totals.cgst) || 0,
        sgst: Number(totals.sgst) || 0,
        igst: 0,
        deliveryCharge: Number(totals.deliveryCharge) || 0,
        roundOff: Number(totals.roundOff) || 0,
        grandTotal: Number(totals.grandTotal) || 0,
        amountPaid: invoiceType === 'quotation' ? 0
          : effectivePaymentMode === 'CASH' ? (Number(paymentDetails.amountReceived) || 0)
            : effectivePaymentMode === 'CREDIT' ? 0
              : effectivePaymentMode === 'SPLIT' ? (paymentDetails.splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0))
                : (Number(paymentDetails.amountReceived) || Number(totals.grandTotal) || 0),
        changeReturned: invoiceType === 'quotation' ? 0 : Number(effectivePaymentMode === 'CASH' ? Math.max(0, paymentDetails.amountReceived - totals.grandTotal) : 0),
        status: invoiceType === 'quotation' ? 'DRAFT' : effectivePaymentMode === 'CREDIT' ? 'UNPAID' : 'PAID',

        ...(activeBranchId && { branchId: activeBranchId }),
        ...(selectedSalesperson && { salespersonId: selectedSalesperson.id, salespersonName: selectedSalesperson.name }),
        // CRM linkage — set when the page is opened with ?leadId=…
        ...(linkedLeadId && { leadId: linkedLeadId }),

        items: activeItems.map(item => {
          // Free-text quotation rows have no expiryDate. `new Date('').toISOString()`
          // throws RangeError, so coerce to a valid ISO string (the invoice
          // branch below never uses this for quotations, but the object is
          // built eagerly above the branch).
          const d = item.expiryDate ? new Date(item.expiryDate) : null
          const safeIso = d && !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString()
          return {
            productId: item.productId,
            productName: item.productName,
            batchId: item.batchId,
            batchNumber: item.batchNumber,
            expiryDate: safeIso,
            quantity: Number(item.quantity) || 1,
            mrp: Number(item.mrp) || 0,
            rate: Number(item.rate) || 0,
            discountPercent: Number(item.discountPercent) || 0,
            gstPercent: Number(item.gstPercent) || 0,
            amount: Number(item.amount) || 0
          }
        })
      }

      let endpoint: string
      let finalPayload: Record<string, unknown>
      // Route: brand-new quotation → /quotations. Finalizing a server-side
      // draft → PATCH /billing/:id/finalize (runs the stock+ledger+loyalty
      // side effects that POST skipped). Everything else → POST /billing.
      let method: 'post' | 'patch' = 'post'

      if (invoiceType === 'quotation') {
        endpoint = '/quotations'
        // Lightweight customers carry an empty id — don't send that to the
        // backend (FK validation would reject it). Send customerPhone always.
        finalPayload = {
          ...(selectedCustomer!.id && { customerId: selectedCustomer!.id }),
          customerName: selectedCustomer!.name,
          ...(selectedCustomer!.phone && { customerPhone: selectedCustomer!.phone }),
          // CRM linkage — set when the page is opened with ?leadId=…
          ...(linkedLeadId && { leadId: linkedLeadId }),
          subtotal: Number(totals.subtotal) || 0,
          cgst: Number(totals.cgst) || 0,
          sgst: Number(totals.sgst) || 0,
          deliveryCharge: Number(totals.deliveryCharge) || 0,
          total: Number(totals.grandTotal) || 0,
          ...(activeBranchId && { branchId: activeBranchId }),
          items: activeItems.map(item => ({
            // Only send identifiers if the user actually picked a real product/batch;
            // free-text quotation items leave these empty.
            ...(item.productId && { productId: item.productId }),
            productName: item.productName,
            ...(item.batchId && { batchId: item.batchId, batchNumber: item.batchNumber }),
            quantity: Number(item.quantity) || 1,
            mrp: Number(item.mrp) || 0,
            rate: Number(item.rate) || 0,
            discountPercent: Number(item.discountPercent) || 0,
            gstPercent: Number(item.gstPercent) || 0,
            amount: Number(item.amount) || 0,
          })),
        }
      } else if (editingInvoiceId) {
        // Editing an existing UNPAID / PARTIAL invoice. Server reverses the
        // original side effects and re-applies the new figures atomically.
        endpoint = `/billing/${editingInvoiceId}/edit-invoice`
        method = 'patch'
        finalPayload = payload
      } else if (editingDraftId) {
        endpoint = `/billing/${editingDraftId}/finalize`
        method = 'patch'
        finalPayload = payload
      } else {
        endpoint = '/billing'
        finalPayload = payload
      }

      const res = method === 'patch'
        ? await api.patch(endpoint, finalPayload)
        : await api.post(endpoint, finalPayload)
      const savedInvoice = res.data
      setLastSavedInvoice(savedInvoice)

      // Backend returned an approval request instead of a finalized invoice
      if (savedInvoice?.approvalRequested) {
        toast.success('Approval request sent to admin. The bill is saved as draft and will be finalized once approved.', { duration: 6000 })
        localStorage.removeItem(AUTO_DRAFT_KEY)
        fetchMasterData()
        navigate('/billing/sales')
        return
      }

      // CRM signal: if this sale was tied to a lead, bump a sessionStorage
      // sentinel so the lead's Quotations / Invoices tab refetches when the
      // user returns. Read by QuotationsTab / InvoicesTab on mount + focus.
      if (linkedLeadId) {
        try {
          sessionStorage.setItem(`crm:lead-refresh:${linkedLeadId}`, String(Date.now()))
        } catch { /* storage disabled — non-fatal */ }
      }

      if (invoiceType === 'quotation') {
        toast.success(`Quotation ${savedInvoice.quotationNumber ?? savedInvoice.invoiceNumber} saved successfully`)
        localStorage.removeItem(AUTO_DRAFT_KEY)
        navigate('/billing/quotations')
      } else {
        // If this invoice was converted from a quotation, mark it as CONVERTED
        if (quotationSource) {
          try { await api.patch(`/quotations/${quotationSource.id}/status`, { status: 'CONVERTED' }) } catch { /* non-critical */ }
        }
        printInvoicePdf(savedInvoice)
        toast.success(editingInvoiceId ? 'Invoice updated and sent to printer' : 'Invoice saved and sent to printer')
        localStorage.removeItem(AUTO_DRAFT_KEY)
        fetchMasterData()
        navigate('/billing/sales')
      }

    } catch (error: unknown) {
      const raw = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
      // NestJS class-validator returns an array of messages on 400.
      const errorMsg = Array.isArray(raw)
        ? raw.join(' • ')
        : raw || (invoiceType === 'quotation'
          ? 'Failed to save quotation'
          : 'Failed to generate invoice. Please check stock limits.')
      console.error('submit error:', error)
      toast.error(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F8') {
        e.preventDefault()
        submitInvoice()
      } else if (e.key === 'F7') {
        e.preventDefault()
        if (items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0).length > 0 && selectedCustomer) {
          setPreviewOpen(true)
        } else {
          toast.info('Add items and select a customer to preview invoice')
        }
      } else if (e.key === 'F9') {
        e.preventDefault()
        if (lastSavedInvoice) shareInvoiceViaWhatsApp(lastSavedInvoice)
        else toast.info('Save invoice first before sharing')
      } else if (e.key === 'F10') {
        e.preventDefault()
        holdCurrentBill()
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
      } else if (e.altKey && e.key === 's') {
        e.preventDefault()
        if (!selectedCustomer) {
          setShowCustomerDropdown(true)
        } else {
          heroSearchRef.current?.focus()
        }
      } else if (e.altKey && e.key === 'n') {
        e.preventDefault()
        addItem()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addItem])

  const activeItemCount = items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0).length

  // ── Per-cart-item purchase history — derived from customer invoices ──
  // For each cart line that has a productId, gather up to 5 past purchase
  // records of that product across the customer's invoices. Used by the
  // "Product History" tab to show all histories at once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cartItemHistories = useMemo(() => {
    return items
      .filter((it) => it.productId)
      .map((it) => {
        const hits: { date: string; invoiceNumber: string; batchNumber: string; qty: number; rate: number; status: string }[] = []
        for (const inv of customerInvoices) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const line of ((inv as any).items ?? []) as any[]) {
            if (line.productId === it.productId) {
              hits.push({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                date: (inv as any).date ?? inv.createdAt,
                invoiceNumber: inv.invoiceNumber,
                batchNumber: line.batchNumber ?? '—',
                qty: Number(line.quantity),
                rate: Number(line.rate),
                status: inv.status,
              })
            }
          }
        }
        return { item: it, history: hits.slice(0, 5) }
      })
  }, [items, customerInvoices])

  const productHistoryCount = cartItemHistories.filter((e) => e.history.length > 0).length

  function customerTypeBadge(type: Customer['type']): 'info' | 'purple' | 'success' | 'warning' | 'secondary' {
    const map: Record<Customer['type'], 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
      RETAIL: 'success',
      WHOLESALE: 'purple',
      DOCTOR: 'warning',
    }
    return map[type] ?? 'secondary'
  }

  // ── Customer Form ──────────────────────────────────────
  // Resolver switches by mode — quotation = lenient (name + phone only),
  // invoice = strict. We read invoiceType through a ref so the same useForm
  // instance can switch schemas without remounting.
  const invoiceTypeRef = useRef(invoiceType)
  useEffect(() => { invoiceTypeRef.current = invoiceType }, [invoiceType])
  const customerForm = useForm<CustomerFormValues>({
    resolver: (values, ctx, options) => {
      const schema = buildCustomerSchema(invoiceTypeRef.current) as typeof customerSchema
      return zodResolver(schema)(values, ctx, options)
    },
    defaultValues: {
      name: '',
      phone: '',
      type: 'RETAIL',
      email: '',
      address: '',
      gstin: '',
      dlNumber: '',
      registrationNumber: '',
      referredBy: '',
      notes: '',
    },
  })

  const handleAddCustomer = async (values: CustomerFormValues) => {
    if (nsPhoneCheckError) { toast.error('Fix the phone number error before saving.'); return }

    // Quotation mode: don't create a Customer master record. The name + phone
    // get persisted on the Quotation row at Save Quotation time (B1 schema column).
    // Customer master creation only happens later, on quotation → invoice conversion.
    if (invoiceType === 'quotation') {
      const stub: Customer = {
        id: '',
        name: values.name.trim(),
        phone: values.phone,
        type: values.type,
        email: values.email || undefined,
        address: values.address || undefined,
        gstin: values.gstin || undefined,
        dlNumber: values.dlNumber || undefined,
        referredBy: values.referredBy || undefined,
        notes: values.notes || undefined,
        creditLimit: 0,
        currentOutstanding: 0,
        loyaltyPoints: 0,
        createdAt: new Date().toISOString(),
      }
      setSelectedCustomer(stub)
      customerForm.reset()
      setDocFiles([])
      setDocPreviews([])
      setNsPhoneCheckError('')
      setAddCustomerDialogOpen(false)
      toast.success(`Customer "${values.name}" ready for quotation`)
      return
    }

    try {
      const res = await api.post('/customers', values)
      toast.success(`Customer "${values.name}" added successfully`)
      const newlyCreated = res.data
      // Upload documents
      if (docFiles.length > 0 && newlyCreated?.id) {
        for (const file of docFiles) {
          try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('customerId', newlyCreated.id)
            fd.append('doctorName', 'Document')
            await api.post('/prescriptions/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
          } catch { toast.warning(`Failed to upload "${file.name}"`) }
        }
      }
      await fetchMasterData()
      if (newlyCreated) setSelectedCustomer(newlyCreated)
      customerForm.reset()
      setDocFiles([])
      setDocPreviews([])
      setNsPhoneCheckError('')
      setAddCustomerDialogOpen(false)
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add customer')
    }
  }

  const cancelAddCustomer = () => {
    customerForm.reset()
    setDocFiles([])
    setDocPreviews([])
    setNsPhoneCheckError('')
    setAddCustomerDialogOpen(false)
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <TooltipProvider>
      {/* responsive: h-dvh handles mobile viewport collapse; outer scrolls horizontally on lower-resolution desktops where the lg+ side-by-side layout can't fit (~1208px minimum: 920px table + 288px sidebar). Inner enforces lg:min-w-[1280px] so columns keep their proper desktop dimensions instead of compressing. */}
      <div className="h-dvh w-full overflow-x-auto overflow-y-hidden bg-background">
      <div className="flex flex-col h-full w-full max-w-[1920px] mx-auto px-2 pt-2 sm:px-3 md:px-4 md:pt-3 lg:px-6 lg:min-w-[1280px]">
        {/* ═══════════════════════════════════════════════════
            HEADER BAR — compact POS-style title strip
        ═══════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
          className="flex items-center justify-between gap-2 mb-3 shrink-0"
        >
          {/* responsive: title block can truncate, gap-2.5 stays, icon shrinks at xs */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <Receipt className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <h1 className="text-sm sm:text-base font-semibold tracking-tight truncate">
                {editingInvoiceId ? 'Edit Invoice' : 'New Sale'}
              </h1>
              <span className="hidden sm:inline-block font-mono text-[10px] text-muted-foreground tracking-wider truncate">
                {editingInvoiceId ? (editingInvoiceNumber ?? invoiceNumber) : invoiceNumber}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PillToggle
              options={[
                { label: 'Invoice', value: 'invoice' as const },
                { label: 'Quotation', value: 'quotation' as const },
              ]}
              value={invoiceType}
              onChange={setInvoiceType}
            />
          </div>
        </motion.div>

        {/* Quotation source banner */}
        {quotationSource && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span>Converting from quotation <span className="font-semibold">{quotationSource.number}</span> — customer: <span className="font-semibold">{quotationSource.customerName}</span>. Verify item batches before saving.</span>
            <button onClick={() => setQuotationSource(null)} className="ml-auto shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-amber-500/10 transition-colors"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Edit-invoice banner — appears when ?editId=… is in the URL */}
        {editingInvoiceId && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Pencil className="h-3.5 w-3.5 shrink-0" />
            <span>
              Editing invoice <span className="font-semibold font-mono">{editingInvoiceNumber ?? '…'}</span>. Stock, customer outstanding, and loyalty points will be re-calculated on save. Already-collected payments are preserved.
            </span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            SEARCH BAR + CONTEXT ROW
        ═══════════════════════════════════════════════════ */}
        {/* responsive: stack vertically below md, side-by-side md+; gap scales lg+. Hidden in checkout step until lg (where both panels show side-by-side) */}
        <div className={cn("flex flex-col gap-2 mb-3 md:flex-row md:flex-wrap md:items-stretch md:h-auto lg:h-11 md:gap-2 lg:gap-3 shrink-0", mobileStep === 'checkout' && 'hidden lg:flex')}>
          {/* ═══════════════════════════════════════════════════
              TABLE ACTION AREA (Aligned with Table Card)
          ═══════════════════════════════════════════════════ */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-stretch md:gap-2 lg:gap-3">
            {/* Mobile row 1: search + add item button */}
            <div className="flex items-center gap-2 md:contents">
              {/* responsive: percentages only kick in at lg+; at md the search shares the row with customer 50/50 */}
              <div className="flex-1 min-w-0 md:basis-1/2 md:min-w-0 lg:basis-auto lg:w-[42%] lg:flex-none relative">
              <div className="relative">
                {!selectedCustomer ? (
                  /* Locked state — no customer selected */
                  <button
                    type="button"
                    onClick={() => setShowCustomerDropdown(true)}
                    className="flex w-full h-11 items-center gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground font-medium transition-colors hover:border-border/80 hover:bg-muted/50"
                  >
                    <Search className="h-4 w-4 shrink-0 opacity-50" />
                    <span className="flex-1 text-left text-xs">Select a customer first to search products</span>
                    <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/70">Alt+S</kbd>
                  </button>
                ) : (
                  <>
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                    <input
                      ref={heroSearchRef}
                      value={heroSearch}
                      onChange={(e) => {
                        setHeroSearch(e.target.value)
                        setShowHeroResults(true)
                        setHeroSelectedIdx(0)
                      }}
                      onFocus={() => heroSearch && setShowHeroResults(true)}
                      onKeyDown={handleHeroKeyDown}
                      placeholder="Scan barcode or search products..."
                      className={cn(
                        'w-full h-11 rounded-lg border border-border bg-background pl-10 pr-20 text-sm',
                        'placeholder:text-muted-foreground/50 font-medium',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary/40',
                        'transition-colors duration-150 hover:border-border/80'
                      )}
                    />
                    {heroSearch ? (
                      <button
                        type="button"
                        onClick={() => { setHeroSearch(''); setShowHeroResults(false); heroSearchRef.current?.focus() }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/70 pointer-events-none">Alt+S</kbd>
                    )}
                  </>
                )}
              </div>

              {/* Hero search results dropdown */}
              <AnimatePresence>
                {showHeroResults && (heroResults.length > 0 || heroSearchResults.loading || heroSearch) && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.12 }}
                    className="absolute z-50 mt-1.5 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                    >
                    <div className="px-3 py-2 border-b border-border/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {heroSearchResults.loading && heroResults.length === 0
                        ? 'Searching…'
                        : `${heroSearchResults.total || heroResults.length} product${(heroSearchResults.total || heroResults.length) !== 1 ? 's' : ''} ${heroSearchResults.total > heroResults.length ? `· showing ${heroResults.length}` : 'found'}`}
                    </div>
                    <div
                      className="max-h-72 overflow-y-auto divide-y divide-border/40"
                      onScroll={(e) => {
                        const el = e.currentTarget
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
                          heroSearchResults.loadMore()
                        }
                      }}
                    >
                      {heroResults.length === 0 && !heroSearchResults.loading && heroSearch && (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No products match "{heroSearch}"
                        </div>
                      )}
                      {heroResults.map((p, idx) => (
                        <div
                          key={p.id}
                          className={cn(
                            'cursor-pointer px-3 py-2.5 transition-colors flex items-center gap-3',
                            idx === heroSelectedIdx ? 'bg-accent' : 'hover:bg-accent/50'
                          )}
                          onClick={() => addProductFromSearch(p)}
                          onMouseEnter={() => setHeroSelectedIdx(idx)}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60">
                            <Package className="h-4 w-4 text-muted-foreground/60" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{p.name}</span>
                              {(p.schedule === 'H' || p.schedule === 'H1') && (
                                <Badge variant="destructive" size="sm">{p.schedule}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                              <span className="truncate">{p.manufacturer}</span>
                              <span className="text-border">·</span>
                              <span className="truncate">{p.genericName}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold font-mono tabular-nums">{formatCurrency(billingType === 'wholesale' ? p.wholesaleRate : p.sellingRate)}</div>
                            <div className={cn(
                              "text-[10px] mt-0.5 tabular-nums",
                              p.totalStock === 0 ? "text-rose-600 dark:text-rose-400" : p.totalStock <= (p.minStock ?? 0) ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                            )}>{p.totalStock === 0 ? 'Out of stock' : `Stk: ${p.totalStock}`}</div>
                          </div>
                        </div>
                      ))}
                      {heroResults.length > 0 && heroSearchResults.loading && (
                        <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading more…</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>{/* end search div */}

              {/* Add Item Button — mobile only, row 1 */}
              <Button
                type="button"
                onClick={addItem}
                disabled={!selectedCustomer}
                title={!selectedCustomer ? 'Select a customer first' : undefined}
                className="h-11 px-4 shrink-0 gap-2 font-semibold cursor-pointer md:hidden disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>{/* end mobile row 1 wrapper */}

            {/* Customer Selector — full width on mobile (row 2), flex-1 on desktop */}
            <div ref={customerRef} className="flex-1 relative">
              <button
                type="button"
                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                className={cn(
                  'flex items-center gap-2.5 w-full h-11 rounded-lg border bg-background px-3 text-xs transition-colors',
                  selectedCustomer
                    ? 'border-border hover:border-border/80'
                    : 'border-dashed border-amber-500/40 bg-amber-500/[0.04] hover:border-amber-500/60'
                )}
              >
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                  selectedCustomer ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}>
                  {selectedCustomer ? selectedCustomer.name[0].toUpperCase() : <UserPlus className="h-3.5 w-3.5" />}
                </div>
                <span className={cn("flex-1 text-left truncate font-semibold text-[13px]", !selectedCustomer && "text-amber-700 dark:text-amber-400")}>
                  {selectedCustomer?.name ?? 'Select Customer'}
                </span>
                {selectedCustomer && (
                  <Badge variant={customerTypeBadge(selectedCustomer.type)} size="sm" className="text-[9px] px-1.5 shrink-0">
                    {selectedCustomer.type}
                  </Badge>
                )}
                {selectedCustomer && selectedCustomer.id === '' && (
                  <Badge variant="purple" size="sm" className="text-[9px] px-1.5 shrink-0">
                    Quotation only
                  </Badge>
                )}
                {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
                  <Badge variant="warning" size="sm" className="text-[9px] px-1.5 shrink-0 gap-0.5 tabular-nums">
                    {selectedCustomer.loyaltyPoints} pts
                  </Badge>
                )}
                {selectedCustomer && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground/60 hover:text-foreground shrink-0 transition-colors cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setTableView('customer-history') }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setTableView('customer-history') } }}
                    title="View purchase history"
                  >
                    <History className="h-3.5 w-3.5" />
                  </span>
                )}
                {selectedCustomer && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="p-1 rounded hover:bg-accent text-muted-foreground/60 hover:text-foreground shrink-0 transition-colors cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setReminderTitle(`Monthly order follow-up — ${selectedCustomer.name}`)
                      setReminderOpen(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        setReminderTitle(`Monthly order follow-up — ${selectedCustomer.name}`)
                        setReminderOpen(true)
                      }
                    }}
                    title="Set monthly reminder for this customer"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </button>
              <AnimatePresence>
                {showCustomerDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute z-50 left-0 right-0 mt-1.5 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                  >
                    <div className="p-2 border-b border-border/60">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                        <input
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder="Search name or phone..."
                          className="w-full h-9 rounded-md bg-muted/40 pl-8 pr-2.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div
                      className="h-64 overflow-y-auto"
                      onScroll={(e) => {
                        const el = e.currentTarget
                        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
                          customerSearchResults.loadMore()
                        }
                      }}
                    >
                      <div className="divide-y divide-border/40">
                        {customerSearchResults.loading && filteredCustomers.length === 0 && (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
                        )}
                        {!customerSearchResults.loading && filteredCustomers.length === 0 && (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {customerSearch ? `No customers match "${customerSearch}"` : 'No customers found'}
                          </div>
                        )}
                        {filteredCustomers.map((cust) => (
                          <div
                            key={cust.id}
                            className="cursor-pointer px-3 py-2.5 hover:bg-accent/60 transition-colors"
                            onClick={() => {
                              setSelectedCustomer(cust)
                              setCustomerSearch('')
                              setShowCustomerDropdown(false)
                              setTableView('customer-history')
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-[11px] font-bold">
                                {cust.name[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold truncate">{cust.name}</div>
                                {cust.phone !== '0000000000' && (
                                  <div className="text-[10px] text-muted-foreground tabular-nums">{cust.phone}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-auto">
                                {(cust.pendingCreditCount ?? 0) >= 3 ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap"
                                    title="Credit blocked — 3 pending invoices"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedCustomer(cust)
                                      setShowCustomerDropdown(false)
                                      openCreditPayDialog()
                                    }}
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                    Pay Credits
                                  </span>
                                ) : (cust.pendingCreditCount ?? 0) > 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap tabular-nums">
                                    {cust.pendingCreditCount} pending
                                  </span>
                                ) : null}
                                <Badge variant={customerTypeBadge(cust.type)} size="sm" className="text-[9px] whitespace-nowrap">
                                  {cust.type}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                        {filteredCustomers.length > 0 && customerSearchResults.loading && (
                          <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">Loading more…</div>
                        )}
                        {filteredCustomers.length > 0 && !customerSearchResults.loading && !customerSearchResults.hasMore && (
                          <div className="px-3 py-2 text-center text-[10px] text-muted-foreground/60">
                            {customerSearchResults.total} customer{customerSearchResults.total !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-border/60 p-1.5 bg-muted/20">
                      <button
                        type="button"
                        onClick={() => {
                          setAddCustomerDialogOpen(true)
                          setShowCustomerDropdown(false)
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs text-primary hover:bg-primary/10 transition-colors font-semibold"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Add New Customer
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* ═══════════════════════════════════════════════════
              SIDEBAR HEADER (Salesperson — read-only, derived from customer)
          ═══════════════════════════════════════════════════ */}
          {/* responsive: only show salesperson context strip on lg+; below that, the customer row already shows the badge */}
          <div className="hidden lg:flex w-48 xl:w-56 shrink-0 items-stretch">
            <div className={cn(
              'flex items-center gap-2 w-full h-11 rounded-lg border border-border bg-muted/30 px-3 text-xs select-none overflow-hidden',
            )}>
              <div className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                selectedSalesperson ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-muted text-muted-foreground"
              )}>
                {selectedSalesperson ? selectedSalesperson.name[0].toUpperCase() : <Users className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Salesperson</div>
                <div className={cn("truncate text-[11px] font-semibold leading-tight", !selectedSalesperson && "text-muted-foreground/50 italic")}>
                  {selectedSalesperson?.name ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
              RIGHT-END ACTIONS (Reminder + Add Item) — desktop only
          ═══════════════════════════════════════════════════ */}
          {/* responsive: tablet (md) shows icon-only Add Item; lg+ adds the "Add Item" label; xl+ adds the kbd hint */}
          <div className="hidden md:flex shrink-0 items-stretch gap-1.5 lg:gap-2">
            {selectedCustomer && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReminderTitle(`Monthly order follow-up — ${selectedCustomer.name}`)
                  setReminderOpen(true)
                }}
                className="h-11 md:h-11 px-3 shrink-0 gap-1.5"
                title="Set monthly reminder for this customer"
              >
                <CalendarClock className="h-4 w-4" />
                <span className="hidden lg:inline text-xs font-semibold">Reminder</span>
              </Button>
            )}

            <Button
              type="button"
              onClick={addItem}
              disabled={!selectedCustomer}
              title={!selectedCustomer ? 'Select a customer first to add products' : 'Add Item (Alt+N)'}
              className="h-11 md:h-11 px-3 lg:px-4 shrink-0 gap-2 font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden lg:inline text-sm">Add Item</span>
              <kbd className="ml-0.5 hidden xl:inline-flex rounded border border-primary-foreground/25 bg-primary-foreground/10 px-1 text-[9px] font-mono text-primary-foreground/80">Alt+N</kbd>
            </Button>
          </div>
        </div>

        {/* ── Credit Block Warning ── */}
        <AnimatePresence>
          {isCreditBlocked && selectedCustomer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-3"
            >
              <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.05] px-3 py-2.5 dark:border-rose-800/40">
                <div className="flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-400">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{selectedCustomer.name}</span> has <span className="font-semibold tabular-nums">{pendingCreditCount}</span> unpaid credit invoices — credit sales blocked until cleared.
                    {isPharmacist && <span className="ml-1 text-amber-700 dark:text-amber-400">You can request admin approval to proceed.</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isPharmacist && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-3 text-[11px] bg-amber-500 hover:bg-amber-600 text-white shadow-none"
                      onClick={() => submitInvoice('CREDIT')}
                      disabled={isSubmitting || items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0).length === 0}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      {isSubmitting ? 'Sending…' : 'Request Approval'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-8 px-3 text-[11px] shadow-none"
                    onClick={openCreditPayDialog}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1" />
                    Pay Credits
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════
            MAIN TWO-PANEL LAYOUT
        ═══════════════════════════════════════════════════ */}
        {/* responsive: stacks below lg (tablets get full-width table); side-by-side only at lg+ where there's room for both 920px table + 288px sidebar */}
        <div className="flex flex-col gap-1.5 flex-1 lg:flex-row lg:gap-2 overflow-hidden">
          {/* ── LEFT: Table Area with Tabs ────────────────── */}
          {/* responsive: hidden during checkout step on mobile + tablet; always visible at lg+ where panels are side-by-side */}
          <div className={cn("flex-1 min-w-0 flex flex-col min-h-0", mobileStep === 'checkout' && 'hidden lg:flex')}>
            {addCustomerDialogOpen ? (
              /* ═══════════════════════════════════════════════════
                  INLINE ADD-CUSTOMER VIEW (replaces tabs + tabbed content)
              ═══════════════════════════════════════════════════ */
              <div className="flex-1 flex flex-col min-h-0 border-t border-b border-border/40 bg-card overflow-hidden">
                {/* Header strip: Back button + title */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 bg-muted/20 shrink-0">
                  <Button type="button" variant="ghost" size="sm" onClick={cancelAddCustomer} className="gap-1.5 -ml-2 h-8 text-xs text-muted-foreground hover:text-foreground shrink-0">
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </Button>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <UserPlus className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold">Add New Customer</h2>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {invoiceType === 'quotation'
                          ? 'Quotation only — only Name and Phone are required. Won’t be saved to customer master.'
                          : 'Name, Phone, Type, Address and Referred By are required. Email is optional.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Scrollable form body */}
                <form onSubmit={customerForm.handleSubmit(handleAddCustomer)} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

                    {/* responsive: stack on phones, side-by-side from sm (640px+) */}
                    {/* Row 1: Name + Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name *</Label>
                        <Input {...customerForm.register('name')} placeholder="Customer name" error={!!customerForm.formState.errors.name} />
                        {customerForm.formState.errors.name && <p className="text-xs text-rose-500">{customerForm.formState.errors.name.message}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Phone *{nsPhoneChecking && <span className="ml-1 font-normal text-muted-foreground">checking…</span>}
                        </Label>
                        <Input
                          {...customerForm.register('phone')}
                          placeholder="10-digit number"
                          inputMode="numeric"
                          error={!!customerForm.formState.errors.phone || !!nsPhoneCheckError}
                          onBlur={(e) => checkNsPhoneDuplicate(e.target.value)}
                        />
                        {customerForm.formState.errors.phone && <p className="text-xs text-rose-500">{customerForm.formState.errors.phone.message}</p>}
                        {!customerForm.formState.errors.phone && nsPhoneCheckError && <p className="text-xs text-rose-500">{nsPhoneCheckError}</p>}
                      </div>
                    </div>

                    {/* Row 2: Type + Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type *</Label>
                        <Controller control={customerForm.control} name="type" render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RETAIL">Retail</SelectItem>
                              <SelectItem value="WHOLESALE">Wholesale</SelectItem>
                              <SelectItem value="DOCTOR">Doctor</SelectItem>
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email <span className="text-muted-foreground/50 font-normal normal-case">(optional)</span></Label>
                        <Input {...customerForm.register('email')} placeholder="email@example.com" type="email" error={!!customerForm.formState.errors.email} />
                        {customerForm.formState.errors.email && <p className="text-xs text-rose-500">{customerForm.formState.errors.email.message}</p>}
                      </div>
                    </div>

                    {/* Row 3a: GSTIN + DL — WHOLESALE only */}
                    {customerForm.watch('type') === 'WHOLESALE' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GSTIN *</Label>
                          <Input {...customerForm.register('gstin')} placeholder="22AAAAA0000A1Z5" error={!!customerForm.formState.errors.gstin} />
                          {customerForm.formState.errors.gstin && <p className="text-xs text-rose-500">{customerForm.formState.errors.gstin.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DL Number *</Label>
                          <Input {...customerForm.register('dlNumber')} placeholder="Drug License No." error={!!customerForm.formState.errors.dlNumber} />
                          {customerForm.formState.errors.dlNumber && <p className="text-xs text-rose-500">{customerForm.formState.errors.dlNumber.message}</p>}
                        </div>
                      </div>
                    )}

                    {/* Row 3b: Registration Number — DOCTOR only */}
                    {customerForm.watch('type') === 'DOCTOR' && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Medical Registration Number *</Label>
                        <Input {...customerForm.register('registrationNumber')} placeholder="MCI / State Medical Council Reg. No." error={!!customerForm.formState.errors.registrationNumber} />
                        {customerForm.formState.errors.registrationNumber && <p className="text-xs text-rose-500">{customerForm.formState.errors.registrationNumber.message}</p>}
                      </div>
                    )}

                    {/* Row 4: Referred By + Address */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Referred By *</Label>
                        <Controller control={customerForm.control} name="referredBy" render={({ field }) => (
                          <Select value={field.value || ''} onValueChange={field.onChange}>
                            <SelectTrigger className={cn(customerForm.formState.errors.referredBy && 'border-rose-500')}>
                              <SelectValue placeholder="Select salesperson" />
                            </SelectTrigger>
                            <SelectContent>
                              {salespersons.map((sp) => (
                                <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )} />
                        {customerForm.formState.errors.referredBy && <p className="text-xs text-rose-500">{customerForm.formState.errors.referredBy.message}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address *</Label>
                        <Textarea {...customerForm.register('address')} placeholder="Full address" rows={1} className="min-h-9 resize-none" />
                        {customerForm.formState.errors.address && <p className="text-xs text-rose-500">{customerForm.formState.errors.address.message}</p>}
                      </div>
                    </div>

                    {/* Row 6: Multi-file upload */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address Proof &amp; Documents</Label>
                        {docFiles.length > 0 && <span className="text-[10px] text-muted-foreground">{docFiles.length} file{docFiles.length !== 1 ? 's' : ''} selected</span>}
                      </div>
                      {docPreviews.length > 0 && (
                        <div className="space-y-1.5">
                          {docPreviews.map((doc, idx) => (
                            <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                              {doc.preview
                                ? <img src={doc.preview} alt={doc.name} className="h-8 w-10 rounded object-cover shrink-0" />
                                : <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded bg-muted"><FileText className="h-4 w-4 text-muted-foreground" /></div>
                              }
                              <span className="min-w-0 flex-1 truncate text-xs">{doc.name}</span>
                              <button type="button" onClick={() => removeDocFile(idx)}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-600 transition">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-5">
                        <div className="flex h-10 w-14 items-center justify-center rounded-lg border-2 border-border/40 bg-muted/30">
                          <FileImage className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                        <p className="text-[11px] text-muted-foreground">Upload ID proof, address proof, or prescriptions</p>
                        <div className="flex items-center gap-2">
                          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                            <Upload className="h-3.5 w-3.5 text-amber-500" />
                            Add Files
                            <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
                              ref={multiDocInputRef} onChange={(e) => handleMultiDocFiles(e.target.files)} />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Row 7: Notes */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
                      <Textarea {...customerForm.register('notes')} placeholder="Additional notes (optional)" rows={2} />
                    </div>
                  </div>

                  {/* Sticky footer */}
                  <div className="flex items-center justify-end gap-2 border-t border-border/40 px-4 py-3 bg-muted/20 shrink-0">
                    <Button type="button" variant="outline" onClick={cancelAddCustomer}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={customerForm.formState.isSubmitting || !!nsPhoneCheckError}>
                      {customerForm.formState.isSubmitting ? 'Saving...' : 'Save Customer'}
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <>
            {/* Tab strip — order: Customer History | Products | Reminders */}
            <div className="flex items-center justify-between gap-2 mb-2 border-b border-border/60">
              <div className="flex items-center gap-0.5">
              {/* Tab 1: Customer History — always accessible, shown first */}
              <button
                type="button"
                onClick={() => {
                  setTableView('customer-history')
                  if (!selectedCustomer) setShowCustomerDropdown(true)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 -mb-px border-b-2 text-[11px] font-semibold transition-colors',
                  tableView === 'customer-history'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <History className="h-3.5 w-3.5" />
                {selectedCustomer ? `${selectedCustomer.name.split(' ')[0]}'s History` : 'Customer History'}
                {!selectedCustomer && (
                  <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                )}
              </button>

              {/* Tab 2: Products — locked until customer selected, shown in middle */}
              <button
                type="button"
                onClick={() => {
                  if (!selectedCustomer) {
                    setShowCustomerDropdown(true)
                    toast.info('Please select a customer before adding products')
                    return
                  }
                  setTableView('products')
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 -mb-px border-b-2 text-[11px] font-semibold transition-colors',
                  tableView === 'products'
                    ? 'border-primary text-foreground'
                    : !selectedCustomer
                      ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
                title={!selectedCustomer ? 'Select a customer first to add products' : undefined}
              >
                <Package className="h-3.5 w-3.5" />
                Products
                {activeItemCount > 0 && (
                  <span className={cn(
                    'ml-0.5 rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums',
                    tableView === 'products' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}>{activeItemCount}</span>
                )}
              </button>

              {/* Tab 3: Product History — past purchases of every cart item */}
              <button
                type="button"
                onClick={() => {
                  if (!selectedCustomer) {
                    setShowCustomerDropdown(true)
                    toast.info('Please select a customer to view product history')
                    return
                  }
                  setTableView('product-history')
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 -mb-px border-b-2 text-[11px] font-semibold transition-colors',
                  tableView === 'product-history'
                    ? 'border-primary text-foreground'
                    : !selectedCustomer
                      ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
                title={!selectedCustomer ? 'Select a customer first to view product history' : undefined}
              >
                <History className="h-3.5 w-3.5" />
                Product History
                {productHistoryCount > 0 && (
                  <span className={cn(
                    'ml-0.5 rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums',
                    tableView === 'product-history' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}>{productHistoryCount}</span>
                )}
              </button>

              {/* Tab 4: Reminders */}
              <button
                type="button"
                onClick={() => {
                  setTableView('customer-reminders')
                  if (!selectedCustomer) setShowCustomerDropdown(true)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 -mb-px border-b-2 text-[11px] font-semibold transition-colors',
                  tableView === 'customer-reminders'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {selectedCustomer ? `${selectedCustomer.name.split(' ')[0]}'s Reminders` : 'Reminders'}
                {customerReminders.length > 0 && tableView !== 'customer-reminders' && (
                  <span className="ml-0.5 rounded-full px-1.5 py-px text-[9px] font-bold bg-muted text-muted-foreground tabular-nums">
                    {customerReminders.length}
                  </span>
                )}
              </button>

              {/* Tab 5: Quotations — scoped to selected customer, or all when none */}
              <button
                type="button"
                onClick={() => setTableView('quotations')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 -mb-px border-b-2 text-[11px] font-semibold transition-colors',
                  tableView === 'quotations'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                {selectedCustomer ? `${selectedCustomer.name.split(' ')[0]}'s Quotations` : 'Quotations'}
                {quotationsList.length > 0 && tableView !== 'quotations' && (
                  <span className="ml-0.5 rounded-full px-1.5 py-px text-[9px] font-bold bg-muted text-muted-foreground tabular-nums">
                    {quotationsList.length}
                  </span>
                )}
              </button>
              </div>

              {/* Right-end controls — only on Products tab */}
              {tableView === 'products' && (
                <label
                  htmlFor="show-inline-history"
                  className="inline-flex items-center gap-2 pb-1.5 cursor-pointer select-none"
                  title="Show or hide each product's past purchase history under its row"
                >
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Show purchase history
                  </span>
                  <Switch
                    id="show-inline-history"
                    checked={showInlineHistory}
                    onCheckedChange={setShowInlineHistory}
                  />
                </label>
              )}
            </div>

            <Card className="flex-1 flex flex-col min-h-0 shadow-none border-0 bg-transparent">
              <CardContent className="p-0 flex-1 flex flex-col min-h-0 rounded-xl border border-border/40 bg-card overflow-hidden">

                {/* ── Products Tab ── */}
                {tableView === 'products' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 flex flex-col min-h-0 relative">
                      {/* responsive: was overflow-x-hidden, which silently clipped columns when the panel was narrower than the table's ~880px content. Now scrolls horizontally so all columns stay reachable on tablets and narrower laptops. min-w bumped to 960px to match real column widths. */}
                      <div className="hidden md:block absolute inset-0 [&>div]:h-full [&>div]:rounded-none [&>div]:border-0 [&>div]:overflow-y-auto [&>div]:overflow-x-auto">
                        <Table className="w-full min-w-[960px]">
                          <TableHeader className="sticky top-0 z-20 bg-background/95 backdrop-blur-md">
                            <TableRow className="border-b border-border/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent whitespace-nowrap">
                              <TableHead className="w-10 px-2 py-3.5 text-center h-auto items-center justify-center whitespace-nowrap">#</TableHead>
                              <TableHead className="min-w-55 px-3 py-3.5 text-left h-auto whitespace-nowrap">Product</TableHead>
                              <TableHead className="w-37.5 px-2 py-3.5 text-center h-auto whitespace-nowrap">Batch &amp; Expiry</TableHead>
                              <TableHead className="w-20 px-2 py-3.5 text-right h-auto whitespace-nowrap">MRP</TableHead>
                              <TableHead className="w-27.5 px-2 py-3.5 text-center h-auto whitespace-nowrap">Qty</TableHead>
                              <TableHead className="w-40 px-2 py-3.5 text-center h-auto whitespace-nowrap">Rate</TableHead>
                              <TableHead className="w-20 px-2 py-3.5 text-center h-auto whitespace-nowrap">Disc %</TableHead>
                              <TableHead className="w-14 px-1 py-3.5 text-center h-auto whitespace-nowrap">GST</TableHead>
                              <TableHead className="w-27.5 px-3 py-3.5 text-right h-auto whitespace-nowrap">Amount</TableHead>
                              <TableHead className="w-10 px-1 py-3.5 h-auto"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <AnimatePresence mode="popLayout">
                              {items.map((item, idx) => (
                                <BillingRow
                                  key={item.id}
                                  item={item}
                                  index={idx}
                                  billingType={billingType}
                                  invoiceType={invoiceType}
                                  onUpdate={updateItem}
                                  onRemove={removeItem}
                                  customerLastRates={customerLastRates}
                                  customerInvoices={customerInvoices}
                                  showInlineHistory={showInlineHistory}
                                />
                              ))}
                            </AnimatePresence>
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="block md:hidden p-3 absolute inset-0 overflow-y-auto">
                        <AnimatePresence mode="popLayout">
                          {items.map((item, idx) => (
                            <MobileBillingCard
                              key={item.id}
                              item={item}
                              index={idx}
                              billingType={billingType}
                              onUpdate={updateItem}
                              onRemove={removeItem}
                            />
                          ))}
                        </AnimatePresence>
                      </div>

                      {items.length === 1 && !items[0].productId && !(invoiceType === 'quotation' && (items[0].productName || '').trim() !== '') && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-32 hidden md:flex flex-col items-center justify-center text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                            <Package className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                          <p className="mt-3 text-sm font-medium text-muted-foreground/60">Start typing in the search bar to add products</p>
                          <p className="text-[11px] text-muted-foreground/40 mt-0.5">Or press Alt+N to add a manual row</p>
                          {invoiceType === 'quotation' && (
                            <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-600 dark:text-violet-300">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />
                              Quotation mode — type any custom product name and press Enter
                            </p>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                )}

                {/* ── Product History Tab — past sales for every cart product ── */}
                {tableView === 'product-history' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {!selectedCustomer ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                          <History className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-muted-foreground/60">Select a customer to view product purchase history</p>
                      </div>
                    ) : customerInvoicesLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      </div>
                    ) : cartItemHistories.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                          <Package className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-muted-foreground/60">Add products to the cart to see their purchase history</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20 shrink-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Past purchases by {selectedCustomer.name} for current cart items
                          </p>
                          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                            {productHistoryCount} of {cartItemHistories.length} with history
                          </span>
                        </div>
                        <ScrollArea className="flex-1">
                          <div className="divide-y divide-border/40">
                            {cartItemHistories.map((entry) => {
                              const product = products.find((p) => p.id === entry.item.productId)
                              return (
                                <div key={entry.item.id} className="px-3 py-3">
                                  {/* Product header */}
                                  <div className="flex items-baseline justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold truncate">{entry.item.productName}</div>
                                      {product && (product.manufacturer || product.genericName) && (
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground truncate">
                                          {product.manufacturer && <span className="truncate">{product.manufacturer}</span>}
                                          {product.manufacturer && product.genericName && <span className="opacity-40">·</span>}
                                          {product.genericName && <span className="truncate">{product.genericName}</span>}
                                        </div>
                                      )}
                                    </div>
                                    {entry.history.length > 0 ? (
                                      <Badge variant="secondary" size="sm" className="shrink-0 tabular-nums">
                                        {entry.history.length} past
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" size="sm" className="shrink-0">
                                        New for this customer
                                      </Badge>
                                    )}
                                  </div>
                                  {/* History mini-table — flat, blends with parent card */}
                                  {entry.history.length > 0 && (
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:bg-transparent border-b border-border/40">
                                          <TableHead className="px-3 py-1.5 h-auto text-left whitespace-nowrap">Date</TableHead>
                                          <TableHead className="px-3 py-1.5 h-auto text-left whitespace-nowrap">Invoice #</TableHead>
                                          <TableHead className="px-3 py-1.5 h-auto text-left whitespace-nowrap">Batch</TableHead>
                                          <TableHead className="px-3 py-1.5 h-auto text-center whitespace-nowrap">Qty</TableHead>
                                          <TableHead className="px-3 py-1.5 h-auto text-right whitespace-nowrap">Rate</TableHead>
                                          <TableHead className="px-3 py-1.5 h-auto text-center whitespace-nowrap">Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {entry.history.map((h, i) => (
                                          <TableRow key={i} className="border-b-0 hover:bg-muted/20">
                                            <TableCell className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                              {new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                            </TableCell>
                                            <TableCell className="px-3 py-2 font-mono text-[11px] font-semibold text-primary/80 truncate">{h.invoiceNumber}</TableCell>
                                            <TableCell className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{h.batchNumber}</TableCell>
                                            <TableCell className="px-3 py-2 text-center font-mono text-xs font-semibold tabular-nums">{h.qty}</TableCell>
                                            <TableCell className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">{formatCurrency(h.rate)}</TableCell>
                                            <TableCell className="px-3 py-2 text-center">
                                              <Badge
                                                variant={h.status === 'PAID' ? 'success' : h.status === 'CREDIT' || h.status === 'UNPAID' ? 'warning' : h.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                                                size="sm"
                                                className="text-[9px]"
                                              >
                                                {h.status}
                                              </Badge>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </ScrollArea>
                      </>
                    )}
                  </div>
                )}

                {/* ── Customer History Tab ── */}
                {/* ── Customer Reminders Tab ── */}
                {tableView === 'customer-reminders' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {!selectedCustomer ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                          <CalendarClock className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-muted-foreground/60">Select a customer to view their reminders</p>
                      </div>
                    ) : customerRemindersLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      </div>
                    ) : customerReminders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                        <CalendarClock className="h-10 w-10 text-muted-foreground/20" />
                        <p className="text-sm font-medium text-muted-foreground/60">No reminders for {selectedCustomer.name}</p>
                        <button
                          type="button"
                          className="text-xs text-violet-600 font-semibold hover:underline"
                          onClick={() => {
                            setReminderTitle(`Monthly order follow-up — ${selectedCustomer.name}`)
                            setReminderOpen(true)
                          }}
                        >
                          + Set a reminder
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {customerReminders.length} reminder{customerReminders.length !== 1 ? 's' : ''} — {selectedCustomer.name}
                          </p>
                          <button
                            type="button"
                            className="text-[10px] text-violet-600 font-semibold hover:underline"
                            onClick={() => {
                              setReminderTitle(`Monthly order follow-up — ${selectedCustomer.name}`)
                              setReminderOpen(true)
                            }}
                          >
                            + Add
                          </button>
                        </div>
                        <div className="divide-y divide-border/30">
                          {customerReminders.map((r: any) => {
                            const lastContact = r.contacts?.[0]
                            const statusColors: Record<string, string> = {
                              TALKED: 'text-emerald-600',
                              NOT_RESPONDED: 'text-amber-600',
                              DENIED: 'text-rose-600',
                              NEED_TO_TALK: 'text-blue-600',
                              SCHEDULED: 'text-muted-foreground',
                            }
                            return (
                              <div key={r.id} className="flex items-start gap-3 px-3 py-3 hover:bg-muted/20 transition-colors">
                                <div className={cn(
                                  'flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-xl text-center',
                                  r.dayOfMonth === new Date().getDate()
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-violet-500/10 text-violet-600'
                                )}>
                                  <span className="text-sm font-black leading-none">{r.dayOfMonth}</span>
                                  <span className="text-[7px] font-bold uppercase opacity-70">mo</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{r.title}</p>
                                  <p className="text-[10px] text-muted-foreground">Every {r.dayOfMonth}{['st','nd','rd'][r.dayOfMonth-1] ?? 'th'} of month</p>
                                  {lastContact && (
                                    <p className={cn('text-[10px] font-medium mt-0.5', statusColors[lastContact.status] ?? 'text-muted-foreground')}>
                                      Last: {lastContact.status.replace('_', ' ')} · {new Date(lastContact.contactedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    </p>
                                  )}
                                  {r.notes && <p className="text-[10px] text-muted-foreground/60 truncate">{r.notes}</p>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Quotations Tab ── */}
                {tableView === 'quotations' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20 shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {selectedCustomer
                          ? `Quotations for ${selectedCustomer.name}`
                          : 'All Quotations'}
                      </p>
                      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                        {quotationsLoading ? 'Loading…' : `${quotationsList.length} ${quotationsList.length === 1 ? 'quotation' : 'quotations'}`}
                      </span>
                    </div>
                    {quotationsLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      </div>
                    ) : quotationsList.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                          <FileText className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-muted-foreground/60">
                          {selectedCustomer ? `No quotations for ${selectedCustomer.name} yet` : 'No quotations yet'}
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="flex-1">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-md">
                            <TableRow className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 hover:bg-transparent border-b border-border/40">
                              <TableHead className="px-3 py-2 h-auto text-left whitespace-nowrap">Quotation #</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-left whitespace-nowrap">Date</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-left whitespace-nowrap">Customer</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-center whitespace-nowrap">Items</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-right whitespace-nowrap">Total</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-center whitespace-nowrap">Status</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-right whitespace-nowrap">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quotationsList.map((qt) => {
                              const itemsCount = qt.items?.length ?? 0
                              const isConverted = qt.status === 'CONVERTED'
                              const statusVariant = qt.status === 'CONVERTED' || qt.status === 'ACCEPTED'
                                ? 'success' as const
                                : qt.status === 'SENT'
                                  ? 'info' as const
                                  : qt.status === 'REJECTED'
                                    ? 'destructive' as const
                                    : 'secondary' as const
                              return (
                                <TableRow key={qt.id} className="hover:bg-muted/30 border-b border-border/30">
                                  <TableCell className="px-3 py-2.5 align-middle">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                                      <span className="font-mono text-xs font-semibold text-foreground truncate">{qt.quotationNumber}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(qt.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle text-sm">
                                    <span className="truncate">{qt.customerName}</span>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle text-center">
                                    <span className="inline-flex items-center justify-center min-w-6 h-5 px-2 rounded-full bg-muted text-[11px] font-semibold tabular-nums">{itemsCount}</span>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle text-right font-mono text-sm font-bold tabular-nums whitespace-nowrap">
                                    {formatCurrency(Number(qt.total))}
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle text-center">
                                    <Badge variant={statusVariant} size="sm" dot className="text-[10px]">
                                      {qt.status.charAt(0) + qt.status.slice(1).toLowerCase()}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-3 py-2.5 align-middle text-right">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={isConverted ? 'outline' : 'default'}
                                      disabled={isConverted}
                                      className="h-7 px-2.5 text-[11px] shrink-0"
                                      onClick={() => {
                                        sessionStorage.setItem('quotation_prefill', JSON.stringify({
                                          quotationId: qt.id,
                                          quotationNumber: qt.quotationNumber,
                                          customerId: qt.customerId ?? '',
                                          customerName: qt.customerName,
                                          customerPhone: qt.customerPhone ?? '',
                                          deliveryCharge: Number(qt.deliveryCharge) || 0,
                                          items: (qt.items ?? []).map((it) => ({
                                            productId: it.productId ?? '',
                                            productName: it.productName ?? '',
                                            quantity: Number(it.quantity) || 1,
                                            mrp: Number(it.mrp) || 0,
                                            rate: Number(it.rate) || 0,
                                            discountPercent: Number(it.discountPercent) || 0,
                                            gstPercent: Number(it.gstPercent) || 0,
                                            amount: Number(it.amount) || 0,
                                          })),
                                        }))
                                        navigate(`/billing/new?from=quotation&t=${Date.now()}`)
                                      }}
                                    >
                                      {isConverted ? 'Converted' : 'Convert'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </div>
                )}

                {tableView === 'customer-history' && (
                  <>
                    {!selectedCustomer ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                          <History className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                        <p className="mt-3 text-sm font-medium text-muted-foreground/60">Select a customer to view their purchase history</p>
                        <button type="button" onClick={() => setShowCustomerDropdown(true)} className="mt-3 text-xs text-primary hover:underline font-semibold">
                          Select Customer
                        </button>
                      </div>
                    ) : customerInvoicesLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
                      </div>
                    ) : customerInvoices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground/60">No previous invoices for {selectedCustomer.name}</p>
                      </div>
                    ) : selectedHistoryInvoice ? (
                      /* ════════════════════════════════════════════
                          INLINE INVOICE DETAIL VIEW
                          (replaces the modal — uses full left panel)
                      ════════════════════════════════════════════ */
                      <div className="flex-1 flex flex-col min-h-0">
                        {/* Single-row header: Back · invoice info · badges · Re-purchase */}
                        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 bg-muted/20 shrink-0">
                          {/* Back button */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedHistoryInvoice(null)}
                            className="gap-1.5 -ml-2 h-8 text-xs text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Back
                          </Button>

                          {/* Invoice icon + number */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                              <FileText className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <h2 className="text-sm font-bold font-mono text-primary truncate max-w-56">{selectedHistoryInvoice.invoiceNumber}</h2>
                          </div>

                          {/* Meta — date · billingType · salesperson */}
                          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 shrink-0">
                              <Clock className="h-2.5 w-2.5 opacity-50" />
                              {new Date(selectedHistoryInvoice.date ?? selectedHistoryInvoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            {selectedHistoryInvoice.billingType && (
                              <span className="px-1.5 py-0.5 rounded bg-muted/60 font-bold text-[9px] uppercase tracking-wider shrink-0">{selectedHistoryInvoice.billingType}</span>
                            )}
                            {selectedHistoryInvoice.salespersonName && (
                              <span className="truncate">SP: <strong className="text-foreground">{selectedHistoryInvoice.salespersonName}</strong></span>
                            )}
                          </div>

                          {/* Status + type badges */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant={selectedHistoryInvoice.status === 'PAID' ? 'success' : selectedHistoryInvoice.status === 'UNPAID' ? 'warning' : selectedHistoryInvoice.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                              size="sm"
                              className="text-[9px]"
                            >
                              {selectedHistoryInvoice.status}
                            </Badge>
                            <Badge variant="outline" size="sm" className="text-[9px]">{selectedHistoryInvoice.type}</Badge>
                          </div>

                          {/* Re-purchase button — moved into header */}
                          <Button
                            type="button"
                            size="sm"
                            className="gap-1.5 h-8 px-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/10 shrink-0"
                            onClick={() => {
                              if (!selectedHistoryInvoice?.items?.length) return
                              const repurchaseItems = selectedHistoryInvoice.items.map((it) => {
                                const base: BillingItem = {
                                  ...createEmptyItem(),
                                  productId: it.productId,
                                  productName: it.productName,
                                  batchId: it.batchId,
                                  batchNumber: it.batchNumber,
                                  expiryDate: it.expiryDate,
                                  quantity: it.quantity,
                                  mrp: Number(it.mrp),
                                  rate: Number(it.rate),
                                  discountPercent: Number(it.discountPercent),
                                  gstPercent: Number(it.gstPercent),
                                  amount: 0,
                                }
                                base.amount = calculateItemAmount(base)
                                return base
                              })
                              setItems(repurchaseItems)
                              setSelectedHistoryInvoice(null)
                              setTableView('products')
                              toast.success(`${repurchaseItems.length} item${repurchaseItems.length !== 1 ? 's' : ''} loaded from previous invoice`)
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Re-purchase
                          </Button>
                        </div>

                        {/* Items table — scrollable */}
                        <div className="flex-1 overflow-y-auto [&>div]:rounded-none [&>div]:border-0">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-md">
                              <TableRow className="border-b border-border/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent whitespace-nowrap">
                                <TableHead className="w-10 px-2 py-2.5 text-center h-auto whitespace-nowrap">#</TableHead>
                                <TableHead className="px-3 py-2.5 h-auto whitespace-nowrap">Product</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto whitespace-nowrap">Batch</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto whitespace-nowrap">Expiry</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto text-center whitespace-nowrap">Qty</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto text-right whitespace-nowrap">MRP</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto text-right whitespace-nowrap">Rate</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto text-center whitespace-nowrap">Disc %</TableHead>
                                <TableHead className="px-2 py-2.5 h-auto text-center whitespace-nowrap">GST</TableHead>
                                <TableHead className="px-3 py-2.5 h-auto text-right whitespace-nowrap">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(selectedHistoryInvoice.items ?? []).map((item, idx) => (
                                <TableRow key={item.id} className="hover:bg-accent/20 border-b border-border/20">
                                  <TableCell className="w-10 px-2 py-2.5 text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                  <TableCell className="px-3 py-2.5">
                                    <div className="text-xs font-semibold">{item.productName}</div>
                                  </TableCell>
                                  <TableCell className="px-2 py-2.5 font-mono text-[11px] text-muted-foreground">{item.batchNumber}</TableCell>
                                  <TableCell className="px-2 py-2.5 text-[11px] text-muted-foreground">
                                    {item.expiryDate ? formatExpiryShort(item.expiryDate) : '—'}
                                  </TableCell>
                                  <TableCell className="px-2 py-2.5 text-center text-xs font-bold font-mono tabular-nums">{item.quantity}</TableCell>
                                  <TableCell className="px-2 py-2.5 text-right font-mono text-xs text-muted-foreground tabular-nums">{formatCurrency(Number(item.mrp))}</TableCell>
                                  <TableCell className="px-2 py-2.5 text-right font-mono text-xs tabular-nums">{formatCurrency(Number(item.rate))}</TableCell>
                                  <TableCell className="px-2 py-2.5 text-center text-xs">
                                    {Number(item.discountPercent) > 0
                                      ? <span className="text-rose-500 font-bold">{item.discountPercent}%</span>
                                      : <span className="text-muted-foreground/40">—</span>}
                                  </TableCell>
                                  <TableCell className="px-2 py-2.5 text-center text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                                  <TableCell className="px-3 py-2.5 text-right font-mono text-xs font-bold tabular-nums">{formatCurrency(Number(item.amount))}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Footer — single-row horizontal totals bar */}
                        {/* responsive: cells wrap onto multiple rows below md, where 8+ flex-1 cells would otherwise squish labels into unreadable widths. Each cell has a min-width so it stays legible when wrapped. */}
                        <div className="border-t border-border/40 bg-muted/20 shrink-0">
                          <div className="flex flex-wrap items-stretch gap-px bg-border/30 [&>*]:min-w-[140px] md:[&>*]:min-w-0">
                            {/* Payment Mode */}
                            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Payment</span>
                              <span className="text-sm font-black tabular-nums text-foreground">{selectedHistoryInvoice.paymentMode}</span>
                            </div>

                            {/* Amount Paid — conditional */}
                            {Number(selectedHistoryInvoice.amountPaid) > 0 && (
                              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Paid</span>
                                <span className="font-mono text-sm font-bold tabular-nums">{formatCurrency(Number(selectedHistoryInvoice.amountPaid))}</span>
                              </div>
                            )}

                            {/* Change Returned — conditional */}
                            {Number(selectedHistoryInvoice.changeReturned) > 0 && (
                              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Change</span>
                                <span className="font-mono text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(selectedHistoryInvoice.changeReturned))}</span>
                              </div>
                            )}

                            {/* Subtotal */}
                            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Subtotal</span>
                              <span className="font-mono text-sm font-bold tabular-nums">{formatCurrency(Number(selectedHistoryInvoice.subtotal))}</span>
                            </div>

                            {/* Discount — conditional */}
                            {Number(selectedHistoryInvoice.productDiscount) > 0 && (
                              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Discount</span>
                                <span className="font-mono text-sm font-bold tabular-nums text-rose-500">-{formatCurrency(Number(selectedHistoryInvoice.productDiscount))}</span>
                              </div>
                            )}

                            {/* Taxable */}
                            <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Taxable</span>
                              <span className="font-mono text-sm font-bold tabular-nums">{formatCurrency(Number(selectedHistoryInvoice.taxableAmount))}</span>
                            </div>

                            {/* CGST + SGST — conditional */}
                            {(Number(selectedHistoryInvoice.cgst) > 0 || Number(selectedHistoryInvoice.sgst) > 0) && (
                              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">CGST + SGST</span>
                                <span className="font-mono text-sm font-bold tabular-nums">{formatCurrency(Number(selectedHistoryInvoice.cgst) + Number(selectedHistoryInvoice.sgst))}</span>
                              </div>
                            )}

                            {/* Round Off — conditional */}
                            {Number(selectedHistoryInvoice.roundOff) !== 0 && (
                              <div className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-background/95 px-3 py-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">Round Off</span>
                                <span className={cn(
                                  'font-mono text-sm font-bold tabular-nums',
                                  Number(selectedHistoryInvoice.roundOff) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                )}>
                                  {Number(selectedHistoryInvoice.roundOff) > 0 ? '+' : ''}{Number(selectedHistoryInvoice.roundOff).toFixed(2)}
                                </span>
                              </div>
                            )}

                            {/* Grand Total — highlighted hero cell */}
                            <div className="flex-[1.4] relative flex flex-col items-center justify-center gap-0.5 bg-linear-to-br from-primary to-primary/85 px-3 py-2 text-primary-foreground shadow-inner overflow-hidden">
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-90 relative z-10">Grand Total</span>
                              <span className="font-mono text-base font-black tabular-nums tracking-tight relative z-10">{formatCurrency(Number(selectedHistoryInvoice.grandTotal))}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ════════════════════════════════════════════
                          INVOICE LIST VIEW
                      ════════════════════════════════════════════ */
                      <ScrollArea className="flex-1">
                        <div className="px-3 py-2 border-b border-border/40 bg-muted/20">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {customerInvoices.length} invoice{customerInvoices.length !== 1 ? 's' : ''} — {selectedCustomer.name}
                          </p>
                        </div>
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md">
                            <TableRow className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent border-b border-border/40">
                              <TableHead className="px-3 py-2 h-auto">Invoice #</TableHead>
                              <TableHead className="px-3 py-2 h-auto">Date</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-center">Items</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-right">Amount</TableHead>
                              <TableHead className="px-3 py-2 h-auto text-center">Status</TableHead>
                              <TableHead className="px-3 py-2 h-auto"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {customerInvoices.map((inv) => (
                              <TableRow
                                key={inv.id}
                                className="cursor-pointer hover:bg-accent/40 transition-colors"
                                onClick={() => setSelectedHistoryInvoice(inv)}
                              >
                                <TableCell className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                                <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                                  {new Date(inv.date ?? inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </TableCell>
                                <TableCell className="px-3 py-2.5 text-center text-xs">{inv.items?.length ?? '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-xs font-semibold">{formatCurrency(Number(inv.grandTotal))}</TableCell>
                                <TableCell className="px-3 py-2.5 text-center">
                                  <Badge
                                    variant={inv.status === 'PAID' ? 'success' : inv.status === 'UNPAID' ? 'warning' : inv.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                                    size="sm"
                                    className="text-[9px]"
                                  >
                                    {inv.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="px-3 py-2.5">
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </>
                )}


              </CardContent>
            </Card>
              </>
            )}

            {/* responsive: sticky checkout bar shown on mobile + tablet (lg:hidden) — at lg+ the sidebar is always visible so no step-switcher needed */}
            <div className="sticky bottom-0 left-0 right-0 flex items-center justify-between gap-3 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3 lg:hidden">
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">{activeItemCount} item{activeItemCount !== 1 ? 's' : ''}</span>
                <span className="font-mono text-base font-semibold tabular-nums">{formatCurrency(totals.grandTotal)}</span>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setMobileStep('checkout')}
                disabled={activeItemCount === 0}
              >
                Checkout
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── RIGHT: Sticky Sidebar ────────────────── */}
          {/* responsive: full-width on mobile + tablet (in checkout step); 288px at lg; 304px at xl. md (tablets) now goes through the step flow */}
          <div className={cn("w-full shrink-0 flex flex-col gap-2 lg:w-72 xl:w-76 min-h-0", mobileStep === 'items' && 'hidden lg:flex')}>
            {/* responsive: back-to-items button shown on mobile + tablet; hidden at lg+ */}
            <div className="flex items-center gap-2 lg:hidden">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setMobileStep('items')}>
                <ChevronLeft className="h-4 w-4" />
                Back to Items
              </Button>
            </div>

            {/* Credit mode indicator — shown above payment when applicable */}
            {paymentMode === 'CREDIT' && (
              <div className="flex justify-between items-center rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-amber-700 dark:text-amber-400 text-[11px] shrink-0">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Credit Sale
                </span>
                <span className="font-mono font-bold tabular-nums">{formatCurrency(totals.grandTotal)} due</span>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════
                UNIFIED CHECKOUT PANEL — Payment + Actions in one card
            ═══════════════════════════════════════════════════ */}
            <Card className="flex-1 flex flex-col min-h-0 shadow-sm border-border/60">
              {/* Single scroll region: Order Summary + Payment scroll together so credit-mode content (Outstanding card + Due Date) is always reachable on short laptop screens. Net Payable also shown on the F8 Save & Print button so it isn't lost when scrolled. */}
              <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
                {/* Invoice Summary Section — moved from footer */}
                <div className="p-3 border-b border-border/60">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5" />
                      Order Summary
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground tabular-nums">
                      <Package className="h-3 w-3" />
                      {activeItemCount} item{activeItemCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    {/* Subtotal */}
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono font-medium tabular-nums">{formatCurrency(totals.subtotal)}</span>
                    </div>

                    {/* Discount — only when > 0 */}
                    {totals.productDiscount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          Discount
                          {totals.subtotal > 0 && (
                            <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                              −{((totals.productDiscount / totals.subtotal) * 100).toFixed(1)}%
                            </span>
                          )}
                        </span>
                        <span className="font-mono font-medium tabular-nums text-rose-600 dark:text-rose-400">−{formatCurrency(totals.productDiscount)}</span>
                      </div>
                    )}

                    {/* Taxable */}
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Taxable</span>
                      <span className="font-mono font-medium tabular-nums">{formatCurrency(totals.taxableAmount)}</span>
                    </div>

                    {/* GST */}
                    {totals.cgst > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">CGST + SGST</span>
                        <span className="font-mono font-medium tabular-nums">{formatCurrency(totals.cgst + totals.sgst)}</span>
                      </div>
                    )}
                    {totals.igst > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">IGST</span>
                        <span className="font-mono font-medium tabular-nums">{formatCurrency(totals.igst)}</span>
                      </div>
                    )}

                    {/* Delivery / Packaging — editable, non-taxable add-on */}
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Delivery / Packaging</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">₹</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={deliveryCharge === 0 ? '' : deliveryCharge}
                          onChange={(e) => {
                            const v = e.target.value
                            const n = v === '' ? 0 : parseFloat(v)
                            setDeliveryCharge(Number.isFinite(n) && n >= 0 ? n : 0)
                          }}
                          placeholder="0.00"
                          className="h-7 w-20 rounded-md border border-border/60 bg-background px-2 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {/* Round Off — only when non-zero */}
                    {totals.roundOff !== 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Round Off</span>
                        <span className={cn(
                          'font-mono font-medium tabular-nums',
                          totals.roundOff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        )}>
                          {totals.roundOff > 0 ? '+' : ''}{totals.roundOff.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Net Payable — calm hero block */}
                  <div className="mt-4 pt-3 border-t border-border/60">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Net Payable</span>
                      <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                        {formatCurrency(totals.grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Section — now second. No inner scroll: the parent CardContent is the single scroll region. */}
                <div className="p-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Payment
                  </h3>
                  <PaymentPanel
                    mode={paymentMode}
                    onModeChange={setPaymentMode}
                    grandTotal={totals.grandTotal}
                    details={paymentDetails}
                    onDetailsChange={(d) =>
                      setPaymentDetails((prev) => ({ ...prev, ...d }))
                    }
                    customer={selectedCustomer}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            ACTIONS FOOTER — Fixed bottom POS-style action bar
        ═══════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
          className="hidden md:block shrink-0 -mx-2 sm:-mx-3 md:-mx-4 lg:-mx-6 mt-2"
        >
          <div className="border-t border-border bg-background/95 backdrop-blur-sm">
            {/* responsive: kbd badges (F7/F8/F9/F10) hidden on md tablets to keep cells from overflowing; columns still 7-wide because Save & Print spans 2 — but cell padding shrinks at md */}
            <div className="grid grid-cols-7 divide-x divide-border/60">
              {/* Held — with count badge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setHeldBillsOpen(true)}
                    className="group relative inline-flex items-center justify-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <Receipt className="h-4 w-4 shrink-0" />
                    <span>Held</span>
                    {heldBills.length > 0 && (
                      <span className="inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white tabular-nums">
                        {heldBills.length}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>View held bills</TooltipContent>
              </Tooltip>

              {/* Hold (F10) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={holdCurrentBill}
                    className="group inline-flex items-center justify-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <Pause className="h-4 w-4 shrink-0" />
                    <span>Hold</span>
                    {/* responsive: kbd hidden below xl to free up column space at md/lg */}
                    <kbd className="hidden xl:inline-flex rounded border border-border/60 bg-muted/60 px-1 text-[9px] font-mono text-muted-foreground/70">F10</kbd>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Hold bill for later (F10)</TooltipContent>
              </Tooltip>

              {/* Save as Draft — persists to server, resumable across devices */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={saveAsDraft}
                    disabled={isSavingDraft || isSubmitting}
                    className="group inline-flex items-center justify-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Save className="h-4 w-4 shrink-0" />
                    <span className="truncate">{isSavingDraft ? 'Saving…' : (editingDraftId ? 'Update Draft' : 'Draft')}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {editingDraftId ? 'Re-save this draft' : 'Save as draft — finish later from Sales list'}
                </TooltipContent>
              </Tooltip>

              {/* Share (F9) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => { if (!lastSavedInvoice) { toast.info('Save invoice first before sharing'); return }; shareInvoiceViaWhatsApp(lastSavedInvoice) }}
                    className="group inline-flex items-center justify-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                  >
                    <Share2 className="h-4 w-4 shrink-0" />
                    <span>Share</span>
                    <kbd className="hidden xl:inline-flex rounded border border-border/60 bg-muted/60 px-1 text-[9px] font-mono text-muted-foreground/70">F9</kbd>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Share via WhatsApp (F9)</TooltipContent>
              </Tooltip>

              {/* Preview (F7) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    disabled={!selectedCustomer || items.filter((i) => (i.productId || (invoiceType === 'quotation' && (i.productName || '').trim() !== '')) && i.quantity > 0).length === 0}
                    className="group inline-flex items-center justify-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span>Preview</span>
                    <kbd className="hidden xl:inline-flex rounded border border-border/60 bg-muted/60 px-1 text-[9px] font-mono text-muted-foreground/70">F7</kbd>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Preview invoice (F7)</TooltipContent>
              </Tooltip>

              {/* Save & Print (F8) — primary hero, spans 2 cols */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => submitInvoice(isCreditBlocked && isPharmacist ? 'CREDIT' : undefined)}
                    disabled={isSubmitting || !selectedCustomer}
                    className={cn(
                      'group col-span-2 inline-flex items-center justify-center gap-2 lg:gap-3 px-2 lg:px-4 py-3 text-primary-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-0',
                      isCreditBlocked && isPharmacist
                        ? 'bg-amber-500 hover:bg-amber-600'
                        : 'bg-primary hover:bg-primary/90'
                    )}
                  >
                    {isCreditBlocked && isPharmacist
                      ? <ShieldCheck className="h-5 w-5 shrink-0" />
                      : <Printer className="h-5 w-5 shrink-0" />
                    }
                    <div className="flex flex-col items-start leading-tight min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-90 truncate">
                        {isCreditBlocked && isPharmacist
                          ? 'Request'
                          : editingInvoiceId
                            ? 'Update & Print'
                            : editingDraftId
                              ? 'Finalize & Print'
                              : 'Save & Print'}
                      </span>
                      <span className="text-sm font-semibold tabular-nums truncate">
                        {isSubmitting
                          ? (isCreditBlocked && isPharmacist ? 'Sending…' : 'Saving…')
                          : (isCreditBlocked && isPharmacist ? 'Approval' : formatCurrency(totals.grandTotal))
                        }
                      </span>
                    </div>
                    {/* responsive: F8 kbd hidden below lg to keep amount visible at md */}
                    <kbd className="hidden lg:inline-flex ml-1 rounded border border-primary-foreground/25 bg-primary-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold shrink-0">F8</kbd>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Save and print invoice (F8)</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </motion.div>
      </div>
      </div>

      {/* ─── Invoice Preview Dialog ─── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-6xl md:w-[96vw] md:h-auto md:max-h-[92vh] overflow-hidden flex flex-col">

          {/* ── Toolbar ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-background shrink-0">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-bold">Invoice Preview</p>
              <span className="hidden sm:inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Draft — not yet saved</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 px-3 text-sm hidden sm:flex"
                onClick={() => { const inv = buildPreviewInvoice(); import('@/lib/pdf/invoicePdf').then(m => m.downloadInvoicePdf(inv)) }}>
                <FileText className="h-3.5 w-3.5" /> Download PDF
              </Button>
              <Button size="sm" className="gap-1.5 h-8 px-4 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setPreviewOpen(false); submitInvoice() }} disabled={isSubmitting}>
                <Printer className="h-3.5 w-3.5" />
                {isSubmitting ? 'Saving...' : 'Confirm & Save'}
              </Button>
            </div>
          </div>

          {/* ── Invoice Body — fills full width ── */}
          <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900">
            {(() => {
              const prev = buildPreviewInvoice()
              const activeItems = prev.items
              return (
                <div className="h-full flex flex-col">

                  {/* ── Company Header strip ── */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b-2 border-primary bg-primary/5 gap-2">
                    <div>
                      <h1 className="text-xl font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-50">Hospital Suppliers</h1>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Hospital Suppliers, Madurai, Tamil Nadu — 625001</p>
                    </div>
                    <div className="text-left sm:text-right text-xs text-zinc-400 dark:text-zinc-500 space-y-0.5">
                      <p>Ph: +91 452 234 5678 &nbsp;·&nbsp; contact@hospitalsuppliers.in</p>
                      <p>GSTIN: 33AAAPL1234C1Z5 &nbsp;·&nbsp; DL No: TN-MDU-20B-01234</p>
                    </div>
                    <div className="sm:ml-6 shrink-0">
                      <span className="inline-block px-4 py-1.5 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-lg">
                        {prev.type === 'QUOTATION' ? 'Quotation' : 'Tax Invoice'}
                      </span>
                    </div>
                  </div>

                  {/* ── Bill To + Invoice Meta ── */}
                  {/* responsive: stack vertically below sm, 2/1 column split at sm+ where there's room */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/40 border-b border-border/30">
                    {/* Bill To */}
                    <div className="sm:col-span-2 px-4 sm:px-6 py-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">Bill To</p>
                      <p className="text-lg font-black text-zinc-900 dark:text-zinc-50 leading-snug">{prev.customerName}</p>
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-0.5 mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                        {selectedCustomer?.phone && selectedCustomer.phone !== '0000000000' && <span>{selectedCustomer.phone}</span>}
                        {selectedCustomer?.address && <span className="leading-relaxed">{selectedCustomer.address}</span>}
                        {selectedCustomer?.gstin && <span className="font-mono text-xs">GSTIN: {selectedCustomer.gstin}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={billingType === 'wholesale' ? 'purple' : 'info'} size="sm">{billingType.toUpperCase()}</Badge>
                        <Badge variant={paymentMode === 'CREDIT' ? 'warning' : 'success'} size="sm">{paymentMode}</Badge>
                      </div>
                    </div>
                    {/* Invoice Meta */}
                    {/* responsive: left-aligned on mobile (when stacked), right-aligned at sm+ */}
                    <div className="px-4 sm:px-6 py-4 space-y-3 text-left sm:text-right">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">Invoice No</p>
                        <p className="text-xl font-black font-mono text-primary break-all">{prev.invoiceNumber}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">Date</p>
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </div>
                      {prev.salespersonName && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-0.5">Salesperson</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-300">{prev.salespersonName}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Items Table ── */}
                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full min-w-175">
                      <thead>
                        <tr className="bg-zinc-800 dark:bg-zinc-950 text-white">
                          <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider w-10">#</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider">Product Name</th>
                          <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider">Batch</th>
                          <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider">Expiry</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Qty</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">MRP</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Rate</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Disc%</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">GST%</th>
                          <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.map((it, i) => (
                          <tr key={it.id} className={cn('border-b border-zinc-100 dark:border-zinc-700/50 hover:bg-primary/3 transition-colors',
                            i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50/80 dark:bg-zinc-800/50')}>
                            <td className="px-4 py-3.5 text-xs text-zinc-400 text-center">{i + 1}</td>
                            <td className="px-4 py-3.5 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                              {it.productName}
                            </td>
                            <td className="px-4 py-3.5 text-center text-xs font-mono text-zinc-500">{it.batchNumber || '—'}</td>
                            <td className="px-4 py-3.5 text-center text-xs text-zinc-500 whitespace-nowrap">
                              {it.expiryDate ? new Date(it.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—'}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-sm text-zinc-900 dark:text-zinc-100">{it.quantity}</td>
                            <td className="px-4 py-3.5 text-right text-xs font-mono text-zinc-400">{Number(it.mrp).toFixed(2)}</td>
                            <td className="px-4 py-3.5 text-right text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300">{Number(it.rate).toFixed(2)}</td>
                            <td className="px-4 py-3.5 text-right text-xs text-zinc-400">{Number(it.discountPercent).toFixed(1)}%</td>
                            <td className="px-4 py-3.5 text-right text-xs text-zinc-400">{Number(it.gstPercent).toFixed(1)}%</td>
                            <td className="px-4 py-3.5 text-right font-bold font-mono text-sm text-zinc-900 dark:text-zinc-100">{formatCurrency(Number(it.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Totals + Footer row ── */}
                  <div className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-stretch sm:justify-between divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 dark:divide-zinc-700">

                      {/* Left — terms */}
                      <div className="flex-1 px-6 py-4 flex flex-col justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Payment Terms</p>
                          <p className="text-sm text-zinc-500">Mode: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{paymentMode}</span></p>
                          {paymentMode === 'CASH' && paymentDetails.amountReceived > 0 && (
                            <div className="flex gap-6 mt-1 text-sm">
                              <span className="text-emerald-600 font-semibold">Received: {formatCurrency(paymentDetails.amountReceived)}</span>
                              {paymentDetails.amountReceived > prev.grandTotal && (
                                <span className="text-zinc-500">Change: {formatCurrency(paymentDetails.amountReceived - prev.grandTotal)}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 italic">Goods once sold will not be taken back or exchanged. Subject to Madurai jurisdiction.</p>
                      </div>

                      {/* Right — totals summary */}
                      <div className="px-6 py-4 sm:min-w-75 space-y-1.5">
                        {[
                          { label: 'Subtotal', value: formatCurrency(prev.subtotal) },
                          ...(prev.productDiscount > 0 ? [{ label: 'Discount', value: `− ${formatCurrency(prev.productDiscount)}`, rose: true }] : []),
                          { label: 'Taxable Value', value: formatCurrency(prev.taxableAmount) },
                          ...(prev.cgst > 0 ? [{ label: 'CGST', value: formatCurrency(prev.cgst) }, { label: 'SGST', value: formatCurrency(prev.sgst) }] : []),
                          ...(prev.roundOff !== 0 ? [{ label: 'Round Off', value: `${prev.roundOff > 0 ? '+' : ''}${prev.roundOff.toFixed(2)}`, dim: true }] : []),
                        ].map((row: any) => (
                          <div key={row.label} className="flex justify-between text-sm">
                            <span className={cn(row.dim ? 'text-zinc-300' : 'text-zinc-500')}>{row.label}</span>
                            <span className={cn('font-mono', row.rose ? 'text-rose-500 font-semibold' : 'text-zinc-700 dark:text-zinc-300')}>{row.value}</span>
                          </div>
                        ))}
                        <div className="pt-2 mt-1 border-t-2 border-zinc-900 dark:border-zinc-300">
                          <div className="flex justify-between items-center">
                            <span className="text-base font-black text-zinc-900 dark:text-zinc-50">Grand Total</span>
                            <span className="text-2xl font-black font-mono text-primary">{formatCurrency(prev.grandTotal)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Far right — signature */}
                      <div className="hidden sm:flex flex-col items-center justify-end px-8 py-4 text-center min-w-35">
                        <div className="border-t border-zinc-400 w-24 mb-1.5" />
                        <p className="text-xs font-semibold text-zinc-500">Authorised Signatory</p>
                      </div>
                    </div>
                  </div>

                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add Customer Dialog ─── */}


      {/* ─── Add Customer Dialog ─── */}
      {/* ── Held Bills Dialog ── */}
      <Dialog open={heldBillsOpen} onOpenChange={setHeldBillsOpen}>
        {/* responsive: clamp width on tiny phones so dialog can't push viewport horizontally */}
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Held Bills ({heldBills.length})</DialogTitle>
            <DialogDescription>Resume a previously held bill or discard it.</DialogDescription>
          </DialogHeader>
          {heldBills.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Pause className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No held bills</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {heldBills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{bill.customerName || 'Walk-in'}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {bill.itemCount} item{bill.itemCount !== 1 ? 's' : ''} · {formatCurrency(bill.total)}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                      Held at {new Date(bill.heldAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => resumeHeldBill(bill)}>
                      Resume
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                      onClick={() => discardHeldBill(bill.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Pay Pending Credits Dialog ── */}
      <Dialog open={creditPayDialogOpen} onOpenChange={setCreditPayDialogOpen}>
        {/* responsive: full-screen on small phones, capped at lg on sm+ */}
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Pending Credit Invoices — {selectedCustomer?.name}
            </DialogTitle>
            <DialogDescription>
              {pendingCreditCount >= 3
                ? 'Credit sales are blocked. Clear at least one invoice to continue.'
                : `${pendingCreditCount} pending credit invoice${pendingCreditCount !== 1 ? 's' : ''}.`}
            </DialogDescription>
          </DialogHeader>

          {/* Payment mode selector */}
          {/* responsive: wraps the amount input onto its own row below sm */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Mode</label>
            <Select value={collectMode} onValueChange={setCollectMode}>
              <SelectTrigger className="h-8 text-xs w-28 sm:w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['CASH', 'CARD', 'UPI', 'CHEQUE'].map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Amount for one-by-one"
              className="h-8 text-xs font-mono flex-1 min-w-[140px]"
              value={collectAmount}
              onChange={(e) => setCollectAmount(e.target.value)}
            />
          </div>

          {/* Pending invoices list */}
          {pendingInvoicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </div>
          ) : pendingInvoices.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center text-sm text-emerald-700 dark:text-emerald-400">
              All credits cleared! You can now proceed with credit sales.
            </div>
          ) : (
            <div className="divide-y divide-border/40 rounded-xl border border-border/60 overflow-hidden">
              {pendingInvoices.map((inv) => {
                const due = Number(inv.grandTotal) - Number(inv.amountPaid)
                const isPaying = payingInvoiceId === inv.id
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-background">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                        {' · '}{inv.status}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(due)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] shrink-0"
                      disabled={isPaying || payingInvoiceId === 'all'}
                      onClick={() => handleCollectOne(inv.id)}
                    >
                      {isPaying ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Collect'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreditPayDialogOpen(false)}>
              Close
            </Button>
            {pendingInvoices.length > 0 && (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={payingInvoiceId !== null}
                onClick={handleCollectAll}
              >
                {payingInvoiceId === 'all'
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Clearing…</>
                  : <><CreditCard className="h-3.5 w-3.5" /> Clear All ({formatCurrency(pendingInvoices.reduce((s, inv) => s + Number(inv.grandTotal) - Number(inv.amountPaid), 0))})</>
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick Reminder Dialog ── */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        {/* responsive: clamp width on tiny phones */}
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-violet-500" />
              Set Monthly Reminder
            </DialogTitle>
            <DialogDescription>
              {selectedCustomer?.name} · {selectedCustomer?.phone}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reminder Day of Month (1–31) *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                placeholder="e.g. 3"
                value={reminderDay}
                onChange={e => setReminderDay(e.target.value)}
                autoFocus
              />
              {reminderDay && parseInt(reminderDay) >= 1 && parseInt(reminderDay) <= 31 && (
                <p className="text-[10px] text-muted-foreground">
                  You'll be reminded on the {reminderDay}{['st','nd','rd'][parseInt(reminderDay)-1] ?? 'th'} of every month
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Title *</Label>
              <Input
                placeholder="e.g. Monthly medicine order follow-up"
                value={reminderTitle}
                onChange={e => setReminderTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Textarea
                placeholder="Products usually ordered, special instructions..."
                rows={2}
                value={reminderNotes}
                onChange={e => setReminderNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveReminder}
              disabled={reminderSaving || !reminderDay || !reminderTitle}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {reminderSaving ? 'Saving...' : 'Set Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </TooltipProvider>
  )
}
