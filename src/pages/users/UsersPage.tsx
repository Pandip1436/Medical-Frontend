import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Users,
  Plus,
  Power,
  CheckCircle2,
  Shield,
  UserX,
  X,
  Download,
  Printer,
  Building2,
} from 'lucide-react'

import api from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { useBranchStore } from '@/stores/branchStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'

import { Button } from '@/components/ui/button'
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

import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTablePagination } from '@/components/shared/DataTablePagination'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'
import { EnumSelect } from '@/components/shared/EnumSelect'
import { EmptyState } from '@/components/shared/EmptyState'
import { exportToCsv, printReport } from '@/lib/exportUtils'

import { UserFormDrawer, type UserDrawerRow } from '@/components/users/UserFormDrawer'

// Shape of a user row as it arrives from /users. Kept loose because the
// backend includes timestamps and a populated branch; we only consume the
// fields we render.
interface ApiUserRow {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  isActive?: boolean
  lastLogin?: string
  updatedAt?: string
  branchId?: string
  branch?: { id: string; name: string; code: string } | null
}

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PHARMACIST: 'Pharmacist',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
  SALESPERSON: 'Salesperson',
}

const ROLE_BADGE: Record<string, 'purple' | 'info' | 'warning' | 'success' | 'secondary'> = {
  ADMIN: 'purple',
  PHARMACIST: 'info',
  INVENTORY_MANAGER: 'warning',
  ACCOUNTANT: 'success',
  SALESPERSON: 'secondary',
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'SALESPERSON', label: 'Salesperson' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

// ── Page ─────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { branches, fetchBranches } = useBranchStore()

  const [users, setUsers] = useState<UserDrawerRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Drawer + dialogs
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<UserDrawerRow | null>(null)
  const [statusToggleCandidate, setStatusToggleCandidate] = useState<UserDrawerRow | null>(null)
  const [statusToggleSubmitting, setStatusToggleSubmitting] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Fetch ──
  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get('/users')
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
      setUsers(
        (rows as ApiUserRow[]).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone ?? '',
          role: u.role,
          isActive: u.isActive ?? true,
          lastLogin: u.lastLogin ?? u.updatedAt ?? '',
          branchId: u.branchId ?? '',
          branch: u.branch ?? null,
        })),
      )
    } catch {
      toast.error('Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBranches()
    fetchUsers()
  }, [fetchBranches, fetchUsers])

  useBranchRefresh(fetchUsers)

  // ── Filtering ──
  const filteredUsers = useMemo(() => {
    let result = users
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone.toLowerCase().includes(q) ||
          (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q),
      )
    }
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter)
    }
    if (statusFilter !== 'all') {
      const wantActive = statusFilter === 'active'
      result = result.filter((u) => u.isActive === wantActive)
    }
    if (branchFilter !== 'all') {
      if (branchFilter === '__none__') {
        result = result.filter((u) => !u.branchId)
      } else {
        result = result.filter((u) => u.branchId === branchFilter)
      }
    }
    return result
  }, [users, searchQuery, roleFilter, statusFilter, branchFilter])

  // ── Stats ──
  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter((u) => u.isActive).length,
      inactive: users.filter((u) => !u.isActive).length,
      admins: users.filter((u) => u.role === 'ADMIN').length,
    }
  }, [users])

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  // ── Bulk select ──
  const allOnPageSelected =
    paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedIds.has(u.id))

  const toggleSelectAll = () => {
    const next = new Set(selectedIds)
    if (allOnPageSelected) paginatedUsers.forEach((u) => next.delete(u.id))
    else paginatedUsers.forEach((u) => next.add(u.id))
    setSelectedIds(next)
  }

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // ── Filter helpers ──
  const activeFilterCount =
    (roleFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (branchFilter !== 'all' ? 1 : 0)

  const clearFilters = () => {
    setRoleFilter('all')
    setStatusFilter('all')
    setBranchFilter('all')
  }

  // ── Drawer handlers ──
  const openAdd = () => {
    setEditing(null)
    setDrawerOpen(true)
  }

  const openEdit = (u: UserDrawerRow) => {
    setEditing(u)
    setDrawerOpen(true)
  }

  const handleSaved = (saved: UserDrawerRow, mode: 'create' | 'update') => {
    setUsers((prev) =>
      mode === 'create'
        ? [...prev, saved]
        : prev.map((u) => (u.id === saved.id ? { ...u, ...saved } : u)),
    )
  }

  // ── Toggle active ──
  const handleToggleStatus = async () => {
    if (!statusToggleCandidate) return
    setStatusToggleSubmitting(true)
    try {
      await api.patch(`/users/${statusToggleCandidate.id}`, {
        isActive: !statusToggleCandidate.isActive,
      })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === statusToggleCandidate.id ? { ...u, isActive: !u.isActive } : u,
        ),
      )
      toast.success(
        `User ${statusToggleCandidate.isActive ? 'deactivated' : 'activated'}`,
      )
      setStatusToggleCandidate(null)
    } catch {
      toast.error('Failed to update user status')
    } finally {
      setStatusToggleSubmitting(false)
    }
  }

  // ── Bulk deactivate ──
  const bulkDeactivate = async () => {
    const ok = window.confirm(
      `Deactivate ${selectedIds.size} user${selectedIds.size === 1 ? '' : 's'}? They won't be able to sign in until reactivated.`,
    )
    if (!ok) return
    try {
      await Promise.all(
        [...selectedIds].map((id) => api.patch(`/users/${id}`, { isActive: false })),
      )
      setUsers((prev) =>
        prev.map((u) => (selectedIds.has(u.id) ? { ...u, isActive: false } : u)),
      )
      toast.success(`${selectedIds.size} user(s) deactivated`)
      setSelectedIds(new Set())
    } catch {
      toast.error('Failed to deactivate users')
    }
  }

  // ── Branch filter options ──
  const branchFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All Branches' },
      { value: '__none__', label: 'No branch (all access)' },
      ...branches
        .filter((b) => b.isActive)
        .map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })),
    ],
    [branches],
  )

  // Reset to page 1 whenever a filter or search changes.
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, roleFilter, statusFilter, branchFilter])

  // ── Render ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Users',
            value: stats.total.toString(),
            subtitle: `${stats.admins} admin${stats.admins === 1 ? '' : 's'}`,
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
          },
          {
            label: 'Active',
            value: stats.active.toString(),
            subtitle:
              stats.total > 0
                ? `${Math.round((stats.active / stats.total) * 100)}% of total`
                : '—',
            icon: CheckCircle2,
            iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            borderAccent: 'border-l-emerald-500',
          },
          {
            label: 'Admins',
            value: stats.admins.toString(),
            subtitle: 'with full access',
            icon: Shield,
            iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            borderAccent: 'border-l-purple-500',
          },
          {
            label: 'Inactive',
            value: stats.inactive.toString(),
            subtitle: stats.inactive > 0 ? 'cannot sign in' : 'none',
            icon: UserX,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
          },
        ].map((stat) => (
          <Card key={stat.label} hover className={cn('border-l-[3px]', stat.borderAccent)}>
            <CardContent className="flex items-center gap-4 p-4">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  stat.iconBg,
                )}
              >
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

      {/* ── Filter bar ── */}
      <DataTableFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, email, phone, or role..."
        resultsCount={filteredUsers.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        actionNode={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
              onClick={() => {
                if (!filteredUsers.length) {
                  toast.info('No users to export')
                  return
                }
                exportToCsv(
                  filteredUsers.map((u) => ({
                    Name: u.name,
                    Email: u.email,
                    Phone: u.phone,
                    Role: ROLE_LABELS[u.role] ?? u.role,
                    Branch: u.branch ? `${u.branch.code} ${u.branch.name}` : '',
                    Status: u.isActive ? 'Active' : 'Inactive',
                    'Last Login': u.lastLogin ? formatDateTime(u.lastLogin) : 'Never',
                  })),
                  'users',
                )
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500"
              onClick={openAdd}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Add User</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        }
      >
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EnumSelect
            label="Role"
            value={roleFilter}
            onValueChange={setRoleFilter}
            onClear={() => setRoleFilter('all')}
            options={ROLE_OPTIONS}
          />
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
            options={branchFilterOptions}
          />
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
              <Badge variant="default" size="sm" dot>
                {selectedIds.size} selected
              </Badge>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const selected = filteredUsers.filter((u) => selectedIds.has(u.id))
                    exportToCsv(
                      selected.map((u) => ({
                        Name: u.name,
                        Email: u.email,
                        Phone: u.phone,
                        Role: ROLE_LABELS[u.role] ?? u.role,
                        Branch: u.branch ? `${u.branch.code} ${u.branch.name}` : '',
                        Status: u.isActive ? 'Active' : 'Inactive',
                      })),
                      'users-selected',
                    )
                  }}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const selected = filteredUsers.filter((u) => selectedIds.has(u.id))
                    printReport(
                      selected.map((u) => ({
                        Name: u.name,
                        Email: u.email,
                        Role: ROLE_LABELS[u.role] ?? u.role,
                        Status: u.isActive ? 'Active' : 'Inactive',
                      })),
                      'Users',
                    )
                  }}
                >
                  <Printer className="mr-1 h-3.5 w-3.5" />
                  Print
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={bulkDeactivate}
                >
                  <UserX className="mr-1 h-3.5 w-3.5" />
                  Deactivate
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => setSelectedIds(new Set())}
              >
                <X />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table ── */}
      <Card>
        {/* Mobile cards */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
              <p className="text-sm text-muted-foreground animate-pulse">
                Loading users...
              </p>
            </div>
          ) : paginatedUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={
                activeFilterCount > 0 || searchQuery
                  ? 'Try adjusting your search or filters.'
                  : 'Get started by adding your first team member.'
              }
              actionLabel={
                activeFilterCount > 0 || searchQuery ? 'Clear filters' : 'Add User'
              }
              onAction={
                activeFilterCount > 0 || searchQuery
                  ? () => {
                      clearFilters()
                      setSearchQuery('')
                    }
                  : openAdd
              }
            />
          ) : (
            <div className="divide-y divide-border/40">
              {paginatedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-start justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => openEdit(u)}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <Badge variant={ROLE_BADGE[u.role] ?? 'secondary'} size="sm">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                      <Badge variant={u.isActive ? 'success' : 'destructive'} size="sm" dot>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {u.branch && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">
                          {u.branch.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DataTableRowActions
                      onEdit={() => openEdit(u)}
                      customActions={[
                        {
                          label: u.isActive ? 'Deactivate' : 'Activate',
                          icon: (
                            <Power
                              className={cn(
                                'h-4 w-4',
                                u.isActive
                                  ? 'text-destructive'
                                  : 'text-emerald-600 dark:text-emerald-400',
                              )}
                            />
                          ),
                          onClick: () => setStatusToggleCandidate(u),
                          variant: u.isActive ? 'destructive' : 'default',
                        },
                      ]}
                    />
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
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <div className="h-8 w-8 rounded-full border-b-2 border-primary animate-spin" />
                        <p className="text-sm text-muted-foreground animate-pulse">
                          Loading users...
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40">
                      <EmptyState
                        icon={Users}
                        title="No users found"
                        description={
                          activeFilterCount > 0 || searchQuery
                            ? 'Try adjusting your search or filters.'
                            : 'Get started by adding your first team member.'
                        }
                        actionLabel={
                          activeFilterCount > 0 || searchQuery
                            ? 'Clear filters'
                            : 'Add User'
                        }
                        onAction={
                          activeFilterCount > 0 || searchQuery
                            ? () => {
                                clearFilters()
                                setSearchQuery('')
                              }
                            : openAdd
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedUsers.map((u, idx) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      className="border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(u)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(u.id)}
                          onCheckedChange={() => toggleSelectOne(u.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                            {u.name
                              .split(/\s+/)
                              .map((p) => p[0])
                              .filter(Boolean)
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{u.name}</p>
                            {u.phone && (
                              <p className="truncate text-[11px] font-mono text-muted-foreground">
                                {u.phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-60 truncate">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROLE_BADGE[u.role] ?? 'secondary'} size="sm">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {u.branch ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">
                              {u.branch.code}
                            </span>
                            <span className="text-muted-foreground truncate max-w-32">
                              {u.branch.name}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                            <Building2 className="h-3 w-3" />
                            All branches
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.isActive ? 'success' : 'destructive'}
                          size="sm"
                          dot
                        >
                          {u.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {u.lastLogin ? formatDateTime(u.lastLogin) : 'Never'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DataTableRowActions
                          onEdit={() => openEdit(u)}
                          customActions={[
                            {
                              label: u.isActive ? 'Deactivate' : 'Activate',
                              icon: (
                                <Power
                                  className={cn(
                                    'h-4 w-4',
                                    u.isActive
                                      ? 'text-destructive'
                                      : 'text-emerald-600 dark:text-emerald-400',
                                  )}
                                />
                              ),
                              onClick: () => setStatusToggleCandidate(u),
                              variant: u.isActive ? 'destructive' : 'default',
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
          totalItems={filteredUsers.length}
          itemsPerPage={PAGE_SIZE}
          className="border-t border-border/40 px-4"
        />
      </Card>

      {/* ── Add/Edit drawer ── */}
      <UserFormDrawer
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o)
          if (!o) setEditing(null)
        }}
        editing={editing}
        branches={branches}
        onSaved={handleSaved}
      />

      {/* ── Confirm deactivate/activate ── */}
      <AlertDialog
        open={!!statusToggleCandidate}
        onOpenChange={(o) => {
          if (!o) setStatusToggleCandidate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusToggleCandidate?.isActive ? 'Deactivate' : 'Activate'} this user?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {statusToggleCandidate?.isActive ? (
                    <>
                      <span className="font-semibold">{statusToggleCandidate?.name}</span>{' '}
                      won&apos;t be able to sign in until reactivated. Existing data is
                      preserved.
                    </>
                  ) : (
                    <>
                      Restore sign-in access for{' '}
                      <span className="font-semibold">{statusToggleCandidate?.name}</span>.
                    </>
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusToggleSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleToggleStatus()
              }}
              disabled={statusToggleSubmitting}
              className={
                statusToggleCandidate?.isActive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {statusToggleSubmitting
                ? 'Saving…'
                : statusToggleCandidate?.isActive
                  ? 'Yes, deactivate'
                  : 'Yes, activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
