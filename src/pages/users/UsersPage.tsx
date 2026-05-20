import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Users, Plus, Power } from 'lucide-react'

import api from '@/lib/api'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { useBranchStore } from '@/stores/branchStore'
import { useBranchRefresh } from '@/hooks/useBranchRefresh'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTableFilterBar } from '@/components/shared/DataTableFilterBar'
import { DataTableRowActions } from '@/components/shared/DataTableRowActions'

// ── Schemas ──────────────────────────────────────────────────────

const addUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.string().min(1, 'Role is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  branchId: z.string().optional(),
})
type AddUserForm = z.infer<typeof addUserSchema>

const editUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.string().min(1, 'Role is required'),
  branchId: z.string().optional(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').or(z.literal('')).optional(),
})
type EditUserForm = z.infer<typeof editUserSchema>

// ── Types ────────────────────────────────────────────────────────

type UserRow = {
  id: string; name: string; email: string; phone: string; role: string
  isActive: boolean; lastLogin: string; branchId?: string
  branch?: { id: string; name: string; code: string } | null
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  PHARMACIST: 'Pharmacist',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTANT: 'Accountant',
}

const roleBadgeVariant: Record<string, 'purple' | 'info' | 'warning' | 'success'> = {
  ADMIN: 'purple',
  PHARMACIST: 'info',
  INVENTORY_MANAGER: 'warning',
  ACCOUNTANT: 'success',
}

// ── Page ─────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { branches, fetchBranches } = useBranchStore()

  const fetchUsers = useCallback(() => {
    fetchBranches()
    api.get('/users').then((res) => {
      const rows = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
      setUsers(rows.map((u: any) => ({
        id: u.id, name: u.name, email: u.email,
        phone: u.phone ?? '', role: u.role,
        isActive: u.isActive ?? true,
        lastLogin: u.updatedAt ?? '',
        branchId: u.branchId ?? '',
        branch: u.branch ?? null,
      })))
    }).catch(() => { toast.error('Failed to load users') })
  }, [fetchBranches])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useBranchRefresh(fetchUsers)

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    )
  }, [users, searchQuery])

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddUserForm>({
    resolver: zodResolver(addUserSchema),
  })

  const onAddUser = async (data: AddUserForm) => {
    try {
      const res = await api.post('/users', {
        name: data.name, email: data.email, phone: data.phone,
        role: data.role, password: (data as any).password,
        branchId: data.branchId || undefined,
      })
      setUsers((prev) => [...prev, {
        id: res.data.id, name: res.data.name, email: res.data.email,
        phone: res.data.phone ?? '', role: res.data.role,
        isActive: res.data.isActive ?? true, lastLogin: '',
        branchId: res.data.branchId ?? '', branch: res.data.branch ?? null,
      }])
      setShowAddDialog(false)
      reset()
      toast.success(`User ${data.name} created successfully`)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create user')
    }
  }

  const toggleUserStatus = async (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (!user) return
    try {
      await api.patch(`/users/${userId}`, { isActive: !user.isActive })
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !u.isActive } : u))
      toast.success('User status updated')
    } catch {
      toast.error('Failed to update user status')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-4"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/15">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage users and their access roles</CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-1.5 cursor-pointer h-8">
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTableFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Search by name, email, or role..."
            resultsCount={filteredUsers.length}
          />
          <div className="rounded-xl border border-border/60 overflow-x-auto">
            {/* Mobile card list */}
            <div className="md:hidden">
              {filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No users found</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {filteredUsers.map((user) => (
                    <div key={user.id} className="flex items-start justify-between gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate font-medium text-sm">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          <Badge variant={roleBadgeVariant[user.role] || 'secondary'} size="sm">
                            {roleLabels[user.role] || user.role}
                          </Badge>
                          <Badge variant={user.isActive ? 'success' : 'secondary'} size="sm" dot>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {user.lastLogin ? formatDate(user.lastLogin) : 'Never'}
                        </span>
                        {user.branch && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">{user.branch.code}</span>
                        )}
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
                  <TableRow className="bg-muted/30 dark:bg-muted/15">
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
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant[user.role] || 'secondary'} size="sm">
                          {roleLabels[user.role] || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.branch ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">{user.branch.code}</span>
                            {user.branch.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.isActive ? 'success' : 'secondary'}
                          size="sm"
                          dot
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.lastLogin ? formatDateTime(user.lastLogin) : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <DataTableRowActions
                          onEdit={() => setEditingUser(user)}
                          customActions={[
                            {
                              label: user.isActive ? 'Deactivate' : 'Activate',
                              icon: <Power className={cn('h-4 w-4', user.isActive ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')} />,
                              onClick: () => toggleUserStatus(user.id),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account. Password will be auto-generated.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onAddUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Full Name</Label>
              <Input
                id="userName"
                placeholder="Enter full name"
                {...register('name')}
                error={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder="user@company.com"
                {...register('email')}
                error={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userPhone">Phone</Label>
              <Input
                id="userPhone"
                placeholder="9876543210"
                {...register('phone')}
                error={!!errors.phone}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userRole">Role <span className="text-destructive">*</span></Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger id="userRole" className="h-10 cursor-pointer">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN" className="cursor-pointer">Admin</SelectItem>
                      <SelectItem value="PHARMACIST" className="cursor-pointer">Pharmacist</SelectItem>
                      <SelectItem value="INVENTORY_MANAGER" className="cursor-pointer">Inventory Manager</SelectItem>
                      <SelectItem value="ACCOUNTANT" className="cursor-pointer">Accountant</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="userPassword">Password</Label>
              <Input
                id="userPassword"
                type="password"
                placeholder="Min. 6 characters"
                {...register('password')}
                error={!!(errors as any).password}
              />
              {(errors as any).password && <p className="text-xs text-destructive">{(errors as any).password.message}</p>}
            </div>
            {branches.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="userBranch">Assign Branch</Label>
                <Controller
                  name="branchId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      value={field.value || '__none__'}
                    >
                      <SelectTrigger id="userBranch" className="h-10">
                        <SelectValue placeholder="No branch (access all)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No branch (access all)</SelectItem>
                        {branches.filter((b: any) => b.isActive).map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-muted-foreground">{b.code}</span>
                              {b.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to give access to all branches
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">Create User</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      {editingUser && (
        <EditUserDialog
          user={editingUser}
          branches={branches}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, ...updated } : u))
            setEditingUser(null)
          }}
        />
      )}
    </motion.div>
  )
}

// ── Edit User Dialog ─────────────────────────────────────────────

function EditUserDialog({
  user,
  branches,
  onClose,
  onSaved,
}: {
  user: { id: string; name: string; email: string; phone: string; role: string; isActive: boolean; lastLogin?: string; branchId?: string; branch?: { id: string; name: string; code: string } | null }
  branches: { id: string; name: string; code: string; isActive: boolean }[]
  onClose: () => void
  onSaved: (updated: any) => void
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: user.name,
      phone: user.phone,
      role: user.role,
      branchId: user.branchId ?? '',
      newPassword: '',
    },
  })
  const [saving, setSaving] = useState(false)

  const onSubmit = async (data: EditUserForm) => {
    setSaving(true)
    try {
      const payload: any = {
        name: data.name,
        phone: data.phone,
        role: data.role,
        branchId: data.branchId || null,
      }
      if (data.newPassword) payload.password = data.newPassword
      const res = await api.patch(`/users/${user.id}`, payload)
      const updated = res.data?.data ?? res.data
      onSaved({
        id: updated.id,
        name: updated.name,
        email: updated.email ?? user.email,
        phone: updated.phone,
        role: updated.role,
        isActive: updated.isActive ?? user.isActive,
        branchId: updated.branchId ?? '',
        branch: updated.branch ?? null,
        lastLogin: user.lastLogin ?? '',
      })
      toast.success('User updated successfully')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user details and branch assignment for <strong>{user.email}</strong></DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input {...register('name')} placeholder="Full name" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="9876543210" />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
          </div>
          {branches.length > 0 && (
            <div className="space-y-2">
              <Label>Assign Branch</Label>
              <Controller
                name="branchId"
                control={control}
                render={({ field }) => (
                  <Select
                    onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                    value={field.value || '__none__'}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="No branch (access all)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No branch (access all)</SelectItem>
                      {branches.filter((b: any) => b.isActive).map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">{b.code}</span>
                            {b.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to give access to all branches
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>New Password <span className="text-muted-foreground text-[11px]">(leave blank to keep current)</span></Label>
            <Input
              {...register('newPassword')}
              type="password"
              placeholder="Min. 6 characters"
            />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
