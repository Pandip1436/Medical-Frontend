import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Upload, Download,
  FileDown, FileSpreadsheet,
  Package, AlertTriangle, Layers, PowerOff, Power,
  Filter, BarChart3, X, ChevronDown, Printer,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
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
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import api from '@/lib/api'
import { usePageFilter } from '@/hooks/usePageFilter'
import { useFilterPrefsStore } from '@/stores/useFilterPrefsStore'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate, useRoute } from '@/lib/router'
import { exportToCsv, exportToPdf, printReport, csvText } from '@/lib/exportUtils'
import { importFromExcel } from '@/lib/excelUtils'
import { ImportProductsDrawer } from '@/components/products/ImportProductsDrawer'
import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { ProductSplitView } from './components/ProductSplitView'
import {
  exportProductsToWorkbook,
  type ProductExportPayload,
} from '@/lib/productImportTemplate'
import { useBranchStore } from '@/stores/branchStore'
import { useAuthStore } from '@/stores/authStore'
import type { Product, Category } from '@/types'
import {
  productSchema,
  productFormDefaults,
  type ProductFormValues,
} from '@/components/products/productFormSchema'
import { CategorySearchDropdown } from '@/components/products/CategorySearchDropdown'
import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/unitOfMeasureOptions'

// ─── Main Page ─────────────────────────────────────────────────
const PRODUCT_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', required: true, defaultVisible: true },
  { id: 'generic', label: 'Generic', defaultVisible: true },
  { id: 'manufacturer', label: 'Manufacturer', defaultVisible: true },
  { id: 'category', label: 'Category', defaultVisible: true },
  { id: 'mrp', label: 'MRP', defaultVisible: true },
  { id: 'purchaseRate', label: 'Purchase Rate', defaultVisible: true },
  { id: 'stock', label: 'Stock', defaultVisible: true },
  { id: 'minStock', label: 'Min Stock', defaultVisible: true },
  { id: 'rack', label: 'Rack', defaultVisible: true },
]

const CARD_FIELDS: ColumnDef[] = [
  { id: 'name', label: 'Product Name', required: true, defaultVisible: true },
  { id: 'mrp', label: 'MRP', defaultVisible: true },
  { id: 'generic', label: 'Generic Name', defaultVisible: true },
  { id: 'category', label: 'Category / Manufacturer', defaultVisible: true },
  { id: 'stock', label: 'Stock Level', defaultVisible: true },
]

type StockTabKey = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'


const STOCK_TABS: Array<{ key: StockTabKey; label: string; activeColor: string; badgeColor: string }> = [
  { key: 'all',         label: 'All',          activeColor: 'border-primary text-primary',                                       badgeColor: 'bg-primary/10 text-primary' },
  { key: 'in_stock',    label: 'In Stock',     activeColor: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',         badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'low_stock',   label: 'Low Stock',    activeColor: 'border-amber-500 text-amber-600 dark:text-amber-400',               badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'out_of_stock', label: 'Out of Stock', activeColor: 'border-rose-500 text-rose-600 dark:text-rose-400',                badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
]

function StockStatusTabs({ tab, onChange, counts }: {
  tab: StockTabKey
  onChange: (t: StockTabKey) => void
  counts: Record<StockTabKey, number>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto px-3 pb-2 pt-1">
      {STOCK_TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
            tab === t.key
              ? `border-b-2 bg-muted/20 ${t.activeColor}`
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
          <span className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            tab === t.key ? t.badgeColor : 'bg-muted text-muted-foreground'
          )}>
            {counts[t.key]}
          </span>
        </button>
      ))}
    </div>
  )
}

export default function ProductsPage() {
  const cols = useColumnVisibility('inventory.products', PRODUCT_COLUMNS)
  const cardCols = useColumnVisibility('inventory.products.card', CARD_FIELDS)
  const suppliers = useMasterDataStore(s => s.suppliers)
  const fetchSuppliers = useMasterDataStore(s => s.fetchSuppliers)
  const importProducts = useMasterDataStore(s => s.importProducts)
  const importProductsHsn = useMasterDataStore(s => s.importProductsHsn)
  const isLoading = useMasterDataStore(s => s.isLoading)

  const [categories, setCategories] = useState<Category[]>([])
  const [stockSummary, setStockSummary] = useState<{ lowStock: number; outOfStock: number; total: number } | null>(null)

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
        // Unfiltered catalog total — the paginated fetch's `total` now reflects
        // the active stock filter, so the tab counts must use this instead.
        total: r.data?.totalProducts ?? 0,
      }))
      .catch(() => {})
  }, [])

  const [search, setSearch] = usePageFilter<string>('inventory.products', 'search', '')
  const [selectedCategoryId, setSelectedCategoryId] = usePageFilter<string>('inventory.products', 'category', 'all')
  const [selectedSchedule, setSelectedSchedule] = usePageFilter<string>('inventory.products', 'schedule', 'all')
  const [selectedStatus, setSelectedStatus] = usePageFilter<string>('inventory.products', 'status', 'all')
  const [splitShowStats, setSplitShowStats] = usePageFilter<boolean>('inventory.products', 'splitShowStats', true)
  const [stockTab, setStockTab] = usePageFilter<StockTabKey>('inventory.products', 'stockTab', 'all')
  const [splitShowFilters, setSplitShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const loadFilterPrefs = useFilterPrefsStore((s) => s.loadFromServer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFilterPrefs() }, [])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  // Product pending deletion — drives the premium confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  // Legacy single-sheet Excel import dialog — kept for the Marg ERP HSN/SAC
  // and Marg product paths. The NEW multi-sheet preview+commit drawer below
  // is what the "Import" button now opens.
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ createdCount?: number; updatedCount?: number; skippedCount: number; errors: string[] } | null>(null)
  // New multi-sheet preview/commit drawer.
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)

  // When the edit drawer was opened from the split view (?fromSplit=1), remember
  // the product id so closing the drawer returns to that product's split page
  // instead of leaving the user on the table view.
  const [returnToSplitId, setReturnToSplitId] = useState<string | null>(null)

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

  // ── Split-view URL-driven state ──────────────────────────────
  const { search: routeSearch } = useRoute()
  const urlParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch])
  // Split is the default. Pass ?view=table to switch to table mode.
  const effectiveView = urlParams.get('view') === 'table' ? 'table' : 'split'
  const selectedProductId = urlParams.get('productId')

  const selectProduct = useCallback((id: string) => {
    if (window.location.pathname !== '/inventory/products') return
    const p = new URLSearchParams()
    if (id) p.set('productId', id)
    navigate(`/inventory/products?${p.toString()}`)
  }, [])

  const exitSplitView = useCallback(() => navigate('/inventory/products?view=table'), [])

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
            stockFilter: stockTab !== 'all' ? stockTab : undefined,
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
  }, [search, selectedCategoryId, selectedSchedule, selectedStatus, stockTab, currentPage, refreshKey])

  // Manufacturer datalist: suppliers + whatever manufacturers appear on the
  // current page of products. Good-enough autocomplete without needing a
  // full-catalogue load.
  const manufacturers = useMemo(() => {
    const fromSuppliers = suppliers.map(s => s.name)
    const fromProducts = paginatedProducts.map(p => p.manufacturer)
    return [...new Set([...fromSuppliers, ...fromProducts])].sort()
  }, [suppliers, paginatedProducts])

  // Unfiltered catalog total. Prefer the dashboard summary; fall back to the
  // paginated total only before it loads (correct while the 'all' tab is active).
  const catalogTotal = stockSummary?.total ?? totalCount

  const summaryStats = useMemo(() => ({
    total: catalogTotal,
    lowStock: stockSummary?.lowStock ?? 0,
    outOfStock: stockSummary?.outOfStock ?? 0,
    categories: categories.length,
  }), [catalogTotal, stockSummary, categories])

  const tabCounts = useMemo(() => {
    const outOfStock = stockSummary?.outOfStock ?? 0
    const lowStock = stockSummary?.lowStock ?? 0
    return {
      all: catalogTotal,
      in_stock: Math.max(0, catalogTotal - lowStock - outOfStock),
      low_stock: lowStock,
      out_of_stock: outOfStock,
    } satisfies Record<StockTabKey, number>
  }, [catalogTotal, stockSummary])

  const tabFilteredProducts = useMemo(() => {
    if (stockTab === 'all') return paginatedProducts
    return paginatedProducts.filter(p => {
      const stock = p.totalStock || 0
      if (stockTab === 'out_of_stock') return stock <= 0
      if (stockTab === 'low_stock') {
        const min = p.minStock ?? 0
        return stock > 0 && min > 0 && stock < min
      }
      // in_stock: any positive stock (aligned with backend definition)
      return stock > 0
    })
  }, [paginatedProducts, stockTab])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  // Form
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: productFormDefaults,
    // Validate on blur so the Selling Price ≤ MRP refine surfaces as soon
    // as the user leaves the offending field — not silent until Save.
    mode: 'onBlur',
  })

  // Margin reflects actual profit on a sale, so it's based on the SELLING
  // price (what the pharmacy receives) minus the purchase cost — not MRP,
  // which is only the legal ceiling. Using MRP would show a healthy margin
  // even when selling below cost. Negative margin → the sale loses money.
  const sellingRateVal = Number(form.watch('sellingRate')) || 0
  const purchaseRateVal = Number(form.watch('purchaseRate')) || 0
  const margin = sellingRateVal > 0 ? (((sellingRateVal - purchaseRateVal) / sellingRateVal) * 100).toFixed(1) : '0.0'

  // Fields per section — used for the header progress indicator (error
  // detection + "filled" check). Sections render together in one scroll,
  // so this is no longer a navigation gate, just a status map.
  // Only the required-field set per section — drives the "complete"
  // checkmark in the section pill. Optional fields don't count toward
  // completeness (they're nice-to-have, not blocking the form).
  const sectionFields: Record<string, (keyof ProductFormValues)[]> = {
    basic: ['name', 'genericName', 'manufacturer'],
    regulatory: ['hsnCode'],
    pricing: ['mrp', 'sellingRate'],
    stock: ['minStock'],
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
    form.reset(productFormDefaults)
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
      manufacturer: product.manufacturer,
      categoryId: catId,
      packSize: product.packSize ?? '',
      unitOfMeasure: product.unitOfMeasure ?? '',
      schedule: product.schedule as ProductFormValues['schedule'],
      hsnCode: product.hsnCode,
      mrp: product.mrp,
      purchaseRate: product.purchaseRate ?? 0,
      sellingRate: product.sellingRate,
      wholesaleRate: product.wholesaleRate ?? 0,
      gstRate: product.gstRate,
      minStock: product.minStock,
      maxStock: product.maxStock ?? 0,
      reorderQty: product.reorderQty ?? 0,
      rackLocation: product.rackLocation ?? '',
    } as ProductFormValues)
    setActiveSection('basic')
    setDialogOpen(true)
  }

  // Auto-open the Edit Product dialog when arrived at with `?editId=<id>`
  // (used by the Product History page's "Edit Product" action). Fetches the
  // product fresh so it works regardless of the current paginated page, then
  // strips the param so a refresh doesn't re-trigger it.
  useEffect(() => {
    const editId = urlParams.get('editId')
    if (!editId) return
    // Opened from the split view → `fromSplit` holds the product id to return
    // to when the drawer closes.
    const fromSplit = urlParams.get('fromSplit')
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/products/${editId}`)
        if (!cancelled && res.data) {
          openEditDialog(res.data)
          if (fromSplit) setReturnToSplitId(fromSplit)
        }
      } catch {
        if (!cancelled) toast.error('Could not load that product to edit')
      } finally {
        // Strip editId (+ fromSplit) ONLY on the live run. Doing it
        // unconditionally lets a StrictMode-cancelled first run strip the param
        // (and re-run, cancelling the second run) before the dialog ever opens —
        // so in dev it never opened. routeSearch stays in sync (router navigate,
        // not replaceState) so a refresh won't re-trigger it.
        if (!cancelled) {
          const params = new URLSearchParams(routeSearch)
          params.delete('editId')
          params.delete('fromSplit')
          const qs = params.toString()
          navigate(`/inventory/products${qs ? `?${qs}` : ''}`, { replace: true })
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch])

  // If a drawer (edit / add / import) was opened from the split view, return to
  // that product's split page once it closes.
  const returnToSplitIfNeeded = useCallback(() => {
    if (returnToSplitId) {
      const id = returnToSplitId
      setReturnToSplitId(null)
      navigate(`/inventory/products?productId=${id}`)
    }
  }, [returnToSplitId])

  // Close the edit/add drawer via all exit paths (X/overlay, Cancel, Save).
  const closeEditDialog = useCallback(() => {
    setDialogOpen(false)
    returnToSplitIfNeeded()
  }, [returnToSplitIfNeeded])

  // Open the Add Product drawer or Import drawer when arrived at with
  // `?action=add` / `?action=import`. The split view can't render these dialogs
  // (they live in the table render path), so its Add/Import buttons route here
  // with view=table. Synchronous (no fetch) so there's no StrictMode race.
  useEffect(() => {
    const action = urlParams.get('action')
    if (action !== 'add' && action !== 'import') return
    if (action === 'add') openAddDialog()
    else setImportDrawerOpen(true)
    // fromSplit holds the product id to return to when the drawer closes.
    const fromSplit = urlParams.get('fromSplit')
    if (fromSplit) setReturnToSplitId(fromSplit)
    const params = new URLSearchParams(routeSearch)
    params.delete('action')
    params.delete('fromSplit')
    const qs = params.toString()
    navigate(`/inventory/products${qs ? `?${qs}` : ''}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch])

  const onSubmit = async (values: ProductFormValues) => {
    const payload = {
      ...values,
      schedule: values.schedule.toUpperCase(),
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
      setCurrentPage(1)
      refreshPage()
      closeEditDialog()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Operation failed')
    }
  }

  // Row "Delete" opens a premium confirm dialog rather than the native
  // window.confirm(). The actual delete runs in confirmDelete() on confirm.
  const handleDelete = (product: Product) => setDeleteTarget(product)

  const confirmDelete = async () => {
    const product = deleteTarget
    if (!product) return
    try {
      await api.delete(`/products/${product.id}`)
      toast.success(`Product "${product.name}" deleted`)
      setDeleteTarget(null)
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

  const activeFilterCount = (selectedCategoryId !== 'all' ? 1 : 0) + (selectedSchedule !== 'all' ? 1 : 0) + (selectedStatus !== 'all' ? 1 : 0) + (stockTab !== 'all' ? 1 : 0)
  const clearFilters = () => { setSelectedCategoryId('all'); setSelectedSchedule('all'); setSelectedStatus('all'); setStockTab('all'); setCurrentPage(1) }

  const SCHEDULE_OPTIONS = [
    { value: 'all', label: 'All Schedules' },
    { value: 'H', label: 'Schedule H' },
    { value: 'H1', label: 'Schedule H1' },
    { value: 'X', label: 'Schedule X' },
    { value: 'G', label: 'Schedule G' },
    { value: 'NONE', label: 'None' },
  ] as const

  const STATUS_OPTIONS = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ] as const

  // ── Split-view early return ──────────────────────────────────
  if (effectiveView === 'split') {
    const splitExportMenu = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-1.5">
          <DropdownMenuItem
            className="gap-3 rounded-md py-2 cursor-pointer focus:bg-emerald-500/10"
            onClick={handleExportExcel}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold">Excel</span>
              <span className="text-[11px] text-muted-foreground">Round-trip import workbook</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {/* Collapsible stats */}
        <AnimatePresence>
          {splitShowStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Total Products', value: summaryStats.total, subtitle: 'in catalog', icon: Package, iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', borderAccent: 'border-l-blue-500' },
                  { label: 'Low Stock', value: summaryStats.lowStock, subtitle: 'below min level', icon: AlertTriangle, iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', borderAccent: 'border-l-amber-500' },
                  { label: 'Out of Stock', value: summaryStats.outOfStock, subtitle: 'zero stock', icon: Package, iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', borderAccent: 'border-l-rose-500' },
                  { label: 'Categories', value: summaryStats.categories, subtitle: 'product groups', icon: Layers, iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', borderAccent: 'border-l-purple-500' },
                ].map((stat) => (
                  <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', stat.iconBg)}>
                        <stat.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                        <p className="text-sm font-bold font-mono leading-tight">{stat.value}</p>
                        <p className="text-[10px] text-muted-foreground">{stat.subtitle}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar row */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {splitExportMenu}
          <Button
            variant="outline"
            size="sm"
            title="Toggle filters"
            onClick={() => setSplitShowFilters(!splitShowFilters)}
            className={cn(splitShowFilters && 'border-primary/50 bg-primary/5')}
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            title={splitShowStats ? 'Hide summary stats' : 'Show summary stats'}
            onClick={() => setSplitShowStats(!splitShowStats)}
            className={cn(splitShowStats && 'border-primary/50 bg-primary/5')}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/inventory/products?view=table&action=import${selectedProductId ? `&fromSplit=${selectedProductId}` : ''}`)}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={() => navigate(`/inventory/products?view=table&action=add${selectedProductId ? `&fromSplit=${selectedProductId}` : ''}`)}>
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Add Product</span>
          </Button>
          <ViewModeToggle
            view="split"
            onViewChange={(v) => { if (v === 'table') exitSplitView() }}
          />
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
              <div className="flex items-end gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
                <div className="flex flex-1 items-end gap-3 *:flex-1 *:min-w-25">
                  <EnumSelect
                    label="Category"
                    value={selectedCategoryId}
                    onValueChange={(val) => { setSelectedCategoryId(val); setCurrentPage(1) }}
                    onClear={() => { setSelectedCategoryId('all'); setCurrentPage(1) }}
                    options={categoryFilterOptions}
                  />
                  <EnumSelect
                    label="Schedule"
                    value={selectedSchedule}
                    onValueChange={(val) => { setSelectedSchedule(val); setCurrentPage(1) }}
                    onClear={() => { setSelectedSchedule('all'); setCurrentPage(1) }}
                    options={SCHEDULE_OPTIONS}
                  />
                  <EnumSelect
                    label="Status"
                    value={selectedStatus}
                    onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
                    onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
                    options={STATUS_OPTIONS}
                  />
                </div>
                <div className="flex shrink-0 items-end gap-2">
                  <ColumnsToggle
                    columns={CARD_FIELDS}
                    visible={cardCols.visible}
                    onToggle={cardCols.toggle}
                    onReset={cardCols.reset}
                  />
                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-h-0 flex-1">
          <ProductSplitView
            selectedProductId={selectedProductId}
            onSelectProduct={selectProduct}
            onExitSplitView={exitSplitView}
            isCardFieldVisible={cardCols.isVisible}
            filters={{
              categoryId: selectedCategoryId,
              schedule: selectedSchedule,
              status: selectedStatus,
              stockFilter: stockTab !== 'all' ? stockTab : undefined,
            }}
            tabsNode={
              <StockStatusTabs
                tab={stockTab}
                onChange={(t) => { setStockTab(t); setCurrentPage(1) }}
                counts={tabCounts}
              />
            }
          />
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
          title="Delete product?"
          description={
            <>
              This will permanently delete{' '}
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>.
              This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
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
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters() }}
        columnsNode={<ColumnsToggle columns={PRODUCT_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />}
        actionNode={
          <div className="flex items-center gap-1.5">
            <ViewModeToggle
              view="table"
              onViewChange={(v) => { if (v === 'split') navigate('/inventory/products') }}
            />
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

      {/* ── Stock Tabs ── */}
      <div className="rounded-lg border border-border/40 bg-background">
        <StockStatusTabs
          tab={stockTab}
          onChange={(t) => { setStockTab(t); setCurrentPage(1) }}
          counts={tabCounts}
        />
      </div>

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
          ) : tabFilteredProducts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No products found</div>
          ) : (
            <div className="divide-y divide-border/40">
              {tabFilteredProducts.map(product => {
                const isOutOfStock = (product.totalStock || 0) === 0
                const isLowStock = !isOutOfStock && (product.totalStock || 0) < (product.minStock || 0)
                const cat = getProductCategory(product)
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
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-sm font-semibold">{formatCurrency(product.mrp)}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">Buy {formatCurrency(product.purchaseRate)}</span>
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
                {cols.isVisible('generic') && <TableHead>Generic</TableHead>}
                {cols.isVisible('manufacturer') && <TableHead>Manufacturer</TableHead>}
                {cols.isVisible('category') && <TableHead>Category</TableHead>}
                {cols.isVisible('mrp') && <TableHead className="text-right">MRP</TableHead>}
                {cols.isVisible('purchaseRate') && <TableHead className="text-right">Purchase Rate</TableHead>}
                {cols.isVisible('stock') && <TableHead className="text-right">Stock</TableHead>}
                {cols.isVisible('minStock') && <TableHead className="text-right">Min Stock</TableHead>}
                {cols.isVisible('rack') && <TableHead>Rack</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tabFilteredProducts.map(product => {
                const isOutOfStock = (product.totalStock || 0) === 0
                const isLowStock = !isOutOfStock && (product.totalStock || 0) < (product.minStock || 0)
                const cat = getProductCategory(product)
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
                    {cols.isVisible('generic') && <TableCell className="text-muted-foreground">{product.genericName}</TableCell>}
                    {cols.isVisible('manufacturer') && <TableCell className="text-muted-foreground">{product.manufacturer}</TableCell>}
                    {cols.isVisible('category') && (
                    <TableCell>
                      {cat && <Badge variant="secondary" size="sm">{cat.name}</Badge>}
                    </TableCell>
                    )}
                    {cols.isVisible('mrp') && <TableCell className="text-right font-mono text-sm">{formatCurrency(product.mrp)}</TableCell>}
                    {cols.isVisible('purchaseRate') && <TableCell className="text-right font-mono text-sm">{formatCurrency(product.purchaseRate)}</TableCell>}
                    {cols.isVisible('stock') && (
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
                    )}
                    {cols.isVisible('minStock') && <TableCell className="text-right font-mono text-sm">{product.minStock}</TableCell>}
                    {cols.isVisible('rack') && <TableCell className="text-muted-foreground">{product.rackLocation}</TableCell>}
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
      <Sheet open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(true); else closeEditDialog() }}>
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
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Classification</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="grid gap-2">
                          <Label>Category <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Controller control={form.control} name="categoryId" render={({ field }) => (
                            <CategorySearchDropdown value={field.value ?? ''} onChange={field.onChange} hasError={false} />
                          )} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="packSize">Pack Size <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input id="packSize" placeholder="e.g. 10x10" {...form.register('packSize')} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="unitOfMeasure">Unit of Measure <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input
                            id="unitOfMeasure"
                            list="pp-uom-list"
                            placeholder="Select or type..."
                            autoComplete="off"
                            {...form.register('unitOfMeasure')}
                          />
                          <datalist id="pp-uom-list">
                            {UNIT_OF_MEASURE_OPTIONS.map(u => <option key={u} value={u} />)}
                          </datalist>
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
                          <Label>Drug Schedule <span className="text-rose-500">*</span></Label>
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
                          <Input id="mrp" type="number" step="0.01" placeholder="e.g. 250" {...form.register('mrp')} error={!!form.formState.errors.mrp} />
                          {form.formState.errors.mrp && <p className="text-xs text-rose-500">{form.formState.errors.mrp.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="sellingRate">Selling Price (₹) <span className="text-rose-500">*</span></Label>
                          <Input id="sellingRate" type="number" step="0.01" placeholder="e.g. 235" {...form.register('sellingRate')} error={!!form.formState.errors.sellingRate} />
                          {form.formState.errors.sellingRate && <p className="text-xs text-rose-500">{form.formState.errors.sellingRate.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="purchaseRate">Purchase Rate (₹) <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input id="purchaseRate" type="number" step="0.01" placeholder="e.g. 180" {...form.register('purchaseRate')} error={!!form.formState.errors.purchaseRate} />
                          {form.formState.errors.purchaseRate && <p className="text-xs text-rose-500">{form.formState.errors.purchaseRate.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="wholesaleRate">Wholesale Rate (₹) <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input id="wholesaleRate" type="number" step="0.01" placeholder="e.g. 200" {...form.register('wholesaleRate')} error={!!form.formState.errors.wholesaleRate} />
                          {form.formState.errors.wholesaleRate && <p className="text-xs text-rose-500">{form.formState.errors.wholesaleRate.message}</p>}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
                        <span className="text-sm text-muted-foreground">Margin:</span>
                        <span className={cn('text-sm font-semibold', Number(margin) < 0 ? 'text-rose-600 dark:text-rose-400' : Number(margin) > 20 ? 'text-emerald-600 dark:text-emerald-400' : Number(margin) > 10 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>{margin}%</span>
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Tax</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>GST Rate <span className="text-rose-500">*</span></Label>
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
                          <Label htmlFor="minStock">Min Stock <span className="text-rose-500">*</span></Label>
                          <Input id="minStock" type="number" placeholder="e.g. 10" {...form.register('minStock')} error={!!form.formState.errors.minStock} />
                          {form.formState.errors.minStock && <p className="text-xs text-rose-500">{form.formState.errors.minStock.message}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="maxStock">Max Stock <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input id="maxStock" type="number" placeholder="e.g. 100" {...form.register('maxStock')} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="reorderQty">Reorder Qty <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input id="reorderQty" type="number" placeholder="e.g. 20" {...form.register('reorderQty')} />
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Location</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="rackLocation">Rack Location <span className="text-muted-foreground/60 font-normal normal-case text-xs">(optional)</span></Label>
                          <Input id="rackLocation" placeholder="e.g. A1-01" {...form.register('rackLocation')} />
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
              <Button type="button" variant="outline" onClick={closeEditDialog}>Cancel</Button>
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
        onOpenChange={(open) => { setImportDrawerOpen(open); if (!open) returnToSplitIfNeeded() }}
        onImported={refreshPage}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Delete product?"
        description={
          <>
            This will permanently delete{' '}
            <span className="font-semibold text-foreground">“{deleteTarget?.name}”</span>.
            This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </motion.div>
  )
}
