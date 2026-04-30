import { useState, useMemo, useEffect, useCallback } from 'react'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
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
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import type { GRNItem } from '@/types'
import { printGrnPdf, downloadGrnPdf, type GrnPdfData } from '@/lib/pdf/grnPdf'

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
    damageQty: 0,
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

  // Source selection
  const [sourceType, setSourceType] = useState<'po' | 'direct'>('po')
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null)
  const [poSearchOpen, setPoSearchOpen] = useState(false)
  const [poSearch, setPoSearch] = useState('')

  // Direct Entry supplier
  const [directSupplierId, setDirectSupplierId] = useState(prefilledSupplierId)
  const [directSupplierName, setDirectSupplierName] = useState(prefilledSupplierName)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false)

  // Items
  const [grnItems, setGrnItems] = useState<GRNFormItem[]>([])
  const [productSearch, setProductSearch] = useState('')

  // Supplier invoice
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0)

  // Confirm overlay
  const [showConfirm, setShowConfirm] = useState(false)

  // Post-confirm short supply action dialog
  const [shortActionDialog, setShortActionDialog] = useState<{
    savedGrnId: string
    shortItems: Array<{ productId: string; productName: string; orderedQty: number; receivedQty: number; rate: number; batchNumber: string; expiryDate: string; gstPercent: number; supplierId: string; supplierName: string }>
    supplierId: string
    supplierName: string
  } | null>(null)

  const { purchaseOrders, products, suppliers, fetchMasterData } = useMasterDataStore()
  const [isSubmitting, setIsSubmitting] = useState(false)

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
          (freshPO.items ?? [])
            .map((item: any, i: number) => {
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
                damageQty: 0,
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
  }, [prefilledPoId])
  useBranchRefresh(fetchData)

  // Auto-generated GRN number
  const grnNumber = useMemo(
    () => `HS/GRN/2025-26/${String(Math.floor(Math.random() * 900 + 100)).padStart(5, '0')}`,
    []
  )

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

  // ── Product search for direct entry ──
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return []
    const existingIds = new Set(grnItems.map((i) => i.productId))
    return products
      .filter(
        (p) =>
          !existingIds.has(p.id) &&
          (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            (p.genericName ?? '').toLowerCase().includes(productSearch.toLowerCase()))
      )
      .slice(0, 6)
  }, [productSearch, grnItems, products])

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
          const alreadyReceived = Number((item as any).receivedQty ?? 0)
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
            damageQty: 0,
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
        damageQty: 0,
        shortSupply: false,
      },
    ])
    setProductSearch('')
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
        items: receivedItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          // For supplementary GRNs, "ordered" is the remaining qty at this delivery — not the original PO total
          orderedQty: Number((i._alreadyReceived ?? 0) > 0 ? (i._remaining ?? i.orderedQty) : (i.orderedQty || i.receivedQty)),
          receivedQty: Number(i.receivedQty),
          freeQty: Number(i.freeQty || 0),
          batchNumber: i.batchNumber,
          mfgDate: new Date(i.mfgDate).toISOString(),
          expiryDate: new Date(i.expiryDate).toISOString(),
          purchaseRate: Number(i.purchaseRate),
          mrp: Number(i.mrp),
          damageQty: Number(i.damageQty || 0),
        })),
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
            description: `GRN ${grnNumber} linked to purchase return. Stock updated.`,
          })
        } catch {
          toast.success('GRN created. Note: could not auto-settle the debit note — please update it manually.', {
            duration: 6000,
          })
        }
      } else {
        toast.success('Goods Receipt Note created successfully!', {
          description: `GRN ${grnNumber} — Stock has been updated for ${totalItems} items.`,
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
      await fetchMasterData()
    } catch (err: any) {
      const msg = err.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : (msg || 'Failed to save GRN. Please try again.'));
    } finally {
      setIsSubmitting(false)
    }
  }

  function buildGrnPdfData(): GrnPdfData {
    return {
      grnNumber,
      date: new Date(),
      supplierName: selectedPO?.supplierName ?? directSupplierName,
      supplierInvoiceNo: invoiceNo || undefined,
      supplierInvoiceDate: invoiceDate || undefined,
      totalAmount: gstBreakdown.total,
      items: receivedItems.map((i) => ({
        productName: i.productName,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
        orderedQty: i.orderedQty || i.receivedQty,
        receivedQty: i.receivedQty,
        freeQty: i.freeQty || 0,
        damageQty: i.damageQty || 0,
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
  }

  return (
    <div className="-m-3 md:-m-4 lg:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ══════════════════════════════════════════════════════════ */}
      {/* FIXED HEADER                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-background px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/purchase/orders')}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Goods Receipt</h1>
            <p className="text-[11px] text-muted-foreground">Receive and verify incoming goods</p>
          </div>
        </div>

        {/* Replacement return context banner */}
        {replacementReturnId && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 dark:border-emerald-800/40 dark:bg-emerald-950/20">
            <RotateCcw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              Receiving replacement goods — this GRN will be auto-linked to the debit note and marked Settled.
            </span>
          </div>
        )}

        {/* Source toggle — segmented control */}
        <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <button
            onClick={() => handleSourceChange('po')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
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
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
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
        {/* ─── LEFT: Item Workspace (70%) ──────────────────────── */}
        <div className="flex w-full flex-col overflow-hidden border-r border-border/40 lg:w-[70%]">
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
                                        {po.supplierName} &middot; {po.items?.length ?? 0} items
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
                          {selectedPO.supplierName} &middot; {formatDate(selectedPO.date)} &middot; {selectedPO.items.length} items
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedPOId(null); setGrnItems([]) }}
                    >
                      Change PO
                    </Button>
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

          {/* Direct entry: product search */}
          {sourceType === 'direct' && (
            <div className="shrink-0 border-b border-border/40 bg-muted/10 px-5 py-3 space-y-3 dark:bg-muted/5">
              {/* Supplier selector */}
              <div className="relative">
                {directSupplierId ? (
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{directSupplierName}</p>
                      <p className="text-[10px] text-muted-foreground">Selected supplier</p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setDirectSupplierId(''); setDirectSupplierName(''); setSupplierSearch('') }}
                    >
                      ✕ Change
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      icon={<Search />}
                      placeholder="Search and select supplier..."
                      value={supplierSearch}
                      onChange={(e) => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true) }}
                      onFocus={() => setSupplierDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 200)}
                    />
                    {supplierDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg">
                        {suppliers
                          .filter(s => !supplierSearch.trim() || s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                          .slice(0, 20)
                          .map(s => (
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
                          ))
                        }
                        {suppliers.filter(s => !supplierSearch.trim() || s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                          <p className="px-4 py-3 text-sm text-muted-foreground">No suppliers found</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Product search */}
              <div className="relative">
                <Input
                  icon={<Search />}
                  placeholder="Search products to add..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  autoFocus
                />
                {productSearch && filteredProducts.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-lg"
                  >
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-accent/50 border-b border-border/20 last:border-b-0"
                        onClick={() => addDirectItem(p)}
                      >
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.genericName}</p>
                        </div>
                        <span className="font-mono text-sm text-muted-foreground">{formatCurrency(p.purchaseRate)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
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
                        {sourceType === 'direct' && (
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Mfg Date</Label>
                          <Input
                            type="date"
                            className="h-9 text-xs font-medium border-primary/5 bg-muted/20 focus:bg-background transition-all"
                            value={item.mfgDate}
                            onChange={(e) => updateItem(index, 'mfgDate', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Expiry Date</Label>
                          <Input
                            type="date"
                            className={cn(
                              "h-9 text-xs font-bold border-primary/5 bg-muted/20 focus:bg-background transition-all",
                              item.expiryDate && "text-primary"
                            )}
                            value={item.expiryDate}
                            onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Damage/Rej.</Label>
                          <Input
                            type="number"
                            className="h-9 font-mono text-xs text-rose-600 border-rose-100 bg-rose-50/20 focus:bg-background dark:border-rose-900/40 dark:bg-rose-900/5 transition-all"
                            placeholder="0"
                            value={item.damageQty || ''}
                            onChange={(e) => updateItem(index, 'damageQty', Number(e.target.value))}
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
                    <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Number</Label>
                    <Input
                      className="h-8 font-mono text-xs"
                      placeholder="e.g. INV-2025-001"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Date</Label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Amount</Label>
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
                    Print GRN
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" disabled={!canConfirm} onClick={handleDownloadGrn}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* ── Pinned Action Footer ── */}
          <div className="shrink-0 border-t border-border/40 bg-background p-4 space-y-2">
            <Button
              className="w-full"
              disabled={!canConfirm}
              onClick={() => setShowConfirm(true)}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Review & Confirm GRN
            </Button>
            {grnItems.length > 0 && (
              <Button variant="outline" className="w-full text-muted-foreground" onClick={handleDiscard}>
                Discard & Start Over
              </Button>
            )}
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
                {/* Raise Debit Note */}
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      shortageGrnId: shortActionDialog.savedGrnId,
                      supplierId: shortActionDialog.supplierId,
                      supplierName: shortActionDialog.supplierName,
                      shortItems: JSON.stringify(shortActionDialog.shortItems),
                    })
                    setShortActionDialog(null)
                    navigate(`/purchase/returns?${params.toString()}`)
                  }}
                  className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40 hover:border-primary/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 mt-0.5">
                    <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Raise Debit Note</p>
                    <p className="text-[11px] text-muted-foreground">Supplier won't send the rest. Recover the amount via a debit note for the shortage.</p>
                  </div>
                </button>

                {/* Expect More */}
                <button
                  onClick={() => {
                    setShortActionDialog(null)
                    toast.info('PO marked as Partially Received. You can raise another GRN against this PO when the remaining items arrive.', { duration: 6000 })
                    navigate('/purchase/grn-list')
                  }}
                  className="w-full flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-colors hover:bg-accent/40 hover:border-primary/30"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 mt-0.5">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Expect Supplementary Delivery</p>
                    <p className="text-[11px] text-muted-foreground">Supplier will deliver the remaining qty later. PO stays open — raise another GRN when goods arrive.</p>
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CONFIRMATION OVERLAY                                      */}
      {/* ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-lg rounded-2xl border border-border/60 bg-background p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-5">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Package className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-lg font-bold">Confirm Goods Receipt</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will update stock quantities for all received items
                </p>
              </div>

              {/* Summary */}
              <div className="rounded-xl bg-muted/30 p-4 space-y-3 mb-5 dark:bg-muted/15">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="font-mono text-xl font-bold">{totalItems}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
                  </div>
                  <div>
                    <p className="font-mono text-xl font-bold">{totalQty}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Total Qty</p>
                  </div>
                  <div>
                    <p className="font-mono text-xl font-bold text-primary">{formatCurrency(gstBreakdown.total)}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Value</p>
                  </div>
                </div>

                {shortSupplyCount > 0 && (
                  <>
                    <Separator className="bg-border/40" />
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-xs font-medium">{shortSupplyCount} item(s) have short supply</p>
                    </div>
                  </>
                )}

                {selectedPO && (
                  <>
                    <Separator className="bg-border/40" />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">PO Reference</span>
                      <span className="font-mono font-medium">{selectedPO.poNumber}</span>
                    </div>
                  </>
                )}

                {invoiceNo && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Supplier Invoice</span>
                    <span className="font-mono font-medium">{invoiceNo}</span>
                  </div>
                )}
              </div>

              {/* Received items compact list */}
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border/40 mb-5">
                {receivedItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b border-border/20 px-3 py-2 text-xs last:border-b-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{item.productName}</span>
                      {item.batchNumber && (
                        <Badge variant="secondary" size="sm" className="font-mono shrink-0">{item.batchNumber}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground">x{item.receivedQty}</span>
                      <span className="font-mono font-semibold">{formatCurrency(item.receivedQty * item.purchaseRate)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>
                  Go Back
                </Button>
                <Button className="flex-1" onClick={handleConfirm} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <div className="mr-1.5 h-4 w-4 rounded-full border-b-2 border-white animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  )}
                  {isSubmitting ? 'Saving...' : 'Confirm & Create GRN'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
