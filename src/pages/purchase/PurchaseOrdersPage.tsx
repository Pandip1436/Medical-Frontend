import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Send,
  PackageCheck,
  XCircle,
  Zap,
  Trash2,
  FileText,
  ClipboardList,
  Download,
  Printer,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  CheckCircle2,
  Clock,
  Package,
} from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { mockPurchaseOrders, mockSuppliers, mockProducts } from '@/data/mock'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { navigate } from '@/lib/router'
import type { PurchaseOrder } from '@/types'

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
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'acknowledged', label: 'Confirmed' },
  { value: 'partially_received', label: 'Partial' },
  { value: 'fully_received', label: 'Received' },
  { value: 'closed', label: 'Closed' },
] as const

const statusBadgeConfig: Record<
  string,
  { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'purple' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  sent: { label: 'Sent', variant: 'info' },
  acknowledged: { label: 'Confirmed', variant: 'success' },
  partially_received: { label: 'Partial', variant: 'warning' },
  fully_received: { label: 'Received', variant: 'success' },
  closed: { label: 'Closed', variant: 'purple' },
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
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
  const [productSearch, setProductSearch] = useState('')

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
    let result = [...mockPurchaseOrders]

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
  }, [searchQuery, period, dateFrom, dateTo, selectedSupplier, selectedStatus, amountMin, amountMax])

  // ── Stats ──

  const stats = useMemo(() => {
    const all = mockPurchaseOrders
    const totalAmount = all.reduce((sum, po) => sum + po.totalAmount, 0)
    const receivedTotal = all
      .filter((po) => po.status === 'fully_received' || po.status === 'closed')
      .reduce((sum, po) => sum + po.totalAmount, 0)
    const pendingTotal = all
      .filter((po) => po.status === 'draft' || po.status === 'sent' || po.status === 'acknowledged')
      .reduce((sum, po) => sum + po.totalAmount, 0)
    const partialCount = all.filter((po) => po.status === 'partially_received').length
    return {
      totalAmount,
      totalCount: all.length,
      receivedCount: all.filter((po) => po.status === 'fully_received' || po.status === 'closed').length,
      receivedTotal,
      pendingCount: all.filter((po) => po.status === 'draft' || po.status === 'sent' || po.status === 'acknowledged').length,
      pendingTotal,
      partialCount,
    }
  }, [])

  // ── Pagination ──

  const totalPages = Math.ceil(filteredPOs.length / PAGE_SIZE)
  const paginatedPOs = filteredPOs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )
  const rangeStart = filteredPOs.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredPOs.length)

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
  function handleAction(action: string, po: PurchaseOrder) {
    switch (action) {
      case 'view': toast.info(`Viewing PO ${po.poNumber}`); break
      case 'send': toast.success(`PO ${po.poNumber} sent to ${po.supplierName}`); break
      case 'receive': toast.info(`Navigate to GRN for PO ${po.poNumber}`); break
      case 'cancel': toast.warning(`PO ${po.poNumber} has been cancelled`); break
    }
  }

  function renderStatusBadge(status: string) {
    const config = statusBadgeConfig[status] || { label: status, variant: 'secondary' as const }
    return <Badge variant={config.variant} size="sm" dot>{config.label}</Badge>
  }

  // ── Create PO Form ──

  const {
    register, control, handleSubmit, watch, setValue, reset,
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
  const watchedItems = watch('items')

  const poTotal = useMemo(() => {
    return (watchedItems || []).reduce(
      (sum, item) => sum + (Number(item.requiredQty) || 0) * (Number(item.expectedRate) || 0), 0
    )
  }, [watchedItems])

  const filteredProducts = useMemo(() => {
    if (!productSearch) return []
    return mockProducts
      .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.genericName.toLowerCase().includes(productSearch.toLowerCase()))
      .slice(0, 8)
  }, [productSearch])

  function handleProductSelect(index: number, product: (typeof mockProducts)[0]) {
    setValue(`items.${index}.productId`, product.id)
    setValue(`items.${index}.productName`, product.name)
    setValue(`items.${index}.lastPurchaseRate`, product.purchaseRate)
    setValue(`items.${index}.expectedRate`, product.purchaseRate)
    setProductSearch('')
  }

  function handleAutoGenerate() {
    const lowStockProducts = mockProducts.filter((p) => p.totalStock <= p.minStock).slice(0, 18)
    const newItems = lowStockProducts.map((p) => ({
      productId: p.id, productName: p.name, requiredQty: p.reorderQty,
      lastPurchaseRate: p.purchaseRate, expectedRate: p.purchaseRate,
      remarks: `Stock: ${p.totalStock}/${p.minStock}`,
    }))
    if (newItems.length === 0) { toast.info('No low stock items found'); return }
    setValue('items', newItems.length > 0 ? newItems : fields as never)
    toast.success(`Added ${newItems.length} low stock items`)
  }

  function onSubmitPO(data: any, asDraft: boolean) {
    const supplier = mockSuppliers.find((s) => s.id === data.supplierId)
    toast.success(asDraft
      ? `Purchase Order saved as draft for ${supplier?.name || 'supplier'}`
      : `Purchase Order sent to ${supplier?.name || 'supplier'} successfully`
    )
    setCreateDialogOpen(false)
    reset()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage purchase orders and supplier communications
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create PO
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/purchase/grn')}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            Goods Receipt
          </Button>
        </div>
      </div>

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
      >
        <EnumSelect
          label="Period"
          value={period}
          onValueChange={(val) => { setPeriod(val); setCurrentPage(1) }}
          onClear={() => { setPeriod('all'); setCurrentPage(1) }}
          options={PERIOD_OPTIONS}
        />

        {/* Custom date range */}
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date From
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date To
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1) }}
              />
            </div>
          </>
        )}

        <EnumSelect
          label="Supplier"
          value={selectedSupplier}
          onValueChange={(val) => { setSelectedSupplier(val); setCurrentPage(1) }}
          onClear={() => { setSelectedSupplier('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Suppliers' },
            ...mockSuppliers.map((s) => ({ value: s.id, label: s.name })),
          ]}
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
            <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 dark:bg-primary/10">
              <Badge variant="default" size="sm" dot>{selectedIds.size} selected</Badge>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => toast.info('Sending selected...')}>
                  <Send className="mr-1 h-3.5 w-3.5" />
                  Send
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toast.info('Exporting selected...')}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toast.info('Printing selected...')}>
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
              {paginatedPOs.length === 0 ? (
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
                paginatedPOs.map((po, idx) => (
                  <motion.tr
                    key={po.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, delay: idx * 0.02 }}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => toast.info(`Viewing PO ${po.poNumber}`)}
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
                    <TableCell className="max-w-[180px]">
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
                            disabled: po.status !== 'draft'
                          },
                          {
                            label: 'Receive Goods',
                            icon: <PackageCheck className="h-4 w-4" />,
                            onClick: () => handleAction('receive', po),
                            disabled: po.status === 'draft' || po.status === 'fully_received' || po.status === 'closed'
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

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}-{rangeEnd}</span> of{' '}
            <span className="font-medium text-foreground">{filteredPOs.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />Prev
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums">Page {currentPage} of {totalPages || 1}</span>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
              Next<ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Create PO Dialog ── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Create Purchase Order
            </DialogTitle>
            <DialogDescription>Create a new purchase order for a supplier.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((data) => onSubmitPO(data, false))} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</Label>
                <Select onValueChange={(val) => setValue('supplierId', val)}>
                  <SelectTrigger className={cn(errors.supplierId && 'border-destructive')}>
                    <SelectValue placeholder="Select supplier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.supplierId && <p className="text-xs text-destructive">{errors.supplierId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expected Delivery</Label>
                <Input type="date" error={!!errors.expectedDelivery} {...register('expectedDelivery')} />
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

              <div className="rounded-xl border border-border/60 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Product</TableHead>
                      <TableHead className="w-[100px]">Req. Qty</TableHead>
                      <TableHead className="w-[120px]">Last Rate</TableHead>
                      <TableHead className="w-[120px]">Expected Rate</TableHead>
                      <TableHead className="min-w-[120px]">Remarks</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id} className="border-border/40">
                        <TableCell>
                          {watchedItems[index]?.productName ? (
                            <span className="text-sm font-medium">{watchedItems[index].productName}</span>
                          ) : (
                            <div className="relative">
                              <Input
                                icon={<Search className="h-3.5 w-3.5" />}
                                placeholder="Search product..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                className="h-8"
                              />
                              {productSearch && filteredProducts.length > 0 && (
                                <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-xl border border-border/60 bg-popover p-1 shadow-lg dark:shadow-black/20">
                                  {filteredProducts.map((p) => (
                                    <button
                                      key={p.id} type="button"
                                      className="w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                                      onClick={() => handleProductSelect(index, p)}
                                    >
                                      {p.name} <span className="font-mono text-xs text-muted-foreground">({formatCurrency(p.purchaseRate)})</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="h-8 w-20 font-mono" error={!!errors.items?.[index]?.requiredQty} {...register(`items.${index}.requiredQty`, { valueAsNumber: true })} />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm text-muted-foreground">{formatCurrency(Number(watchedItems[index]?.lastPurchaseRate) || 0)}</span>
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="h-8 w-24 font-mono" error={!!errors.items?.[index]?.expectedRate} {...register(`items.${index}.expectedRate`, { valueAsNumber: true })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8" placeholder="Optional" {...register(`items.${index}.remarks`)} />
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => fields.length > 1 && remove(index)} disabled={fields.length <= 1}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
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
    </motion.div>
  )
}
