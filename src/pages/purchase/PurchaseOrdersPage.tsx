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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { PaginatedSelect } from '@/components/shared/PaginatedSelect'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { exportToCsv, printReport } from '@/lib/exportUtils'
import { downloadPoPdf, printPoPdf } from '@/lib/pdf/poPdf'
import type { PurchaseOrder, Product } from '@/types'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'

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
  { value: 'CLOSED', label: 'Closed' },
] as const

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
}

function POItemRow({ index, register, onSelectProduct, control, remove, errors, products, isRemovable }: POItemRowProps) {
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
    if (!productSearch) return []
    const q = productSearch.toLowerCase()
    return products
      .filter((p) => 
        p.name.toLowerCase().includes(q) || 
        (p.genericName ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
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

  return (
    <TableRow className="border-border/40">
      <TableCell className="relative">
        {watchedItem?.productId ? (
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
            {showDropdown && productSearch && filteredProducts.length > 0 && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: dropdownPos.top + 4,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                  zIndex: 10000
                }}
                className="rounded-xl border border-border/60 bg-popover p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 border-b border-border/40 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 bg-muted/30 mb-1 rounded-t-lg">
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
        )}
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
        <span className="font-mono text-sm text-muted-foreground">
          {formatCurrency(Number(watchedItem?.lastPurchaseRate) || 0)}
        </span>
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
      </TableCell>
    </TableRow>
  )
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const { suppliers, products, fetchMasterData } = useMasterDataStore()
  const { search } = useRoute()

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

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [period, setPeriod] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Create PO dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [detailPO, setDetailPO] = useState<(typeof purchaseOrders)[0] | null>(null)
  const [detailPOLoading, setDetailPOLoading] = useState(false)

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

  // Deep-link support: when arrived from a `?poId=<id>` URL (e.g. clicked
  // from the Supplier Detail page's POs tab), auto-open that PO's drawer once
  // the list has loaded. Runs only once per id so the user can manually close
  // it without it reopening on the next render. Uses the `search` already
  // pulled from useRoute() above.
  useEffect(() => {
    const params = new URLSearchParams(search)
    const target = params.get('poId')
    if (!target || purchaseOrders.length === 0) return
    if (detailPO?.id === target) return
    const match = purchaseOrders.find((p) => p.id === target)
    if (match) void openDetailPO(match)
    // openDetailPO + detailPO?.id intentionally omitted — we want to fire only
    // when the URL param or the loaded list changes, not on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, purchaseOrders])

  const clearFilters = () => {
    setPeriod('all')
    setDateFrom('')
    setDateTo('')
    setSelectedSupplier('all')
    setSelectedStatus('all')
    setAmountMin('')
    setAmountMax('')
  }

  // ── Filtering logic ──

  const filteredPOs = useMemo(() => {
    let result = [...purchaseOrders]

    // Period
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    switch (period) {
      case 'today':
        result = result.filter((po) => po.date.slice(0, 10) === todayStr)
        break
      case 'week': {
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        result = result.filter((po) => po.date.slice(0, 10) >= weekAgo.toISOString().slice(0, 10))
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

    // Amount range
    if (amountMin) result = result.filter((po) => po.totalAmount >= parseFloat(amountMin))
    if (amountMax) result = result.filter((po) => po.totalAmount <= parseFloat(amountMax))

    return result
  }, [purchaseOrders, searchQuery, period, dateFrom, dateTo, selectedSupplier, selectedStatus, amountMin, amountMax])

  // ── Stats ──

  const stats = useMemo(() => {
    const all = purchaseOrders
    const totalAmount = all.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    const receivedTotal = all
      .filter((po) => po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED')
      .reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    const pendingTotal = all
      .filter((po) => po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'ACKNOWLEDGED')
      .reduce((sum, po) => sum + Number(po.totalAmount || 0), 0)
    const partialCount = all.filter((po) => po.status === 'PARTIALLY_RECEIVED').length
    return {
      totalAmount,
      totalCount: all.length,
      receivedCount: all.filter((po) => po.status === 'FULLY_RECEIVED' || po.status === 'CLOSED').length,
      receivedTotal,
      pendingCount: all.filter((po) => po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'ACKNOWLEDGED').length,
      pendingTotal,
      partialCount,
    }
  }, [purchaseOrders])

  // Backend-paginated supplier fetcher for the filter dropdown.
  const supplierFetcher = useCallback(
    async ({ skip, take, query }: { skip: number; take: number; query: string }) => {
      const params = new URLSearchParams({ skip: String(skip), take: String(take) })
      if (query) params.set('q', query)
      const res = await api.get(`/suppliers?${params.toString()}`)
      const payload = res.data
      const items = (payload?.data ?? []) as Array<{ id: string; name: string }>
      return {
        data: items.map((s) => ({ value: s.id, label: s.name })),
        hasMore: Boolean(payload?.hasMore),
      }
    },
    [],
  )

  // Resolve the selected supplier's name for the trigger label (the master
  // store is still preloaded on boot, so we can use it as a lookup cache).
  const selectedSupplierLabel = useMemo(() => {
    if (selectedSupplier === 'all' || !selectedSupplier) return undefined
    return suppliers.find((s) => s.id === selectedSupplier)?.name
  }, [selectedSupplier, suppliers])

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

  // ── Active filters count ──
  const activeFilterCount = [
    period !== 'all' ? period : '',
    dateFrom, dateTo,
    selectedSupplier !== 'all' ? selectedSupplier : '',
    selectedStatus !== 'all' ? selectedStatus : '',
    amountMin, amountMax,
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
          await api.patch(`/purchase-orders/${po.id}`, { status: 'CLOSED' })
          toast.success(`PO ${po.poNumber} cancelled`)
          fetchPOs()
        } catch { toast.error('Failed to cancel PO') }
        break
    }
  }

  function renderStatusBadge(status: string) {
    const config = statusBadgeConfig[status] || { label: status, variant: 'secondary' as const }
    return <Badge variant={config.variant} size="sm" dot>{config.label}</Badge>
  }

  // ── Create PO Form ──

  const {
    register, control, handleSubmit, setValue, reset,
    formState: { errors },
  } = useForm<CreatePOForm>({
    resolver: zodResolver(createPOSchema),
    defaultValues: {
      supplierId: '',
      expectedDelivery: '',
      items: [{ productId: '', productName: '', requiredQty: 1, lastPurchaseRate: 0, expectedRate: 0, remarks: '' }],
    },
  })

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Orders',
            value: formatCurrency(stats.totalAmount),
            subtitle: `${stats.totalCount} orders`,
            icon: IndianRupee,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Received',
            value: formatCurrency(stats.receivedTotal),
            subtitle: `${stats.receivedCount} completed`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Pending',
            value: formatCurrency(stats.pendingTotal),
            subtitle: `${stats.pendingCount} awaiting`,
            icon: Clock,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
          {
            label: 'Partial Delivery',
            value: stats.partialCount.toString(),
            subtitle: 'in progress',
            icon: Package,
            iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            borderAccent: 'border-l-purple-500',
          },
        ].map((stat) => (
          <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
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
        ))}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1) }}
        searchPlaceholder="Search PO# or supplier..."
        resultsCount={filteredPOs.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Create PO</span>
              <span className="sm:hidden">Create</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => navigate('/purchase/grn')}
            >
              <PackageCheck className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Purchase Entry</span>
              <span className="sm:hidden">Entry</span>
            </Button>
          </div>
        }
      >
        {/* Custom equal-width grid that overrides DataTableFilterBar's inner grid */}
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Period"
            value={period}
            onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
            onClear={() => { setPeriod('all'); setCurrentPage(1) }}
            options={PERIOD_OPTIONS}
          />

          <PaginatedSelect
            label="Supplier"
            value={selectedSupplier}
            onValueChange={(val) => { setSelectedSupplier(val); setCurrentPage(1) }}
            onClear={() => { setSelectedSupplier('all'); setCurrentPage(1) }}
            fetcher={supplierFetcher}
            pinnedOption={{ value: 'all', label: 'All Suppliers' }}
            selectedLabel={selectedSupplierLabel}
            pageSize={10}
          />

          <EnumSelect
            label="Status"
            value={selectedStatus}
            onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
            onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
            options={STATUS_OPTIONS}
          />

          {/* Amount Range */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount Range</Label>
            <div className="flex items-center gap-2">
              <Input type="number" placeholder="Min" value={amountMin} onChange={(e) => { setAmountMin(e.target.value); setCurrentPage(1) }} className="w-full" />
              <span className="text-muted-foreground text-xs">-</span>
              <Input type="number" placeholder="Max" value={amountMax} onChange={(e) => { setAmountMax(e.target.value); setCurrentPage(1) }} className="w-full" />
            </div>
          </div>

          {/* Custom date range — only when period is 'custom', full-width row below */}
          {period === 'custom' && (
            <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-1">
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
          )}
        </div>
      </DataTableFilterBar>

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
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredPOs.filter((po) => selectedIds.has(po.id))
                  exportToCsv(selected.map((po) => ({
                    'PO Number': po.poNumber,
                    Date: po.date.slice(0, 10),
                    Supplier: po.supplierName,
                    Items: po.items.length,
                    Amount: po.totalAmount,
                    Status: po.status,
                  })), 'purchase-orders-selected')
                }}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = filteredPOs.filter((po) => selectedIds.has(po.id))
                  printReport(selected.map((po) => ({
                    'PO Number': po.poNumber,
                    Date: po.date.slice(0, 10),
                    Supplier: po.supplierName,
                    Items: po.items.length,
                    Amount: formatCurrency(po.totalAmount),
                    Status: po.status,
                  })), 'Purchase Orders')
                }}>
                  <Printer className="mr-1 h-3.5 w-3.5" />
                  Print
                </Button>
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
                    <p className="font-mono text-xs font-medium text-primary">{po.poNumber}</p>
                    <p className="truncate text-sm font-medium">{po.supplierName}</p>
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {renderStatusBadge(po.status)}
                      <span className="text-xs text-muted-foreground">{formatDate(po.date)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="font-mono text-sm font-semibold">{formatCurrency(po.totalAmount)}</span>
                    <span className="text-xs text-muted-foreground">{po.items.length} item{po.items.length !== 1 ? 's' : ''}</span>
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
              <TableHead>PO #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expected Delivery</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                      <p className="text-sm text-muted-foreground animate-pulse">Fetching purchase orders...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
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
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="font-mono text-[11px] font-medium">{po.poNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">{formatDate(po.date)}</span>
                    </TableCell>
                    <TableCell className="max-w-45">
                      <p className="truncate text-sm font-medium">{po.supplierName}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" size="sm">{po.items.length}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {formatCurrency(po.totalAmount)}
                    </TableCell>
                    <TableCell>{renderStatusBadge(po.status)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">{formatDate(po.expectedDelivery)}</span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => handleAction('view', po)}
                        onDelete={() => handleAction('cancel', po)}
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

      {/* ── Create PO Dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="md:max-w-4xl! md:max-h-[90vh]! md:overflow-y-auto! md:overflow-x-hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Create Purchase Order
            </DialogTitle>
            <DialogDescription>Create a new purchase order for a supplier.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((data) => onSubmitPO(data, false))} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</Label>
                <Select onValueChange={(val) => setValue('supplierId', val)}>
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
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Delivery</Label>
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

            <Separator className="bg-border/60" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Order Items</Label>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ productId: '', productName: '', requiredQty: 1, lastPurchaseRate: 0, expectedRate: 0, remarks: '' })}>
                  <Plus className="h-3 w-3" />Add Row
                </Button>
              </div>

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

              {errors.items && (
                <p className="text-xs text-destructive">
                  {typeof errors.items.message === 'string' ? errors.items.message : 'Please add valid items'}
                </p>
              )}
            </div>

            <Separator className="bg-border/60" />

            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PO Total</span>
              <span className="text-lg font-bold font-mono">{formatCurrency(poTotal)}</span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleSubmit((data) => onSubmitPO(data, true))()}>
                Save as Draft
              </Button>
              <Button type="submit" className="gap-1.5">
                <Send className="h-3.5 w-3.5" />Send to Supplier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                  {/* Supplier / Expected Delivery / Status — single row, equal width */}
                  <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Supplier</p>
                      <p className="mt-0.5 text-sm font-medium truncate" title={detailPO.supplierName}>{detailPO.supplierName}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Expected Delivery</p>
                      <p className="mt-0.5 text-sm font-medium whitespace-nowrap">{detailPO.expectedDelivery ? formatDate(detailPO.expectedDelivery) : '—'}</p>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Status</p>
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

                  {/* Items — proper table with sticky header */}
                  <div className="overflow-hidden rounded-xl border border-border/40">
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
                <div className="shrink-0 border-t border-border/40 bg-background">
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
