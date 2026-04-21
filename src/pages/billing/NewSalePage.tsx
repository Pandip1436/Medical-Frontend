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
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
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
  name: z.string().min(1, 'Customer name is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  type: z.enum(['walk-in', 'regular', 'hospital', 'wholesale', 'doctor']),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  address: z.string().optional(),
  creditLimit: z.coerce.number().min(0, 'Must be 0 or more').default(0),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  notes: z.string().optional(),
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
 
      {/* Rate */}
      <TableCell className="w-25 px-1.5 py-1">
        <div className="relative group/rate">
          <input
            type="number"
            step={0.01}
            value={item.rate || ''}
            onChange={(e) => handleRateChange(parseFloat(e.target.value) || 0)}
            className={cn(
              'w-full h-8 rounded-lg border border-transparent bg-transparent text-xs text-right font-bold font-mono px-2 transition-all',
              'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-muted/30 focus:border-primary/20',
              'disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
            )}
            disabled={!item.productId}
          />
          {(Number(item.mrp) || 0) > 0 && Number(item.mrp) !== Number(item.rate) && (
            <div className="absolute -bottom-3.5 right-2 text-[9px] text-muted-foreground/40 font-bold font-mono line-through">
              MRP: {(Number(item.mrp) || 0).toFixed(0)}
            </div>
          )}
        </div>
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
          className="rounded-md p-1 text-muted-foreground/30 hover:bg-rose-500/10 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Last 4 Digits
            </label>
            <Input
              maxLength={4}
              value={details.cardLast4}
              onChange={(e) =>
                onDetailsChange({ cardLast4: e.target.value.replace(/\D/g, '') })
              }
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
      )}

      {/* UPI */}
      {mode === 'UPI' && (
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
      )}

      {/* Credit */}
      {mode === 'CREDIT' && (
        <div className="space-y-2">
          {customer && customer.type !== 'WALK_IN' && (
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
          setItems(inv.items.map((it: any) => ({
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
      }).catch(() => {/* ignore if not found */})
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
      doctorRef: string
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
      snapshot: { invoiceType, billingType, doctorRef, selectedCustomer, items, paymentMode, paymentDetails },
    }
    saveHeldBills([...heldBills, bill])
    // Clear current bill
    setItems([createEmptyItem()])
    setDoctorRef('')
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
    setDoctorRef(s.doctorRef)
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

  // ── Doctors (fetched from API) ────────────────────────────
  const [doctors, setDoctors] = useState<{ id: string; name: string; specialization: string }[]>([])

  const fetchDoctorsCb = useCallback(() => {
    api.get('/doctors').then((res) => {
      setDoctors(Array.isArray(res.data) ? res.data : [])
    }).catch(() => {
      setDoctors([])
      toast.error('Could not load doctors list')
    })
  }, [])

  useEffect(() => { fetchDoctorsCb() }, [fetchDoctorsCb])
  useBranchRefresh(fetchDoctorsCb)

  useEffect(() => {
    api.get('/salespersons').then((res) => {
      setSalespersons(Array.isArray(res.data) ? res.data.filter((s: any) => s.isActive).map((s: any) => ({ id: s.id, name: s.name })) : [])
    }).catch(() => setSalespersons([]))
  }, [])

  // ── State ────────────────────────────────────────────────
  const [invoiceType, setInvoiceType] = useState<'invoice' | 'quotation'>('invoice')
  const [billingType, setBillingType] = useState<'retail' | 'wholesale'>('retail')
  const [doctorRef, setDoctorRef] = useState('')
  const [doctorSearch, setDoctorSearch] = useState('')
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false)
  const [selectedSalesperson, setSelectedSalesperson] = useState<{ id: string; name: string } | null>(null)
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false)

  const [items, setItems] = useState<BillingItem[]>([createEmptyItem()])
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH')
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({
    amountReceived: 0,
    cardLast4: '',
    cardRef: '',
    upiRef: '',
    creditDueDate: '',
    splits: [],
  })

  // ── Refs ──────────────────────────────────────────────────
  const heroSearchRef = useRef<HTMLInputElement>(null)
  const doctorRef2 = useRef<HTMLDivElement>(null)
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
      if (doctorRef2.current && !doctorRef2.current.contains(e.target as Node)) {
        setShowDoctorDropdown(false)
      }
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
  const filteredDoctors = useMemo(() => {
    const labels = doctors.map((d) => `${d.name} (${d.specialization})`)
    if (!doctorSearch) return labels
    const q = doctorSearch.toLowerCase()
    return labels.filter((d) => d.toLowerCase().includes(q))
  }, [doctors, doctorSearch])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers
    const q = customerSearch.toLowerCase()
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.type.includes(q)
    )
  }, [customerSearch])

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

    if (showCreditWarning) {
      toast.error('Cannot process: Credit limit exceeded')
      return;
    }

    setIsSubmitting(true)
    try {
      const payload: any = {
        type: invoiceType.toUpperCase(),
        billingType: billingType.toUpperCase(),
        customerName: selectedCustomer ? selectedCustomer.name : 'Walk-in Customer',
        doctorName: doctorRef || null,
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
          : paymentMode === 'CREDIT' ? 0          // Nothing collected upfront — outstanding tracked separately
          : paymentMode === 'SPLIT' ? (paymentDetails.splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0))
          : Number(totals.grandTotal) || 0,       // CARD / UPI — fully paid
        changeReturned: invoiceType === 'quotation' ? 0 : Number(paymentMode === 'CASH' ? Math.max(0, paymentDetails.amountReceived - totals.grandTotal) : 0),
        status: invoiceType === 'quotation' ? 'DRAFT' : paymentMode === 'CREDIT' ? 'CREDIT' : 'PAID',

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

      if (selectedCustomer?.id) {
        payload.customerId = selectedCustomer.id;
      }
      if (activeBranchId) {
        payload.branchId = activeBranchId;
      }
      if (selectedSalesperson) {
        payload.salespersonId = selectedSalesperson.id;
        payload.salespersonName = selectedSalesperson.name;
      }

      const res = await api.post('/billing', payload)
      const savedInvoice = res.data
      setLastSavedInvoice(savedInvoice)

      if (invoiceType === 'quotation') {
        toast.success(`Quotation ${savedInvoice.invoiceNumber} saved successfully`)
        navigate('/billing/quotations')
      } else {
        // Print immediately after save
        printInvoicePdf(savedInvoice)
        toast.success('Invoice saved and sent to printer')
        // refetch to update stock
        fetchMasterData()
        // Navigate to sales list
        navigate('/billing/sales')
      }

    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Failed to generate invoice. Please check stock limits.'
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
    const map: Record<string, 'info' | 'purple' | 'success' | 'warning' | 'secondary'> = {
      hospital: 'info',
      wholesale: 'purple',
      regular: 'success',
      doctor: 'warning',
      'walk-in': 'secondary',
    }
    return map[type] ?? 'secondary'
  }

  // ── Customer Form ──────────────────────────────────────
  const customerForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      phone: '',
      type: 'regular',
      email: '',
      address: '',
      creditLimit: 0,
      gstin: '',
      dlNumber: '',
      notes: '',
    },
  })

  const handleAddCustomer = async (values: CustomerFormValues) => {
    try {
      // Transform type to uppercase to match backend Enum (e.g. 'walk-in' -> 'WALK_IN')
      const payload = {
        ...values,
        type: values.type.toUpperCase().replace('-', '_')
      }
      const res = await api.post('/customers', payload)
      toast.success(`Customer "${values.name}" added successfully`)
      await fetchMasterData() // Refresh list

      // Auto select the new customer
      const newlyCreated = res.data
      if (newlyCreated) {
        setSelectedCustomer(newlyCreated)
      }

      customerForm.reset()
      setAddCustomerDialogOpen(false)
    } catch (error: any) {
      console.error(error)
      toast.error(error?.response?.data?.message || "Failed to add customer")
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
            <PillToggle
              options={[
                { label: 'Retail', value: 'retail' as const },
                { label: 'Wholesale', value: 'wholesale' as const },
              ]}
              value={billingType}
              onChange={setBillingType}
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
            {/* Hero Product Search (Reduced width) */}
            <div className="w-[45%] lg:w-[40%] relative">
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

            {/* Doctor Selector (Increased width) */}
            <div ref={doctorRef2} className="flex-1 min-w-0 relative h-full">
              <button
                type="button"
                onClick={() => setShowDoctorDropdown(!showDoctorDropdown)}
                className={cn(
                  'flex items-center gap-1.5 w-full h-full rounded-xl border border-border/60 bg-background px-3 text-xs transition-all',
                  'hover:border-primary/40',
                  doctorRef ? 'text-foreground' : 'text-muted-foreground/60'
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mr-0.5 shrink-0">Dr</span>
                <span className="flex-1 text-left truncate font-medium">{doctorRef || 'Select Doctor'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </button>
              <AnimatePresence>
                {showDoctorDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute z-50 left-0 mt-1 w-full min-w-55 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl overflow-hidden"
                  >
                    <div className="p-2 border-b border-border/40">
                      <input
                        value={doctorSearch}
                        onChange={(e) => setDoctorSearch(e.target.value)}
                        placeholder="Search doctor..."
                        className="w-full h-8 rounded-md bg-muted/30 px-2.5 text-xs placeholder:text-muted-foreground/40 focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                      <div
                        className="cursor-pointer px-3 py-2 text-xs text-muted-foreground hover:bg-accent/60 transition-colors"
                        onClick={() => { setDoctorRef(''); setDoctorSearch(''); setShowDoctorDropdown(false) }}
                      >
                        No doctor
                      </div>
                      {filteredDoctors.map((doc) => (
                        <div
                          key={doc}
                          className="cursor-pointer px-3 py-2 text-xs hover:bg-accent/60 transition-colors border-t border-border/5"
                          onClick={() => { setDoctorRef(doc); setDoctorSearch(''); setShowDoctorDropdown(false) }}
                        >
                          {doc}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Salesperson Selector */}
            {salespersons.length > 0 && (
              <div className="flex-1 min-w-0 relative h-full">
                <select
                  value={selectedSalesperson?.id ?? ''}
                  onChange={(e) => {
                    const sp = salespersons.find((s) => s.id === e.target.value)
                    setSelectedSalesperson(sp ?? null)
                  }}
                  className="flex items-center gap-1.5 w-full h-full rounded-xl border border-border/60 bg-background px-3 text-xs text-muted-foreground/80 focus:outline-none focus:border-primary/40 appearance-none cursor-pointer"
                >
                  <option value="">No Salesperson</option>
                  {salespersons.map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Add Item Button (Aligned to end of table) */}
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
              SIDEBAR HEADER (Aligned with Grand Total Panel)
          ═══════════════════════════════════════════════════ */}
          <div className="w-75 lg:w-80 shrink-0">
            {/* Customer (Full width of sidebar) */}
            <div ref={customerRef} className="relative h-full">
              <button
                type="button"
                onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                className={cn(
                  'flex items-center gap-2.5 w-full h-full rounded-xl border border-border/60 bg-background px-3 text-xs transition-all shadow-sm',
                  'hover:border-primary/40'
                )}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {(selectedCustomer?.name ?? 'W')[0]}
                </div>
                <span className="flex-1 text-left truncate font-semibold">
                  {selectedCustomer?.name ?? 'Walk-in Customer'}
                </span>
                {selectedCustomer && selectedCustomer.type !== 'WALK_IN' && (
                  <Badge variant={customerTypeBadge(selectedCustomer.type)} size="sm" className="text-[9px] px-1.5 shrink-0">
                    {selectedCustomer.type}
                  </Badge>
                )}
                {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
                  <Badge variant="warning" size="sm" className="text-[9px] px-1.5 shrink-0 gap-0.5">
                    ⭐ {selectedCustomer.loyaltyPoints} pts
                  </Badge>
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
                    className="absolute z-50 right-0 mt-1 w-72 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl overflow-hidden"
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
                    <ScrollArea className="max-h-56">
                      {filteredCustomers.map((cust) => (
                        <div
                          key={cust.id}
                          className="cursor-pointer px-3 py-2.5 hover:bg-accent/60 transition-colors border-b border-border/5 last:border-0"
                          onClick={() => {
                            setSelectedCustomer(cust)
                            setCustomerSearch('')
                            setShowCustomerDropdown(false)
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
          </div>
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
          {/* ── LEFT: Items Table ────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardContent className="p-0 flex-1 flex flex-col">
                <ScrollArea className="flex-1 overflow-x-auto">
                  <Table className="w-full min-w-150">
                    <TableHeader className="sticky top-0 z-10 w-full bg-muted/95 backdrop-blur-md">
                      <TableRow className="border-b border-border/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent">
                        <TableHead className="w-10 px-2 py-3 text-center h-auto items-center justify-center">#</TableHead>
                        <TableHead className="min-w-55 px-2 py-3 text-left h-auto">Product Selection</TableHead>
                        <TableHead className="w-37.5 px-1.5 py-3 text-left h-auto">Batch / Expiry</TableHead>
                        <TableHead className="w-27.5 px-1.5 py-3 text-center h-auto">Quantity</TableHead>
                        <TableHead className="w-25 px-1.5 py-3 text-right h-auto">Unit Rate</TableHead>
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

                  {/* Empty state */}
                  {items.length === 1 && !items[0].productId && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                        <Package className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-muted-foreground/60">
                        Start typing in the search bar to add products
                      </p>
                      <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                        Or press Alt+N to add a manual row
                      </p>
                    </div>
                  )}
                </ScrollArea>

                {/* item count bar */}
                <div className="flex items-center justify-end border-t border-border/40 px-3 py-1.5 bg-muted/10">
                  {activeItemCount > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {activeItemCount} item{activeItemCount !== 1 ? 's' : ''} in cart
                    </span>
                  )}
                </div>
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
                    disabled={isSubmitting}
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
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
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

      <Dialog open={addCustomerDialogOpen} onOpenChange={setAddCustomerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>Create a new customer profile for billing.</DialogDescription>
          </DialogHeader>

          <form onSubmit={customerForm.handleSubmit(handleAddCustomer)} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  placeholder="e.g. John Doe"
                  {...customerForm.register('name')}
                />
                {customerForm.formState.errors.name && (
                  <p className="text-[10px] text-destructive font-medium">{customerForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
                <Input
                  id="phone"
                  placeholder="10-digit mobile"
                  {...customerForm.register('phone')}
                />
                {customerForm.formState.errors.phone && (
                  <p className="text-[10px] text-destructive font-medium">{customerForm.formState.errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Type <span className="text-red-500">*</span></Label>
                <Controller
                  control={customerForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="hospital">Hospital</SelectItem>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="WALK_IN">Walk-in</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="creditLimit">Credit Limit (₹)</Label>
                <Input
                  id="creditLimit"
                  type="number"
                  placeholder="0.00"
                  {...customerForm.register('creditLimit')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Shipping/Billing address"
                className="resize-none h-20"
                {...customerForm.register('address')}
              />
            </div>

            <DialogFooter className="pt-4 border-t gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddCustomerDialogOpen(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={customerForm.formState.isSubmitting}
                className="cursor-pointer"
              >
                {customerForm.formState.isSubmitting ? 'Creating...' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
