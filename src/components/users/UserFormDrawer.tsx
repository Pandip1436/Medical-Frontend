import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Eye, EyeOff, UserPlus, UserCog } from 'lucide-react'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

export interface UserDrawerRow {
  id: string
  name: string
  email: string
  phone: string
  role: string
  isActive: boolean
  branchId?: string
  branch?: { id: string; name: string; code: string } | null
  lastLogin?: string
}

interface UserFormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: UserDrawerRow | null
  branches: { id: string; name: string; code: string; isActive: boolean }[]
  onSaved: (saved: UserDrawerRow, mode: 'create' | 'update') => void
}

// ── Roles ───────────────────────────────────────────────────────────

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'SALESPERSON', label: 'Salesperson' },
]

// ── Schemas ─────────────────────────────────────────────────────────
// Two schemas because email + password are required for create but
// locked / optional on edit. Keeps each form fully typed instead of
// relying on partials sprinkled with as any.

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z
    .string()
    .min(10, 'Valid phone number required')
    .regex(/^\d+$/, 'Phone must be digits only'),
  role: z.string().min(1, 'Role is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  branchId: z.string().optional(),
  isActive: z.boolean(),
})

const editSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z
    .string()
    .min(10, 'Valid phone number required')
    .regex(/^\d+$/, 'Phone must be digits only'),
  role: z.string().min(1, 'Role is required'),
  newPassword: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .or(z.literal(''))
    .optional(),
  branchId: z.string().optional(),
  isActive: z.boolean(),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

const EMPTY_CREATE: CreateValues = {
  name: '',
  email: '',
  phone: '',
  role: '',
  password: '',
  branchId: '',
  isActive: true,
}

// ── Component ───────────────────────────────────────────────────────

export function UserFormDrawer({
  open,
  onOpenChange,
  editing,
  branches,
  onSaved,
}: UserFormDrawerProps) {
  const isEdit = !!editing

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-140 p-0 gap-0 flex flex-col"
      >
        {isEdit ? (
          <EditUserBody
            key={editing!.id}
            user={editing!}
            branches={branches}
            onClose={() => onOpenChange(false)}
            onSaved={(u) => onSaved(u, 'update')}
          />
        ) : (
          <CreateUserBody
            key="create"
            branches={branches}
            onClose={() => onOpenChange(false)}
            onSaved={(u) => onSaved(u, 'create')}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Create body ─────────────────────────────────────────────────────

function CreateUserBody({
  branches,
  onClose,
  onSaved,
}: {
  branches: UserFormDrawerProps['branches']
  onClose: () => void
  onSaved: (saved: UserDrawerRow) => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: EMPTY_CREATE,
  })

  useEffect(() => {
    reset(EMPTY_CREATE)
  }, [reset])

  async function onSubmit(data: CreateValues) {
    try {
      const res = await api.post('/users', {
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        password: data.password,
        branchId: data.branchId || undefined,
        isActive: data.isActive,
      })
      const u = res.data?.data ?? res.data
      toast.success(`User ${data.name} created successfully`)
      onSaved({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? '',
        role: u.role,
        isActive: u.isActive ?? true,
        branchId: u.branchId ?? '',
        branch: u.branch ?? null,
        lastLogin: u.updatedAt ?? '',
      })
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Failed to create user'
      toast.error(String(msg))
    }
  }

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/40 shrink-0 space-y-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle>Add New User</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create a login for a team member and assign their role
              </p>
            </div>
          </div>
        </div>
      </SheetHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Full Name *
              </Label>
              <Input placeholder="e.g. Priya Sharma" {...register('name')} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Phone *
              </Label>
              <Input placeholder="9876543210" {...register('phone')} />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>
          </div>

          {/* Email + role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email *
              </Label>
              <Input
                type="email"
                placeholder="user@company.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Role *
              </Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && (
                <p className="text-xs text-destructive">{errors.role.message}</p>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Password *
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                {...register('password')}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Share this with the user — they can change it after first login.
            </p>
          </div>

          {/* Branch assignment */}
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Assign Branch
              </Label>
              <Controller
                control={control}
                name="branchId"
                render={({ field }) => (
                  <Select
                    value={field.value || '__none__'}
                    onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="No branch (access all)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No branch (access all)</SelectItem>
                      {branches
                        .filter((b) => b.isActive)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-muted-foreground">
                                {b.code}
                              </span>
                              {b.name}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to give access to all branches.
              </p>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Active</p>
              <p className="text-[11px] text-muted-foreground">
                Inactive users can&apos;t sign in until reactivated.
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-3 bg-background border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create User'}
          </Button>
        </div>
      </form>
    </>
  )
}

// ── Edit body ───────────────────────────────────────────────────────

function EditUserBody({
  user,
  branches,
  onClose,
  onSaved,
}: {
  user: UserDrawerRow
  branches: UserFormDrawerProps['branches']
  onClose: () => void
  onSaved: (saved: UserDrawerRow) => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: user.name,
      phone: user.phone,
      role: user.role,
      newPassword: '',
      branchId: user.branchId ?? '',
      isActive: user.isActive,
    },
  })

  async function onSubmit(data: EditValues) {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        phone: data.phone,
        role: data.role,
        branchId: data.branchId || null,
        isActive: data.isActive,
      }
      if (data.newPassword) payload.password = data.newPassword
      const res = await api.patch(`/users/${user.id}`, payload)
      const u = res.data?.data ?? res.data
      toast.success('User updated successfully')
      onSaved({
        id: u.id,
        name: u.name,
        email: u.email ?? user.email,
        phone: u.phone ?? '',
        role: u.role,
        isActive: u.isActive ?? data.isActive,
        branchId: u.branchId ?? '',
        branch: u.branch ?? null,
        lastLogin: u.updatedAt ?? user.lastLogin ?? '',
      })
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Failed to update user'
      toast.error(String(msg))
    }
  }

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-4 pr-12 border-b border-border/40 shrink-0 space-y-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <UserCog className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate">Edit User</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      </SheetHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Full Name *
              </Label>
              <Input {...register('name')} placeholder="Full name" />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Phone *
              </Label>
              <Input {...register('phone')} placeholder="9876543210" />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>
          </div>

          {/* Email (read-only) + role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input value={user.email} disabled className="bg-muted/40" />
              <p className="text-[11px] text-muted-foreground">
                Email cannot be changed after creation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Role *
              </Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && (
                <p className="text-xs text-destructive">{errors.role.message}</p>
              )}
            </div>
          </div>

          {/* Reset password */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              New Password{' '}
              <span className="normal-case font-normal text-muted-foreground/70">
                (leave blank to keep current)
              </span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                {...register('newPassword')}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          {/* Branch */}
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Assign Branch
              </Label>
              <Controller
                control={control}
                name="branchId"
                render={({ field }) => (
                  <Select
                    value={field.value || '__none__'}
                    onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="No branch (access all)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No branch (access all)</SelectItem>
                      {branches
                        .filter((b) => b.isActive)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-muted-foreground">
                                {b.code}
                              </span>
                              {b.name}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to give access to all branches.
              </p>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Active</p>
              <p className="text-[11px] text-muted-foreground">
                Inactive users can&apos;t sign in until reactivated.
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-3 bg-background border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </>
  )
}
