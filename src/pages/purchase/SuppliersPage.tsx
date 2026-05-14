import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Pencil,
  UserX,
  IndianRupee,
  Building2,
  Download,
  Printer,
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { SupplierFormDialog } from '@/components/shared/SupplierFormDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { exportToCsv, printReport } from '@/lib/exportUtils'
import { exportToExcel, importFromExcel } from '@/lib/excelUtils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import type { Supplier } from '@/types'

// ─────────────────────────────────────────────────────────────
// Supplier form schema
// ─────────────────────────────────────────────────────────────

// (Supplier add/edit schema + form now live in components/shared/SupplierFormDialog.tsx)

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const

const PAYMENT_TERMS_OPTIONS = [
  { value: 'all', label: 'All Terms' },
  { value: 'NET_30', label: 'Net 30' },
  { value: 'NET_45', label: 'Net 45' },
  { value: 'NET_60', label: 'Net 60' },
] as const

const GSTIN_OPTIONS = [
  { value: 'all', label: 'All Suppliers' },
  { value: 'yes', label: 'With GSTIN' },
  { value: 'no', label: 'Without GSTIN' },
] as const

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  // Master store is kept only for the directory-wide stats cards (counts that
  // don't change with filters), and for the importSuppliers action.
  const {
    suppliers: directorySuppliers,
    fetchMasterData,
    importSuppliers,
  } = useMasterDataStore()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])
  useBranchRefresh(fetchMasterData)

  // ── Server-side filtered/paginated supplier list ──
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [totalSuppliers, setTotalSuppliers] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Filters ──
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedPaymentTerms, setSelectedPaymentTerms] = useState<string>('all')
  const [selectedGstin, setSelectedGstin] = useState<string>('all')
  const [outstandingMin, setOutstandingMin] = useState('')
  const [outstandingMax, setOutstandingMax] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Build query params from current filter + search + pagination state.
  const buildQueryParams = useCallback(
    (opts?: { paginated?: boolean }): URLSearchParams => {
      const params = new URLSearchParams()
      if (opts?.paginated !== false) {
        params.set('skip', String((currentPage - 1) * PAGE_SIZE))
        params.set('take', String(PAGE_SIZE))
      }
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      if (selectedStatus !== 'all') params.set('isActive', selectedStatus === 'ACTIVE' ? 'true' : 'false')
      if (selectedPaymentTerms !== 'all') params.set('paymentTerms', selectedPaymentTerms)
      if (selectedGstin !== 'all') params.set('hasGstin', selectedGstin === 'yes' ? 'true' : 'false')
      if (outstandingMin) params.set('outstandingMin', outstandingMin)
      if (outstandingMax) params.set('outstandingMax', outstandingMax)
      return params
    },
    [currentPage, searchQuery, selectedStatus, selectedPaymentTerms, selectedGstin, outstandingMin, outstandingMax],
  )

  // Fetch suppliers from backend whenever filters/search/page change (debounced for search).
  const fetchAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const delay = searchQuery.trim() ? 250 : 0
    const handle = setTimeout(async () => {
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller
      setIsLoading(true)
      try {
        const res = await api.get(`/suppliers?${buildQueryParams().toString()}`, { signal: controller.signal })
        const payload = res.data
        const items = (payload?.data ?? payload ?? []) as Supplier[]
        setSuppliers(items)
        setTotalSuppliers(typeof payload?.total === 'number' ? payload.total : items.length)
      } catch (err: any) {
        if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
          setSuppliers([])
          setTotalSuppliers(0)
        }
      } finally {
        setIsLoading(false)
      }
    }, delay)
    return () => clearTimeout(handle)
  }, [buildQueryParams, searchQuery])
  useBranchRefresh(() => {
    // Refetch the current view if the branch context changes
    setCurrentPage(1)
  })

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  // (supplierStats + fetchSupplierStats removed — the supplier detail page now
  // owns business-summary fetching via its own dedicated hook.)

  const clearFilters = () => {
    setSelectedStatus('all')
    setSelectedPaymentTerms('all')
    setSelectedGstin('all')
    setOutstandingMin('')
    setOutstandingMax('')
  }

  const handleExport = async () => {
    try {
      // Export ALL matching suppliers (apply filters, drop pagination).
      const params = buildQueryParams({ paginated: false })
      const res = await api.get(`/suppliers?${params.toString()}`)
      const payload = res.data
      const allMatching = (payload?.data ?? payload ?? []) as Supplier[]
      if (allMatching.length === 0) {
        toast.info('No suppliers to export')
        return
      }
      const exportData = allMatching.map((s) => ({
        Name: s.name,
        'Contact Person': s.contactPerson,
        Phone: s.phone,
        Email: s.email || '',
        GSTIN: s.gstin,
        'Drug License': s.drugLicense,
        Address: s.address,
        'Payment Terms': s.paymentTerms,
        'Bank Details': s.bankDetails || '',
        Outstanding: s.currentOutstanding,
        Status: s.isActive ? 'Active' : 'Inactive',
      }))
      exportToExcel(exportData, 'suppliers')
    } catch {
      toast.error('Failed to export suppliers')
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const data = await importFromExcel<any>(file)
      if (!data.length) throw new Error('File is empty')
      const formattedData = data.map((row) => ({
        name: row.Name || row.name,
        contactPerson: row['Contact Person'] || row.contactPerson || row.ContactPerson || row.name || 'Admin',
        phone: String(row.Phone || row.phone),
        email: row.Email || row.email || '',
        gstin: row.GSTIN || row.gstin || '',
        drugLicense: row['Drug License'] || row.drugLicense || row.dlNumber || row.DrugLicense || '',
        address: row.Address || row.address || '',
        paymentTerms: row['Payment Terms'] || row.paymentTerms || row.PaymentTerms || 'NET_30',
        bankDetails: row['Bank Details'] || row.bankDetails || row.BankDetails || '',
      }))
      const res = await importSuppliers(formattedData)
      if (res.skippedCount > 0) {
        toast.warning(`Imported ${res.createdCount} suppliers. Skipped ${res.skippedCount} rows.`)
        if (res.errors?.length) {
          console.warn('Import errors:', res.errors)
        }
      } else {
        toast.success(`Successfully imported ${res.createdCount} suppliers`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to import suppliers')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Filtering happens on the backend — `suppliers` is already the current page
  // of matching results. `totalSuppliers` is the matching-count across all pages.

  // ── Stats (directory-wide, NOT filtered) ──
  const stats = useMemo(() => {
    const activeCount = directorySuppliers.filter((s) => s.isActive).length
    const inactiveCount = directorySuppliers.filter((s) => !s.isActive).length
    return { totalCount: directorySuppliers.length, activeCount, inactiveCount }
  }, [directorySuppliers])

  // ── Pagination (server-driven) ──
  const totalPages = Math.max(1, Math.ceil(totalSuppliers / PAGE_SIZE))
  const paginatedSuppliers = suppliers

  // ── Bulk select ──

  const allOnPageSelected =
    paginatedSuppliers.length > 0 && paginatedSuppliers.every((s) => selectedIds.has(s.id))

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const newSet = new Set(selectedIds)
      paginatedSuppliers.forEach((s) => newSet.delete(s.id))
      setSelectedIds(newSet)
    } else {
      const newSet = new Set(selectedIds)
      paginatedSuppliers.forEach((s) => newSet.add(s.id))
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
    selectedStatus !== 'all' ? selectedStatus : '',
    selectedPaymentTerms !== 'all' ? selectedPaymentTerms : '',
    selectedGstin !== 'all' ? selectedGstin : '',
    outstandingMin,
    outstandingMax,
  ].filter(Boolean).length

  // The form itself + its useForm wiring lives in SupplierFormDialog (shared
  // with the detail page). These helpers just open the dialog in the right mode.
  function openAddDialog() {
    setEditingSupplier(null)
    setDialogOpen(true)
  }

  function openEditDialog(supplier: Supplier) {
    setEditingSupplier(supplier)
    setDialogOpen(true)
  }

  // Supplier queued for deactivate/activate confirmation. Null when dialog
  // is closed.
  const [statusToggleCandidate, setStatusToggleCandidate] = useState<Supplier | null>(null)
  const [statusToggleSubmitting, setStatusToggleSubmitting] = useState(false)

  async function handleDeactivate() {
    if (!statusToggleCandidate) return
    const supplier = statusToggleCandidate
    setStatusToggleSubmitting(true)
    try {
      await api.patch(`/suppliers/${supplier.id}`, { isActive: !supplier.isActive })
      toast.success(`Supplier "${supplier.name}" ${supplier.isActive ? 'deactivated' : 'activated'} successfully`)
      await fetchMasterData()
      setStatusToggleCandidate(null)
    } catch {
      toast.error('Failed to update supplier status.')
    } finally {
      setStatusToggleSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Hidden file input — triggered by the Import button in the filter bar below */}
      <input
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        ref={fileInputRef}
        onChange={handleImport}
      />

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Suppliers',
            value: stats.totalCount.toString(),
            subtitle: 'in directory',
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Active',
            value: stats.activeCount.toString(),
            subtitle: `${stats.inactiveCount} inactive`,
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Total Purchases',
            value: '—',
            subtitle: 'open supplier to view',
            icon: IndianRupee,
            iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            borderAccent: 'border-l-amber-500',
          },
          {
            label: 'Pending Payments',
            value: '—',
            subtitle: 'open supplier to view',
            icon: AlertCircle,
            iconBg: 'bg-red-500/10 text-red-600 dark:text-red-400',
            borderAccent: 'border-l-red-500',
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
        searchPlaceholder="Search name, contact, phone, GSTIN..."
        resultsCount={totalSuppliers}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
              onClick={handleExport}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400 dark:border-amber-800/60 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 dark:hover:border-amber-700"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">{isImporting ? 'Importing…' : 'Import'}</span>
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
              onClick={openAddDialog}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add Supplier</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-400 dark:border-sky-800/60 dark:text-sky-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300 dark:hover:border-sky-700"
              onClick={() => navigate('/purchase/orders')}
            >
              <ClipboardList className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Purchase Orders</span>
              <span className="sm:hidden">POs</span>
            </Button>
          </div>
        }
      >
        {/* Equal-width filter grid — 4 filters served by the backend */}
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Status"
            value={selectedStatus}
            onValueChange={(val) => { setSelectedStatus(val); setCurrentPage(1) }}
            onClear={() => { setSelectedStatus('all'); setCurrentPage(1) }}
            options={STATUS_OPTIONS}
          />
          <EnumSelect
            label="Payment Terms"
            value={selectedPaymentTerms}
            onValueChange={(val) => { setSelectedPaymentTerms(val); setCurrentPage(1) }}
            onClear={() => { setSelectedPaymentTerms('all'); setCurrentPage(1) }}
            options={PAYMENT_TERMS_OPTIONS}
          />
          <EnumSelect
            label="GSTIN"
            value={selectedGstin}
            onValueChange={(val) => { setSelectedGstin(val); setCurrentPage(1) }}
            onClear={() => { setSelectedGstin('all'); setCurrentPage(1) }}
            options={GSTIN_OPTIONS}
          />
          {/* Outstanding range */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Outstanding (₹)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={outstandingMin}
                onChange={(e) => { setOutstandingMin(e.target.value); setCurrentPage(1) }}
                className="w-full"
              />
              <span className="text-muted-foreground text-xs">-</span>
              <Input
                type="number"
                placeholder="Max"
                value={outstandingMax}
                onChange={(e) => { setOutstandingMax(e.target.value); setCurrentPage(1) }}
                className="w-full"
              />
            </div>
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
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 dark:bg-primary/10">
              <Badge variant="default" size="sm" dot>{selectedIds.size} selected</Badge>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = suppliers.filter((s) => selectedIds.has(s.id))
                  exportToCsv(selected.map((s) => ({
                    Name: s.name,
                    Phone: s.phone,
                    Email: s.email ?? '',
                    GSTIN: s.gstin,
                    Status: s.isActive ? 'Active' : 'Inactive',
                  })), 'suppliers-selected')
                }}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const selected = suppliers.filter((s) => selectedIds.has(s.id))
                  printReport(selected.map((s) => ({
                    Name: s.name,
                    Phone: s.phone,
                    Email: s.email ?? '',
                    GSTIN: s.gstin,
                    Status: s.isActive ? 'Active' : 'Inactive',
                  })), 'Suppliers')
                }}>
                  <Printer className="mr-1 h-3.5 w-3.5" />
                  Print
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={async () => {
                  const ok = window.confirm(
                    `Deactivate ${selectedIds.size} supplier${selectedIds.size === 1 ? '' : 's'}? They will be hidden from active lists but their history will be preserved.`,
                  )
                  if (!ok) return
                  try {
                    await Promise.all(
                      [...selectedIds].map((id) => api.patch(`/suppliers/${id}`, { isActive: false }))
                    )
                    toast.success(`${selectedIds.size} supplier(s) deactivated`)
                    setSelectedIds(new Set())
                    await fetchMasterData()
                  } catch {
                    toast.error('Failed to deactivate suppliers')
                  }
                }}>
                  <UserX className="mr-1 h-3.5 w-3.5" />
                  Deactivate
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
          {paginatedSuppliers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No suppliers found</div>
          ) : (
            <div className="divide-y divide-border/40">
              {paginatedSuppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => navigate(`/purchase/suppliers/detail?supplierId=${supplier.id}`)}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate font-medium text-sm">{supplier.name}</p>
                    <p className="text-xs text-muted-foreground">{supplier.contactPerson} · {supplier.phone}</p>
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <Badge variant={supplier.isActive ? 'success' : 'destructive'} dot size="sm">
                        {supplier.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="secondary" size="sm">{supplier.paymentTerms}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="font-mono text-xs text-muted-foreground">{supplier.gstin}</span>
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
              <TableHead>Supplier</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead className="text-center">Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {paginatedSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 dark:bg-muted/20">
                        <Building2 className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">No suppliers found</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/60">Try adjusting your search or filters</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSuppliers.map((supplier, idx) => (
                  <motion.tr
                    key={supplier.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, delay: idx * 0.02 }}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/purchase/suppliers/detail?supplierId=${supplier.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(supplier.id)} onCheckedChange={() => toggleSelectOne(supplier.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-medium">{supplier.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{supplier.contactPerson}</TableCell>
                    <TableCell className="font-mono text-[11px]">{supplier.phone}</TableCell>
                    <TableCell className="font-mono text-[11px]">{supplier.gstin}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" size="sm">{supplier.paymentTerms}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {Number(supplier.currentOutstanding ?? 0) > 0 ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {formatCurrency(Number(supplier.currentOutstanding))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={supplier.isActive ? 'success' : 'destructive'}
                        dot
                        size="sm"
                      >
                        {supplier.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => navigate(`/purchase/suppliers/detail?supplierId=${supplier.id}`)}
                        customActions={[
                          {
                            label: 'Edit',
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => openEditDialog(supplier),
                          },
                          {
                            label: supplier.isActive ? 'Deactivate' : 'Activate',
                            icon: <UserX className="h-4 w-4" />,
                            onClick: () => setStatusToggleCandidate(supplier),
                            variant: supplier.isActive ? 'destructive' : 'default',
                          },
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
          totalItems={totalSuppliers}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* ── Add/Edit Supplier Dialog (shared with detail page) ── */}
      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingSupplier={editingSupplier}
        onSaved={() => { setEditingSupplier(null); void fetchMasterData() }}
      />

      {/* The old "supplier detail modal" was replaced by a full route at
          /purchase/suppliers/detail?supplierId=... — opens via row-click. */}

      {/* Confirm before flipping a supplier's active status — single-row toggle
          previously was a one-click silent change. Bulk had a window.confirm
          since forever; this aligns the single-row UX. */}
      <AlertDialog
        open={!!statusToggleCandidate}
        onOpenChange={(open) => { if (!open) setStatusToggleCandidate(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusToggleCandidate?.isActive ? 'Deactivate' : 'Activate'} this supplier?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {statusToggleCandidate?.isActive
                    ? <>Deactivating <span className="font-semibold">{statusToggleCandidate?.name}</span> hides them from new POs and GRNs. Existing records remain intact.</>
                    : <>Reactivating <span className="font-semibold">{statusToggleCandidate?.name}</span> makes them available again for purchase orders.</>}
                </p>
                {statusToggleCandidate?.isActive && Number(statusToggleCandidate?.currentOutstanding ?? 0) > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⓘ Outstanding balance: {formatCurrency(Number(statusToggleCandidate.currentOutstanding))}. You can still record payments against an inactive supplier.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusToggleSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeactivate() }}
              disabled={statusToggleSubmitting}
              className={statusToggleCandidate?.isActive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {statusToggleSubmitting
                ? 'Saving…'
                : statusToggleCandidate?.isActive ? 'Yes, deactivate' : 'Yes, activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
