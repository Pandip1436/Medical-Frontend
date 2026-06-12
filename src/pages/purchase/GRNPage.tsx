import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'
import type { Product } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package,
  ClipboardList,
  CheckCircle2,
  Trash2,
  Search,
  AlertTriangle,
  ArrowLeft,
  Layers,
  FileText,
  Printer,
  Download,
  ShieldCheck,
  AlertCircle,
  RotateCcw,
  Clock,
  FileWarning,
  XCircle,
  ChevronLeft,
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
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate, goBack, useRoute } from '@/lib/router'
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
  _alreadyReceived?: number
  _remaining?: number
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

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
    shortSupply: false,
    _alreadyReceived: 0,
    _remaining: 0,
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

  // Receive-time payment (create-only, non-replacement). CREDIT = pay nothing now
  // → whole invoice goes to supplier outstanding. PAID = settle in full now.
  // PARTIAL = pay a portion now; the rest goes to outstanding.
  const [payChoice, setPayChoice] = useState<'CREDIT' | 'PAID' | 'PARTIAL'>('CREDIT')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [payMode, setPayMode] = useState<'CASH' | 'CHEQUE' | 'NEFT_UPI'>('CASH')

  // Confirm overlay
  const [showConfirm, setShowConfirm] = useState(false)

  // Post-confirm short supply action dialog
  const [shortActionDialog, setShortActionDialog] = useState<{
    savedGrnId: string
    savedGrnNumber: string
    shortItems: Array<{ productId: string; productName: string; orderedQty: number; receivedQty: number; rate: number; batchNumber: string; expiryDate: string; gstPercent: number; supplierId: string; supplierName: string }>
    supplierId: string
    supplierName: string
  } | null>(null)
  const [shortBillingOpen, setShortBillingOpen] = useState(false)

  const { purchaseOrders, products, suppliers, fetchMasterData } = useMasterDataStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Phone for the selected direct-entry supplier, resolved from master data by
  // id so the picked-supplier card can show the number beside the name.
  const directSupplierPhone = useMemo(
    () => suppliers.find((s) => s.id === directSupplierId)?.phone ?? null,
    [suppliers, directSupplierId],
  )

  const fetchData = useCallback(() => { fetchMasterData() }, [fetchMasterData])
  useEffect(() => { fetchData() }, [fetchData])

  // Auto-switch to Direct Entry when coming from a replacement return
  useEffect(() => {
    if (replacementReturnId) {
      setSourceType('direct')
      setGrnItems([createEmptyItem()])
    }
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
        setInvoiceAmount(Number(grn.supplierInvoiceAmount) || 0)
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
              shortSupply: ordered > 0 && received < ordered,
            } as GRNFormItem
          })
        )
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
  const grnNumber = editMode ? editGrnNumber || 'PE' : 'PE / pending'

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
  function handleSourceChange(type: 'po' | 'direct') {
    setSourceType(type)
    setSelectedPOId(null)
    setGrnItems(type === 'direct' ? [createEmptyItem()] : [])
    setInvoiceNo('')
    setInvoiceDate('')
    setInvoiceAmount(0)
    setPayChoice('CREDIT')
    setPaidAmount(0)
    setPayMode('CASH')
    setDirectSupplierId('')
    setDirectSupplierName('')
    setSupplierSearch('')
  }

  // ── Item operations ──
  function updateItem(index: number, field: keyof GRNFormItem, value: string | number) {
    setGrnItems((prev) => {
      const updated = [...prev]
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

  // ── Calculations ──
  const isSupplementary = grnItems.some((i) => (i._alreadyReceived ?? 0) > 0)
  const receivedItems = grnItems.filter((i) => i.receivedQty > 0)
  const totalItems = receivedItems.length
  const totalQty = receivedItems.reduce((s, i) => s + i.receivedQty + (i.freeQty || 0), 0)
  const totalValue = receivedItems.reduce((s, i) => s + i.receivedQty * i.purchaseRate, 0)
  const shortSupplyCount = grnItems.filter((i) => i.shortSupply).length
  
  // Real GST calculation per-item based on master product data
  let cgstSum = 0;
  let sgstSum = 0;
  receivedItems.forEach(i => {
    const prod = products.find(p => p.id === i.productId);
    const rate = prod?.gstRate ?? 12; // Fallback to 12% if not found
    const lineTaxable = i.receivedQty * i.purchaseRate;
    const gstValue = lineTaxable * (rate / 100);
    cgstSum += gstValue / 2;
    sgstSum += gstValue / 2;
  });

  const gstBreakdown = {
    taxable: totalValue,
    cgst: cgstSum,
    sgst: sgstSum,
    total: totalValue + cgstSum + sgstSum,
  }

  const canConfirm = receivedItems.length > 0

  // Amount actually paid to the supplier at receive time (drives outstanding).
  const effectivePaid = replacementReturnId
    ? 0
    : payChoice === 'PAID'
      ? Number(invoiceAmount) || 0
      : payChoice === 'PARTIAL'
        ? Math.min(Number(paidAmount) || 0, Number(invoiceAmount) || 0)
        : 0

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

    setIsSubmitting(true)
    try {
      // For replacement GRNs, default invoice number/date if user left them blank
      const effectiveInvoiceNo = invoiceNo || (isReplacementFlow ? `REPL-${Date.now()}` : '')
      const effectiveInvoiceDate = invoiceDate
        ? new Date(invoiceDate).toISOString()
        : (isReplacementFlow ? new Date().toISOString() : new Date(invoiceDate).toISOString())

      const payload = {
        poId: selectedPOId ?? undefined,
        supplierId: selectedPO?.supplierId ?? directSupplierId,
        supplierName: selectedPO?.supplierName ?? directSupplierName,
        supplierInvoiceNo: effectiveInvoiceNo,
        supplierInvoiceDate: effectiveInvoiceDate,
        supplierInvoiceAmount: Number(invoiceAmount) || 0,
        totalAmount: Number(gstBreakdown.total) || 0,
        status: 'RECEIVED',
        isReplacement: isReplacementFlow,
        // Receive-time payment (ignored by the edit path, which preserves amountPaid).
        amountPaid: isReplacementFlow ? 0 : effectivePaid,
        paymentMode: payMode,
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
        navigate('/purchase/grn-list')
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
            gstPercent: Number(prod(i.productId)?.gstRate) || 12,
            supplierId: effSupplierId,
            supplierName: effSupplierName,
          })),
        })
      }

      setSourceType('po')
      setSelectedPOId(null)
      setGrnItems([])
      setInvoiceNo('')
      setInvoiceDate('')
      setInvoiceAmount(0)
      setPayChoice('CREDIT')
      setPaidAmount(0)
      setPayMode('CASH')
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
    setInvoiceAmount(0)
    setPayChoice('CREDIT')
    setPaidAmount(0)
    setPayMode('CASH')
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-content-viewport flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-background px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => goBack(editMode ? '/purchase/grn-list' : '/purchase/orders')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{editMode ? 'Edit Purchase Entry' : 'New Purchase Entry'}</h2>
            <p className="text-[11px] text-muted-foreground">
              {editMode ? 'Amend a received PE — stock is reconciled on save' : 'Receive and verify incoming goods'}
            </p>
          </div>
        </div>

        {/* Replacement return context banner */}
        {replacementReturnId && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800/40 dark:bg-emerald-950/20">
            <RotateCcw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Receiving replacement goods — this PE will be auto-linked to the debit note and marked Settled.
            </span>
          </div>
        )}

        {/* Source toggle — segmented control. Locked in edit mode: a received
            GRN's source (PO vs direct) and supplier can't be re-pointed. */}
        <div className={cn('flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5', editMode && 'opacity-60')}>
          <button
            onClick={() => handleSourceChange('po')}
            disabled={editMode}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              editMode && 'cursor-not-allowed',
              sourceType === 'po'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Against PO
          </button>
          <button
            onClick={() => handleSourceChange('direct')}
            disabled={editMode}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              editMode && 'cursor-not-allowed',
              sourceType === 'direct'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Direct Entry
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" size="sm" className="font-mono">
            {grnNumber}
          </Badge>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MAIN WORKSPACE — Two-column layout                        */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Item Workspace (70%) — or Review View when confirming ─── */}
        <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[70%]">
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
                {/* KPI strip — Items / Total Qty / Value / Short */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
                    <p className="mt-0.5 font-mono text-xl font-bold">{totalItems}</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Qty</p>
                    <p className="mt-0.5 font-mono text-xl font-bold">{totalQty}</p>
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Value</p>
                    <p className="mt-0.5 font-mono text-xl font-bold text-primary">{formatCurrency(gstBreakdown.total)}</p>
                  </div>
                  <div className={cn(
                    'rounded-xl border px-4 py-3',
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
                      'mt-0.5 font-mono text-xl font-bold',
                      shortSupplyCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                    )}>
                      {shortSupplyCount > 0 ? `${shortSupplyCount}` : '✓ Ready'}
                    </p>
                  </div>
                </div>

                {/* Source / Invoice meta — single horizontal card */}
                <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Source</p>
                    <p className="mt-0.5 text-sm font-medium truncate">
                      {sourceType === 'po' && selectedPO ? `PO · ${selectedPO.poNumber}` : 'Direct Entry'}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Supplier</p>
                    <p className="mt-0.5 text-sm font-medium truncate" title={selectedPO?.supplierName || directSupplierName || '—'}>
                      {selectedPO?.supplierName || directSupplierName || '—'}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Supplier Invoice</p>
                    <p className="mt-0.5 font-mono text-sm font-medium truncate">{invoiceNo || '—'}</p>
                  </div>
                  <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Inv. Amount</p>
                    <p className="mt-0.5 font-mono text-sm font-medium">{invoiceAmount > 0 ? formatCurrency(invoiceAmount) : '—'}</p>
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
                  <Table>
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
                                  {expired && '⚠ '}{formatDate(item.expiryDate)}
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
              </div>
            </ScrollArea>
          </div>
        ) : (
        <>
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
                      <div>
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
                        <p className="text-[11px] text-muted-foreground">
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
                    onScroll={handleProductDropdownScroll}
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg"
                  >
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
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {/* Direct entry: product search */}
          {sourceType === 'direct' && (
            <div className="shrink-0 border-b border-border/40 bg-muted/10 px-5 py-3 space-y-3 dark:bg-muted/5">
              {/* Supplier selector */}
              {directSupplierId ? (
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Selected supplier</p>
                    <p className="mt-0.5 truncate text-lg font-bold text-foreground">{directSupplierName}</p>
                    {directSupplierPhone && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" /> {directSupplierPhone}
                      </p>
                    )}
                  </div>
                  {!editMode && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setDirectSupplierId(''); setDirectSupplierName(''); setSupplierSearch('') }}
                    >
                      ✕ Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="relative flex-1">
                    <Input
                      icon={<Search />}
                      placeholder="Search and select supplier..."
                      value={supplierSearch}
                      onChange={(e) => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true) }}
                      onFocus={() => setSupplierDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 200)}
                      autoFocus
                    />
                    {supplierDropdownOpen && (
                      <div
                        ref={supplierDropdownScrollRef}
                        onScroll={handleSupplierDropdownScroll}
                        className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg"
                      >
                        {supplierResults.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/20 last:border-b-0"
                            onMouseDown={(e) => { e.preventDefault(); setDirectSupplierId(s.id); setDirectSupplierName(s.name); setSupplierSearch(''); setSupplierDropdownOpen(false) }}
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
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() => setSupplierFormOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Supplier
                  </Button>
                </div>
              )}
              {/* Product search + Add Product. Mirrors the supplier row above —
                  Add Product opens the shared ProductFormDialog drawer so users
                  can create a master record without leaving the GRN flow. */}
              <div className="flex items-start gap-2">
                <div className="relative flex-1">
                <Input
                  icon={<Search />}
                  placeholder="Search products to add..."
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
                    onScroll={handleProductDropdownScroll}
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg"
                  >
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
                  </motion.div>
                )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => setProductFormOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
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

                    {/* Row 2: Editable fields — two-row grid for breathing room */}
                    <div className="px-4 pb-4 space-y-3">
                      {/* Quantities row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Received Qty</Label>
                          <Input
                            type="number"
                            className="h-9 font-mono text-xs font-black border-primary/10 bg-muted/20 focus:bg-background transition-all"
                            placeholder="0"
                            value={item.receivedQty || ''}
                            onChange={(e) => updateItem(index, 'receivedQty', Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Free Qty</Label>
                          <Input
                            type="number"
                            className="h-9 font-mono text-xs border-primary/5 bg-muted/20 focus:bg-background transition-all"
                            placeholder="0"
                            value={item.freeQty || ''}
                            onChange={(e) => updateItem(index, 'freeQty', Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Purchase Rate</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/30">₹</span>
                            <Input
                              type="number"
                              className="h-9 font-mono text-xs font-bold pl-5 border-primary/5 bg-muted/20 focus:bg-background transition-all"
                              placeholder="0.00"
                              value={item.purchaseRate || ''}
                              onChange={(e) => updateItem(index, 'purchaseRate', Number(e.target.value))}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">MRP</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/30">₹</span>
                            <Input
                              type="number"
                              className="h-9 font-mono text-xs font-bold pl-5 border-primary/5 bg-muted/20 focus:bg-background transition-all"
                              placeholder="0.00"
                              value={item.mrp || ''}
                              onChange={(e) => updateItem(index, 'mrp', Number(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>
                      {/* Batch & dates row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Batch Number</Label>
                          <Input
                            className="h-9 font-mono text-xs font-bold tracking-tight border-primary/5 bg-muted/20 focus:bg-background transition-all"
                            placeholder="B-00000"
                            value={item.batchNumber}
                            onChange={(e) => updateItem(index, 'batchNumber', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Expiry Date</Label>
                          <DatePicker
                            className={cn(
                              "h-9 text-xs font-bold border-primary/5 bg-muted/20 focus:bg-background transition-all",
                              item.expiryDate && "text-primary"
                            )}
                            value={item.expiryDate}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(v) => updateItem(index, 'expiryDate', v)}
                          />
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
            </div>
          </ScrollArea>
        </>
        )}
        </div>

        {/* ─── RIGHT: Context Panel (30%) ──────────────────────── */}
        <div className="hidden lg:flex lg:w-[30%] flex-col overflow-hidden bg-muted/5 dark:bg-muted/2">
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5 space-y-5">
              {/* ── Supplier Invoice ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
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
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Invoice Number{!replacementReturnId && <span className="text-rose-500"> *</span>}
                    </Label>
                    <Input
                      className="h-8 font-mono text-xs"
                      placeholder="e.g. INV-2025-001"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice Date{!replacementReturnId && <span className="text-rose-500"> *</span>}
                      </Label>
                      <DatePicker
                        className="h-8 text-xs"
                        value={invoiceDate}
                        onChange={setInvoiceDate}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice Amount{!replacementReturnId && <span className="text-rose-500"> *</span>}
                      </Label>
                      <Input
                        type="number"
                        className="h-8 font-mono text-xs"
                        placeholder="0.00"
                        value={invoiceAmount || ''}
                        onChange={(e) => setInvoiceAmount(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Payment at receipt ── (create-only, not for replacements) */}
              {!editMode && !replacementReturnId && (
                <>
                  <Separator className="bg-border/50" />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                        <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Payment
                      </p>
                    </div>
                    <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 mb-2.5">
                      {([['CREDIT', 'Credit'], ['PARTIAL', 'Partial'], ['PAID', 'Paid in full']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setPayChoice(val)}
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
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Amount Paid{payChoice === 'PARTIAL' && <span className="text-rose-500"> *</span>}
                            </Label>
                            <Input
                              type="number"
                              className="h-8 font-mono text-xs"
                              placeholder="0.00"
                              value={payChoice === 'PAID' ? (invoiceAmount || '') : (paidAmount || '')}
                              disabled={payChoice === 'PAID'}
                              max={invoiceAmount || undefined}
                              onChange={(e) => setPaidAmount(Number(e.target.value))}
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
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Balance to outstanding</span>
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            {formatCurrency(Math.max(0, (Number(invoiceAmount) || 0) - effectivePaid))}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator className="bg-border/50" />

              {/* ── Live Summary ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                    <Layers className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Live Summary
                  </p>
                </div>

                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <div className="rounded-lg border border-border/40 bg-background p-2.5 text-center">
                    <p className="font-mono text-lg font-bold">{totalItems}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-background p-2.5 text-center">
                    <p className="font-mono text-lg font-bold">{totalQty}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Total Qty</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-background p-2.5 text-center">
                    <p className={cn('font-mono text-lg font-bold', shortSupplyCount > 0 && 'text-amber-600 dark:text-amber-400')}>
                      {shortSupplyCount}
                    </p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Short</p>
                  </div>
                </div>

                {/* GST breakdown */}
                <div className="space-y-2 rounded-lg border border-border/40 bg-background p-3">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Taxable Amount</span>
                    <span className="font-mono font-medium">{formatCurrency(gstBreakdown.taxable)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">CGST (6%)</span>
                    <span className="font-mono font-medium">{formatCurrency(gstBreakdown.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">SGST (6%)</span>
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

              {/* ── Invoice Comparison ── */}
              {invoiceAmount > 0 && (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md',
                        Math.abs(invoiceAmount - gstBreakdown.total) < 1
                          ? 'bg-emerald-500/10'
                          : 'bg-amber-500/10'
                      )}>
                        {Math.abs(invoiceAmount - gstBreakdown.total) < 1 ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice Verification
                      </p>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/40 bg-background p-3">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Supplier Invoice</span>
                        <span className="font-mono font-medium">{formatCurrency(invoiceAmount)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">System Calculated</span>
                        <span className="font-mono font-medium">{formatCurrency(gstBreakdown.total)}</span>
                      </div>
                      <Separator className="bg-border/40" />
                      <div className={cn(
                        'flex justify-between text-xs font-semibold',
                        Math.abs(invoiceAmount - gstBreakdown.total) < 1
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      )}>
                        <span>Difference</span>
                        <span className="font-mono">
                          {Math.abs(invoiceAmount - gstBreakdown.total) < 1
                            ? 'Match'
                            : `${formatCurrency(Math.abs(invoiceAmount - gstBreakdown.total))} ${
                                invoiceAmount > gstBreakdown.total ? '(Over)' : '(Under)'
                              }`
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  <Separator className="bg-border/50" />
                </>
              )}

              {/* ── Quick Actions ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
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
            </div>
          </ScrollArea>

          {/* ── Pinned Action Footer ── (context-aware: review vs edit mode) ── */}
          <div className="shrink-0 border-t border-border/40 bg-background p-4 space-y-2">
            <Button
              className="w-full"
              disabled={!canConfirm || (showConfirm && isSubmitting)}
              onClick={showConfirm ? handleConfirm : () => setShowConfirm(true)}
            >
              {showConfirm && isSubmitting ? (
                <div className="mr-1.5 h-4 w-4 rounded-full border-b-2 border-white animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              {showConfirm
                ? (isSubmitting ? 'Saving…' : editMode ? 'Confirm & Update PE' : 'Confirm & Create PE')
                : editMode ? 'Review & Update PE' : 'Review & Confirm PE'}
            </Button>
            {showConfirm ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={isSubmitting}
                onClick={() => setShowConfirm(false)}
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Back to Edit
              </Button>
            ) : editMode ? (
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
                    toast.info('PO marked as Partially Received. You can raise another PE against this PO when the remaining items arrive.', { duration: 6000 })
                    navigate('/purchase/grn-list')
                  }}
                  className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40 hover:border-primary/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 mt-0.5">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Expect Supplementary Delivery</p>
                    <p className="text-[11px] text-muted-foreground">Supplier will deliver the remaining qty later. PO stays open — raise another PE when goods arrive.</p>
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
