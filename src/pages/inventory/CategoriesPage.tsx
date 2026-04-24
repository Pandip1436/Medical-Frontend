import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Download, Upload, Pencil, Trash2, Tag,
  FileDown, FileSpreadsheet, Search, RefreshCw,
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
import type { Category } from '@/types'

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').transform(v => v.toUpperCase()),
  description: z.string().optional().default(''),
  color: z.string().optional().default('#6366F1'),
  isActive: z.boolean().default(true),
})
type CategoryFormValues = z.input<typeof categorySchema>

const DEFAULT_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1',
]

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
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
    defaultValues: { name: '', description: '', color: '#6366F1', isActive: true },
  })

  const openAdd = () => {
    setEditing(null)
    form.reset({ name: '', description: '', color: '#6366F1', isActive: true })
    setDialogOpen(true)
  }

  const openEdit = (cat: Category) => {
    setEditing(cat)
    form.reset({ name: cat.name, description: cat.description ?? '', color: cat.color ?? '#6366F1', isActive: cat.isActive })
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

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

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
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">Manage product categories</p>
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
              <DropdownMenuItem onClick={handleExportCsv}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export as CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Category
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Tag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Tag className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{categories.filter(c => c.isActive).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">With Products</p>
              <p className="text-2xl font-bold">{categories.filter(c => (c._count?.products ?? 0) > 0).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Tag className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Products</p>
              <p className="text-2xl font-bold">{categories.reduce((s, c) => s + (c._count?.products ?? 0), 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Table */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={fetchCategories} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  No categories found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(cat => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <div className="h-6 w-6 rounded-full border border-border/40" style={{ backgroundColor: cat.color ?? '#6366F1' }} />
                  </TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-muted-foreground">{cat.description ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{cat._count?.products ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={cat.isActive ? 'success' : 'secondary'} size="sm">
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(cat)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
              {form.formState.errors.name && (
                <p className="text-xs text-rose-500">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Input id="cat-desc" placeholder="Short description..." {...form.register('description')} />
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${form.watch('color') === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => form.setValue('color', c)}
                  />
                ))}
                <input
                  type="color"
                  value={form.watch('color') ?? '#6366F1'}
                  onChange={e => form.setValue('color', e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-full border border-border bg-transparent p-0"
                  title="Custom color"
                />
              </div>
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
            <DialogDescription>CSV must have columns: name, description, color, isActive</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="outline" size="sm" className="w-full" onClick={() => {
              const csv = 'name,description,color,isActive\nCARDIOLOGY,Heart medicines,#EF4444,true'
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
                <p className="text-green-600 dark:text-green-400">Created: {importResult.created}</p>
                <p className="text-muted-foreground">Skipped (duplicate): {importResult.skipped}</p>
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
