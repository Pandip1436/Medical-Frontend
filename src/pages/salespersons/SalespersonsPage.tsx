import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  Plus,
  UserCheck,
  UserX,
  Phone,
  Mail,
  Pencil,
  TrendingUp,
  Award,
  Users,
  IndianRupee,
  ChevronRight,
  ExternalLink,
  FileText,
  Copy,
  Check,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

import { useAuthStore } from '@/stores/authStore'
import { useBranchStore } from '@/stores/branchStore'
import api from '@/lib/api'
import { navigate } from '@/lib/router'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Salesperson, Invoice } from '@/types'

// ─── Avatar helpers ───────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
]

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(name: string) {
  const code = name.trim().charCodeAt(0) || 0
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length]
}

function formatLastLogin(iso?: string) {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return formatDistanceToNow(d, { addSuffix: true })
}

// ─── Report row type (from /salespersons/report) ──────────────

interface ReportRow {
  salespersonId: string
  name: string
  isActive: boolean
  invoiceCount: number
  totalSales: number
}

// ─── Zod schemas ──────────────────────────────────────────────

const baseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
  branchId: z.string().min(1, 'Branch is required'),
  commissionRate: z
    .number({ error: 'Commission must be a number' })
    .min(0, 'Commission cannot be negative')
    .max(100, 'Commission cannot exceed 100%'),
  password: z.string().optional(),
})

const editSchema = baseSchema
const createSchema = baseSchema.extend({
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormValues = z.infer<typeof baseSchema>

// ─── Stat card config ─────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

const LOGIN_OPTIONS = [
  { value: 'all', label: 'Any Login Activity' },
  { value: 'week', label: 'Logged in · last 7 days' },
  { value: 'month', label: 'Logged in · last 30 days' },
  { value: 'dormant', label: 'Dormant · 30+ days' },
  { value: 'never', label: 'Never logged in' },
] as const

const PERFORMANCE_OPTIONS = [
  { value: 'all', label: 'Any Performance' },
  { value: 'has-sales', label: 'Has sales (MTD)' },
  { value: 'no-sales', label: 'No sales (MTD)' },
] as const

// ─── Page component ───────────────────────────────────────────

export default function SalespersonsPage() {
  const { user } = useAuthStore()
  const { branches, fetchBranches } = useBranchStore()
  const isAdmin = user?.role === 'ADMIN'

  // ── Data ──
  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [salesByPerson, setSalesByPerson] = useState<Record<string, ReportRow>>({})
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ── List view state ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [loginFilter, setLoginFilter] = useState<string>('all')
  const [perfFilter, setPerfFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // ── Drawer state ──
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Edit dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Salesperson | null>(null)
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: { branchId: '', commissionRate: 0 },
  })

  const watchBranchId = watch('branchId')

  // ── Effects ──
  useEffect(() => { fetchBranches() }, [fetchBranches])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    const today = new Date()
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr = today.toISOString().slice(0, 10)
    try {
      const [spRes, repRes, invRes] = await Promise.all([
        api.get('/salespersons'),
        api.get('/salespersons/report', { params: { from: monthStart, to: todayStr } }),
        api.get('/billing'),
      ])
      setSalespersons(spRes.data)
      const map: Record<string, ReportRow> = {}
      for (const r of repRes.data as ReportRow[]) map[r.salespersonId] = r
      setSalesByPerson(map)
      setAllInvoices(invRes.data ?? [])
    } catch {
      toast.error('Failed to load salespersons')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived ──
  const getBranchName = (branchId?: string) => {
    if (!branchId) return ''
    return branches.find((b) => b.id === branchId)?.name ?? '—'
  }

  const branchOptions = useMemo(() => ([
    { value: 'all', label: 'All Branches' },
    ...branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name })),
  ]), [branches])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    return salespersons.filter((sp) => {
      if (q) {
        const hit =
          sp.name.toLowerCase().includes(q) ||
          sp.email.toLowerCase().includes(q) ||
          sp.phone.includes(q)
        if (!hit) return false
      }
      if (statusFilter === 'active' && !sp.isActive) return false
      if (statusFilter === 'inactive' && sp.isActive) return false
      if (branchFilter !== 'all' && sp.branchId !== branchFilter) return false

      // Last login bucket
      if (loginFilter !== 'all') {
        const ts = sp.lastLogin ? new Date(sp.lastLogin).getTime() : NaN
        const hasLogin = Number.isFinite(ts)
        const ageDays = hasLogin ? (now - ts) / DAY : Infinity
        if (loginFilter === 'never' && hasLogin) return false
        if (loginFilter === 'week' && !(hasLogin && ageDays <= 7)) return false
        if (loginFilter === 'month' && !(hasLogin && ageDays <= 30)) return false
        if (loginFilter === 'dormant' && !(hasLogin && ageDays > 30)) return false
      }

      // Performance bucket — based on /salespersons/report MTD totals
      if (perfFilter !== 'all') {
        const row = salesByPerson[sp.id]
        const hasSales = !!row && row.totalSales > 0
        if (perfFilter === 'has-sales' && !hasSales) return false
        if (perfFilter === 'no-sales' && hasSales) return false
      }
      return true
    })
  }, [salespersons, search, statusFilter, branchFilter, loginFilter, perfFilter, salesByPerson])

  useEffect(() => { setCurrentPage(1) }, [search, statusFilter, branchFilter, loginFilter, perfFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (branchFilter !== 'all' ? 1 : 0) +
    (loginFilter !== 'all' ? 1 : 0) +
    (perfFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setStatusFilter('all')
    setBranchFilter('all')
    setLoginFilter('all')
    setPerfFilter('all')
  }

  // ── Stats ──
  const stats = useMemo(() => {
    const total = salespersons.length
    const active = salespersons.filter((s) => s.isActive).length
    const totalSales = Object.values(salesByPerson).reduce((sum, r) => sum + r.totalSales, 0)
    const totalInvoices = Object.values(salesByPerson).reduce((sum, r) => sum + r.invoiceCount, 0)
    const top = Object.values(salesByPerson).reduce<ReportRow | null>((best, r) => {
      if (!best || r.totalSales > best.totalSales) return r
      return best
    }, null)
    return {
      total, active,
      activePct: total > 0 ? Math.round((active / total) * 100) : 0,
      totalSales, totalInvoices,
      top,
    }
  }, [salespersons, salesByPerson])

  // ── Selected salesperson ──
  const selected = useMemo(
    () => salespersons.find((s) => s.id === selectedId) ?? null,
    [salespersons, selectedId]
  )

  const recentInvoicesForSelected = useMemo(() => {
    if (!selected) return []
    return allInvoices
      .filter((inv) => inv.salespersonId === selected.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)
  }, [allInvoices, selected])

  // ── Dialog handlers ──
  const openCreate = () => {
    setEditing(null)
    reset({ name: '', email: '', phone: '', password: '', branchId: '', commissionRate: 0 })
    setDialogOpen(true)
  }

  const openEdit = (sp: Salesperson) => {
    setEditing(sp)
    reset({
      name: sp.name,
      email: sp.email,
      phone: sp.phone,
      password: '',
      branchId: sp.branchId ?? '',
      commissionRate: sp.commissionRate ?? 0,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (values: FormValues) => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        email: values.email,
        phone: values.phone,
        branchId: values.branchId,
        commissionRate: values.commissionRate,
      }
      if (values.password) payload.password = values.password
      if (editing) {
        await api.patch(`/salespersons/${editing.id}`, payload)
        toast.success('Salesperson updated')
      } else {
        await api.post('/salespersons', payload)
        toast.success('Salesperson created')
      }
      setDialogOpen(false)
      fetchAll()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save salesperson'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (sp: Salesperson) => {
    try {
      await api.patch(`/salespersons/${sp.id}/toggle`)
      toast.success(sp.isActive ? 'Salesperson deactivated' : 'Salesperson activated')
      fetchAll()
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ── Render ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Salespersons',
            value: stats.total.toString(),
            subtitle: `${stats.active} active`,
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Active',
            value: stats.active.toString(),
            subtitle: `${stats.activePct}% of total`,
            icon: UserCheck,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Total Sales MTD',
            value: formatCurrency(stats.totalSales),
            subtitle: `${stats.totalInvoices} invoices`,
            icon: TrendingUp,
            iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
            borderAccent: 'border-l-orange-500',
          },
          {
            label: 'Top Performer',
            value: stats.top?.name ?? '—',
            subtitle: stats.top ? formatCurrency(stats.top.totalSales) : 'No sales yet',
            icon: Award,
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
                <p className="text-lg font-bold leading-tight truncate" title={stat.value}>{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or phone..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={isAdmin ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Salesperson
          </Button>
        ) : undefined}
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EnumSelect
            label="Status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            onClear={() => setStatusFilter('all')}
            options={STATUS_OPTIONS}
          />
          <EnumSelect
            label="Branch"
            value={branchFilter}
            onValueChange={setBranchFilter}
            onClear={() => setBranchFilter('all')}
            options={branchOptions}
          />
          <EnumSelect
            label="Last Login"
            value={loginFilter}
            onValueChange={setLoginFilter}
            onClear={() => setLoginFilter('all')}
            options={LOGIN_OPTIONS}
          />
          <EnumSelect
            label="Performance (MTD)"
            value={perfFilter}
            onValueChange={setPerfFilter}
            onClear={() => setPerfFilter('all')}
            options={PERFORMANCE_OPTIONS}
          />
        </div>
      </DataTableFilterBar>

      {/* ── List body ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No salespersons found"
              description={
                activeFilterCount > 0 || search
                  ? 'Try adjusting your search or filters.'
                  : isAdmin
                    ? 'Get started by adding your first salesperson.'
                    : 'No salespersons available.'
              }
              actionLabel={
                activeFilterCount > 0 || search
                  ? 'Clear filters'
                  : isAdmin ? 'Add Salesperson' : undefined
              }
              onAction={
                activeFilterCount > 0 || search
                  ? () => { clearFilters(); setSearch('') }
                  : isAdmin ? openCreate : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="overflow-hidden">
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Sales MTD</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((sp) => {
                  const row = salesByPerson[sp.id]
                  return (
                    <TableRow
                      key={sp.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setSelectedId(sp.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className={cn('text-xs font-bold', getAvatarColor(sp.name))}>
                              {getInitials(sp.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{sp.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{sp.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{sp.phone}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{getBranchName(sp.branchId) || '—'}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                        {Number(sp.commissionRate ?? 0).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {row ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(row.totalSales)}</span>
                            <span className="text-[10px] text-muted-foreground">{row.invoiceCount} inv</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatLastLogin(sp.lastLogin)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={sp.isActive ? 'active' : 'inactive'} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-12">
                        {isAdmin && (
                          <DataTableRowActions
                            onView={() => setSelectedId(sp.id)}
                            onEdit={() => openEdit(sp)}
                            customActions={[
                              {
                                label: 'View Full Report',
                                icon: <ExternalLink className="h-4 w-4" />,
                                onClick: () => navigate(`/salespersons/report?salespersonId=${encodeURIComponent(sp.id)}`),
                              },
                              {
                                label: sp.isActive ? 'Deactivate' : 'Activate',
                                icon: sp.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />,
                                onClick: () => handleToggle(sp),
                                variant: sp.isActive ? 'destructive' : 'default',
                              },
                            ]}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>

            {/* Mobile list — hidden on md+ */}
            <div className="md:hidden divide-y divide-border/40">
              {paginated.map((sp) => {
                const row = salesByPerson[sp.id]
                return (
                  <div
                    key={sp.id}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedId(sp.id)}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn('text-xs font-bold', getAvatarColor(sp.name))}>
                        {getInitials(sp.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{sp.name}</p>
                        <StatusBadge status={sp.isActive ? 'active' : 'inactive'} />
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{sp.email}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground truncate">
                          {sp.phone} · {getBranchName(sp.branchId) || 'No branch'}
                        </span>
                        {row && (
                          <span className="font-mono text-xs font-semibold whitespace-nowrap">
                            {formatCurrency(row.totalSales)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                )
              })}
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
        </>
      )}

      {/* ── Detail drawer ── */}
      <Sheet open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[760px] p-0 gap-0 flex flex-col"
        >
          {selected && (
            <SalespersonDrawerBody
              sp={selected}
              branchName={getBranchName(selected.branchId)}
              report={salesByPerson[selected.id]}
              invoices={recentInvoicesForSelected}
              isAdmin={isAdmin}
              onEdit={() => openEdit(selected)}
              onToggle={() => handleToggle(selected)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Add/Edit dialog ── */}
      {isAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Salesperson' : 'Add Salesperson'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" {...register('name')} placeholder="John Doe" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" {...register('phone')} placeholder="9876543210" maxLength={10} />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...register('email')} placeholder="john@example.com" />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Branch</Label>
                  <Select
                    value={watchBranchId}
                    onValueChange={(val) => setValue('branchId', val, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch..." />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.filter((b) => b.isActive).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} <span className="text-muted-foreground text-xs">({b.code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.branchId && <p className="text-xs text-destructive">{errors.branchId.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="commissionRate">Commission (%)</Label>
                  <Input
                    id="commissionRate"
                    type="number"
                    step="0.5"
                    min={0}
                    max={100}
                    {...register('commissionRate', { valueAsNumber: true })}
                    placeholder="0"
                  />
                  {errors.commissionRate && <p className="text-xs text-destructive">{errors.commissionRate.message}</p>}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="password">
                    {editing ? 'New Password (leave blank to keep current)' : 'Password'}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    {...register('password')}
                    placeholder={editing ? '••••••••' : 'Min 6 characters'}
                  />
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </motion.div>
  )
}

// ─── Drawer body ──────────────────────────────────────────────

function SalespersonDrawerBody({
  sp,
  branchName,
  report,
  invoices,
  isAdmin,
  onEdit,
  onToggle,
}: {
  sp: Salesperson
  branchName: string
  report?: ReportRow
  invoices: Invoice[]
  isAdmin: boolean
  onEdit: () => void
  onToggle: () => void
}) {
  const [phoneCopied, setPhoneCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)

  const copy = async (text: string, kind: 'phone' | 'email') => {
    try {
      await navigator.clipboard.writeText(text)
      if (kind === 'phone') { setPhoneCopied(true); setTimeout(() => setPhoneCopied(false), 1200) }
      else { setEmailCopied(true); setTimeout(() => setEmailCopied(false), 1200) }
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
            <Avatar className="h-11 w-11">
              <AvatarFallback className={cn('text-sm font-bold', getAvatarColor(sp.name))}>
                {getInitials(sp.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold truncate">{sp.name}</SheetTitle>
              <p className="text-[11px] text-muted-foreground truncate">{sp.email}</p>
            </div>
          </div>
          <StatusBadge status={sp.isActive ? 'active' : 'inactive'} />
        </div>
      </SheetHeader>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Meta strip — Email / Phone / Branch / Commission */}
        <div className="flex items-stretch overflow-x-auto rounded-xl border border-border/40 bg-muted/20">
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Mail className="h-3 w-3" /> Email
            </p>
            <button
              type="button"
              onClick={() => copy(sp.email, 'email')}
              className="mt-0.5 flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors min-w-0"
              title="Click to copy"
            >
              <span className="truncate">{sp.email}</span>
              {emailCopied ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Copy className="h-3 w-3 shrink-0 opacity-40" />}
            </button>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Phone className="h-3 w-3" /> Phone
            </p>
            <button
              type="button"
              onClick={() => copy(sp.phone, 'phone')}
              className="mt-0.5 flex items-center gap-1 font-mono text-sm hover:text-primary transition-colors"
              title="Click to copy"
            >
              <span>{sp.phone}</span>
              {phoneCopied ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Copy className="h-3 w-3 shrink-0 opacity-40" />}
            </button>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Branch</p>
            <p className="mt-0.5 text-sm font-medium truncate" title={branchName}>{branchName || '—'}</p>
          </div>
          <div className="flex min-w-0 flex-1 basis-0 flex-col justify-center border-l border-border/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Commission</p>
            <p className="mt-0.5 font-mono text-sm font-medium">{Number(sp.commissionRate ?? 0).toFixed(1)}%</p>
          </div>
        </div>

        {/* KPI cards — 3 up */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-l-[3px] border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-3 w-3" /> Sales Count (MTD)
              </p>
              <p className="mt-1 font-mono text-xl font-bold">{report?.invoiceCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-emerald-500">
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <IndianRupee className="h-3 w-3" /> Total Sales (MTD)
              </p>
              <p className="mt-1 font-mono text-xl font-bold">{formatCurrency(report?.totalSales ?? 0)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-purple-500">
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Login</p>
              <p className="mt-1 text-sm font-semibold">{formatLastLogin(sp.lastLogin)}</p>
              {sp.createdAt && (
                <p className="text-[10px] text-muted-foreground">
                  Joined {formatDate(sp.createdAt)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent invoices */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Invoices
            </p>
            <span className="text-[10px] text-muted-foreground">{invoices.length} of last 10</span>
          </div>
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 px-4 py-6 text-center text-xs text-muted-foreground">
              No invoices yet for this salesperson.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/40">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-b border-border/40 hover:bg-transparent">
                    <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice #</TableHead>
                    <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                    <TableHead className="h-9 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</TableHead>
                    <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                      <TableCell className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(inv.date)}</TableCell>
                      <TableCell className="px-3 py-2 text-sm font-medium truncate max-w-50">{inv.customerName}</TableCell>
                      <TableCell className="px-3 py-2 text-right font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(inv.grandTotal)}</TableCell>
                      <TableCell className="px-3 py-2"><StatusBadge status={inv.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 border-t border-border/40 bg-background px-5 py-3 flex gap-2">
        {isAdmin && (
          <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-2"
          onClick={() => navigate(`/salespersons/report?salespersonId=${encodeURIComponent(sp.id)}`)}
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">View Full Report</span>
          <span className="sm:hidden">Report</span>
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant={sp.isActive ? 'destructive' : 'default'}
            className="flex-1 gap-2"
            onClick={onToggle}
          >
            {sp.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {sp.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </div>
    </>
  )
}
