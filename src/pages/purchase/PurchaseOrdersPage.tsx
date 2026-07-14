import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Send,
  PackageCheck,
  Zap,
  Trash2,
  FileText,
  ClipboardList,
  Download,
  Printer,
  X,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  CheckCircle2,
  Clock,
  Package,
  Filter,
  BarChart3,
} from 'lucide-react'
import { useForm, useFieldArray, useWatch, Controller, type Control, type UseFormRegister, type FieldErrors } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { SupplierSearchSelect } from '@/components/shared/SupplierSearchSelect'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency, formatDate, weekStartISO } from '@/lib/utils'
import { resolveListView } from '@/lib/listView'
import { navigate, useRoute } from '@/lib/router'
import { downloadPoPdf, printPoPdf } from '@/lib/pdf/poPdf'
import { ExportMenu } from '@/components/shared/ExportMenu'
import type { PurchaseOrder, Product } from '@/types'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { PurchaseOrderSplitView } from './components/PurchaseOrderSplitView'

// ─────────────────────────────────────────────────────────────
// Create PO Schema
// ─────────────────────────────────────────────────────────────

const poItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  productName: z.string(),
  requiredQty: z.coerce.number().min(1, 'Qty must be at least 1'),
  lastPurchaseRate: z.coerce.number().min(0),
  expectedRate: z.coerce.number().min(0, 'Rate required'),
  remarks: z.string().optional(),
})

const createPOSchema = z.object({
  supplierId: z.string().min(1, 'Select a supplier'),
  expectedDelivery: z.string().min(1, 'Expected delivery date required'),
  items: z.array(poItemSchema).min(1, 'Add at least one item'),
})

type CreatePOForm = z.input<typeof createPOSchema>

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACKNOWLEDGED', label: 'Confirmed' },
  { value: 'PARTIALLY_RECEIVED', label: 'Partial' },
  { value: 'FULLY_RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

type POTabKey = 'all' | 'pending' | 'partial' | 'received' | 'cancelled'

const PO_TABS: Array<{ key: POTabKey; label: string; activeColor: string; badgeColor: string }> = [
  { key: 'all',       label: 'All',       activeColor: 'border-primary text-primary',                                         badgeColor: 'bg-primary/10 text-primary' },
  { key: 'pending',   label: 'Pending',   activeColor: 'border-amber-500 text-amber-600 dark:text-amber-400',                 badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'partial',   label: 'Partial',   activeColor: 'border-sky-500 text-sky-600 dark:text-sky-400',                      badgeColor: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  { key: 'received',  label: 'Received',  activeColor: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',          badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'cancelled', label: 'Cancelled', activeColor: 'border-rose-500 text-rose-600 dark:text-rose-400',                   badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
]

function POStatusTabs({ tab, onChange, counts }: {
  tab: POTabKey
  onChange: (t: POTabKey) => void
  counts: Record<POTabKey, number>
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/40 p-1 shadow-sm shadow-black/[0.02]">
      {PO_TABS.map((t) => {
        const active = tab === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150',
              active
                ? cn('bg-background shadow-sm', t.activeColor)
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors',
                active ? t.badgeColor : 'bg-foreground/[0.06] text-muted-foreground',
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const statusBadgeConfig: Record<
  string,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'purple' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SENT: { label: 'Sent', variant: 'info' },
  ACKNOWLEDGED: { label: 'Confirmed', variant: 'success' },
  PARTIALLY_RECEIVED: { label: 'Partial', variant: 'warning' },
  FULLY_RECEIVED: { label: 'Received', variant: 'success' },
  CLOSED: { label: 'Closed', variant: 'purple' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
}

// ─────────────────────────────────────────────────────────────
// ROW COMPONENT (Isolating state per row)
// ─────────────────────────────────────────────────────────────

interface POItemRowProps {
  index: number
  register: UseFormRegister<CreatePOForm>
  onSelectProduct: (index: number, product: Product | null) => void
  control: Control<CreatePOForm>
  remove: (index: number) => void
  errors: FieldErrors<CreatePOForm>
  products: Product[]
  isRemovable: boolean
  layout?: 'row' | 'card'
}

function POItemRow({ index, register, onSelectProduct, control, remove, errors, products, isRemovable, layout = 'row' }: POItemRowProps) {
  // Local row state for search UI
  const [productSearch, setProductSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  // Use localized watch for better reactivity in field arrays
  const watchedItem = useWatch({
    control,
    name: `items.${index}`,
  })

  const filteredProducts = useMemo(() => {
    // Empty search → list every product (the dropdown scrolls). Typing filters
    // by name / generic name.
    if (!productSearch) return products
    const q = productSearch.toLowerCase()
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.genericName ?? '').toLowerCase().includes(q)
    )
  }, [productSearch, products])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setShowDropdown(true)
      setSelectedIndex(prev => Math.min(prev + 1, filteredProducts.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      if (showDropdown && filteredProducts[selectedIndex]) {
        e.preventDefault()
        onSelectProduct(index, filteredProducts[selectedIndex])
        setProductSearch('')
        setShowDropdown(false)
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const updateDropdownPos = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      })
    }
  }

  // Keep the portaled dropdown glued to the input. We recompute once on the
  // frame AFTER it opens (so the drawer's slide-in animation has settled and the
  // input's rect is final — measuring too early left the dropdown misplaced),
  // and again whenever anything scrolls (capture: true catches the drawer's own
  // scroll container, not just the window) or the window resizes.
  useEffect(() => {
    if (!showDropdown) return
    const raf = requestAnimationFrame(updateDropdownPos)
    const reposition = () => updateDropdownPos()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown])

  // Shared field elements — defined ONCE, reused across the table-row and
  // mobile-card layouts (rendering both at once would double-register the same
  // react-hook-form field names and corrupt values).
  const productField = watchedItem?.productId ? (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium">{watchedItem.productName}</span>
      <button
        type="button"
        className="w-fit text-[10px] text-primary hover:underline font-semibold"
        onClick={() => {
          onSelectProduct(index, null) // Clear selection
        }}
      >
        Change Product
      </button>
    </div>
  ) : (
    <div className="relative">
      <Input
        ref={inputRef}
        icon={<Search className="h-3.5 w-3.5" />}
        placeholder="Search product..."
        value={productSearch}
        onChange={(e) => {
          setProductSearch(e.target.value)
          setShowDropdown(true)
          setSelectedIndex(0)
          updateDropdownPos()
        }}
        onFocus={() => {
          updateDropdownPos()
          setShowDropdown(true)
        }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 300)}
        onKeyDown={handleKeyDown}
        className="h-8"
        error={!!errors.items?.[index]?.productId}
      />
      {showDropdown && filteredProducts.length > 0 && createPortal(
        <div
          style={{
            position: 'fixed',
            top: dropdownPos.top + 4,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 10000,
            // The PO form is a modal Radix Sheet, which sets
            // `pointer-events: none` on <body>. This dropdown is portaled
            // to <body> (outside the Sheet), so without re-enabling pointer
            // events here it renders but swallows every click — the product
            // couldn't be selected.
            pointerEvents: 'auto',
          }}
          className="max-h-[40vh] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-popover p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
          onMouseDown={(e) => e.stopPropagation()}
          // The drawer is a modal Radix Sheet whose scroll-lock
          // (react-remove-scroll) blocks wheel scrolling on anything
          // portaled to <body>. Apply the scroll ourselves and stop the
          // event before it reaches the lock, so the list scrolls.
          onWheel={(e) => {
            e.currentTarget.scrollTop += e.deltaY
            e.stopPropagation()
          }}
        >
          <div className="sticky top-0 z-10 px-2 py-1.5 border-b border-border/40 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 bg-muted/30 mb-1 rounded-t-lg">
            Select Product
          </div>
          {filteredProducts.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "w-full rounded-lg px-2 py-2 text-left text-sm transition-all border border-transparent",
                i === selectedIndex ? "bg-primary/10 border-primary/20 text-primary shadow-sm" : "hover:bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault() // Prevent blur
                onSelectProduct(index, p)
                setProductSearch('')
                setShowDropdown(false)
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-bold line-clamp-1">{p.name}</span>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground line-clamp-1">
                  <span className="opacity-70">{p.manufacturer}</span>
                  <span className="opacity-20">|</span>
                  <span className="opacity-70">{p.genericName}</span>
                  <span className="opacity-20">|</span>
                  <span className="font-mono">{formatCurrency(p.purchaseRate || 0)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )

  const lastRateDisplay = (
    <span className="font-mono text-sm text-muted-foreground">
      {formatCurrency(Number(watchedItem?.lastPurchaseRate) || 0)}
    </span>
  )

  const actionButtons = (
    <div className="flex items-center gap-1">
      {watchedItem?.productId && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onSelectProduct(index, null)}
          title="Clear product"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => remove(index)}
        disabled={!isRemovable}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  )

  // responsive: cards on phones
  if (layout === 'card') {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-3 space-y-3">
        {/* product search / selected */}
        <div className="relative">{productField}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Req. Qty</label>
            <Input
              type="number"
              className="h-8 w-full font-mono"
              error={!!errors.items?.[index]?.requiredQty}
              {...register(`items.${index}.requiredQty`, { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Rate</label>
            <Input
              type="number"
              className="h-8 w-full font-mono"
              error={!!errors.items?.[index]?.expectedRate}
              {...register(`items.${index}.expectedRate`, { valueAsNumber: true })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Last rate: <span className="font-mono text-foreground">{formatCurrency(Number(watchedItem?.lastPurchaseRate) || 0)}</span></span>
          {actionButtons}
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks</label>
          <Input className="h-8 w-full" placeholder="Optional" {...register(`items.${index}.remarks`)} />
        </div>
      </div>
    )
  }

  return (
    <TableRow className="border-border/40">
      <TableCell className="relative">
        {productField}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-20 font-mono"
          error={!!errors.items?.[index]?.requiredQty}
          {...register(`items.${index}.requiredQty`, { valueAsNumber: true })}
        />
      </TableCell>
      <TableCell>
        {lastRateDisplay}
      </TableCell>
      <TableCell>
        <Input
          type="number"
          className="h-8 w-24 font-mono"
          error={!!errors.items?.[index]?.expectedRate}
          {...register(`items.${index}.expectedRate`, { valueAsNumber: true })}
        />
      </TableCell>
      <TableCell>
        <Input className="h-8" placeholder="Optional" {...register(`items.${index}.remarks`)} />
      </TableCell>
      <TableCell>
        {actionButtons}
      </TableCell>
    </TableRow>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

const PO_COLUMNS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'supplier', label: 'Supplier', defaultVisible: true },
  { id: 'po', label: 'PO #', required: true, defaultVisible: true },
  { id: 'items', label: 'Items', defaultVisible: true },
  { id: 'total', label: 'Total', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'expected', label: 'Expected Delivery', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'total', label: 'Total', defaultVisible: true },
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'poNumber', label: 'PO Number', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'items', label: 'Items Count', defaultVisible: true },
]

export default function PurchaseOrdersPage() {
  const cols = useColumnVisibility('purchase.orders', PO_COLUMNS)
  const cardCols = useColumnVisibility('purchase.orders.card', CARD_FIELDS)
  const isMobile = useIsMobile()
  const { suppliers, products, fetchMasterData } = useMasterDataStore()
  const { search } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(search), [search])

  // Split is default; ?view=table → table view
  const effectiveView = resolveListView(urlParams.get('view'))
  const selectedPoId = urlParams.get('poId')

  const selectPo = useCallback((id: string | null) => {
    if (window.location.pathname !== '/purchase/orders') return
    const params = new URLSearchParams()
    if (id) params.set('poId', id)
    navigate(`/purchase/orders${params.toString() ? `?${params.toString()}` : ''}`)
  }, [])

  const exitSplitView = useCallback(() => {
    navigate('/purchase/orders?view=table')
  }, [])

  // Real data
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchPOs = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/purchase-orders')
      setPurchaseOrders(Array.isArray(res.data) ? res.data : (res.data.data ?? []))
    } catch {
      toast.error('Failed to load purchase orders')
    } finally {
      setIsLoading(false)
    }
  }, [])


  useEffect(() => {
    fetchMasterData()
    fetchPOs()
    // Mount-only initial fetch; subsequent refreshes go through useBranchRefresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useBranchRefresh(fetchPOs)

  // Filters (usePageFilter for persistence)
  const [searchQuery, setSearchQuery] = usePageFilter<string>('purchase.orders', 'search', '')
  const [period, setPeriod] = usePageFilter<string>('purchase.orders', 'period', 'today')
  const [dateFrom, setDateFrom] = usePageFilter<string>('purchase.orders', 'dateFrom', '')
  const [dateTo, setDateTo] = usePageFilter<string>('purchase.orders', 'dateTo', '')
  const [selectedSupplier, setSelectedSupplier] = usePageFilter<string>('purchase.orders', 'supplier', 'all')
  const [selectedSupplierName, setSelectedSupplierName] = usePageFilter<string>('purchase.orders', 'supplierName', '')
  const [selectedStatus, setSelectedStatus] = usePageFilter<string>('purchase.orders', 'status', 'all')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('purchase.orders', 'splitShowStats', true)
  const [statusTab, setStatusTab] = usePageFilter<POTabKey>('purchase.orders', 'statusTab', 'all')

  const [cardFilter, setCardFilter] = usePageFilter<'all' | 'received' | 'pending' | 'partial'>('purchase.orders', 'cardFilter', 'all')
  // Split-view filter panel visibility — not persisted (intentional)
  const [splitShowFilters, setSplitShowFilters] = useState(false)
  // Controls the table-view DataTableFilterBar collapsible panel so it can be
  // auto-opened when "Custom Range" is picked (the From/To pickers live inside).
  const [tableFiltersOpen, setTableFiltersOpen] = useState(false)

  // Picking "Custom Range" auto-opens the table filters panel (From/To pickers
  // live inside); leaving 'custom' auto-closes it again. Both the table and
  // split filter panels host the date pickers, so toggle both.
  const onPeriodChange = useCallback((val: string) => {
    setPeriod(val)
    setCurrentPage(1)
    if (val === 'custom') { setTableFiltersOpen(true); setSplitShowFilters(true) }
    else if (period === 'custom') { setTableFiltersOpen(false); setSplitShowFilters(false) }
  }, [period, setPeriod])

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  useEffect(() => { loadFilterPrefs() }, [loadFilterPrefs])

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Create PO dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [detailPO, setDetailPO] = useState<(typeof purchaseOrders)[0] | null>(null)
  const [detailPOLoading, setDetailPOLoading] = useState(false)

  // Auto-open the Create PO dialog via `?add=1` (sidebar quick-add).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') === '1') {
      setCreateDialogOpen(true)
      params.delete('add')
      const qs = params.toString()
      window.history.replaceState(null, '', `/purchase/orders${qs ? `?${qs}` : ''}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openDetailPO(po: (typeof purchaseOrders)[0]) {
    setDetailPO(po) // show immediately with cached data
    setDetailPOLoading(true)
    try {
      const res = await api.get(`/purchase-orders/${po.id}`)
      setDetailPO(res.data)
    } catch {
      // keep cached data if fetch fails
    } finally {
      setDetailPOLoading(false)
    }
  }

  // Deep-link support: when in TABLE mode and arrived from a `?poId=<id>` URL
  // (e.g. from the Supplier Detail page), auto-open that PO's drawer.
  // In split mode, the URL param is handled by the split view directly.
  useEffect(() => {
    if (effectiveView !== 'table') return
    const params = new URLSearchParams(search)
    const target = params.get('poId')
    if (!target || purchaseOrders.length === 0) return
    if (detailPO?.id === target) return
    const match = purchaseOrders.find((p) => p.id === target)
    if (match) void openDetailPO(match)
    // openDetailPO + detailPO?.id intentionally omitted — we want to fire only
    // when the URL param or the loaded list changes, not on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, purchaseOrders, effectiveView])

  const clearFilters = () => {
    setPeriod('today')
    setCardFilter('all')
    setDateFrom('')
    setDateTo('')
    setSelectedSupplier('all')
    setSelectedSupplierName('')
    setSelectedStatus('all')
    setStatusTab('all')
  }

  // ── Filtering logic ──

  // POs within the selected period only — drives both the summary cards and
  // the list, so the cards always reflect the period independent of the
  // card-click / search / status narrowing applied to the table below.
  const periodPOs = useMemo(() => {
    let result = [...purchaseOrders]

    // Period
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((po) => po.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekStr = weekStartISO(now)
        result = result.filter((po) => po.date.slice(0, 10) >= weekStr)
        break
      }
      case 'month': {
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        result = result.filter((po) => po.date.slice(0, 10) >= monthStart)
        break
      }
      case 'custom':
        if (dateFrom) result = result.filter((po) => po.date.slice(0, 10) >= dateFrom)
        if (dateTo) result = result.filter((po) => po.date.slice(0, 10) <= dateTo)
        break
    }

    return result
  }, [purchaseOrders, period, dateFrom, dateTo])

  // POs after every filter EXCEPT the stat-card drill-down (period + search +
  // supplier + status). Drives the stat cards so they reflect the active
  // filters; the table layers the card drill-down on top of this.
  const statsBasePOs = useMemo(() => {
    let result = [...periodPOs]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (po) =>
          po.poNumber.toLowerCase().includes(q) ||
          po.supplierName.toLowerCase().includes(q)
      )
    }

    // Supplier
    if (selectedSupplier && selectedSupplier !== 'all') {
      result = result.filter((po) => po.supplierId === selectedSupplier)
    }

    // Status
    if (selectedStatus && selectedStatus !== 'all') {
      result = result.filter((po) => po.status === selectedStatus)
    }

    return result
  }, [periodPOs, searchQuery, selectedSupplier, selectedStatus])

  const preTabPOs = useMemo(() => {
    let result = statsBasePOs

    // Stat-card drill-down (layered on top of the other filters)
    if (cardFilter === 'received') {
      result = result.filter((po) => po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED')
    } else if (cardFilter === 'pending') {
      result = result.filter((po) => po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'ACKNOWLEDGED')
    } else if (cardFilter === 'partial') {
      result = result.filter((po) => po.status === 'PARTIALLY_RECEIVED')
    }

    return result
  }, [statsBasePOs, cardFilter])

  const tabCounts = useMemo(() => {
    const counts: Record<POTabKey, number> = { all: preTabPOs.length, pending: 0, partial: 0, received: 0, cancelled: 0 }
    for (const po of preTabPOs) {
      if (po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'ACKNOWLEDGED') counts.pending++
      else if (po.status === 'PARTIALLY_RECEIVED') counts.partial++
      else if (po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED') counts.received++
      else if (po.status === 'CANCELLED') counts.cancelled++
    }
    return counts
  }, [preTabPOs])

  const filteredPOs = useMemo(() => {
    if (statusTab === 'all') return preTabPOs
    if (statusTab === 'pending')   return preTabPOs.filter((po) => po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'ACKNOWLEDGED')
    if (statusTab === 'partial')   return preTabPOs.filter((po) => po.status === 'PARTIALLY_RECEIVED')
    if (statusTab === 'received')  return preTabPOs.filter((po) => po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED')
    if (statusTab === 'cancelled') return preTabPOs.filter((po) => po.status === 'CANCELLED')
    return preTabPOs
  }, [preTabPOs, statusTab])

  // ── Stats ── (reflect period + supplier + status + search, but NOT the
  // card drill-down — otherwise clicking a card would rewrite its own total)

  const stats = useMemo(() => {
    const all = statsBasePOs
    // Bucket every PO into exactly one of {received, pending, partial} so the
    // tile totals always reconcile back to "Total Orders". POStatus values:
    //   DRAFT / SENT / ACKNOWLEDGED  → Pending
    //   PARTIALLY_RECEIVED           → Partial
    //   FULLY_RECEIVED / CLOSED      → Received
    // Every status in the schema (see enum POStatus) is covered by one of the
    // three buckets above, so totalCount = receivedCount + partialCount +
    // pendingCount and totalAmount = receivedTotal + partialTotal + pendingTotal.
    const totalAmount = all.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    const received = all.filter((po) => po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED')
    const pending = all.filter((po) => po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'ACKNOWLEDGED')
    const partial = all.filter((po) => po.status === 'PARTIALLY_RECEIVED')
    const receivedTotal = received.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    const pendingTotal = pending.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    const partialTotal = partial.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    return {
      totalAmount,
      totalCount: all.length,
      receivedCount: received.length,
      receivedTotal,
      pendingCount: pending.length,
      pendingTotal,
      partialCount: partial.length,
      partialTotal,
    }
  }, [statsBasePOs])

  // ── Pagination ──

  const totalPages = Math.ceil(filteredPOs.length / PAGE_SIZE)
  const paginatedPOs = filteredPOs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // ── Bulk select ──

  const allOnPageSelected =
    paginatedPOs.length > 0 && paginatedPOs.every((po) => selectedIds.has(po.id))

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const newSet = new Set(selectedIds)
      paginatedPOs.forEach((po) => newSet.delete(po.id))
      setSelectedIds(newSet)
    } else {
      const newSet = new Set(selectedIds)
      paginatedPOs.forEach((po) => newSet.add(po.id))
      setSelectedIds(newSet)
    }
  }

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  // ── Active filters count ── ("today" is the default baseline)
  const activeFilterCount = [
    period !== 'today' ? period : '',
    cardFilter !== 'all' ? cardFilter : '',
    dateFrom, dateTo,
    selectedSupplier !== 'all' ? selectedSupplier : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    statusTab !== 'all' ? statusTab : '',
  ].filter(Boolean).length

  // ── Actions ──
  async function handleAction(action: string, po: PurchaseOrder) {
    switch (action) {
      case 'view':
        openDetailPO(po)
        break
      case 'send':
        try {
          await api.patch(`/purchase-orders/${po.id}`, { status: 'SENT' })
          toast.success(`PO ${po.poNumber} marked as sent`)
          fetchPOs()
        } catch { toast.error('Failed to update PO status') }
        break
      case 'receive':
        navigate(`/purchase/grn?poId=${po.id}`)
        break
      case 'cancel':
        try {
          await api.patch(`/purchase-orders/${po.id}`, { status: 'CANCELLED' })
          toast.success(`PO ${po.poNumber} cancelled`)
          fetchPOs()
        } catch (err: any) {
          toast.error(err.response?.data?.message ?? 'Failed to cancel PO')
        }
        break
    }
  }

  function renderStatusBadge(status: string) {
    const config = statusBadgeConfig[status] || { label: status, variant: 'secondary' as const }
    return <Badge variant={config.variant} size="sm" dot>{config.label}</Badge>
  }

  // ── Create PO Form ──

  const {
    register, control, handleSubmit, setValue, reset, watch,
    formState,
  } = useForm<CreatePOForm>({
    resolver: zodResolver(createPOSchema),
    defaultValues: {
      supplierId: '',
      expectedDelivery: '',
      items: [{ productId: '', productName: '', requiredQty: 1, lastPurchaseRate: 0, expectedRate: 0, remarks: '' }],
    },
  })

  const { errors } = formState
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' })

  const poTotal = useMemo(() => {
    return (watchedItems || []).reduce(
      (sum, item) => sum + (parseFloat(String(item?.requiredQty)) || 0) * (parseFloat(String(item?.expectedRate)) || 0), 0
    )
  }, [watchedItems])

  // Auto-open the Create PO dialog with a product pre-populated when arriving
  // from the Product History page (e.g. via a Low Stock alert).
  useEffect(() => {
    if (!products.length) return
    const productId = new URLSearchParams(search).get('productId')
    if (!productId) return
    const product = products.find((p) => p.id === productId)
    if (!product) return

    const shortfall = Math.max(1, (product.minStock ?? 0) - (product.totalStock ?? 0))
    reset({
      supplierId: '',
      expectedDelivery: '',
      items: [{
        productId: product.id,
        productName: product.name,
        requiredQty: product.reorderQty ?? shortfall,
        lastPurchaseRate: product.purchaseRate ?? 0,
        expectedRate: product.purchaseRate ?? 0,
        remarks: `Stock: ${product.totalStock ?? 0}/${product.minStock ?? 0}`,
      }],
    })
    setCreateDialogOpen(true)
    // Strip the param so refresh/back doesn't re-trigger the auto-open.
    window.history.replaceState(null, '', '/purchase/orders')
  }, [products, search, reset])

  function handleAutoGenerate() {
    const lowStockProducts = products.filter((p) => (p.totalStock ?? 0) <= (p.minStock ?? 0)).slice(0, 18)
    const newItems = lowStockProducts.map((p) => ({
      productId: p.id, productName: p.name,
      requiredQty: p.reorderQty ?? 10,
      lastPurchaseRate: p.purchaseRate ?? 0,
      expectedRate: p.purchaseRate ?? 0,
      remarks: `Stock: ${p.totalStock ?? 0}/${p.minStock ?? 0}`,
    }))
    if (newItems.length === 0) { toast.info('No low stock items found'); return }
    setValue('items', newItems)
    toast.success(`Added ${newItems.length} low stock items`)
  }

  async function onSubmitPO(data: CreatePOForm, asDraft: boolean) {
    const supplier = suppliers.find((s) => s.id === data.supplierId)
    try {
      await api.post('/purchase-orders', {
        supplierId: data.supplierId,
        supplierName: supplier?.name ?? '',
        expectedDelivery: new Date(data.expectedDelivery).toISOString(),
        status: asDraft ? 'DRAFT' : 'SENT',
        totalAmount: data.items.reduce((sum, it) => sum + (Number(it.requiredQty) || 0) * (Number(it.expectedRate) || 0), 0),
        items: data.items.map((it) => ({
          productId: it.productId,
          productName: it.productName,
          requiredQty: Number(it.requiredQty),
          lastPurchaseRate: Number(it.lastPurchaseRate) || 0,
          expectedRate: Number(it.expectedRate),
          remarks: it.remarks ?? '',
        })),
      })
      toast.success(asDraft
        ? `Draft PO saved for ${supplier?.name || 'supplier'}`
        : `PO sent to ${supplier?.name || 'supplier'} successfully`
      )
      setCreateDialogOpen(false)
      reset()
      fetchPOs()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Failed to create purchase order')
    }
  }

  const handleSelectProduct = (index: number, product: Product | null) => {
    if (!product) {
      setValue(`items.${index}.productId`, '', { shouldValidate: true })
      setValue(`items.${index}.productName`, '', { shouldValidate: true })
      return
    }
    
    setValue(`items.${index}.productId`, product.id, { shouldDirty: true, shouldValidate: true })
    setValue(`items.${index}.productName`, product.name, { shouldDirty: true, shouldValidate: true })
    setValue(`items.${index}.lastPurchaseRate`, product.purchaseRate ?? 0, { shouldDirty: true, shouldValidate: true })
    setValue(`items.${index}.expectedRate`, product.purchaseRate ?? 0, { shouldDirty: true, shouldValidate: true })
    
    // Relay focus to Qty
    setTimeout(() => {
      const qtyInput = document.getElementsByName(`items.${index}.requiredQty`)[0] as HTMLInputElement
      if (qtyInput) {
        qtyInput.focus()
        qtyInput.select()
      }
    }, 150)
  }

  if (effectiveView === 'split') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
        {/* Collapsible stats */}
        <AnimatePresence>
          {splitShowStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {([
                  { label: 'Total Orders', value: formatCurrency(stats.totalAmount), sub: `${stats.totalCount} orders`, borderAccent: 'border-l-blue-500' },
                  { label: 'Received', value: formatCurrency(stats.receivedTotal), sub: `${stats.receivedCount} completed`, borderAccent: 'border-l-emerald-500' },
                  { label: 'Pending', value: formatCurrency(stats.pendingTotal), sub: `${stats.pendingCount} awaiting`, borderAccent: 'border-l-amber-500' },
                  { label: 'Partial', value: formatCurrency(stats.partialTotal), sub: `${stats.partialCount} in progress`, borderAccent: 'border-l-purple-500' },
                ] as const).map((s) => (
                  <Card key={s.label} className={cn('border-l-[3px]', s.borderAccent)}>
                    <CardContent className="flex items-center gap-2 px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                        <p className="font-mono text-sm font-bold leading-tight">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div className="w-40 min-w-35">
            <EnumSelect value={period} onValueChange={onPeriodChange} onClear={() => onPeriodChange('all')} options={PERIOD_OPTIONS} />
          </div>
          <ExportMenu
            title="Purchase Orders"
            filename="purchase-orders"
            noun="purchase order"
            rows={() => filteredPOs.map((po) => ({
              'PO Number': po.poNumber,
              Date: po.date.slice(0, 10),
              Supplier: po.supplierName,
              Items: po.items.length,
              Amount: po.totalAmount,
              Status: po.status,
            }))}
          />
          {/* Segmented utility toggles (Filter · Summary) — same language as the
              view switcher: one bordered pill, active item lifts on a surface. */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Toggle filters"
              onClick={() => setSplitShowFilters(!splitShowFilters)}
              className={cn(
                'relative h-7 w-7 rounded-md transition-all',
                splitShowFilters && 'bg-background text-foreground shadow-sm',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={splitShowStats ? 'Hide stats' : 'Show stats'}
              onClick={() => setSplitShowStats(!splitShowStats)}
              className={cn(
                'h-7 w-7 rounded-md transition-all',
                splitShowStats && 'bg-background text-foreground shadow-sm',
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Hairline divider separating utilities from primary actions */}
          <div className="mx-0.5 hidden h-6 w-px bg-border/60 sm:block" />
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Create PO</span>
          </Button>
          <ViewModeToggle view="split" onViewChange={(v) => { if (v === 'table') exitSplitView() }} />
        </div>

        {/* Collapsible filter panel */}
        <AnimatePresence>
          {splitShowFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex flex-wrap items-end gap-3 *:flex-1 *:min-w-35">
                  <EnumSelect label="Status" value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1) }} onClear={() => setSelectedStatus('all')} options={STATUS_OPTIONS} />
                  <SupplierSearchSelect value={selectedSupplier} selectedName={selectedSupplierName} onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name); setCurrentPage(1) }} />
                  {period === 'custom' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date From</Label>
                        <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setCurrentPage(1) }} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date To</Label>
                        <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setCurrentPage(1) }} />
                      </div>
                    </>
                  )}
                  <div className="flex-none! min-w-0! flex items-end gap-2">
                    <ColumnsToggle
                      columns={CARD_FIELDS}
                      visible={cardCols.visible}
                      onToggle={cardCols.toggle}
                      onReset={cardCols.reset}
                    />
                    {activeFilterCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => clearFilters()}>
                        <X className="mr-1 h-3.5 w-3.5" />Clear
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Split view */}
        <div className="min-h-0 flex-1">
          <PurchaseOrderSplitView
            purchaseOrders={filteredPOs}
            loading={isLoading}
            selectedPoId={selectedPoId}
            onSelectPo={selectPo}
            onExitSplitView={exitSplitView}
            onRefresh={fetchPOs}
            isCardFieldVisible={cardCols.isVisible}
            tabsNode={
              <POStatusTabs
                tab={statusTab}
                onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
                counts={tabCounts}
              />
            }
          />
        </div>

        {/* Create PO Sheet (also accessible from split view) */}
        <Sheet open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <SheetContent side="right" className="p-0 gap-0 w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl flex flex-col h-dvh overflow-hidden">
            {/* Reuse the form — same as the table-view Sheet below */}
            <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
              <div className="flex items-center gap-4 pr-8">
                <div className="min-w-0 flex-1 space-y-1">
                  <SheetTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Create Purchase Order
                  </SheetTitle>
                  <SheetDescription className="text-sm">Create a new purchase order for a supplier.</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <form onSubmit={handleSubmit((data) => onSubmitPO(data, false))} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="scroll-mt-2">
                  <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                    <h3 className="text-sm font-semibold">Order Info</h3>
                  </div>
                  <div className="p-6 pb-8 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier <span className="text-rose-500">*</span></Label>
                        <Select value={watch('supplierId') || undefined} onValueChange={(val) => setValue('supplierId', val, { shouldValidate: true })}>
                          <SelectTrigger className={cn(errors.supplierId && 'border-destructive')}>
                            <SelectValue placeholder="Select supplier..." />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.supplierId && <p className="text-xs text-destructive">{errors.supplierId.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Delivery <span className="text-rose-500">*</span></Label>
                        <Controller
                          control={control}
                          name="expectedDelivery"
                          render={({ field }) => (
                            <DatePicker value={field.value} onChange={field.onChange} error={!!errors.expectedDelivery} />
                          )}
                        />
                        {errors.expectedDelivery && <p className="text-xs text-destructive">{errors.expectedDelivery.message}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleAutoGenerate}>
                        <Zap className="h-3.5 w-3.5" />Auto-generate from Low Stock
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="scroll-mt-2 border-t border-border/40">
                  <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Order Items</h3>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ productId: '', productName: '', requiredQty: 1, lastPurchaseRate: 0, expectedRate: 0, remarks: '' })}>
                      <Plus className="h-3 w-3" />Add Row
                    </Button>
                  </div>
                  <div className="p-6 pb-8 space-y-3">
                    {/* responsive: cards on phones */}
                    {isMobile ? (
                      <div className="space-y-3">
                        {fields.map((field, index) => (
                          <POItemRow
                            key={field.id}
                            index={index}
                            layout="card"
                            register={register}
                            onSelectProduct={handleSelectProduct}
                            control={control}
                            remove={remove}
                            errors={errors}
                            products={products}
                            isRemovable={fields.length > 1}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/60 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-50">Product</TableHead>
                              <TableHead className="w-25">Req. Qty</TableHead>
                              <TableHead className="w-27.5">Last Rate</TableHead>
                              <TableHead className="w-30">Expected Rate</TableHead>
                              <TableHead className="min-w-30">Remarks</TableHead>
                              <TableHead className="w-15" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fields.map((field, index) => (
                              <POItemRow
                                key={field.id}
                                index={index}
                                register={register}
                                onSelectProduct={handleSelectProduct}
                                control={control}
                                remove={remove}
                                errors={errors}
                                products={products}
                                isRemovable={fields.length > 1}
                              />
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {errors.items && (
                      <p className="text-xs text-destructive">
                        {typeof errors.items.message === 'string' ? errors.items.message : 'Please add valid items'}
                      </p>
                    )}
                    <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PO Total</span>
                      <span className="text-lg font-bold font-mono">{formatCurrency(poTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 shrink-0">
                <Button type="button" variant="outline" onClick={() => handleSubmit((data) => onSubmitPO(data, true))()}>
                  Save as Draft
                </Button>
                <Button type="submit" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />Send to Supplier
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards — click Received / Pending / Partial to drill the list ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {([
          {
            label: 'Total Orders',
            value: formatCurrency(stats.totalAmount),
            subtitle: `${stats.totalCount} orders`,
            icon: IndianRupee,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            label: 'Received',
            value: formatCurrency(stats.receivedTotal),
            subtitle: `${stats.receivedCount} completed`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'received',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Pending',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.pendingCount} awaiting`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'pending',
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            label: 'Partial Delivery',
            value: formatCurrency(stats.partialTotal),
            subtitle: `${stats.partialCount} in progress`,
            icon: Package,
            iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            borderAccent: 'border-l-purple-500',
            filterKey: 'partial',
            activeRing: 'ring-2 ring-purple-500/50',
          },
        ] as const).map((stat) => {
          const active = stat.filterKey !== 'all' && cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.filterKey === 'all' ? 'Show all orders in this period' : `Filter list to ${stat.label.toLowerCase()}`}
            onClick={() => { setCardFilter(active ? 'all' : (stat.filterKey as 'all' | 'received' | 'pending' | 'partial')); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : (stat.filterKey as 'all' | 'received' | 'pending' | 'partial')); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.borderAccent, active && stat.activeRing)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.iconBg)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <p className="text-lg font-bold font-mono leading-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search PO# or supplier..."
        resultsCount={filteredPOs.length}
        activeFilterCount={activeFilterCount}
        open={tableFiltersOpen}
        onOpenChange={setTableFiltersOpen}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        leadingNode={
          <div className="w-full sm:w-40">
            <EnumSelect
              value={period}
              // Picking "Custom Range" auto-opens the filters panel so the
              // From/To date pickers (rendered inside it) are immediately visible;
              // leaving 'custom' auto-closes it again.
              onValueChange={onPeriodChange}
              // Clearing the period means "no date restriction" → All Time. (Was
              // resetting to 'today', i.e. the same value, so the X did nothing.)
              onClear={() => onPeriodChange('all')}
              options={PERIOD_OPTIONS}
            />
          </div>
        }
        columnsNode={<ColumnsToggle columns={PO_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <ExportMenu
              className="flex-1 sm:w-auto sm:flex-none"
              title="Purchase Orders"
              filename="purchase-orders"
              noun="purchase order"
              rows={() => filteredPOs.map((po) => ({
                'PO Number': po.poNumber,
                Date: po.date.slice(0, 10),
                Supplier: po.supplierName,
                Items: po.items.length,
                Amount: po.totalAmount,
                Status: po.status,
              }))}
            />
            <ViewModeToggle view="table" onViewChange={(v) => { if (v === 'split') navigate('/purchase/orders') }} />
            <Button
              size="sm"
              className="flex-1 sm:w-auto sm:flex-none"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Create PO</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </div>
        }
      >
        {/* All filters on one flex-wrap row so Supplier/Status + the custom
            date pickers align on a single line (wrap only when the window is
            too narrow to fit them). */}
        <div className="col-span-full flex flex-wrap items-end gap-4">
          <div className="min-w-40 flex-1">
            <SupplierSearchSelect
              value={selectedSupplier}
              selectedName={selectedSupplierName}
              onChange={(val, name) => { setSelectedSupplier(val); setSelectedSupplierName(name); setCurrentPage(1) }}
            />
          </div>

          <div className="min-w-40 flex-1">
            <EnumSelect
              label="Status"
              value={selectedStatus}
              onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
              onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
              options={STATUS_OPTIONS}
            />
          </div>

          {/* Custom date range — full width below sm forces its own dedicated row (never squeezed alongside another field) so both pickers stay usable; sm+ reverts to flex-1 so desktop layout is unchanged */}
          {period === 'custom' && (
            <div className="w-full sm:w-auto sm:min-w-40 sm:flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Date From
                  </Label>
                  <DatePicker
                    value={dateFrom}
                    onChange={(v) => { setDateFrom(v); setCurrentPage(1) }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Date To
                  </Label>
                  <DatePicker
                    value={dateTo}
                    onChange={(v) => { setDateTo(v); setCurrentPage(1) }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </DataTableFilterBar>

      {/* ── Status Tabs ── */}
      <POStatusTabs
        tab={statusTab}
        onChange={(t) => { setStatusTab(t); setCurrentPage(1) }}
        counts={tabCounts}
      />

      {/* ── Bulk actions bar ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 dark:bg-primary/10">
              <Badge variant="default" size="sm" dot>{selectedIds.size} selected</Badge>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredPOs.filter((po) => selectedIds.has(po.id))
                  const lines = selected.map((po) => `PO# ${po.poNumber} | ${po.supplierName} | ${formatCurrency(po.totalAmount)} | ${po.status}`).join('%0a')
                  window.open(`https://wa.me/?text=${encodeURIComponent('Purchase Orders:%0a' + lines)}`, '_blank')
                }}>
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Send
                </Button>
                <ExportMenu
                  variant="ghost"
                  size="sm"
                  title="Purchase Orders"
                  filename="purchase-orders-selected"
                  noun="purchase order"
                  rows={() => filteredPOs
                    .filter((po) => selectedIds.has(po.id))
                    .map((po) => ({
                      'PO Number': po.poNumber,
                      Date: po.date.slice(0, 10),
                      Supplier: po.supplierName,
                      Items: po.items.length,
                      Amount: po.totalAmount,
                      Status: po.status,
                    }))}
                />
              </div>
              <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setSelectedIds(new Set())}>
                <X />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table ── */}
      <Card>

        {/* Mobile card list */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-4 py-3 animate-pulse">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-3 w-40 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                  <div className="h-5 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : paginatedPOs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No purchase orders found</div>
          ) : (
            <div className="divide-y divide-border/40">
              {paginatedPOs.map((po) => (
                <div
                  key={po.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => openDetailPO(po)}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {cols.isVisible('po') && <p className="font-mono text-xs font-medium text-primary">{po.poNumber}</p>}
                    {cols.isVisible('supplier') && <p className="truncate text-[15px] font-bold">{po.supplierName}</p>}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {cols.isVisible('status') && renderStatusBadge(po.status)}
                      {cols.isVisible('date') && <span className="text-xs text-muted-foreground">{formatDate(po.date)}</span>}
                    </div>
                    {cols.isVisible('expected') && po.expectedDelivery && (
                      <p className="text-[10px] text-muted-foreground">Expected {formatDate(po.expectedDelivery)}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {cols.isVisible('total') && <span className="font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(po.totalAmount)}</span>}
                    {cols.isVisible('items') && <span className="text-xs text-muted-foreground">{po.items.length} item{po.items.length !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
              </TableHead>
              {cols.isVisible('date') && <TableHead>Date</TableHead>}
              {cols.isVisible('supplier') && <TableHead>Supplier</TableHead>}
              {cols.isVisible('po') && <TableHead>PO #</TableHead>}
              {cols.isVisible('items') && <TableHead className="text-center">Items</TableHead>}
              {cols.isVisible('total') && <TableHead className="text-right">Total</TableHead>}
              {cols.isVisible('status') && <TableHead>Status</TableHead>}
              {cols.isVisible('expected') && <TableHead>Expected Delivery</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 2} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Fetching purchase orders...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.visible.length + 2} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                        <ClipboardList className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">No purchase orders found</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPOs.map((po) => (
                  <motion.tr
                    key={po.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => openDetailPO(po)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(po.id)} onCheckedChange={() => toggleSelectOne(po.id)} />
                    </TableCell>
                    {cols.isVisible('date') && (
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">{formatDate(po.date)}</span>
                    </TableCell>
                    )}
                    {cols.isVisible('supplier') && (
                    <TableCell className="max-w-45">
                      <p
                        role="link"
                        tabIndex={0}
                        title="View supplier details"
                        className="truncate text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${po.supplierId}`) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/purchase/suppliers/detail?supplierId=${po.supplierId}`) } }}
                      >{po.supplierName}</p>
                    </TableCell>
                    )}
                    {cols.isVisible('po') && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="font-mono text-[11px] font-medium">{po.poNumber}</span>
                      </div>
                    </TableCell>
                    )}
                    {cols.isVisible('items') && (
                    <TableCell className="text-center">
                      <Badge variant="secondary" size="sm">{po.items.length}</Badge>
                    </TableCell>
                    )}
                    {cols.isVisible('total') && (
                    <TableCell className="text-right font-mono text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(po.totalAmount)}
                    </TableCell>
                    )}
                    {cols.isVisible('status') && <TableCell>{renderStatusBadge(po.status)}</TableCell>}
                    {cols.isVisible('expected') && (
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">{formatDate(po.expectedDelivery)}</span>
                    </TableCell>
                    )}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => handleAction('view', po)}
                        // Cancel only while the PO is still open — not once it's
                        // received, closed or already cancelled.
                        onDelete={
                          ['DRAFT', 'SENT', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(po.status)
                            ? () => handleAction('cancel', po)
                            : undefined
                        }
                        deleteLabel="Cancel PO"
                        customActions={[
                          {
                            label: 'Send to Supplier',
                            icon: <Send className="h-4 w-4" />,
                            onClick: () => handleAction('send', po),
                            disabled: po.status !== 'DRAFT'
                          },
                          {
                            label: 'Receive Goods',
                            icon: <PackageCheck className="h-4 w-4" />,
                            onClick: () => handleAction('receive', po),
                            disabled: po.status === 'DRAFT' || po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED'
                          },
                          {
                            label: 'Download PDF',
                            icon: <Download className="h-4 w-4" />,
                            onClick: () => downloadPoPdf({ poNumber: po.poNumber, date: po.date, supplierName: po.supplierName, expectedDelivery: po.expectedDelivery, status: po.status, totalAmount: po.totalAmount, items: po.items })
                          },
                          {
                            label: 'Print PO',
                            icon: <Printer className="h-4 w-4" />,
                            onClick: () => printPoPdf({ poNumber: po.poNumber, date: po.date, supplierName: po.supplierName, expectedDelivery: po.expectedDelivery, status: po.status, totalAmount: po.totalAmount, items: po.items })
                          }
                        ]}
                      />
                    </TableCell>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        </div>
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredPOs.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* ── Create PO Drawer ──
          Right-side Sheet to match the Add New Product form on ProductsPage:
          fixed header with title + section progress pills, single scrollable
          body with sticky section dividers, sticky footer with actions. */}
      <Sheet open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <SheetContent
          side="right"
          className="p-0 gap-0 w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl flex flex-col h-dvh overflow-hidden"
        >
          {/* Header — title on the left, section progress on the right. */}
          <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
            <div className="flex items-center gap-4 pr-8">
              <div className="min-w-0 flex-1 space-y-1">
                <SheetTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Create Purchase Order
                </SheetTitle>
                <SheetDescription className="text-sm">
                  Create a new purchase order for a supplier.
                </SheetDescription>
              </div>
              {(() => {
                const sections = [
                  { value: 'info', label: 'Order Info' },
                  { value: 'items', label: 'Items' },
                ]
                const supplierFilled = !!watch('supplierId') && !errors.supplierId
                const deliveryFilled = !!watch('expectedDelivery') && !errors.expectedDelivery
                const infoFilled = supplierFilled && deliveryFilled
                const itemsFilled = fields.length > 0 && !errors.items
                const filledMap: Record<string, boolean> = { info: infoFilled, items: itemsFilled }
                const errorMap: Record<string, boolean> = {
                  info: !!(errors.supplierId || errors.expectedDelivery),
                  items: !!errors.items,
                }
                const isSubmitted = formState.isSubmitted
                return (
                  <div className="hidden md:flex shrink-0 items-center gap-1.5 max-w-full overflow-x-auto">
                    {sections.map((s, i) => {
                      const showError = errorMap[s.value] && isSubmitted
                      const isComplete = filledMap[s.value] && !errorMap[s.value]
                      return (
                        <div key={s.value} className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                            showError ? 'bg-rose-500 text-white'
                              : isComplete ? 'bg-emerald-500 text-white'
                              : 'bg-muted text-muted-foreground',
                          )}>
                            {showError ? '!' : isComplete ? '✓' : i + 1}
                          </span>
                          <span className={cn(
                            'text-xs font-medium',
                            showError ? 'text-rose-500'
                              : isComplete ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-muted-foreground',
                          )}>{s.label}</span>
                          {i < sections.length - 1 && (
                            <span className="text-muted-foreground/30 mx-0.5">›</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </SheetHeader>

          <form onSubmit={handleSubmit((data) => onSubmitPO(data, false))} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto">

              {/* ── Order Info ── */}
              <div className="scroll-mt-2">
                <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                  <h3 className="text-sm font-semibold">Order Info</h3>
                </div>
                <div className="p-6 pb-8 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier <span className="text-rose-500">*</span></Label>
                      <Select value={watch('supplierId') || undefined} onValueChange={(val) => setValue('supplierId', val, { shouldValidate: true })}>
                        <SelectTrigger className={cn(errors.supplierId && 'border-destructive')}>
                          <SelectValue placeholder="Select supplier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.supplierId && <p className="text-xs text-destructive">{errors.supplierId.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Delivery <span className="text-rose-500">*</span></Label>
                      <Controller
                        control={control}
                        name="expectedDelivery"
                        render={({ field }) => (
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            error={!!errors.expectedDelivery}
                          />
                        )}
                      />
                      {errors.expectedDelivery && <p className="text-xs text-destructive">{errors.expectedDelivery.message}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleAutoGenerate}>
                      <Zap className="h-3.5 w-3.5" />Auto-generate from Low Stock
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── Items ── */}
              <div className="scroll-mt-2 border-t border-border/40">
                <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Order Items</h3>
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ productId: '', productName: '', requiredQty: 1, lastPurchaseRate: 0, expectedRate: 0, remarks: '' })}>
                    <Plus className="h-3 w-3" />Add Row
                  </Button>
                </div>
                <div className="p-6 pb-8 space-y-3">
                  {/* responsive: cards on phones */}
                  {isMobile ? (
                    <div className="space-y-3">
                      {fields.map((field, index) => (
                        <POItemRow
                          key={field.id}
                          index={index}
                          layout="card"
                          register={register}
                          onSelectProduct={handleSelectProduct}
                          control={control}
                          remove={remove}
                          errors={errors}
                          products={products}
                          isRemovable={fields.length > 1}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-50">Product</TableHead>
                            <TableHead className="w-25">Req. Qty</TableHead>
                            <TableHead className="w-27.5">Last Rate</TableHead>
                            <TableHead className="w-30">Expected Rate</TableHead>
                            <TableHead className="min-w-30">Remarks</TableHead>
                            <TableHead className="w-15" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fields.map((field, index) => (
                            <POItemRow
                              key={field.id}
                              index={index}
                              register={register}
                              onSelectProduct={handleSelectProduct}
                              control={control}
                              remove={remove}
                              errors={errors}
                              products={products}
                              isRemovable={fields.length > 1}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {errors.items && (
                    <p className="text-xs text-destructive">
                      {typeof errors.items.message === 'string' ? errors.items.message : 'Please add valid items'}
                    </p>
                  )}

                  <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PO Total</span>
                    <span className="text-lg font-bold font-mono">{formatCurrency(poTotal)}</span>
                  </div>
                </div>
              </div>

            </div>{/* end scrollable body */}

            {/* Sticky footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 shrink-0">
              <Button type="button" variant="outline" onClick={() => handleSubmit((data) => onSubmitPO(data, true))()}>
                Save as Draft
              </Button>
              <Button type="submit" className="gap-1.5">
                <Send className="h-3.5 w-3.5" />Send to Supplier
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── PO Detail Drawer ── */}
      <Sheet open={!!detailPO} onOpenChange={(open) => !open && setDetailPO(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-190 p-0 gap-0 flex flex-col"
        >
          {detailPO && (() => {
            const canReceive = detailPO.status === 'SENT' || detailPO.status === 'ACKNOWLEDGED' || detailPO.status === 'PARTIALLY_RECEIVED'
            const isPartial = detailPO.status === 'PARTIALLY_RECEIVED'
            const poDoc = {
              poNumber: detailPO.poNumber,
              date: detailPO.date,
              supplierName: detailPO.supplierName,
              expectedDelivery: detailPO.expectedDelivery,
              status: detailPO.status,
              totalAmount: detailPO.totalAmount,
              items: detailPO.items,
            }
            return (
              <>
                {/* ── Sticky Header ── */}
                <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
                  <div className="flex items-center justify-between gap-3 pr-8">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <SheetTitle className="font-mono text-base font-semibold truncate">
                        {detailPO.poNumber}
                      </SheetTitle>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(detailPO.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {detailPOLoading && (
                        <div className="h-3.5 w-3.5 rounded-full border-b-2 border-primary animate-spin" />
                      )}
                      <Badge variant="info" size="sm" className="gap-1">
                        <Package className="h-3 w-3" />
                        {detailPO.items.length} {detailPO.items.length === 1 ? 'item' : 'items'}
                      </Badge>
                    </div>
                  </div>
                </SheetHeader>

                {/* ── Scrollable Body ── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  {/* Supplier / Expected Delivery / Status — 3-col grid on phones
                      (labels wrap instead of colliding), single flex row at sm+ */}
                  <div className="grid grid-cols-3 items-stretch rounded-xl border border-border/40 bg-muted/20 sm:flex">
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-3 py-3 sm:px-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</p>
                      <p className="mt-0.5 text-sm font-medium truncate" title={detailPO.supplierName}>{detailPO.supplierName}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-3 sm:px-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Delivery</p>
                      <p className="mt-0.5 text-sm font-medium">{detailPO.expectedDelivery ? formatDate(detailPO.expectedDelivery) : '—'}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-3 py-3 sm:px-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                      <div className="mt-0.5">{renderStatusBadge(detailPO.status)}</div>
                    </div>
                  </div>

                  {/* Partial delivery banner */}
                  {isPartial && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/30 dark:bg-amber-900/10">
                      <Package className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Partial Delivery in Progress</p>
                        <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-400/70">Some items have been received. Click "Receive Remaining Goods" to create a supplementary GRN for the rest.</p>
                      </div>
                    </div>
                  )}

                  {/* Items — cards on phones, table at md+ */}
                  <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40 md:hidden">
                    {detailPO.items.map((item, idx) => {
                      const received = item.receivedQty >= item.requiredQty
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : item.receivedQty > 0
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-muted/60 text-muted-foreground'
                      return (
                        <div key={item.id} className="px-3 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-baseline gap-1.5 text-sm font-medium leading-snug">
                                <span className="font-mono text-[11px] text-muted-foreground">{idx + 1}.</span>
                                {item.productName}
                              </p>
                              {item.remarks && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.remarks}</p>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-sm font-semibold">{formatCurrency(item.requiredQty * item.expectedRate)}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Ordered</p>
                              <span className="mt-0.5 inline-flex items-center justify-center rounded-lg bg-blue-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                                {item.requiredQty}
                              </span>
                            </div>
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Received</p>
                              <span className={cn('mt-0.5 inline-flex items-center justify-center rounded-lg px-2 py-0.5 font-mono text-xs font-semibold', received)}>
                                {item.receivedQty}
                              </span>
                            </div>
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Rate</p>
                              <p className="mt-0.5 font-mono text-xs font-semibold">{formatCurrency(item.expectedRate)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Items — proper table with sticky header */}
                  <div className="hidden overflow-hidden rounded-xl border border-border/40 md:block">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm">
                        <TableRow className="border-b border-border/40 hover:bg-transparent">
                          <TableHead className="h-9 w-10 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                          <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</TableHead>
                          <TableHead className="h-9 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ordered</TableHead>
                          <TableHead className="h-9 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</TableHead>
                          <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailPO.items.map((item, idx) => (
                          <TableRow key={item.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                            <TableCell className="px-3 py-2.5 text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="px-3 py-2.5">
                              <p className="text-sm font-medium leading-snug">{item.productName}</p>
                              {item.remarks && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.remarks}</p>
                              )}
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center rounded-lg bg-blue-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                                {item.requiredQty}
                              </span>
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={cn(
                                  'inline-flex items-center justify-center rounded-lg px-2.5 py-0.5 font-mono text-xs font-semibold',
                                  item.receivedQty >= item.requiredQty
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : item.receivedQty > 0
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                      : 'bg-muted/60 text-muted-foreground'
                                )}>
                                  {item.receivedQty}
                                </span>
                                {item.receivedQty > 0 && item.receivedQty < item.requiredQty && (
                                  <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-amber-500"
                                      style={{ width: `${Math.min(100, (item.receivedQty / item.requiredQty) * 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm whitespace-nowrap">{formatCurrency(item.expectedRate)}</TableCell>
                            <TableCell className="px-3 py-2.5 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(item.requiredQty * item.expectedRate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* ── Sticky Footer: grand total + actions ── */}
                <div className="shrink-0 border-t border-border/40 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
                  {/* Grand Total strip */}
                  <div className="flex items-center justify-between border-b border-border/40 bg-primary/5 px-5 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grand Total</p>
                    <p className="font-mono text-base font-bold text-primary">{formatCurrency(detailPO.totalAmount)}</p>
                  </div>

                  {/* Action buttons */}
                  <div className="px-5 py-3 flex gap-2">
                    <Button className="flex-1 gap-2" onClick={() => printPoPdf(poDoc)}>
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2" onClick={() => downloadPoPdf(poDoc)}>
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Download PDF</span>
                      <span className="sm:hidden">PDF</span>
                    </Button>
                    {canReceive && (
                      <Button
                        variant={isPartial ? 'outline' : 'default'}
                        className={cn(
                          'flex-1 gap-2',
                          isPartial && 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20'
                        )}
                        onClick={() => { navigate(`/purchase/grn?poId=${detailPO.id}`); setDetailPO(null) }}
                      >
                        <PackageCheck className="h-4 w-4" />
                        <span className="hidden sm:inline">{isPartial ? 'Receive Remaining' : 'Receive Goods'}</span>
                        <span className="sm:hidden">Receive</span>
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}