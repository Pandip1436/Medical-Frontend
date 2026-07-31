import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import { useFormDraft } from '@/hooks/useFormDraft'
import { useBranchStore } from '@/stores/branchStore'
import type { Product } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package,
  LayoutGrid,
  List as ListIcon,
  CheckCircle2,
  Trash2,
  Search,
  AlertTriangle,
  IndianRupee,
  Layers,
  FileText,
  Printer,
  Download,
  RotateCcw,
  Clock,
  FileWarning,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Wallet,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SupplierFormDialog } from '@/components/shared/SupplierFormDialog'
import { ProductFormDialog } from '@/components/shared/ProductFormDialog'
import { DatePicker } from '@/components/ui/date-picker'
import { MonthYearPicker } from '@/components/ui/month-year-picker'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate, formatExpiry} from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { GRNItem, PurchaseOrderItem } from '@/types'
import { printGrnPdf, downloadGrnPdf, type GrnPdfData } from '@/lib/pdf/grnPdf'
import { ShortBillingDialog, type ShortBillingItem } from './ShortBillingDialog'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GRNFormItem extends GRNItem {
  shortSupply: boolean
  // Per-batch sale price captured at receipt. Defaults from the product master
  // (editable) and is stored on the created Batch so each batch is sold against
  // its own cost/MRP.
  sellingRate: number
  _alreadyReceived?: number
  _remaining?: number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// A batch is "healthy" at receiving if it expires at least 6 months from
// today. Shorter-dated (or already-expired) stock is flagged so the operator
// notices before accepting it. `dateStr` is a yyyy-mm-dd value from DatePicker.
function isExpiryHealthy(dateStr: string): boolean {
  if (!dateStr) return false
  const sixMonthsOut = new Date()
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6)
  return new Date(dateStr) >= sixMonthsOut
}

// Pricing-band validation for one purchase-entry row. Mirrors the backend
// invariant (assertPricingSane / GRN DTO): purchase rate ≤ MRP, and sale rate
// between purchase cost and MRP. Returns the error message for the given field,
// or null. Zero (unset) values are skipped so a half-filled row doesn't nag.
function grnPriceError(
  item: { purchaseRate: number; mrp: number; sellingRate: number },
  field: 'purchaseRate' | 'mrp' | 'sellingRate',
): string | null {
  const pr = Number(item.purchaseRate) || 0
  const mrp = Number(item.mrp) || 0
  const sr = Number(item.sellingRate) || 0
  if (field === 'purchaseRate') {
    if (pr > 0 && mrp > 0 && pr > mrp) return 'Purchase rate cannot exceed MRP'
  }
  if (field === 'sellingRate') {
    if (sr > 0 && pr > 0 && sr < pr) return 'Sale rate cannot be below purchase rate'
    if (sr > 0 && mrp > 0 && sr > mrp) return 'Sale rate cannot exceed MRP'
  }
  return null
}

// Any pricing error on a row (used to gate Review).
function rowHasPriceError(item: { purchaseRate: number; mrp: number; sellingRate: number }): boolean {
  return !!(grnPriceError(item, 'purchaseRate') || grnPriceError(item, 'sellingRate'))
}

const statusBadgeConfig: Record<
  string,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'warning' | 'purple' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SENT: { label: 'Sent', variant: 'info' },
  ACKNOWLEDGED: { label: 'Confirmed', variant: 'success' },
  PARTIALLY_RECEIVED: { label: 'Partial', variant: 'warning' },
  FULLY_RECEIVED: { label: 'Received', variant: 'success' },
  CLOSED: { label: 'Closed', variant: 'purple' },
}

function createEmptyItem(): GRNFormItem {
  return {
    id: `GRN-ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: '',
    productName: '',
    orderedQty: 0,
    receivedQty: 0,
    freeQty: 0,
    batchNumber: '',
    mfgDate: '',
    expiryDate: '',
    purchaseRate: 0,
    mrp: 0,
    sellingRate: 0,
    shortSupply: false,
    _alreadyReceived: 0,
    _remaining: 0,
  }
}

// ── Enter-key field navigation ──────────────────────────────
// Order Enter advances through within one product row. GST is deliberately
// excluded — still directly editable by click/Tab, just not part of the
// Enter chain the operator uses for fast keyboard-driven entry.
const GRN_FIELD_ORDER = ['receivedQty', 'freeQty', 'mrp', 'purchaseRate', 'sellingRate', 'batchNumber', 'expiryDate'] as const
type GrnFieldName = (typeof GRN_FIELD_ORDER)[number]

function grnFieldId(itemId: string, field: GrnFieldName): string {
  return `grn-item-${itemId}-${field}`
}

function focusGrnField(itemId: string, field: GrnFieldName) {
  document.getElementById(grnFieldId(itemId, field))?.focus()
}

// Invoice Number/Date exist twice in the DOM at once (a mobile copy and a
// desktop copy, one hidden via CSS depending on viewport) — a plain id
// lookup would either collide or silently grab the hidden copy, so this
// queries every match and focuses whichever one is actually visible/laid
// out (offsetParent is null for display:none elements).
function focusVisibleGrnField(dataAttrSelector: string) {
  const candidates = document.querySelectorAll<HTMLElement>(dataAttrSelector)
  for (const el of candidates) {
    if (el.offsetParent !== null) {
      el.focus()
      return true
    }
  }
  return false
}

// Same visible-copy disambiguation as focusVisibleGrnField, but scrolls
// instead of focusing — for content that newly appears (e.g. the Amount
// Paid/Mode fields revealed by picking Partial/Paid in full) rather than an
// always-present input. `block: 'nearest'` scrolls the minimum distance
// needed to bring it fully into view, and does nothing if it's already
// visible.
function scrollVisibleGrnFieldIntoView(dataAttrSelector: string) {
  const candidates = document.querySelectorAll<HTMLElement>(dataAttrSelector)
  for (const el of candidates) {
    if (el.offsetParent !== null) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }
  }
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function GRNPage() {
  const { search: routeSearch } = useRoute()
  const urlParams = new URLSearchParams(routeSearch)
  const replacementReturnId = urlParams.get('replacementReturnId') ?? ''
  const prefilledSupplierId = urlParams.get('supplierId') ?? ''
  const prefilledSupplierName = urlParams.get('supplierName') ?? ''
  const prefilledPoId = urlParams.get('poId') ?? ''
  // Edit mode: `?grnId=<id>` loads an existing GRN to amend in place. Supplier /
  // PO linkage stay locked; line items, batch, expiry, qty and invoice are editable.
  const grnId = urlParams.get('grnId') ?? ''
  const editMode = !!grnId
  const [editGrnNumber, setEditGrnNumber] = useState('')
  const editPrefilled = useRef(false)
  // `${productId}::${batchNumber}` keys for the batches THIS GRN originally
  // created. In edit mode those batches are already in stock, so re-using them
  // on their own lines must NOT trip the "batch already exists" warning.
  const originalGrnBatchKeysRef = useRef<Set<string>>(new Set())

  // Source selection — defaults to Direct Entry because most pharmacies
  // receive stock without a pre-existing PO (over-the-counter restocks,
  // walk-in distributors). Users with a PO workflow can switch to the
  // "Against PO" tab.
  const [sourceType, setSourceType] = useState<'po' | 'direct'>('direct')
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null)
  const [poSearchOpen, setPoSearchOpen] = useState(false)
  const [poSearch, setPoSearch] = useState('')

  // Direct Entry supplier
  const [directSupplierId, setDirectSupplierId] = useState(prefilledSupplierId)
  const [directSupplierName, setDirectSupplierName] = useState(prefilledSupplierName)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)
  const [supplierFormOpen, setSupplierFormOpen] = useState(false)
  const [productFormOpen, setProductFormOpen] = useState(false)

  // Backend-paginated supplier search for the Direct Entry picker.
  // Loads 10 at a time, fetches next 10 on scroll-to-bottom, debounces typing.
  const [supplierResults, setSupplierResults] = useState<Array<{ id: string; name: string; phone?: string }>>([])
  const [supplierResultsLoading, setSupplierResultsLoading] = useState(false)
  const [supplierResultsHasMore, setSupplierResultsHasMore] = useState(true)
  const supplierDropdownScrollRef = useRef<HTMLDivElement>(null)
  const supplierSearchInputRef = useRef<HTMLInputElement>(null)
  const supplierFetchAbort = useRef<AbortController | null>(null)

  // Debounced fetch when search query changes or dropdown opens
  useEffect(() => {
    if (!supplierDropdownOpen) return
    const delay = supplierSearch.trim() ? 250 : 0
    const handle = setTimeout(async () => {
      // cancel any in-flight request
      supplierFetchAbort.current?.abort()
      const controller = new AbortController()
      supplierFetchAbort.current = controller
      setSupplierResultsLoading(true)
      try {
        const params = new URLSearchParams({ skip: '0', take: '10' })
        if (supplierSearch.trim()) params.set('q', supplierSearch.trim())
        const res = await api.get(`/suppliers?${params.toString()}`, { signal: controller.signal })
        const payload = res.data
        const items = (payload?.data ?? payload ?? []) as Array<{ id: string; name: string; phone?: string }>
        setSupplierResults(items)
        setSupplierResultsHasMore(Boolean(payload?.hasMore))
        // reset scroll to top on new query
        if (supplierDropdownScrollRef.current) supplierDropdownScrollRef.current.scrollTop = 0
      } catch (err: any) {
        if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
          // Quiet failure — keep prior results visible
        }
      } finally {
        setSupplierResultsLoading(false)
      }
    }, delay)
    return () => clearTimeout(handle)
  }, [supplierSearch, supplierDropdownOpen])

  // Scroll-to-load-more handler for the supplier dropdown
  const handleSupplierDropdownScroll = useCallback(() => {
    const el = supplierDropdownScrollRef.current
    if (!el) return
    if (supplierResultsLoading || !supplierResultsHasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 60) return

    const nextSkip = supplierResults.length
    setSupplierResultsLoading(true)
    ;(async () => {
      try {
        const params = new URLSearchParams({ skip: String(nextSkip), take: '10' })
        if (supplierSearch.trim()) params.set('q', supplierSearch.trim())
        const res = await api.get(`/suppliers?${params.toString()}`)
        const payload = res.data
        const items = (payload?.data ?? payload ?? []) as Array<{ id: string; name: string; phone?: string }>
        setSupplierResults((prev) => [...prev, ...items])
        setSupplierResultsHasMore(Boolean(payload?.hasMore))
      } catch {
        // ignore
      } finally {
        setSupplierResultsLoading(false)
      }
    })()
  }, [supplierResults.length, supplierResultsLoading, supplierResultsHasMore, supplierSearch])

  // Items
  // Direct Entry is the default source type — seed one empty row so the
  // user sees an editable line immediately. Other paths (PO selection,
  // existing-GRN edit) overwrite this array later.
  const [grnItems, setGrnItems] = useState<GRNFormItem[]>(() => [createEmptyItem()])
  const [productSearch, setProductSearch] = useState('')
  // Whether the product search box is focused — lets the dropdown open (and list
  // all products) before the user types anything.
  const [productFocused, setProductFocused] = useState(false)

  // Supplier invoice
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0)
  // Invoice Amount auto-fills from the computed line total until the operator
  // types their own figure (e.g. supplier added freight/rounding). Once edited,
  // this flips true and we stop overwriting it.
  const [invoiceAmountEdited, setInvoiceAmountEditedState] = useState(false)
  // Mirrors invoiceAmountEdited synchronously (ref writes apply immediately,
  // unlike state). The auto-fill effect below reads this instead of the state
  // closure directly — on mount it can fire multiple times before the restore
  // effect's setInvoiceAmountEdited(true) is actually reflected in a render,
  // and a stale `false` closure would clobber a just-restored invoiceAmount.
  const invoiceAmountEditedRef = useRef(false)
  const setInvoiceAmountEdited = useCallback((val: boolean) => {
    invoiceAmountEditedRef.current = val
    setInvoiceAmountEditedState(val)
  }, [])

  // Receive-time payment (create-only, non-replacement). CREDIT = pay nothing now
  // → whole invoice goes to supplier outstanding. PAID = settle in full now.
  // PARTIAL = pay a portion now; the rest goes to outstanding.
  const [payChoice, setPayChoice] = useState<'CREDIT' | 'PAID' | 'PARTIAL'>('CREDIT')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [payMode, setPayMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_UPI'>('NEFT_UPI')
  // UTR / cheque # / txn ref for the receive-time payment (non-cash modes only).
  const [payReference, setPayReference] = useState<string>('')
  // Payment due date for the credit portion (CREDIT / PARTIAL). yyyy-mm-dd from
  // the DatePicker; sent to the backend as ISO. Empty for paid-in-full.
  const [dueDate, setDueDate] = useState<string>('')

  // ── Form draft — auto-saves so an in-progress entry survives navigating
  // away and back. Skipped when arriving via an intentional prefill (editing
  // an existing GRN, a PO/supplier deep-link, or receiving replacement goods
  // for a return) — those flows already populate the form from their own
  // source of truth, so restoring a stale draft over them would be wrong.
  const activeBranchId = useBranchStore((s) => s.activeBranchId)
  interface GrnDraftSnapshot {
    sourceType: 'po' | 'direct'
    selectedPOId: string | null
    directSupplierId: string
    directSupplierName: string
    grnItems: GRNFormItem[]
    invoiceNo: string
    invoiceDate: string
    invoiceAmount: number
    invoiceAmountEdited: boolean
    payChoice: 'CREDIT' | 'PAID' | 'PARTIAL'
    paidAmount: number
    payMode: 'CASH' | 'CHEQUE' | 'NEFT_UPI'
    dueDate: string
  }
  const draft = useFormDraft<GrnDraftSnapshot>(`grn-draft:${activeBranchId ?? 'none'}`, {
    skip: editMode || !!prefilledPoId || !!prefilledSupplierId || !!replacementReturnId,
  })

  // Restore once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const saved = draft.load()
    if (!saved) return
    // Only restore Direct Entry drafts. PO mode is entered by navigating from a
    // purchase order (not manually — the source toggle was removed), so a
    // restored PO draft would strand the user in PO mode with no way back.
    if (saved.sourceType !== 'direct') { draft.clear(); return }
    const hasContent =
      saved.grnItems?.some((i) => i.productId) || !!saved.invoiceNo || !!saved.directSupplierId
    if (!hasContent) return
    setSourceType('direct')
    setSelectedPOId(null)
    setDirectSupplierId(saved.directSupplierId)
    setDirectSupplierName(saved.directSupplierName)
    setGrnItems(saved.grnItems)
    setInvoiceNo(saved.invoiceNo)
    setInvoiceDate(saved.invoiceDate)
    setInvoiceAmount(saved.invoiceAmount)
    setInvoiceAmountEdited(saved.invoiceAmountEdited)
    setPayChoice(saved.payChoice)
    setPaidAmount(saved.paidAmount)
    setPayMode(saved.payMode)
    setDueDate(saved.dueDate ?? '')
    toast.info('Restored your in-progress purchase entry')
  }, [])

  // Save snapshot on every change.
  useEffect(() => {
    draft.save({
      sourceType, selectedPOId, directSupplierId, directSupplierName, grnItems,
      invoiceNo, invoiceDate, invoiceAmount, invoiceAmountEdited,
      payChoice, paidAmount, payMode, dueDate,
    })
  }, [sourceType, selectedPOId, directSupplierId, directSupplierName, grnItems, invoiceNo, invoiceDate, invoiceAmount, invoiceAmountEdited, payChoice, paidAmount, payMode, dueDate])

  // Confirm overlay
  const [showConfirm, setShowConfirm] = useState(false)
  // Price fields blurred at least once, keyed `${itemId}:${field}` — pricing
  // errors only surface after the operator leaves the field (not mid-typing).
  const [touchedPrice, setTouchedPrice] = useState<Set<string>>(new Set())
  const markPriceTouched = (itemId: string, field: 'purchaseRate' | 'mrp' | 'sellingRate') =>
    setTouchedPrice((prev) => (prev.has(`${itemId}:${field}`) ? prev : new Set(prev).add(`${itemId}:${field}`)))
  const showPriceErr = (itemId: string, field: 'purchaseRate' | 'sellingRate', item: GRNFormItem): string | null => {
    // The purchase>MRP error completes only once MRP is entered, so surface it
    // when either the rate or the MRP field has been left.
    const touched =
      field === 'purchaseRate'
        ? touchedPrice.has(`${itemId}:purchaseRate`) || touchedPrice.has(`${itemId}:mrp`)
        : touchedPrice.has(`${itemId}:sellingRate`)
    return touched ? grnPriceError(item, field) : null
  }

  // Item workspace view: 'list' (compact editable table, like the New Sale
  // page) or 'card' (roomy stacked cards). Persisted so the choice sticks.
  const [itemViewMode, setItemViewMode] = useState<'list' | 'card'>(() => {
    try { return (localStorage.getItem('grn_item_view') as 'list' | 'card') || 'list' } catch { return 'list' }
  })
  const setItemView = (v: 'list' | 'card') => {
    setItemViewMode(v)
    try { localStorage.setItem('grn_item_view', v) } catch { /* ignore */ }
  }

  // Right panel shows Invoice+Payment and the Summary together in a single
  // scroll view (no step wizard). The footer goes straight to Review → Confirm.

  // Mobile-only third axis: which "page" of the wizard the edit view shows —
  // 'products' (source bar + supplier/product search + item cards) or 'panel'
  // (the same Invoice+Payment/Summary content panelStep already drives).
  // Desktop never consults this — products stay always-visible there and the
  // panel lives in its own separate column. The Review view (showConfirm)
  // also never consults this — it has no "add more products" step.
  const [mobileSection, setMobileSectionState] = useState<'products' | 'panel'>('products')
  const goToMobileSection = (section: 'products' | 'panel') => setMobileSectionState(section)
  // Set by handleRowEnter when Enter on the last product row's Expiry Date
  // auto-advances to the panel — focusVisibleGrnField can't run in the same
  // tick since the panel isn't mounted yet, so this defers it to the effect
  // below once mobileSection actually flips. Left false for a manual "Next"
  // click, which shouldn't steal focus.
  const pendingInvoiceFocusRef = useRef(false)
  useEffect(() => {
    if (mobileSection !== 'panel' || !pendingInvoiceFocusRef.current) return
    // Radix ScrollArea needs a layout pass after mounting before its content
    // is actually laid out (offsetParent stays null for a tick), so poll
    // briefly rather than assume one delay is enough. Clear the ref only once
    // a focus attempt actually lands (not up front) — StrictMode
    // double-invokes this effect in dev, and clearing eagerly would let the
    // cancelled first run consume the flag before the surviving run acts.
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      if (focusVisibleGrnField('[data-field="invoiceNumber"]') || attempts > 20) {
        pendingInvoiceFocusRef.current = false
        clearInterval(timer)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [mobileSection])

  // Post-confirm short supply action dialog
  const [shortActionDialog, setShortActionDialog] = useState<{
    savedGrnId: string
    savedGrnNumber: string
    shortItems: Array<{ productId: string; productName: string; orderedQty: number; receivedQty: number; rate: number; batchNumber: string; expiryDate: string; gstPercent: number; supplierId: string; supplierName: string }>
    supplierId: string
    supplierName: string
  } | null>(null)
  const [shortBillingOpen, setShortBillingOpen] = useState(false)

  const { purchaseOrders, products, suppliers, batches: stockBatches, fetchMasterData } = useMasterDataStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Phone for the selected direct-entry supplier, resolved from master data by
  // id so the picked-supplier card can show the number beside the name.
  const directSupplierPhone = useMemo(
    () => suppliers.find((s) => s.id === directSupplierId)?.phone ?? null,
    [suppliers, directSupplierId],
  )

  const fetchData = useCallback(() => { fetchMasterData() }, [fetchMasterData])
  useEffect(() => { fetchData() }, [fetchData])

  // Receiving replacement goods for a debit note: switch to Direct Entry and
  // auto-pull the returned lines from the purchase return so the operator only
  // has to enter the fresh batch/expiry and confirm. Quantities default to the
  // returned (like-for-like) count; batch/expiry are left blank because the
  // replacement is fresh stock with its own batch.
  const replacementPrefilled = useRef(false)
  useEffect(() => {
    if (!replacementReturnId || replacementPrefilled.current) return
    setSourceType('direct')
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/purchase-returns/${replacementReturnId}`)
        if (cancelled) return
        replacementPrefilled.current = true
        const pr = res.data
        type PRItem = {
          productId: string; productName: string
          batchNumber?: string; expiryDate?: string; returnedQty: number | string
          purchaseRate?: number | string; rate?: number | string
        }
        const items = (pr?.items ?? []) as PRItem[]
        if (!items.length) { setGrnItems([createEmptyItem()]); return }
        setGrnItems(
          items.map((it, i) => {
            const qty = Number(it.returnedQty) || 0
            return {
              id: `GRN-ITEM-${i + 1}`,
              productId: it.productId,
              productName: it.productName,
              orderedQty: qty,
              receivedQty: qty,
              freeQty: 0,
              batchNumber: '',
              mfgDate: '',
              expiryDate: '',
              purchaseRate: Number(it.rate ?? it.purchaseRate) || 0,
              mrp: products.find((p) => p.id === it.productId)?.mrp ?? 0,
              sellingRate: products.find((p) => p.id === it.productId)?.sellingRate ?? 0,
              shortSupply: false,
              _alreadyReceived: 0,
              _remaining: qty,
            }
          }),
        )
        // Backstop the supplier from the PR when the URL didn't carry it.
        if (!prefilledSupplierId && pr?.supplierId) {
          setDirectSupplierId(pr.supplierId)
          setDirectSupplierName(pr.supplierName ?? '')
        }
      } catch {
        if (!cancelled) setGrnItems([createEmptyItem()])
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replacementReturnId])

  // Auto-select PO when navigated from PO detail dialog (fetch fresh data to get latest receivedQty)
  useEffect(() => {
    if (!prefilledPoId || selectedPOId) return
    let cancelled = false
    const loadFreshPO = async () => {
      try {
        const res = await api.get(`/purchase-orders/${prefilledPoId}`)
        if (cancelled) return
        const freshPO = res.data
        setSourceType('po')
        setSelectedPOId(prefilledPoId)
        const isPartial = freshPO.status === 'PARTIALLY_RECEIVED'
        setGrnItems(
          ((freshPO.items ?? []) as PurchaseOrderItem[])
            .map((item, i) => {
              const alreadyReceived = Number(item.receivedQty ?? 0)
              const remaining = item.requiredQty - alreadyReceived
              if (isPartial && remaining <= 0) return null
              return {
                id: `GRN-ITEM-${i + 1}`,
                productId: item.productId,
                productName: item.productName,
                orderedQty: item.requiredQty,
                receivedQty: 0,
                freeQty: 0,
                batchNumber: '',
                mfgDate: '',
                expiryDate: '',
                purchaseRate: Number(item.expectedRate),
                mrp: products.find((p) => p.id === item.productId)?.mrp ?? 0,
                sellingRate: products.find((p) => p.id === item.productId)?.sellingRate ?? 0,
                shortSupply: false,
                _alreadyReceived: alreadyReceived,
                _remaining: isPartial ? remaining : item.requiredQty,
              }
            })
            .filter(Boolean) as GRNFormItem[]
        )
      } catch {
        // Fallback to cached data
        const po = purchaseOrders.find(p => p.id === prefilledPoId)
        if (po) { setSourceType('po'); handleSelectPO(po.id) }
      }
    }
    loadFreshPO()
    return () => { cancelled = true }
    // We deliberately fire only when prefilledPoId changes; the other deps
    // would re-trigger unwanted reloads of the fresh PO.
  }, [prefilledPoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Edit mode: load the existing GRN once and prefill the form.
  useEffect(() => {
    if (!editMode || editPrefilled.current) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/grn/${grnId}`)
        if (cancelled) return
        const grn = res.data
        editPrefilled.current = true
        setEditGrnNumber(grn.grnNumber ?? '')
        setSourceType(grn.poId ? 'po' : 'direct')
        setSelectedPOId(grn.poId ?? null)
        if (!grn.poId) {
          setDirectSupplierId(grn.supplierId)
          setDirectSupplierName(grn.supplierName)
        }
        setInvoiceNo(grn.supplierInvoiceNo ?? '')
        setInvoiceDate(grn.supplierInvoiceDate ? String(grn.supplierInvoiceDate).slice(0, 10) : '')
        setDueDate(grn.dueDate ? String(grn.dueDate).slice(0, 10) : '')
        setInvoiceAmount(Number(grn.supplierInvoiceAmount) || 0)
        // Treat the loaded amount as operator-set so the auto-fill effect can't
        // clobber it with the line total (which would silently rewrite the
        // supplier invoice amount — and outstanding — on any edit-save).
        setInvoiceAmountEdited(true)
        setGrnItems(
          ((grn.items ?? []) as GRNItem[]).map((it, i) => {
            const received = Number(it.receivedQty) || 0
            const ordered = Number(it.orderedQty) || 0
            return {
              id: it.id ?? `GRN-ITEM-${i}`,
              productId: it.productId,
              productName: it.productName,
              orderedQty: ordered,
              receivedQty: received,
              freeQty: Number(it.freeQty) || 0,
              batchNumber: it.batchNumber ?? '',
              mfgDate: it.mfgDate ? String(it.mfgDate).slice(0, 10) : '',
              expiryDate: it.expiryDate ? String(it.expiryDate).slice(0, 10) : '',
              purchaseRate: Number(it.purchaseRate) || 0,
              mrp: Number(it.mrp) || 0,
              // Prefer the sale rate saved on this GRN's batch; fall back to the
              // product master only for legacy rows that never stored one.
              sellingRate: it.sellingRate ?? products.find((p) => p.id === it.productId)?.sellingRate ?? 0,
              shortSupply: ordered > 0 && received < ordered,
            } as GRNFormItem
          })
        )
        // Remember this GRN's own batches so editing them doesn't false-flag as
        // "batch already exists" (they're in stock precisely because of this GRN).
        originalGrnBatchKeysRef.current = new Set(
          ((grn.items ?? []) as GRNItem[])
            .filter((it) => it.productId && it.batchNumber)
            .map((it) => `${it.productId}::${String(it.batchNumber).trim().toLowerCase()}`),
        )
        // Derive the (read-only) payment state so the Payment panel reflects what
        // was actually paid at receipt. Editing the paid amount isn't offered here.
        {
          const paid = Number(grn.amountPaid) || 0
          const invAmt = Number(grn.supplierInvoiceAmount) || 0
          if (paid <= 0.01) { setPayChoice('CREDIT'); setPaidAmount(0) }
          else if (invAmt > 0 && paid >= invAmt - 0.01) { setPayChoice('PAID'); setPaidAmount(invAmt) }
          else { setPayChoice('PARTIAL'); setPaidAmount(paid) }
        }
      } catch {
        toast.error('Failed to load Purchase Entry for editing')
        navigate('/purchase/grn-list')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, grnId])

  useBranchRefresh(fetchData)

  // Placeholder shown until the GRN is saved — the authoritative number is
  // generated atomically on the server and returned in the create response.
  // In edit mode we already know the real number.
  const grnNumber = editMode ? editGrnNumber || 'Purchase Entry' : 'Purchase Entry / pending'

  // ── Selectable POs ──
  const selectablePOs = useMemo(() => {
    return purchaseOrders.filter(
      (po) =>
        po.status === 'SENT' ||
        po.status === 'ACKNOWLEDGED' ||
        po.status === 'PARTIALLY_RECEIVED'
    )
  }, [purchaseOrders])

  const filteredPOs = useMemo(() => {
    if (!poSearch.trim()) return selectablePOs
    const q = poSearch.toLowerCase()
    return selectablePOs.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q)
    )
  }, [selectablePOs, poSearch])

  const selectedPO = useMemo(() => {
    return purchaseOrders.find((po) => po.id === selectedPOId)
  }, [purchaseOrders, selectedPOId])

  // ── Product search for direct entry — server-paginated ──
  // Backend filters by q across name / genericName / manufacturer / hsnCode /
  // barcode and supports skip/take. Mirrors the supplier picker pattern in
  // this same file so the user gets fast incremental loading on shops with
  // 1000+ SKUs instead of the legacy "load all products into the store, then
  // .filter() client-side" approach.
  const productSearchPaged = usePaginatedSearch<Product>({
    endpoint: '/products',
    pageSize: 10,
    debounceMs: 250,
  })
  useEffect(() => {
    productSearchPaged.setQuery(productSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch])

  // Hide products already in the cart so the user doesn't double-add.
  // No client-side cap — scroll-to-load-more keeps the list growing only
  // when the user actually scrolls to the bottom, so the DOM only carries
  // what they've requested to see.
  const filteredProducts = useMemo(() => {
    // Empty query returns the first page of all products (server-side), so the
    // dropdown can list everything on focus and grow via scroll-to-load-more.
    const existingIds = new Set(grnItems.map((i) => i.productId))
    return productSearchPaged.items.filter((p) => !existingIds.has(p.id))
  }, [grnItems, productSearchPaged.items])

  // Scroll-to-load-more handler for the product dropdown — same pattern as
  // the supplier dropdown above.
  const handleProductDropdownScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (productSearchPaged.loading || !productSearchPaged.hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 60) return
    productSearchPaged.loadMore()
  }, [productSearchPaged.loading, productSearchPaged.hasMore, productSearchPaged.loadMore])

  // ── Select PO ──
  function handleSelectPO(poId: string) {
    const po = purchaseOrders.find((p) => p.id === poId)
    if (!po) return
    setSelectedPOId(poId)
    setPoSearchOpen(false)
    setPoSearch('')
    const isPartial = po.status === 'PARTIALLY_RECEIVED'
    setGrnItems(
      po.items
        .map((item, i) => {
          const alreadyReceived = Number(item.receivedQty ?? 0)
          const remaining = item.requiredQty - alreadyReceived
          // Skip fully received items for supplementary GRNs
          if (isPartial && remaining <= 0) return null
          return {
            id: `GRN-ITEM-${i + 1}`,
            productId: item.productId,
            productName: item.productName,
            orderedQty: item.requiredQty,
            receivedQty: 0,
            freeQty: 0,
            batchNumber: '',
            mfgDate: '',
            expiryDate: '',
            purchaseRate: item.expectedRate,
            mrp: products.find((p) => p.id === item.productId)?.mrp ?? 0,
            sellingRate: products.find((p) => p.id === item.productId)?.sellingRate ?? 0,
            shortSupply: false,
            // Store remaining so label can show "X of Y remaining"
            _alreadyReceived: alreadyReceived,
            _remaining: isPartial ? remaining : item.requiredQty,
          } as GRNFormItem & { _alreadyReceived: number; _remaining: number }
        })
        .filter(Boolean) as GRNFormItem[]
    )
  }

  // ── Source toggle ──
  // ── Item operations ──
  function updateItem(index: number, field: keyof GRNFormItem, value: string | number) {
    setGrnItems((prev) => {
      const updated = [...prev]
      // Qty/rate/GST% can never be negative — clamp centrally here so every
      // caller (the item-card inputs) is protected without repeating the
      // guard, instead of only catching it with a toast at final submit.
      if (
        typeof value === 'number' &&
        (field === 'receivedQty' || field === 'freeQty' || field === 'purchaseRate' || field === 'mrp' || field === 'sellingRate')
      ) {
        value = Math.max(0, value)
      } else if (field === 'gstPercent' && typeof value === 'number') {
        value = Math.min(100, Math.max(0, value))
      }
      ;(updated[index] as unknown as Record<string, unknown>)[field] = value
      if (field === 'receivedQty') {
        const compareQty = updated[index]._remaining ?? updated[index].orderedQty
        updated[index].shortSupply =
          compareQty > 0 && (value as number) < compareQty
      }
      return updated
    })
  }

  function addDirectItem(product: (typeof products)[0]) {
    setGrnItems((prev) => [
      ...prev.filter((i) => i.productId !== ''),
      {
        id: `GRN-ITEM-${Date.now()}`,
        productId: product.id,
        productName: product.name,
        orderedQty: 0,
        receivedQty: 0,
        freeQty: 0,
        batchNumber: '',
        mfgDate: '',
        expiryDate: '',
        purchaseRate: product.purchaseRate,
        mrp: product.mrp,
        sellingRate: product.sellingRate ?? 0,
        gstPercent: product.gstRate ?? 12,
        shortSupply: false,
      },
    ])
    setProductSearch('')
    // Close the dropdown after a pick. Clicking the search box (onClick) or
    // typing reopens it to add another line.
    setProductFocused(false)
  }

  function removeItem(index: number) {
    setGrnItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Enter-key chain for one product row: advance within GRN_FIELD_ORDER; off
  // the end (past Expiry Date), jump to the next row's Received Qty if one
  // exists, otherwise to Invoice Number. `filteredIndex` matches the index
  // the render loop and updateItem/removeItem already use (grnItems filtered
  // to rows with a productId), so this stays in sync with them.
  function handleRowEnter(filteredIndex: number, field: GrnFieldName) {
    const filtered = grnItems.filter((i) => i.productId)
    const item = filtered[filteredIndex]
    if (!item) return
    const pos = GRN_FIELD_ORDER.indexOf(field)
    if (pos < GRN_FIELD_ORDER.length - 1) {
      focusGrnField(item.id, GRN_FIELD_ORDER[pos + 1])
      return
    }
    const nextItem = filtered[filteredIndex + 1]
    if (nextItem) {
      focusGrnField(nextItem.id, GRN_FIELD_ORDER[0])
    } else {
      // End of the last product row — the invoice header (No/Date/Amount) is
      // filled first (it sits above the grid and feeds INTO the products), so
      // the natural end of the chain is Review.
      handleReview()
    }
  }

  // Enter on the last invoice-header field (Invoice Amount) drops focus INTO the
  // product grid — the first row's first field — so the flow runs top-down:
  // Invoice No → Date → Amount → products → Review. Falls back to Review when no
  // product has been added yet.
  function focusFirstProduct() {
    const first = grnItems.find((i) => i.productId)
    if (first) focusGrnField(first.id, GRN_FIELD_ORDER[0])
    else handleReview()
  }

  // ── Calculations ──
  const isSupplementary = grnItems.some((i) => (i._alreadyReceived ?? 0) > 0)
  const receivedItems = grnItems.filter((i) => i.receivedQty > 0)
  const totalItems = receivedItems.length
  const totalQty = receivedItems.reduce((s, i) => s + i.receivedQty + (i.freeQty || 0), 0)
  const totalValue = receivedItems.reduce((s, i) => s + i.receivedQty * i.purchaseRate, 0)

  // Auto-fill the supplier Invoice Amount with the line total as items change,
  // unless the operator has manually overridden it.
  useEffect(() => {
    if (!invoiceAmountEditedRef.current) setInvoiceAmount(totalValue)
  }, [totalValue, invoiceAmountEdited])
  const shortSupplyCount = grnItems.filter((i) => i.shortSupply).length
  
  // Real GST calculation per-item based on master product data. Purchase rate
  // is GST-inclusive — the line value (qty × rate) already contains GST — so we
  // back out the taxable base and extract the tax from within rather than
  // adding it on top. Total Value therefore equals the entered line values (the
  // rate stays the final cost), matching the supplier's GST-inclusive invoice.
  let taxableSum = 0;
  let cgstSum = 0;
  let sgstSum = 0;
  receivedItems.forEach(i => {
    const prod = products.find(p => p.id === i.productId);
    // Per-line GST (operator-editable), falling back to the product master then
    // 12% for legacy/unpriced rows.
    const rate = i.gstPercent ?? prod?.gstRate ?? 12;
    const lineInclusive = i.receivedQty * i.purchaseRate;
    const lineTaxable = lineInclusive / (1 + rate / 100);
    const gstValue = lineInclusive - lineTaxable;
    taxableSum += lineTaxable;
    cgstSum += gstValue / 2;
    sgstSum += gstValue / 2;
  });

  const gstBreakdown = {
    taxable: taxableSum,
    cgst: cgstSum,
    sgst: sgstSum,
    total: totalValue,
  }

  // CGST/SGST label suffix: show the half-rate (e.g. "(6%)") only when every
  // received line shares one GST rate; with mixed rates a single % would lie,
  // so the suffix is dropped.
  const distinctGstRates = Array.from(
    new Set(receivedItems.map((i) => i.gstPercent ?? products.find((p) => p.id === i.productId)?.gstRate ?? 12)),
  )
  const gstHalfLabel = distinctGstRates.length === 1 ? ` (${distinctGstRates[0] / 2}%)` : ''

  const canConfirm = receivedItems.length > 0

  // Batch already present for this product — either already in stock (master
  // data) or duplicated on another line of this same Purchase Entry. Used for
  // the inline "already exists" warning on the batch inputs.
  const isBatchDuplicate = (item: GRNFormItem) => {
    const bn = item.batchNumber?.trim().toLowerCase()
    if (!bn || !item.productId) return false
    // In edit mode, a batch this GRN itself created is legitimately in stock —
    // re-using it on its own line isn't an in-stock clash (but a genuine
    // duplicate ACROSS two lines of this entry is still flagged below).
    const isOwnOriginalBatch =
      editMode && originalGrnBatchKeysRef.current.has(`${item.productId}::${bn}`)
    const inStock = !isOwnOriginalBatch && stockBatches.some(
      (b) => b.productId === item.productId && (b.batchNumber || '').trim().toLowerCase() === bn,
    )
    const dupOnGrn = grnItems.filter(
      (o) => o.productId === item.productId && (o.batchNumber || '').trim().toLowerCase() === bn,
    ).length > 1
    return inStock || dupOnGrn
  }

  // Amount actually paid to the supplier at receive time (drives outstanding).
  const effectivePaid = replacementReturnId
    ? 0
    : payChoice === 'PAID'
      ? Number(invoiceAmount) || 0
      : payChoice === 'PARTIAL'
        ? Math.min(Number(paidAmount) || 0, Number(invoiceAmount) || 0)
        : 0

  // Mark every price field of every product row as touched so all pending
  // pricing errors surface at once (used when Review is attempted).
  function markAllPriceTouched() {
    setTouchedPrice(() => {
      const s = new Set<string>()
      for (const it of grnItems) {
        if (!it.productId) continue
        s.add(`${it.id}:purchaseRate`)
        s.add(`${it.id}:mrp`)
        s.add(`${it.id}:sellingRate`)
      }
      return s
    })
  }

  // Gate the move to the Review screen on the pricing band (purchase ≤ MRP,
  // sale between cost and MRP). Also the target of the Enter-key chain's end.
  function handleReview() {
    const bad = grnItems.filter((i) => i.productId && i.receivedQty > 0 && rowHasPriceError(i))
    if (bad.length > 0) {
      markAllPriceTouched()
      toast.error('Fix the pricing errors first — purchase rate ≤ MRP, and sale rate between purchase cost and MRP.')
      return
    }
    setShowConfirm(true)
  }

  async function handleConfirm() {
    if (sourceType === 'direct' && !directSupplierId) {
      toast.error('Please select a supplier for direct entry')
      return
    }
    // For replacement GRNs, supplier invoice is optional (often just a delivery challan)
    const isReplacementFlow = !!replacementReturnId
    if (!isReplacementFlow && (!invoiceNo || !invoiceDate)) {
      toast.error('Supplier invoice number and date are required')
      return
    }
    if (!isReplacementFlow && !(Number(invoiceAmount) > 0)) {
      toast.error('Invoice amount is required')
      return
    }
    if (!editMode && !isReplacementFlow && payChoice === 'PARTIAL' && !(Number(paidAmount) > 0)) {
      toast.error('Amount paid is required for a partial payment')
      return
    }
    if (!editMode && !isReplacementFlow && payChoice === 'PARTIAL' && (Number(paidAmount) || 0) > (Number(invoiceAmount) || 0) + 0.01) {
      toast.error('Amount paid cannot exceed the invoice amount')
      return
    }
    // Credit/partial receipts leave a balance on the supplier's outstanding —
    // require a due date so it can be chased. Paid-in-full has no balance.
    // Create-only: the payment section (and its due-date field) isn't shown when
    // editing an existing GRN, so this requirement must not gate an edit.
    if (!editMode && !isReplacementFlow && payChoice !== 'PAID' && !dueDate) {
      toast.error('Please set a payment due date for the credit amount')
      return
    }

    // Item-level validation before we hit the server
    for (let idx = 0; idx < receivedItems.length; idx++) {
      const i = receivedItems[idx]
      const label = i.productName || `Item #${idx + 1}`
      if (!i.batchNumber?.trim()) {
        toast.error(`${label}: batch number is required`)
        return
      }
      if (!i.expiryDate) {
        toast.error(`${label}: expiry date is required`)
        return
      }
      const exp = new Date(i.expiryDate).getTime()
      if (Number.isNaN(exp)) {
        toast.error(`${label}: invalid expiry date`)
        return
      }
      if (exp < Date.now()) {
        toast.error(`${label}: expiry date must be today or in the future`)
        return
      }
      if (Number(i.purchaseRate) < 0 || Number(i.mrp) < 0) {
        toast.error(`${label}: purchase rate and MRP must be non-negative`)
        return
      }
      // PO-linked: don't let user over-receive (server also enforces this, but
      // we want instant feedback before the round-trip). Skipped in edit mode —
      // the server re-validates against the PO excluding this GRN's old qty.
      if (!editMode && selectedPOId && (i._remaining ?? i.orderedQty) > 0) {
        const cap = i._remaining ?? i.orderedQty
        const incoming = Number(i.receivedQty || 0) + Number(i.freeQty || 0)
        if (incoming > cap) {
          toast.error(`${label}: receiving ${incoming} exceeds remaining ${cap} on this PO`)
          return
        }
      }
    }

    // Invoice amount must reconcile exactly with the calculated total value
    // (within a rounding paisa) before a Purchase Entry can be confirmed.
    const amountDiff = Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total))
    if (!isReplacementFlow && amountDiff > 0.01) {
      toast.error(`Invoice amount must equal the total value (${formatCurrency(Number(gstBreakdown.total) || 0)}) before you can confirm.`)
      return
    }

    setIsSubmitting(true)
    try {
      // For replacement GRNs, default invoice number/date if user left them blank
      const effectiveInvoiceNo = invoiceNo || (isReplacementFlow ? `REPL-${Date.now()}` : '')
      const effectiveInvoiceDate = invoiceDate
        ? new Date(invoiceDate).toISOString()
        : (isReplacementFlow ? new Date().toISOString() : '')

      const payload = {
        poId: selectedPOId ?? undefined,
        supplierId: selectedPO?.supplierId ?? directSupplierId,
        supplierName: selectedPO?.supplierName ?? directSupplierName,
        supplierInvoiceNo: effectiveInvoiceNo,
        supplierInvoiceDate: effectiveInvoiceDate,
        // Credit due date — only sent when a balance stays on outstanding.
        // Edit mode keeps the due date editable regardless of the (read-only)
        // payment status; on create it only applies to a credit/partial balance.
        dueDate: !isReplacementFlow && (editMode || payChoice !== 'PAID') && dueDate ? new Date(dueDate).toISOString() : undefined,
        supplierInvoiceAmount: Number(invoiceAmount) || 0,
        totalAmount: Number(gstBreakdown.total) || 0,
        status: 'RECEIVED',
        isReplacement: isReplacementFlow,
        // Receive-time payment (ignored by the edit path, which preserves amountPaid).
        amountPaid: isReplacementFlow ? 0 : effectivePaid,
        paymentMode: payMode,
        referenceNumber: payMode === 'CASH' ? undefined : (payReference.trim() || undefined),
        items: receivedItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          // For supplementary GRNs, "ordered" is the remaining qty at this delivery — not the original PO total
          orderedQty: Number((i._alreadyReceived ?? 0) > 0 ? (i._remaining ?? i.orderedQty) : (i.orderedQty || i.receivedQty)),
          receivedQty: Number(i.receivedQty),
          freeQty: Number(i.freeQty || 0),
          batchNumber: i.batchNumber,
          expiryDate: new Date(i.expiryDate).toISOString(),
          purchaseRate: Number(i.purchaseRate),
          mrp: Number(i.mrp),
          // Per-batch sale price — stored on the created Batch so each batch is
          // billed against its own cost/MRP (0 → backend falls back to master).
          sellingRate: Number(i.sellingRate) || 0,
          // GST rate is stored per line so the detail view / PDF can extract the
          // tax from the GST-inclusive purchase rate (same fallback as the live
          // summary above).
          gstPercent: Number(i.gstPercent ?? products.find((p) => p.id === i.productId)?.gstRate ?? 12),
        })),
      }
      // Edit mode: PATCH the existing GRN and return to the list. The server
      // reverses the old stock/payables and reapplies the new values atomically.
      if (editMode) {
        await api.patch(`/grn/${grnId}`, payload)
        toast.success('Purchase Entry updated', {
          description: `${editGrnNumber} — stock, payables and PO reconciled.`,
        })
        setShowConfirm(false)
        draft.clear()
        // Return to THIS entry's detail (not the list's default selection) so the
        // user lands back on the Purchase Entry they just edited.
        navigate(`/purchase/grn-list?grnId=${grnId}`)
        return
      }

      const grnRes = await api.post('/grn', payload)
      const savedGrn = grnRes.data

      // If this GRN is receiving replacement goods for a purchase return, link them
      if (replacementReturnId && savedGrn?.id) {
        try {
          await api.patch(`/purchase-returns/${replacementReturnId}/link-replacement`, {
            replacementGrnId: savedGrn.id,
          })
          toast.success('Replacement goods received and debit note settled!', {
            description: `${grnNumber} linked to purchase return. Stock updated.`,
          })
        } catch {
          toast.success('Purchase Entry created. Note: could not auto-settle the debit note — please update it manually.', {
            duration: 6000,
          })
        }
      } else {
        toast.success('Purchase Entry created successfully!', {
          description: `${grnNumber} — Stock has been updated for ${totalItems} ${totalItems === 1 ? 'item' : 'items'}.`,
        })
      }

      setShowConfirm(false)
      draft.clear()

      // Check if any items had short supply — if so, prompt action
      const shortItems = grnItems.filter((i) => i.shortSupply && i.orderedQty > i.receivedQty)
      if (shortItems.length > 0 && !replacementReturnId) {
        const effSupplierId = selectedPO?.supplierId ?? directSupplierId
        const effSupplierName = selectedPO?.supplierName ?? directSupplierName
        const prod = (productId: string) => products.find((p) => p.id === productId)
        setShortActionDialog({
          savedGrnId: savedGrn.id,
          savedGrnNumber: savedGrn.grnNumber ?? grnNumber,
          supplierId: effSupplierId,
          supplierName: effSupplierName,
          shortItems: shortItems.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            orderedQty: i.orderedQty,
            receivedQty: i.receivedQty,
            rate: i.purchaseRate,
            batchNumber: i.batchNumber,
            expiryDate: i.expiryDate,
            gstPercent: Number(i.gstPercent ?? prod(i.productId)?.gstRate) || 12,
            supplierId: effSupplierId,
            supplierName: effSupplierName,
          })),
        })
      }

      // Reset to a clean Direct Entry state (the page's only manual source now —
      // the Against PO / Direct toggle was removed). PO mode is only entered by
      // navigating from a purchase order.
      setSourceType('direct')
      setSelectedPOId(null)
      setGrnItems([createEmptyItem()])
      setDirectSupplierId('')
      setDirectSupplierName('')
      setSupplierSearch('')
      setInvoiceNo('')
      setInvoiceDate('')
      setInvoiceAmount(0); setInvoiceAmountEdited(false)
      setPayChoice('CREDIT')
      setPaidAmount(0)
      setPayMode('NEFT_UPI')
      setPayReference('')
      setDueDate('')
      await fetchMasterData()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to save Purchase Entry. Please try again.'));
    } finally {
      setIsSubmitting(false)
    }
  }

  const businessProfile = useSettingsStore(s => s.businessProfile)

  function buildGrnPdfData(): GrnPdfData {
    return {
      grnNumber,
      date: new Date(),
      supplierName: selectedPO?.supplierName ?? directSupplierName,
      supplierInvoiceNo: invoiceNo || undefined,
      supplierInvoiceDate: invoiceDate || undefined,
      totalAmount: gstBreakdown.total,
      gst: gstBreakdown,
      company: businessProfile ? {
        name: businessProfile.name,
        address: businessProfile.address,
        phone: businessProfile.phone,
        email: businessProfile.email,
        gstin: businessProfile.gstin,
        dlNo: businessProfile.drugLicense,
      } : undefined,
      items: receivedItems.map((i) => ({
        productName: i.productName,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
        orderedQty: i.orderedQty || i.receivedQty,
        receivedQty: i.receivedQty,
        freeQty: i.freeQty || 0,
        purchaseRate: i.purchaseRate,
        mrp: i.mrp,
      })),
    }
  }

  function handlePrintGrn() {
    if (!canConfirm) return
    printGrnPdf(buildGrnPdfData())
  }

  function handleDownloadGrn() {
    if (!canConfirm) return
    downloadGrnPdf(buildGrnPdfData())
  }

  function handleDiscard() {
    setSelectedPOId(null)
    setGrnItems([])
    setInvoiceNo('')
    setInvoiceDate('')
    setInvoiceAmount(0); setInvoiceAmountEdited(false)
    setPayChoice('CREDIT')
    setPaidAmount(0)
    setPayMode('NEFT_UPI')
    setPayReference('')
    setDueDate('')
    setMobileSectionState('products')
    draft.clear()
  }

  // Shared between the desktop right-hand context panel (always visible at
  // lg+) and a mobile/tablet-only copy rendered inline in the item list
  // below lg — without this, Invoice Number/Date/Amount (required) and the
  // Payment method have no entry point at all below 1024px.
  //
  // Split into two step-content functions (rather than one long fragment)
  // so the panel can show one step at a time instead of a single long
  // scroll — see `panelStep`. Both are pure content; neither renders its
  // own Next/Back/Confirm buttons, which stay in the (already step-aware)
  // pinned footers below.
  // Direct-entry supplier selector (card when picked, search otherwise).
  // Rendered in the header row on desktop and in the workspace on mobile.
  function renderSupplierSelector() {
    return directSupplierId ? (
      // Click the selected supplier to change it — reopens the search picker.
      // (Not clickable while editing an existing GRN: its supplier is fixed.)
      <button
        type="button"
        disabled={editMode}
        title={editMode ? undefined : 'Click to change supplier'}
        onClick={() => {
          if (editMode) return
          setDirectSupplierId('')
          setDirectSupplierName('')
          setSupplierSearch('')
          setSupplierDropdownOpen(true)
          setTimeout(() => supplierSearchInputRef.current?.focus(), 0)
        }}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-left transition-colors',
          !editMode && 'cursor-pointer hover:border-primary/40 hover:bg-muted/30',
        )}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Selected supplier</p>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground" title={directSupplierName}>{directSupplierName}</p>
            {directSupplierPhone && (
              <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" /> {directSupplierPhone}
              </p>
            )}
          </div>
        </div>
        {!editMode && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
      </button>
    ) : (
      <div className="relative">
        <Input
          ref={supplierSearchInputRef}
          icon={<Search />}
          placeholder="Search and select supplier..."
          value={supplierSearch}
          onChange={(e) => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true) }}
          onFocus={() => setSupplierDropdownOpen(true)}
          onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 200)}
        />
        {supplierDropdownOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-52 flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg">
            <div
              ref={supplierDropdownScrollRef}
              onScroll={handleSupplierDropdownScroll}
              className="min-h-0 flex-1 overflow-y-auto"
            >
            {supplierResults.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/20 last:border-b-0"
                // Switching supplier starts a clean entry — the product lines and
                // the supplier-invoice details (number/date/amount/due date) all
                // belonged to the previous supplier, so none of them carry over.
                onMouseDown={(e) => {
                  e.preventDefault()
                  setDirectSupplierId(s.id)
                  setDirectSupplierName(s.name)
                  setSupplierSearch('')
                  setSupplierDropdownOpen(false)
                  if (!editMode) {
                    setGrnItems([createEmptyItem()])
                    setInvoiceNo('')
                    setInvoiceDate('')
                    setInvoiceAmount(0)
                    setInvoiceAmountEdited(false)
                    setDueDate('')
                    // Reset the bottom bar's payment section too.
                    setPayChoice('CREDIT')
                    setPaidAmount(0)
                    setPayMode('NEFT_UPI')
                    setPayReference('')
                  }
                }}
              >
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.phone && <p className="text-[11px] text-muted-foreground">{s.phone}</p>}
                </div>
              </button>
            ))}
            {supplierResultsLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 text-[11px] text-muted-foreground">
                <div className="h-3 w-3 rounded-full border-b-2 border-current animate-spin" />
                Loading suppliers…
              </div>
            )}
            {!supplierResultsLoading && supplierResults.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">No suppliers found</p>
            )}
            </div>
            {/* Create a new supplier without leaving the entry. Sits in a fixed
                footer below the scroll area so it never overlaps rows. */}
            <button
              type="button"
              className="flex w-full shrink-0 items-center gap-2 border-t border-border/40 bg-popover px-4 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-accent/50"
              onMouseDown={(e) => { e.preventDefault(); setSupplierDropdownOpen(false); setSupplierFormOpen(true) }}
            >
              <Plus className="h-4 w-4" />
              Add New Supplier
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderInvoiceAndPaymentStep() {
    return (
      <>
        {/* ── Supplier Invoice ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10">
              <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Supplier Invoice
            </p>
          </div>
          {isSupplementary && !replacementReturnId && (
            <p className="text-[10px] text-blue-600/80 dark:text-blue-300/70 mb-2 leading-relaxed">
              Use the <strong>new invoice</strong> the supplier sent for this delivery — not the original PO invoice.
            </p>
          )}
          {replacementReturnId && (
            <p className="text-[10px] text-emerald-600/80 dark:text-emerald-300/70 mb-2 leading-relaxed">
              <strong>Optional</strong> for replacements. Enter delivery challan number if available, leave amount as <strong>₹0</strong> (no money owed).
            </p>
          )}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Invoice Number{!replacementReturnId && <span className="text-rose-500"> *</span>}
              </Label>
              <Input
                data-field="invoiceNumber"
                className="h-8 font-mono text-xs"
                placeholder="e.g. INV-2025-001"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusVisibleGrnField('[data-field="invoiceDate"]') } }}
              />
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Invoice Date{!replacementReturnId && <span className="text-rose-500"> *</span>}
                </Label>
                <DatePicker
                  dataField="invoiceDate"
                  className="h-9 text-sm"
                  value={invoiceDate}
                  onChange={setInvoiceDate}
                  onEnterKey={() => focusVisibleGrnField('[data-field="invoiceAmount"]')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Invoice Amount{!replacementReturnId && <span className="text-rose-500"> *</span>}
                </Label>
                <Input
                  data-field="invoiceAmount"
                  type="number"
                  min={0}
                  className="h-9 font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00"
                  value={invoiceAmount || ''}
                  onChange={(e) => { setInvoiceAmount(Math.max(0, Number(e.target.value) || 0)); setInvoiceAmountEdited(true) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusFirstProduct() } }}
                />
                {/* Must equal the calculated Total Value to confirm — blocks submission. */}
                {Number(invoiceAmount) > 0 &&
                  Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)) > 0.01 && (
                  <p className="mt-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                    Must equal Total Value ({formatCurrency(Number(gstBreakdown.total) || 0)}) to confirm —
                    {' '}{Number(invoiceAmount) > Number(gstBreakdown.total) ? 'over by' : 'short by'}{' '}
                    {formatCurrency(Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)))}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edit mode: the credit due date stays editable (the full payment
            section below is create-only, but the outstanding due date can change). */}
        {editMode && !replacementReturnId && (
          <>
            <Separator className="bg-border/50" />
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Due Date
              </Label>
              <DatePicker dataField="dueDate" className="h-9 text-sm" value={dueDate} onChange={setDueDate} />
            </div>
          </>
        )}

        {/* ── Payment at receipt ── (create-only, not for replacements) */}
        {!editMode && !replacementReturnId && (
          <>
            <Separator className="bg-border/50" />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                  <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment
                </p>
              </div>
              <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 mb-2">
                {([['CREDIT', 'Credit'], ['PARTIAL', 'Partial'], ['PAID', 'Paid in full']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setPayChoice(val)
                      // Partial/Paid reveal the Amount Paid/Mode/Balance block below —
                      // bring it into view instead of leaving the user to find it by
                      // scrolling. setTimeout(…, 0) lets the reveal actually render first.
                      if (val !== 'CREDIT') {
                        setTimeout(() => scrollVisibleGrnFieldIntoView('[data-field="paymentExtra"]'), 0)
                      }
                    }}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all',
                      payChoice === val
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {payChoice === 'CREDIT' ? (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Full invoice amount will be added to the supplier's outstanding.
                </p>
              ) : (
                <div className="space-y-2" data-field="paymentExtra">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Amount Paid{payChoice === 'PARTIAL' && <span className="text-rose-500"> *</span>}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 font-mono text-xs"
                        placeholder="0.00"
                        value={payChoice === 'PAID' ? (invoiceAmount || '') : (paidAmount || '')}
                        disabled={payChoice === 'PAID'}
                        max={invoiceAmount || undefined}
                        onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Mode</Label>
                      <Select value={payMode} onValueChange={(v) => setPayMode(v as 'CASH' | 'CHEQUE' | 'NEFT_UPI')}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CHEQUE">Cheque</SelectItem>
                          <SelectItem value="NEFT_UPI">NEFT / UPI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {payMode !== 'CASH' && (
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {payMode === 'CHEQUE' ? 'Cheque No.' : 'Reference / UTR No.'}
                      </Label>
                      <Input
                        className="h-8 font-mono text-xs"
                        placeholder={payMode === 'CHEQUE' ? 'Cheque number' : 'UPI / NEFT reference'}
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Balance to outstanding</span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {formatCurrency(Math.max(0, (Number(invoiceAmount) || 0) - effectivePaid))}
                    </span>
                  </div>
                </div>
              )}
              {/* Due date for the credit balance — shown whenever any amount
                  stays on the supplier's outstanding (CREDIT or PARTIAL). */}
              {payChoice !== 'PAID' && (
                <div className="mt-2 space-y-1">
                  <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Due Date<span className="text-rose-500"> *</span>
                  </Label>
                  <DatePicker className="h-9 text-sm" value={dueDate} onChange={setDueDate} />
                </div>
              )}
            </div>
          </>
        )}
      </>
    )
  }

  function renderSummaryAndActionsStep() {
    return (
      <>
        {/* ── Live Summary ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
              <Layers className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live Summary
            </p>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="rounded-lg border border-border/40 bg-background p-2 text-center">
              <p className="font-mono text-base font-bold">{totalItems}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-background p-2 text-center">
              <p className="font-mono text-base font-bold">{totalQty}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Total Qty</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-background p-2 text-center">
              <p className={cn('font-mono text-base font-bold', shortSupplyCount > 0 && 'text-amber-600 dark:text-amber-400')}>
                {shortSupplyCount}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Short</p>
            </div>
          </div>

          {/* GST breakdown */}
          <div className="space-y-1.5 rounded-lg border border-border/40 bg-background p-2.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Taxable Amount</span>
              <span className="font-mono font-medium">{formatCurrency(gstBreakdown.taxable)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">CGST{gstHalfLabel}</span>
              <span className="font-mono font-medium">{formatCurrency(gstBreakdown.cgst)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">SGST{gstHalfLabel}</span>
              <span className="font-mono font-medium">{formatCurrency(gstBreakdown.sgst)}</span>
            </div>
            <Separator className="bg-border/40" />
            <div className="flex justify-between">
              <span className="text-sm font-semibold">Total Value</span>
              <span className="font-mono text-sm font-bold text-primary">{formatCurrency(gstBreakdown.total)}</span>
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        {/* ── Quick Actions ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500/10">
              <Printer className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              After Confirmation
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" disabled={!canConfirm} onClick={handlePrintGrn}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print PE
            </Button>
            <Button variant="outline" size="sm" className="flex-1" disabled={!canConfirm} onClick={handleDownloadGrn}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="relative -m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className={cn('flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-background px-4 py-2.5 sm:px-6', !replacementReturnId && 'lg:hidden')}>
        {/* Replacement return context banner */}
        {replacementReturnId && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800/40 dark:bg-emerald-950/20">
            <RotateCcw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Receiving replacement goods — this Purchase Entry will be auto-linked to the debit note and marked Settled.
            </span>
          </div>
        )}

      </div>

      {/* ── Supplier + Invoice strip (desktop header) — supplier selection sits
          on the same row as the invoice fields; moved out of the bottom bar ── */}
      <div className="hidden lg:flex flex-wrap shrink-0 items-end gap-3 border-b border-border/40 bg-muted/10 px-6 py-2 dark:bg-muted/5">
        {sourceType === 'direct' && (
          // In edit mode the supplier box flexes to absorb the leftover row
          // width so the full name shows, while the Due Date field + List/Card
          // toggle still fit on this one row (min-w-0 lets an extreme name
          // truncate rather than wrap the toggle).
          <div className={cn('self-end', editMode ? 'flex-1 min-w-0' : 'w-96 shrink-0')}>
            {renderSupplierSelector()}
          </div>
        )}
        <div className={cn('space-y-1', editMode ? 'w-44' : 'w-56')}>
          <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice No{!replacementReturnId && <span className="text-rose-500"> *</span>}</Label>
          <Input
            data-field="invoiceNumber"
            className="h-8 font-mono text-xs"
            placeholder="e.g. INV-2025-001"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusVisibleGrnField('[data-field="invoiceDate"]') } }}
          />
        </div>
        <div className="w-44 space-y-1">
          <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Date{!replacementReturnId && <span className="text-rose-500"> *</span>}</Label>
          <DatePicker dataField="invoiceDate" className="h-8 text-xs" value={invoiceDate} onChange={setInvoiceDate} onEnterKey={() => focusVisibleGrnField('[data-field="invoiceAmount"]')} />
        </div>
        <div className="w-40 space-y-1">
          <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Amount{!replacementReturnId && <span className="text-rose-500"> *</span>}</Label>
          <Input
            data-field="invoiceAmount"
            type="number"
            min={0}
            className={cn(
              'h-8 font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
              !replacementReturnId && Number(invoiceAmount) > 0 && Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)) > 0.01 && 'border-rose-400 focus-visible:ring-rose-400',
            )}
            placeholder="0.00"
            value={invoiceAmount || ''}
            onChange={(e) => { setInvoiceAmount(Math.max(0, Number(e.target.value) || 0)); setInvoiceAmountEdited(true) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusFirstProduct() } }}
          />
          {/* Must equal the calculated Total Value to confirm — blocks submission. */}
          {!replacementReturnId && Number(invoiceAmount) > 0 &&
            Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)) > 0.01 && (
            <p className="text-[10px] font-medium leading-tight text-rose-600 dark:text-rose-400">
              Must equal Total Value ({formatCurrency(Number(gstBreakdown.total) || 0)}) —
              {' '}{Number(invoiceAmount) > Number(gstBreakdown.total) ? 'over' : 'short'}{' '}
              {formatCurrency(Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)))}
            </p>
          )}
        </div>
        {/* Edit mode: the credit due date stays editable here (the full payment
            section is create-only, but the outstanding due date can be revised). */}
        {editMode && !replacementReturnId && (
          <div className="w-44 space-y-1">
            <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Due Date</Label>
            <DatePicker dataField="dueDate" className="h-8 text-xs" value={dueDate} onChange={setDueDate} />
          </div>
        )}
        {/* Card / List view toggle — last in the invoice row */}
        <div className="ml-auto flex shrink-0 items-center self-end rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <button type="button" onClick={() => setItemView('list')} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] font-semibold transition-all', itemViewMode === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <ListIcon className="h-3.5 w-3.5" /> List
          </button>
          <button type="button" onClick={() => setItemView('card')} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] font-semibold transition-all', itemViewMode === 'card' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <LayoutGrid className="h-3.5 w-3.5" /> Card
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN WORKSPACE — items on top, summary bar underneath      */}
      {/* (legacy Sales-Bill style, matching the New Sale page)      */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ─── TOP: Item Workspace (full width) — or Review View when confirming ─── */}
        <div className="flex w-full min-h-0 flex-1 flex-col overflow-hidden">
        {showConfirm ? (
          /* ─── REVIEW VIEW ─── replaces the edit form while confirming ─── */
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Review header */}
            <div className="shrink-0 border-b border-border/40 bg-background px-6 py-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                  aria-label="Back to edit"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="text-base font-bold tracking-tight">Review Purchase Entry</h2>
                  <p className="text-[11px] text-muted-foreground">Verify everything below — confirming will update stock</p>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="p-6 space-y-5">
                {/* KPI strip — Items / Total Qty / Value / Short.
                    min-w-0 on each cell + truncate on the figure: CSS grid
                    items default to min-width:auto, so a long figure (a
                    large quantity or currency value) would otherwise refuse
                    to shrink and bleed into the next card. text-base (down
                    from text-xl) keeps realistic-to-large values on one
                    line; truncate is only a fallback for pathological
                    values, with the title tooltip on Value revealing the
                    full number on hover in that rare case. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div className="min-w-0 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
                    <p className="mt-0.5 truncate font-mono text-base font-bold">{totalItems}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Qty</p>
                    <p className="mt-0.5 truncate font-mono text-base font-bold">{totalQty}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Value</p>
                    <p className="mt-0.5 truncate font-mono text-base font-bold text-primary" title={formatCurrency(gstBreakdown.total)}>{formatCurrency(gstBreakdown.total)}</p>
                  </div>
                  <div className={cn(
                    'min-w-0 rounded-xl border px-4 py-3',
                    shortSupplyCount > 0
                      ? 'border-amber-300/60 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-900/10'
                      : 'border-emerald-300/40 bg-emerald-50/40 dark:border-emerald-800/30 dark:bg-emerald-900/10',
                  )}>
                    <p className={cn(
                      'text-[10px] font-semibold uppercase tracking-wider',
                      shortSupplyCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                    )}>
                      {shortSupplyCount > 0 ? 'Short Supply' : 'Status'}
                    </p>
                    <p className={cn(
                      'mt-0.5 truncate font-mono text-base font-bold',
                      shortSupplyCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                    )}>
                      {shortSupplyCount > 0 ? `${shortSupplyCount}` : '✓ Ready'}
                    </p>
                  </div>
                  {/* Invoice meta — merged into the same single-row grid */}
                  <div className="min-w-0 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</p>
                    <p className="mt-0.5 truncate text-sm font-medium" title={selectedPO?.supplierName || directSupplierName || '—'}>{selectedPO?.supplierName || directSupplierName || '—'}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier Invoice</p>
                    <p className="mt-0.5 truncate font-mono text-sm font-medium">{invoiceNo || '—'}</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inv. Amount</p>
                    <p className="mt-0.5 truncate font-mono text-sm font-medium">{invoiceAmount > 0 ? formatCurrency(invoiceAmount) : '—'}</p>
                  </div>
                </div>

                {/* Short-supply alert if applicable */}
                {shortSupplyCount > 0 && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {shortSupplyCount} item{shortSupplyCount !== 1 ? 's' : ''} received less than ordered
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/70">
                        You'll be offered to raise a debit note or wait for a supplementary delivery after confirming.
                      </p>
                    </div>
                  </div>
                )}

                {/* Received items — full table for clarity */}
                <div className="overflow-hidden rounded-xl border border-border/40">
                  <div className="border-b border-border/40 bg-muted/20 px-4 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Items to Receive ({receivedItems.length})
                    </p>
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-175">
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 w-10 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</TableHead>
                        <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expiry</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Free</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                        <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivedItems.map((item, idx) => (
                        <TableRow key={item.id} className="border-b border-border/30 last:border-b-0">
                          <TableCell className="px-3 py-2.5 text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="px-3 py-2.5 text-sm font-medium">{item.productName}</TableCell>
                          <TableCell className="px-3 py-2.5">
                            {item.batchNumber ? (
                              <span className="font-mono text-xs bg-muted/60 rounded px-2 py-1 whitespace-nowrap">{item.batchNumber}</span>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2.5">
                            {item.expiryDate ? (() => {
                              // Color-coded by recency: red = already expired, amber = within 90 days,
                              // emerald = healthy. Mirrors the chips used on the sale-row picker.
                              const exp = new Date(item.expiryDate)
                              exp.setHours(23, 59, 59, 999)
                              const now = new Date()
                              const expired = exp < now
                              const ninetyDays = 90 * 24 * 60 * 60 * 1000
                              const nearExpiry = !expired && (exp.getTime() - now.getTime()) < ninetyDays
                              return (
                                <span className={cn(
                                  'font-mono text-xs whitespace-nowrap tabular-nums',
                                  expired ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                    : nearExpiry ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                    : 'text-foreground/80',
                                )}>
                                  {expired && '⚠ '}{formatExpiry(item.expiryDate)}
                                </span>
                              )
                            })() : (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">{item.receivedQty}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm">
                            {item.freeQty ? (
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">+{item.freeQty}</span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.purchaseRate)}</TableCell>
                          <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.receivedQty * item.purchaseRate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>

                  {/* Mobile (<md): same received items as stacked cards */}
                  <div className="space-y-2 p-3 md:hidden">
                    {receivedItems.map((item, idx) => {
                      // Expiry color coding — mirrors the desktop table cell.
                      let expiryEl: React.ReactNode = <span className="text-muted-foreground/40">—</span>
                      if (item.expiryDate) {
                        const exp = new Date(item.expiryDate)
                        exp.setHours(23, 59, 59, 999)
                        const now = new Date()
                        const expired = exp < now
                        const ninetyDays = 90 * 24 * 60 * 60 * 1000
                        const nearExpiry = !expired && (exp.getTime() - now.getTime()) < ninetyDays
                        expiryEl = (
                          <span className={cn(
                            'font-mono tabular-nums',
                            expired ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : nearExpiry ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-foreground/80',
                          )}>
                            {expired && '⚠ '}{formatExpiry(item.expiryDate)}
                          </span>
                        )
                      }
                      return (
                        <div key={item.id} className="rounded-lg border border-border/40 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 break-words text-sm font-semibold">{item.productName}</p>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                          </div>
                          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batch</p>
                              <p className="mt-0.5 font-mono text-xs">{item.batchNumber || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expiry</p>
                              <p className="mt-0.5 text-xs">{expiryEl}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</p>
                              <p className="mt-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">{item.receivedQty}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Free</p>
                              <p className="mt-0.5 font-mono text-xs">
                                {item.freeQty ? (
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">+{item.freeQty}</span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</p>
                              <p className="mt-0.5 font-mono text-xs">{formatCurrency(item.purchaseRate)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</p>
                              <p className="mt-0.5 font-mono text-xs font-semibold">{formatCurrency(item.receivedQty * item.purchaseRate)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Mobile/tablet (<lg): Invoice, Payment & Summary fields —
                    the desktop right-hand context panel is hidden below lg. */}
                <div className="lg:hidden mt-3 space-y-5 border-t border-border/40 pt-3 overflow-hidden">
                  {renderInvoiceAndPaymentStep()}
                  {renderSummaryAndActionsStep()}
                </div>
              </div>
            </ScrollArea>
          </div>
        ) : (
        <>
          {/* Products vs Panel: both stay mounted at all times (CSS
              visibility, not a JS ternary) because desktop must always show
              Products in this column regardless of mobileSection — its own
              right-hand column is where Panel content lives at lg+. Below lg,
              mobileSection toggles which one is visible. (Not animated with
              AnimatePresence like panelStep is — nesting a mode="wait"
              AnimatePresence around content that already contains its own
              (item-card removal, panelStep's own transition) made Framer
              Motion's exit bookkeeping take 1s+ to settle in practice, which
              stalled the auto-focus this section drives after the Enter-key
              chain.) */}
          <div className={cn(mobileSection === 'products' ? 'flex' : 'hidden', 'lg:flex flex-1 min-h-0 flex-col')}>
          {/* Source bar — PO selector or Direct label */}
          {sourceType === 'po' && (
            <div className="shrink-0 border-b border-border/40 bg-muted/10 px-5 py-3 dark:bg-muted/5">
              {!selectedPO ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      icon={<Search />}
                      suffix={filteredPOs.length > 0 ? (
                        <span className="tabular-nums whitespace-nowrap">{filteredPOs.length} POs</span>
                      ) : undefined}
                      placeholder="Search PO# or supplier to begin..."
                      value={poSearch}
                      onChange={(e) => { setPoSearch(e.target.value); setPoSearchOpen(true) }}
                      onFocus={() => setPoSearchOpen(true)}
                      autoFocus
                    />
                    {/* PO dropdown */}
                    <AnimatePresence>
                      {poSearchOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg"
                        >
                          {filteredPOs.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                              No pending POs found
                            </div>
                          ) : (
                            filteredPOs.map((po) => {
                              const badge = statusBadgeConfig[po.status]
                              return (
                                <button
                                  key={po.id}
                                  className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/20 last:border-b-0"
                                  onClick={() => handleSelectPO(po.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                      <FileText className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div>
                                      <p className="font-mono text-sm font-medium">{po.poNumber}</p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {po.supplierName} &middot; {po.items?.length ?? 0} {(po.items?.length ?? 0) === 1 ? 'item' : 'items'}
                                        {po.status === 'PARTIALLY_RECEIVED' && (
                                          <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                                            · Supplementary delivery
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold">{formatCurrency(po.totalAmount)}</span>
                                    {badge && <Badge variant={badge.variant} size="sm" dot>{badge.label}</Badge>}
                                  </div>
                                </button>
                              )
                            })
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-bold">{selectedPO.poNumber}</p>
                          {isSupplementary ? (
                            <Badge variant="warning" size="sm" dot>Partial</Badge>
                          ) : (
                            <Badge variant={statusBadgeConfig[selectedPO.status]?.variant || 'secondary'} size="sm" dot>
                              {statusBadgeConfig[selectedPO.status]?.label || selectedPO.status}
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground" title={`${selectedPO.supplierName} · ${formatDate(selectedPO.date)} · ${selectedPO.items.length} ${selectedPO.items.length === 1 ? 'item' : 'items'}`}>
                          {selectedPO.supplierName} &middot; {formatDate(selectedPO.date)} &middot; {selectedPO.items.length} {selectedPO.items.length === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                    </div>
                    {!editMode && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSelectedPOId(null); setGrnItems([]) }}
                      >
                        Change PO
                      </Button>
                    )}
                  </div>
                  {(selectedPO.status === 'PARTIALLY_RECEIVED' || isSupplementary) && (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-200/60 bg-blue-50/50 px-3 py-2 dark:border-blue-800/30 dark:bg-blue-900/10">
                      <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                          Supplementary delivery — enter only the remaining qty.
                        </p>
                        <p className="text-[10px] text-blue-600/80 dark:text-blue-300/70 mt-0.5">
                          Attach the supplier's <strong>new invoice</strong> for this delivery. Payment is for what's received now, not the original PO total.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Edit mode (PO source): allow adding extra lines. Direct source
              already has its own product search below. */}
          {editMode && sourceType === 'po' && (
            <div className="shrink-0 border-b border-border/40 bg-muted/10 px-5 py-3 dark:bg-muted/5">
              <div className="relative">
                <Input
                  icon={<Search />}
                  placeholder="Search products to add a line..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onFocus={() => setProductFocused(true)}
                  onClick={() => setProductFocused(true)}
                  onBlur={() => setTimeout(() => setProductFocused(false), 200)}
                />
                {(productFocused || productSearch.trim()) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-56 flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg"
                  >
                    <div onScroll={handleProductDropdownScroll} className="min-h-0 flex-1 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/20 last:border-b-0"
                        // onMouseDown + preventDefault: select before the input
                        // blurs, so the click never gets lost when the dropdown
                        // is open via focus (empty search) rather than typed text.
                        onMouseDown={(e) => { e.preventDefault(); addDirectItem(p) }}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {[p.manufacturer, p.genericName].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <span className="font-mono text-sm text-muted-foreground">{formatCurrency(p.purchaseRate)}</span>
                      </button>
                    ))}
                    {productSearchPaged.loading && (
                      <div className="flex items-center justify-center gap-2 px-4 py-3 text-[11px] text-muted-foreground">
                        <div className="h-3 w-3 rounded-full border-b-2 border-current animate-spin" />
                        Loading products…
                      </div>
                    )}
                    {!productSearchPaged.loading && filteredProducts.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No products found</p>
                    )}
                    </div>
                    {/* Create a new product without leaving the entry. Sits in a
                        fixed footer below the scroll area so it never overlaps rows. */}
                    <button
                      type="button"
                      className="flex w-full shrink-0 items-center gap-2 border-t border-border/40 bg-popover px-4 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-accent/50"
                      onMouseDown={(e) => { e.preventDefault(); setProductFocused(false); setProductFormOpen(true) }}
                    >
                      <Plus className="h-4 w-4" />
                      Add New Product
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {/* Direct entry: product search */}
          {sourceType === 'direct' && (
            <div className="shrink-0 border-b border-border/40 bg-muted/10 px-5 py-2.5 flex flex-col gap-2.5 dark:bg-muted/5">
              {/* Supplier selector — mobile only; on desktop it lives in the header row. */}
              <div className="lg:hidden">
                {renderSupplierSelector()}
              </div>
              {/* Product search (Add Supplier / Add Product now live inside their dropdowns) */}
              <div className="min-w-0 flex items-start gap-2">
                <div className="relative flex-1">
                <Input
                  icon={<Search />}
                  // Enforce the flow: pick a supplier first, then add products.
                  disabled={!directSupplierId}
                  placeholder={directSupplierId ? 'Search products to add...' : 'Select a supplier first to add products'}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onFocus={() => { if (directSupplierId) setProductFocused(true) }}
                  onClick={() => { if (directSupplierId) setProductFocused(true) }}
                  onBlur={() => setTimeout(() => setProductFocused(false), 200)}
                />
                {directSupplierId && (productFocused || productSearch.trim()) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 flex max-h-56 flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg"
                  >
                    <div onScroll={handleProductDropdownScroll} className="min-h-0 flex-1 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/20 last:border-b-0"
                        // onMouseDown + preventDefault: select before the input
                        // blurs, so the click never gets lost when the dropdown
                        // is open via focus (empty search) rather than typed text.
                        onMouseDown={(e) => { e.preventDefault(); addDirectItem(p) }}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {[p.manufacturer, p.genericName].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <span className="font-mono text-sm text-muted-foreground">{formatCurrency(p.purchaseRate)}</span>
                      </button>
                    ))}
                    {productSearchPaged.loading && (
                      <div className="flex items-center justify-center gap-2 px-4 py-3 text-[11px] text-muted-foreground">
                        <div className="h-3 w-3 rounded-full border-b-2 border-current animate-spin" />
                        Loading products…
                      </div>
                    )}
                    {!productSearchPaged.loading && filteredProducts.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No products found</p>
                    )}
                    </div>
                    {/* Create a new product without leaving the entry. Sits in a
                        fixed footer below the scroll area so it never overlaps rows. */}
                    <button
                      type="button"
                      className="flex w-full shrink-0 items-center gap-2 border-t border-border/40 bg-popover px-4 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-accent/50"
                      onMouseDown={(e) => { e.preventDefault(); setProductFocused(false); setProductFormOpen(true) }}
                    >
                      <Plus className="h-4 w-4" />
                      Add New Product
                    </button>
                  </motion.div>
                )}
                </div>
              </div>
            </div>
          )}

          {/* ── Item cards — scrollable ── */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 space-y-2">
              {grnItems.length === 0 && (
                <div className="flex h-60 flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                    <Package className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">No items yet</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      {sourceType === 'po' ? 'Select a purchase order above to load items' : 'Search and add products above'}
                    </p>
                  </div>
                </div>
              )}

              {/* ── List (table) view — compact editable rows, like New Sale ── */}
              {itemViewMode === 'list' && grnItems.filter((i) => i.productId).length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border/40">
                  <table className="w-full min-w-[900px] text-xs [&_input]:[appearance:textfield] [&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                        <th className="w-8 px-2 py-2 text-center">#</th>
                        <th className="px-2 py-2 text-left">Product</th>
                        <th className="w-24 px-2 py-2 text-left">Qty</th>
                        <th className="w-20 px-2 py-2 text-left">Free</th>
                        <th className="w-28 px-2 py-2 text-left">MRP</th>
                        <th className="w-28 px-2 py-2 text-left">Purchase Rate</th>
                        <th className="w-28 px-2 py-2 text-left">Sale Rate</th>
                        <th className="w-28 px-2 py-2 text-left">Batch</th>
                        <th className="w-32 px-2 py-2 text-left">Expiry</th>
                        <th className="w-16 px-2 py-2 text-left">GST%</th>
                        <th className="w-24 px-2 py-2 text-right">Amount</th>
                        {(sourceType === 'direct' || editMode) && <th className="w-8 px-1 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {grnItems.filter((i) => i.productId).map((item, index) => (
                        <tr key={item.id} className={cn(item.shortSupply ? 'bg-amber-50/30 dark:bg-amber-900/5' : item.receivedQty > 0 ? 'bg-emerald-50/20 dark:bg-emerald-900/5' : '')}>
                          <td className="px-2 py-1.5 text-center text-[10px] font-bold text-muted-foreground">{index + 1}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate font-semibold text-[13px]" title={item.productName}>{item.productName}</span>
                              {item.shortSupply && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
                            </div>
                          </td>
                          <td className="px-1.5 py-1"><Input id={grnFieldId(item.id, 'receivedQty')} type="number" min={0} className="h-8 font-mono text-xs" placeholder="0" value={item.receivedQty || ''} onChange={(e) => updateItem(index, 'receivedQty', Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'receivedQty') } }} /></td>
                          <td className="px-1.5 py-1"><Input id={grnFieldId(item.id, 'freeQty')} type="number" min={0} className="h-8 font-mono text-xs" placeholder="0" value={item.freeQty || ''} onChange={(e) => updateItem(index, 'freeQty', Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'freeQty') } }} /></td>
                          <td className="px-1.5 py-1"><Input id={grnFieldId(item.id, 'mrp')} type="number" min={0} className={cn('h-8 font-mono text-xs', showPriceErr(item.id, 'purchaseRate', item) && 'border-rose-400 focus-visible:ring-rose-400')} placeholder="0.00" value={item.mrp || ''} onChange={(e) => updateItem(index, 'mrp', Number(e.target.value))} onBlur={() => markPriceTouched(item.id, 'mrp')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'mrp') } }} /></td>
                          <td className="px-1.5 py-1"><Input id={grnFieldId(item.id, 'purchaseRate')} type="number" min={0} className={cn('h-8 font-mono text-xs', showPriceErr(item.id, 'purchaseRate', item) && 'border-rose-400 focus-visible:ring-rose-400')} placeholder="0.00" value={item.purchaseRate || ''} onChange={(e) => updateItem(index, 'purchaseRate', Number(e.target.value))} onBlur={() => markPriceTouched(item.id, 'purchaseRate')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'purchaseRate') } }} />{showPriceErr(item.id, 'purchaseRate', item) && <p className="mt-0.5 text-[9px] font-medium text-rose-600 dark:text-rose-400">{showPriceErr(item.id, 'purchaseRate', item)}</p>}</td>
                          <td className="px-1.5 py-1"><Input id={grnFieldId(item.id, 'sellingRate')} type="number" min={0} className={cn('h-8 font-mono text-xs', showPriceErr(item.id, 'sellingRate', item) && 'border-rose-400 focus-visible:ring-rose-400')} placeholder="0.00" value={item.sellingRate || ''} onChange={(e) => updateItem(index, 'sellingRate', Number(e.target.value))} onBlur={() => markPriceTouched(item.id, 'sellingRate')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'sellingRate') } }} />{showPriceErr(item.id, 'sellingRate', item) && <p className="mt-0.5 text-[9px] font-medium text-rose-600 dark:text-rose-400">{showPriceErr(item.id, 'sellingRate', item)}</p>}</td>
                          <td className="px-1.5 py-1">
                            <Input
                              id={grnFieldId(item.id, 'batchNumber')}
                              className={cn(
                                'h-8 font-mono text-xs',
                                item.receivedQty > 0 && !item.batchNumber?.trim() && 'border-rose-400 focus-visible:ring-rose-400',
                                isBatchDuplicate(item) && 'border-amber-400 focus-visible:ring-amber-400',
                              )}
                              placeholder="B-00000"
                              title={item.receivedQty > 0 && !item.batchNumber?.trim() ? 'Batch number is required' : isBatchDuplicate(item) ? 'Batch already exists for this product' : undefined}
                              value={item.batchNumber}
                              onChange={(e) => updateItem(index, 'batchNumber', e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'batchNumber') } }}
                            />
                            {isBatchDuplicate(item) && (
                              <p className="mt-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">Batch already exists</p>
                            )}
                          </td>
                          <td className="px-1.5 py-1"><MonthYearPicker id={grnFieldId(item.id, 'expiryDate')} className={cn('h-8 text-xs', item.expiryDate && (isExpiryHealthy(item.expiryDate) ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'))} value={item.expiryDate} min={new Date().toISOString().slice(0, 10)} onChange={(v) => updateItem(index, 'expiryDate', v)} onEnterKey={() => handleRowEnter(index, 'expiryDate')} /></td>
                          {/* GST is fixed to the product's master rate — not editable at receiving. */}
                          <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground" title="GST rate comes from the product master">{(products.find((p) => p.id === item.productId)?.gstRate ?? item.gstPercent ?? 12)}%</td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold whitespace-nowrap">{formatCurrency(item.receivedQty * item.purchaseRate)}</td>
                          {(sourceType === 'direct' || editMode) && (
                            <td className="px-1 py-1 text-center">
                              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeItem(index)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {itemViewMode === 'card' && (
              <AnimatePresence mode="popLayout">
                {grnItems.filter((i) => i.productId).map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.15, delay: index * 0.02 }}
                    className={cn(
                      'rounded-xl border transition-all',
                      item.shortSupply
                        ? 'border-amber-300/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-900/5'
                        : item.receivedQty > 0
                          ? 'border-emerald-300/50 bg-emerald-50/20 dark:border-emerald-500/15 dark:bg-emerald-900/5'
                          : 'border-border/40'
                    )}
                  >
                    {/* Row 1: Product header */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                          item.receivedQty > 0
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{item.productName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.shortSupply && (
                          <Badge variant="warning" size="sm" dot>
                            <AlertTriangle className="mr-0.5 h-3 w-3" />
                            Short
                          </Badge>
                        )}
                        {item.receivedQty > 0 && !item.shortSupply && (
                          <Badge variant="success" size="sm" dot>
                            <CheckCircle2 className="mr-0.5 h-3 w-3" />
                            OK
                          </Badge>
                        )}
                        {sourceType === 'po' && (
                          item._alreadyReceived != null && item._alreadyReceived > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" size="sm" className="font-mono text-amber-600 border-amber-300">
                                {item._remaining} remaining
                              </Badge>
                              <Badge variant="secondary" size="sm" className="font-mono text-[10px]">
                                {item._alreadyReceived}/{item.orderedQty} received
                              </Badge>
                            </div>
                          ) : (
                            <Badge variant="outline" size="sm" className="font-mono">
                              Ord: {item.orderedQty}
                            </Badge>
                          )
                        )}
                        {(sourceType === 'direct' || editMode) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Editable fields — all on a single row at lg+ */}
                    <div className="px-4 pb-4 space-y-3">
                      {/* Received Qty · Free Qty · Purchase Rate · MRP · Sale Rate · Batch · Expiry · GST */}
                      <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Qty</Label>
                          <Input
                            id={grnFieldId(item.id, 'receivedQty')}
                            type="number"
                            min={0}
                            className="h-9 font-mono text-xs font-black border-primary/10 bg-muted/20 focus:bg-background transition-all"
                            placeholder="0"
                            value={item.receivedQty || ''}
                            onChange={(e) => updateItem(index, 'receivedQty', Number(e.target.value))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'receivedQty') } }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Free Qty</Label>
                          <Input
                            id={grnFieldId(item.id, 'freeQty')}
                            type="number"
                            min={0}
                            className="h-9 font-mono text-xs border-primary/5 bg-muted/20 focus:bg-background transition-all"
                            placeholder="0"
                            value={item.freeQty || ''}
                            onChange={(e) => updateItem(index, 'freeQty', Number(e.target.value))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'freeQty') } }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">MRP</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/30">₹</span>
                            <Input
                              id={grnFieldId(item.id, 'mrp')}
                              type="number"
                              min={0}
                              className={cn('h-9 font-mono text-xs font-bold pl-5 border-primary/5 bg-muted/20 focus:bg-background transition-all', showPriceErr(item.id, 'purchaseRate', item) && 'border-rose-400 focus-visible:ring-rose-400')}
                              placeholder="0.00"
                              value={item.mrp || ''}
                              onChange={(e) => updateItem(index, 'mrp', Number(e.target.value))}
                              onBlur={() => markPriceTouched(item.id, 'mrp')}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'mrp') } }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Purchase Rate</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/30">₹</span>
                            <Input
                              id={grnFieldId(item.id, 'purchaseRate')}
                              type="number"
                              min={0}
                              className={cn('h-9 font-mono text-xs font-bold pl-5 border-primary/5 bg-muted/20 focus:bg-background transition-all', showPriceErr(item.id, 'purchaseRate', item) && 'border-rose-400 focus-visible:ring-rose-400')}
                              placeholder="0.00"
                              value={item.purchaseRate || ''}
                              onChange={(e) => updateItem(index, 'purchaseRate', Number(e.target.value))}
                              onBlur={() => markPriceTouched(item.id, 'purchaseRate')}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'purchaseRate') } }}
                            />
                          </div>
                          {showPriceErr(item.id, 'purchaseRate', item) && <p className="text-[9px] font-medium text-rose-600 dark:text-rose-400">{showPriceErr(item.id, 'purchaseRate', item)}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Sale Rate</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/30">₹</span>
                            <Input
                              id={grnFieldId(item.id, 'sellingRate')}
                              type="number"
                              min={0}
                              className={cn(
                                'h-9 font-mono text-xs font-bold pl-5 border-primary/5 bg-muted/20 focus:bg-background transition-all',
                                showPriceErr(item.id, 'sellingRate', item) && 'border-rose-400 focus-visible:ring-rose-400',
                              )}
                              placeholder="0.00"
                              value={item.sellingRate || ''}
                              onChange={(e) => updateItem(index, 'sellingRate', Number(e.target.value))}
                              onBlur={() => markPriceTouched(item.id, 'sellingRate')}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'sellingRate') } }}
                            />
                          </div>
                          {showPriceErr(item.id, 'sellingRate', item) && <p className="text-[9px] font-medium text-rose-600 dark:text-rose-400">{showPriceErr(item.id, 'sellingRate', item)}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Batch Number</Label>
                          <Input
                            id={grnFieldId(item.id, 'batchNumber')}
                            className={cn(
                              'h-9 font-mono text-xs font-bold tracking-tight bg-muted/20 focus:bg-background transition-all',
                              item.receivedQty > 0 && !item.batchNumber?.trim()
                                ? 'border-rose-400 focus-visible:ring-rose-400'
                                : isBatchDuplicate(item)
                                  ? 'border-amber-400 focus-visible:ring-amber-400'
                                  : 'border-primary/5',
                            )}
                            placeholder="B-00000"
                            value={item.batchNumber}
                            onChange={(e) => updateItem(index, 'batchNumber', e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRowEnter(index, 'batchNumber') } }}
                          />
                          {item.receivedQty > 0 && !item.batchNumber?.trim() ? (
                            <p className="mt-1 text-[10px] font-medium text-rose-500">Batch number is required</p>
                          ) : isBatchDuplicate(item) ? (
                            <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">Batch already exists for this product</p>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Expiry (MM/YYYY)</Label>
                          <MonthYearPicker
                            id={grnFieldId(item.id, 'expiryDate')}
                            className={cn(
                              "h-9 text-xs font-bold bg-muted/20 focus:bg-background transition-all",
                              !item.expiryDate && "border-primary/5",
                              // Shelf-life signal: green when the batch expires
                              // at least 6 months out, red when it expires sooner
                              // (or has already lapsed) so short-dated stock is
                              // caught at receiving.
                              item.expiryDate && (isExpiryHealthy(item.expiryDate)
                                ? "text-emerald-600 border-emerald-500/40 dark:text-emerald-400"
                                : "text-red-600 border-red-500/40 dark:text-red-400")
                            )}
                            value={item.expiryDate}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(v) => updateItem(index, 'expiryDate', v)}
                            onEnterKey={() => handleRowEnter(index, 'expiryDate')}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">GST %</Label>
                          {/* GST is fixed to the product's master rate — not editable at receiving. */}
                          <div
                            className="flex h-9 items-center justify-between rounded-md border border-primary/5 bg-muted/30 px-3 font-mono text-xs font-bold text-muted-foreground"
                            title="GST rate comes from the product master"
                          >
                            <span>{(products.find((p) => p.id === item.productId)?.gstRate ?? item.gstPercent ?? 12)}</span>
                            <span className="text-[10px] text-muted-foreground/40">%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Line total — subtle bottom strip */}
                    {item.receivedQty > 0 && (
                      <div className="flex items-center justify-end gap-4 border-t border-border/20 bg-muted/10 px-4 py-1.5 text-[11px] dark:bg-muted/5">
                        <span className="text-muted-foreground">
                          {item.receivedQty} x {formatCurrency(item.purchaseRate)}
                        </span>
                        <span className="font-mono font-bold">
                          {formatCurrency(item.receivedQty * item.purchaseRate)}
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              )}
                  </div>
                </ScrollArea>
          </div>
          <div className={cn(mobileSection === 'panel' ? 'flex' : 'hidden', 'lg:hidden flex-1 min-h-0 flex-col')}>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4 space-y-5">
                  {renderInvoiceAndPaymentStep()}
                  {renderSummaryAndActionsStep()}
                </div>
              </ScrollArea>
          </div>
        </>
        )}

        {/* ── Mobile action footer (hidden on lg+, where the right panel shows) ── */}
        <div className="lg:hidden shrink-0 border-t border-border/40 bg-background p-3 space-y-2">
          {mobileSection === 'products' ? (
            <Button className="w-full" disabled={!canConfirm} onClick={() => goToMobileSection('panel')}>
              Next
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goToMobileSection('products')}>
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!canConfirm || (showConfirm && isSubmitting)}
                onClick={showConfirm ? handleConfirm : handleReview}
              >
                {showConfirm && isSubmitting ? (
                  <div className="mr-1.5 h-4 w-4 rounded-full border-b-2 border-white animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                )}
                {showConfirm ? (isSubmitting ? 'Saving…' : 'Confirm') : 'Review'}
              </Button>
            </div>
          )}
          {editMode ? (
            <Button variant="outline" className="w-full text-muted-foreground" onClick={() => navigate('/purchase/grn-list')}>
              Cancel
            </Button>
          ) : grnItems.length > 0 ? (
            <Button variant="outline" className="w-full text-muted-foreground" onClick={handleDiscard}>
              Discard & Start Over
            </Button>
          ) : null}
        </div>
        </div>

        {/* ─── BOTTOM: Summary bar (full width) — Supplier Invoice + Payment
            beside the Live Summary, like the New Sale bottom bar ─── */}
        <div className="hidden lg:flex lg:w-full shrink-0 flex-col overflow-hidden border-t border-border/40 bg-muted/5 dark:bg-muted/2">
          <div className="flex items-stretch divide-x divide-border/50 max-h-[34vh] overflow-y-auto">
            {/* ── Region 1: Summary totals (Order Summary style) ── */}
            <div className="shrink-0 p-2.5 flex flex-col">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                Summary
                <span className="ml-auto inline-flex items-center gap-1 font-semibold tabular-nums">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex-1 flex items-start gap-x-6 gap-y-1.5 text-xs xl:text-[13px]">
                <div className="flex w-36 flex-col gap-y-1.5">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">No. of Items</span><span className="font-mono font-medium tabular-nums">{totalItems}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Total Qty</span><span className="font-mono font-medium tabular-nums">{totalQty}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Short</span><span className={cn('font-mono font-medium tabular-nums', shortSupplyCount > 0 && 'text-amber-600 dark:text-amber-400')}>{shortSupplyCount}</span></div>
                </div>
                <div className="flex w-44 flex-col gap-y-1.5">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Taxable</span><span className="font-mono font-medium tabular-nums">{formatCurrency(gstBreakdown.taxable)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">CGST{gstHalfLabel}</span><span className="font-mono font-medium tabular-nums">{formatCurrency(gstBreakdown.cgst)}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">SGST{gstHalfLabel}</span><span className="font-mono font-medium tabular-nums">{formatCurrency(gstBreakdown.sgst)}</span></div>
                </div>
              </div>
            </div>

            {/* ── Region 2: Payment (create-only; Supplier Invoice lives in the header) ── */}
            {!editMode && !replacementReturnId && (
              <div className="flex-1 min-w-0 p-2.5 space-y-2.5">
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" />
                    Payment
                  </div>
                  <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
                    {([['CREDIT', 'Credit'], ['PARTIAL', 'Partial'], ['PAID', 'Paid in full']] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPayChoice(val)}
                        className={cn(
                          'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all',
                          payChoice === val ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {payChoice === 'CREDIT' ? (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">Full invoice amount will be added to the supplier's outstanding.</p>
                  ) : (
                    <div className={cn('mt-2 grid gap-2 items-end', payMode !== 'CASH' ? 'grid-cols-4' : 'grid-cols-3')} data-field="paymentExtra">
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Amount Paid{payChoice === 'PARTIAL' && <span className="text-rose-500"> *</span>}</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 font-mono text-xs"
                          placeholder="0.00"
                          value={payChoice === 'PAID' ? (invoiceAmount || '') : (paidAmount || '')}
                          disabled={payChoice === 'PAID'}
                          max={invoiceAmount || undefined}
                          onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value) || 0))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Mode</Label>
                        <Select value={payMode} onValueChange={(v) => setPayMode(v as 'CASH' | 'CHEQUE' | 'NEFT_UPI')}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="CHEQUE">Cheque</SelectItem>
                            <SelectItem value="NEFT_UPI">NEFT / UPI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {payMode !== 'CASH' && (
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {payMode === 'CHEQUE' ? 'Cheque No.' : 'Reference / UTR No.'}
                          </Label>
                          <Input
                            className="h-8 font-mono text-xs"
                            placeholder={payMode === 'CHEQUE' ? 'Cheque number' : 'UPI / NEFT ref'}
                            value={payReference}
                            onChange={(e) => setPayReference(e.target.value)}
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</Label>
                        <p className="h-8 flex items-center justify-end font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {formatCurrency(Math.max(0, (Number(invoiceAmount) || 0) - effectivePaid))}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Due date for the credit balance — CREDIT or PARTIAL. */}
                  {payChoice !== 'PAID' && (
                    <div className="mt-2 flex items-center gap-2">
                      <Label className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Due Date<span className="text-rose-500"> *</span>
                      </Label>
                      <DatePicker className="h-8 flex-1 text-xs" value={dueDate} onChange={setDueDate} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Region 2 (edit mode): Payment — read-only. The paid amount is
                fixed once received; adjust it via Supplier Outstanding / Payments
                Due. Only the credit due date (in the header) stays editable. ── */}
            {editMode && !replacementReturnId && (
              <div className="flex-1 min-w-0 p-2.5 space-y-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Payment
                </div>
                <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                    <Badge variant={payChoice === 'PAID' ? 'success' : payChoice === 'PARTIAL' ? 'warning' : 'secondary'} size="sm">
                      {payChoice === 'PAID' ? 'Paid in full' : payChoice === 'PARTIAL' ? 'Partial' : 'Credit'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Amount Paid</p>
                    <p className="font-mono text-xs font-semibold tabular-nums">{formatCurrency(effectivePaid)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Balance</p>
                    <p className="font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCurrency(Math.max(0, (Number(invoiceAmount) || 0) - effectivePaid))}
                    </p>
                  </div>
                  {payChoice !== 'PAID' && dueDate && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Due Date</p>
                      <p className="font-mono text-xs font-medium tabular-nums">{new Date(dueDate).toLocaleDateString('en-IN')}</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Read-only — record or adjust payments from Supplier Outstanding / Payments Due. The due date above stays editable.
                </p>
              </div>
            )}

            {/* ── Region 3: Total Value (Net Payable style) ── */}
            <div className="w-56 xl:w-64 shrink-0 flex flex-col gap-2 p-2.5 bg-linear-to-br from-primary/10 via-primary/5 to-transparent">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/80">
                <IndianRupee className="h-3.5 w-3.5" />
                Total Value
              </div>
              <span className="block whitespace-nowrap text-right font-mono text-2xl xl:text-[1.75rem] leading-none font-bold tabular-nums tracking-tight text-foreground">
                {formatCurrency(gstBreakdown.total)}
              </span>
              {Number(invoiceAmount) > 0 && Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)) > 0.01 && (
                <p className="mt-auto text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  Invoice {Number(invoiceAmount) > Number(gstBreakdown.total) ? 'over' : 'short'} by {formatCurrency(Math.abs(Number(invoiceAmount) - Number(gstBreakdown.total)))}
                </p>
              )}
            </div>
          </div>

          {/* ── Pinned Action Footer ── (review-mode aware) ── */}
          <div className="shrink-0 border-t border-border/40 bg-background p-3 flex flex-wrap items-center gap-2 [&>*]:flex-1 [&>*]:min-w-40">
            {showConfirm ? (
              <>
                <Button variant="outline" onClick={() => setShowConfirm(false)}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="order-last"
                  disabled={!canConfirm || isSubmitting}
                  onClick={handleConfirm}
                >
                  {isSubmitting ? (
                    <div className="mr-1.5 h-4 w-4 rounded-full border-b-2 border-white animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  )}
                  {isSubmitting ? 'Saving…' : 'Confirm'}
                </Button>
              </>
            ) : (
              <Button
                className="order-last"
                disabled={!canConfirm}
                onClick={handleReview}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Review
              </Button>
            )}
            {editMode ? (
              <Button variant="outline" className="w-full text-muted-foreground" onClick={() => navigate('/purchase/grn-list')}>
                Cancel
              </Button>
            ) : grnItems.length > 0 ? (
              <Button variant="outline" className="w-full text-muted-foreground" onClick={handleDiscard}>
                Discard & Start Over
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SHORT SUPPLY ACTION DIALOG                                */}
      {/* ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {shortActionDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg rounded-2xl border border-border/60 bg-background p-6 shadow-2xl mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <FileWarning className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Short Delivery Detected</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    GRN saved. {shortActionDialog.shortItems.length} product(s) received less than ordered.
                  </p>
                </div>
              </div>

              {/* Short items summary */}
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-900/10 mb-4 overflow-hidden">
                {shortActionDialog.shortItems.map((item, i) => (
                  <div key={item.productId} className={cn('flex items-center justify-between px-3 py-2 text-xs', i > 0 && 'border-t border-amber-200/40 dark:border-amber-800/20')}>
                    <span className="font-medium truncate max-w-[55%]">{item.productName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">Ordered: <span className="font-mono font-semibold text-foreground">{item.orderedQty}</span></span>
                      <span className="text-muted-foreground">Received: <span className="font-mono font-semibold text-emerald-600">{item.receivedQty}</span></span>
                      <Badge variant="warning" size="sm">{item.orderedQty - item.receivedQty} short</Badge>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mb-4">What would you like to do about the missing items?</p>

              {/* Action options */}
              <div className="space-y-2 mb-5">
                {/* Raise Short-Billing Debit Note */}
                <button
                  onClick={() => setShortBillingOpen(true)}
                  className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40 hover:border-primary/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 mt-0.5">
                    <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Raise Short-Billing Debit Note</p>
                    <p className="text-[11px] text-muted-foreground">Supplier won't send the rest. Claim back the amount they billed for goods that never arrived. Stock is unaffected.</p>
                  </div>
                </button>

                {/* Expect More */}
                <button
                  onClick={() => {
                    setShortActionDialog(null)
                    toast.info('PO marked as Partially Received. You can raise another Purchase Entry against this PO when the remaining items arrive.', { duration: 6000 })
                    navigate('/purchase/grn-list')
                  }}
                  className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40 hover:border-primary/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 mt-0.5">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Expect Supplementary Delivery</p>
                    <p className="text-[11px] text-muted-foreground">Supplier will deliver the remaining qty later. PO stays open — raise another Purchase Entry when goods arrive.</p>
                  </div>
                </button>

                {/* Ignore */}
                <button
                  onClick={() => {
                    setShortActionDialog(null)
                    navigate('/purchase/grn-list')
                  }}
                  className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted mt-0.5">
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Ignore for Now</p>
                    <p className="text-[11px] text-muted-foreground">Handle the shortage manually later.</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation overlay was here — replaced by the in-panel Review View
          rendered in the LEFT workspace when `showConfirm === true`. */}

      {shortActionDialog && (
        <ShortBillingDialog
          open={shortBillingOpen}
          onOpenChange={(o) => {
            setShortBillingOpen(o)
            if (!o) {
              // user cancelled — close the parent action dialog too so they can move on
            }
          }}
          grn={{
            id: shortActionDialog.savedGrnId,
            grnNumber: shortActionDialog.savedGrnNumber,
            supplierId: shortActionDialog.supplierId,
            supplierName: shortActionDialog.supplierName,
          }}
          shortItems={shortActionDialog.shortItems.map<ShortBillingItem>((it) => ({
            productId: it.productId,
            productName: it.productName,
            shortQty: it.orderedQty - it.receivedQty,
            purchaseRate: it.rate,
            gstPercent: it.gstPercent,
            batchNumber: it.batchNumber,
            expiryDate: it.expiryDate,
          }))}
          onSuccess={() => {
            setShortBillingOpen(false)
            setShortActionDialog(null)
            navigate('/purchase/debit-notes')
          }}
        />
      )}

      <SupplierFormDialog
        open={supplierFormOpen}
        onOpenChange={setSupplierFormOpen}
        editingSupplier={null}
        onSaved={async (saved, mode) => {
          if (mode !== 'create') return
          await fetchMasterData()
          try {
            const res = await api.get(`/suppliers?q=${encodeURIComponent(saved.name)}&take=10`)
            const payload = res.data
            const items = (payload?.data ?? payload ?? []) as Array<{ id: string; name: string; phone?: string }>
            const match = items.find((s) => s.name === saved.name) ?? items[0]
            if (match) {
              setDirectSupplierId(match.id)
              setDirectSupplierName(match.name)
              setSupplierSearch('')
              setSupplierDropdownOpen(false)
            }
          } catch {
            // master data refresh still happened; user can pick manually
          }
        }}
      />

      <ProductFormDialog
        open={productFormOpen}
        onOpenChange={setProductFormOpen}
        prefillName={productSearch}
        onSaved={async (newProduct) => {
          await fetchMasterData()
          // Auto-add to the GRN items table so the pharmacist can immediately
          // enter batch/qty for the just-created product — same convenience
          // the customer-add / supplier-add flows provide elsewhere.
          addDirectItem(newProduct)
        }}
      />
    </div>
  )
}
