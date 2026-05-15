import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Upload, Download,
  FileDown, FileSpreadsheet,
  Package, AlertTriangle, Layers, PowerOff, Power,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { exportToCsv, exportToPdf } from '@/lib/exportUtils'
import { importFromExcel } from '@/lib/excelUtils'
import type { Product, Category } from '@/types'

// ─── Zod schema ───────────────────────────────────────────────
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  genericName: z.string().min(1, 'Generic name is required'),
  saltComposition: z.string().optional().default(''),
  manufacturer: z.string().min(1, 'Manufacturer is required'),
  categoryId: z.string().min(1, 'Category is required'),
  packSize: z.string().min(1, 'Pack size is required'),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  schedule: z.enum(['NONE', 'H', 'H1', 'X']),
  hsnCode: z.string().min(1, 'HSN code is required'),
  isNarcotic: z.boolean().default(false),
  storageCondition: z.enum(['ROOM_TEMP', 'COOL_DRY', 'REFRIGERATED', 'FROZEN']),
  mrp: z.coerce.number().min(0.01, 'MRP is required'),
  purchaseRate: z.coerce.number().min(0.01, 'Purchase rate is required'),
  sellingRate: z.coerce.number().min(0),
  wholesaleRate: z.coerce.number().min(0),
  gstRate: z.coerce.number(),
  minStock: z.coerce.number().min(0).default(0),
  maxStock: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  rackLocation: z.string().min(1, 'Rack location is required'),
})
type ProductFormValues = z.input<typeof productSchema>

// ─── Schedule badge ────────────────────────────────────────────
const scheduleBadgeConfig: Record<string, { label: string; variant: 'destructive' | 'warning' } | null> = {
  NONE: null,
  H: { label: 'H', variant: 'destructive' },
  H1: { label: 'H1', variant: 'destructive' },
  X: { label: 'X', variant: 'warning' },
}

// ─── Category search dropdown ──────────────────────────────────
function CategorySearchDropdown({
  categories,
  value,
  onChange,
  hasError,
}: {
  categories: Category[]
  value: string
  onChange: (v: string) => void
  hasError?: boolean
}) {
  const selected = categories.find(c => c.id === value)

  return (
    <Select value={value || '__placeholder__'} onValueChange={v => onChange(v === '__placeholder__' ? '' : v)}>
      <SelectTrigger className={hasError ? 'border-rose-500 focus:ring-rose-500' : ''}>
        {selected ? selected.name : <span className="text-muted-foreground">Select category…</span>}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__placeholder__" disabled className="hidden">
          Select category…
        </SelectItem>
        {categories.map(c => (
          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function ProductsPage() {
  const suppliers = useMasterDataStore(s => s.suppliers)
  const fetchSuppliers = useMasterDataStore(s => s.fetchSuppliers)
  const importProducts = useMasterDataStore(s => s.importProducts)
  const importProductsHsn = useMasterDataStore(s => s.importProductsHsn)
  const isLoading = useMasterDataStore(s => s.isLoading)

  const [categories, setCategories] = useState<Category[]>([])
  const [stockSummary, setStockSummary] = useState<{ lowStock: number; outOfStock: number } | null>(null)

  // Mount-only fetches. We deliberately DO NOT call fetchProducts() here —
  // the master "all products" call is the heaviest endpoint in the app
  // (returns every product + nested batches). The paginated effect below
  // pulls just the visible page; the stats card pulls its counters from
  // the dashboard report.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchSuppliers()
    api.get('/categories').then(r => setCategories(r.data)).catch(() => {})
    api.get('/reports/dashboard')
      .then(r => setStockSummary({
        // Backend returns the count under `lowStockAlertsCount`; `lowStockItems`
        // is the actual array of products (used by the dashboard table) and
        // would render as `[object Object], ...` if we stringified it here.
        lowStock: r.data?.lowStockAlertsCount ?? 0,
        outOfStock: r.data?.outOfStockCount ?? 0,
      }))
      .catch(() => {})
  }, [])

  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedSchedule, setSelectedSchedule] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [activeTab, setActiveTab] = useState('basic')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ createdCount?: number; updatedCount?: number; skippedCount: number; errors: string[] } | null>(null)

  const PAGE_SIZE = 10
  const [paginatedProducts, setPaginatedProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['basic']))

  const refreshPage = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => {
    let isSubscribed = true
    const fetchData = async () => {
      try {
        const res = await api.get('/products', {
          params: {
            q: search || undefined,
            categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
            schedule: selectedSchedule !== 'all' ? selectedSchedule : undefined,
            status: selectedStatus !== 'all' ? selectedStatus : undefined,
            skip: (currentPage - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          },
        })
        if (isSubscribed) {
          setPaginatedProducts(res.data.data || [])
          setTotalCount(res.data.total || 0)
        }
      } catch (error) {
        console.error('Failed to fetch paginated products', error)
      }
    }
    fetchData()
    return () => { isSubscribed = false }
  }, [search, selectedCategoryId, selectedSchedule, selectedStatus, currentPage, refreshKey])

  // Manufacturer datalist: suppliers + whatever manufacturers appear on the
  // current page of products. Good-enough autocomplete without needing a
  // full-catalogue load.
  const manufacturers = useMemo(() => {
    const fromSuppliers = suppliers.map(s => s.name)
    const fromProducts = paginatedProducts.map(p => p.manufacturer)
    return [...new Set([...fromSuppliers, ...fromProducts])].sort()
  }, [suppliers, paginatedProducts])

  const summaryStats = useMemo(() => ({
    total: totalCount,
    lowStock: stockSummary?.lowStock ?? 0,
    outOfStock: stockSummary?.outOfStock ?? 0,
    categories: categories.length,
  }), [totalCount, stockSummary, categories])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  // Form
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '', genericName: '', saltComposition: '', manufacturer: '',
      categoryId: '', packSize: '', unitOfMeasure: '', schedule: 'NONE',
      hsnCode: '', isNarcotic: false, storageCondition: 'ROOM_TEMP',
      mrp: 0, purchaseRate: 0, sellingRate: 0, wholesaleRate: 0, gstRate: 12,
      minStock: 0, maxStock: 0, reorderQty: 0, rackLocation: '',
    },
  })

  const mrpVal = Number(form.watch('mrp')) || 0
  const purchaseRateVal = Number(form.watch('purchaseRate')) || 0
  const margin = mrpVal > 0 ? (((mrpVal - purchaseRateVal) / mrpVal) * 100).toFixed(1) : '0.0'

  // Fields per tab — used for per-tab validation and error indicators
  const tabFields: Record<string, (keyof ProductFormValues)[]> = {
    basic: ['name', 'genericName', 'manufacturer', 'categoryId', 'packSize', 'unitOfMeasure'],
    regulatory: ['hsnCode'],
    pricing: ['mrp', 'purchaseRate'],
    stock: ['rackLocation'],
  }

  const validateAndGoTo = async (target: string) => {
    await form.trigger(tabFields[activeTab])
    setVisitedTabs(prev => new Set([...prev, target]))
    setActiveTab(target)
  }

  const openAddDialog = () => {
    setEditingProduct(null)
    form.reset({
      name: '', genericName: '', saltComposition: '', manufacturer: '',
      categoryId: '', packSize: '', unitOfMeasure: '', schedule: 'NONE',
      hsnCode: '', isNarcotic: false, storageCondition: 'ROOM_TEMP',
      mrp: 0, purchaseRate: 0, sellingRate: 0, wholesaleRate: 0, gstRate: 12,
      minStock: 0, maxStock: 0, reorderQty: 0, rackLocation: '',
    })
    setVisitedTabs(new Set(['basic']))
    setActiveTab('basic')
    setDialogOpen(true)
  }

  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    const catId = product.categoryId ?? (typeof product.category === 'object' ? product.category?.id : '') ?? ''
    form.reset({
      name: product.name,
      genericName: product.genericName,
      saltComposition: product.saltComposition ?? '',
      manufacturer: product.manufacturer,
      categoryId: catId,
      packSize: product.packSize,
      unitOfMeasure: product.unitOfMeasure,
      schedule: product.schedule as ProductFormValues['schedule'],
      hsnCode: product.hsnCode,
      isNarcotic: product.isNarcotic,
      storageCondition: product.storageCondition as ProductFormValues['storageCondition'],
      mrp: product.mrp,
      purchaseRate: product.purchaseRate,
      sellingRate: product.sellingRate,
      wholesaleRate: product.wholesaleRate,
      gstRate: product.gstRate,
      minStock: product.minStock,
      maxStock: product.maxStock,
      reorderQty: product.reorderQty,
      rackLocation: product.rackLocation,
    } as ProductFormValues)
    setVisitedTabs(new Set(['basic']))
    setActiveTab('basic')
    setDialogOpen(true)
  }

  const onSubmit = async (values: ProductFormValues) => {
    const payload = {
      ...values,
      schedule: values.schedule.toUpperCase(),
      storageCondition: values.storageCondition.toUpperCase(),
      categoryId: values.categoryId || undefined,
    }
    try {
      if (editingProduct) {
        await api.patch(`/products/${editingProduct.id}`, payload)
        toast.success(`Product "${values.name}" updated successfully`)
      } else {
        await api.post('/products', payload)
        toast.success(`Product "${values.name}" added successfully`)
      }
      setDialogOpen(false)
      setCurrentPage(1)
      refreshPage()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Operation failed')
    }
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/products/${product.id}`)
      toast.success(`Product "${product.name}" deleted`)
      refreshPage()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete product')
    }
  }

  const handleToggleActive = async (product: Product) => {
    const isActive = (product as any).isActive !== false
    try {
      await api.patch(`/products/${product.id}/toggle-active`)
      toast.success(`"${product.name}" ${isActive ? 'deactivated' : 'reactivated'}`)
      refreshPage()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update product status')
    }
  }

  const CSV_TEMPLATE_HEADERS = [
    'name', 'genericname', 'saltcomposition', 'manufacturer', 'category', 'subcategory',
    'packsize', 'unitofmeasure', 'schedule', 'hsncode', 'isnarcotic', 'storagecondition',
    'mrp', 'purchaserate', 'sellingrate', 'wholesalerate', 'gstrate',
    'minstock', 'maxstock', 'reorderqty', 'racklocation',
  ]
  const CSV_TEMPLATE_EXAMPLE = [
    'Paracetamol 500mg', 'Paracetamol', '', 'ABC Pharma', 'GENERAL', '',
    '10 Tabs', 'TAB', 'H', '3004', 'false', 'ROOM_TEMPERATURE',
    '25', '12', '20', '18', '12', '10', '500', '50', 'A-01',
  ]

  const handleDownloadTemplate = () => {
    const rows = [CSV_TEMPLATE_HEADERS.join(','), CSV_TEMPLATE_EXAMPLE.join(',')]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'products-import-template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!importFile) { toast.error('Please select a file'); return }
    setImporting(true)
    setImportResult(null)
    try {
      const data = await importFromExcel<any>(importFile)
      if (!data || data.length === 0) throw new Error('No valid records found in file')
      
      if (data[0]?.__isHsnUpdate) {
        const res = await importProductsHsn(data)
        setImportResult(res)
        if (res.updatedCount > 0) {
          refreshPage()
          toast.success(`Updated HSN for ${res.updatedCount} product(s)`)
        }
      } else {
        const res = await importProducts(data)
        setImportResult(res)
        if (res.createdCount > 0) {
          refreshPage()
          toast.success(`Imported ${res.createdCount} product(s)`)
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // Get category display for a product
  const getProductCategory = (product: Product) => {
    if (typeof product.category === 'object' && product.category) return product.category
    if (product.categoryId) return categories.find(c => c.id === product.categoryId)
    return null
  }

  const categoryFilterOptions = [
    { value: 'all', label: 'All Categories' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

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
            label: 'Total Products',
            value: String(summaryStats.total),
            subtitle: 'in catalog',
            icon: Package,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Low Stock',
            value: String(summaryStats.lowStock),
            subtitle: 'below min level',
            icon: AlertTriangle,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
          {
            label: 'Out of Stock',
            value: String(summaryStats.outOfStock),
            subtitle: 'zero stock',
            icon: Package,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
          },
          {
            label: 'Categories',
            value: String(summaryStats.categories),
            subtitle: 'product groups',
            icon: Layers,
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-lg font-bold font-mono leading-tight">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={val => { setSearch(val); setCurrentPage(1) }}
        searchPlaceholder="Search products by name, generic, manufacturer..."
        resultsCount={totalCount}
        activeFilterCount={(selectedCategoryId !== 'all' ? 1 : 0) + (selectedSchedule !== 'all' ? 1 : 0) + (selectedStatus !== 'all' ? 1 : 0)}
        onClearFilters={() => { setSelectedCategoryId('all'); setSelectedSchedule('all'); setSelectedStatus('all'); setCurrentPage(1) }}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => { setImportFile(null); setImportResult(null); setImportDialogOpen(true) }}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  const rows = paginatedProducts.map(p => ({
                    Name: p.name, Generic: p.genericName,
                    Category: getProductCategory(p)?.name ?? '',
                    MRP: p.mrp, Rate: p.purchaseRate, Stock: p.totalStock,
                    HSN: p.hsnCode, GST: p.gstRate,
                  }))
                  exportToCsv(rows, 'products')
                }}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const rows = paginatedProducts.map(p => ({
                    Name: p.name, Generic: p.genericName,
                    Category: getProductCategory(p)?.name ?? '',
                    MRP: p.mrp, Rate: p.purchaseRate, Stock: p.totalStock,
                  }))
                  exportToPdf(rows, 'Products List', 'products')
                }}>
                  <FileDown className="mr-2 h-4 w-4" /> Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
              onClick={openAddDialog}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add Product</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      >
        <EnumSelect
          label="Category"
          value={selectedCategoryId}
          onValueChange={val => { setSelectedCategoryId(val); setCurrentPage(1) }}
          onClear={() => { setSelectedCategoryId('all'); setCurrentPage(1) }}
          options={categoryFilterOptions}
        />
        <EnumSelect
          label="Schedule"
          value={selectedSchedule}
          onValueChange={val => { setSelectedSchedule(val); setCurrentPage(1) }}
          onClear={() => { setSelectedSchedule('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Schedules' },
            { value: 'NONE', label: 'None' },
            { value: 'H', label: 'Schedule H' },
            { value: 'H1', label: 'Schedule H1' },
            { value: 'X', label: 'Schedule X' },
          ]}
        />
        <EnumSelect
          label="Status"
          value={selectedStatus}
          onValueChange={val => { setSelectedStatus(val); setCurrentPage(1) }}
          onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </DataTableFilterBar>

      {/* ── Mobile Cards / Desktop Table ── */}
      <Card>
        {/* Mobile */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-4 py-3 animate-pulse">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-40 rounded bg-muted" />
                    <div className="h-3 w-28 rounded bg-muted" />
                  </div>
                  <div className="h-5 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : paginatedProducts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No products found</div>
          ) : (
            <div className="divide-y divide-border/40">
              {paginatedProducts.map(product => {
                const isOutOfStock = (product.totalStock || 0) === 0
                const isLowStock = !isOutOfStock && (product.totalStock || 0) < (product.minStock || 0)
                const cat = getProductCategory(product)
                const scheduleKey = (String(product.schedule || '')).toUpperCase()
                const sched = scheduleBadgeConfig[scheduleKey === 'NONE' ? 'NONE' : scheduleKey]
                return (
                  <div
                    key={product.id}
                    className={cn(
                      'flex items-start justify-between gap-2 px-4 py-3 cursor-pointer',
                      isOutOfStock && 'bg-rose-50/60 dark:bg-rose-950/20',
                      isLowStock && 'bg-amber-50/60 dark:bg-amber-950/20'
                    )}
                    onClick={() => { navigate(`/inventory/product-history?productId=${product.id}`) }}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate font-medium text-sm">{product.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {product.genericName}{product.manufacturer ? ` · ${product.manufacturer}` : ''}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {cat && (
                          <Badge variant="secondary" size="sm">{cat.name}</Badge>
                        )}
                        {sched && <Badge variant={sched.variant} size="sm">{sched.label}</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-sm font-semibold">{formatCurrency(product.mrp)}</span>
                      <span className={cn(
                        'inline-flex items-center gap-1 font-mono text-xs font-semibold',
                        isOutOfStock && 'text-rose-600 dark:text-rose-400',
                        isLowStock && 'text-amber-600 dark:text-amber-400',
                        !isOutOfStock && !isLowStock && 'text-emerald-600 dark:text-emerald-400'
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full',
                          isOutOfStock && 'bg-rose-500', isLowStock && 'bg-amber-500',
                          !isOutOfStock && !isLowStock && 'bg-emerald-500'
                        )} />
                        {product.totalStock} units
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Generic</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Min Stock</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedProducts.map(product => {
                const isOutOfStock = (product.totalStock || 0) === 0
                const isLowStock = !isOutOfStock && (product.totalStock || 0) < (product.minStock || 0)
                const cat = getProductCategory(product)
                const scheduleKey = (String(product.schedule || '')).toUpperCase()
                const sched = scheduleBadgeConfig[scheduleKey === 'NONE' ? 'NONE' : scheduleKey]
                return (
                  <TableRow
                    key={product.id}
                    className={cn(
                      'cursor-pointer',
                      (product as any).isActive === false && 'opacity-50',
                      isOutOfStock && 'bg-rose-50/60 dark:bg-rose-950/20',
                      isLowStock && 'bg-amber-50/60 dark:bg-amber-950/20'
                    )}
                    onClick={() => { navigate(`/inventory/product-history?productId=${product.id}`) }}
                  >
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.genericName}</TableCell>
                    <TableCell className="text-muted-foreground">{product.manufacturer}</TableCell>
                    <TableCell>
                      {cat && <Badge variant="secondary" size="sm">{cat.name}</Badge>}
                    </TableCell>
                    <TableCell>
                      {sched && <Badge variant={sched.variant} size="sm">{sched.label}</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(product.mrp)}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 font-mono text-sm font-semibold',
                        isOutOfStock && 'text-rose-600 dark:text-rose-400',
                        isLowStock && 'text-amber-600 dark:text-amber-400',
                        !isOutOfStock && !isLowStock && 'text-emerald-600 dark:text-emerald-400'
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full',
                          isOutOfStock && 'bg-rose-500', isLowStock && 'bg-amber-500',
                          !isOutOfStock && !isLowStock && 'bg-emerald-500'
                        )} />
                        {product.totalStock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{product.minStock}</TableCell>
                    <TableCell className="text-muted-foreground">{product.rackLocation}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => { navigate(`/inventory/product-history?productId=${product.id}`) }}
                        onEdit={() => openEditDialog(product)}
                        onDelete={() => handleDelete(product)}
                        customActions={[
                          {
                            label: (product as any).isActive !== false ? 'Deactivate' : 'Reactivate',
                            icon: (product as any).isActive !== false
                              ? <PowerOff className="h-4 w-4" />
                              : <Power className="h-4 w-4" />,
                            onClick: () => handleToggleActive(product),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={totalCount}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="p-0 gap-0 w-full h-dvh max-w-none rounded-none md:rounded-2xl md:max-w-4xl md:h-[85vh] flex! flex-col! justify-start! items-stretch! overflow-hidden">

          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-lg">{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            <DialogDescription className="text-sm">
              {editingProduct ? 'Update the product details below.' : 'Fill in the product details across all sections.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex! flex-col! flex-1 min-h-0 justify-start!">

            {/* Mobile: horizontal scroll tabs */}
            <div className="md:hidden shrink-0 overflow-x-auto border-b border-border/40">
              <div className="flex w-max gap-1 px-4 py-3">
                {[
                  { value: 'basic', label: 'Basic Info' },
                  { value: 'regulatory', label: 'Regulatory' },
                  { value: 'pricing', label: 'Pricing' },
                  { value: 'stock', label: 'Stock' },
                ].map((t) => (
                  <button key={t.value} type="button" onClick={() => validateAndGoTo(t.value)}
                    className={cn('shrink-0 rounded-lg text-xs px-3 py-1.5 font-medium transition-colors',
                      activeTab === t.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body: sidebar + content */}
            <div className="flex! flex-1 min-h-0 overflow-hidden justify-start! items-stretch!">

              {/* ── Sidebar: completely independent, never reflows ── */}
              <div className="hidden md:flex flex-col w-48 shrink-0 border-r border-border/40 bg-muted/20">
                <nav className="flex flex-col gap-0.5 p-3 pt-4">
                  {[
                    { value: 'basic', label: 'Basic Info', desc: 'Name, category, pack' },
                    { value: 'regulatory', label: 'Regulatory', desc: 'Schedule, HSN, storage' },
                    { value: 'pricing', label: 'Pricing', desc: 'MRP, rates, GST' },
                    { value: 'stock', label: 'Stock Settings', desc: 'Min, max, location' },
                  ].map((t) => (
                    <button key={t.value} type="button" onClick={() => validateAndGoTo(t.value)}
                      className={cn('flex flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors',
                        activeTab === t.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}>
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className={cn('text-[11px] mt-0.5', activeTab === t.value ? 'text-primary-foreground/70' : 'text-muted-foreground/60')}>{t.desc}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* ── Content: only the active panel renders, scrolls independently ── */}
              <div className="flex-1 overflow-y-scroll flex! flex-col! justify-start! items-stretch!">

                {/* ── Basic Info ── */}
                {activeTab === 'basic' && (
                  <div className="p-6 pb-8 space-y-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Product Details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2 grid gap-2">
                          <Label htmlFor="name">Product Name <span className="text-rose-500">*</span></Label>
                          <Input id="name" placeholder="e.g. Torsemide 20mg Tab" {...form.register('name')} />
                          {form.formState.errors.name && <p className="text-xs text-rose-500">{form.formState.errors.name.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="genericName">Generic Name <span className="text-rose-500">*</span></Label>
                          <Input id="genericName" placeholder="e.g. Torsemide" {...form.register('genericName')} error={!!form.formState.errors.genericName} />
                          {form.formState.errors.genericName && <p className="text-xs text-rose-500">{form.formState.errors.genericName.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="manufacturer">Manufacturer <span className="text-rose-500">*</span></Label>
                          <div className="relative">
                            <Input id="manufacturer" list="manufacturer-list" placeholder="Select or type..." autoComplete="off" {...form.register('manufacturer')} error={!!form.formState.errors.manufacturer} />
                            <datalist id="manufacturer-list">{manufacturers.map(m => <option key={m} value={m} />)}</datalist>
                          </div>
                          {form.formState.errors.manufacturer && <p className="text-xs text-rose-500">{form.formState.errors.manufacturer.message}</p>}
                        </div>
                        <div className="sm:col-span-2 grid gap-2">
                          <Label htmlFor="saltComposition">Salt Composition</Label>
                          <Input id="saltComposition" placeholder="e.g. Paracetamol 500mg + Caffeine 65mg" {...form.register('saltComposition')} />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Classification</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="grid gap-2">
                          <Label>Category <span className="text-rose-500">*</span></Label>
                          <Controller control={form.control} name="categoryId" render={({ field }) => (
                            <CategorySearchDropdown categories={categories} value={field.value ?? ''} onChange={field.onChange} hasError={!!form.formState.errors.categoryId} />
                          )} />
                          {form.formState.errors.categoryId && <p className="text-xs text-rose-500">{form.formState.errors.categoryId.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="packSize">Pack Size <span className="text-rose-500">*</span></Label>
                          <Input id="packSize" placeholder="e.g. 10x10" {...form.register('packSize')} error={!!form.formState.errors.packSize} />
                          {form.formState.errors.packSize && <p className="text-xs text-rose-500">{form.formState.errors.packSize.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="unitOfMeasure">Unit of Measure <span className="text-rose-500">*</span></Label>
                          <Input id="unitOfMeasure" placeholder="e.g. Strip, Vial" {...form.register('unitOfMeasure')} error={!!form.formState.errors.unitOfMeasure} />
                          {form.formState.errors.unitOfMeasure && <p className="text-xs text-rose-500">{form.formState.errors.unitOfMeasure.message}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Regulatory ── */}
                {activeTab === 'regulatory' && (
                  <div className="p-6 pb-8 space-y-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Scheduling & Compliance</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Drug Schedule</Label>
                          <Controller control={form.control} name="schedule" render={({ field }) => (
                            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4 pt-1">
                              {(['NONE', 'H', 'H1', 'X'] as const).map(s => (
                                <div key={s} className="flex items-center gap-1.5">
                                  <RadioGroupItem value={s} id={`schedule-${s}`} />
                                  <Label htmlFor={`schedule-${s}`} className="cursor-pointer font-normal text-sm">{s === 'NONE' ? 'None' : s}</Label>
                                </div>
                              ))}
                            </RadioGroup>
                          )} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="hsnCode">HSN Code <span className="text-rose-500">*</span></Label>
                          <Input id="hsnCode" placeholder="e.g. 30049099" {...form.register('hsnCode')} error={!!form.formState.errors.hsnCode} />
                          {form.formState.errors.hsnCode && <p className="text-xs text-rose-500">{form.formState.errors.hsnCode.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label>Storage Condition</Label>
                          <Controller control={form.control} name="storageCondition" render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ROOM_TEMP">Room Temperature</SelectItem>
                                <SelectItem value="COOL_DRY">Cool & Dry</SelectItem>
                                <SelectItem value="REFRIGERATED">Refrigerated</SelectItem>
                                <SelectItem value="FROZEN">Frozen</SelectItem>
                              </SelectContent>
                            </Select>
                          )} />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                          <div>
                            <Label className="text-sm">Is Narcotic</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Narcotic substance</p>
                          </div>
                          <Controller control={form.control} name="isNarcotic" render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          )} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Pricing ── */}
                {activeTab === 'pricing' && (
                  <div className="p-6 pb-8 space-y-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Price Configuration</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="mrp">MRP (₹) <span className="text-rose-500">*</span></Label>
                          <Input id="mrp" type="number" step="0.01" {...form.register('mrp')} error={!!form.formState.errors.mrp} />
                          {form.formState.errors.mrp && <p className="text-xs text-rose-500">{form.formState.errors.mrp.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="purchaseRate">Purchase Rate (₹) <span className="text-rose-500">*</span></Label>
                          <Input id="purchaseRate" type="number" step="0.01" {...form.register('purchaseRate')} error={!!form.formState.errors.purchaseRate} />
                          {form.formState.errors.purchaseRate && <p className="text-xs text-rose-500">{form.formState.errors.purchaseRate.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="sellingRate">Selling Rate (₹)</Label>
                          <Input id="sellingRate" type="number" step="0.01" {...form.register('sellingRate')} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="wholesaleRate">Wholesale Rate (₹)</Label>
                          <Input id="wholesaleRate" type="number" step="0.01" {...form.register('wholesaleRate')} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
                        <span className="text-sm text-muted-foreground">Margin:</span>
                        <span className={cn('text-sm font-semibold', Number(margin) > 20 ? 'text-emerald-600 dark:text-emerald-400' : Number(margin) > 10 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{margin}%</span>
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Tax</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>GST Rate</Label>
                          <Controller control={form.control} name="gstRate" render={({ field }) => (
                            <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Stock Settings ── */}
                {activeTab === 'stock' && (
                  <div className="p-6 pb-8 space-y-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Stock Levels</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="minStock">Min Stock</Label>
                          <Input id="minStock" type="number" {...form.register('minStock')} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="maxStock">Max Stock</Label>
                          <Input id="maxStock" type="number" {...form.register('maxStock')} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="reorderQty">Reorder Qty</Label>
                          <Input id="reorderQty" type="number" {...form.register('reorderQty')} />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Location</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="rackLocation">Rack Location <span className="text-rose-500">*</span></Label>
                          <Input id="rackLocation" placeholder="e.g. A1-01" {...form.register('rackLocation')} error={!!form.formState.errors.rackLocation} />
                          {form.formState.errors.rackLocation && <p className="text-xs text-rose-500">{form.formState.errors.rackLocation.message}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>{/* end scrollable content */}
            </div>{/* end body flex */}

            {/* Footer */}
            {(() => {
              const errs = form.formState.errors
              const tabErrorMap: Record<string, boolean> = {
                basic: tabFields.basic.some(f => !!errs[f]),
                regulatory: tabFields.regulatory.some(f => !!errs[f]),
                pricing: tabFields.pricing.some(f => !!errs[f]),
                stock: tabFields.stock.some(f => !!errs[f]),
              }
              const tabs = ['basic', 'regulatory', 'pricing', 'stock']
              const labels = ['Basic', 'Regulatory', 'Pricing', 'Stock']
              const curIdx = tabs.indexOf(activeTab)

              const isTabTouched = (t: string) => {
                const hasVisited = visitedTabs.has(t)
                const isSubmitted = form.formState.isSubmitted
                if (!hasVisited && !isSubmitted) return false
                return tabFields[t].some(f => form.getFieldState(f).isTouched || form.getFieldState(f).invalid)
              }

              const handleNext = async () => {
                const result = await form.trigger(tabFields[activeTab])
                if (result) {
                  const next = tabs[curIdx + 1]
                  if (next) {
                    setVisitedTabs(prev => new Set([...prev, next]))
                    setActiveTab(next)
                  }
                }
              }

              return (
                <div className="flex items-center justify-between gap-3 border-t border-border/40 bg-background px-6 py-4 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs">
                    {tabs.map((t, i) => {
                      const isActive = activeTab === t
                      const touched = isTabTouched(t)
                      const hasError = tabErrorMap[t] && touched
                      const isPast = touched && !hasError && !isActive
                      const isFuture = !touched && !isActive
                      return (
                        <button key={t} type="button" onClick={() => validateAndGoTo(t)} className="flex items-center gap-1.5 group">
                          <span className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                            isActive ? 'bg-primary text-primary-foreground scale-110 shadow-sm'
                              : hasError ? 'bg-rose-500 text-white'
                              : isPast ? 'bg-emerald-500 text-white'
                              : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
                          )}>
                            {hasError ? '!' : isPast ? '✓' : i + 1}
                          </span>
                          <span className={cn(
                            'hidden sm:inline text-xs transition-colors',
                            isActive ? 'text-foreground font-medium!'
                              : hasError ? 'text-rose-500 font-medium!'
                              : isPast ? 'text-emerald-600 dark:text-emerald-400 font-medium!'
                              : isFuture ? 'text-muted-foreground/50 font-medium!'
                              : 'text-muted-foreground font-medium!'
                          )}>{labels[i]}</span>
                          {i < 3 && <span className="text-muted-foreground/30 hidden sm:inline mx-0.5">›</span>}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    {activeTab !== 'stock' && (
                      <Button type="button" variant="outline" onClick={handleNext}>Next →</Button>
                    )}
                    <Button type="submit">{editingProduct ? 'Save Changes' : 'Add Product'}</Button>
                  </div>
                </div>
              )
            })()}
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={open => { if (!open) { setImportFile(null); setImportResult(null) } setImportDialogOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Products</DialogTitle>
            <DialogDescription>Upload an Excel or CSV file to bulk-import products.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadTemplate}>
              <FileDown className="mr-1.5 h-4 w-4" /> Download CSV Template
            </Button>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Select File</Label>
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,.xls"
                className="block w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
                onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null) }}
              />
            </div>
            {importResult && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-semibold">Import complete</p>
                {importResult.createdCount !== undefined && <p className="text-green-600 dark:text-green-400">Created: {importResult.createdCount}</p>}
                {importResult.updatedCount !== undefined && <p className="text-emerald-600 dark:text-emerald-400">Updated: {importResult.updatedCount}</p>}
                <p className="text-muted-foreground">Skipped: {importResult.skippedCount}</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-destructive font-medium">Errors ({importResult.errors.length}):</p>
                    <ul className="mt-1 max-h-28 overflow-y-auto space-y-0.5 text-xs text-destructive">
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Close</Button>
            <Button onClick={handleImport} disabled={!importFile || importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
