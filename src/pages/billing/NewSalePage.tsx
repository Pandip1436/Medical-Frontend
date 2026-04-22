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
  UserPlus,
  CreditCard,
  Banknote,
  Smartphone,
  Clock,
  SplitSquareHorizontal,
  Package,
  ChevronDown,
  Layers,
  Keyboard,
  Receipt,
  History,
  Users,
  FileText,
  RefreshCw,
  ChevronRight,
  Upload,
  Camera,
  FileImage,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import type { Product, Customer, Invoice } from '@/types'
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

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Must be exactly 10 digits'),
  type: z.enum(['RETAIL', 'WHOLESALE', 'DOCTOR']),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().min(1, 'Address is required'),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  referredBy: z.string().min(1, 'Please select a salesperson'),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'WHOLESALE' || data.type === 'DOCTOR') {
    if (!data.gstin || data.gstin.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN is required for Wholesale / Doctor' })
    }
    if (!data.dlNumber || data.dlNumber.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['dlNumber'], message: 'DL Number is required for Wholesale / Doctor' })
    }
  }
})

type CustomerFormValues = z.input<typeof customerSchema>

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function generateRowId() {
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isNearExpiry(expiryDate: string): boolean {
  const expiry = new Date(expiryDate)
  const now = new Date()
  const threeMonths = 90 * 24 * 60 * 60 * 1000
  return expiry.getTime() - now.getTime() < threeMonths
}

function formatExpiryShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
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
    <div className="inline-flex rounded-xl bg-muted/60 p-1 backdrop-blur-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
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
  const isLoading = useMasterDataStore(s => s.isLoading)

  const [productSearch, setProductSearch] = useState(item.productName)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 400 })

  const productRef = useRef<HTMLTableCellElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const batchRef = useRef<HTMLButtonElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 8)
    const q = productSearch.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.genericName.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch])

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

  const handleProductSelect = useCallback(
    (product: Product) => {
      const productBatches = batches
        .filter((b) => b.productId === product.id && b.quantity > 0)
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

      const firstBatch = productBatches[0]
      const rate = billingType === 'wholesale' ? product.wholesaleRate : product.sellingRate

      const updates: Partial<BillingItem> = {
        productId: product.id,
        productName: product.name,
        gstPercent: product.gstRate,
        mrp: Number(firstBatch?.mrp ?? product.mrp) || 0,
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
    [billingType, item, onUpdate, batches]
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleBatchChange = useCallback(
    (batchId: string) => {
      const batch = batches.find((b) => b.id === batchId)
      if (!batch) return
      const updates: Partial<BillingItem> = {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        mrp: batch.mrp,
      }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)
      onUpdate(item.id, updates)
    },
    [item, onUpdate]
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleQtyChange = useCallback(
    (qty: number) => {
      const selectedBatch = batches.find((b) => b.id === item.batchId)
      const maxQty = selectedBatch?.quantity ?? 9999
      const clampedQty = Math.min(Math.max(0, qty), maxQty)
      const updates: Partial<BillingItem> = { quantity: clampedQty }
      const tempItem = { ...item, ...updates }
      updates.amount = calculateItemAmount(tempItem)
      onUpdate(item.id, updates)
    },
    [item, onUpdate]
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
      const updates: Partial<BillingItem> = { rate: Math.max(0, rate) }
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
      if (filteredProducts[selectedIndex]) {
        handleProductSelect(filteredProducts[selectedIndex])
      }
    } else if (e.key === 'Tab' && showProductDropdown && filteredProducts.length > 0) {
      // Auto-select highlighted on Tab if dropdown is open
      handleProductSelect(filteredProducts[selectedIndex])
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false)
    }
  }

  const selectedBatch = batches.find((b) => b.id === item.batchId)
  const qtyExceeds = selectedBatch ? item.quantity > selectedBatch.quantity : false

  return (
    <MotionTableRow
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className="group transition-colors border-b-border/40 hover:bg-muted/20 data-[state=selected]:bg-muted"
    >
      {/* S.No */}
      <TableCell className="w-9 px-2 py-1.5 text-center text-[11px] text-muted-foreground/70">
        {index + 1}
      </TableCell>

      {/* Product + Schedule */}
      <TableCell className="min-w-55 px-2 py-1" ref={productRef}>
        <div className="relative group/search">
          <input
            ref={inputRef}
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value)
              setShowProductDropdown(true)
              setSelectedIndex(0)
            }}
            onFocus={() => {
              if (inputRef.current) {
                const rect = inputRef.current.getBoundingClientRect()
                setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: 400 })
              }
              setShowProductDropdown(true)
            }}
            onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder="Search product..."
            className={cn(
              'w-full h-8 rounded-lg border border-transparent bg-transparent px-2 text-xs font-semibold transition-all',
              'placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-muted/40 focus:border-primary/20',
              !item.productId && 'italic font-normal'
            )}
          />
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/20 group-hover/search:text-muted-foreground/40 transition-colors" />
          {selectedProduct && (selectedProduct.schedule === 'H' || selectedProduct.schedule === 'H1') && (
            <div className="absolute -bottom-4 left-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-tight text-rose-500/80">
              <ShieldAlert className="h-2.5 w-2.5" />
              Sch {selectedProduct.schedule}
            </div>
          )}
          {showProductDropdown && createPortal(
            <div
              style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
              className="rounded-xl border border-border/60 bg-popover shadow-2xl overflow-hidden"
            >
              <div className="px-3 py-1.5 border-b border-border/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 bg-muted/30">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Syncing database...
                  </span>
                ) : (
                  <>{filteredProducts.length} Product{filteredProducts.length !== 1 ? 's' : ''} Found</>
                )}
              </div>
              <div className="max-h-70 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground italic">
                    No products found
                  </div>
                ) : (
                  filteredProducts.map((p, idx) => (
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
                  ))
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
      </TableCell>

      {/* Batch + Expiry */}
      <TableCell className="w-37.5 px-1.5 py-1">
        <Select
          value={item.batchId}
          onValueChange={handleBatchChange}
          disabled={!item.productId}
        >
          <SelectTrigger
            ref={batchRef}
            className={cn(
              'h-8 w-full bg-transparent border-0 px-2 text-xs font-medium transition-all focus:ring-1 focus:ring-primary/20',
              !item.batchId && 'text-muted-foreground/40 italic'
            )}>
            <SelectValue placeholder="Select Batch" />
          </SelectTrigger>
          <SelectContent className="bg-popover/95 backdrop-blur-xl">
            {productBatches.map((b) => (
              <SelectItem key={b.id} value={b.id} className="text-xs">
                <div className="flex items-center justify-between w-full min-w-30">
                  <span className="font-mono font-bold tracking-tight">{b.batchNumber}</span>
                  <span className="text-[10px] opacity-60 ml-3">Qty: {b.quantity}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {item.expiryDate && (
          <div
            className={cn(
              'text-[9px] mt-0.5 px-2 font-bold uppercase tracking-tight',
              isNearExpiry(item.expiryDate)
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground/30'
            )}
          >
            Exp: {formatExpiryShort(item.expiryDate)}
          </div>
        )}
      </TableCell>

      {/* Qty with +/- */}
      <TableCell className="w-27.5 px-1.5 py-1">
        <div className="flex items-center gap-0.5 bg-muted/20 rounded-lg p-0.5 border border-border/20 focus-within:border-primary/30 transition-all">
          <button
            type="button"
            onClick={() => handleQtyChange(item.quantity - 1)}
            disabled={!item.productId || item.quantity <= 0}
            className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            ref={qtyRef}
            type="number"
            min={0}
            max={selectedBatch?.quantity ?? 9999}
            value={item.quantity || ''}
            onChange={(e) => handleQtyChange(parseInt(e.target.value) || 0)}
            className={cn(
              'w-full h-7 border-0 bg-transparent text-xs text-center font-bold font-mono',
              'focus:outline-none focus:ring-0',
              'disabled:opacity-40 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
              qtyExceeds && 'text-rose-600'
            )}
            disabled={!item.productId}
          />
          <button
            type="button"
            onClick={() => handleQtyChange(item.quantity + 1)}
            disabled={!item.productId}
            className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </TableCell>

      {/* Unit Rate — original (read-only) */}
      <TableCell className="w-22 px-1.5 py-1 text-right">
        {(() => {
          const originalRate = selectedProduct
            ? Number(billingType === 'wholesale' ? selectedProduct.wholesaleRate : selectedProduct.sellingRate)
            : 0
          const isModified = originalRate > 0 && Math.abs(Number(item.rate) - originalRate) > 0.001
          return originalRate > 0 ? (
            <div className="space-y-0.5">
              <div className={cn(
                'text-xs font-mono font-semibold',
                isModified ? 'line-through text-muted-foreground/40' : 'text-foreground'
              )}>
                {formatCurrency(originalRate)}
              </div>
              {item.mrp > 0 && (
                <div className="text-[9px] font-mono text-muted-foreground/40">
                  MRP {formatCurrency(item.mrp)}
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground/30 text-xs">—</span>
          )
        })()}
      </TableCell>

      {/* New Rate — editable with +/- */}
      <TableCell className="w-28 px-1.5 py-1">
        {(() => {
          const originalRate = selectedProduct
            ? Number(billingType === 'wholesale' ? selectedProduct.wholesaleRate : selectedProduct.sellingRate)
            : 0
          const isModified = originalRate > 0 && Math.abs(Number(item.rate) - originalRate) > 0.001
          return (
            <div className={cn(
              'flex items-center gap-0.5 rounded-lg border bg-muted/20 px-0.5 transition-all focus-within:border-primary/40',
              isModified ? 'border-amber-400/50 bg-amber-50/20 dark:bg-amber-900/10' : 'border-border/20'
            )}>
              <button
                type="button"
                onClick={() => handleRateChange(Math.max(0, Number(item.rate) - 1))}
                disabled={!item.productId}
                className="h-7 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="number"
                step={0.01}
                value={item.rate || ''}
                onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)}
                className={cn(
                  'w-full h-7 border-0 bg-transparent text-sm text-center font-bold font-mono',
                  'focus:outline-none focus:ring-0',
                  'disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                  isModified ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                )}
                disabled={!item.productId}
              />
              <button
                type="button"
                onClick={() => handleRateChange(Number(item.rate) + 1)}
                disabled={!item.productId}
                className="h-7 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-all disabled:opacity-30"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )
        })()}
      </TableCell>

      {/* Disc% */}
      <TableCell className="w-16.25 px-1.5 py-1">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={item.discountPercent || ''}
          onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
          className={cn(
            'w-full h-8 rounded-lg border border-transparent bg-transparent text-xs text-center font-mono transition-all',
            'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-muted/30 focus:border-primary/20',
            'disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
          )}
          disabled={!item.productId}
        />
      </TableCell>

      {/* GST */}
      <TableCell className="w-12.5 px-1 py-1 text-center text-[10px] font-bold text-muted-foreground/50 font-mono">
        {item.gstPercent ? `${item.gstPercent}%` : '—'}
      </TableCell>

      {/* Amount */}
      <TableCell className="w-27.5 px-3 py-1 text-right">
        <span className={cn(
          'text-sm font-black font-mono tracking-tight',
          item.amount > 0 ? 'text-primary' : 'text-muted-foreground/30'
        )}>
          {item.amount > 0 ? formatCurrency(item.amount) : '₹0.00'}
        </span>
      </TableCell>

      {/* Delete */}
      <TableCell className="w-8 px-1 py-1.5">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-md p-1 text-muted-foreground/30 hover:bg-rose-500/10 hover:text-rose-600 transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </TableCell>
    </MotionTableRow>
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
  const changeToReturn = useMemo(() => {
    if (mode !== 'CASH') return 0
    return Math.max(0, details.amountReceived - grandTotal)
  }, [mode, details.amountReceived, grandTotal])

  const splitTotal = useMemo(() => {
    return details.splits.reduce((sum, s) => sum + s.amount, 0)
  }, [details.splits])

  const splitRemaining = grandTotal - splitTotal

  const paymentModes: { label: string; value: PaymentMode; icon: React.ReactNode; shortcut?: string }[] = [
    { label: 'Cash', value: 'CASH', icon: <Banknote className="h-3.5 w-3.5" /> },
    { label: 'Card', value: 'CARD', icon: <CreditCard className="h-3.5 w-3.5" /> },
    { label: 'UPI', value: 'UPI', icon: <Smartphone className="h-3.5 w-3.5" /> },
    { label: 'Credit', value: 'CREDIT', icon: <Clock className="h-3.5 w-3.5" /> },
    { label: 'Split', value: 'SPLIT', icon: <SplitSquareHorizontal className="h-3.5 w-3.5" /> },
  ]

  const denominations = [50, 100, 200, 500, 1000, 2000]

  return (
    <div className="space-y-3">
      {/* Mode buttons */}
      <div className="flex flex-wrap gap-1">
        {paymentModes.map((pm) => (
          <button
            key={pm.value}
            type="button"
            onClick={() => onModeChange(pm.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all border',
              mode === pm.value
                ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20'
                : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground'
            )}
          >
            {pm.icon}
            {pm.label}
          </button>
        ))}
      </div>

      {/* Cash */}
      {mode === 'CASH' && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount Received
            </label>
            <Input
              type="number"
              value={details.amountReceived || ''}
              onChange={(e) =>
                onDetailsChange({ amountReceived: parseFloat(e.target.value) || 0 })
              }
              className="mt-1 h-9 font-mono text-sm"
              placeholder={grandTotal.toFixed(2)}
            />
          </div>

          {/* Quick denomination buttons */}
          <div className="flex flex-wrap gap-1">
            {denominations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDetailsChange({ amountReceived: d })}
                className={cn(
                  'rounded-md border px-2 py-1 text-[11px] font-medium transition-all',
                  details.amountReceived === d
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                ₹{d >= 1000 ? `${d / 1000}K` : d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onDetailsChange({ amountReceived: grandTotal })}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] font-semibold transition-all',
                details.amountReceived === grandTotal
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
              )}
            >
              Exact
            </button>
          </div>

          {/* Change to return */}
          {details.amountReceived > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-2">
              <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">Change</span>
              <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {formatCurrency(changeToReturn)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Card */}
      {mode === 'CARD' && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount Paid
            </label>
            <Input
              type="number"
              value={details.amountReceived || ''}
              onChange={(e) => onDetailsChange({ amountReceived: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-9 font-mono text-sm"
              placeholder={grandTotal.toFixed(2)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Last 4 Digits
              </label>
              <Input
                maxLength={4}
                value={details.cardLast4}
                onChange={(e) => onDetailsChange({ cardLast4: e.target.value.replace(/\D/g, '') })}
                className="mt-1 h-8 font-mono text-xs"
                placeholder="1234"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reference #
              </label>
              <Input
                value={details.cardRef}
                onChange={(e) => onDetailsChange({ cardRef: e.target.value })}
                className="mt-1 h-8 text-xs"
                placeholder="Txn ref"
              />
            </div>
          </div>
        </div>
      )}

      {/* UPI */}
      {mode === 'UPI' && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount Paid
            </label>
            <Input
              type="number"
              value={details.amountReceived || ''}
              onChange={(e) => onDetailsChange({ amountReceived: parseFloat(e.target.value) || 0 })}
              className="mt-1 h-9 font-mono text-sm"
              placeholder={grandTotal.toFixed(2)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              UPI Reference #
            </label>
            <Input
              value={details.upiRef}
              onChange={(e) => onDetailsChange({ upiRef: e.target.value })}
              className="mt-1 h-8 text-xs"
              placeholder="UPI transaction ID"
            />
          </div>
        </div>
      )}

      {/* Credit */}
      {mode === 'CREDIT' && (
        <div className="space-y-2">
          {customer && (
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-900/10 p-2.5 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-amber-800 dark:text-amber-300">Outstanding</span>
                <span className="font-semibold font-mono text-amber-900 dark:text-amber-200">
                  {formatCurrency(Number(customer.currentOutstanding) || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800 dark:text-amber-300">Credit Limit</span>
                <span className="font-semibold font-mono text-amber-900 dark:text-amber-200">
                  {formatCurrency(Number(customer.creditLimit) || 0)}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200/40 dark:border-amber-800/20 pt-1">
                <span className="text-amber-800 dark:text-amber-300">Available</span>
                <span className="font-bold font-mono text-amber-900 dark:text-amber-200">
                  {formatCurrency(Math.max(0, (Number(customer.creditLimit) || 0) - (Number(customer.currentOutstanding) || 0)))}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Due Date
            </label>
            <Input
              type="date"
              value={details.creditDueDate}
              onChange={(e) => onDetailsChange({ creditDueDate: e.target.value })}
              className="mt-1 h-8 text-xs"
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
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
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
                className="flex-1 h-8 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  onDetailsChange({ splits: details.splits.filter((s) => s.id !== split.id) })
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => {
              onDetailsChange({
                splits: [
                  ...details.splits,
                  { id: generateRowId(), mode: 'CASH', amount: Math.max(0, splitRemaining) },
                ],
              })
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Split
          </Button>
          {details.splits.length > 0 && (
            <div
              className={cn(
                'text-[11px] font-medium text-center',
                Math.abs(splitRemaining) < 0.01 ? 'text-emerald-600' : 'text-rose-600'
              )}
            >
              {Math.abs(splitRemaining) < 0.01
                ? 'Amounts match total'
                : `Remaining: ${formatCurrency(splitRemaining)}`}
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
  const { sidebarCollapsed, toggleSidebar } = useAuthStore()

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
    fetchMasterData()
    // Read URL params
    const params = new URLSearchParams(window.location.search)
    if (params.get('type') === 'quotation') {
      setInvoiceType('quotation')
    }
    const dupId = params.get('duplicateId')
    if (dupId) {
      api.get(`/billing/${dupId}`).then((res) => {
        const inv = res.data
        // Pre-fill items from the original invoice
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
      }).catch(() => {/* ignore if not found */ })
    }
  }, [])

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
    const activeItems = items.filter((i) => i.productId && i.quantity > 0)
    if (activeItems.length === 0) { toast.info('Nothing to hold'); return }
    const bill: HeldBill = {
      id: crypto.randomUUID(),
      heldAt: new Date().toISOString(),
      customerName: selectedCustomer?.name ?? 'Walk-in',
      itemCount: activeItems.length,
      total: totals.grandTotal,
      snapshot: { invoiceType, billingType, selectedCustomer, items, paymentMode, paymentDetails },
    }
    saveHeldBills([...heldBills, bill])
    // Clear current bill
    setItems([createEmptyItem()])
    setSelectedCustomer(null)
    setCustomerSearch('')
    setPaymentMode('CASH')
    setPaymentDetails({ amountReceived: 0, cardLast4: '', cardRef: '', upiRef: '', creditDueDate: '', splits: [] })
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
  const [selectedSalesperson, setSelectedSalesperson] = useState<{ id: string; name: string } | null>(null)
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([])
  const [salespersonSearch, setSalespersonSearch] = useState('')
  const [showSalespersonDropdown, setShowSalespersonDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docPreview, setDocPreview] = useState<string | null>(null)

  const handleDocFile = (file: File | null) => {
    setDocFile(file)
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setDocPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setDocPreview(null)
    }
  }

  const [items, setItems] = useState<BillingItem[]>(() => {
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

  // Clear repurchase data after it's been loaded once
  useEffect(() => {
    if (sessionStorage.getItem('repurchase_items')) {
      toast.info(`Items pre-loaded from previous invoice`)
      sessionStorage.removeItem('repurchase_items')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH')
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({
    amountReceived: 0,
    cardLast4: '',
    cardRef: '',
    upiRef: '',
    creditDueDate: '',
    splits: [],
  })

  // ── Table view tabs ───────────────────────────────────────
  type TableView = 'products' | 'customer-history' | 'salesperson-customers'
  const [tableView, setTableView] = useState<TableView>('products')

  // ── Customer invoice history ──────────────────────────────
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([])
  const [customerInvoicesLoading, setCustomerInvoicesLoading] = useState(false)
  const [selectedHistoryInvoice, setSelectedHistoryInvoice] = useState<Invoice | null>(null)
  const [historyInvoiceOpen, setHistoryInvoiceOpen] = useState(false)

  // Fetch customer invoices when customer changes or tab switches
  useEffect(() => {
    if (tableView === 'customer-history' && selectedCustomer) {
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
  const salespersonRef = useRef<HTMLDivElement>(null)
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
      if (salespersonRef.current && !salespersonRef.current.contains(e.target as Node)) {
        setShowSalespersonDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const invoiceNumber = useMemo(
    () => generateInvoiceNumber(invoiceType === 'invoice' ? 'INV' : 'QTN', 127),
    [invoiceType]
  )

  // ── Hero search results ──────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const heroResults = useMemo(() => {
    if (!heroSearch) return []
    const q = heroSearch.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.genericName.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.hsnCode.includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 8)
  }, [heroSearch])

  // ── Filtered lists ──────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers
    const q = customerSearch.toLowerCase()
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.type.toLowerCase().includes(q)
    )
  }, [customerSearch, customers])

  // ── Hero product add ──────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const addProductFromSearch = useCallback(
    (product: Product) => {
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
        const productBatches = batches
          .filter((b) => b.productId === product.id && b.quantity > 0)
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

        const firstBatch = productBatches[0]
        const rate = billingType === 'wholesale' ? product.wholesaleRate : product.sellingRate

        const newItem: BillingItem = {
          ...createEmptyItem(),
          productId: product.id,
          productName: product.name,
          gstPercent: product.gstRate,
          mrp: Number(firstBatch?.mrp ?? product.mrp) || 0,
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
    [items, billingType]
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
          // Exact barcode match first
          const barcode = heroSearchRef.current?.value ?? ''
          const exact = products.find((p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase())
          if (exact) {
            addProductFromSearch(exact)
            toast.success(`Scanned: ${exact.name}`)
            return
          }
          // Fallback: if only one result, add it
          if (heroResults.length === 1) {
            addProductFromSearch(heroResults[0])
            toast.success(`Scanned: ${heroResults[0].name}`)
            return
          }
          if (heroResults.length === 0) {
            toast.error(`Barcode not found: ${barcode}`)
            setHeroSearch('')
            return
          }
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
    [heroResults, heroSelectedIdx, addProductFromSearch, products]
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
    setItems((prev) => [...prev, createEmptyItem()])
  }, [])

  // ── Calculations ──────────────────────────────────────
  const totals = useMemo(() => {
    const activeItems = items.filter((i) => i.productId && i.quantity > 0)

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

    const rawTotal = taxableAmount + totalCgst + totalSgst
    const rounded = Math.round(rawTotal)
    const roundOff = rounded - rawTotal

    return {
      subtotal,
      productDiscount,
      taxableAmount,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: 0,
      roundOff,
      grandTotal: rounded,
    }
  }, [items])

  // ── Credit limit warning ────────────────────────────────
  const showCreditWarning = useMemo(() => {
    if (!selectedCustomer) return false
    return (Number(selectedCustomer.currentOutstanding) || 0) > (Number(selectedCustomer.creditLimit) || 0)
  }, [selectedCustomer])

  // ── Submit Invoice ──────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSavedInvoice, setLastSavedInvoice] = useState<Invoice | null>(null)
  const submitInvoice = async () => {
    const activeItems = items.filter((i) => i.productId && i.quantity > 0)
    if (activeItems.length === 0) {
      toast.error('Please add items to the bill')
      return;
    }

    if (!selectedCustomer) {
      toast.error('Please select a customer before saving')
      setShowCustomerDropdown(true)
      return;
    }

    if (showCreditWarning) {
      toast.error('Cannot process: Credit limit exceeded')
      return;
    }

    // Validate qty against batch stock
    for (const item of activeItems) {
      const batch = batches.find((b) => b.id === item.batchId)
      if (batch && item.quantity > batch.quantity) {
        toast.error(`"${item.productName}" qty (${item.quantity}) exceeds available stock (${batch.quantity})`)
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
        paymentMode: paymentMode.toUpperCase(),

        subtotal: Number(totals.subtotal) || 0,
        productDiscount: Number(totals.productDiscount) || 0,
        taxableAmount: Number(totals.taxableAmount) || 0,
        cgst: Number(totals.cgst) || 0,
        sgst: Number(totals.sgst) || 0,
        igst: 0,
        roundOff: Number(totals.roundOff) || 0,
        grandTotal: Number(totals.grandTotal) || 0,
        amountPaid: invoiceType === 'quotation' ? 0
          : paymentMode === 'CASH' ? (Number(paymentDetails.amountReceived) || 0)
            : paymentMode === 'CREDIT' ? 0
              : paymentMode === 'SPLIT' ? (paymentDetails.splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0))
                : (Number(paymentDetails.amountReceived) || Number(totals.grandTotal) || 0),
        changeReturned: invoiceType === 'quotation' ? 0 : Number(paymentMode === 'CASH' ? Math.max(0, paymentDetails.amountReceived - totals.grandTotal) : 0),
        status: invoiceType === 'quotation' ? 'DRAFT' : paymentMode === 'CREDIT' ? 'CREDIT' : 'PAID',

        ...(activeBranchId && { branchId: activeBranchId }),
        ...(selectedSalesperson && { salespersonId: selectedSalesperson.id, salespersonName: selectedSalesperson.name }),

        items: activeItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          expiryDate: new Date(item.expiryDate).toISOString(),
          quantity: Number(item.quantity) || 1,
          mrp: Number(item.mrp) || 0,
          rate: Number(item.rate) || 0,
          discountPercent: Number(item.discountPercent) || 0,
          gstPercent: Number(item.gstPercent) || 0,
          amount: Number(item.amount) || 0
        }))
      }

      const endpoint = invoiceType === 'quotation' ? '/quotations' : '/billing'
      const res = await api.post(endpoint, payload)
      const savedInvoice = res.data
      setLastSavedInvoice(savedInvoice)

      if (invoiceType === 'quotation') {
        toast.success(`Quotation ${savedInvoice.invoiceNumber} saved successfully`)
        navigate('/billing/quotations')
      } else {
        printInvoicePdf(savedInvoice)
        toast.success('Invoice saved and sent to printer')
        fetchMasterData()
        navigate('/billing/sales')
      }

    } catch (error: unknown) {
      const errorMsg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to generate invoice. Please check stock limits.'
      console.error(error)
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
        heroSearchRef.current?.focus()
      } else if (e.altKey && e.key === 'n') {
        e.preventDefault()
        addItem()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addItem])

  const activeItemCount = items.filter((i) => i.productId && i.quantity > 0).length

  function customerTypeBadge(type: Customer['type']): 'info' | 'purple' | 'success' | 'warning' | 'secondary' {
    const map: Record<Customer['type'], 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
      RETAIL: 'success',
      WHOLESALE: 'purple',
      DOCTOR: 'warning',
    }
    return map[type] ?? 'secondary'
  }

  // ── Customer Form ──────────────────────────────────────
  const customerForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      type: 'RETAIL',
      email: '',
      address: '',
      gstin: '',
      dlNumber: '',
      referredBy: '',
      notes: '',
    },
  })

  const handleAddCustomer = async (values: CustomerFormValues) => {
    try {
      const res = await api.post('/customers', values)
      toast.success(`Customer "${values.name}" added successfully`)
      await fetchMasterData()
      const newlyCreated = res.data
      if (newlyCreated) setSelectedCustomer(newlyCreated)
      customerForm.reset()
      setAddCustomerDialogOpen(false)
    } catch (error: unknown) {
      toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to add customer')
    }
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-4.5rem)]">
        {/* ═══════════════════════════════════════════════════
            HEADER BAR
        ═══════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
          className="flex items-center justify-between mb-3"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight">New Sale</h1>
            <Badge variant="outline" size="sm" className="font-mono text-[10px]">
              {invoiceNumber}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <PillToggle
              options={[
                { label: 'Invoice', value: 'invoice' as const },
                { label: 'Quotation', value: 'quotation' as const },
              ]}
              value={invoiceType}
              onChange={setInvoiceType}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Held
                  <Badge variant="secondary" size="sm" className="px-1.5 py-0 text-[9px]">0</Badge>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Held bills (F10 to hold current)</TooltipContent>
            </Tooltip>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════
            SEARCH BAR + CONTEXT ROW
        ═══════════════════════════════════════════════════ */}
        <div className="flex gap-3 mb-3 h-11">
          {/* ═══════════════════════════════════════════════════
              TABLE ACTION AREA (Aligned with Table Card)
          ═══════════════════════════════════════════════════ */}
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Hero Product Search */}
            <div className="w-[38%] lg:w-[34%] relative">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
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
                  placeholder="Scan barcode or search products...  (Alt+S)"
                  className={cn(
                    'w-full h-11 rounded-xl border-2 border-primary/20 bg-background pl-11 pr-4 text-sm shadow-sm',
                    'placeholder:text-muted-foreground/50 font-medium',
                    'focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary/60',
                    'transition-all duration-300 hover:border-primary/30'
                  )}
                />
                {heroSearch && (
                  <button
                    type="button"
                    onClick={() => { setHeroSearch(''); setShowHeroResults(false); heroSearchRef.current?.focus() }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Hero search results dropdown */}
              <AnimatePresence>
                {showHeroResults && heroResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.12 }}
                    className="absolute z-50 mt-1 w-full rounded-xl border border-border/60 bg-popover/95 shadow-2xl backdrop-blur-xl overflow-hidden"
                  >
                    <div className="px-3 py-1.5 border-b border-border/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {heroResults.length} product{heroResults.length > 1 ? 's' : ''} found
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {heroResults.map((p, idx) => (
                        <div
                          key={p.id}
                          className={cn(
                            'cursor-pointer px-3 py-2.5 transition-colors flex items-center gap-3',
                            idx === heroSelectedIdx ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent/50'
                          )}
                          onClick={() => addProductFromSearch(p)}
                          onMouseEnter={() => setHeroSelectedIdx(idx)}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                            <Package className="h-4 w-4 text-muted-foreground/60" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{p.name}</span>
                              {(p.schedule === 'H' || p.schedule === 'H1') && (
                                <Badge variant="destructive" size="sm">{p.schedule}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span>{p.manufacturer}</span>
                              <span className="text-border">·</span>
                              <span>{p.genericName}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold font-mono">{formatCurrency(billingType === 'wholesale' ? p.wholesaleRate : p.sellingRate)}</div>
                            <div className="text-[10px] text-muted-foreground">Stk: {p.totalStock}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Customer Selector — centre of the bar */}
            <div ref={customerRef} className="flex-1 relative">
              <button
                type="button"
                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                className={cn(
                  'flex items-center gap-2.5 w-full h-11 rounded-xl border border-border/60 bg-background px-3 text-xs transition-all shadow-sm',
                  'hover:border-primary/40'
                )}
              >
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  selectedCustomer ? "bg-primary/10 text-primary" : "bg-rose-500/10 text-rose-500"
                )}>
                  {selectedCustomer ? selectedCustomer.name[0] : '!'}
                </div>
                <span className={cn("flex-1 text-left truncate font-semibold", !selectedCustomer && "text-rose-500")}>
                  {selectedCustomer?.name ?? 'Select Customer *'}
                </span>
                {selectedCustomer && (
                  <Badge variant={customerTypeBadge(selectedCustomer.type)} size="sm" className="text-[9px] px-1.5 shrink-0">
                    {selectedCustomer.type}
                  </Badge>
                )}
                {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
                  <Badge variant="warning" size="sm" className="text-[9px] px-1.5 shrink-0 gap-0.5">
                    ⭐ {selectedCustomer.loyaltyPoints} pts
                  </Badge>
                )}
                {selectedCustomer && (
                  <button
                    type="button"
                    className="ml-1 p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground shrink-0"
                    onClick={(e) => { e.stopPropagation(); setTableView('customer-history') }}
                    title="View purchase history"
                  >
                    <History className="h-3 w-3" />
                  </button>
                )}
                <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </button>
              <AnimatePresence>
                {showCustomerDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute z-50 left-1/2 -translate-x-1/2 mt-1 w-80 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl overflow-hidden"
                  >
                    <div className="p-2 border-b border-border/40">
                      <input
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search name or phone..."
                        className="w-full h-8 rounded-md bg-muted/30 px-2.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <ScrollArea className="h-56">
                      {filteredCustomers.map((cust) => (
                        <div
                          key={cust.id}
                          className="cursor-pointer px-3 py-2.5 hover:bg-accent/60 transition-colors border-b border-border/5 last:border-0"
                          onClick={() => {
                            setSelectedCustomer(cust)
                            setCustomerSearch('')
                            setShowCustomerDropdown(false)
                            setTableView('customer-history')
                            if (cust.referredBy) {
                              const sp = salespersons.find((s) => s.name === cust.referredBy)
                              if (sp) setSelectedSalesperson(sp)
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{cust.name}</span>
                            <Badge variant={customerTypeBadge(cust.type)} size="sm" className="text-[9px]">
                              {cust.type}
                            </Badge>
                          </div>
                          {cust.phone !== '0000000000' && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{cust.phone}</div>
                          )}
                        </div>
                      ))}
                    </ScrollArea>
                    <div className="border-t border-border/40 p-2 bg-muted/20">
                      <button
                        type="button"
                        onClick={() => {
                          setAddCustomerDialogOpen(true)
                          setShowCustomerDropdown(false)
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-primary hover:bg-primary/5 transition-colors font-semibold"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add New Customer
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Add Item Button */}
            <Button
              type="button"
              onClick={addItem}
              className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/10 shrink-0 gap-2 font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Item</span>
              <kbd className="ml-1 hidden lg:inline-flex rounded border border-white/20 bg-white/10 px-1 text-[9px] font-mono text-white/70">Alt+N</kbd>
            </Button>
          </div>

          {/* ═══════════════════════════════════════════════════
              SIDEBAR HEADER (Salesperson only)
          ═══════════════════════════════════════════════════ */}
          {salespersons.length > 0 && (
            <div ref={salespersonRef} className="w-75 lg:w-80 shrink-0 flex items-center">
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setShowSalespersonDropdown(!showSalespersonDropdown)}
                  className={cn(
                    'flex items-center gap-2.5 w-full h-11 rounded-xl border border-border/60 bg-background px-3 text-xs transition-all shadow-sm',
                    'hover:border-primary/40'
                  )}
                >
                  <div className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    selectedSalesperson ? "bg-violet-500/10 text-violet-500" : "bg-muted text-muted-foreground"
                  )}>
                    {selectedSalesperson ? selectedSalesperson.name[0] : <Users className="h-3 w-3" />}
                  </div>
                  <span className={cn("flex-1 text-left truncate font-semibold", !selectedSalesperson && "text-muted-foreground/60")}>
                    {selectedSalesperson?.name ?? 'No Salesperson'}
                  </span>
                  {selectedSalesperson && (
                    <button
                      type="button"
                      className="ml-1 p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground shrink-0"
                      onClick={(e) => { e.stopPropagation(); setSelectedSalesperson(null); if (tableView === 'salesperson-customers') setTableView('products') }}
                      title="Clear salesperson"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </button>
                <AnimatePresence>
                  {showSalespersonDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.1 }}
                      className="absolute z-50 right-0 mt-1 w-72 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl overflow-hidden"
                    >
                      <div className="p-2 border-b border-border/40">
                        <input
                          value={salespersonSearch}
                          onChange={(e) => setSalespersonSearch(e.target.value)}
                          placeholder="Search salesperson..."
                          className="w-full h-8 rounded-md bg-muted/30 px-2.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <ScrollArea className="h-56">
                        <div
                          className="cursor-pointer px-3 py-2.5 hover:bg-accent/60 transition-colors border-b border-border/5 text-xs text-muted-foreground italic"
                          onClick={() => {
                            setSelectedSalesperson(null)
                            setSalespersonSearch('')
                            setShowSalespersonDropdown(false)
                            if (tableView === 'salesperson-customers') setTableView('products')
                          }}
                        >
                          No Salesperson
                        </div>
                        {salespersons
                          .filter((sp) => sp.name.toLowerCase().includes(salespersonSearch.toLowerCase()))
                          .map((sp) => (
                            <div
                              key={sp.id}
                              className={cn(
                                "cursor-pointer px-3 py-2.5 hover:bg-accent/60 transition-colors border-b border-border/5 last:border-0",
                                selectedSalesperson?.id === sp.id && "bg-violet-500/5"
                              )}
                              onClick={() => {
                                setSelectedSalesperson(sp)
                                setSalespersonSearch('')
                                setShowSalespersonDropdown(false)
                                setTableView('salesperson-customers')
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-500 text-[10px] font-bold">
                                  {sp.name[0]}
                                </div>
                                <span className="text-xs font-semibold">{sp.name}</span>
                              </div>
                            </div>
                          ))}
                      </ScrollArea>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* ── Credit Warning ── */}
        <AnimatePresence>
          {showCreditWarning && selectedCustomer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-3"
            >
              <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50/30 p-2.5 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>{selectedCustomer.name}</strong> outstanding ({formatCurrency(Number(selectedCustomer.currentOutstanding) || 0)}) exceeds credit limit ({formatCurrency(Number(selectedCustomer.creditLimit) || 0)})
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════
            MAIN TWO-PANEL LAYOUT
        ═══════════════════════════════════════════════════ */}
        <div className="flex flex-col gap-3 flex-1 min-h-0 md:flex-row">
          {/* ── LEFT: Table Area with Tabs ────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {/* Tab strip */}
            <div className="flex items-center gap-1 mb-2">
              <button
                type="button"
                onClick={() => setTableView('products')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
                  tableView === 'products'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                <Package className="h-3 w-3" />
                Products
                {activeItemCount > 0 && (
                  <span className={cn(
                    'ml-0.5 rounded-full px-1 text-[9px] font-bold',
                    tableView === 'products' ? 'bg-white/20' : 'bg-primary/10 text-primary'
                  )}>{activeItemCount}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTableView('customer-history')
                  if (!selectedCustomer) setShowCustomerDropdown(true)
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
                  tableView === 'customer-history'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                <History className="h-3 w-3" />
                {selectedCustomer ? `${selectedCustomer.name.split(' ')[0]}'s History` : 'Customer History'}
              </button>
              {selectedSalesperson && (
                <button
                  type="button"
                  onClick={() => setTableView('salesperson-customers')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
                    tableView === 'salesperson-customers'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <Users className="h-3 w-3" />
                  {selectedSalesperson.name.split(' ')[0]}'s Customers
                </button>
              )}
            </div>

            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardContent className="p-0 flex-1 flex flex-col">

                {/* ── Products Tab ── */}
                {tableView === 'products' && (
                  <>
                    <ScrollArea className="flex-1 overflow-x-auto">
                      <Table className="w-full min-w-150">
                        <TableHeader className="sticky top-0 z-10 w-full bg-muted/95 backdrop-blur-md">
                          <TableRow className="border-b border-border/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent">
                            <TableHead className="w-10 px-2 py-3 text-center h-auto items-center justify-center">#</TableHead>
                            <TableHead className="min-w-55 px-2 py-3 text-left h-auto">Product Selection</TableHead>
                            <TableHead className="w-37.5 px-1.5 py-3 text-left h-auto">Batch / Expiry</TableHead>
                            <TableHead className="w-27.5 px-1.5 py-3 text-center h-auto">Quantity</TableHead>
                            <TableHead className="w-22 px-1.5 py-3 text-right h-auto">Unit Rate</TableHead>
                            <TableHead className="w-28 px-1.5 py-3 text-center h-auto">New Rate</TableHead>
                            <TableHead className="w-16.25 px-1.5 py-3 text-center h-auto">Disc %</TableHead>
                            <TableHead className="w-12.5 px-1 py-3 text-center h-auto">GST</TableHead>
                            <TableHead className="w-27.5 px-3 py-3 text-right h-auto">Amount</TableHead>
                            <TableHead className="w-8 px-1 py-3 h-auto"></TableHead>
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
                                onUpdate={updateItem}
                                onRemove={removeItem}
                              />
                            ))}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                      {items.length === 1 && !items[0].productId && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                            <Package className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                          <p className="mt-3 text-sm font-medium text-muted-foreground/60">Start typing in the search bar to add products</p>
                          <p className="text-[11px] text-muted-foreground/40 mt-0.5">Or press Alt+N to add a manual row</p>
                        </div>
                      )}
                    </ScrollArea>
                    <div className="flex items-center justify-end border-t border-border/40 px-3 py-1.5 bg-muted/10">
                      {activeItemCount > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          {activeItemCount} item{activeItemCount !== 1 ? 's' : ''} in cart
                        </span>
                      )}
                    </div>
                  </>
                )}

                {/* ── Customer History Tab ── */}
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
                    ) : (
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
                                onClick={() => { setSelectedHistoryInvoice(inv); setHistoryInvoiceOpen(true) }}
                              >
                                <TableCell className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">{inv.invoiceNumber}</TableCell>
                                <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">
                                  {new Date(inv.date ?? inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </TableCell>
                                <TableCell className="px-3 py-2.5 text-center text-xs">{inv.items?.length ?? '—'}</TableCell>
                                <TableCell className="px-3 py-2.5 text-right font-mono text-xs font-semibold">{formatCurrency(Number(inv.grandTotal))}</TableCell>
                                <TableCell className="px-3 py-2.5 text-center">
                                  <Badge
                                    variant={inv.status === 'PAID' ? 'success' : inv.status === 'CREDIT' ? 'warning' : inv.status === 'CANCELLED' ? 'destructive' : 'secondary'}
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

                {/* ── Salesperson Customers Tab ── */}
                {tableView === 'salesperson-customers' && selectedSalesperson && (() => {
                  const spCustomers = customers.filter((c) => c.referredBy === selectedSalesperson.name)
                  return spCustomers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Users className="h-10 w-10 text-muted-foreground/20 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground/60">No customers referred by {selectedSalesperson.name}</p>
                    </div>
                  ) : (
                    <ScrollArea className="flex-1">
                      <div className="px-3 py-2 border-b border-border/40 bg-muted/20">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {spCustomers.length} customer{spCustomers.length !== 1 ? 's' : ''} — {selectedSalesperson.name}
                        </p>
                      </div>
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md">
                          <TableRow className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent border-b border-border/40">
                            <TableHead className="px-3 py-2 h-auto">Name</TableHead>
                            <TableHead className="px-3 py-2 h-auto">Phone</TableHead>
                            <TableHead className="px-3 py-2 h-auto text-center">Type</TableHead>
                            <TableHead className="px-3 py-2 h-auto text-right">Outstanding</TableHead>
                            <TableHead className="px-3 py-2 h-auto"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {spCustomers.map((cust) => (
                            <TableRow
                              key={cust.id}
                              className={cn(
                                'cursor-pointer hover:bg-accent/40 transition-colors',
                                selectedCustomer?.id === cust.id && 'bg-primary/5'
                              )}
                              onClick={() => {
                                setSelectedCustomer(cust)
                                setTableView('products')
                                toast.success(`Selected ${cust.name}`)
                              }}
                            >
                              <TableCell className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                                    {cust.name[0]}
                                  </div>
                                  <span className="text-xs font-semibold">{cust.name}</span>
                                  {selectedCustomer?.id === cust.id && (
                                    <Badge variant="success" size="sm" className="text-[8px]">Selected</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">{cust.phone !== '0000000000' ? cust.phone : '—'}</TableCell>
                              <TableCell className="px-3 py-2.5 text-center">
                                <Badge variant={customerTypeBadge(cust.type)} size="sm" className="text-[9px]">{cust.type}</Badge>
                              </TableCell>
                              <TableCell className="px-3 py-2.5 text-right font-mono text-xs">
                                {Number(cust.currentOutstanding) > 0
                                  ? <span className="text-amber-600 font-semibold">{formatCurrency(Number(cust.currentOutstanding))}</span>
                                  : <span className="text-muted-foreground/40">—</span>
                                }
                              </TableCell>
                              <TableCell className="px-3 py-2.5">
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )
                })()}

              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT: Sticky Sidebar ────────────────── */}
          <div className="w-full md:w-75 shrink-0 flex flex-col gap-3 lg:w-80 overflow-y-auto pb-2">
            {/* Summary + Grand Total */}
            <Card className="overflow-x-auto shrink-0">
              <CardContent className="p-0">
                <div className="px-4 py-3 bg-muted/30 border-b border-border/40">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 flex items-center justify-between">
                    Invoice Summary
                    <Badge variant="outline" className="h-4 px-1 text-[8px] font-mono border-muted-foreground/20">
                      {activeItemCount} items
                    </Badge>
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="space-y-1.5 text-[11px]">
                    {/* Subtotal (before discount) */}
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatCurrency(totals.subtotal)}</span>
                    </div>

                    {/* Discount row — only shown when > 0 */}
                    {totals.productDiscount > 0 && (
                      <div className="flex justify-between items-center text-rose-500 font-medium">
                        <span className="flex items-center gap-1.5">
                          Discount
                          {totals.subtotal > 0 && (
                            <Badge variant="destructive" size="sm" className="h-3.5 px-1 text-[8px]">
                              -{((totals.productDiscount / totals.subtotal) * 100).toFixed(1)}%
                            </Badge>
                          )}
                        </span>
                        <span className="font-mono">-{formatCurrency(totals.productDiscount)}</span>
                      </div>
                    )}

                    <Separator className="my-1.5 opacity-40" />

                    {/* Taxable Value */}
                    <div className="flex justify-between items-center font-medium">
                      <span className="text-muted-foreground">Taxable Value</span>
                      <span className="font-mono">{formatCurrency(totals.taxableAmount)}</span>
                    </div>

                    {/* GST split: CGST + SGST */}
                    {totals.cgst > 0 && (
                      <div className="flex justify-between items-center text-muted-foreground/70">
                        <span>CGST + SGST</span>
                        <span className="font-mono">{formatCurrency(totals.cgst + totals.sgst)}</span>
                      </div>
                    )}
                    {totals.igst > 0 && (
                      <div className="flex justify-between items-center text-muted-foreground/70">
                        <span>IGST</span>
                        <span className="font-mono">{formatCurrency(totals.igst)}</span>
                      </div>
                    )}

                    {/* Round-off — only shown when non-zero */}
                    {totals.roundOff !== 0 && (
                      <div className="flex justify-between items-center text-muted-foreground/50">
                        <span>Round Off</span>
                        <span className="font-mono">
                          {totals.roundOff > 0 ? '+' : ''}{totals.roundOff.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Credit mode indicator */}
                    {paymentMode === 'CREDIT' && (
                      <div className="flex justify-between items-center rounded-md bg-amber-50/60 dark:bg-amber-900/15 border border-amber-200/50 dark:border-amber-800/30 px-2 py-1.5 text-amber-800 dark:text-amber-300">
                        <span className="flex items-center gap-1">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Credit Sale
                        </span>
                        <span className="font-mono font-semibold">{formatCurrency(totals.grandTotal)} due</span>
                      </div>
                    )}
                  </div>

                  {/* Grand Total Highlight */}
                  <div className="relative overflow-hidden rounded-xl bg-primary/10 dark:bg-primary/20 p-4 border border-primary/10">
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/80">Net Payable</p>
                        <p className="text-2xl font-black font-mono tracking-tight text-primary">
                          {formatCurrency(totals.grandTotal)}
                        </p>
                      </div>
                      <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Receipt className="h-6 w-6" />
                      </div>
                    </div>
                    {/* Subtle decorative background detail */}
                    <div className="absolute -right-2 -bottom-2 opacity-5 scale-150 rotate-12">
                      <Receipt className="h-20 w-20" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            <Card className="shrink-0">
              <CardContent className="p-4 pt-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-col gap-1.5 mt-auto shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    className="w-full gap-2 h-10 text-sm font-semibold shadow-md shadow-primary/20 cursor-pointer"
                    onClick={submitInvoice}
                    disabled={isSubmitting || !selectedCustomer}
                  >
                    <Printer className="h-4 w-4" />
                    {isSubmitting ? 'Saving...' : 'Save & Print'}
                    <kbd className="ml-auto rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-mono">F8</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save and print invoice (F8)</TooltipContent>
              </Tooltip>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => {
                        if (!lastSavedInvoice) {
                          toast.info('Save invoice first before sharing')
                          return
                        }
                        shareInvoiceViaWhatsApp(lastSavedInvoice)
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                      <kbd className="ml-auto text-[9px] font-mono opacity-50">F9</kbd>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Share invoice via WhatsApp (F9)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={holdCurrentBill}>
                      <Save className="h-3.5 w-3.5" />
                      Draft
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save as draft (Ctrl+S)</TooltipContent>
                </Tooltip>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={holdCurrentBill}
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Hold
                      <kbd className="ml-auto text-[9px] font-mono opacity-50">F10</kbd>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Hold bill for later (F10)</TooltipContent>
                </Tooltip>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground gap-1.5 text-xs h-8 relative"
                  onClick={() => setHeldBillsOpen(true)}
                >
                  <Receipt className="h-3.5 w-3.5" />
                  Held
                  {heldBills.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                      {heldBills.length}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            KEYBOARD SHORTCUT BAR
        ═══════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-4 mt-2 py-1.5 px-1 border-t border-border/30"
        >
          <Keyboard className="h-3 w-3 text-muted-foreground/30 shrink-0" />
          {[
            { keys: 'Alt+S', label: 'Search' },
            { keys: 'Alt+N', label: 'New Row' },
            { keys: 'F8', label: 'Print' },
            { keys: 'F9', label: 'Share' },
            { keys: 'F10', label: 'Hold' },
            { keys: 'Esc', label: 'Clear Search' },
          ].map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center gap-1">
              <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 text-[9px] font-mono text-muted-foreground/60">
                {shortcut.keys}
              </kbd>
              <span className="text-[10px] text-muted-foreground/40">{shortcut.label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ─── Add Customer Dialog ─── */}
      {/* ── Held Bills Dialog ── */}
      <Dialog open={heldBillsOpen} onOpenChange={setHeldBillsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Held Bills ({heldBills.length})</DialogTitle>
            <DialogDescription>Resume a previously held bill or discard it.</DialogDescription>
          </DialogHeader>
          {heldBills.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No held bills</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {heldBills.map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{bill.customerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {bill.itemCount} item{bill.itemCount !== 1 ? 's' : ''} · {formatCurrency(bill.total)}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Held at {new Date(bill.heldAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => resumeHeldBill(bill)}>
                      Resume
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
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

      {/* ── Invoice Detail Dialog ── */}
      <Dialog open={historyInvoiceOpen} onOpenChange={setHistoryInvoiceOpen}>
        <DialogContent className="max-w-4xl! w-[92vw] max-h-[90vh] flex flex-col p-0 gap-0">
          {selectedHistoryInvoice && (
            <>
              {/* Header */}
              <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border/40">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-base font-bold">{selectedHistoryInvoice.invoiceNumber}</h2>
                    <Badge
                      variant={selectedHistoryInvoice.status === 'PAID' ? 'success' : selectedHistoryInvoice.status === 'CREDIT' ? 'warning' : selectedHistoryInvoice.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                      className="text-[10px]"
                    >
                      {selectedHistoryInvoice.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{selectedHistoryInvoice.type}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{new Date(selectedHistoryInvoice.date ?? selectedHistoryInvoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                    <span className="text-border">·</span>
                    <span className="font-medium text-foreground">{selectedHistoryInvoice.customerName}</span>
                    {selectedHistoryInvoice.billingType && (
                      <>
                        <span className="text-border">·</span>
                        <span>{selectedHistoryInvoice.billingType}</span>
                      </>
                    )}
                    {selectedHistoryInvoice.salespersonName && (
                      <>
                        <span className="text-border">·</span>
                        <span>Salesperson: <strong className="text-foreground">{selectedHistoryInvoice.salespersonName}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Body — scrollable */}
              <div className="flex-1 overflow-y-auto">
                {/* Items table */}
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md">
                    <TableRow className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent border-b border-border/40">
                      <TableHead className="px-4 py-2.5 h-auto w-8 text-center">#</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto">Product</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto">Batch</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto">Expiry</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto text-center">Qty</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto text-right">MRP</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto text-right">Rate</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto text-center">Disc%</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto text-center">GST%</TableHead>
                      <TableHead className="px-4 py-2.5 h-auto text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedHistoryInvoice.items ?? []).map((item, idx) => (
                      <TableRow key={item.id} className="hover:bg-accent/30 border-b border-border/20">
                        <TableCell className="px-4 py-3 text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="text-xs font-semibold">{item.productName}</div>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{item.batchNumber}</TableCell>
                        <TableCell className="px-4 py-3 text-[11px] text-muted-foreground">
                          {item.expiryDate ? formatExpiryShort(item.expiryDate) : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center text-xs font-semibold">{item.quantity}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{formatCurrency(Number(item.mrp))}</TableCell>
                        <TableCell className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(Number(item.rate))}</TableCell>
                        <TableCell className="px-4 py-3 text-center text-xs">{Number(item.discountPercent) > 0 ? <span className="text-rose-500 font-semibold">{item.discountPercent}%</span> : <span className="text-muted-foreground/40">—</span>}</TableCell>
                        <TableCell className="px-4 py-3 text-center text-xs text-muted-foreground">{item.gstPercent}%</TableCell>
                        <TableCell className="px-4 py-3 text-right font-mono text-xs font-bold">{formatCurrency(Number(item.amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Footer — totals + actions */}
              <div className="border-t border-border/40 px-6 py-4 bg-muted/20">
                <div className="flex items-end justify-between gap-6">
                  {/* Left: payment info */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Payment Mode: <strong className="text-foreground">{selectedHistoryInvoice.paymentMode}</strong></div>
                    {Number(selectedHistoryInvoice.amountPaid) > 0 && (
                      <div>Amount Paid: <strong className="text-foreground font-mono">{formatCurrency(Number(selectedHistoryInvoice.amountPaid))}</strong></div>
                    )}
                    {Number(selectedHistoryInvoice.changeReturned) > 0 && (
                      <div>Change Returned: <strong className="text-foreground font-mono">{formatCurrency(Number(selectedHistoryInvoice.changeReturned))}</strong></div>
                    )}
                  </div>

                  {/* Right: totals breakdown */}
                  <div className="space-y-1 text-xs min-w-52">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatCurrency(Number(selectedHistoryInvoice.subtotal))}</span>
                    </div>
                    {Number(selectedHistoryInvoice.productDiscount) > 0 && (
                      <div className="flex justify-between text-rose-500">
                        <span>Discount</span>
                        <span className="font-mono">-{formatCurrency(Number(selectedHistoryInvoice.productDiscount))}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxable Value</span>
                      <span className="font-mono">{formatCurrency(Number(selectedHistoryInvoice.taxableAmount))}</span>
                    </div>
                    {(Number(selectedHistoryInvoice.cgst) > 0 || Number(selectedHistoryInvoice.sgst) > 0) && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>CGST + SGST</span>
                        <span className="font-mono">{formatCurrency(Number(selectedHistoryInvoice.cgst) + Number(selectedHistoryInvoice.sgst))}</span>
                      </div>
                    )}
                    {Number(selectedHistoryInvoice.roundOff) !== 0 && (
                      <div className="flex justify-between text-muted-foreground/50">
                        <span>Round Off</span>
                        <span className="font-mono">{Number(selectedHistoryInvoice.roundOff) > 0 ? '+' : ''}{Number(selectedHistoryInvoice.roundOff).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-border/40">
                      <span className="font-bold text-sm">Grand Total</span>
                      <span className="font-mono font-black text-base text-primary">{formatCurrency(Number(selectedHistoryInvoice.grandTotal))}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setHistoryInvoiceOpen(false)}>
                    Close
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
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
                      setHistoryInvoiceOpen(false)
                      setTableView('products')
                      toast.success(`${repurchaseItems.length} item${repurchaseItems.length !== 1 ? 's' : ''} loaded from previous invoice`)
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-purchase
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addCustomerDialogOpen} onOpenChange={(open) => {
        if (!open) { customerForm.reset(); setDocFile(null); setDocPreview(null) }
        setAddCustomerDialogOpen(open)
      }}>
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-xl md:max-w-2xl md:w-full md:h-auto! md:max-h-[85vh]! md:overflow-hidden! md:flex! md:flex-col!">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0">
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>All fields are required except document and notes.</DialogDescription>
          </DialogHeader>

          <form onSubmit={customerForm.handleSubmit(handleAddCustomer)} className="flex flex-col flex-1 min-h-0 relative">
            <div className="flex-1 overflow-y-auto px-5 py-4 pb-20 space-y-3">

              {/* Row 1: Name + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name *</Label>
                  <Input {...customerForm.register('name')} placeholder="Customer name" error={!!customerForm.formState.errors.name} />
                  {customerForm.formState.errors.name && <p className="text-xs text-rose-500">{customerForm.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phone *</Label>
                  <Input {...customerForm.register('phone')} placeholder="10-digit number" inputMode="numeric" error={!!customerForm.formState.errors.phone} />
                  {customerForm.formState.errors.phone && <p className="text-xs text-rose-500">{customerForm.formState.errors.phone.message}</p>}
                </div>
              </div>

              {/* Row 2: Type + Email */}
              <div className="grid grid-cols-2 gap-3">
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
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email *</Label>
                  <Input {...customerForm.register('email')} placeholder="email@example.com" type="email" error={!!customerForm.formState.errors.email} />
                  {customerForm.formState.errors.email && <p className="text-xs text-rose-500">{customerForm.formState.errors.email.message}</p>}
                </div>
              </div>

              {/* Row 3: GSTIN + DL (only for WHOLESALE / DOCTOR) */}
              {(customerForm.watch('type') === 'WHOLESALE' || customerForm.watch('type') === 'DOCTOR') && (
                <div className="grid grid-cols-2 gap-3">
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

              {/* Row 4: Referred By (half width) */}
              <div className="grid grid-cols-2 gap-3">
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
              </div>

              {/* Row 5: Address */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address *</Label>
                <Textarea {...customerForm.register('address')} placeholder="Full address" rows={2} />
                {customerForm.formState.errors.address && <p className="text-xs text-rose-500">{customerForm.formState.errors.address.message}</p>}
              </div>

              {/* Row 6: Document / ID Proof */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Document / ID Proof</Label>
                {docPreview ? (
                  <div className="relative w-full rounded-xl border border-border/50 overflow-hidden">
                    <img src={docPreview} alt="Document preview" className="w-full max-h-36 object-cover" />
                    <button type="button" onClick={() => { setDocFile(null); setDocPreview(null) }}
                      className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : docFile ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{docFile.name}</span>
                    <button type="button" onClick={() => setDocFile(null)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-6">
                    <div className="flex h-12 w-16 items-center justify-center rounded-lg border-2 border-border/40 bg-muted/30">
                      <FileImage className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                        <Upload className="h-3.5 w-3.5 text-amber-500" />
                        Upload
                        <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => handleDocFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <button type="button"
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                        <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                        Scan
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 7: Notes */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea {...customerForm.register('notes')} placeholder="Additional notes (optional)" rows={3} />
              </div>

            </div>

            {/* Sticky footer */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-3 px-5 py-3 bg-background/80 backdrop-blur-sm border-t border-border/40">
              <Button type="button" variant="outline" onClick={() => { customerForm.reset(); setDocFile(null); setDocPreview(null); setAddCustomerDialogOpen(false) }}>
                Cancel
              </Button>
              <Button type="submit" disabled={customerForm.formState.isSubmitting}>
                {customerForm.formState.isSubmitting ? 'Saving...' : 'Save Customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
