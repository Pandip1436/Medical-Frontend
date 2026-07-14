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
  Building2,
} from 'lucide-react'

import api from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { useBranchStore } from '@/stores/branchStore'
import { useAuthStore } from '@/stores/authStore'
import { isSuperAdmin } from '@/types'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'
import { usePageFilter } from '@/hooks/usePageFilter'

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
import { ExportMenu } from '@/components/shared/ExportMenu'

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
  roles?: string[]
  isActive?: boolean
  lastLogin?: string
  updatedAt?: string
  branchId?: string
  branchIds?: string[]
  branch?: { id: string; name: string; code: string } | null
  branches?: { id: string; name: string; code: string }[]
}

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Branch Admin',
  PHARMACIST: 'Pharmacist',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
  SALESPERSON: 'Salesperson',
  DELIVERY: 'Delivery',
}

const ROLE_BADGE: Record<string, 'purple' | 'info' | 'warning' | 'success' | 'secondary' | 'default'> = {
  SUPER_ADMIN: 'default',
  ADMIN: 'purple',
  PHARMACIST: 'info',
  INVENTORY_MANAGER: 'warning',
  ACCOUNTANT: 'success',
  SALESPERSON: 'secondary',
  DELIVERY: 'info',
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Branch Admin' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'SALESPERSON', label: 'Salesperson' },
  { value: 'DELIVERY', label: 'Delivery' },
] as const

// Full role set for a user row, falling back to the singular role.
const rolesOf = (u: { roles?: string[]; role: string }): string[] =>
  u.roles?.length ? u.roles : (u.role ? [u.role] : [])
// Assigned branches for a row (empty = Super Admin / all branches).
const branchesOf = (u: UserDrawerRow): { id: string; name: string; code: string }[] =>
  u.branches ?? (u.branch ? [u.branch] : [])

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

// ── Page ─────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { branches, fetchBranches } = useBranchStore()
  const currentUser = useAuthStore((s) => s.user)
  // A Super Admin manages all branches and can grant any role; a Branch Admin
  // is limited to the branches they manage and can't mint Super Admins.
  const canAssignSuperAdmin = isSuperAdmin(currentUser)
  const assignableBranches = useMemo(
    () =>
      canAssignSuperAdmin
        ? branches
        : branches.filter((b) => (currentUser?.branchIds ?? []).includes(b.id)),
    [branches, canAssignSuperAdmin, currentUser?.branchIds],
  )

  const [users, setUsers] = useState<UserDrawerRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = usePageFilter<string>('users.list', 'search', '')
  const [roleFilter, setRoleFilter] = usePageFilter<string>('users.list', 'role', 'all')
  const [statusFilter, setStatusFilter] = usePageFilter<string>('users.list', 'status', 'all')
  const [branchFilter, setBranchFilter] = usePageFilter<string>('users.list', 'branch', 'all')
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
          roles: u.roles ?? (u.role ? [u.role] : []),
          isActive: u.isActive ?? true,
          lastLogin: u.lastLogin ?? u.updatedAt ?? '',
          branchId: u.branchId ?? '',
          branchIds: u.branchIds ?? (u.branches ?? []).map((b) => b.id),
          branch: u.branch ?? null,
          branches: u.branches ?? (u.branch ? [u.branch] : []),
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
          rolesOf(u).some((r) => (ROLE_LABELS[r] ?? r).toLowerCase().includes(q)),
      )
    }
    if (roleFilter !== 'all') {
      result = result.filter((u) => rolesOf(u).includes(roleFilter))
    }
    if (statusFilter !== 'all') {
      const wantActive = statusFilter === 'active'
      result = result.filter((u) => u.isActive === wantActive)
    }
    if (branchFilter !== 'all') {
      if (branchFilter === '__none__') {
        // "All-branch" users = Super Admins (no assigned branches).
        result = result.filter((u) => branchesOf(u).length === 0)
      } else {
        result = result.filter((u) => branchesOf(u).some((b) => b.id === branchFilter))
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
      admins: users.filter((u) => rolesOf(u).some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN')).length,
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

  // ── Export / Print ──
  // Scope: the selected rows if any are ticked, otherwise every row currently
  // shown (after filters/search). Returns a fully-detailed, print-friendly row.
  const buildExportRows = () => {
    const source =
      selectedIds.size > 0 ? filteredUsers.filter((u) => selectedIds.has(u.id)) : filteredUsers
    return source.map((u) => ({
      Name: u.name,
      Phone: u.phone || '—',
      Email: u.email,
      Roles: rolesOf(u).map((r) => ROLE_LABELS[r] ?? r).join(', '),
      Branches: branchesOf(u).length
        ? branchesOf(u).map((b) => `${b.code} (${b.name})`).join(', ')
        : 'All branches',
      Status: u.isActive ? 'Active' : 'Inactive',
      'Last Login': u.lastLogin ? formatDateTime(u.lastLogin) : 'Never',
    }))
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
      {/* ── Summary cards — click Total / Active / Inactive to drill the Status
          filter. The Admins card counts ADMIN + SUPER_ADMIN together, which the
          single-value Role filter can't express without mismatching the shown
          number, so it stays a pure aggregate (not clickable, no ring). ── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {([
          {
            label: 'Total Users',
            value: stats.total.toString(),
            subtitle: `${stats.admins} admin${stats.admins === 1 ? '' : 's'}`,
            icon: Users,
            iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            borderAccent: 'border-l-blue-500',
            filterKey: 'all',
            activeRing: 'ring-2 ring-blue-500/50',
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
            filterKey: 'active',
            activeRing: 'ring-2 ring-emerald-500/50',
          },
          {
            label: 'Admins',
            value: stats.admins.toString(),
            subtitle: 'with full access',
            icon: Shield,
            iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            borderAccent: 'border-l-purple-500',
            filterKey: null,
            activeRing: '',
          },
          {
            label: 'Inactive',
            value: stats.inactive.toString(),
            subtitle: stats.inactive > 0 ? 'cannot sign in' : 'none',
            icon: UserX,
            iconBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            borderAccent: 'border-l-rose-500',
            filterKey: 'inactive',
            activeRing: 'ring-2 ring-rose-500/50',
          },
        ] as const).map((stat) => {
          // `filterKey: null` (Admins) is a pure aggregate — not clickable, no ring.
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
            title={clickable ? (stat.filterKey === 'all' ? 'Show all users' : `Filter to ${stat.label.toLowerCase()} users`) : undefined}
            onClick={clickable ? apply : undefined}
            onKeyDown={clickable ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply() } }) : undefined}
            className={cn('border-l-[3px]', stat.borderAccent, clickable && 'cursor-pointer transition-shadow', active && stat.activeRing)}
          >
            <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10',
                  stat.iconBg,
                )}
              >
                <stat.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-base font-bold font-mono leading-tight sm:text-lg">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.subtitle}</p>
              </div>
            </CardContent>
          </Card>
          )
        })}
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
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap">
            <ExportMenu
              title="Users"
              filename={selectedIds.size > 0 ? 'users-selected' : 'users'}
              noun="user"
              rows={buildExportRows}
              className="w-full sm:w-auto border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 dark:hover:border-emerald-700"
            />
            <Button
              size="sm"
              className="w-full sm:w-auto"
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

      {/* Selection hint — Export uses the ticked rows, or all rows if none. */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
          <Badge variant="default" size="sm" dot>
            {selectedIds.size} selected
          </Badge>
          <span className="min-w-0">Export will include the selected user{selectedIds.size === 1 ? '' : 's'}.</span>
          <button
            type="button"
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <Card>
        {/* Mobile + tablet cards (below lg) */}
        <div className="lg:hidden">
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
                      {rolesOf(u).map((r) => (
                        <Badge key={r} variant={ROLE_BADGE[r] ?? 'secondary'} size="sm">
                          {ROLE_LABELS[r] ?? r}
                        </Badge>
                      ))}
                      <Badge variant={u.isActive ? 'success' : 'destructive'} size="sm" dot>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      {branchesOf(u).length === 0 ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          All branches
                        </span>
                      ) : (
                        branchesOf(u).map((b) => (
                          <span key={b.id} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">
                            {b.code}
                          </span>
                        ))
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

        {/* Desktop table (lg+) */}
        <div className="hidden lg:block">
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
                        <div className="flex flex-wrap items-center gap-1 max-w-44">
                          {rolesOf(u).map((r) => (
                            <Badge key={r} variant={ROLE_BADGE[r] ?? 'secondary'} size="sm">
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {branchesOf(u).length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                            <Building2 className="h-3 w-3" />
                            All branches
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1 max-w-40">
                            {branchesOf(u).map((b) => (
                              <span
                                key={b.id}
                                title={b.name}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold"
                              >
                                {b.code}
                              </span>
                            ))}
                          </div>
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
        branches={assignableBranches}
        allowSuperAdmin={canAssignSuperAdmin}
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
