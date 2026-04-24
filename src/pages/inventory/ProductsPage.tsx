import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Upload, Download,
  ChevronLeft, ChevronRight, FileDown, FileSpreadsheet,
  Package, AlertTriangle, Layers, TrendingUp, TrendingDown, Search,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { exportToCsv, exportToPdf } from '@/lib/exportUtils'
import type { Product, Category } from '@/types'

// ─── Zod schema ───────────────────────────────────────────────
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  genericName: z.string().optional().default(''),
  saltComposition: z.string().optional().default(''),
  manufacturer: z.string().optional().default(''),
  categoryId: z.string().optional().default(''),
  packSize: z.string().optional().default(''),
  unitOfMeasure: z.string().optional().default(''),
  schedule: z.enum(['NONE', 'H', 'H1', 'X']),
  hsnCode: z.string().optional().default(''),
  isNarcotic: z.boolean().default(false),
  storageCondition: z.enum(['ROOM_TEMP', 'COOL_DRY', 'REFRIGERATED', 'FROZEN']),
  mrp: z.coerce.number().min(0, 'MRP must be >= 0'),
  purchaseRate: z.coerce.number().min(0),
  sellingRate: z.coerce.number().min(0),
  wholesaleRate: z.coerce.number().min(0),
  gstRate: z.coerce.number(),
  minStock: z.coerce.number().min(0).default(0),
  maxStock: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  rackLocation: z.string().optional().default(''),
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
  placeholder = 'Select category...',
}: {
  categories: Category[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(q.toLowerCase())
  )
  const selected = categories.find(c => c.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={() => setOpen(o => !o)}
      >
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected ? (
            <span className="flex items-center gap-2">
              {selected.color && <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: selected.color }} />}
              {selected.name}
            </span>
          ) : placeholder}
        </span>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="h-8 w-full rounded border border-input bg-background pl-7 pr-2 text-sm outline-none"
                placeholder="Search categories..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            <button
              type="button"
              className="w-full rounded px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
              onClick={() => { onChange(''); setOpen(false); setQ('') }}
            >
              — No category
            </button>
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm hover:bg-accent ${value === c.id ? 'bg-accent font-medium' : ''}`}
                onClick={() => { onChange(c.id); setOpen(false); setQ('') }}
              >
                {c.color && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
                {c.name}
                {c._count?.products !== undefined && (
                  <span className="ml-auto text-xs text-muted-foreground">{c._count.products}</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No categories found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function ProductsPage() {
  const products = useMasterDataStore(s => s.products)
  const suppliers = useMasterDataStore(s => s.suppliers)
  const fetchProducts = useMasterDataStore(s => s.fetchProducts)
  const fetchSuppliers = useMasterDataStore(s => s.fetchSuppliers)
  const isLoading = useMasterDataStore(s => s.isLoading)

  const [categories, setCategories] = useState<Category[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
    api.get('/categories').then(r => setCategories(r.data)).catch(() => {})
  }, [])

  const manufacturers = useMemo(() => {
    const fromSuppliers = suppliers.map(s => s.name)
    const fromProducts = products.map(p => p.manufacturer)
    return [...new Set([...fromSuppliers, ...fromProducts])].sort()
  }, [products, suppliers])

  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedSchedule, setSelectedSchedule] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [activeTab, setActiveTab] = useState('basic')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const PAGE_SIZE = 10
  const [paginatedProducts, setPaginatedProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshPage = useCallback(() => setRefreshKey(k => k + 1), [])
  useBranchRefresh(refreshPage)

  useEffect(() => {
    let isSubscribed = true
    const fetchData = async () => {
      try {
        const res = await api.get('/products', {
          params: {
            q: search || undefined,
            categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
            schedule: selectedSchedule !== 'all' ? selectedSchedule : undefined,
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
  }, [search, selectedCategoryId, selectedSchedule, currentPage, refreshKey])

  const summaryStats = useMemo(() => {
    const total = totalCount
    const lowStock = products.filter(p => p.totalStock > 0 && p.totalStock < p.minStock).length
    const outOfStock = products.filter(p => p.totalStock === 0).length
    return { total, lowStock, outOfStock, categories: categories.length }
  }, [totalCount, products, categories])

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

  const openAddDialog = () => {
    setEditingProduct(null)
    form.reset({
      name: '', genericName: '', saltComposition: '', manufacturer: '',
      categoryId: '', packSize: '', unitOfMeasure: '', schedule: 'NONE',
      hsnCode: '', isNarcotic: false, storageCondition: 'ROOM_TEMP',
      mrp: 0, purchaseRate: 0, sellingRate: 0, wholesaleRate: 0, gstRate: 12,
      minStock: 0, maxStock: 0, reorderQty: 0, rackLocation: '',
    })
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
      fetchProducts()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Operation failed')
    }
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) return
    try {
      await api.delete(`/products/${product.id}`)
      toast.success(`Product "${product.name}" deleted`)
      refreshPage()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete product')
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
    if (!importFile) { toast.error('Please select a CSV file'); return }
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await api.post('/products/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResult(res.data)
      if (res.data.created > 0) { refreshPage(); toast.success(`Imported ${res.data.created} product(s)`) }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import failed')
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
      className="space-y-6"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Product & drug master list</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setImportFile(null); setImportResult(null); setImportDialogOpen(true) }}>
            <Upload className="mr-1.5 h-4 w-4" /> Import
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" /> Export
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
          <Button onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold">{summaryStats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/15">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Low Stock</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summaryStats.lowStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 dark:bg-rose-500/15">
              <Package className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Out of Stock</p>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{summaryStats.outOfStock}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/15">
              <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categories</p>
              <p className="text-2xl font-bold">{summaryStats.categories}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={val => { setSearch(val); setCurrentPage(1) }}
        searchPlaceholder="Search products by name, generic, manufacturer..."
        resultsCount={totalCount}
        activeFilterCount={(selectedCategoryId !== 'all' ? 1 : 0) + (selectedSchedule !== 'all' ? 1 : 0)}
        onClearFilters={() => { setSelectedCategoryId('all'); setSelectedSchedule('all'); setCurrentPage(1) }}
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
      </DataTableFilterBar>

      {/* Table */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
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
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: `${cat.color ?? '#6366F1'}20`, color: cat.color ?? '#6366F1' }}>
                            {cat.name}
                          </span>
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
                      isOutOfStock && 'bg-rose-50/60 dark:bg-rose-950/20',
                      isLowStock && 'bg-amber-50/60 dark:bg-amber-950/20'
                    )}
                    onClick={() => { navigate(`/inventory/product-history?productId=${product.id}`) }}
                  >
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.genericName}</TableCell>
                    <TableCell className="text-muted-foreground">{product.manufacturer}</TableCell>
                    <TableCell>
                      {cat && (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `${cat.color ?? '#6366F1'}20`, color: cat.color ?? '#6366F1' }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color ?? '#6366F1' }} />
                          {cat.name}
                        </span>
                      )}
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
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col items-center gap-2 border-t border-border/40 px-4 py-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            {' - '}{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} products
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update the product details below.' : 'Fill in the product details to add a new product.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="stock">Stock Settings</TabsTrigger>
              </TabsList>

              {/* Tab 1 - Basic Info */}
              <TabsContent value="basic" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product Details</p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Product Name <span className="text-rose-500">*</span></Label>
                    <Input id="name" placeholder="e.g. Torsemide 20mg Tab" {...form.register('name')} />
                    {form.formState.errors.name && (
                      <p className="text-xs text-rose-500">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="genericName">Generic Name</Label>
                    <Input id="genericName" placeholder="e.g. Torsemide" {...form.register('genericName')} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="saltComposition">Salt Composition</Label>
                    <Input id="saltComposition" placeholder="e.g. Paracetamol 500mg + Caffeine 65mg" {...form.register('saltComposition')} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <div className="relative">
                      <Input
                        id="manufacturer"
                        list="manufacturer-list"
                        placeholder="Select or type manufacturer..."
                        autoComplete="off"
                        {...form.register('manufacturer')}
                      />
                      <datalist id="manufacturer-list">
                        {manufacturers.map(m => <option key={m} value={m} />)}
                      </datalist>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>

                <div className="grid gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Controller
                        control={form.control}
                        name="categoryId"
                        render={({ field }) => (
                          <CategorySearchDropdown
                            categories={categories}
                            value={field.value ?? ''}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="packSize">Pack Size</Label>
                      <Input id="packSize" placeholder="e.g. 10x10" {...form.register('packSize')} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                    <Input id="unitOfMeasure" placeholder="e.g. Strip, Vial, Syringe" {...form.register('unitOfMeasure')} />
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2 - Regulatory */}
              <TabsContent value="regulatory" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scheduling & Compliance</p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Schedule</Label>
                    <Controller
                      control={form.control}
                      name="schedule"
                      render={({ field }) => (
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                          {(['NONE', 'H', 'H1', 'X'] as const).map(s => (
                            <div key={s} className="flex items-center gap-2">
                              <RadioGroupItem value={s} id={`schedule-${s}`} />
                              <Label htmlFor={`schedule-${s}`} className="cursor-pointer font-normal">
                                {s === 'NONE' ? 'None' : s}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="hsnCode">HSN Code</Label>
                    <Input id="hsnCode" placeholder="e.g. 30049099" {...form.register('hsnCode')} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/60 p-4">
                    <div>
                      <Label>Is Narcotic</Label>
                      <p className="text-xs text-muted-foreground">Mark if this product is a narcotic substance</p>
                    </div>
                    <Controller
                      control={form.control}
                      name="isNarcotic"
                      render={({ field }) => (
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                  </div>
                </div>

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Storage</p>
                <div className="grid gap-2">
                  <Label>Storage Condition</Label>
                  <Controller
                    control={form.control}
                    name="storageCondition"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ROOM_TEMP">Room Temperature</SelectItem>
                          <SelectItem value="COOL_DRY">Cool & Dry</SelectItem>
                          <SelectItem value="REFRIGERATED">Refrigerated</SelectItem>
                          <SelectItem value="FROZEN">Frozen</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Tab 3 - Pricing */}
              <TabsContent value="pricing" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price Configuration</p>
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="mrp">MRP</Label>
                      <Input id="mrp" type="number" step="0.01" {...form.register('mrp')} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="purchaseRate">Purchase Rate</Label>
                      <Input id="purchaseRate" type="number" step="0.01" {...form.register('purchaseRate')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="sellingRate">Selling Rate</Label>
                      <Input id="sellingRate" type="number" step="0.01" {...form.register('sellingRate')} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="wholesaleRate">Wholesale Rate</Label>
                      <Input id="wholesaleRate" type="number" step="0.01" {...form.register('wholesaleRate')} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Margin: <span className={cn('font-semibold', Number(margin) > 20 ? 'text-emerald-600 dark:text-emerald-400' : Number(margin) > 10 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
                        {margin}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tax</p>
                <div className="grid gap-2">
                  <Label>GST Rate</Label>
                  <Controller
                    control={form.control}
                    name="gstRate"
                    render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="5">5%</SelectItem>
                          <SelectItem value="12">12%</SelectItem>
                          <SelectItem value="18">18%</SelectItem>
                          <SelectItem value="28">28%</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Tab 4 - Stock Settings */}
              <TabsContent value="stock" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock Levels</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Location</p>
                <div className="grid gap-2">
                  <Label htmlFor="rackLocation">Rack Location</Label>
                  <Input id="rackLocation" placeholder="e.g. A1-01" {...form.register('rackLocation')} />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6 gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingProduct ? 'Save Changes' : 'Add Product'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={open => { if (!open) { setImportFile(null); setImportResult(null) } setImportDialogOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Products from CSV</DialogTitle>
            <DialogDescription>Upload a CSV file to bulk-import products.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadTemplate}>
              <FileDown className="mr-1.5 h-4 w-4" /> Download CSV Template
            </Button>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Select CSV File</Label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
                onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null) }}
              />
            </div>
            {importResult && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-semibold">Import complete</p>
                <p className="text-green-600 dark:text-green-400">Created: {importResult.created}</p>
                <p className="text-muted-foreground">Skipped: {importResult.skipped}</p>
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
