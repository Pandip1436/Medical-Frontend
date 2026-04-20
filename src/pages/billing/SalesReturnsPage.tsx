import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn, formatCurrency, formatDate, generateInvoiceNumber } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import api from '@/lib/api'
import type { Invoice, InvoiceItem } from '@/types'
import { printCreditNotePdf, downloadCreditNotePdf, type NoteData } from '@/lib/pdf/notesPdf'

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
  
  // Real Data State
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/billing')
      setInvoices(res.data.data || res.data)
    } catch (error) {
      toast.error('Failed to load invoices')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInvoices() }, [])
  useBranchRefresh(fetchInvoices)

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
    return invoices
      .filter(
        (inv) =>
          inv.type === 'INVOICE' &&
          inv.status !== 'RETURNED' &&
          inv.status !== 'CANCELLED' &&
          inv.status !== 'DRAFT' &&
          (inv.invoiceNumber.toLowerCase().includes(q) ||
            inv.customerName.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [invoiceSearch, invoices])

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

  const buildCreditNoteData = (): NoteData | null => {
    if (!selectedInvoice) return null
    const reasonSummary = Array.from(
      new Set(
        selectedReturnItems.map((ri) =>
          ri.reason === 'Other' && ri.customReason ? ri.customReason : ri.reason,
        ),
      ),
    ).join(', ')
    return {
      noteNo: creditNoteNumber,
      date: new Date().toISOString(),
      partyLabel: 'Customer',
      partyName: selectedInvoice.customerName,
      referenceLabel: 'Invoice',
      referenceValue: fmtInvoiceNum(selectedInvoice),
      reason: reasonSummary || '-',
      items: selectedReturnItems.map((ri) => {
        const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
        const lineAmount = lineRate * ri.returnQty
        const gstAmount = lineAmount * (ri.item.gstPercent / 100)
        return {
          productName: ri.item.productName,
          batchNumber: ri.item.batchNumber,
          expiryDate: ri.item.expiryDate,
          returnedQty: ri.returnQty,
          rate: Number(lineRate.toFixed(2)),
          gstPercent: Number(ri.item.gstPercent),
          amount: Number((lineAmount + gstAmount).toFixed(2)),
        }
      }),
      subtotal: Number(creditSummary.subtotal.toFixed(2)),
      cgst: Number((creditSummary.gstReversal / 2).toFixed(2)),
      sgst: Number((creditSummary.gstReversal / 2).toFixed(2)),
      totalAmount: Number(creditSummary.total.toFixed(2)),
      footerLine: 'Goods returned under credit note. Subject to Madurai jurisdiction.',
    }
  }

  const handlePrintCreditNote = () => {
    const data = buildCreditNoteData()
    if (!data || data.items.length === 0) {
      toast.error('Select at least one item to return before printing')
      return
    }
    printCreditNotePdf(data)
  }

  const handleDownloadCreditNote = () => {
    const data = buildCreditNoteData()
    if (!data || data.items.length === 0) {
      toast.error('Select at least one item to return before downloading')
      return
    }
    downloadCreditNotePdf(data)
  }

  const handleConfirmReturn = async () => {
    if (!selectedInvoice) return
    const settlementMode =
      settlementOption === 'refund' ? 'REFUND' : settlementOption === 'adjust' ? 'CREDIT' : 'REPLACEMENT'

    const payloadItems = selectedReturnItems.map((ri) => {
      const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
      const lineAmount = lineRate * ri.returnQty
      const gstAmount = lineAmount * (ri.item.gstPercent / 100)
      return {
        productId: ri.item.productId,
        productName: ri.item.productName,
        batchId: ri.item.batchId,
        batchNumber: ri.item.batchNumber,
        expiryDate: new Date(ri.item.expiryDate).toISOString(),
        returnedQty: ri.returnQty,
        rate: Number(lineRate.toFixed(2)),
        gstPercent: Number(ri.item.gstPercent),
        amount: Number((lineAmount + gstAmount).toFixed(2)),
      }
    })

    const reasonSummary = Array.from(
      new Set(
        selectedReturnItems.map((ri) =>
          ri.reason === 'Other' && ri.customReason ? ri.customReason : ri.reason,
        ),
      ),
    ).join(', ')

    const payload = {
      invoiceId: selectedInvoice.id,
      reason: reasonSummary,
      items: payloadItems,
      subtotal: Number(creditSummary.subtotal.toFixed(2)),
      cgst: Number((creditSummary.gstReversal / 2).toFixed(2)),
      sgst: Number((creditSummary.gstReversal / 2).toFixed(2)),
      totalAmount: Number(creditSummary.total.toFixed(2)),
      settlementMode,
    }

    try {
      const res = await api.post('/credit-notes', payload)
      toast.success(`Credit Note ${res.data.creditNoteNo ?? creditNoteNumber} created successfully`, {
        description: `${formatCurrency(creditSummary.total)} processed as ${settlementMode.toLowerCase()}.`,
      })
      setCurrentStep(1)
      setDirection(-1)
      setSelectedInvoice(null)
      setReturnItems([])
      setInvoiceSearch('')
      setSettlementOption('refund')
    } catch {
      // api.ts already surfaces a toast for the error
    }
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
                <div className="shrink-0 border-b border-border/40 p-4 bg-muted/10 dark:bg-muted/5">
                  <DataTableFilterBar
                    searchQuery={invoiceSearch}
                    onSearchChange={setInvoiceSearch}
                    searchPlaceholder="Search by invoice number or customer name..."
                    resultsCount={matchingInvoices.length}
                  />
                </div>

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
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
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

              {/* Items — Table View */}
              <div className="flex-1 overflow-hidden border-t border-border/40">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md">
                    <TableRow className="border-b border-border/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent">
                      <TableHead className="w-12 px-4 py-3 text-center">
                        <Checkbox 
                          checked={returnItems.length > 0 && returnItems.every(ri => ri.selected)}
                          onCheckedChange={(checked) => {
                            setReturnItems(prev => prev.map(ri => ({ 
                              ...ri, 
                              selected: !!checked,
                              returnQty: checked ? ri.maxQty : 0,
                              reason: checked ? ri.reason || 'Other' : ''
                            })))
                          }}
                        />
                      </TableHead>
                      <TableHead className="min-w-50 px-4 py-3">Product Details</TableHead>
                      <TableHead className="w-25 px-2 py-3 text-center">Sold Qty</TableHead>
                      <TableHead className="w-35 px-2 py-3 text-center">Return Qty</TableHead>
                      <TableHead className="w-50 px-2 py-3">Return Reason</TableHead>
                      <TableHead className="w-30 px-4 py-3 text-right">Refund Amt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnItems.map((ri) => {
                      const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
                      const lineRefund = lineRate * ri.returnQty
                      const gstRefund = lineRefund * (ri.item.gstPercent / 100)
                      const totalRefund = lineRefund + gstRefund

                      return (
                        <TableRow 
                          key={ri.itemId}
                          className={cn(
                            "group transition-colors",
                            ri.selected ? "bg-primary/3 hover:bg-primary/5" : "hover:bg-muted/30"
                          )}
                        >
                          <TableCell className="px-4 py-3 text-center">
                            <Checkbox
                              checked={ri.selected}
                              onCheckedChange={() => toggleReturnItem(ri.itemId)}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="text-xs font-bold leading-none">{ri.item.productName}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                <span className="font-mono bg-muted px-1 rounded">{ri.item.batchNumber}</span>
                                <span>Exp: {ri.item.expiryDate ? formatDate(ri.item.expiryDate) : 'N/A'}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-3 text-center">
                            <span className="text-xs font-bold tabular-nums text-muted-foreground/40">{ri.item.quantity}</span>
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            {ri.selected ? (
                              <div className="flex items-center gap-1 justify-center">
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  className="h-6 w-6 rounded-md"
                                  onClick={() => updateReturnQty(ri.itemId, ri.returnQty - 1)}
                                  disabled={ri.returnQty <= 1}
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </Button>
                                <input
                                  type="number"
                                  value={ri.returnQty}
                                  onChange={(e) => updateReturnQty(ri.itemId, parseInt(e.target.value) || 0)}
                                  className="w-10 h-6 bg-transparent border-0 text-[11px] font-black font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/20 rounded"
                                />
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  className="h-6 w-6 rounded-md"
                                  onClick={() => updateReturnQty(ri.itemId, ri.returnQty + 1)}
                                  disabled={ri.returnQty >= ri.maxQty}
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="text-center text-[10px] text-muted-foreground/20 italic">Select to edit</div>
                            )}
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            {ri.selected ? (
                              <div className="space-y-1.5">
                                <Select
                                  value={ri.reason}
                                  onValueChange={(val) => updateReturnReason(ri.itemId, val as ReturnReason)}
                                >
                                  <SelectTrigger className="h-7 text-[10px] font-medium border-primary/10 bg-background/50">
                                    <SelectValue placeholder="Reason..." />
                                  </SelectTrigger>
                                  <SelectContent className="bg-popover/95 backdrop-blur-xl">
                                    {RETURN_REASONS.map((reason) => {
                                      const Icon = reasonIcons[reason]
                                      return (
                                        <SelectItem key={reason} value={reason} className="text-[11px]">
                                          <div className="flex items-center gap-2">
                                            <Icon className="h-3 w-3 opacity-60" />
                                            {reason}
                                          </div>
                                        </SelectItem>
                                      )
                                    })}
                                  </SelectContent>
                                </Select>
                                {ri.reason === 'Other' && (
                                  <input
                                    placeholder="Specify reason..."
                                    value={ri.customReason}
                                    onChange={(e) => updateCustomReason(ri.itemId, e.target.value)}
                                    className="w-full h-6 px-2 bg-muted/40 border-0 text-[10px] rounded focus:outline-none focus:ring-1 focus:ring-primary/20"
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="h-7" />
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <span className={cn(
                              "text-xs font-black font-mono tracking-tight",
                              totalRefund > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground/20"
                            )}>
                              {totalRefund > 0 ? formatCurrency(totalRefund) : "₹0.00"}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

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
                <div className="shrink-0 bg-linear-to-r from-primary/5 to-primary/2 border-b border-border/40 p-5 dark:from-primary/10 dark:to-primary/3">
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
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
                                ? 'border-primary/30 bg-primary/3 ring-1 ring-primary/10 dark:bg-primary/6'
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
                        <Button variant="outline" size="sm" className="flex-1" onClick={handlePrintCreditNote}>
                          <Printer className="mr-1.5 h-3.5 w-3.5" />
                          Print
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={handleDownloadCreditNote}>
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
