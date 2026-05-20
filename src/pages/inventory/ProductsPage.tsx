import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
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
import { ImportProductsDrawer } from '@/components/products/ImportProductsDrawer'
import {
  exportProductsToWorkbook,
  type ProductExportPayload,
} from '@/lib/productImportTemplate'
import { useBranchStore } from '@/stores/branchStore'
import { useAuthStore } from '@/stores/authStore'
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
  // Legacy single-sheet Excel import dialog — kept for the Marg ERP HSN/SAC
  // and Marg product paths. The NEW multi-sheet preview+commit drawer below
  // is what the "Import" button now opens.
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ createdCount?: number; updatedCount?: number; skippedCount: number; errors: string[] } | null>(null)
  // New multi-sheet preview/commit drawer.
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)

  const PAGE_SIZE = 10
  const [paginatedProducts, setPaginatedProducts] = useState<Product[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  // Single scroll container for the Add/Edit drawer body. The header
  // progress indicator scrolls to a section by looking up its element here.
  const formScrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [activeSection, setActiveSection] = useState('basic')

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
      mrp: 0, purchaseRate: 0, sellingRate: 0, wholesaleRate: 0, gstRate: 5,
      minStock: 0, maxStock: 0, reorderQty: 0, rackLocation: '',
    },
  })

  const mrpVal = Number(form.watch('mrp')) || 0
  const purchaseRateVal = Number(form.watch('purchaseRate')) || 0
  const margin = mrpVal > 0 ? (((mrpVal - purchaseRateVal) / mrpVal) * 100).toFixed(1) : '0.0'

  // Fields per section — used for the header progress indicator (error
  // detection + "filled" check). Sections render together in one scroll,
  // so this is no longer a navigation gate, just a status map.
  const sectionFields: Record<string, (keyof ProductFormValues)[]> = {
    basic: ['name', 'genericName', 'manufacturer', 'categoryId', 'packSize', 'unitOfMeasure'],
    regulatory: ['hsnCode'],
    pricing: ['mrp', 'purchaseRate'],
    stock: ['rackLocation'],
  }

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id]
    const container = formScrollRef.current
    if (!el || !container) return
    container.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
    setActiveSection(id)
  }

  // Track which section the viewport is currently centered on, so the
  // header pill highlights as the user scrolls. Cheap scroll handler that
  // picks the section whose top is closest to (but not past) the top of
  // the scroll container.
  useEffect(() => {
    if (!dialogOpen) return
    const container = formScrollRef.current
    if (!container) return
    const onScroll = () => {
      const order = ['basic', 'regulatory', 'pricing', 'stock'] as const
      let current: string = order[0]
      for (const id of order) {
        const el = sectionRefs.current[id]
        if (!el) continue
        if (el.offsetTop - container.scrollTop <= 60) current = id
      }
      setActiveSection(prev => (prev === current ? prev : current))
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [dialogOpen])

  const openAddDialog = () => {
    setEditingProduct(null)
    form.reset({
      name: '', genericName: '', saltComposition: '', manufacturer: '',
      categoryId: '', packSize: '', unitOfMeasure: '', schedule: 'NONE',
      hsnCode: '', isNarcotic: false, storageCondition: 'ROOM_TEMP',
      mrp: 0, purchaseRate: 0, sellingRate: 0, wholesaleRate: 0, gstRate: 5,
      minStock: 0, maxStock: 0, reorderQty: 0, rackLocation: '',
    })
    setActiveSection('basic')
    setDialogOpen(true)
  }

  // Auto-open the Add Product dialog when the page is arrived at with
  // `?add=1` (used by the lead detail "Add Product" quick action). Only
  // fires once on mount and then strips the query param so a refresh
  // doesn't keep re-triggering the dialog.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') === '1') {
      openAddDialog()
      params.delete('add')
      const qs = params.toString()
      window.history.replaceState(
        null,
        '',
        `/inventory/products${qs ? `?${qs}` : ''}`,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setActiveSection('basic')
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

  // Round-trip-compatible Excel export. Pulls the full product + category
  // tree from /products/export so the workbook matches the import template
  // and can be edited + re-uploaded.
  const handleExportExcel = async () => {
    try {
      const res = await api.get('/products/export')
      const data = res.data as ProductExportPayload
      const activeBranch = useBranchStore.getState().activeBranch
      const user = useAuthStore.getState().user
      exportProductsToWorkbook(data, {
        branchName: activeBranch?.name ?? null,
        exportedBy: user?.name ?? user?.email ?? null,
        exportedAt: new Date().toISOString(),
        schemaVersion: '1.0',
      })
      toast.success(
        `Exported ${data.products.length} product${data.products.length === 1 ? '' : 's'} (${data.categories.length} categories).`,
      )
    } catch {
      toast.error('Failed to export products')
    }
  }

  // CSV / PDF exports fetch the full matching set (was previously a bug —
  // only the current page was exported, which is destructive for filtered
  // exports). Returns a flat array for simple non-round-trip use.
  const fetchAllProductsForExport = async () => {
    const res = await api.get('/products/export')
    const data = res.data as ProductExportPayload
    return data.products
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
              onClick={() => setImportDrawerOpen(true)}
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
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as Excel (round-trip)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  // Fetches all matching products (not just the current page)
                  // — fixes the prior bug where filtered/paged exports lost rows.
                  const all = await fetchAllProductsForExport()
                  const rows = all.map(p => ({
                    Name: p.name, Generic: p.genericName ?? '',
                    Category: p.category?.name ?? '',
                    MRP: p.mrp, Rate: p.purchaseRate, Stock: p.totalStock,
                    HSN: p.hsnCode ?? '', GST: p.gstRate,
                  }))
                  exportToCsv(rows, 'products')
                }}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV (flat)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  const all = await fetchAllProductsForExport()
                  const rows = all.map(p => ({
                    Name: p.name, Generic: p.genericName ?? '',
                    Category: p.category?.name ?? '',
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

      {/* Add/Edit Drawer — slides in from the right */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent
          side="right"
          className="p-0 gap-0 w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl flex flex-col h-dvh overflow-hidden"
        >

          {/* Header — title on the left, section progress indicator pinned
              to the right end of the same row. Indicator pills double as
              quick-jump anchors that scroll to the matching section below. */}
          <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
            <div className="flex items-center gap-4 pr-8">
              <div className="min-w-0 flex-1 space-y-1">
                <SheetTitle className="text-lg">{editingProduct ? 'Edit Product' : 'Add New Product'}</SheetTitle>
                <SheetDescription className="text-sm">
                  {editingProduct ? 'Update the product details below.' : 'Fill in the product details across all sections.'}
                </SheetDescription>
              </div>
              {(() => {
                const sections = [
                  { value: 'basic', label: 'Basic Info' },
                  { value: 'regulatory', label: 'Regulatory' },
                  { value: 'pricing', label: 'Pricing' },
                  { value: 'stock', label: 'Stock' },
                ]
                const errs = form.formState.errors
                const isSubmitted = form.formState.isSubmitted
                return (
                  <div className="hidden md:flex shrink-0 items-center gap-1.5 max-w-full overflow-x-auto">
                    {sections.map((s, i) => {
                      const fields = sectionFields[s.value]
                      const sectionHasError = fields.some(f => !!errs[f])
                      const sectionFilled = fields.every(f => {
                        const v = form.getValues(f)
                        return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && v === 0 && (f === 'mrp' || f === 'purchaseRate'))
                      })
                      const isActive = activeSection === s.value
                      const showError = sectionHasError && isSubmitted
                      const isComplete = sectionFilled && !sectionHasError
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => scrollToSection(s.value)}
                          className="flex items-center gap-1.5 group shrink-0"
                        >
                          <span className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                            isActive ? 'bg-primary text-primary-foreground shadow-sm'
                              : showError ? 'bg-rose-500 text-white'
                              : isComplete ? 'bg-emerald-500 text-white'
                              : 'bg-muted text-muted-foreground group-hover:bg-muted/80',
                          )}>
                            {showError ? '!' : isComplete ? '✓' : i + 1}
                          </span>
                          <span className={cn(
                            'text-xs transition-colors',
                            isActive ? 'text-foreground font-semibold'
                              : showError ? 'text-rose-500 font-medium'
                              : isComplete ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : 'text-muted-foreground font-medium',
                          )}>{s.label}</span>
                          {i < sections.length - 1 && (
                            <span className="text-muted-foreground/30 mx-0.5">›</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
            {/* Compact stepper for narrow screens — header is too tight for
                pills + title on the same row below md. */}
            {(() => {
              const sections = [
                { value: 'basic', label: 'Basic' },
                { value: 'regulatory', label: 'Regulatory' },
                { value: 'pricing', label: 'Pricing' },
                { value: 'stock', label: 'Stock' },
              ]
              const errs = form.formState.errors
              const isSubmitted = form.formState.isSubmitted
              return (
                <div className="md:hidden mt-3 flex items-center gap-1.5 overflow-x-auto">
                  {sections.map((s, i) => {
                    const fields = sectionFields[s.value]
                    const sectionHasError = fields.some(f => !!errs[f])
                    const sectionFilled = fields.every(f => {
                      const v = form.getValues(f)
                      return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && v === 0 && (f === 'mrp' || f === 'purchaseRate'))
                    })
                    const isActive = activeSection === s.value
                    const showError = sectionHasError && isSubmitted
                    const isComplete = sectionFilled && !sectionHasError
                    return (
                      <button key={s.value} type="button" onClick={() => scrollToSection(s.value)}
                        className="flex items-center gap-1.5 group shrink-0">
                        <span className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                          isActive ? 'bg-primary text-primary-foreground shadow-sm'
                            : showError ? 'bg-rose-500 text-white'
                            : isComplete ? 'bg-emerald-500 text-white'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {showError ? '!' : isComplete ? '✓' : i + 1}
                        </span>
                        <span className={cn('text-xs', isActive ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{s.label}</span>
                        {i < sections.length - 1 && <span className="text-muted-foreground/30 mx-0.5">›</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex! flex-col! flex-1 min-h-0 justify-start!">

            {/* Body — one scroll container, every section rendered in DOM order.
                Each section is wrapped in a div with a ref so the header pills
                can scrollIntoView() them. */}
            <div
              ref={formScrollRef}
              className="flex-1 min-h-0 overflow-y-auto"
            >
                {/* ── Basic Info ── */}
                <div ref={(el) => { sectionRefs.current.basic = el }} className="scroll-mt-2">
                  <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                    <h3 className="text-sm font-semibold">Basic Info</h3>
                  </div>
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
                </div>

                {/* ── Regulatory ── */}
                <div ref={(el) => { sectionRefs.current.regulatory = el }} className="scroll-mt-2 border-t border-border/40">
                  <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                    <h3 className="text-sm font-semibold">Regulatory</h3>
                  </div>
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
                </div>

                {/* ── Pricing ── */}
                <div ref={(el) => { sectionRefs.current.pricing = el }} className="scroll-mt-2 border-t border-border/40">
                  <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                    <h3 className="text-sm font-semibold">Pricing</h3>
                  </div>
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
                </div>

                {/* ── Stock Settings ── */}
                <div ref={(el) => { sectionRefs.current.stock = el }} className="scroll-mt-2 border-t border-border/40">
                  <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                    <h3 className="text-sm font-semibold">Stock Settings</h3>
                  </div>
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
                </div>

            </div>{/* end scrollable form body */}

            {/* Footer — Cancel + Submit only. The section progress indicator
                now lives in the header, and all sections render in a single
                scroll, so there is no "Next" navigation. */}
            <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 shrink-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingProduct ? 'Save Changes' : 'Add Product'}</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

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

      {/* ─── Product Import Drawer (multi-sheet preview + commit) ─── */}
      <ImportProductsDrawer
        open={importDrawerOpen}
        onOpenChange={setImportDrawerOpen}
        onImported={refreshPage}
      />
    </motion.div>
  )
}
