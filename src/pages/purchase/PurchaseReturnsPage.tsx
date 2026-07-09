import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { motion, AnimatePresence } from 'framer-motion'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
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
  ShieldCheck,
  Loader2,
  ShieldAlert,
  BadgeAlert,
  HelpCircle,
  Truck,
  IndianRupee,
  RotateCcw,
  FileWarning,
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
import { navigate, goBack, useRoute } from '@/lib/router'
import { toast } from 'sonner'
import { printDebitNotePdf, downloadDebitNotePdf, type NoteData } from '@/lib/pdf/notesPdf'

// ─────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────

// Reasons here are exclusively for *physical-goods* returns — items that
// arrived and are being sent back. Short-billing claims (supplier billed for
// goods that never came) live in a separate flow (ShortBillingDialog) since
// they don't touch stock.
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
  damagedQty: number
  rate: number
  batchNumber: string
  expiryDate: string
  gstPercent: number
}

interface GRNReference {
  id: string
  grnNumber: string
  supplierInvoiceNo: string
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
  damagedQty: number
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
  { number: 1, label: 'Select PE', icon: FileText },
  { number: 2, label: 'Return Items', icon: Package },
  { number: 3, label: 'Debit Note', icon: Receipt },
] as const

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function PurchaseReturnsPage() {
  const { search } = useRoute()
  const userRole = useAuthStore((s) => s.user?.role)
  const businessProfile = useSettingsStore((s) => s.businessProfile)
  const needsApproval = userRole === 'PHARMACIST' || userRole === 'INVENTORY_MANAGER'

  // Pre-select GRN from URL param (e.g. navigated from Purchase Received page)
  const preselectedGrnId = useMemo(() => new URLSearchParams(search).get('grnId') ?? '', [search])

  // Short-delivery prefill from GRN page post-confirm dialog
  const shortageParams = useMemo(() => {
    const p = new URLSearchParams(search)
    const grnId = p.get('shortageGrnId') ?? ''
    const supplierId = p.get('supplierId') ?? ''
    const supplierName = p.get('supplierName') ?? ''
    const raw = p.get('shortItems')
    let items: Array<{ productId: string; productName: string; orderedQty: number; receivedQty: number; rate: number; batchNumber: string; expiryDate: string; gstPercent: number; supplierId: string; supplierName: string }> = []
    if (raw) { try { items = JSON.parse(raw) } catch { items = [] } }
    return grnId ? { grnId, supplierId, supplierName, items } : null
  }, [search])

  // Batch prefill — navigated from Batch Detail's "Create Return". We get the
  // batch number (unique to the PE that received it) so we can auto-find the PE
  // and pre-select that exact line on step 2.
  const batchParams = useMemo(() => {
    const p = new URLSearchParams(search)
    const batchNumber = p.get('batchNumber') ?? ''
    const productId = p.get('productId') ?? ''
    return batchNumber ? { batchNumber, productId } : null
  }, [search])

  const [direction, setDirection] = useState(1)
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1
  const [grnSearch, setGrnSearch] = useState('')
  const [selectedGRN, setSelectedGRN] = useState<GRNReference | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

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
        type RawGrnItem = {
          productId: string; productName: string;
          receivedQty: number; freeQty?: number;
          damageQty?: number; purchaseRate: number | string;
          batchNumber: string; expiryDate: string;
        }
        type RawGrn = {
          id: string; grnNumber: string; supplierInvoiceNo?: string; poId?: string;
          date: string; supplierId: string; supplierName: string;
          totalAmount: number | string; items?: RawGrnItem[];
        }
        const mapped: GRNReference[] = (Array.isArray(raw) ? raw : []).map((g: RawGrn) => ({
          id: g.id, grnNumber: g.grnNumber, supplierInvoiceNo: g.supplierInvoiceNo ?? '', poNumber: g.poId ?? '',
          date: g.date, supplierId: g.supplierId, supplierName: g.supplierName,
          totalAmount: Number(g.totalAmount),
          items: (g.items ?? []).map((it: RawGrnItem) => ({
            productId: it.productId, productName: it.productName,
            purchasedQty: it.receivedQty + (it.freeQty ?? 0),
            damagedQty: Number(it.damageQty ?? 0),
            rate: Number(it.purchaseRate), batchNumber: it.batchNumber, expiryDate: it.expiryDate,
            gstPercent: Number(products.find((p) => p.id === it.productId)?.gstRate) || 12,
          })),
        }))
        setGrns(mapped)
      } catch {
        if (!cancelled) toast.error('Failed to load goods received notes')
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
  // Guards against a double-click firing two POST /purchase-returns (which would
  // create duplicate debit notes).
  const [submitting, setSubmitting] = useState(false)
  const [shortageApplied, setShortageApplied] = useState(false)

  // Step 2
  const [returnItems, setReturnItems] = useState<ReturnItemState[]>([])

  // Step 3
  const [settlementOption, setSettlementOption] = useState<string>('adjust')
  const [supplierOutstanding, setSupplierOutstanding] = useState<number>(0)

  // Fetch supplier outstanding when GRN is selected
  useEffect(() => {
    if (!selectedGRN?.supplierId) { setSupplierOutstanding(0); return }
    let cancelled = false
    api.get(`/suppliers/${selectedGRN.supplierId}`)
      .then(res => { if (!cancelled) setSupplierOutstanding(Number(res.data?.currentOutstanding ?? 0)) })
      .catch(() => { if (!cancelled) setSupplierOutstanding(0) })
    return () => { cancelled = true }
  }, [selectedGRN?.supplierId])

  // Auto-fallback: if Adjust is selected but supplier has no outstanding, switch to Refund
  const effectiveSettlementOption = useMemo(() => {
    if (settlementOption === 'adjust' && supplierOutstanding <= 0) return 'refund'
    return settlementOption
  }, [settlementOption, supplierOutstanding])

  const debitNoteNumber = useMemo(() => `HS/DN/2025-26/${String(Math.floor(Math.random() * 900 + 100)).padStart(5, '0')}`, [])

  // goToStep needs current `currentStep` to compute direction, but we don't
  // want effects below to re-fire whenever currentStep changes. Read via ref
  // so the callback identity stays stable.
  const currentStepRef = useRef(currentStep)
  useEffect(() => { currentStepRef.current = currentStep }, [currentStep])
  const goToStep = useCallback((step: number) => {
    setDirection(step > currentStepRef.current ? 1 : -1)
    setCurrentStep(step)
  }, [])

  // Auto-select and advance to step 2 when navigated from Purchase Received.
  // selectedGRN here is an intentional guard, not a trigger — listing it would
  // cause the effect to fire after we set it. eslint warns; we accept it.
  useEffect(() => {
    if (!preselectedGrnId || !grns.length || selectedGRN) return
    const match = grns.find(g => g.id === preselectedGrnId)
    if (!match) return
    handleSelectGRN(match)
    setGrnSearch(match.grnNumber)
    goToStep(2)
    // handleSelectGRN is defined later in the component (TDZ); we accept the
    // dep-warning rather than refactor declaration order.
  }, [preselectedGrnId, grns, goToStep]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-prefill shortage items when navigated from GRN short-supply dialog
  useEffect(() => {
    if (!shortageParams || shortageApplied || !grns.length) return
    const match = grns.find(g => g.id === shortageParams.grnId)
    if (!match) return
    setShortageApplied(true)
    // Build a synthetic GRN from the short items — these are items NOT received (qty = orderedQty - receivedQty)
    const syntheticGRN: GRNReference = {
      id: match.id,
      grnNumber: match.grnNumber,
      supplierInvoiceNo: match.supplierInvoiceNo,
      poNumber: match.poNumber,
      date: match.date,
      supplierId: shortageParams.supplierId,
      supplierName: shortageParams.supplierName,
      totalAmount: match.totalAmount,
      items: shortageParams.items.map(si => ({
        productId: si.productId,
        productName: si.productName,
        purchasedQty: si.orderedQty - si.receivedQty, // only the shortage qty
        damagedQty: 0,
        rate: si.rate,
        batchNumber: si.batchNumber,
        expiryDate: si.expiryDate,
        gstPercent: si.gstPercent,
      })),
    }
    setSelectedGRN(syntheticGRN)
    setGrnSearch(match.grnNumber)
    // Pre-select all shortage items with reason "Short delivery" (supplier sent less than billed)
    setReturnItems(
      syntheticGRN.items.map(item => ({
        productId: item.productId,
        selected: true,
        returnQty: item.purchasedQty,
        maxQty: item.purchasedQty,
        damagedQty: 0,
        reason: 'Short delivery' as ReturnReason,
        customReason: '',
        productName: item.productName,
        rate: item.rate,
      }))
    )
    goToStep(2)
  }, [shortageParams, grns, shortageApplied, goToStep])

  // Auto-select the PE and pre-select the batch's line when navigated from the
  // Batch Detail page. The batch number uniquely identifies the receiving PE, so
  // we find the GRN that contains it, jump to step 2, and tick that line ready
  // to return (qty defaulted to the full received quantity).
  useEffect(() => {
    if (!batchParams || !grns.length || selectedGRN) return
    // Prefer the PE whose line matches BOTH batch number and product (batch
    // numbers can repeat across products/suppliers); fall back to batch-only.
    const match =
      grns.find((g) =>
        g.items.some(
          (it) =>
            it.batchNumber === batchParams.batchNumber &&
            it.productId === batchParams.productId,
        ),
      ) ??
      grns.find((g) =>
        g.items.some((it) => it.batchNumber === batchParams.batchNumber),
      )
    if (!match) return
    setSelectedGRN(match)
    setGrnSearch(match.grnNumber)
    setReturnItems(
      match.items.map((item) => {
        const isTarget = item.batchNumber === batchParams.batchNumber
        const damaged = item.damagedQty > 0
        return {
          productId: item.productId,
          // Pre-tick the batch we came in for; keep damaged-item auto-select too.
          selected: isTarget || damaged,
          returnQty: isTarget ? item.purchasedQty : damaged ? item.damagedQty : 0,
          maxQty: item.purchasedQty,
          damagedQty: item.damagedQty,
          reason: damaged ? ('Damaged in transit' as ReturnReason) : '',
          customReason: '',
          productName: item.productName,
          rate: item.rate,
        }
      }),
    )
    goToStep(2)
  }, [batchParams, grns, goToStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchingGRNs = useMemo(() => {
    if (!grnSearch.trim()) return grns
    const q = grnSearch.toLowerCase()
    return grns.filter(
      (g) =>
        (g.supplierInvoiceNo ?? '').toLowerCase().includes(q) ||
        g.grnNumber.toLowerCase().includes(q) ||
        (g.poNumber ?? '').toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        // Match by any contained product name or batch number so users can find
        // the PE to return against by typing a product / batch they received.
        g.items.some(
          (it) =>
            (it.productName ?? '').toLowerCase().includes(q) ||
            (it.batchNumber ?? '').toLowerCase().includes(q),
        )
    )
  }, [grnSearch, grns])

  useEffect(() => {
    setCurrentPage(1)
  }, [grnSearch])

  const totalPages = Math.max(1, Math.ceil(matchingGRNs.length / PAGE_SIZE))
  const paginatedMatchingGRNs = matchingGRNs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleSelectGRN = (grn: GRNReference) => {
    setSelectedGRN(grn)
    setReturnItems(
      grn.items.map((item) => ({
        productId: item.productId,
        // Auto-select and pre-fill qty/reason for damaged items
        selected: item.damagedQty > 0,
        returnQty: item.damagedQty > 0 ? item.damagedQty : 0,
        maxQty: item.purchasedQty,
        damagedQty: item.damagedQty,
        reason: item.damagedQty > 0 ? 'Damaged in transit' as ReturnReason : '',
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
      // The purchase rate is GST-INCLUSIVE, so lineAmount already contains the
      // tax. Back the GST out instead of adding it on top — the debit equals
      // what was paid to the supplier, not amount + GST again.
      const lineAmount = ri.returnQty * ri.rate
      const grnItem = selectedGRN?.items.find(g => g.productId === ri.productId)
      const rate = grnItem?.gstPercent ?? 12
      const lineTaxable = lineAmount / (1 + rate / 100)
      const lineGst = lineAmount - lineTaxable
      subtotal += lineTaxable
      cgst += lineGst / 2
      sgst += lineGst / 2
    })
    return { subtotal, cgst, sgst, total: subtotal + cgst + sgst }
  }, [selectedReturnItems, selectedGRN])

  const handleConfirmReturn = async () => {
    if (!selectedGRN || submitting) return

    const payloadItems = selectedReturnItems.map((ri) => {
      const grnItem = selectedGRN.items.find((g) => g.productId === ri.productId)
      const batchNumber = grnItem?.batchNumber ?? ''
      const expiryDate = grnItem?.expiryDate ?? new Date().toISOString()
      const gstPercent = grnItem?.gstPercent ?? 12
      const batch = batches.find(
        (b) => b.productId === ri.productId && b.batchNumber === batchNumber,
      )
      // GST-inclusive line amount — that IS the debit; don't add GST again.
      const lineAmount = ri.returnQty * ri.rate
      return {
        productId: ri.productId,
        productName: ri.productName,
        batchId: batch?.id ?? '',
        batchNumber,
        expiryDate: new Date(expiryDate).toISOString(),
        returnedQty: ri.returnQty,
        purchaseRate: Number(ri.rate),
        gstPercent,
        amount: Number(lineAmount.toFixed(2)),
      }
    })

    const unresolved = payloadItems.filter((it) => !it.batchId)
    if (unresolved.length > 0) {
      const names = unresolved.map((it) => `${it.productName} (batch ${it.batchNumber || '—'})`).join(', ')
      toast.error(`Could not resolve batch for: ${names}. Refresh master data and retry, or pick a different PE.`, {
        duration: 8000,
      })
      return
    }

    const reasonSummary = Array.from(
      new Set(
        selectedReturnItems.map((ri) =>
          ri.reason === 'Other' && ri.customReason ? ri.customReason : ri.reason,
        ),
      ),
    ).join(', ')

    // GST contained within each GST-inclusive line amount.
    const totalGst = payloadItems.reduce(
      (s, it) => s + (it.amount - it.amount / (1 + it.gstPercent / 100)),
      0,
    )

    const settlementMode =
      effectiveSettlementOption === 'replacement' ? 'REPLACEMENT'
      : effectiveSettlementOption === 'adjust' ? 'ADJUST'
      : 'REFUND'

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
      settlementMode,
    }

    setSubmitting(true)
    try {
      const res = await api.post('/purchase-returns', payload)
      if (res.data?.approvalRequested) {
        toast.success(
          'Approval request sent to admin. You can track its status in Approvals.',
          {
            duration: 8000,
            action: {
              label: 'View approvals',
              onClick: () => navigate('/admin/approvals'),
            },
          },
        )
        setCurrentStep(1)
        setDirection(-1)
        setSelectedGRN(null)
        setReturnItems([])
        setGrnSearch('')
        setSettlementOption('adjust')
        return
      }
      const noteNo = res.data.debitNoteNo ?? debitNoteNumber
      toast.success(`Debit Note ${noteNo} created successfully`, {
        description: `${formatCurrency(debitSummary.total)} will be settled via ${settlementOption}.`,
      })
      setLastCreatedReturn({
        noteNo,
        date: res.data.date ?? new Date().toISOString(),
        partyLabel: 'Supplier',
        partyName: selectedGRN.supplierName,
        referenceLabel: 'PE No',
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
        company: businessProfile ? {
          name: businessProfile.name,
          address: businessProfile.address,
          phone: businessProfile.phone,
          email: businessProfile.email,
          gstin: businessProfile.gstin,
        } : undefined,
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
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">

      {/* ── Fixed Header ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-background px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (currentStep > 1) goToStep(currentStep - 1)
              else goBack('/purchase/debit-notes')
            }}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Purchase Return Wizard</h2>
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
                    {shortageParams && (
                      <div className="shrink-0 flex items-center gap-2 border-b border-amber-200/60 bg-amber-50/50 px-4 py-2.5 dark:border-amber-800/30 dark:bg-amber-900/10">
                        <FileWarning className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Short delivery from {shortageParams.supplierName} — raising debit note for {shortageParams.items.length} undelivered product(s).
                        </span>
                      </div>
                    )}
                    <div className="shrink-0 border-b border-border/40 p-4 bg-muted/10 dark:bg-muted/5">
                      <DataTableFilterBar
                        searchQuery={grnSearch}
                        onSearchChange={setGrnSearch}
                        searchPlaceholder="Search by PE, PO, supplier, product, or batch..."
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
                              No PE records found for &ldquo;{grnSearch}&rdquo;
                            </p>
                          </div>
                        )}
                        {!grnsLoading && paginatedMatchingGRNs.map((grn) => (
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
                                <p className="font-mono text-sm font-medium">{grn.supplierInvoiceNo || grn.grnNumber}</p>
                                <p className="text-xs text-muted-foreground">
                                  {grn.supplierName}
                                  {grn.supplierInvoiceNo && <> &middot; <span className="font-mono">{grn.grnNumber}</span></>}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold">{formatCurrency(grn.totalAmount)}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDate(grn.date)} &middot; {grn.items.length} {grn.items.length === 1 ? 'item' : 'items'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md px-4 py-3 sm:px-6">
                      <DataTablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        totalItems={matchingGRNs.length}
                        itemsPerPage={PAGE_SIZE}
                        className="justify-center! gap-2! py-0! [&>div]:ml-0! [&_button]:h-9! [&_input]:h-9!"
                      />
                    </div>
                  </div>

                  {/* Right: GRN Detail Panel */}
                  <div className="hidden flex-col overflow-hidden lg:flex lg:w-[45%]">
                    {!selectedGRN ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-8">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30 dark:bg-muted/15">
                          <Receipt className="h-7 w-7 text-muted-foreground/30" />
                        </div>
                        <p className="text-sm text-muted-foreground">Select a PE to see details</p>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col">
                        <div className="shrink-0 border-b border-border/40 p-5">
                          <div className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)_6rem_5rem] items-end gap-x-6 gap-y-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected PE</p>
                              <p className="mt-0.5 font-mono text-sm font-bold truncate" title={selectedGRN.grnNumber}>{selectedGRN.grnNumber}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</p>
                              <p className="mt-0.5 text-sm font-medium truncate" title={selectedGRN.supplierName}>{selectedGRN.supplierName}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</p>
                              <p className="mt-0.5 text-sm whitespace-nowrap">{formatDate(selectedGRN.date)}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                              <p className="mt-0.5 font-mono text-sm font-bold whitespace-nowrap truncate">{formatCurrency(selectedGRN.totalAmount)}</p>
                            </div>
                          </div>
                        </div>
                        <ScrollArea className="min-h-0 flex-1">
                          <div className="p-5">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Items ({selectedGRN.items.length})
                              </p>
                              <Badge variant="success" size="sm" dot>Received</Badge>
                            </div>
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
                        <div className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md px-4 py-3 sm:px-6">
                          <button
                            type="button"
                            onClick={() => goToStep(2)}
                            className="flex w-full h-9 items-center justify-center gap-1 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-150 hover:bg-primary/90 active:scale-[0.97]"
                          >
                            Continue to Select Items
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mobile continue button */}
                  {/* responsive: sits above the fixed bottom nav (4rem + safe-area)
                      so it isn't hidden behind it on phones */}
                  {selectedGRN && (
                    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border/40 bg-background p-4 lg:hidden">
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
                  {shortageParams && (
                    <div className="shrink-0 flex items-center gap-2 border-b border-amber-200/60 bg-amber-50/50 px-4 py-2.5 dark:border-amber-800/30 dark:bg-amber-900/10">
                      <FileWarning className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        Short delivery debit note — qty shown is the <strong>missing amount</strong> (ordered minus received). Reason pre-set to "Short delivery".
                      </span>
                    </div>
                  )}
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-3 sm:px-6">
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

                  <div className="flex-1 overflow-y-auto lg:overflow-hidden border-t border-border/40">
                    {/* responsive: mobile card list (<lg) — same returnItems array + same handlers as the desktop table */}
                    <div className="lg:hidden">
                      {returnItems.map((ri) => {
                        const totalRefund = ri.rate * ri.returnQty
                        return (
                          <div
                            key={ri.productId}
                            className={cn(
                              'border-b border-border/40 p-3 space-y-2.5',
                              ri.selected ? 'bg-primary/3' : ''
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox checked={ri.selected} onCheckedChange={() => toggleReturnItem(ri.productId)} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold leading-none">{ri.productName}</p>
                                  {ri.damagedQty > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-0.5 text-[10px] font-bold">
                                      ⚠ {ri.damagedQty} damaged
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span>Rate: {formatCurrency(ri.rate)}</span>
                                  <span>Purchased: {ri.maxQty}</span>
                                  {ri.damagedQty > 0 && (
                                    <span className="text-rose-500 font-semibold">{ri.damagedQty} dmg</span>
                                  )}
                                </div>
                              </div>
                              <span className={cn(
                                'text-xs font-black font-mono tracking-tight shrink-0',
                                totalRefund > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/20'
                              )}>
                                {totalRefund > 0 ? formatCurrency(totalRefund) : '₹0.00'}
                              </span>
                            </div>
                            {ri.selected ? (
                              <div className="flex items-center gap-3 pl-8">
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
                                <Select value={ri.reason} onValueChange={(val) => updateReturnReason(ri.productId, val as ReturnReason)}>
                                  <SelectTrigger className="h-8 flex-1 text-xs">
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
                              </div>
                            ) : (
                              <div className="pl-8 text-[11px] text-muted-foreground/50 italic">Select to edit</div>
                            )}
                            {ri.selected && ri.reason === 'Other' && (
                              <input
                                placeholder="Specify reason..."
                                value={ri.customReason}
                                onChange={(e) => updateCustomReason(ri.productId, e.target.value)}
                                className="w-full h-8 px-2 bg-muted/40 border-0 text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary/20"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* responsive: desktop editable table (lg+ only) */}
                    <div className="hidden lg:block">
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
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold leading-none">{ri.productName}</p>
                                    {ri.damagedQty > 0 && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 px-2 py-0.5 text-[10px] font-bold">
                                        ⚠ {ri.damagedQty} damaged
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                    <span>Rate: {formatCurrency(ri.rate)}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-2 py-3 text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-xs font-bold tabular-nums text-muted-foreground/40">{ri.maxQty}</span>
                                  {ri.damagedQty > 0 && (
                                    <span className="text-[9px] text-rose-500 font-semibold">{ri.damagedQty} dmg</span>
                                  )}
                                </div>
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
                  </div>

                  <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-background px-4 py-3 sm:px-6">
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
                  className="absolute inset-0 flex flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
                >
                  {/* Left: Document Preview */}
                  <div className="flex w-full flex-col overflow-hidden border-r border-border/40 shrink-0 lg:shrink lg:w-[60%] lg:overflow-hidden">
                    <div className="shrink-0 bg-linear-to-r from-primary/5 to-primary/2 border-b border-border/40 p-5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Debit Note</p>
                        <p className="mt-1 font-mono text-xl font-bold">{debitNoteNumber}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-8 gap-y-3 text-sm">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</p>
                          <p className="mt-0.5 font-medium truncate" title={selectedGRN.supplierName}>{selectedGRN.supplierName}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Against PE</p>
                          <p className="mt-0.5 font-mono font-medium whitespace-nowrap" title={selectedGRN.grnNumber}>{selectedGRN.grnNumber}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PE Date</p>
                          <p className="mt-0.5 whitespace-nowrap">{formatDate(selectedGRN.date)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Return Date</p>
                          <p className="mt-0.5 whitespace-nowrap">{formatDate(new Date().toISOString())}</p>
                        </div>
                      </div>
                    </div>

                    <ScrollArea className="lg:min-h-0 lg:flex-1">
                      <div className="px-5 py-3">
                        {/* responsive: header row is desktop-only; mobile uses per-item cards below */}
                        <div className="sticky top-0 z-10 hidden lg:grid grid-cols-12 gap-2 rounded-t-lg bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-muted/20">
                          <div className="col-span-4">Product</div>
                          <div className="col-span-2 text-center">Qty</div>
                          <div className="col-span-2 text-right">Rate</div>
                          <div className="col-span-2 text-center">Amount</div>
                          <div className="col-span-2 text-center">Reason</div>
                        </div>
                        {selectedReturnItems.map((ri) => {
                          const lineAmount = ri.rate * ri.returnQty
                          const displayReason = ri.reason === 'Other' ? ri.customReason || 'Other' : ri.reason
                          const badgeVariant = reasonVariantMap[ri.reason || 'Other'] || 'secondary'
                          return (
                            <div key={ri.productId}>
                              {/* responsive: mobile compact card (<lg) — same computed values as desktop grid row */}
                              <div className="lg:hidden border-b border-border/30 px-4 py-3 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{ri.productName}</p>
                                    <p className="text-[11px] text-muted-foreground font-mono">{ri.productId}</p>
                                  </div>
                                  <span className="font-mono font-semibold text-sm shrink-0">{formatCurrency(lineAmount)}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                  <span>Qty: <span className="font-mono font-semibold text-foreground">{ri.returnQty}</span></span>
                                  <span>Rate: <span className="font-mono text-foreground">{formatCurrency(ri.rate)}</span></span>
                                  <Badge variant={badgeVariant} size="sm" dot>{displayReason}</Badge>
                                </div>
                              </div>
                              {/* responsive: desktop grid row (lg+) */}
                              <div className="hidden lg:grid grid-cols-12 gap-2 border-b border-border/30 px-4 py-3 items-center text-sm">
                                <div className="col-span-4">
                                  <p className="font-medium truncate">{ri.productName}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">{ri.productId}</p>
                                </div>
                                <div className="col-span-2 text-center font-mono font-semibold">{ri.returnQty}</div>
                                <div className="col-span-2 text-right font-mono">{formatCurrency(ri.rate)}</div>
                                <div className="col-span-2 text-center font-mono font-semibold">{formatCurrency(lineAmount)}</div>
                                <div className="col-span-2 flex justify-center">
                                  <Badge variant={badgeVariant} size="sm" dot>{displayReason}</Badge>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>

                    <div className="shrink-0 border-t border-border/40 bg-muted/10 px-5 py-4 dark:bg-muted/5">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <Button variant="outline" size="sm" onClick={() => goToStep(2)}>
                          <ChevronLeft className="mr-1.5 h-4 w-4" />
                          Back to Items
                        </Button>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Items</span>
                          <span className="font-mono font-medium">{selectedReturnItems.length}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Total Qty</span>
                          <span className="font-mono font-medium">{selectedReturnItems.reduce((sum, ri) => sum + ri.returnQty, 0)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Debit Total</span>
                          <span className="font-mono text-lg font-bold text-primary">{formatCurrency(debitSummary.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Settlement & Actions — responsive: stacks below preview on mobile so settlement + Confirm are reachable */}
                  <div className="flex w-full flex-col lg:w-[40%] lg:overflow-hidden border-t border-border/40 lg:border-t-0">
                    <ScrollArea className="lg:min-h-0 lg:flex-1">
                      <div className="p-5 space-y-5">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Settlement Method</p>
                          <RadioGroup value={effectiveSettlementOption} onValueChange={setSettlementOption} className="space-y-2">
                            {[
                              { value: 'adjust', title: 'Adjust Against Outstanding', desc: 'Deduct from next payment to supplier', icon: RotateCcw },
                              { value: 'replacement', title: 'Request Replacement', desc: 'Get replacement goods from supplier', icon: Package },
                              { value: 'refund', title: 'Request Refund', desc: 'Get monetary refund from supplier', icon: IndianRupee },
                            ].map((opt) => {
                              const isAdjust = opt.value === 'adjust'
                              const adjustDisabled = isAdjust && supplierOutstanding <= 0
                              return (
                                <div
                                  key={opt.value}
                                  className={cn(
                                    'flex items-start gap-3 rounded-xl border p-3 transition-all',
                                    adjustDisabled
                                      ? 'border-border/30 bg-muted/20 opacity-60 cursor-not-allowed'
                                      : effectiveSettlementOption === opt.value
                                        ? 'border-primary/30 bg-primary/3 ring-1 ring-primary/10 dark:bg-primary/6 cursor-pointer'
                                        : 'border-border/40 hover:bg-muted/30 cursor-pointer'
                                  )}
                                  onClick={() => { if (!adjustDisabled) setSettlementOption(opt.value) }}
                                >
                                  <RadioGroupItem value={opt.value} id={`pr-${opt.value}`} className="mt-0.5" disabled={adjustDisabled} />
                                  <Label htmlFor={`pr-${opt.value}`} className="cursor-pointer space-y-0.5 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-medium">{opt.title}</p>
                                      {isAdjust && supplierOutstanding > 0 && (
                                        <Badge variant="warning" size="sm">₹{supplierOutstanding.toLocaleString('en-IN')} payable</Badge>
                                      )}
                                      {isAdjust && supplierOutstanding <= 0 && (
                                        <Badge variant="secondary" size="sm">No outstanding</Badge>
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

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Return Summary</p>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">PE Reference</span>
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
                              <span className="text-muted-foreground">Taxable</span>
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

                      </div>
                    </ScrollArea>

                    {/* responsive: stack on phones — Print/Download share a row,
                        Confirm is a full-width CTA below; single row at lg+ */}
                    <div className="shrink-0 border-t border-border/40 bg-background p-4 flex flex-col gap-2 lg:flex-row lg:items-center">
                      <div className="flex gap-2 lg:contents">
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
                      <Button
                        size="sm"
                        className={`w-full lg:flex-1 ${needsApproval ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                        onClick={handleConfirmReturn}
                        disabled={submitting}
                      >
                        {submitting
                          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          : needsApproval
                            ? <ShieldCheck className="mr-1.5 h-4 w-4" />
                            : <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        }
                        {submitting
                          ? 'Processing…'
                          : needsApproval ? 'Request Approval' : 'Confirm Return & Create Debit Note'}
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