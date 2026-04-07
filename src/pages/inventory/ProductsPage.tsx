import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mockProducts } from '@/data/mock'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

// ─────────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────────

const productSchema = z.object({
  // Basic Info
  name: z.string().min(1, 'Product name is required'),
  genericName: z.string().optional().default(''),
  manufacturer: z.string().optional().default(''),
  category: z.enum(['nephrology', 'oncology', 'general', 'otc', 'surgical']),
  packSize: z.string().optional().default(''),
  unitOfMeasure: z.string().optional().default(''),
  // Regulatory
  schedule: z.enum(['none', 'H', 'H1', 'X']),
  hsnCode: z.string().optional().default(''),
  isNarcotic: z.boolean().default(false),
  storageCondition: z.enum(['room_temp', 'cool_dry', 'refrigerated', 'frozen']),
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
  nephrology: { label: 'Nephrology', variant: 'info' },
  oncology: { label: 'Oncology', variant: 'purple' },
  general: { label: 'General', variant: 'secondary' },
  otc: { label: 'OTC', variant: 'success' },
  surgical: { label: 'Surgical', variant: 'default' },
}

const scheduleBadgeConfig: Record<
  string,
  { label: string; variant: 'destructive' | 'warning' } | null
> = {
  none: null,
  H: { label: 'H', variant: 'destructive' },
  H1: { label: 'H1', variant: 'destructive' },
  X: { label: 'X', variant: 'warning' },
}

// ─────────────────────────────────────────────────────────────
// Manufacturers list (for searchable select)
// ─────────────────────────────────────────────────────────────

const manufacturers = [
  ...new Set(mockProducts.map((p) => p.manufacturer)),
].sort()

// ─────────────────────────────────────────────────────────────
// Page size
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

// ─────────────────────────────────────────────────────────────
// ProductsPage
// ─────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [activeTab, setActiveTab] = useState('basic')

  // Filter products by search
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return mockProducts
    return mockProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.genericName.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    )
  }, [search])

  // Summary stats
  const summaryStats = useMemo(() => {
    const total = mockProducts.length
    const lowStock = mockProducts.filter(
      (p) => p.totalStock > 0 && p.totalStock < p.minStock
    ).length
    const outOfStock = mockProducts.filter((p) => p.totalStock === 0).length
    const categories = [...new Set(mockProducts.map((p) => p.category))].length
    return { total, lowStock, outOfStock, categories }
  }, [])

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // Form
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      genericName: '',
      manufacturer: '',
      category: 'general',
      packSize: '',
      unitOfMeasure: '',
      schedule: 'none',
      hsnCode: '',
      isNarcotic: false,
      storageCondition: 'room_temp',
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
      manufacturer: '',
      category: 'general',
      packSize: '',
      unitOfMeasure: '',
      schedule: 'none',
      hsnCode: '',
      isNarcotic: false,
      storageCondition: 'room_temp',
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

  const onSubmit = (values: any) => {
    if (editingProduct) {
      toast.success(`Product "${values.name}" updated successfully`)
    } else {
      toast.success(`Product "${values.name}" added successfully`)
    }
    setDialogOpen(false)
  }

  const handleDelete = (product: Product) => {
    toast.success(`Product "${product.name}" deleted`)
  }

  const handlePrintBarcode = (product: Product) => {
    toast.info(`Printing barcode for "${product.name}"`)
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
            onClick={() => toast.info('Import CSV coming soon')}
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
              <DropdownMenuItem onClick={() => toast.info('Exporting CSV...')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info('Exporting PDF...')}>
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
      <div className="max-w-md">
        <Input
          placeholder="Search products by name, generic, manufacturer..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCurrentPage(1)
          }}
          icon={<Search />}
        />
      </div>

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
              const isOutOfStock = product.totalStock === 0
              const isLowStock =
                !isOutOfStock && product.totalStock < product.minStock
              const cat = categoryBadgeConfig[product.category]
              const sched = scheduleBadgeConfig[product.schedule]

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
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          toast.info(`Viewing "${product.name}"`)
                        }
                      >
                        <Eye />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditDialog(product)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(product)}
                      >
                        <Trash2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePrintBarcode(product)}
                      >
                        <Barcode />
                      </Button>
                    </div>
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
            {Math.min(
              (currentPage - 1) * PAGE_SIZE + 1,
              filteredProducts.length
            )}
            {' - '}
            {Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} of{' '}
            {filteredProducts.length} products
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
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <Controller
                      control={form.control}
                      name="manufacturer"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select manufacturer" />
                          </SelectTrigger>
                          <SelectContent>
                            {manufacturers.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
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
                              <SelectItem value="nephrology">Nephrology</SelectItem>
                              <SelectItem value="oncology">Oncology</SelectItem>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="otc">OTC</SelectItem>
                              <SelectItem value="surgical">Surgical</SelectItem>
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
                          {(['none', 'H', 'H1', 'X'] as const).map((s) => (
                            <div key={s} className="flex items-center gap-2">
                              <RadioGroupItem value={s} id={`schedule-${s}`} />
                              <Label
                                htmlFor={`schedule-${s}`}
                                className="cursor-pointer font-normal"
                              >
                                {s === 'none' ? 'None' : s}
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
                            <SelectItem value="room_temp">Room Temperature</SelectItem>
                            <SelectItem value="cool_dry">Cool & Dry</SelectItem>
                            <SelectItem value="refrigerated">Refrigerated</SelectItem>
                            <SelectItem value="frozen">Frozen</SelectItem>
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
    </motion.div>
  )
}
