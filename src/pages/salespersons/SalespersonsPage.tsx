import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus,
  UserCheck,
  UserX,
  TrendingUp,
  Award,
  Users,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { ColumnsToggle } from '@/components/shared/ColumnsToggle'
import { useColumnVisibility } from '@/hooks/useColumnVisibility'
import type { ColumnDef } from '@/types/table'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { SalespersonFormDialog } from '@/components/shared/SalespersonFormDialog'

import { useAuthStore } from '@/stores/authStore'
import { isAdminish } from '@/types'
import { useBranchStore } from '@/stores/branchStore'
import api from '@/lib/api'
import { usePersistedState } from '@/hooks/usePersistedState'
import { usePageSize } from '@/hooks/usePageSize'
import { navigate } from '@/lib/router'
import { cn, formatCurrency } from '@/lib/utils'
import { getInitials, getAvatarColor, formatLastLogin } from '@/lib/salespersonUtils'
import type { Salesperson } from '@/types'

// ─── Report row type (from /salespersons/report) ──────────────

interface ReportRow {
  salespersonId: string
  name: string
  isActive: boolean
  invoiceCount: number
  totalSales: number
}

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

const SALESPERSON_COLUMNS: ColumnDef[] = [
  { id: 'salesperson', label: 'Salesperson', required: true, defaultVisible: true },
  { id: 'phone', label: 'Phone', defaultVisible: true },
  { id: 'branch', label: 'Branch', defaultVisible: true },
  { id: 'salesMtd', label: 'Sales MTD', defaultVisible: true },
  { id: 'lastLogin', label: 'Last Login', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
]

export default function SalespersonsPage() {
  const cols = useColumnVisibility('salespersons.list', SALESPERSON_COLUMNS)
  const { user } = useAuthStore()
  const { branches, fetchBranches } = useBranchStore()
  const isAdmin = isAdminish(user)

  // ── Data ──
  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [salesByPerson, setSalesByPerson] = useState<Record<string, ReportRow>>({})
  const [isLoading, setIsLoading] = useState(true)

  // ── List view state. Filters persisted to sessionStorage (survive refresh + back). ──
  const [search, setSearch] = usePersistedState('filters:salespersons:search', '')
  const [statusFilter, setStatusFilter] = usePersistedState<string>('filters:salespersons:status', 'all')
  const [branchFilter, setBranchFilter] = usePersistedState<string>('filters:salespersons:branch', 'all')
  const [loginFilter, setLoginFilter] = usePersistedState<string>('filters:salespersons:login', 'all')
  const [perfFilter, setPerfFilter] = usePersistedState<string>('filters:salespersons:perf', 'all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize('pbims.salespersons.pageSize', 10)

  // ── Add/Edit dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Salesperson | null>(null)

  // ── Effects ──
  useEffect(() => { fetchBranches() }, [fetchBranches])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    const today = new Date()
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const todayStr = today.toISOString().slice(0, 10)
    try {
      const spRes = await api.get('/salespersons')
      setSalespersons(spRes.data)
      // The team MTD report is ADMIN/ACCOUNTANT-only — a SALESPERSON can see the
      // directory but not the team-wide sales figures. Fetch it best-effort so a
      // 403 there doesn't blank out the whole page; the MTD/top-performer cards
      // just stay empty for roles without report access.
      try {
        const repRes = await api.get('/salespersons/report', { params: { from: monthStart, to: todayStr } })
        const map: Record<string, ReportRow> = {}
        for (const r of repRes.data as ReportRow[]) map[r.salespersonId] = r
        setSalesByPerson(map)
      } catch {
        setSalesByPerson({})
      }
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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

  // ── Dialog handlers ──
  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (sp: Salesperson) => {
    setEditing(sp)
    setDialogOpen(true)
  }

  const openDetail = (sp: Salesperson) => {
    navigate(`/salespersons/detail?salespersonId=${encodeURIComponent(sp.id)}`)
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
      {/* ── Summary stat cards — click Total / Active / Inactive to drill the
          Status filter. Total Sales MTD & Top Performer are pure aggregates
          (no list subset), so they clear the drill-down and carry no ring. ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {([
          {
            label: 'Total Salespersons',
            value: stats.total.toString(),
            subtitle: `${stats.active} active`,
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
          },
          {
            label: 'Active',
            value: stats.active.toString(),
            subtitle: `${stats.activePct}% of total`,
            icon: UserCheck,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
            filterKey: 'active',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Total Sales MTD',
            value: formatCurrency(stats.totalSales),
            subtitle: `${stats.totalInvoices} invoices`,
            icon: TrendingUp,
            iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
            borderAccent: 'border-l-orange-500',
            filterKey: null,
            activeRing: '',
          },
          {
            label: 'Top Performer',
            value: stats.top?.name ?? '—',
            subtitle: stats.top ? formatCurrency(stats.top.totalSales) : 'No sales yet',
            icon: Award,
            iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            borderAccent: 'border-l-purple-500',
            filterKey: null,
            activeRing: '',
          },
        ] as const).map((stat) => {
          // `filterKey: null` cards are pure aggregates (no list subset) — they
          // are not clickable and never show an active ring.
          const clickable = stat.filterKey !== null
          const active = clickable && statusFilter === stat.filterKey
          const apply = () => {
            if (!clickable) return
            setStatusFilter(active ? 'all' : (stat.filterKey as string))
            setCurrentPage(1)
          }
          return (
          <Card
            key={stat.label}
            hover
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={clickable ? (stat.filterKey === 'all' ? 'Show all salespersons' : `Filter to ${stat.label.toLowerCase()}`) : undefined}
            onClick={clickable ? apply : undefined}
            onKeyDown={clickable ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply() } }) : undefined}
            className={cn('border-l-[3px]', stat.borderAccent, clickable && 'cursor-pointer transition-shadow', active && stat.activeRing)}
          >
            <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10', stat.iconBg)}>
                <stat.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-base font-bold leading-tight truncate sm:text-lg" title={stat.value}>{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* ── Filter bar ── */}
      <DataTableFilterBar
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or phone..."
        resultsCount={filtered.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            {isAdmin && (
              <Button size="sm" className="w-full sm:w-auto" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Add Salesperson
              </Button>
            )}
          </div>
        }
      >
        <div className="col-span-full flex flex-wrap items-end gap-4">
          <div className="min-w-40 flex-1">
          <EnumSelect
            label="Status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            onClear={() => setStatusFilter('all')}
            options={STATUS_OPTIONS}
          />
          </div>
          <div className="min-w-40 flex-1">
          <EnumSelect
            label="Branch"
            value={branchFilter}
            onValueChange={setBranchFilter}
            onClear={() => setBranchFilter('all')}
            options={branchOptions}
          />
          </div>
          <div className="min-w-40 flex-1">
          <EnumSelect
            label="Last Login"
            value={loginFilter}
            onValueChange={setLoginFilter}
            onClear={() => setLoginFilter('all')}
            options={LOGIN_OPTIONS}
          />
          </div>
          <div className="min-w-40 flex-1">
          <EnumSelect
            label="Performance (MTD)"
            value={perfFilter}
            onValueChange={setPerfFilter}
            onClear={() => setPerfFilter('all')}
            options={PERFORMANCE_OPTIONS}
          />
          </div>
          {/* Columns — kept inside this flex row so it sits inline with the
              filters instead of wrapping to a second line (the shared
              columnsNode slot would land in a new grid row). */}
          <div className="flex shrink-0 flex-col justify-end gap-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</Label>
            <ColumnsToggle columns={SALESPERSON_COLUMNS} visible={cols.visible} onToggle={cols.toggle} onReset={cols.reset} />
          </div>
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
                  <TableHead className="text-sm">Salesperson</TableHead>
                  {cols.isVisible('phone') && <TableHead className="text-sm">Phone</TableHead>}
                  {cols.isVisible('branch') && <TableHead className="text-sm">Branch</TableHead>}
                  {cols.isVisible('salesMtd') && <TableHead className="text-sm text-right">Sales MTD</TableHead>}
                  {cols.isVisible('lastLogin') && <TableHead className="text-sm">Last Login</TableHead>}
                  {cols.isVisible('status') && <TableHead className="text-sm">Status</TableHead>}
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
                      onClick={() => openDetail(sp)}
                    >
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className={cn('text-sm font-bold', getAvatarColor(sp.name))}>
                              {getInitials(sp.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{sp.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{sp.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      {cols.isVisible('phone') && <TableCell className="py-3.5 font-mono text-sm whitespace-nowrap">{sp.phone}</TableCell>}
                      {cols.isVisible('branch') && (
                      <TableCell className="py-3.5">
                        <span className="text-sm text-muted-foreground">{getBranchName(sp.branchId) || '—'}</span>
                      </TableCell>
                      )}
                      {cols.isVisible('salesMtd') && (
                      <TableCell className="py-3.5 text-right">
                        {row ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(row.totalSales)}</span>
                            <span className="text-[11px] text-muted-foreground">{row.invoiceCount} inv</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      )}
                      {cols.isVisible('lastLogin') && (
                      <TableCell className="py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                        {formatLastLogin(sp.lastLogin)}
                      </TableCell>
                      )}
                      {cols.isVisible('status') && (
                      <TableCell className="py-3.5">
                        <StatusBadge status={sp.isActive ? 'active' : 'inactive'} />
                      </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-12 py-3.5">
                        {isAdmin && (
                          <DataTableRowActions
                            onView={() => openDetail(sp)}
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
                    onClick={() => openDetail(sp)}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className={cn('text-xs font-bold', getAvatarColor(sp.name))}>
                        {getInitials(sp.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{sp.name}</p>
                        {cols.isVisible('status') && (
                          <StatusBadge status={sp.isActive ? 'active' : 'inactive'} />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{sp.email}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground truncate">
                          {cols.isVisible('phone') && sp.phone}
                          {cols.isVisible('phone') && cols.isVisible('branch') && ' · '}
                          {cols.isVisible('branch') && (getBranchName(sp.branchId) || 'No branch')}
                        </span>
                        {cols.isVisible('salesMtd') && row && (
                          <span className="font-mono text-xs font-semibold whitespace-nowrap">
                            {formatCurrency(row.totalSales)}
                          </span>
                        )}
                      </div>
                      {cols.isVisible('lastLogin') && (
                        <p className="text-[10px] text-muted-foreground">Last login: {formatLastLogin(sp.lastLogin)}</p>
                      )}
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
              itemsPerPage={pageSize}
              pageSize={pageSize}
              onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
              className="border-t border-border/40 px-4"
            />
          </Card>
        </>
      )}

      {/* ── Add/Edit dialog ── */}
      {isAdmin && (
        <SalespersonFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          onSaved={() => fetchAll()}
        />
      )}
    </motion.div>
  )
}
