import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { printHtmlInPage } from '@/lib/printUtils'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus,
  Upload,
  Download,
  Search,
  Eye,
  Pencil,
  Trash2,
  Barcode,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Package,
  AlertTriangle,
  Layers,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { cn, formatCurrency } from '@/lib/utils'
import { exportToCsv, exportToPdf } from '@/lib/exportUtils'
import type { Product } from '@/types'

// ─────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────

const productSchema = z.object({
  // Basic Info
  name: z.string().min(1, 'Product name is required'),
  genericName: z.string().optional().default(''),
  saltComposition: z.string().optional().default(''),
  manufacturer: z.string().optional().default(''),
  category: z.enum(['NEPHROLOGY', 'ONCOLOGY', 'GENERAL', 'OTC', 'SURGICAL']),
  packSize: z.string().optional().default(''),
  unitOfMeasure: z.string().optional().default(''),
  // Regulatory
  schedule: z.enum(['NONE', 'H', 'H1', 'X']),
  hsnCode: z.string().optional().default(''),
  isNarcotic: z.boolean().default(false),
  storageCondition: z.enum(['ROOM_TEMP', 'COOL_DRY', 'REFRIGERATED', 'FROZEN']),
  // Pricing
  mrp: z.coerce.number().min(0, 'MRP must be >= 0'),
  purchaseRate: z.coerce.number().min(0),
  sellingRate: z.coerce.number().min(0),
  wholesaleRate: z.coerce.number().min(0),
  gstRate: z.coerce.number(),
  // Stock Settings
  minStock: z.coerce.number().min(0).default(0),
  maxStock: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  rackLocation: z.string().optional().default(''),
  barcode: z.string().optional().default(''),
})

type ProductFormValues = z.input<typeof productSchema>

// ─────────────────────────────────────────────────────────────
// Category & schedule badge config (using new Badge variants)
// ─────────────────────────────────────────────────────────────

const categoryBadgeConfig: Record<
  string,
  { label: string; variant: 'purple' | 'info' | 'secondary' | 'success' | 'default' }
> = {
  NEPHROLOGY: { label: 'Nephrology', variant: 'info' },
  ONCOLOGY: { label: 'Oncology', variant: 'purple' },
  GENERAL: { label: 'General', variant: 'secondary' },
  OTC: { label: 'OTC', variant: 'success' },
  SURGICAL: { label: 'Surgical', variant: 'default' },
}

const scheduleBadgeConfig: Record<
  string,
  { label: string; variant: 'destructive' | 'warning' } | null
> = {
  NONE: null,
  H: { label: 'H', variant: 'destructive' },
  H1: { label: 'H1', variant: 'destructive' },
  X: { label: 'X', variant: 'warning' },
}

// ─────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const products = useMasterDataStore(s => s.products)
  const suppliers = useMasterDataStore(s => s.suppliers)
  const fetchProducts = useMasterDataStore(s => s.fetchProducts)
  const fetchSuppliers = useMasterDataStore(s => s.fetchSuppliers)
  const isLoading = useMasterDataStore(s => s.isLoading)

  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
  }, [])

  const manufacturers = useMemo(() => {
    // Collect unique manufacturer names from both products AND suppliers
    const fromSuppliers = suppliers.map(s => s.name);
    const fromProducts = products.map(p => p.manufacturer);
    return [...new Set([...fromSuppliers, ...fromProducts])].sort()
  }, [products, suppliers])

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
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

  // Fetch paginated data independently from the global store cache
  useEffect(() => {
    let isSubscribed = true
    const fetchData = async () => {
      try {
        const res = await api.get('/products', {
          params: {
            q: search || undefined,
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            schedule: selectedSchedule !== 'all' ? selectedSchedule : undefined,
            skip: (currentPage - 1) * PAGE_SIZE,
            take: PAGE_SIZE
          }
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
  }, [search, selectedCategory, selectedSchedule, currentPage, refreshKey])

  // Summary stats (approximated from paginated data since global array might be large)
  const summaryStats = useMemo(() => {
    const total = totalCount
    const lowStock = products.filter(
      (p) => p.totalStock > 0 && p.totalStock < p.minStock
    ).length
    const outOfStock = products.filter((p) => p.totalStock === 0).length
    const categories = [...new Set(products.map((p) => p.category))].length
    return { total, lowStock, outOfStock, categories }
  }, [totalCount, products])

  // Pagination metadata
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1

  // Form
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      genericName: '',
      saltComposition: '',
      manufacturer: '',
      category: 'GENERAL',
      packSize: '',
      unitOfMeasure: '',
      schedule: 'NONE',
      hsnCode: '',
      isNarcotic: false,
      storageCondition: 'ROOM_TEMP',
      mrp: 0,
      purchaseRate: 0,
      sellingRate: 0,
      wholesaleRate: 0,
      gstRate: 12,
      minStock: 0,
      maxStock: 0,
      reorderQty: 0,
      rackLocation: '',
      barcode: '',
    },
  })

  const mrpVal = Number(form.watch('mrp')) || 0
  const purchaseRateVal = Number(form.watch('purchaseRate')) || 0
  const margin =
    mrpVal > 0
      ? (((mrpVal - purchaseRateVal) / mrpVal) * 100).toFixed(1)
      : '0.0'

  const openAddDialog = () => {
    setEditingProduct(null)
    form.reset({
      name: '',
      genericName: '',
      saltComposition: '',
      manufacturer: '',
      category: 'GENERAL',
      packSize: '',
      unitOfMeasure: '',
      schedule: 'NONE',
      hsnCode: '',
      isNarcotic: false,
      storageCondition: 'ROOM_TEMP',
      mrp: 0,
      purchaseRate: 0,
      sellingRate: 0,
      wholesaleRate: 0,
      gstRate: 12,
      minStock: 0,
      maxStock: 0,
      reorderQty: 0,
      rackLocation: '',
      barcode: '',
    })
    setActiveTab('basic')
    setDialogOpen(true)
  }

  const openEditDialog = (product: Product) => {
    setEditingProduct(product)
    form.reset({
      name: product.name,
      genericName: product.genericName,
      saltComposition: product.saltComposition ?? '',
      manufacturer: product.manufacturer,
      category: product.category,
      packSize: product.packSize,
      unitOfMeasure: product.unitOfMeasure,
      schedule: product.schedule,
      hsnCode: product.hsnCode,
      isNarcotic: product.isNarcotic,
      storageCondition: product.storageCondition,
      mrp: product.mrp,
      purchaseRate: product.purchaseRate,
      sellingRate: product.sellingRate,
      wholesaleRate: product.wholesaleRate,
      gstRate: product.gstRate,
      minStock: product.minStock,
      maxStock: product.maxStock,
      reorderQty: product.reorderQty,
      rackLocation: product.rackLocation,
      barcode: product.barcode ?? '',
    })
    setActiveTab('basic')
    setDialogOpen(true)
  }

  const onSubmit = async (values: any) => {
    const payload = {
      ...values,
      category: values.category.toUpperCase(),
      schedule: values.schedule.toUpperCase(),
      storageCondition: values.storageCondition.toUpperCase(),
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
      refreshPage() // Refreshes local pagination table
      fetchProducts() // Syncs global master data for other pages (like Purchase Orders)
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Operation failed")
    }
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) return
    try {
      await api.delete(`/products/${product.id}`)
      toast.success(`Product "${product.name}" deleted`)
      refreshPage()
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete product")
    }
  }

  const handlePrintBarcode = (product: Product) => {
    const barcode = product.barcode || product.id
    printHtmlInPage(`
      <!DOCTYPE html><html><head><title>Barcode - ${product.name}</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 20px; }
        .label { border: 1px solid #ccc; display: inline-block; padding: 16px 24px; border-radius: 8px; }
        h3 { margin: 0 0 4px; font-size: 14px; }
        p { margin: 2px 0; font-size: 11px; color: #555; }
        .barcode { font-family: monospace; font-size: 18px; letter-spacing: 4px; margin: 10px 0 4px; }
      </style></head><body>
      <div class="label">
        <h3>${product.name}</h3>
        <p>${product.genericName ?? ''}</p>
        <div class="barcode">${barcode}</div>
        <p>MRP: ₹${Number(product.mrp).toFixed(2)}</p>
      </div>
      </body></html>
    `)
  }

  const CSV_TEMPLATE_HEADERS = [
    'name', 'genericname', 'saltcomposition', 'manufacturer', 'category', 'subcategory',
    'packsize', 'unitofmeasure', 'schedule', 'hsncode', 'isnarcotic', 'storagecondition',
    'mrp', 'purchaserate', 'sellingrate', 'wholesalerate', 'gstrate',
    'minstock', 'maxstock', 'reorderqty', 'racklocation', 'barcode',
  ]
  const CSV_TEMPLATE_EXAMPLE = [
    'Paracetamol 500mg', 'Paracetamol', '', 'ABC Pharma', 'GENERAL', '',
    '10 Tabs', 'TAB', 'H', '3004', 'false', 'ROOM_TEMPERATURE',
    '25', '12', '20', '18', '12',
    '10', '500', '50', 'A-01', '',
  ]

  const handleDownloadTemplate = () => {
    const rows = [CSV_TEMPLATE_HEADERS.join(','), CSV_TEMPLATE_EXAMPLE.join(',')]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'products-import-template.csv'
    a.click()
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
      if (res.data.created > 0) {
        refreshPage()
        toast.success(`Imported ${res.data.created} product(s)`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const generateBarcode = () => {
    const barcode = '890' + Math.random().toString().slice(2, 12)
    form.setValue('barcode', barcode)
    toast.info('Barcode generated')
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Product & drug master list
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setImportFile(null); setImportResult(null); setImportDialogOpen(true) }}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Import
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                const rows = paginatedProducts.map((p) => ({
                  Name: p.name, Generic: p.genericName, Category: p.category,
                  MRP: p.mrp, Rate: p.purchaseRate, Stock: p.totalStock,
                  HSN: p.hsnCode, GST: p.gstRate,
                }))
                exportToCsv(rows, 'products')
              }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const rows = paginatedProducts.map((p) => ({
                  Name: p.name, Generic: p.genericName, Category: p.category,
                  MRP: p.mrp, Rate: p.purchaseRate, Stock: p.totalStock,
                }))
                exportToPdf(rows, 'Products List', 'products')
              }}>
                <FileDown className="mr-2 h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Products
              </p>
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
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Low Stock
              </p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {summaryStats.lowStock}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 dark:bg-rose-500/15">
              <Package className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Out of Stock
              </p>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {summaryStats.outOfStock}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/15">
              <Layers className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categories
              </p>
              <p className="text-2xl font-bold">{summaryStats.categories}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={(val) => { setSearch(val); setCurrentPage(1) }}
        searchPlaceholder="Search products by name, generic, manufacturer..."
        resultsCount={totalCount}
        activeFilterCount={(selectedCategory !== 'all' ? 1 : 0) + (selectedSchedule !== 'all' ? 1 : 0)}
        onClearFilters={() => {
          setSelectedCategory('all')
          setSelectedSchedule('all')
          setCurrentPage(1)
        }}
      >
        <EnumSelect
          label="Category"
          value={selectedCategory}
          onValueChange={(val) => { setSelectedCategory(val); setCurrentPage(1) }}
          onClear={() => { setSelectedCategory('all'); setCurrentPage(1) }}
          options={[
            { value: 'all', label: 'All Categories' },
            { value: 'GENERAL', label: 'General' },
            { value: 'OTC', label: 'OTC' },
            { value: 'SURGICAL', label: 'Surgical' },
            { value: 'NEPHROLOGY', label: 'Nephrology' },
            { value: 'ONCOLOGY', label: 'Oncology' },
          ]}
        />
        <EnumSelect
          label="Schedule"
          value={selectedSchedule}
          onValueChange={(val) => { setSelectedSchedule(val); setCurrentPage(1) }}
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

      {/* ── Table ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
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
              {paginatedProducts.map((product) => {
                const isOutOfStock = (product.totalStock || 0) === 0
                const isLowStock =
                  !isOutOfStock && (product.totalStock || 0) < (product.minStock || 0)
                
                const categoryKey = (product.category || '').toUpperCase()
                const scheduleKey = (product.schedule || '').toUpperCase()
                
                const cat = categoryBadgeConfig[categoryKey]
                const sched = scheduleBadgeConfig[scheduleKey === 'NONE' ? 'NONE' : scheduleKey]

              return (
                <TableRow
                  key={product.id}
                  className={cn(
                    isOutOfStock &&
                      'bg-rose-50/60 dark:bg-rose-950/20',
                    isLowStock &&
                      'bg-amber-50/60 dark:bg-amber-950/20'
                  )}
                >
                  <TableCell className="font-medium">
                    {product.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.genericName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.manufacturer}
                  </TableCell>
                  <TableCell>
                    {cat && (
                      <Badge variant={cat.variant} size="sm" dot>
                        {cat.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {sched && (
                      <Badge variant={sched.variant} size="sm">
                        {sched.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(product.mrp)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 font-mono text-sm font-semibold',
                        isOutOfStock && 'text-rose-600 dark:text-rose-400',
                        isLowStock && 'text-amber-600 dark:text-amber-400',
                        !isOutOfStock &&
                          !isLowStock &&
                          'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isOutOfStock && 'bg-rose-500',
                          isLowStock && 'bg-amber-500',
                          !isOutOfStock && !isLowStock && 'bg-emerald-500'
                        )}
                      />
                      {product.totalStock}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {product.minStock}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.rackLocation}
                  </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => openEditDialog(product)}
                        onEdit={() => openEditDialog(product)}
                        onDelete={() => handleDelete(product)}
                        customActions={[
                          {
                            label: 'Print Barcode',
                            icon: <Barcode className="h-4 w-4" />,
                            onClick: () => handlePrintBarcode(product),
                          },
                        ]}
                      />
                    </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing{' '}
            {totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            {' - '}
            {Math.min(currentPage * PAGE_SIZE, totalCount)} of{' '}
            {totalCount} products
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Button
                    key={page}
                    variant={page === currentPage ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Add / Edit Product Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Edit Product' : 'Add New Product'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? 'Update the product details below.'
                : 'Fill in the product details to add a new product.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="stock">Stock Settings</TabsTrigger>
              </TabsList>

              {/* Tab 1 - Basic Info */}
              <TabsContent value="basic" className="mt-6 space-y-5">
                {/* Section label */}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Product Details
                </p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">
                      Product Name <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      placeholder="e.g. Torsemide 20mg Tab"
                      error={!!form.formState.errors.name}
                      {...form.register('name')}
                    />
                    {form.formState.errors.name && (
                      <p className="text-xs text-rose-500">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="genericName">Generic Name</Label>
                    <Input
                      id="genericName"
                      placeholder="e.g. Torsemide"
                      {...form.register('genericName')}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="saltComposition">Salt Composition</Label>
                    <Input
                      id="saltComposition"
                      placeholder="e.g. Paracetamol 500mg + Caffeine 65mg"
                      {...form.register('saltComposition')}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <div className="relative">
                      <Input
                        id="manufacturer"
                        list="manufacturer-list"
                        placeholder="Select or type manufacturer..."
                        autoComplete="off"
                        error={!!form.formState.errors.manufacturer}
                        {...form.register('manufacturer')}
                      />
                      <datalist id="manufacturer-list">
                        {manufacturers.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    {form.formState.errors.manufacturer && (
                      <p className="text-xs text-rose-500">
                        {form.formState.errors.manufacturer.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Classification
                </p>

                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Controller
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NEPHROLOGY">Nephrology</SelectItem>
                              <SelectItem value="ONCOLOGY">Oncology</SelectItem>
                              <SelectItem value="GENERAL">General</SelectItem>
                              <SelectItem value="OTC">OTC</SelectItem>
                              <SelectItem value="SURGICAL">Surgical</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="packSize">Pack Size</Label>
                      <Input
                        id="packSize"
                        placeholder="e.g. 10x10"
                        {...form.register('packSize')}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                    <Input
                      id="unitOfMeasure"
                      placeholder="e.g. Strip, Vial, Syringe"
                      {...form.register('unitOfMeasure')}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2 - Regulatory */}
              <TabsContent value="regulatory" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Scheduling & Compliance
                </p>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Schedule</Label>
                    <Controller
                      control={form.control}
                      name="schedule"
                      render={({ field }) => (
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex gap-6"
                        >
                          {(['NONE', 'H', 'H1', 'X'] as const).map((s) => (
                            <div key={s} className="flex items-center gap-2">
                              <RadioGroupItem value={s} id={`schedule-${s}`} />
                              <Label
                                htmlFor={`schedule-${s}`}
                                className="cursor-pointer font-normal"
                              >
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
                    <Input
                      id="hsnCode"
                      placeholder="e.g. 30049099"
                      {...form.register('hsnCode')}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/60 p-4">
                    <div>
                      <Label>Is Narcotic</Label>
                      <p className="text-xs text-muted-foreground">
                        Mark if this product is a narcotic substance
                      </p>
                    </div>
                    <Controller
                      control={form.control}
                      name="isNarcotic"
                      render={({ field }) => (
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                </div>

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Storage
                </p>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Storage Condition</Label>
                    <Controller
                      control={form.control}
                      name="storageCondition"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
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
                </div>
              </TabsContent>

              {/* Tab 3 - Pricing */}
              <TabsContent value="pricing" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Price Configuration
                </p>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="mrp">MRP</Label>
                      <Input
                        id="mrp"
                        type="number"
                        step="0.01"
                        error={!!form.formState.errors.mrp}
                        {...form.register('mrp')}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="purchaseRate">Purchase Rate</Label>
                      <Input
                        id="purchaseRate"
                        type="number"
                        step="0.01"
                        {...form.register('purchaseRate')}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="sellingRate">Selling Rate</Label>
                      <Input
                        id="sellingRate"
                        type="number"
                        step="0.01"
                        {...form.register('sellingRate')}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="wholesaleRate">Wholesale Rate</Label>
                      <Input
                        id="wholesaleRate"
                        type="number"
                        step="0.01"
                        {...form.register('wholesaleRate')}
                      />
                    </div>
                  </div>

                  {/* Margin indicator */}
                  <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Margin:{' '}
                      <span
                        className={cn(
                          'font-semibold',
                          Number(margin) > 20
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : Number(margin) > 10
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-foreground'
                        )}
                      >
                        {margin}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tax
                </p>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>GST Rate</Label>
                    <Controller
                      control={form.control}
                      name="gstRate"
                      render={({ field }) => (
                        <Select
                          value={String(field.value)}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
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
                </div>
              </TabsContent>

              {/* Tab 4 - Stock Settings */}
              <TabsContent value="stock" className="mt-6 space-y-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Stock Levels
                </p>
                <div className="grid gap-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="minStock">Min Stock</Label>
                      <Input
                        id="minStock"
                        type="number"
                        {...form.register('minStock')}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="maxStock">Max Stock</Label>
                      <Input
                        id="maxStock"
                        type="number"
                        {...form.register('maxStock')}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="reorderQty">Reorder Qty</Label>
                      <Input
                        id="reorderQty"
                        type="number"
                        {...form.register('reorderQty')}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Location & Identification
                </p>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rackLocation">Rack Location</Label>
                    <Input
                      id="rackLocation"
                      placeholder="e.g. A1-01"
                      {...form.register('rackLocation')}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="barcode">Barcode</Label>
                    <div className="flex gap-2">
                      <Input
                        id="barcode"
                        placeholder="Barcode number"
                        {...form.register('barcode')}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={generateBarcode}
                      >
                        <Barcode className="mr-1.5 h-4 w-4" />
                        Auto-generate
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingProduct ? 'Save Changes' : 'Add Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import Dialog ── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) { setImportFile(null); setImportResult(null) } setImportDialogOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Products from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk-import products. Download the template first to see the required format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Button variant="outline" size="sm" className="w-full" onClick={handleDownloadTemplate}>
              <FileDown className="mr-1.5 h-4 w-4" />
              Download CSV Template
            </Button>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Select CSV File
              </Label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
                onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null) }}
              />
            </div>

            {importResult && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-semibold">Import complete</p>
                <p className="text-green-600 dark:text-green-400">Created: {importResult.created}</p>
                <p className="text-muted-foreground">Skipped (duplicate barcode): {importResult.skipped}</p>
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
