import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { motion, AnimatePresence } from 'framer-motion'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Check,
  RotateCcw,
  ShieldCheck,
  User,
  Phone,
  Package,
  Receipt,
  AlertCircle,
  Minus,
  Plus,
  ArrowLeft,
  X,
  Printer,
  Download,
  ShieldAlert,
  Pill,
  BadgeAlert,
  UserX,
  HelpCircle,
  Scale,
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
import { goBack } from '@/lib/router'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import type { Customer, InvoiceItem } from '@/types'
import { printCreditNotePdf, downloadCreditNotePdf, type NoteData } from '@/lib/pdf/notesPdf'

// ─────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────

export const RETURN_REASONS = [
  'Expired',
  'Damaged',
  'Wrong Product',
  'Customer Request',
  'Side Effects',
  'Other',
] as const

type ReturnReason = (typeof RETURN_REASONS)[number]

// One still-returnable purchase line, as returned by
// GET /credit-notes/customer/:id/returnable-items. Each line stays bound to
// its source invoice + batch because a credit note references exactly one
// invoice and returnable qty is capped per (invoiceId, productId, batchId).
interface ReturnableLine {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  invoiceItemId: string
  productId: string
  productName: string
  batchId: string
  batchNumber: string
  expiryDate: string
  soldQty: number
  alreadyReturned: number
  remaining: number
  mrp: number
  rate: number
  discountPercent: number
  gstPercent: number
}

interface ReturnItemState {
  itemId: string
  invoiceId: string
  invoiceNumber: string
  selected: boolean
  returnQty: number
  maxQty: number
  alreadyReturned: number
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

const SETTLEMENT_OPTIONS = [
  { value: 'refund',      title: 'Refund to Customer',          desc: 'Cash/card refund via original payment method' },
  { value: 'adjust',      title: 'Adjust Against Outstanding',  desc: 'Deduct credit amount from existing balance' },
  { value: 'replacement', title: 'Replacement',                 desc: 'Replace with equivalent product(s)' },
] as const

const STEPS = [
  { number: 1, label: 'Select Customer', icon: User },
  { number: 2, label: 'Return Items', icon: Package },
  { number: 3, label: 'Credit Note', icon: Receipt, adjust: { icon: Scale, variant: 'warning' as const } },
] as const

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Mobile Return Card
// ─────────────────────────────────────────────────────────────

interface MobileReturnCardProps {
  ri: ReturnItemState;
  toggleReturnItem: (id: string) => void;
  updateReturnQty: (id: string, qty: number) => void;
  updateReturnReason: (id: string, reason: ReturnReason) => void;
  updateCustomReason: (id: string, reason: string) => void;
}

const MobileReturnCard = ({ 
  ri, 
  toggleReturnItem, 
  updateReturnQty, 
  updateReturnReason, 
  updateCustomReason 
}: MobileReturnCardProps) => {
  const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
  const lineRefund = lineRate * ri.returnQty
  const gstRefund = lineRefund * (ri.item.gstPercent / 100)
  const totalRefund = lineRefund + gstRefund

  return (
    <Card className={cn(
      "mb-3 border-border/60 transition-all",
      ri.selected ? "ring-1 ring-primary/20 bg-primary/3" : "bg-card/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={ri.selected}
            onCheckedChange={() => toggleReturnItem(ri.itemId)}
            disabled={ri.maxQty === 0}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{ri.item.productName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/60">
              <span className="font-mono bg-primary/10 text-primary px-1 rounded">{ri.invoiceNumber}</span>
              <span className="font-mono bg-muted px-1 rounded">{ri.item.batchNumber}</span>
              <span>Exp: {ri.item.expiryDate ? formatDate(ri.item.expiryDate) : 'N/A'}</span>
              <span className="text-foreground/40 font-bold">Sold: {ri.item.quantity}</span>
              {ri.alreadyReturned > 0 && (
                <Badge variant={ri.maxQty === 0 ? 'destructive' : 'warning'} className="text-[9px] px-1.5 py-0">
                  {ri.maxQty === 0 ? 'Fully returned' : `${ri.alreadyReturned} returned · ${ri.maxQty} left`}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {ri.selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 pt-4 border-t border-border/40 space-y-4"
          >
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Return Qty</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => updateReturnQty(ri.itemId, ri.returnQty - 1)}
                  disabled={ri.returnQty <= 1}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <input
                  type="number"
                  value={ri.returnQty}
                  onChange={(e) => updateReturnQty(ri.itemId, parseInt(e.target.value) || 0)}
                  className="w-16 shrink-0 h-8 bg-muted/40 border-0 text-sm font-black font-mono text-center focus:ring-0 rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => updateReturnQty(ri.itemId, ri.returnQty + 1)}
                  disabled={ri.returnQty >= ri.maxQty}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Return Reason</Label>
              <Select
                value={ri.reason}
                onValueChange={(val) => updateReturnReason(ri.itemId, val as ReturnReason)}
              >
                <SelectTrigger className="h-9 w-full text-xs font-semibold bg-background">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent className="z-100 min-w-44">
                  {RETURN_REASONS.map((reason) => {
                    const Icon = reasonIcons[reason]
                    return (
                      <SelectItem key={reason} value={reason} className="text-xs">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Icon className="h-3.5 w-3.5 opacity-60" />
                          {reason}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {ri.reason === 'Other' && (
                <input
                  placeholder="Type reason here..."
                  value={ri.customReason}
                  onChange={(e) => updateCustomReason(ri.itemId, e.target.value)}
                  className="w-full h-9 px-3 bg-muted/30 border-0 text-xs rounded-lg focus:ring-1 focus:ring-primary/20 mt-2"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/10">
              <span className="text-[10px] font-bold text-muted-foreground/40 font-mono text-xs">
                RATE: {formatCurrency(lineRate)}
              </span>
              <div className="text-right">
                <p className="text-[9px] font-bold text-muted-foreground uppercase">Estimated Refund</p>
                <p className="text-base font-black font-mono text-rose-600 dark:text-rose-400">
                  {formatCurrency(totalRefund)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function SalesReturnsPage() {
  const isPharmacist = useAuthStore((s) => s.user?.role === 'PHARMACIST')

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1)
  const [direction, setDirection] = useState(1)

  // Step 1 — customer search + product selection
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [returnableLoading, setReturnableLoading] = useState(false)
  // Filter for the returnable-products list (right pane) once a customer is picked.
  const [productSearch, setProductSearch] = useState('')

  const customerResults = usePaginatedSearch<Customer>({ endpoint: '/customers', pageSize: 20 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { customerResults.setQuery(customerSearch) }, [customerSearch])

  // Infinite scroll for the customer list: a sentinel at the end of the list
  // triggers loadMore() as it scrolls into the ScrollArea viewport.
  const customerViewportRef = useRef<HTMLDivElement>(null)
  const customerSentinelRef = useRef<HTMLDivElement>(null)
  useInfiniteScroll({
    root: customerViewportRef,
    sentinel: customerSentinelRef,
    hasMore: customerResults.hasMore,
    isLoading: customerResults.loading,
    onLoadMore: customerResults.loadMore,
  })

  // Step 2
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])

  // Step 3
  const [settlementOption, setSettlementOption] = useState<string>('refund')
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null)

  // Reset the flow on branch switch — customer search re-scopes server-side via
  // the JWT branch, so a stale selected customer from the old branch must clear.
  useBranchRefresh(() => {
    setSelectedCustomer(null)
    setReturnItems([])
    setCustomerSearch('')
    setProductSearch('')
    setCustomerOutstanding(null)
    setCurrentStep(1)
  })

  const creditNoteNumber = useMemo(() => generateInvoiceNumber('CN', 12), [])

  // ── Navigation ──
  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1)
    setCurrentStep(step)
  }

  // ── Step 1: select a customer, then load every still-returnable line they
  // have across all their invoices. The endpoint already subtracts
  // approved + pending returns and clamps `remaining`, so no second
  // returned-qty call is needed — the BE re-validates per invoice on submit.
  const handleSelectCustomer = async (cust: Customer) => {
    setSelectedCustomer(cust)
    setReturnItems([])
    setProductSearch('')
    setCustomerOutstanding(Number(cust.currentOutstanding ?? 0))
    setReturnableLoading(true)
    try {
      const res = await api.get<ReturnableLine[]>(
        `/credit-notes/customer/${cust.id}/returnable-items`,
      )
      setReturnItems(
        res.data.map((line) => ({
          itemId: line.invoiceItemId,
          invoiceId: line.invoiceId,
          invoiceNumber: line.invoiceNumber,
          selected: false,
          returnQty: 0,
          maxQty: line.remaining,
          alreadyReturned: line.alreadyReturned,
          reason: '',
          customReason: '',
          item: {
            id: line.invoiceItemId,
            productId: line.productId,
            productName: line.productName,
            batchId: line.batchId,
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate,
            quantity: line.soldQty,
            mrp: line.mrp,
            rate: line.rate,
            discountPercent: line.discountPercent,
            gstPercent: line.gstPercent,
            amount: 0,
          },
        })),
      )
    } catch {
      // api.ts surfaces the error toast; leave the list empty.
      setReturnItems([])
    } finally {
      setReturnableLoading(false)
    }
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

  // All items the user picked in step 1 — drives the Step 2 display so a row
  // stays visible even when the user temporarily clears its qty input to 0
  // (otherwise they'd have to go back to step 1 to re-pick it). Validation
  // and submission filter further on returnQty > 0 below.
  const pickedReturnItems = returnItems.filter((ri) => ri.selected)
  const selectedReturnItems = pickedReturnItems.filter((ri) => ri.returnQty > 0)
  // Step 1 → 2 only needs at least one product chosen; reasons/qty come in step 2.
  const canProceedToStep2 = returnItems.some((ri) => ri.selected)
  const canProceedToStep3 = selectedReturnItems.length > 0 && selectedReturnItems.every((ri) => ri.reason !== '')

  const groupByProduct = (items: ReturnItemState[]) => {
    const groups = new Map<string, ReturnItemState[]>()
    for (const ri of items) {
      const list = groups.get(ri.item.productName)
      if (list) list.push(ri)
      else groups.set(ri.item.productName, [ri])
    }
    return Array.from(groups.entries()).map(([productName, list]) => ({ productName, items: list }))
  }

  // Step 1 product picker: filter the returnable lines by name/batch/invoice,
  // then group under the product name (one selectable row per purchase).
  const groupedPickItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    const filtered = !q
      ? returnItems
      : returnItems.filter(
          (ri) =>
            ri.item.productName.toLowerCase().includes(q) ||
            ri.item.batchNumber.toLowerCase().includes(q) ||
            ri.invoiceNumber.toLowerCase().includes(q),
        )
    return groupByProduct(filtered)
  }, [returnItems, productSearch])

  // Step 2 only shows the lines chosen in step 1, grouped, for qty + reason.
  // Uses the unfiltered "picked" list so rows persist when qty is cleared.
  const groupedSelectedItems = useMemo(
    () => groupByProduct(pickedReturnItems),
    [pickedReturnItems],
  )

  // Distinct source invoices for the current selection — selecting lines from
  // several invoices files one credit note per invoice (see handleConfirmReturn).
  const selectedInvoiceNumbers = useMemo(
    () => Array.from(new Set(selectedReturnItems.map((ri) => ri.invoiceNumber))),
    [selectedReturnItems],
  )

  // ── Step 3: Calculations ──
  const creditSummary = useMemo(() => {
    let subtotal = 0
    let totalGst = 0
    for (const ri of selectedReturnItems) {
      const lineRate = Number(ri.item.rate) * (1 - Number(ri.item.discountPercent) / 100)
      const lineAmount = lineRate * ri.returnQty
      const gstAmount = lineAmount * (Number(ri.item.gstPercent) / 100)
      subtotal += lineAmount
      totalGst += gstAmount
    }
    return { subtotal, gstReversal: totalGst, total: subtotal + totalGst }
  }, [selectedReturnItems])

  const buildCreditNoteData = (): NoteData | null => {
    if (!selectedCustomer) return null
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
      partyName: selectedCustomer.name,
      referenceLabel: selectedInvoiceNumbers.length > 1 ? 'Invoices' : 'Invoice',
      referenceValue: selectedInvoiceNumbers.join(', '),
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
    if (!selectedCustomer || selectedReturnItems.length === 0) return
    // Safety: if adjust selected but customer has no outstanding, fall back to refund
    const effectiveOption = (settlementOption === 'adjust' && (customerOutstanding ?? 0) <= 0) ? 'refund' : settlementOption
    const settlementMode =
      effectiveOption === 'adjust' ? 'CREDIT'
      : effectiveOption === 'replacement' ? 'REPLACEMENT'
      : 'REFUND'

    // A credit note references exactly one invoice, so split the selection by
    // source invoice and file one CN per invoice. Each CN carries only that
    // invoice's items/totals.
    const byInvoice = new Map<string, ReturnItemState[]>()
    for (const ri of selectedReturnItems) {
      const list = byInvoice.get(ri.invoiceId)
      if (list) list.push(ri)
      else byInvoice.set(ri.invoiceId, [ri])
    }

    let okCount = 0
    const failedInvoices: string[] = []

    for (const [invoiceId, items] of byInvoice) {
      let subtotal = 0
      let totalGst = 0
      const payloadItems = items.map((ri) => {
        const lineRate = ri.item.rate * (1 - ri.item.discountPercent / 100)
        const lineAmount = lineRate * ri.returnQty
        const gstAmount = lineAmount * (ri.item.gstPercent / 100)
        subtotal += lineAmount
        totalGst += gstAmount
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
          items.map((ri) =>
            ri.reason === 'Other' && ri.customReason ? ri.customReason : ri.reason,
          ),
        ),
      ).join(', ')

      const payload = {
        invoiceId,
        reason: reasonSummary,
        items: payloadItems,
        subtotal: Number(subtotal.toFixed(2)),
        cgst: Number((totalGst / 2).toFixed(2)),
        sgst: Number((totalGst / 2).toFixed(2)),
        totalAmount: Number((subtotal + totalGst).toFixed(2)),
        settlementMode,
      }

      try {
        await api.post('/credit-notes', payload)
        okCount++
      } catch {
        // api.ts already surfaces the error toast; record which invoice failed.
        failedInvoices.push(items[0].invoiceNumber)
      }
    }

    // Every CN lands in PENDING_REVIEW — goods are physically inspected before
    // any inventory/balance change fires; the reviewer approves (with optional
    // settlement override) or rejects on the CN detail page.
    if (okCount > 0) {
      toast.success(
        `${okCount} credit note${okCount !== 1 ? 's' : ''} submitted — awaiting review`,
        {
          description: failedInvoices.length
            ? `Could not file for: ${failedInvoices.join(', ')}. Please retry those.`
            : `${formatCurrency(creditSummary.total)} held pending inspection. Reviewer will finalise the ${settlementMode.toLowerCase()} settlement.`,
          duration: 6000,
        },
      )
      setCurrentStep(1)
      setDirection(-1)
      setSelectedCustomer(null)
      setReturnItems([])
      setCustomerSearch('')
      setProductSearch('')
      setSettlementOption('refund')
      setCustomerOutstanding(null)
    }
    // If nothing succeeded, stay on the page so the user can retry; api.ts has
    // already shown the failure toast.
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
      {/* ── Fixed Header ── */}
      <div className="shrink-0 border-b border-border/40 bg-background px-4 py-3 sm:px-6">
        {/* Title on the left, step indicators on the right */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goBack('/billing/sales')}
            className="text-muted-foreground shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-base font-bold tracking-tight leading-tight">Sales Returns</h2>
            <p className="hidden sm:block text-[11px] text-muted-foreground">Submit for inspection — reviewer finalises the credit after verifying the goods</p>
          </div>

          <div className="ml-auto hidden md:flex items-center gap-1">
            {STEPS.map((step, idx) => {
              const isActive = currentStep === step.number
              const isCompleted = currentStep > step.number
              return (
                <div key={step.number} className="flex items-center">
                  <button
                    onClick={() => { if (isCompleted) goToStep(step.number) }}
                    disabled={!isCompleted && !isActive}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all',
                      isActive && 'bg-primary text-primary-foreground shadow-sm',
                      isCompleted && 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20',
                      !isActive && !isCompleted && 'text-muted-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0',
                      isActive && 'bg-primary-foreground/20',
                      isCompleted && 'bg-primary/20',
                      !isActive && !isCompleted && 'bg-muted'
                    )}>
                      {isCompleted ? <Check className="h-3 w-3" /> : step.number}
                    </div>
                    <span>{step.label}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={cn('mx-1 h-px w-6 shrink-0', isCompleted ? 'bg-primary' : 'bg-border')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Step indicators on small screens (stacked below title) */}
        <div className="mt-3 flex md:hidden items-center gap-1 pl-1">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.number
            const isCompleted = currentStep > step.number
            return (
              <div key={step.number} className="flex items-center">
                <button
                  onClick={() => { if (isCompleted) goToStep(step.number) }}
                  disabled={!isCompleted && !isActive}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all',
                    isActive && 'bg-primary text-primary-foreground shadow-sm',
                    isCompleted && 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20',
                    !isActive && !isCompleted && 'text-muted-foreground'
                  )}
                >
                  <div className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0',
                    isActive && 'bg-primary-foreground/20',
                    isCompleted && 'bg-primary/20',
                    !isActive && !isCompleted && 'bg-muted'
                  )}>
                    {isCompleted ? <Check className="h-3 w-3" /> : step.number}
                  </div>
                  <span>{step.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn('mx-1 h-px w-6 shrink-0', isCompleted ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main Content (fills viewport) ── */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 1: Select Customer — Two-Pane Layout              */}
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
              {/* Left: Search & Customer List — hidden on mobile once a customer
                  is chosen so the product picker takes over the screen. */}
              <div className={cn('w-full flex-col overflow-hidden border-r border-border/40 lg:flex lg:w-[55%]', selectedCustomer ? 'hidden lg:flex' : 'flex')}>
                <div className="shrink-0 border-b border-border/40 p-4 bg-muted/10 dark:bg-muted/5">
                  <DataTableFilterBar
                    searchQuery={customerSearch}
                    onSearchChange={setCustomerSearch}
                    searchPlaceholder="Search customer by name, phone or GSTIN..."
                    resultsCount={customerResults.total}
                  />
                </div>

                <ScrollArea className="min-h-0 flex-1" viewportRef={customerViewportRef}>
                  <div className="p-2">
                    {!customerSearch.trim() && customerResults.items.length === 0 && !customerResults.loading && (
                      <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                          <Search className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Search for a customer</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                            Type a name, phone number or GSTIN to begin
                          </p>
                        </div>
                      </div>
                    )}

                    {customerResults.loading && customerResults.items.length === 0 && (
                      <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                        <p className="text-sm text-muted-foreground">Loading customers…</p>
                      </div>
                    )}

                    {!customerResults.loading && customerSearch.trim() && customerResults.items.length === 0 && (
                      <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                          <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          No customers for &ldquo;{customerSearch}&rdquo;
                        </p>
                      </div>
                    )}

                    {customerResults.items.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => handleSelectCustomer(cust)}
                        className={cn(
                          'group flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 transition-all',
                          selectedCustomer?.id === cust.id
                            ? 'bg-primary/8 ring-1 ring-primary/20 dark:bg-primary/10'
                            : 'hover:bg-muted/40'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                            selectedCustomer?.id === cust.id
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/60 bg-muted/30 group-hover:border-border'
                          )}>
                            {selectedCustomer?.id === cust.id ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{cust.name}</p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" /> {cust.phone}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant="secondary" size="sm" className="capitalize">{cust.type.toLowerCase()}</Badge>
                          {cust.currentOutstanding > 0 && (
                            <p className="mt-1 text-[11px] font-mono text-amber-600 dark:text-amber-400">
                              {formatCurrency(cust.currentOutstanding)} due
                            </p>
                          )}
                        </div>
                      </div>
                    ))}

                    {customerResults.hasMore && <div ref={customerSentinelRef} className="h-px" aria-hidden />}
                    {customerResults.loading && customerResults.items.length > 0 && (
                      <p className="py-3 text-center text-[11px] text-muted-foreground">Loading more…</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Returnable product picker — selection happens here. Also
                  becomes the full mobile screen once a customer is chosen. */}
              <div className={cn('w-full flex-col overflow-hidden lg:flex lg:w-[45%]', selectedCustomer ? 'flex' : 'hidden lg:flex')}>
                {!selectedCustomer ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 dark:bg-muted/15">
                      <Receipt className="h-7 w-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Select a customer to see their returnable products</p>
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    {/* Mobile-only: back to the customer list */}
                    <button
                      type="button"
                      onClick={() => { setSelectedCustomer(null); setReturnItems([]); setProductSearch('') }}
                      className="flex items-center gap-1 border-b border-border/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:hidden"
                    >
                      <ChevronLeft className="h-4 w-4" /> Change customer
                    </button>

                    {/* Customer header */}
                    <div className="shrink-0 border-b border-border/40 p-5">
                      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                          <p className="mt-0.5 text-sm font-bold truncate" title={selectedCustomer.name}>{selectedCustomer.name}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</p>
                          <p className="mt-0.5 text-sm font-medium whitespace-nowrap">{selectedCustomer.phone}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
                          <Badge variant="secondary" size="sm" className="mt-0.5 capitalize">{selectedCustomer.type.toLowerCase()}</Badge>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</p>
                          <p className="mt-0.5 font-mono text-sm font-bold whitespace-nowrap">{formatCurrency(customerOutstanding ?? 0)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Product search */}
                    <div className="shrink-0 border-b border-border/40 px-4 py-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                        <Input
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Search product, batch or invoice..."
                          className="h-9 pl-9 text-sm"
                        />
                      </div>
                    </div>

                    {/* Selectable returnable products */}
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Returnable Products ({groupedPickItems.reduce((n, g) => n + g.items.length, 0)})
                          </p>
                          {returnItems.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const allPicked = returnItems.every((ri) => ri.selected)
                                setReturnItems((prev) => prev.map((ri) => ({
                                  ...ri,
                                  selected: !allPicked,
                                  returnQty: !allPicked ? ri.maxQty : 0,
                                  reason: !allPicked ? ri.reason : '',
                                })))
                              }}
                              className="text-[11px] font-medium text-primary hover:underline"
                            >
                              {returnItems.every((ri) => ri.selected) ? 'Clear all' : 'Select all'}
                            </button>
                          )}
                        </div>
                        {returnableLoading ? (
                          <p className="text-sm text-muted-foreground">Loading purchases…</p>
                        ) : returnItems.length === 0 ? (
                          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                            <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">No returnable items for this customer</p>
                          </div>
                        ) : groupedPickItems.length === 0 ? (
                          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                            <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">No products match &ldquo;{productSearch}&rdquo;</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {groupedPickItems.map((g) => (
                              <div key={g.productName} className="rounded-lg border border-border/40 bg-muted/10 p-2 dark:bg-muted/5">
                                <p className="px-1 pb-1 text-sm font-semibold truncate">{g.productName}</p>
                                <div className="space-y-1">
                                  {g.items.map((ri) => (
                                    <div
                                      key={ri.itemId}
                                      onClick={() => toggleReturnItem(ri.itemId)}
                                      className={cn(
                                        'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors',
                                        ri.selected ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-muted/40'
                                      )}
                                    >
                                      <Checkbox checked={ri.selected} className="pointer-events-none" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                          <span className="font-mono bg-primary/10 text-primary px-1 rounded">{ri.invoiceNumber}</span>
                                          <span className="font-mono bg-muted px-1 rounded text-muted-foreground">{ri.item.batchNumber}</span>
                                          <span className="text-muted-foreground">Exp: {ri.item.expiryDate ? formatDate(ri.item.expiryDate) : 'N/A'}</span>
                                        </div>
                                      </div>
                                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{ri.maxQty} returnable</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    {/* Fixed footer with action */}
                    <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md px-4 py-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                      <button
                        type="button"
                        onClick={() => goToStep(2)}
                        disabled={!canProceedToStep2}
                        className="flex w-full h-9 items-center justify-center gap-1 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {pickedReturnItems.length > 0
                          ? `Continue with ${pickedReturnItems.length} item${pickedReturnItems.length !== 1 ? 's' : ''}`
                          : 'Select items to continue'}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}



          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 2: Select Return Items — Full Width Table          */}
          {/* ═══════════════════════════════════════════════════════ */}
          {currentStep === 2 && selectedCustomer && (
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
              <div className="flex shrink-0 flex-col gap-1 border-b border-border/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">Returning for</p>
                  <span className="text-sm font-medium" title={selectedCustomer.name}>{selectedCustomer.name}</span>
                </div>
                {pickedReturnItems.length > 0 && (
                  <Badge variant="info" dot size="sm" className="self-start sm:self-auto">
                    {pickedReturnItems.length} item{pickedReturnItems.length !== 1 ? 's' : ''} selected
                    {selectedInvoiceNumbers.length > 1 ? ` · ${selectedInvoiceNumbers.length} invoices` : ''}
                  </Badge>
                )}
              </div>

              {/* Items — Table View (Desktop) / Card View (Mobile) */}
              <div className="flex-1 overflow-auto border-t border-border/40">
                {pickedReturnItems.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
                    <Package className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No items selected. Go back to choose products to return.</p>
                    <Button variant="outline" size="sm" onClick={() => goToStep(1)}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Back to products
                    </Button>
                  </div>
                )}
                {/* Desktop View */}
                <div className={cn(pickedReturnItems.length > 0 ? 'hidden md:block' : 'hidden')}>
                  <Table className="min-w-175">
                    <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md">
                      <TableRow className="border-b border-border/40 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:bg-transparent">
                        <TableHead className="w-12 px-4 py-3" />
                        <TableHead className="min-w-50 px-4 py-3">Product Details</TableHead>
                        <TableHead className="w-25 px-2 py-3 text-center">Sold Qty</TableHead>
                        <TableHead className="w-44 px-2 py-3 text-center">Return Qty</TableHead>
                        <TableHead className="w-50 px-2 py-3">Return Reason</TableHead>
                        <TableHead className="w-30 px-4 py-3 text-right">Refund Amt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedSelectedItems.map((g) => (
                        <Fragment key={g.productName}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40 dark:bg-muted/20">
                            <TableCell colSpan={6} className="px-4 py-1.5">
                              <span className="text-[11px] font-bold text-foreground/80">{g.productName}</span>
                              <span className="ml-2 text-[10px] text-muted-foreground/60">{g.items.length} purchase{g.items.length !== 1 ? 's' : ''}</span>
                            </TableCell>
                          </TableRow>
                          {g.items.map((ri) => {
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
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-6 w-6 text-muted-foreground/50 hover:text-rose-500"
                                onClick={() => toggleReturnItem(ri.itemId)}
                                title="Remove from return"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/60">
                                  <span className="font-mono bg-primary/10 text-primary px-1 rounded">{ri.invoiceNumber}</span>
                                  <span className="font-mono bg-muted px-1 rounded">{ri.item.batchNumber}</span>
                                  <span>Exp: {ri.item.expiryDate ? formatDate(ri.item.expiryDate) : 'N/A'}</span>
                                  {ri.alreadyReturned > 0 && (
                                    <Badge variant={ri.maxQty === 0 ? 'destructive' : 'warning'} className="text-[9px] px-1.5 py-0">
                                      {ri.maxQty === 0 ? 'Fully returned' : `${ri.alreadyReturned} returned · ${ri.maxQty} left`}
                                    </Badge>
                                  )}
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
                                    className="w-16 shrink-0 h-6 bg-transparent border-0 text-[11px] font-black font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/20 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                    <SelectContent className="min-w-44 bg-popover/95 backdrop-blur-xl">
                                      {RETURN_REASONS.map((reason) => {
                                        const Icon = reasonIcons[reason]
                                        return (
                                          <SelectItem key={reason} value={reason} className="text-[11px]">
                                            <div className="flex items-center gap-2 whitespace-nowrap">
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
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile View */}
                <div className={cn('p-4 space-y-1 pb-20', pickedReturnItems.length > 0 ? 'md:hidden' : 'hidden')}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Set Quantity &amp; Reason</h3>
                    <span className="text-[10px] text-muted-foreground font-semibold">Tap the box to remove an item</span>
                  </div>
                  {groupedSelectedItems.map((g) => (
                    <div key={g.productName} className="mb-3">
                      <p className="mb-1.5 px-1 text-[11px] font-bold text-foreground/80">{g.productName}</p>
                      {g.items.map((ri) => (
                        <MobileReturnCard
                          key={ri.itemId}
                          ri={ri}
                          toggleReturnItem={toggleReturnItem}
                          updateReturnQty={updateReturnQty}
                          updateReturnReason={updateReturnReason}
                          updateCustomReason={updateCustomReason}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Fixed bottom bar */}
              <div className="shrink-0 flex items-center justify-between border-t border-border/40 bg-background/95 backdrop-blur-md [-webkit-backdrop-filter:blur(8px)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 fixed bottom-0 left-0 right-0 md:relative md:z-auto z-50">
                <Button variant="outline" size="sm" onClick={() => goToStep(1)} className="h-9 px-4">
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  {selectedReturnItems.length > 0 && (
                    <div className="hidden sm:block text-right">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase">Total Refund</p>
                      <p className="font-mono font-bold text-foreground">
                        {formatCurrency(creditSummary.total)}
                      </p>
                    </div>
                  )}
                  <Button 
                    disabled={!canProceedToStep3} 
                    onClick={() => goToStep(3)}
                    className="h-9 px-6 bg-primary shadow-lg shadow-primary/20"
                  >
                    <span className="hidden sm:inline">Preview Credit Note</span>
                    <span className="sm:hidden">Preview</span>
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* STEP 3: Credit Note Preview — Two-Pane Layout           */}
          {/* ═══════════════════════════════════════════════════════ */}
          {currentStep === 3 && selectedCustomer && (
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
              <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[60%] overflow-y-auto">
                {/* Pinned: Document header */}
                <div className="shrink-0 bg-linear-to-r from-primary/5 to-primary/2 border-b border-border/40 p-5 dark:from-primary/10 dark:to-primary/3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Credit Note</p>
                    <p className="mt-1 font-mono text-xl font-bold">{creditNoteNumber}</p>
                    {selectedInvoiceNumbers.length > 1 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Filed as {selectedInvoiceNumbers.length} separate credit notes — one per invoice.
                      </p>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-x-8 gap-y-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                      <p className="mt-0.5 font-medium truncate" title={selectedCustomer.name}>{selectedCustomer.name}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Against {selectedInvoiceNumbers.length > 1 ? 'Invoices' : 'Invoice'}
                      </p>
                      <p className="mt-0.5 font-mono font-medium" title={selectedInvoiceNumbers.join(', ')}>{selectedInvoiceNumbers.join(', ')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Return Date</p>
                      <p className="mt-0.5 whitespace-nowrap">{formatDate(new Date().toISOString())}</p>
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
                      <div className="col-span-2 text-center">Amount</div>
                      <div className="col-span-2 text-center">Reason</div>
                    </div>
                    {selectedReturnItems.map((ri) => {
                      const lineRate = Number(ri.item.rate) * (1 - Number(ri.item.discountPercent) / 100)
                      const lineAmount = lineRate * ri.returnQty
                      const displayReason = ri.reason === 'Other' ? ri.customReason || 'Other' : ri.reason
                      const badgeVariant = reasonVariantMap[ri.reason || 'Other'] || 'secondary'
                      return (
                        <div key={ri.itemId} className="grid grid-cols-12 gap-2 border-b border-border/30 px-4 py-3 items-center text-sm">
                          <div className="col-span-4">
                            <p className="font-medium truncate">{ri.item.productName}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              <span className="text-primary">{ri.invoiceNumber}</span> · {ri.item.batchNumber}
                            </p>
                          </div>
                          <div className="col-span-1 text-center font-mono font-semibold">{ri.returnQty}</div>
                          <div className="col-span-2 text-right font-mono">{formatCurrency(lineRate)}</div>
                          <div className="col-span-1 text-right text-muted-foreground">{ri.item.gstPercent}%</div>
                          <div className="col-span-2 text-center font-mono font-semibold">{formatCurrency(lineAmount)}</div>
                          <div className="col-span-2 flex justify-center">
                            <Badge variant={badgeVariant} size="sm" dot>{displayReason}</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>

                {/* Pinned: Totals */}
                <div className="shrink-0 border-t border-border/40 bg-muted/10 px-5 py-4 dark:bg-muted/5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <Button variant="outline" size="sm" onClick={() => goToStep(2)}>
                      <ChevronLeft className="mr-1.5 h-4 w-4" />
                      Back to Items
                    </Button>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono font-medium">{formatCurrency(creditSummary.subtotal)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">GST Reversal</span>
                      <span className="font-mono font-medium">{formatCurrency(creditSummary.gstReversal)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Credit Total</span>
                      <span className="font-mono text-lg font-bold text-primary">{formatCurrency(creditSummary.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Mobile-only: Settlement + Confirm (lg+ uses right panel) */}
                <div className="lg:hidden border-t border-border/40 p-4 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Settlement Method</p>
                  <RadioGroup value={settlementOption} onValueChange={setSettlementOption} className="space-y-2">
                    {SETTLEMENT_OPTIONS.map((opt) => {
                      const isAdjust = opt.value === 'adjust'
                      const noOutstanding = isAdjust && (customerOutstanding ?? 0) <= 0
                      return (
                        <div
                          key={opt.value}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border p-3 transition-all',
                            noOutstanding
                              ? 'opacity-40 cursor-not-allowed border-border/30'
                              : cn(
                                  'cursor-pointer',
                                  settlementOption === opt.value
                                    ? 'border-primary/30 bg-primary/3 ring-1 ring-primary/10 dark:bg-primary/6'
                                    : 'border-border/40 hover:bg-muted/30'
                                )
                          )}
                          onClick={() => !noOutstanding && setSettlementOption(opt.value)}
                        >
                          <RadioGroupItem value={opt.value} id={`mobile-${opt.value}`} className="mt-0.5" disabled={noOutstanding} />
                          <Label htmlFor={`mobile-${opt.value}`} className={cn('space-y-0.5 flex-1', noOutstanding ? 'cursor-not-allowed' : 'cursor-pointer')}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{opt.title}</p>
                              {isAdjust && customerOutstanding !== null && (
                                <span className={cn('text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded', noOutstanding ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
                                  {noOutstanding ? 'No outstanding' : `₹${Number(customerOutstanding).toFixed(2)} due`}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                  <Button
                    className={`w-full ${isPharmacist ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                    onClick={handleConfirmReturn}
                  >
                    {isPharmacist
                      ? <ShieldCheck className="mr-1.5 h-4 w-4" />
                      : <RotateCcw className="mr-1.5 h-4 w-4" />
                    }
                    {isPharmacist ? 'Submit for Review' : 'Confirm Return & Submit for Review'}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => goToStep(2)}>
                    <ChevronLeft className="mr-1.5 h-4 w-4" />
                    Back to Items
                  </Button>
                </div>
              </div>

              {/* Right: Settlement & Actions — desktop only */}
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
                        {SETTLEMENT_OPTIONS.map((opt) => {
                          const isAdjust = opt.value === 'adjust'
                          const noOutstanding = isAdjust && (customerOutstanding ?? 0) <= 0
                          return (
                            <div
                              key={opt.value}
                              className={cn(
                                'flex items-start gap-3 rounded-xl border p-3 transition-all',
                                noOutstanding
                                  ? 'opacity-40 cursor-not-allowed border-border/30'
                                  : cn(
                                      'cursor-pointer',
                                      settlementOption === opt.value
                                        ? 'border-primary/30 bg-primary/3 ring-1 ring-primary/10 dark:bg-primary/6'
                                        : 'border-border/40 hover:bg-muted/30'
                                    )
                              )}
                              onClick={() => !noOutstanding && setSettlementOption(opt.value)}
                            >
                              <RadioGroupItem value={opt.value} id={opt.value} className="mt-0.5" disabled={noOutstanding} />
                              <Label htmlFor={opt.value} className={cn('space-y-0.5 flex-1', noOutstanding ? 'cursor-not-allowed' : 'cursor-pointer')}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">{opt.title}</p>
                                  {isAdjust && customerOutstanding !== null && (
                                    <span className={cn('text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded', noOutstanding ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
                                      {noOutstanding ? 'No outstanding' : `₹${Number(customerOutstanding).toFixed(2)} due`}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                              </Label>
                            </div>
                          )
                        })}
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
                            {SETTLEMENT_OPTIONS.find(o => o.value === settlementOption)?.title ?? 'Refund'}
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

                  </div>
                </ScrollArea>

                {/* Pinned action footer */}
                <div className="shrink-0 border-t border-border/40 bg-background p-4 flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={handlePrintCreditNote}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleDownloadCreditNote}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    className={`flex-1 ${isPharmacist ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                    onClick={handleConfirmReturn}
                  >
                    {isPharmacist
                      ? <ShieldCheck className="mr-1.5 h-4 w-4" />
                      : <RotateCcw className="mr-1.5 h-4 w-4" />
                    }
                    {isPharmacist ? 'Submit for Review' : 'Confirm Return & Submit for Review'}
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
