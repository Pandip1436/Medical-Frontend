import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { motion, AnimatePresence } from 'framer-motion'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import {
  ChevronRight,
  ChevronLeft,
  Check,
  FileText,
  Package,
  Receipt,
  AlertCircle,
  Minus,
  Plus,
  ArrowLeft,
  Printer,
  Download,
  CheckCircle2,
  ShieldAlert,
  BadgeAlert,
  HelpCircle,
  Truck,
  IndianRupee,
  RotateCcw,
} from 'lucide-react'
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
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import { printDebitNotePdf, downloadDebitNotePdf, type NoteData } from '@/lib/pdf/notesPdf'

// ─────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────

const RETURN_REASONS = [
  'Damaged in transit',
  'Near expiry / Expired',
  'Wrong product received',
  'Quality issue',
  'Excess supply',
  'Recall by manufacturer',
  'Other',
] as const

type ReturnReason = (typeof RETURN_REASONS)[number]

interface GRNItem {
  productId: string
  productName: string
  purchasedQty: number
  rate: number
  batchNumber: string
  expiryDate: string
  gstPercent: number
}

interface GRNReference {
  id: string
  grnNumber: string
  poNumber: string
  date: string
  supplierId: string
  supplierName: string
  items: GRNItem[]
  totalAmount: number
}

interface ReturnItemState {
  productId: string
  selected: boolean
  returnQty: number
  maxQty: number
  reason: ReturnReason | ''
  customReason: string
  productName: string
  rate: number
}

const reasonIcons: Record<string, typeof AlertCircle> = {
  'Damaged in transit': BadgeAlert,
  'Near expiry / Expired': ShieldAlert,
  'Wrong product received': Package,
  'Quality issue': AlertCircle,
  'Excess supply': Truck,
  'Recall by manufacturer': ShieldAlert,
  Other: HelpCircle,
}

const reasonVariantMap: Record<string, 'destructive' | 'warning' | 'info' | 'purple' | 'secondary'> = {
  'Damaged in transit': 'destructive',
  'Near expiry / Expired': 'destructive',
  'Wrong product received': 'warning',
  'Quality issue': 'warning',
  'Excess supply': 'info',
  'Recall by manufacturer': 'purple',
  Other: 'secondary',
}

const STEPS = [
  { number: 1, label: 'Select GRN', icon: FileText },
  { number: 2, label: 'Return Items', icon: Package },
  { number: 3, label: 'Debit Note', icon: Receipt },
] as const

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function PurchaseReturnsPage() {
  const [direction, setDirection] = useState(1)
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1
  const [grnSearch, setGrnSearch] = useState('')
  const [selectedGRN, setSelectedGRN] = useState<GRNReference | null>(null)

  // Real data
  const [grns, setGrns] = useState<GRNReference[]>([])
  const [grnsLoading, setGrnsLoading] = useState(true)

  const { batches, products, fetchMasterData } = useMasterDataStore()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])

  const fetchGRNsCallback = useCallback(() => {
    let cancelled = false
    const doFetch = async () => {
      setGrnsLoading(true)
      try {
        const res = await api.get('/grn')
        if (cancelled) return
        const raw = res.data.data || res.data
        const mapped: GRNReference[] = (Array.isArray(raw) ? raw : []).map((g: any) => ({
          id: g.id, grnNumber: g.grnNumber, poNumber: g.poId ?? '',
          date: g.date, supplierId: g.supplierId, supplierName: g.supplierName,
          totalAmount: Number(g.totalAmount),
          items: (g.items ?? []).map((it: any) => ({
            productId: it.productId, productName: it.productName,
            purchasedQty: it.receivedQty + it.freeQty,
            rate: Number(it.purchaseRate), batchNumber: it.batchNumber, expiryDate: it.expiryDate,
            gstPercent: Number(products.find((p) => p.id === it.productId)?.gstRate) || 12,
          })),
        }))
        setGrns(mapped)
      } catch {
        if (!cancelled) toast.error('Failed to load GRNs')
        setGrns([])
      } finally {
        if (!cancelled) setGrnsLoading(false)
      }
    }
    doFetch()
    return () => { cancelled = true }
  }, [products])
  useEffect(() => { return fetchGRNsCallback() }, [fetchGRNsCallback])

  useBranchRefresh(fetchGRNsCallback)

  const [lastCreatedReturn, setLastCreatedReturn] = useState<NoteData | null>(null)

  // Step 2
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])

  // Step 3
  const [settlementOption, setSettlementOption] = useState<string>('adjust')

  const debitNoteNumber = useMemo(() => `HS/DN/2025-26/${String(Math.floor(Math.random() * 900 + 100)).padStart(5, '0')}`, [])

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1)
    setCurrentStep(step)
  }

  const matchingGRNs = useMemo(() => {
    if (!grnSearch.trim()) return grns
    const q = grnSearch.toLowerCase()
    return grns.filter(
      (g) =>
        g.grnNumber.toLowerCase().includes(q) ||
        (g.poNumber ?? '').toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q)
    )
  }, [grnSearch, grns])

  const handleSelectGRN = (grn: GRNReference) => {
    setSelectedGRN(grn)
    setReturnItems(
      grn.items.map((item) => ({
        productId: item.productId,
        selected: false,
        returnQty: 0,
        maxQty: item.purchasedQty,
        reason: '',
        customReason: '',
        productName: item.productName,
        rate: item.rate,
      }))
    )
  }

  const toggleReturnItem = (productId: string) => {
    setReturnItems((prev) =>
      prev.map((ri) =>
        ri.productId === productId
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

  const updateReturnQty = (productId: string, qty: number) => {
    setReturnItems((prev) =>
      prev.map((ri) =>
        ri.productId === productId
          ? { ...ri, returnQty: Math.min(Math.max(0, qty), ri.maxQty) }
          : ri
      )
    )
  }

  const updateReturnReason = (productId: string, reason: ReturnReason) => {
    setReturnItems((prev) =>
      prev.map((ri) =>
        ri.productId === productId
          ? { ...ri, reason, customReason: reason === 'Other' ? ri.customReason : '' }
          : ri
      )
    )
  }

  const updateCustomReason = (productId: string, text: string) => {
    setReturnItems((prev) =>
      prev.map((ri) => (ri.productId === productId ? { ...ri, customReason: text } : ri))
    )
  }

  const selectedReturnItems = returnItems.filter((ri) => ri.selected && ri.returnQty > 0)
  const canProceedToStep3 = selectedReturnItems.length > 0 && selectedReturnItems.every((ri) => ri.reason !== '')

  const debitSummary = useMemo(() => {
    let subtotal = 0
    let cgst = 0
    let sgst = 0
    selectedReturnItems.forEach(ri => {
      const lineTaxable = ri.returnQty * ri.rate
      const grnItem = selectedGRN?.items.find(g => g.productId === ri.productId)
      const rate = grnItem?.gstPercent ?? 12
      const lineGst = lineTaxable * (rate / 100)
      subtotal += lineTaxable
      cgst += lineGst / 2
      sgst += lineGst / 2
    })
    return { subtotal, cgst, sgst, total: subtotal + cgst + sgst }
  }, [selectedReturnItems, selectedGRN])

  const handleConfirmReturn = async () => {
    if (!selectedGRN) return

    const payloadItems = selectedReturnItems.map((ri) => {
      const grnItem = selectedGRN.items.find((g) => g.productId === ri.productId)
      const batchNumber = grnItem?.batchNumber ?? ''
      const expiryDate = grnItem?.expiryDate ?? new Date().toISOString()
      const gstPercent = grnItem?.gstPercent ?? 12
      const batch = batches.find(
        (b) => b.productId === ri.productId && b.batchNumber === batchNumber,
      )
      const lineAmount = ri.returnQty * ri.rate
      const gstAmount = lineAmount * (gstPercent / 100)
      return {
        productId: ri.productId,
        productName: ri.productName,
        batchId: batch?.id ?? '',
        batchNumber,
        expiryDate: new Date(expiryDate).toISOString(),
        returnedQty: ri.returnQty,
        purchaseRate: Number(ri.rate),
        gstPercent,
        amount: Number((lineAmount + gstAmount).toFixed(2)),
      }
    })

    if (payloadItems.some((it) => !it.batchId)) {
      toast.error('Could not resolve batch for one or more items. Refresh master data and retry.')
      return
    }

    const reasonSummary = Array.from(
      new Set(
        selectedReturnItems.map((ri) =>
          ri.reason === 'Other' && ri.customReason ? ri.customReason : ri.reason,
        ),
      ),
    ).join(', ')

    const totalGst = payloadItems.reduce(
      (s, it) => s + (it.amount - it.returnedQty * it.purchaseRate),
      0,
    )

    const payload = {
      supplierId: selectedGRN.supplierId,
      supplierName: selectedGRN.supplierName,
      grnId: selectedGRN.id,
      reason: reasonSummary,
      items: payloadItems,
      subtotal: Number(debitSummary.subtotal.toFixed(2)),
      cgst: Number((totalGst / 2).toFixed(2)),
      sgst: Number((totalGst / 2).toFixed(2)),
      totalAmount: Number((debitSummary.subtotal + totalGst).toFixed(2)),
      status: 'SENT',
      notes: `Settlement Preference: ${settlementOption.toUpperCase()}`,
    }

    try {
      const res = await api.post('/purchase-returns', payload)
      const noteNo = res.data.debitNoteNo ?? debitNoteNumber
      toast.success(`Debit Note ${noteNo} created successfully`, {
        description: `${formatCurrency(debitSummary.total)} will be settled via ${settlementOption}.`,
      })
      setLastCreatedReturn({
        noteNo,
        date: res.data.date ?? new Date().toISOString(),
        partyLabel: 'Supplier',
        partyName: selectedGRN.supplierName,
        referenceLabel: 'GRN No',
        referenceValue: selectedGRN.grnNumber,
        reason: payload.reason,
        items: payloadItems.map((it) => ({
          productName: it.productName,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate,
          returnedQty: it.returnedQty,
          rate: it.purchaseRate,
          gstPercent: it.gstPercent,
          amount: it.amount,
        })),
        subtotal: payload.subtotal,
        cgst: payload.cgst,
        sgst: payload.sgst,
        totalAmount: payload.totalAmount,
      })
      setCurrentStep(1)
      setDirection(-1)
      setSelectedGRN(null)
      setReturnItems([])
      setGrnSearch('')
      setSettlementOption('adjust')
      navigate('/purchase/debit-notes')
    } catch {
      // api.ts shows an error toast
    }
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">

      {/* ── Fixed Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (currentStep > 1) goToStep(currentStep - 1)
              else navigate('/purchase/debit-notes')
            }}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Purchase Return Wizard</h1>
            <p className="text-[11px] text-muted-foreground">
              Return goods to suppliers and generate debit notes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {STEPS.map((step, idx) => {
              const isActive = currentStep === step.number
              const isCompleted = currentStep > step.number
              return (
                <div key={step.number} className="flex items-center">
                  <button
                    onClick={() => { if (isCompleted) goToStep(step.number) }}
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
                    <div className={cn('mx-1 h-px w-6', isCompleted ? 'bg-primary' : 'bg-border')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Main Content (Wizard Only) ── */}
      <div className="flex-1 overflow-hidden">
        <div className="relative flex h-full flex-col overflow-hidden bg-muted/20">
          <AnimatePresence mode="wait" custom={direction}>

              {/* ── STEP 1: Select GRN ── */}
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
                  {/* Left: GRN Search List */}
                  <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[55%]">
                    <div className="shrink-0 border-b border-border/40 p-4 bg-muted/10 dark:bg-muted/5">
                      <DataTableFilterBar
                        searchQuery={grnSearch}
                        onSearchChange={setGrnSearch}
                        searchPlaceholder="Search by GRN number, PO number, or supplier..."
                        resultsCount={matchingGRNs.length}
                      />
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-2">
                        {grnsLoading && (
                          <div className="space-y-2 px-2 py-2">
                            {[...Array(4)].map((_, i) => (
                              <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                                <div className="h-9 w-9 rounded-lg bg-muted animate-pulse shrink-0" />
                                <div className="flex-1 space-y-2">
                                  <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {!grnsLoading && matchingGRNs.length === 0 && grnSearch.trim() && (
                          <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                              <AlertCircle className="h-6 w-6 text-muted-foreground/40" />
                            </div>
                            <p className="text-sm text-muted-foreground">
                              No GRN records found for &ldquo;{grnSearch}&rdquo;
                            </p>
                          </div>
                        )}
                        {!grnsLoading && matchingGRNs.map((grn) => (
                          <div
                            key={grn.id}
                            onClick={() => handleSelectGRN(grn)}
                            className={cn(
                              'group flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 transition-all',
                              selectedGRN?.id === grn.id
                                ? 'bg-primary/8 ring-1 ring-primary/20 dark:bg-primary/10'
                                : 'hover:bg-muted/40'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                                selectedGRN?.id === grn.id
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border/60 bg-muted/30 group-hover:border-border'
                              )}>
                                {selectedGRN?.id === grn.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>
                              <div>
                                <p className="font-mono text-sm font-medium">{grn.grnNumber}</p>
                                <p className="text-xs text-muted-foreground">{grn.supplierName}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold">{formatCurrency(grn.totalAmount)}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDate(grn.date)} &middot; {grn.items.length} items
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Right: GRN Detail Panel */}
                  <div className="hidden flex-col overflow-hidden lg:flex lg:w-[45%]">
                    {!selectedGRN ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 dark:bg-muted/15">
                          <Receipt className="h-7 w-7 text-muted-foreground/30" />
                        </div>
                        <p className="text-sm text-muted-foreground">Select a GRN to see details</p>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col">
                        <div className="shrink-0 border-b border-border/40 p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected GRN</p>
                              <p className="mt-1 font-mono text-lg font-bold">{selectedGRN.grnNumber}</p>
                            </div>
                            <Badge variant="success" size="sm" dot>Received</Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</p>
                              <p className="mt-0.5 text-sm font-medium">{selectedGRN.supplierName}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</p>
                              <p className="mt-0.5 text-sm">{formatDate(selectedGRN.date)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                              <p className="mt-0.5 font-mono text-sm font-bold">{formatCurrency(selectedGRN.totalAmount)}</p>
                            </div>
                          </div>
                        </div>
                        <ScrollArea className="min-h-0 flex-1">
                          <div className="p-5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                              Items ({selectedGRN.items.length})
                            </p>
                            <div className="space-y-2">
                              {selectedGRN.items.map((item) => (
                                <div key={item.productId} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 p-3 dark:bg-muted/10">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{item.productName}</p>
                                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                      <span>Qty: {item.purchasedQty}</span>
                                      <span>&middot;</span>
                                      <span>Rate: {formatCurrency(item.rate)}</span>
                                    </div>
                                  </div>
                                  <p className="font-mono text-sm font-semibold ml-4">{formatCurrency(item.purchasedQty * item.rate)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </ScrollArea>
                        <div className="shrink-0 border-t border-border/40 bg-muted/10 p-4">
                          <Button className="w-full" onClick={() => goToStep(2)}>
                            Continue to Select Items
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mobile continue button */}
                  {selectedGRN && (
                    <div className="fixed bottom-0 left-0 right-0 border-t border-border/40 bg-background p-4 lg:hidden">
                      <Button className="w-full" onClick={() => goToStep(2)}>
                        Continue with {selectedGRN.grnNumber}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── STEP 2: Select Items ── */}
              {currentStep === 2 && selectedGRN && (
                <motion.div
                  key="step2"
                  custom={direction}
                  initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="absolute inset-0 flex flex-col"
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-6 py-3">
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-muted-foreground">Returning items from</p>
                      <Badge variant="outline" size="lg" className="font-mono">{selectedGRN.grnNumber}</Badge>
                      <span className="text-sm text-muted-foreground">&middot;</span>
                      <span className="text-sm font-medium">{selectedGRN.supplierName}</span>
                    </div>
                    {selectedReturnItems.length > 0 && (
                      <Badge variant="info" dot size="sm">
                        {selectedReturnItems.length} item{selectedReturnItems.length !== 1 ? 's' : ''} selected
                      </Badge>
                    )}
                  </div>

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
                          <TableHead className="w-25 px-2 py-3 text-center">Purchased Qty</TableHead>
                          <TableHead className="w-35 px-2 py-3 text-center">Return Qty</TableHead>
                          <TableHead className="w-50 px-2 py-3">Return Reason</TableHead>
                          <TableHead className="w-30 px-4 py-3 text-right">Return Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {returnItems.map((ri) => {
                          const totalRefund = ri.rate * ri.returnQty
                          return (
                            <TableRow
                              key={ri.productId}
                              className={cn(
                                'group transition-colors',
                                ri.selected ? 'bg-primary/3 hover:bg-primary/5' : 'hover:bg-muted/30'
                              )}
                            >
                              <TableCell className="px-4 py-3 text-center">
                                <Checkbox
                                  checked={ri.selected}
                                  onCheckedChange={() => toggleReturnItem(ri.productId)}
                                />
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <div className="space-y-1">
                                  <p className="text-xs font-bold leading-none">{ri.productName}</p>
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                    <span className="font-mono bg-muted px-1 rounded">{ri.productId}</span>
                                    <span>Rate: {formatCurrency(ri.rate)}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-2 py-3 text-center">
                                <span className="text-xs font-bold tabular-nums text-muted-foreground/40">{ri.maxQty}</span>
                              </TableCell>
                              <TableCell className="px-2 py-3">
                                {ri.selected ? (
                                  <div className="flex items-center gap-1 justify-center">
                                    <Button variant="outline" size="icon-sm" className="h-6 w-6 rounded-md"
                                      onClick={() => updateReturnQty(ri.productId, ri.returnQty - 1)}
                                      disabled={ri.returnQty <= 1}>
                                      <Minus className="h-2.5 w-2.5" />
                                    </Button>
                                    <input
                                      type="number"
                                      value={ri.returnQty}
                                      onChange={(e) => updateReturnQty(ri.productId, parseInt(e.target.value) || 0)}
                                      className="w-10 h-6 bg-transparent border-0 text-[11px] font-black font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/20 rounded"
                                    />
                                    <Button variant="outline" size="icon-sm" className="h-6 w-6 rounded-md"
                                      onClick={() => updateReturnQty(ri.productId, ri.returnQty + 1)}
                                      disabled={ri.returnQty >= ri.maxQty}>
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
                                    <Select value={ri.reason} onValueChange={(val) => updateReturnReason(ri.productId, val as ReturnReason)}>
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
                                        onChange={(e) => updateCustomReason(ri.productId, e.target.value)}
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
                                  'text-xs font-black font-mono tracking-tight',
                                  totalRefund > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/20'
                                )}>
                                  {totalRefund > 0 ? formatCurrency(totalRefund) : '₹0.00'}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

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
                            {formatCurrency(debitSummary.total)}
                          </span>
                        </p>
                      )}
                      <Button disabled={!canProceedToStep3} onClick={() => goToStep(3)}>
                        Preview Debit Note
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Debit Note Preview ── */}
              {currentStep === 3 && selectedGRN && (
                <motion.div
                  key="step3"
                  custom={direction}
                  initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="absolute inset-0 flex"
                >
                  {/* Left: Document Preview */}
                  <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[60%]">
                    <div className="shrink-0 bg-linear-to-r from-primary/5 to-primary/2 border-b border-border/40 p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Debit Note</p>
                          <p className="mt-1 font-mono text-xl font-bold">{debitNoteNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Against GRN</p>
                          <p className="font-mono text-sm font-medium">{selectedGRN.grnNumber}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</p>
                          <p className="mt-0.5 font-medium">{selectedGRN.supplierName}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GRN Date</p>
                          <p className="mt-0.5">{formatDate(selectedGRN.date)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Return Date</p>
                          <p className="mt-0.5">{formatDate(new Date().toISOString())}</p>
                        </div>
                      </div>
                    </div>

                    <ScrollArea className="min-h-0 flex-1">
                      <div className="px-5 py-3">
                        <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 rounded-t-lg bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-muted/20">
                          <div className="col-span-4">Product</div>
                          <div className="col-span-2 text-center">Qty</div>
                          <div className="col-span-2 text-right">Rate</div>
                          <div className="col-span-2 text-right">Amount</div>
                          <div className="col-span-2">Reason</div>
                        </div>
                        {selectedReturnItems.map((ri) => {
                          const lineAmount = ri.rate * ri.returnQty
                          const displayReason = ri.reason === 'Other' ? ri.customReason || 'Other' : ri.reason
                          const badgeVariant = reasonVariantMap[ri.reason || 'Other'] || 'secondary'
                          return (
                            <div key={ri.productId} className="grid grid-cols-12 gap-2 border-b border-border/30 px-4 py-3 items-center text-sm">
                              <div className="col-span-4">
                                <p className="font-medium truncate">{ri.productName}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{ri.productId}</p>
                              </div>
                              <div className="col-span-2 text-center font-mono font-semibold">{ri.returnQty}</div>
                              <div className="col-span-2 text-right font-mono">{formatCurrency(ri.rate)}</div>
                              <div className="col-span-2 text-right font-mono font-semibold">{formatCurrency(lineAmount)}</div>
                              <div className="col-span-2">
                                <Badge variant={badgeVariant} size="sm" dot>{displayReason}</Badge>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>

                    <div className="shrink-0 border-t border-border/40 bg-muted/10 px-5 py-4 dark:bg-muted/5">
                      <div className="flex items-center justify-end gap-8">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Items</span>
                          <span className="font-mono font-medium">{selectedReturnItems.length}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Total Qty</span>
                          <span className="font-mono font-medium">{selectedReturnItems.reduce((sum, ri) => sum + ri.returnQty, 0)}</span>
                        </div>
                        <Separator orientation="vertical" className="h-6" />
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Debit Total</span>
                          <span className="font-mono text-lg font-bold text-primary">{formatCurrency(debitSummary.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Settlement & Actions */}
                  <div className="hidden lg:flex lg:w-[40%] flex-col overflow-hidden">
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-5 space-y-5">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Settlement Method</p>
                          <RadioGroup value={settlementOption} onValueChange={setSettlementOption} className="space-y-2">
                            {[
                              { value: 'adjust', title: 'Adjust Against Outstanding', desc: 'Deduct from next payment to supplier', icon: RotateCcw },
                              { value: 'replacement', title: 'Request Replacement', desc: 'Get replacement goods from supplier', icon: Package },
                              { value: 'refund', title: 'Request Refund', desc: 'Get monetary refund from supplier', icon: IndianRupee },
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
                                <RadioGroupItem value={opt.value} id={`pr-${opt.value}`} className="mt-0.5" />
                                <Label htmlFor={`pr-${opt.value}`} className="cursor-pointer space-y-0.5 flex-1">
                                  <p className="text-sm font-medium">{opt.title}</p>
                                  <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>

                        <Separator />

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Return Summary</p>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">GRN Reference</span>
                              <span className="font-mono text-xs font-medium">{selectedGRN.grnNumber}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Items Returned</span>
                              <span className="font-semibold">{selectedReturnItems.length}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Total Units</span>
                              <span className="font-semibold">{selectedReturnItems.reduce((sum, ri) => sum + ri.returnQty, 0)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span className="font-mono">{formatCurrency(debitSummary.subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">CGST</span>
                              <span className="font-mono">{formatCurrency(debitSummary.cgst)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">SGST</span>
                              <span className="font-mono">{formatCurrency(debitSummary.sgst)}</span>
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">Total Debit</span>
                              <span className="font-mono text-lg font-bold text-primary">{formatCurrency(debitSummary.total)}</span>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">After Creating</p>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1" disabled={!lastCreatedReturn}
                              onClick={() => lastCreatedReturn && printDebitNotePdf(lastCreatedReturn)}>
                              <Printer className="mr-1.5 h-3.5 w-3.5" />
                              Print
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1" disabled={!lastCreatedReturn}
                              onClick={() => lastCreatedReturn && downloadDebitNotePdf(lastCreatedReturn)}>
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>

                    <div className="shrink-0 border-t border-border/40 bg-background p-4 space-y-2">
                      <Button className="w-full" onClick={handleConfirmReturn}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Confirm Return &amp; Create Debit Note
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
    </div>
  )
}

