import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { mockPurchaseOrders, mockProducts } from '@/data/mock'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import type { GRNItem } from '@/types'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GRNFormItem extends GRNItem {
  shortSupply: boolean
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
  }
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function GRNPage() {
  // Source selection
  const [sourceType, setSourceType] = useState<'po' | 'direct'>('po')
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null)
  const [poSearchOpen, setPoSearchOpen] = useState(false)
  const [poSearch, setPoSearch] = useState('')

  // Items
  const [grnItems, setGrnItems] = useState<GRNFormItem[]>([])
  const [productSearch, setProductSearch] = useState('')

  // Supplier invoice
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0)

  // Confirm overlay
  const [showConfirm, setShowConfirm] = useState(false)

  // Auto-generated GRN number
  const grnNumber = useMemo(
    () => `HS/GRN/2025-26/${String(Math.floor(Math.random() * 900 + 100)).padStart(5, '0')}`,
    []
  )

  // ── Selectable POs ──
  const selectablePOs = useMemo(() => {
    return mockPurchaseOrders.filter(
      (po) =>
        po.status === 'SENT' ||
        po.status === 'ACKNOWLEDGED' ||
        po.status === 'PARTIALLY_RECEIVED'
    )
  }, [])

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
    return mockPurchaseOrders.find((po) => po.id === selectedPOId)
  }, [selectedPOId])

  // ── Product search for direct entry ──
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return []
    const existingIds = new Set(grnItems.map((i) => i.productId))
    return mockProducts
      .filter(
        (p) =>
          !existingIds.has(p.id) &&
          (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            p.genericName.toLowerCase().includes(productSearch.toLowerCase()))
      )
      .slice(0, 6)
  }, [productSearch, grnItems])

  // ── Select PO ──
  function handleSelectPO(poId: string) {
    const po = mockPurchaseOrders.find((p) => p.id === poId)
    if (!po) return
    setSelectedPOId(poId)
    setPoSearchOpen(false)
    setPoSearch('')
    setGrnItems(
      po.items.map((item, i) => ({
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
        mrp: mockProducts.find((p) => p.id === item.productId)?.mrp || 0,
        damageQty: 0,
        shortSupply: false,
      }))
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
  }

  // ── Item operations ──
  function updateItem(index: number, field: keyof GRNFormItem, value: string | number) {
    setGrnItems((prev) => {
      const updated = [...prev]
      ;(updated[index] as unknown as Record<string, unknown>)[field] = value
      if (field === 'receivedQty') {
        updated[index].shortSupply =
          updated[index].orderedQty > 0 && (value as number) < updated[index].orderedQty
      }
      return updated
    })
  }

  function addDirectItem(product: (typeof mockProducts)[0]) {
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
  const receivedItems = grnItems.filter((i) => i.receivedQty > 0)
  const totalItems = receivedItems.length
  const totalQty = receivedItems.reduce((s, i) => s + i.receivedQty + (i.freeQty || 0), 0)
  const totalValue = receivedItems.reduce((s, i) => s + i.receivedQty * i.purchaseRate, 0)
  const shortSupplyCount = grnItems.filter((i) => i.shortSupply).length
  const gstBreakdown = {
    taxable: totalValue,
    cgst: totalValue * 0.06,
    sgst: totalValue * 0.06,
    total: totalValue * 1.12,
  }

  const canConfirm = receivedItems.length > 0

  function handleConfirm() {
    toast.success('Goods Receipt Note created successfully!', {
      description: `GRN ${grnNumber} — Stock has been updated for ${totalItems} items.`,
    })
    setShowConfirm(false)
    setSourceType('po')
    setSelectedPOId(null)
    setGrnItems([])
    setInvoiceNo('')
    setInvoiceDate('')
    setInvoiceAmount(0)
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
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-background px-6 py-2.5">
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
                                      <p className="text-[11px] text-muted-foreground">{po.supplierName} &middot; {po.items.length} items</p>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-bold">{selectedPO.poNumber}</p>
                        <Badge variant={statusBadgeConfig[selectedPO.status]?.variant || 'secondary'} size="sm" dot>
                          {statusBadgeConfig[selectedPO.status]?.label || selectedPO.status}
                        </Badge>
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
              )}
            </div>
          )}

          {/* Direct entry: product search */}
          {sourceType === 'direct' && (
            <div className="shrink-0 border-b border-border/40 bg-muted/10 px-5 py-3 dark:bg-muted/5">
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
                          <p className="text-[11px] text-muted-foreground font-mono">{item.productId}</p>
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
                          <Badge variant="outline" size="sm" className="font-mono">
                            Ord: {item.orderedQty}
                          </Badge>
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
                      <div className="grid grid-cols-4 gap-4">
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
                      <div className="grid grid-cols-4 gap-4">
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
        <div className="hidden lg:flex lg:w-[30%] flex-col overflow-hidden bg-muted/5 dark:bg-muted/[0.02]">
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
                  <div className="grid grid-cols-2 gap-2">
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
                <div className="grid grid-cols-3 gap-2 mb-4">
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
                  <Button variant="outline" size="sm" className="flex-1" disabled={!canConfirm}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Print GRN
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" disabled={!canConfirm}>
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
                <div className="grid grid-cols-3 gap-3 text-center">
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
                <Button className="flex-1" onClick={handleConfirm}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Confirm & Create GRN
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
