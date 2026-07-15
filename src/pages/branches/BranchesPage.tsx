import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  Star,
  IndianRupee,
  TrendingDown,
  Table2,
  LayoutGrid,
  ExternalLink,
  Copy,
  Check,
  UserCheck,
  UserX,
  FileText,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { EnumSelect } from '@/components/shared/EnumSelect'

import api from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import { navigate } from '@/lib/router'
import { useAuthStore } from '@/stores/authStore'
import { isAdminish, userRoles } from '@/types'
import { useBranchStore, type Branch } from '@/stores/branchStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePageFilter } from '@/hooks/usePageFilter'
import { usePageSize } from '@/hooks/usePageSize'

// ── Types ────────────────────────────────────────────────────

interface BranchRow extends Branch {
  invoiceCount?: number
  invoiceTotal?: number
  expenseTotal?: number
}

interface BranchSummary {
  total: number
  active: number
  inactive: number
  totalSales: number
  totalExpenses: number
}

type ViewMode = 'table' | 'grid'

// ── Schemas ──────────────────────────────────────────────────

const branchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  code: z.string().min(1, 'Branch code is required').max(10, 'Code max 10 chars'),
  address: z.string().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number').or(z.literal('')).optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  gstin: z.string().optional(),
  drugLicense: z.string().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
})
type BranchFormValues = z.infer<typeof branchSchema>

// ── Filter option constants ──────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'Any Activity' },
  { value: 'has-sales', label: 'With sales' },
  { value: 'no-sales', label: 'No sales' },
] as const

const VIEW_STORAGE_KEY = 'branches:view'

// ── Page component ───────────────────────────────────────────

export default function BranchesPage() {
  const { user } = useAuthStore()
  const isAdmin = isAdminish(user)
  const canSeeStats = isAdmin || userRoles(user).includes('ACCOUNTANT')

  const { activeBranchId, fetchBranches: refreshSwitcher, setActiveBranch } = useBranchStore()

  // ── Data ──
  const [rows, setRows] = useState<BranchRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<BranchSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── Filters ──
  const [searchQuery, setSearchQuery] = usePageFilter<string>('branches.list', 'search', '')
  const [statusFilter, setStatusFilter] = usePageFilter<string>('branches.list', 'status', 'all')
  const [activityFilter, setActivityFilter] = usePageFilter<string>('branches.list', 'activity', 'all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('pbims.branches.pageSize', 10)

  // ── UI mode ──
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid'
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === 'table' || stored === 'grid' ? stored : 'grid'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  // ── Modals / drawer ──
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [deleting, setDeleting] = useState<Branch | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Form ──
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: { isActive: true, isDefault: false },
  })

  // ── Query builder ──
  const buildQueryParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams()
    params.set('skip', String((currentPage - 1) * pageSize))
    params.set('take', String(pageSize))
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (statusFilter !== 'all') params.set('isActive', statusFilter === 'active' ? 'true' : 'false')
    if (activityFilter !== 'all') params.set('hasSales', activityFilter === 'has-sales' ? 'true' : 'false')
    return params
  }, [currentPage, pageSize, searchQuery, statusFilter, activityFilter])

  // ── Fetch list (debounced on search) ──
  const fetchAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const delay = searchQuery.trim() ? 300 : 0
    const handle = setTimeout(async () => {
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller
      setIsLoading(true)
      try {
        const res = await api.get(`/branches?${buildQueryParams().toString()}`, { signal: controller.signal })
        const payload = res.data
        const items = (payload?.data ?? payload ?? []) as BranchRow[]
        setRows(items)
        setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
      } catch (err: unknown) {
        const e = err as { name?: string; code?: string }
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
          setRows([])
          setTotal(0)
        }
      } finally {
        setIsLoading(false)
      }
    }, delay)
    return () => clearTimeout(handle)
  }, [buildQueryParams, searchQuery])

  // ── Fetch summary (admin/accountant only) ──
  const fetchSummary = useCallback(async () => {
    if (!canSeeStats) {
      setSummary(null)
      return
    }
    try {
      const res = await api.get('/branches/summary')
      setSummary(res.data?.data ?? res.data ?? null)
    } catch {
      setSummary(null)
    }
  }, [canSeeStats])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useBranchRefresh(fetchSummary)

  // Reset to page 1 whenever a filter or search changes
  useEffect(() => { setCurrentPage(1) }, [searchQuery, statusFilter, activityFilter])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (activityFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setStatusFilter('all')
    setActivityFilter('all')
  }

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === drawerId) ?? null,
    [rows, drawerId],
  )

  // ── Dialog handlers ──
  const openAdd = () => {
    setEditing(null)
    reset({
      name: '', code: '', address: '', phone: '', email: '',
      gstin: '', drugLicense: '', isActive: true, isDefault: false,
    })
    setFormOpen(true)
  }

  const openEdit = (b: Branch) => {
    setEditing(b)
    reset({
      name: b.name,
      code: b.code,
      address: b.address ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
      gstin: b.gstin ?? '',
      drugLicense: b.drugLicense ?? '',
      isActive: b.isActive,
      isDefault: b.isDefault,
    })
    setFormOpen(true)
  }

  const refetchEverything = async () => {
    // Force the list to refetch with current params; also refresh the global switcher.
    setCurrentPage((p) => p)
    fetchAbortRef.current = null
    // Trigger the list useEffect by toggling state — easiest is to re-set filters identically.
    setRows((r) => [...r])
    // Genuine refetch:
    const res = await api.get(`/branches?${buildQueryParams().toString()}`).catch(() => null)
    if (res) {
      const payload = res.data
      const items = (payload?.data ?? payload ?? []) as BranchRow[]
      setRows(items)
      setTotal(typeof payload?.total === 'number' ? payload.total : items.length)
    }
    fetchSummary()
    refreshSwitcher()
  }

  const onSubmit = async (data: BranchFormValues) => {
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/branches/${editing.id}`, data)
        toast.success('Branch updated')
      } else {
        await api.post('/branches', data)
        toast.success('Branch created')
      }
      setFormOpen(false)
      await refetchEverything()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save branch'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.delete(`/branches/${deleting.id}`)
      toast.success('Branch deleted')
      if (drawerId === deleting.id) setDrawerId(null)
      await refetchEverything()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to delete branch'
      toast.error(msg)
    } finally {
      setDeleting(null)
    }
  }

  const toggleActive = async (b: Branch) => {
    try {
      await api.patch(`/branches/${b.id}`, { isActive: !b.isActive })
      toast.success(b.isActive ? 'Branch deactivated' : 'Branch activated')
      await refetchEverything()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to update status'
      toast.error(msg)
    }
  }

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* ── Summary stat cards (admin/accountant only) ── */}
      {canSeeStats && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {[
            {
              label: 'Total Branches',
              value: summary ? summary.total.toString() : '—',
              subtitle: summary ? `${summary.active} active` : 'loading…',
              icon: Building2,
              iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
              borderAccent: 'border-l-blue-500',
            },
            {
              label: 'Active',
              value: summary ? summary.active.toString() : '—',
              subtitle: summary
                ? summary.total > 0
                  ? `${Math.round((summary.active / summary.total) * 100)}% of total`
                  : '—'
                : 'loading…',
              icon: CheckCircle2,
              iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              borderAccent: 'border-l-emerald-500',
            },
            {
              label: 'Total Sales',
              value: summary ? formatCurrency(summary.totalSales) : '—',
              subtitle: 'all branches',
              icon: IndianRupee,
              iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
              borderAccent: 'border-l-orange-500',
            },
            {
              label: 'Total Expenses',
              value: summary ? formatCurrency(summary.totalExpenses) : '—',
              subtitle: 'all branches',
              icon: TrendingDown,
              iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
              borderAccent: 'border-l-rose-500',
            },
          ].map((stat) => (
            <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
              <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', stat.iconBg)}>
                  <stat.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  <p className="text-base font-bold leading-tight truncate sm:text-lg" title={stat.value}>{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Active branch callout ── */}
      {activeBranchId && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">
            Active branch: <strong>{rows.find((b) => b.id === activeBranchId)?.name ?? '—'}</strong>
          </span>
          <span className="hidden sm:inline text-muted-foreground ml-auto">
            All new invoices will be tagged to this branch
          </span>
        </div>
      )}

      {/* ── Filter bar ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, code, email, or GSTIN..."
        resultsCount={total}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
            {/* Table/Grid toggle — own full-width row on mobile (keeps it off the
                search row), inline with the actions from sm up. */}
            <div className="flex w-full items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1 dark:bg-muted/20 sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all sm:flex-none',
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-sm dark:bg-card'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Table2 className="h-3.5 w-3.5" />Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all sm:flex-none',
                  viewMode === 'grid'
                    ? 'bg-background text-foreground shadow-sm dark:bg-card'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />Grid
              </button>
            </div>
            {isAdmin && (
              <Button size="sm" className="w-full sm:w-auto" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Add Branch
              </Button>
            )}
          </div>
        }
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EnumSelect
            label="Status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            onClear={() => setStatusFilter('all')}
            options={STATUS_OPTIONS}
          />
          <EnumSelect
            label="Activity"
            value={activityFilter}
            onValueChange={setActivityFilter}
            onClear={() => setActivityFilter('all')}
            options={ACTIVITY_OPTIONS}
          />
        </div>
      </DataTableFilterBar>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Building2}
              title="No branches found"
              description={
                activeFilterCount > 0 || searchQuery
                  ? 'Try adjusting your search or filters.'
                  : isAdmin
                    ? 'Get started by adding your first branch.'
                    : 'No branches available.'
              }
              actionLabel={
                activeFilterCount > 0 || searchQuery
                  ? 'Clear filters'
                  : isAdmin ? 'Add Branch' : undefined
              }
              onAction={
                activeFilterCount > 0 || searchQuery
                  ? () => { clearFilters(); setSearchQuery('') }
                  : isAdmin ? openAdd : undefined
              }
            />
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="overflow-hidden">
          {/* responsive: card list on phones + tablets, table only at lg+ */}
          <div className="lg:hidden divide-y divide-border/40">
            {rows.map((b) => {
              const isActive = b.id === activeBranchId
              return (
                <div
                  key={b.id}
                  className={cn('flex items-start gap-3 p-4 cursor-pointer transition-colors', isActive ? 'bg-primary/5' : 'hover:bg-muted/30')}
                  onClick={() => setDrawerId(b.id)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground font-bold text-xs">
                    {b.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      {b.isDefault && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                          <Star className="h-2.5 w-2.5" />Default
                        </Badge>
                      )}
                      {isActive && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">Current</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {b.phone || '—'}{b.email ? ` · ${b.email}` : ''}
                    </p>
                    {canSeeStats && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{b.invoiceCount ?? 0} inv</span>
                        <span className="font-mono">Sales {formatCurrency(b.invoiceTotal ?? 0)}</span>
                        <span className="font-mono">Exp {formatCurrency(b.expenseTotal ?? 0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={b.isActive ? 'active' : 'inactive'} />
                    <div onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => setDrawerId(b.id)}
                        onEdit={isAdmin ? () => openEdit(b) : undefined}
                        onDelete={isAdmin ? () => setDeleting(b) : undefined}
                        deleteLabel="Delete branch"
                        customActions={[
                          ...(isActive ? [] : [{
                            label: 'Set as Active',
                            icon: <CheckCircle2 className="h-4 w-4" />,
                            onClick: () => setActiveBranch(b.id),
                          }]),
                          ...(isAdmin ? [{
                            label: b.isActive ? 'Deactivate' : 'Activate',
                            icon: b.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
                            onClick: () => toggleActive(b),
                            variant: b.isActive ? 'destructive' as const : 'default' as const,
                          }] : []),
                        ]}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>GSTIN / Drug License</TableHead>
                  {canSeeStats && <TableHead className="text-right">Invoices</TableHead>}
                  {canSeeStats && <TableHead className="text-right">Sales</TableHead>}
                  {canSeeStats && <TableHead className="text-right">Expenses</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => {
                  const isActive = b.id === activeBranchId
                  return (
                    <TableRow
                      key={b.id}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isActive ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/30',
                      )}
                      onClick={() => setDrawerId(b.id)}
                    >
                      <TableCell className={cn(isActive && 'border-l-2 border-primary')}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground font-bold text-xs">
                            {b.code}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{b.name}</p>
                              {b.isDefault && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                                  <Star className="h-2.5 w-2.5" />Default
                                </Badge>
                              )}
                              {isActive && (
                                <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">Current</Badge>
                              )}
                            </div>
                            {b.address && (
                              <p className="text-[11px] text-muted-foreground truncate">{b.address}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-mono">{b.phone || '—'}</span>
                          <span className="text-muted-foreground truncate max-w-50">{b.email || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-[11px] font-mono text-muted-foreground">
                          <span className="truncate max-w-40">{b.gstin || '—'}</span>
                          <span className="truncate max-w-40">{b.drugLicense || '—'}</span>
                        </div>
                      </TableCell>
                      {canSeeStats && (
                        <TableCell className="text-right font-mono text-sm">
                          {b.invoiceCount ?? 0}
                        </TableCell>
                      )}
                      {canSeeStats && (
                        <TableCell className="text-right font-mono text-sm font-semibold whitespace-nowrap">
                          {formatCurrency(b.invoiceTotal ?? 0)}
                        </TableCell>
                      )}
                      {canSeeStats && (
                        <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                          {formatCurrency(b.expenseTotal ?? 0)}
                        </TableCell>
                      )}
                      <TableCell>
                        <StatusBadge status={b.isActive ? 'active' : 'inactive'} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-12">
                        <DataTableRowActions
                          onView={() => setDrawerId(b.id)}
                          onEdit={isAdmin ? () => openEdit(b) : undefined}
                          onDelete={isAdmin ? () => setDeleting(b) : undefined}
                          deleteLabel="Delete branch"
                          customActions={[
                            ...(isActive ? [] : [{
                              label: 'Set as Active',
                              icon: <CheckCircle2 className="h-4 w-4" />,
                              onClick: () => setActiveBranch(b.id),
                            }]),
                            ...(isAdmin ? [{
                              label: b.isActive ? 'Deactivate' : 'Activate',
                              icon: b.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
                              onClick: () => toggleActive(b),
                              variant: b.isActive ? 'destructive' as const : 'default' as const,
                            }] : []),
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
            totalItems={total}
            itemsPerPage={pageSize}
            pageSize={pageSize}
            onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
            className="border-t border-border/40 px-4"
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((b) => {
              const isActive = b.id === activeBranchId
              return (
                <div
                  key={b.id}
                  className={cn(
                    'group relative rounded-xl border bg-card transition-all cursor-pointer hover:shadow-md',
                    isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border/60',
                  )}
                  onClick={() => setDrawerId(b.id)}
                >
                  <div className="flex items-start justify-between gap-2 p-4 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-sm',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        {b.code}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{b.name}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {b.isDefault && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                              <Star className="h-2.5 w-2.5" />Default
                            </Badge>
                          )}
                          {!b.isActive && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Inactive</Badge>
                          )}
                          {isActive && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">Current</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DataTableRowActions
                        onView={() => setDrawerId(b.id)}
                        onEdit={isAdmin ? () => openEdit(b) : undefined}
                        onDelete={isAdmin ? () => setDeleting(b) : undefined}
                        deleteLabel="Delete branch"
                        customActions={[
                          ...(isActive ? [] : [{
                            label: 'Set as Active',
                            icon: <CheckCircle2 className="h-4 w-4" />,
                            onClick: () => setActiveBranch(b.id),
                          }]),
                          ...(isAdmin ? [{
                            label: b.isActive ? 'Deactivate' : 'Activate',
                            icon: b.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
                            onClick: () => toggleActive(b),
                            variant: b.isActive ? 'destructive' as const : 'default' as const,
                          }] : []),
                        ]}
                      />
                    </div>
                  </div>

                  <div className="px-4 pb-3 space-y-1.5">
                    {b.address && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground line-clamp-2">
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                        {b.address}
                      </p>
                    )}
                    {b.phone && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{b.phone}</span>
                      </p>
                    )}
                    {b.email && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{b.email}</span>
                      </p>
                    )}
                  </div>

                  {canSeeStats && (
                    <div className="grid grid-cols-3 gap-1 border-t border-border/40 bg-muted/20 px-2 py-2 text-center">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</p>
                        <p className="text-xs font-bold font-mono">{b.invoiceCount ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sales</p>
                        <p className="text-xs font-bold font-mono">{formatCurrency(b.invoiceTotal ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Expenses</p>
                        <p className="text-xs font-bold font-mono">{formatCurrency(b.expenseTotal ?? 0)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={total}
            itemsPerPage={pageSize}
            pageSize={pageSize}
            onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
            className="border-t border-border/40 px-4"
          />
        </Card>
      )}

      {/* ── Drawer ── */}
      <Sheet open={!!drawerId} onOpenChange={(open) => { if (!open) setDrawerId(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-170 p-0 gap-0 flex flex-col"
        >
          {selectedRow && (
            <BranchDrawerBody
              b={selectedRow}
              isActive={selectedRow.id === activeBranchId}
              canSeeStats={canSeeStats}
              isAdmin={isAdmin}
              onSetActive={() => setActiveBranch(selectedRow.id)}
              onEdit={() => openEdit(selectedRow)}
              onToggle={() => toggleActive(selectedRow)}
              onDelete={() => setDeleting(selectedRow)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Add/Edit drawer ── */}
      {isAdmin && (
        <Sheet open={formOpen} onOpenChange={setFormOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-140 p-0 gap-0 flex flex-col"
          >
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0 space-y-0">
              <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <SheetTitle>{editing ? 'Edit Branch' : 'Add New Branch'}</SheetTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {editing ? 'Update branch information' : 'Create a new pharmacy location'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
                  <Controller
                    control={control}
                    name="isActive"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="isActive" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">Active</Label>
                        <Switch checked={field.value} onCheckedChange={field.onChange} id="isActive" />
                      </div>
                    )}
                  />
                  <Controller
                    control={control}
                    name="isDefault"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="isDefault" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">Set as Default</Label>
                        <Switch checked={field.value} onCheckedChange={field.onChange} id="isDefault" />
                      </div>
                    )}
                  />
                </div>
              </div>
            </SheetHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Branch Name *</Label>
                    <Input {...register('name')} placeholder="Main Branch" />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Branch Code *</Label>
                    <Input {...register('code')} placeholder="HQ" className="uppercase" />
                    {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Textarea {...register('address')} placeholder="Full address" rows={2} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="9876543210"
                      {...register('phone')}
                      // Accept digits only, capped at 10 (overrides register's onChange).
                      onChange={(e) => setValue('phone', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input {...register('email')} placeholder="branch@pharmacy.com" />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>GSTIN</Label>
                    <Input
                      className="uppercase"
                      maxLength={15}
                      placeholder="22AAAAA0000A1Z5"
                      {...register('gstin')}
                      // GSTIN is 15 uppercase alphanumerics — force case, strip the rest, cap at 15.
                      onChange={(e) => setValue('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), { shouldValidate: true, shouldDirty: true })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Drug License No.</Label>
                    <Input {...register('drugLicense')} placeholder="DL-XXXX" />
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-3 bg-background border-t border-border/40">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create Branch'}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      )}

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>?
              Invoices linked to this branch will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Drawer body ──────────────────────────────────────────────

function BranchDrawerBody({
  b,
  isActive,
  canSeeStats,
  isAdmin,
  onSetActive,
  onEdit,
  onToggle,
  onDelete,
}: {
  b: BranchRow
  isActive: boolean
  canSeeStats: boolean
  isAdmin: boolean
  onSetActive: () => void
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copy = async (text: string, key: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <>
      {/* Sticky header */}
      <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
        <div className="flex items-center justify-between gap-3 pr-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-sm',
              isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              {b.code}
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold truncate">{b.name}</SheetTitle>
              <p className="text-[11px] text-muted-foreground truncate">{b.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {b.isDefault && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
                <Star className="h-2.5 w-2.5" />Default
              </Badge>
            )}
            <StatusBadge status={b.isActive ? 'active' : 'inactive'} />
          </div>
        </div>
      </SheetHeader>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Meta strip — 2x2 grid (single column on mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
          {/* Address — top-left */}
          <div className="min-w-0 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Address
            </p>
            <p className="mt-0.5 text-sm font-medium wrap-break-word" title={b.address ?? ''}>
              {b.address || '—'}
            </p>
          </div>
          {/* Phone — top-right */}
          <div className="min-w-0 px-4 py-3 border-t sm:border-t-0 sm:border-l border-border/40">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Phone className="h-3 w-3" /> Phone
            </p>
            {b.phone ? (
              <button
                type="button"
                onClick={() => copy(b.phone!, 'phone')}
                className="mt-0.5 flex items-center gap-1 font-mono text-sm hover:text-primary transition-colors"
                title="Click to copy"
              >
                <span>{b.phone}</span>
                {copiedKey === 'phone'
                  ? <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                  : <Copy className="h-3 w-3 shrink-0 opacity-40" />}
              </button>
            ) : (
              <p className="mt-0.5 text-sm font-medium">—</p>
            )}
          </div>
          {/* GSTIN — bottom-left */}
          <div className="min-w-0 px-4 py-3 border-t border-border/40">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">GSTIN</p>
            {b.gstin ? (
              <button
                type="button"
                onClick={() => copy(b.gstin!, 'gstin')}
                className="mt-0.5 flex items-center gap-1 font-mono text-xs hover:text-primary transition-colors"
                title="Click to copy"
              >
                <span className="truncate">{b.gstin}</span>
                {copiedKey === 'gstin'
                  ? <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                  : <Copy className="h-3 w-3 shrink-0 opacity-40" />}
              </button>
            ) : (
              <p className="mt-0.5 text-sm font-medium">—</p>
            )}
          </div>
          {/* Drug License — bottom-right */}
          <div className="min-w-0 px-4 py-3 border-t sm:border-l border-border/40">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Drug License</p>
            {b.drugLicense ? (
              <button
                type="button"
                onClick={() => copy(b.drugLicense!, 'license')}
                className="mt-0.5 flex items-center gap-1 font-mono text-xs hover:text-primary transition-colors"
                title="Click to copy"
              >
                <span className="truncate">{b.drugLicense}</span>
                {copiedKey === 'license'
                  ? <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                  : <Copy className="h-3 w-3 shrink-0 opacity-40" />}
              </button>
            ) : (
              <p className="mt-0.5 text-sm font-medium">—</p>
            )}
          </div>
        </div>

        {/* KPI cards */}
        {canSeeStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-l-[3px] border-l-blue-500">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3" /> Invoices
                </p>
                <p className="mt-1 font-mono text-xl font-bold">{b.invoiceCount ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="border-l-[3px] border-l-emerald-500">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <IndianRupee className="h-3 w-3" /> Total Sales
                </p>
                <p className="mt-1 font-mono text-xl font-bold">{formatCurrency(b.invoiceTotal ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-[3px] border-l-rose-500">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="h-3 w-3" /> Total Expenses
                </p>
                <p className="mt-1 font-mono text-xl font-bold">{formatCurrency(b.expenseTotal ?? 0)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* View invoices link */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Related
          </p>
          <button
            type="button"
            onClick={() => navigate(`/billing/sales?branchId=${encodeURIComponent(b.id)}`)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View invoices for this branch
          </button>
        </div>
      </div>

      {/* Sticky footer */}
      {/* responsive: 2-up grid on phones so the action labels fit; inline row at sm+ */}
      <div className="shrink-0 border-t border-border/40 bg-background px-5 py-3 grid grid-cols-2 gap-2 sm:flex">
        <Button
          size="sm"
          className="flex-1 gap-2"
          disabled={isActive}
          onClick={onSetActive}
        >
          <CheckCircle2 className="h-4 w-4" />
          {isActive ? 'Current' : 'Set as Active'}
        </Button>
        {isAdmin && (
          <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={onToggle}
          >
            {b.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {b.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        )}
        {isAdmin && (
          <Button variant="destructive" size="sm" className="gap-2" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </>
  )
}
