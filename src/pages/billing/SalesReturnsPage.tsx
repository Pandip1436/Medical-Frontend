import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Check,
  RotateCcw,
  FileText,
  Package,
  Receipt,
  AlertCircle,
  Minus,
  Plus,
  ArrowLeft,
  Printer,
  Download,
  ShieldAlert,
  Pill,
  BadgeAlert,
  UserX,
  HelpCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { mockInvoices } from '@/data/mock'
import { cn, formatCurrency, formatDate, generateInvoiceNumber } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import type { Invoice, InvoiceItem } from '@/types'

// ─────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────

const RETURN_REASONS = [
  'Expired',
  'Damaged',
  'Wrong Product',
  'Customer Request',
  'Side Effects',
  'Other',
] as const

type ReturnReason = (typeof RETURN_REASONS)[number]

interface ReturnItemState {
  itemId: string
  selected: boolean
  returnQty: number
  maxQty: number
  reason: ReturnReason | ''
  customReason: string
  item: InvoiceItem
}

const reasonIcons: Record<string, typeof AlertCircle> = {
  Expired: ShieldAlert,
  Damaged: BadgeAlert,
  'Wrong Product': Package,
  'Customer Request': UserX,
  'Side Effects': Pill,
  Other: HelpCircle,
}

const reasonVariantMap: Record<string, 'destructive' | 'warning' | 'info' | 'purple' | 'secondary'> = {
  Expired: 'destructive',
  Damaged: 'destructive',
  'Wrong Product': 'warning',
  'Customer Request': 'info',
  'Side Effects': 'purple',
  Other: 'secondary',
}

const STEPS = [
  { number: 1, label: 'Select Invoice', icon: FileText },
  { number: 2, label: 'Return Items', icon: Package },
  { number: 3, label: 'Credit Note', icon: Receipt },
] as const

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function SalesReturnsPage() {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1)
  const [direction, setDirection] = useState(1)

  // Step 1
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // Step 2
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])

  // Step 3
  const [settlementOption, setSettlementOption] = useState<string>('refund')

  const creditNoteNumber = useMemo(() => generateInvoiceNumber('CN', 12), [])

  // ── Navigation ──
  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1)
    setCurrentStep(step)
  }

  // ── Step 1: Search ──
  const matchingInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return []
    const q = invoiceSearch.toLowerCase()
    return mockInvoices
      .filter(
        (inv) =>
          inv.type === 'invoice' &&
          inv.status !== 'returned' &&
          inv.status !== 'cancelled' &&
          inv.status !== 'draft' &&
          (inv.invoiceNumber.toLowerCase().includes(q) ||
            inv.customerName.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [invoiceSearch])

  const handleSelectInvoice = (inv: Invoice) => {
    setSelectedInvoice(inv)
    setReturnItems(
      inv.items.map((item) => ({
        itemId: item.id,
        selected: false,
        returnQty: 0,
        maxQty: item.quantity,
        reason: '',
        customReason: '',
        item,
      }))
    )
  }

  // ── Step 2: Items ──
  const toggleReturnItem = (itemId: string) => {
    setReturnItems((prev) =>
      prev.map((ri) =>
        ri.itemId === itemId
          ? {
              ...ri,
              selected: !ri.selected,
              returnQty: !ri.selected ? ri.maxQty : 0,
              reason: !ri.selected ? ri.reason : '',
              customReason: !ri.selected ? ri.customReason : '',
            }
          : ri
      )
    )
  }

  const updateReturnQty = (itemId: string, qty: number) => {
    setReturnItems((prev) =>
      prev.map((ri) =>
        ri.itemId === itemId
          ? { ...ri, returnQty: Math.min(Math.max(0, qty), ri.maxQty) }
          : ri
      )
    )
  }

  const updateReturnReason = (itemId: string, reason: ReturnReason) => {
    setReturnItems((prev) =>
      prev.map((ri) =>
        ri.itemId === itemId ? { ...ri, reason, customReason: reason === 'Other' ? ri.customReason : '' } : ri
      )
    )
  }

  const updateCustomReason = (itemId: string, text: string) => {
    setReturnItems((prev) =>
      prev.map((ri) => (ri.itemId === itemId ? { ...ri, customReason: text } : ri))
    )
  }

  const selectedReturnItems = returnItems.filter((ri) => ri.selected && ri.returnQty > 0)
  const canProceedToStep3 = selectedReturnItems.length > 0 && selectedReturnItems.every((ri) => ri.reason !== '')

  // ── Step 3: Calculations ──
  const creditSummary = useMemo(() => {
    let subtotal = 0
    let totalGst = 0
    for (const ri of selectedReturnItems) {
      const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
      const lineAmount = lineRate * ri.returnQty
      const gstAmount = lineAmount * (ri.item.gstPercent / 100)
      subtotal += lineAmount
      totalGst += gstAmount
    }
    return { subtotal, gstReversal: totalGst, total: subtotal + totalGst }
  }, [selectedReturnItems])

  const handleConfirmReturn = () => {
    toast.success(`Credit Note ${creditNoteNumber} created successfully!`, {
      description: `${formatCurrency(creditSummary.total)} will be processed as ${
        settlementOption === 'refund'
          ? 'a refund to the customer'
          : settlementOption === 'adjust'
          ? 'adjustment against outstanding balance'
          : 'store credit'
      }.`,
    })
    setCurrentStep(1)
    setDirection(-1)
    setSelectedInvoice(null)
    setReturnItems([])
    setInvoiceSearch('')
    setSettlementOption('refund')
  }

  const fmtInvoiceNum = (inv: Invoice) => {
    const seq = inv.invoiceNumber.split('/').pop() || '00000'
    return `HS/25-26/INV/${seq.padStart(5, '0')}`
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ── Fixed Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/billing/sales')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sales Returns</h1>
            <p className="text-[11px] text-muted-foreground">Create credit notes for returned goods</p>
          </div>
        </div>

        {/* ── Step Indicator (compact horizontal) ── */}
        <div className="flex items-center gap-1">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.number
            const isCompleted = currentStep > step.number
            const StepIcon = step.icon
            return (
              <div key={step.number} className="flex items-center">
                <button
                  onClick={() => {
                    if (isCompleted) goToStep(step.number)
                  }}
                  disabled={!isCompleted && !isActive}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                    isActive && 'bg-primary text-primary-foreground shadow-sm',
                    isCompleted && 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20',
                    !isActive && !isCompleted && 'text-muted-foreground'
                  )}
                >
                  <div className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    isActive && 'bg-primary-foreground/20',
                    isCompleted && 'bg-primary/20',
                    !isActive && !isCompleted && 'bg-muted'
                  )}>
                    {isCompleted ? <Check className="h-3 w-3" /> : step.number}
                  </div>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn(
                    'mx-1 h-px w-6',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )} />
                )}
              </div>
            )
          })}
        </div>

        <Badge variant="info" size="sm" dot>
          Step {currentStep}/3
        </Badge>
      </div>

      {/* ── Main Content (fills viewport) ── */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 1: Select Invoice — Two-Pane Layout               */}
          {/* ═══════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="absolute inset-0 flex"
            >
              {/* Left: Search & Invoice List */}
              <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[55%]">
                <DataTableFilterBar
                  searchQuery={invoiceSearch}
                  onSearchChange={setInvoiceSearch}
                  searchPlaceholder="Search by invoice number or customer name..."
                  resultsCount={matchingInvoices.length}
                />

                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-2">
                    {!invoiceSearch.trim() && (
                      <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                          <Search className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Search for an invoice</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                            Type invoice number or customer name to begin
                          </p>
                        </div>
                      </div>
                    )}

                    {invoiceSearch.trim() && matchingInvoices.length === 0 && (
                      <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                          <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          No eligible invoices for &ldquo;{invoiceSearch}&rdquo;
                        </p>
                      </div>
                    )}

                    {matchingInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => handleSelectInvoice(inv)}
                        className={cn(
                          'group flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 transition-all',
                          selectedInvoice?.id === inv.id
                            ? 'bg-primary/8 ring-1 ring-primary/20 dark:bg-primary/10'
                            : 'hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                            selectedInvoice?.id === inv.id
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/60 bg-muted/30 group-hover:border-border'
                          )}>
                            {selectedInvoice?.id === inv.id ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-mono text-sm font-medium">{fmtInvoiceNum(inv)}</p>
                            <p className="text-xs text-muted-foreground">{inv.customerName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold">{formatCurrency(inv.grandTotal)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(inv.date)} &middot; {inv.items.length} items
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Invoice Details Preview */}
              <div className="hidden flex-col overflow-hidden lg:flex lg:w-[45%]">
                {!selectedInvoice ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 dark:bg-muted/15">
                      <Receipt className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Select an invoice to see details</p>
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    {/* Invoice header */}
                    <div className="shrink-0 border-b border-border/40 p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Selected Invoice
                          </p>
                          <p className="mt-1 font-mono text-lg font-bold">{fmtInvoiceNum(selectedInvoice)}</p>
                        </div>
                        <Badge variant="success" size="sm" dot>
                          {selectedInvoice.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                          <p className="mt-0.5 text-sm font-medium">{selectedInvoice.customerName}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</p>
                          <p className="mt-0.5 text-sm">{formatDate(selectedInvoice.date)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                          <p className="mt-0.5 font-mono text-sm font-bold">{formatCurrency(selectedInvoice.grandTotal)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Items list */}
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Items ({selectedInvoice.items.length})
                        </p>
                        <div className="space-y-2">
                          {selectedInvoice.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 p-3 dark:bg-muted/10">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{item.productName}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span>Batch: {item.batchNumber}</span>
                                  <span>&middot;</span>
                                  <span>Qty: {item.quantity}</span>
                                  <span>&middot;</span>
                                  <span>GST: {item.gstPercent}%</span>
                                </div>
                              </div>
                              <p className="font-mono text-sm font-semibold ml-4">{formatCurrency(item.amount)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </ScrollArea>

                    {/* Fixed footer with action */}
                    <div className="shrink-0 border-t border-border/40 bg-muted/10 p-4">
                      <Button className="w-full" onClick={() => goToStep(2)}>
                        Continue to Select Items
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile: Continue button when invoice selected (shown on small screens) */}
              {selectedInvoice && (
                <div className="fixed bottom-0 left-0 right-0 border-t border-border/40 bg-background p-4 lg:hidden">
                  <Button className="w-full" onClick={() => goToStep(2)}>
                    Continue with {fmtInvoiceNum(selectedInvoice)}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 2: Select Return Items — Full Width Table          */}
          {/* ═══════════════════════════════════════════════════════ */}
          {currentStep === 2 && selectedInvoice && (
            <motion.div
              key="step2"
              custom={direction}
              initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="absolute inset-0 flex flex-col"
            >
              {/* Sub-header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-6 py-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    Returning items from
                  </p>
                  <Badge variant="outline" size="lg" className="font-mono">
                    {fmtInvoiceNum(selectedInvoice)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">&middot;</span>
                  <span className="text-sm font-medium">{selectedInvoice.customerName}</span>
                </div>
                {selectedReturnItems.length > 0 && (
                  <Badge variant="info" dot size="sm">
                    {selectedReturnItems.length} item{selectedReturnItems.length !== 1 ? 's' : ''} selected
                  </Badge>
                )}
              </div>

              {/* Items — scrollable */}
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-6 space-y-3">
                  {returnItems.map((ri) => {
                    const ReasonIcon = ri.reason ? reasonIcons[ri.reason] || HelpCircle : HelpCircle
                    return (
                      <div
                        key={ri.itemId}
                        className={cn(
                          'rounded-xl border transition-all',
                          ri.selected
                            ? 'border-primary/30 bg-primary/[0.02] shadow-sm dark:bg-primary/[0.04]'
                            : 'border-border/40 hover:border-border/60'
                        )}
                      >
                        <div className="flex items-start gap-4 p-4">
                          {/* Checkbox */}
                          <Checkbox
                            checked={ri.selected}
                            onCheckedChange={() => toggleReturnItem(ri.itemId)}
                            className="mt-1"
                          />

                          {/* Product info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold">{ri.item.productName}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                  <span>Batch: <span className="font-mono">{ri.item.batchNumber}</span></span>
                                  <span>Expiry: {ri.item.expiryDate ? formatDate(ri.item.expiryDate) : 'N/A'}</span>
                                  <span>MRP: {formatCurrency(ri.item.mrp)}</span>
                                  <span>Rate: {formatCurrency(ri.item.rate)}</span>
                                  <span>GST: {ri.item.gstPercent}%</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sold Qty</p>
                                <p className="text-lg font-bold tabular-nums">{ri.item.quantity}</p>
                              </div>
                            </div>

                            {/* Return controls — only when selected */}
                            {ri.selected && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                                className="mt-3 pt-3 border-t border-border/30"
                              >
                                <div className="flex flex-wrap items-end gap-4">
                                  {/* Return Qty */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Return Qty
                                    </Label>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => updateReturnQty(ri.itemId, ri.returnQty - 1)}
                                        disabled={ri.returnQty <= 1}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={ri.maxQty}
                                        value={ri.returnQty}
                                        onChange={(e) => updateReturnQty(ri.itemId, parseInt(e.target.value) || 0)}
                                        className="h-8 w-16 text-center font-mono font-bold"
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => updateReturnQty(ri.itemId, ri.returnQty + 1)}
                                        disabled={ri.returnQty >= ri.maxQty}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                      <span className="text-[11px] text-muted-foreground ml-1">/ {ri.maxQty}</span>
                                    </div>
                                  </div>

                                  {/* Reason */}
                                  <div className="space-y-1 flex-1 min-w-[180px]">
                                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Reason
                                    </Label>
                                    <Select
                                      value={ri.reason}
                                      onValueChange={(val) => updateReturnReason(ri.itemId, val as ReturnReason)}
                                    >
                                      <SelectTrigger className="h-8">
                                        <SelectValue placeholder="Select reason..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {RETURN_REASONS.map((reason) => {
                                          const Icon = reasonIcons[reason]
                                          return (
                                            <SelectItem key={reason} value={reason}>
                                              <span className="flex items-center gap-2">
                                                <Icon className="h-3.5 w-3.5" />
                                                {reason}
                                              </span>
                                            </SelectItem>
                                          )
                                        })}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {ri.reason === 'Other' && (
                                    <div className="space-y-1 flex-1 min-w-[180px]">
                                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Specify
                                      </Label>
                                      <Input
                                        placeholder="Enter reason..."
                                        value={ri.customReason}
                                        onChange={(e) => updateCustomReason(ri.itemId, e.target.value)}
                                        className="h-8"
                                      />
                                    </div>
                                  )}

                                  {/* Line total */}
                                  <div className="space-y-1 text-right">
                                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Return Value
                                    </Label>
                                    <p className="font-mono text-sm font-bold text-primary h-8 flex items-center justify-end">
                                      {formatCurrency(ri.item.rate * (1 - ri.item.discountPercent / 100) * ri.returnQty)}
                                    </p>
                                  </div>
                                </div>

                                {!ri.reason && (
                                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Please select a reason to continue
                                  </p>
                                )}
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>

              {/* Fixed bottom bar */}
              <div className="shrink-0 flex items-center justify-between border-t border-border/40 bg-background px-6 py-3">
                <Button variant="outline" size="sm" onClick={() => goToStep(1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  {selectedReturnItems.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Return total:{' '}
                      <span className="font-mono font-bold text-foreground">
                        {formatCurrency(creditSummary.total)}
                      </span>
                    </p>
                  )}
                  <Button disabled={!canProceedToStep3} onClick={() => goToStep(3)}>
                    Preview Credit Note
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 3: Credit Note Preview — Two-Pane Layout           */}
          {/* ═══════════════════════════════════════════════════════ */}
          {currentStep === 3 && selectedInvoice && (
            <motion.div
              key="step3"
              custom={direction}
              initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="absolute inset-0 flex"
            >
              {/* Left: Credit Note Document — pinned header, scrollable items, pinned totals */}
              <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[60%]">
                {/* Pinned: Document header */}
                <div className="shrink-0 bg-gradient-to-r from-primary/5 to-primary/[0.02] border-b border-border/40 p-5 dark:from-primary/10 dark:to-primary/[0.03]">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Credit Note</p>
                      <p className="mt-1 font-mono text-xl font-bold">{creditNoteNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Against Invoice</p>
                      <p className="font-mono text-sm font-medium">{fmtInvoiceNum(selectedInvoice)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                      <p className="mt-0.5 font-medium">{selectedInvoice.customerName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Date</p>
                      <p className="mt-0.5">{formatDate(selectedInvoice.date)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Return Date</p>
                      <p className="mt-0.5">{formatDate(new Date().toISOString())}</p>
                    </div>
                  </div>
                </div>

                {/* Scrollable: Items table */}
                <ScrollArea className="min-h-0 flex-1">
                  <div className="px-5 py-3">
                    {/* Table header */}
                    <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 rounded-t-lg bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-muted/20">
                      <div className="col-span-4">Product</div>
                      <div className="col-span-1 text-center">Qty</div>
                      <div className="col-span-2 text-right">Rate</div>
                      <div className="col-span-1 text-right">GST</div>
                      <div className="col-span-2 text-right">Amount</div>
                      <div className="col-span-2">Reason</div>
                    </div>
                    {selectedReturnItems.map((ri) => {
                      const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
                      const lineAmount = lineRate * ri.returnQty
                      const displayReason = ri.reason === 'Other' ? ri.customReason || 'Other' : ri.reason
                      const badgeVariant = reasonVariantMap[ri.reason || 'Other'] || 'secondary'
                      return (
                        <div key={ri.itemId} className="grid grid-cols-12 gap-2 border-b border-border/30 px-4 py-3 items-center text-sm">
                          <div className="col-span-4">
                            <p className="font-medium truncate">{ri.item.productName}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{ri.item.batchNumber}</p>
                          </div>
                          <div className="col-span-1 text-center font-mono font-semibold">{ri.returnQty}</div>
                          <div className="col-span-2 text-right font-mono">{formatCurrency(lineRate)}</div>
                          <div className="col-span-1 text-right text-muted-foreground">{ri.item.gstPercent}%</div>
                          <div className="col-span-2 text-right font-mono font-semibold">{formatCurrency(lineAmount)}</div>
                          <div className="col-span-2">
                            <Badge variant={badgeVariant} size="sm" dot>{displayReason}</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>

                {/* Pinned: Totals */}
                <div className="shrink-0 border-t border-border/40 bg-muted/10 px-5 py-4 dark:bg-muted/5">
                  <div className="flex items-center justify-end gap-8">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono font-medium">{formatCurrency(creditSummary.subtotal)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">GST Reversal</span>
                      <span className="font-mono font-medium">{formatCurrency(creditSummary.gstReversal)}</span>
                    </div>
                    <Separator orientation="vertical" className="h-6" />
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Credit Total</span>
                      <span className="font-mono text-lg font-bold text-primary">{formatCurrency(creditSummary.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Settlement & Actions */}
              <div className="hidden lg:flex lg:w-[40%] flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-5 space-y-5">
                    {/* Settlement Method */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Settlement Method
                      </p>
                      <RadioGroup
                        value={settlementOption}
                        onValueChange={setSettlementOption}
                        className="space-y-2"
                      >
                        {[
                          { value: 'refund', title: 'Refund to Customer', desc: 'Refund via original payment method' },
                          { value: 'adjust', title: 'Adjust Against Outstanding', desc: 'Deduct from existing balance' },
                          { value: 'store_credit', title: 'Store Credit', desc: 'Keep as credit for future purchases' },
                        ].map((opt) => (
                          <div
                            key={opt.value}
                            className={cn(
                              'flex items-start gap-3 rounded-xl border p-3 transition-all cursor-pointer',
                              settlementOption === opt.value
                                ? 'border-primary/30 bg-primary/[0.03] ring-1 ring-primary/10 dark:bg-primary/[0.06]'
                                : 'border-border/40 hover:bg-muted/30'
                            )}
                            onClick={() => setSettlementOption(opt.value)}
                          >
                            <RadioGroupItem value={opt.value} id={opt.value} className="mt-0.5" />
                            <Label htmlFor={opt.value} className="cursor-pointer space-y-0.5 flex-1">
                              <p className="text-sm font-medium">{opt.title}</p>
                              <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>

                    <Separator />

                    {/* Summary */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        Return Summary
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Items Returned</span>
                          <span className="font-semibold">{selectedReturnItems.length}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total Units</span>
                          <span className="font-semibold">{selectedReturnItems.reduce((sum, ri) => sum + ri.returnQty, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Settlement</span>
                          <Badge variant="info" size="sm" className="capitalize">
                            {settlementOption === 'store_credit' ? 'Store Credit' : settlementOption === 'adjust' ? 'Adjust' : 'Refund'}
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Credit Amount</span>
                          <span className="font-mono text-xl font-bold text-primary">
                            {formatCurrency(creditSummary.total)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Quick Actions */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        After Creating
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1">
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                          Print
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1">
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                {/* Pinned action footer */}
                <div className="shrink-0 border-t border-border/40 bg-background p-4 space-y-2">
                  <Button className="w-full" onClick={handleConfirmReturn}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Confirm Return & Create Credit Note
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => goToStep(2)}>
                    <ChevronLeft className="mr-1.5 h-4 w-4" />
                    Back to Items
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
