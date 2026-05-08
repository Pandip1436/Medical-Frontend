import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Pencil,
  UserX,
  Phone,
  Mail,
  MapPin,
  IndianRupee,
  TrendingUp,
  Building2,
  Download,
  Printer,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
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
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { exportToCsv, printReport } from '@/lib/exportUtils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import type { Supplier } from '@/types'

// ─────────────────────────────────────────────────────────────
// Supplier form schema
// ─────────────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d+$/, 'Phone must contain only digits'),
  email: z.string().email('Invalid email address'),
  gstin: z
    .string()
    .length(15, 'GSTIN must be 15 characters')
    // Standard GSTIN format: 2-digit state + 10-char PAN + entity code + Z + check digit
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      'Invalid GSTIN format (e.g. 33ABCDE1234F1Z5)',
    ),
  drugLicense: z
    .string()
    .min(5, 'Drug license number required')
    // Allow alphanumeric + hyphen/slash, common for state-issued numbers
    .regex(/^[A-Za-z0-9\-/]+$/, 'Drug license can only contain letters, digits, - and /'),
  address: z.string().min(10, 'Address is required'),
  paymentTerms: z.enum(['NET_30', 'NET_45', 'NET_60'], {
    message: 'Select payment terms',
  }),
  bankDetails: z.string().optional(),
})

type SupplierForm = z.input<typeof supplierSchema>

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

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { suppliers, fetchMasterData } = useMasterDataStore()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMasterData() }, [])
  useBranchRefresh(fetchMasterData)

  // Search
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedPaymentTerms, setSelectedPaymentTerms] = useState<string>('all')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null)
  const [supplierStats, setSupplierStats] = useState<{
    totalPurchases: number; pendingPayment: number; ordersThisYear: number
  } | null>(null)

  const fetchSupplierStats = async (supplierId: string) => {
    setSupplierStats(null)
    try {
      const res = await api.get(`/reports/financial/supplier-ledger/${supplierId}`)
      const kpis = res.data?.kpis
      if (kpis) {
        setSupplierStats({
          totalPurchases: kpis.totalPurchases ?? 0,
          pendingPayment: kpis.outstandingBalance ?? 0,
          ordersThisYear: kpis.totalTransactions ?? 0,
        })
      }
    } catch {
      setSupplierStats(null)
    }
  }

  const clearFilters = () => {
    setSelectedStatus('all')
    setSelectedPaymentTerms('all')
  }

  // ── Filtering logic ──

  const filteredSuppliers = useMemo(() => {
    let result = [...suppliers]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          (s.name?.toLowerCase().includes(q) || false) ||
          (s.contactPerson?.toLowerCase().includes(q) || false) ||
          (s.phone?.includes(q) || false) ||
          (s.gstin?.toLowerCase().includes(q) || false)
      )
    }

    // Status
    if (selectedStatus !== 'all') {
      const isActive = selectedStatus === 'ACTIVE'
      result = result.filter((s) => s.isActive === isActive)
    }

    // Payment Terms
    if (selectedPaymentTerms !== 'all') {
      result = result.filter((s) => s.paymentTerms === selectedPaymentTerms)
    }

    return result
  }, [suppliers, searchQuery, selectedStatus, selectedPaymentTerms])

  // ── Stats ──

  const stats = useMemo(() => {
    const activeCount = suppliers.filter((s) => s.isActive).length
    const inactiveCount = suppliers.filter((s) => !s.isActive).length
    return { totalCount: suppliers.length, activeCount, inactiveCount }
  }, [suppliers])

  // ── Pagination ──

  const totalPages = Math.ceil(filteredSuppliers.length / PAGE_SIZE)
  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )
  const rangeStart = filteredSuppliers.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredSuppliers.length)

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
  ].filter(Boolean).length

  // ── Form ──
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      gstin: '',
      drugLicense: '',
      address: '',
      paymentTerms: 'NET_30',
      bankDetails: '',
    },
  })

  function openAddDialog() {
    setEditingSupplier(null)
    reset({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      gstin: '',
      drugLicense: '',
      address: '',
      paymentTerms: 'NET_30',
      bankDetails: '',
    })
    setDialogOpen(true)
  }

  function openEditDialog(supplier: Supplier) {
    setEditingSupplier(supplier)
    reset({
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      gstin: supplier.gstin,
      drugLicense: supplier.drugLicense,
      address: supplier.address,
      paymentTerms: supplier.paymentTerms,
      bankDetails: supplier.bankDetails || '',
    })
    setDialogOpen(true)
  }

  async function onSubmit(data: SupplierForm) {
    try {
      if (editingSupplier) {
        await api.patch(`/suppliers/${editingSupplier.id}`, data)
        toast.success(`Supplier "${data.name}" updated successfully`)
      } else {
        await api.post('/suppliers', data)
        toast.success(`Supplier "${data.name}" added successfully`)
      }
      setDialogOpen(false)
      reset()
      setEditingSupplier(null)
      await fetchMasterData()
    } catch {
      toast.error('Failed to save supplier. Please try again.')
    }
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
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your supplier directory and relationships
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Supplier
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/purchase/orders')}>
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Purchase Orders
          </Button>
        </div>
      </div>

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
        resultsCount={filteredSuppliers.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => { clearFilters(); setCurrentPage(1) }}
      >
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
                  const selected = filteredSuppliers.filter((s) => selectedIds.has(s.id))
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
                  const selected = filteredSuppliers.filter((s) => selectedIds.has(s.id))
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
                  onClick={() => { setDetailSupplier(supplier); fetchSupplierStats(supplier.id) }}
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
              <TableHead className="text-right">Outstanding</TableHead>
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
                    onClick={() => { setDetailSupplier(supplier); fetchSupplierStats(supplier.id) }}
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
                    <TableCell className="text-right font-mono text-xs">
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
                        onView={() => { setDetailSupplier(supplier); fetchSupplierStats(supplier.id) }}
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

        {/* Pagination */}
        <div className="flex flex-col items-center gap-2 border-t border-border/40 px-4 py-3 sm:flex-row sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{rangeStart}-{rangeEnd}</span> of{' '}
            <span className="font-medium text-foreground">{filteredSuppliers.length}</span> results
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

      {/* ── Add/Edit Supplier Dialog ──────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Update supplier information below.'
                : 'Fill in the supplier details to add them to your directory.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Company Name
                </Label>
                <Input placeholder="e.g. Cipla Ltd" {...register('name')} />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact Person
                </Label>
                <Input placeholder="e.g. Arun Menon" {...register('contactPerson')} />
                {errors.contactPerson && (
                  <p className="text-xs text-destructive">{errors.contactPerson.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Phone
                </Label>
                <Input placeholder="10-digit phone number" {...register('phone')} />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input type="email" placeholder="supplier@company.com" {...register('email')} />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  GSTIN
                </Label>
                <Input placeholder="15-character GSTIN" className="font-mono" {...register('gstin')} />
                {errors.gstin && (
                  <p className="text-xs text-destructive">{errors.gstin.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Drug License #
                </Label>
                <Input placeholder="Drug license number" className="font-mono" {...register('drugLicense')} />
                {errors.drugLicense && (
                  <p className="text-xs text-destructive">{errors.drugLicense.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Address
              </Label>
              <Textarea placeholder="Full address" {...register('address')} />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Terms
                </Label>
                <Select
                  defaultValue={editingSupplier?.paymentTerms || 'NET_30'}
                  onValueChange={(val) =>
                    setValue('paymentTerms', val as 'NET_30' | 'NET_45' | 'NET_60')
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select payment terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NET_30">Net 30</SelectItem>
                    <SelectItem value="NET_45">Net 45</SelectItem>
                    <SelectItem value="NET_60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
                {errors.paymentTerms && (
                  <p className="text-xs text-destructive">{errors.paymentTerms.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bank Details
                </Label>
                <Input
                  placeholder="Bank, A/c, IFSC (optional)"
                  {...register('bankDetails')}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingSupplier ? 'Update Supplier' : 'Add Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Supplier Detail Dialog ────────────────────────── */}
      <Dialog
        open={!!detailSupplier}
        onOpenChange={(open) => !open && setDetailSupplier(null)}
      >
        {detailSupplier && (
          <DialogContent className="max-w-2xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {detailSupplier.name}
              </DialogTitle>
              <DialogDescription>
                Supplier details and business summary
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{detailSupplier.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{detailSupplier.email}</span>
                </div>
                <div className="col-span-2 flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>{detailSupplier.address}</span>
                </div>
              </div>

              <Separator className="bg-border/60" />

              {/* Compliance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GSTIN</span>
                  <p className="mt-1 font-mono">{detailSupplier.gstin}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Drug License</span>
                  <p className="mt-1 font-mono">{detailSupplier.drugLicense}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Terms</span>
                  <p className="mt-1 font-medium">{detailSupplier.paymentTerms}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                  <p className="mt-1">
                    <Badge
                      variant={detailSupplier.isActive ? 'success' : 'destructive'}
                      dot
                      size="sm"
                    >
                      {detailSupplier.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </p>
                </div>
              </div>

              <Separator className="bg-border/60" />

              {/* Business summary */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Business Summary
                </h4>
                {supplierStats === null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <div className="h-4 w-4 rounded-full border-b-2 border-primary animate-spin" />
                    Loading...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <IndianRupee className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                        <p className="font-mono text-lg font-bold">
                          {formatCurrency(supplierStats.totalPurchases)}
                        </p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Total Purchases
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <TrendingUp className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                        <p className="font-mono text-lg font-bold">
                          {supplierStats.ordersThisYear}
                        </p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Transactions
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <IndianRupee className="mx-auto mb-1 h-4 w-4 text-amber-500" />
                        <p className="font-mono text-lg font-bold">
                          {formatCurrency(supplierStats.pendingPayment)}
                        </p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Outstanding
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>

              {detailSupplier.bankDetails && (
                <>
                  <Separator className="bg-border/60" />
                  <div className="text-sm">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Bank Details
                    </span>
                    <p className="mt-1">{detailSupplier.bankDetails}</p>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailSupplier(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setDetailSupplier(null)
                  openEditDialog(detailSupplier)
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Supplier
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

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
