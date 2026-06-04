import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Download, Upload, Tag, Package, CheckCircle2,
  FileDown, FileSpreadsheet, FolderOpen,
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
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import api from '@/lib/api'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { cn } from '@/lib/utils'
import type { Category } from '@/types'

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').transform(v => v.toUpperCase()),
  description: z.string().optional().default(''),
  isActive: z.boolean().default(true),
})
type CategoryFormValues = z.input<typeof categorySchema>

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  // Stat-card drill-down: clicking a summary card narrows the list to that
  // subset. 'withProducts' spans the "With Products" card; 'active' mirrors
  // the Active card. Kept separate from the Status enum filter above.
  const [cardFilter, setCardFilter] = useState<'all' | 'active' | 'withProducts'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/categories')
      setCategories(res.data)
    } catch {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '', isActive: true },
  })

  const openAdd = () => {
    setEditing(null)
    form.reset({ name: '', description: '', isActive: true })
    setDialogOpen(true)
  }

  // Auto-open the Add Category dialog via `?add=1` (sidebar quick-add).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') === '1') {
      openAdd()
      params.delete('add')
      const qs = params.toString()
      window.history.replaceState(null, '', `/inventory/categories${qs ? `?${qs}` : ''}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openEdit = (cat: Category) => {
    setEditing(cat)
    form.reset({ name: cat.name, description: cat.description ?? '', isActive: cat.isActive })
    setDialogOpen(true)
  }

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      if (editing) {
        await api.patch(`/categories/${editing.id}`, values)
        toast.success('Category updated')
      } else {
        await api.post('/categories', values)
        toast.success('Category created')
      }
      setDialogOpen(false)
      fetchCategories()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Operation failed')
    }
  }

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}"? This will fail if products are assigned.`)) return
    try {
      await api.delete(`/categories/${cat.id}`)
      toast.success('Category deleted')
      fetchCategories()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete')
    }
  }

  const handleExportCsv = async () => {
    try {
      const res = await api.get('/categories/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = 'categories.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  const handleImport = async () => {
    if (!importFile) { toast.error('Please select a CSV file'); return }
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await api.post('/categories/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImportResult(res.data)
      if (res.data.created > 0) { fetchCategories(); toast.success(`Imported ${res.data.created} categor${res.data.created === 1 ? 'y' : 'ies'}`) }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const filtered = useMemo(() => {
    let result = [...categories]

    // Stat-card drill-down
    if (cardFilter === 'active') result = result.filter(c => c.isActive)
    else if (cardFilter === 'withProducts') result = result.filter(c => (c._count?.products ?? 0) > 0)

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
      )
    }
    if (selectedStatus === 'active') result = result.filter(c => c.isActive)
    else if (selectedStatus === 'inactive') result = result.filter(c => !c.isActive)
    return result
  }, [categories, search, selectedStatus, cardFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, selectedStatus])

  const stats = useMemo(() => {
    const total = categories.length
    const active = categories.filter(c => c.isActive).length
    const withProducts = categories.filter(c => (c._count?.products ?? 0) > 0).length
    const totalProducts = categories.reduce((s, c) => s + (c._count?.products ?? 0), 0)
    return { total, active, withProducts, totalProducts }
  }, [categories])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeFilterCount = (selectedStatus !== 'all' ? 1 : 0) + (cardFilter !== 'all' ? 1 : 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          {
            label: 'Total Categories',
            value: String(stats.total),
            subtitle: 'in catalog',
            icon: Tag,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            label: 'Active',
            value: String(stats.active),
            subtitle: 'enabled',
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'active',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'With Products',
            value: String(stats.withProducts),
            subtitle: 'in use',
            icon: FolderOpen,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
            filterKey: 'withProducts',
            activeRing: 'ring-2 ring-amber-500/50',
          },
          {
            // Pure aggregate (sum of products across categories) — there's no
            // row subset to drill into, so this card just clears any active
            // card filter back to showing all categories. No active ring.
            label: 'Total Products',
            value: String(stats.totalProducts),
            subtitle: 'across categories',
            icon: Package,
            iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            borderAccent: 'border-l-purple-500',
            filterKey: 'all',
            activeRing: '',
          },
        ] as const).map((stat) => {
          const active = stat.filterKey !== 'all' && cardFilter === stat.filterKey
          return (
          <Card
            key={stat.label}
            hover
            role="button"
            tabIndex={0}
            title={stat.filterKey === 'all' ? 'Show all categories' : `Filter to ${stat.label.toLowerCase()} categories`}
            onClick={() => { setCardFilter(active ? 'all' : (stat.filterKey as 'all' | 'active' | 'withProducts')); setCurrentPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardFilter(active ? 'all' : (stat.filterKey as 'all' | 'active' | 'withProducts')); setCurrentPage(1) } }}
            className={cn('border-l-[3px] cursor-pointer transition-shadow', stat.borderAccent, active && stat.activeRing)}
          >
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
          )
        })}
      </div>

      {/* ── Search + Filter Row ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search categories by name or description..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { setSelectedStatus('all'); setCardFilter('all'); setCurrentPage(1) }}
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
                <DropdownMenuItem onClick={handleExportCsv}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              onClick={openAdd}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add Category</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      >
        <EnumSelect
          label="Status"
          value={selectedStatus}
          onValueChange={setSelectedStatus}
          onClear={() => setSelectedStatus('all')}
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
          {loading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-4 py-3 animate-pulse">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-3 w-40 rounded bg-muted" />
                  </div>
                  <div className="h-5 w-12 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
                <Tag className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No categories found</p>
              <p className="text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {paginated.map(cat => (
                <div key={cat.id} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-medium text-sm">{cat.name}</p>
                    {cat.description && (
                      <p className="truncate text-xs text-muted-foreground">{cat.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <Badge variant={cat.isActive ? 'success' : 'secondary'} size="sm">
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" size="sm">
                        {cat._count?.products ?? 0} products
                      </Badge>
                    </div>
                  </div>
                  <DataTableRowActions
                    onEdit={() => openEdit(cat)}
                    onDelete={() => handleDelete(cat)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                        <p className="text-sm text-muted-foreground animate-pulse">Fetching categories...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                          <Tag className="h-6 w-6 text-muted-foreground/60" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">No categories found</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((cat, idx) => (
                    <motion.tr
                      key={cat.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      className="border-b border-border/40 transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-muted-foreground">{cat.description || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{cat._count?.products ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={cat.isActive ? 'success' : 'secondary'} size="sm" dot>
                          {cat.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DataTableRowActions
                          onEdit={() => openEdit(cat)}
                          onDelete={() => handleDelete(cat)}
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
          totalItems={filtered.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update category details.' : 'Create a new product category.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Name <span className="text-rose-500">*</span></Label>
              <Input id="cat-name" placeholder="e.g. CARDIOLOGY" {...form.register('name')} />
              {form.formState.errors.name?.message && (
                <p className="text-xs text-rose-500">{form.formState.errors.name?.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Input id="cat-desc" placeholder="Short description..." {...form.register('description')} />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cat-active"
                checked={form.watch('isActive')}
                onChange={e => form.setValue('isActive', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="cat-active" className="cursor-pointer font-normal">Active</Label>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? 'Save Changes' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) { setImportFile(null); setImportResult(null) } setImportDialogOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Categories from CSV</DialogTitle>
            <DialogDescription>CSV must have columns: name, description, isActive</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="outline" size="sm" className="w-full" onClick={() => {
              const csv = 'name,description,isActive\nCARDIOLOGY,Heart medicines,true'
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'categories-template.csv'; a.click()
              URL.revokeObjectURL(url)
            }}>
              <FileDown className="mr-1.5 h-4 w-4" /> Download Template
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
                <p className="text-green-600 dark:text-green-400">Created: {importResult?.created}</p>
                <p className="text-muted-foreground">Skipped (duplicate): {importResult?.skipped}</p>
                {(importResult?.errors?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <p className="text-destructive font-medium">Errors ({importResult?.errors?.length}):</p>
                    <ul className="mt-1 max-h-28 overflow-y-auto space-y-0.5 text-xs text-destructive">
                      {importResult?.errors?.map((e, i) => <li key={i}>{e}</li>)}
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
