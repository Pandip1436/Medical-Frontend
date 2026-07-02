import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Eye, EyeOff, UserPlus, UserCog, ChevronDown } from 'lucide-react'

import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  roles?: string[]
  isActive: boolean
  branchId?: string
  branchIds?: string[]
  branch?: { id: string; name: string; code: string } | null
  branches?: { id: string; name: string; code: string }[]
  lastLogin?: string
}

interface UserFormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: UserDrawerRow | null
  branches: { id: string; name: string; code: string; isActive: boolean }[]
  // Whether the signed-in admin may grant the Super Admin role. Branch Admins
  // can't (and only see the branches they manage in `branches`).
  allowSuperAdmin?: boolean
  onSaved: (saved: UserDrawerRow, mode: 'create' | 'update') => void
}

// ── Roles ───────────────────────────────────────────────────────────

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Branch Admin' },
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
  { value: 'ACCOUNTANT', label: 'Accountant' },
  { value: 'SALESPERSON', label: 'Salesperson' },
  { value: 'DELIVERY', label: 'Delivery' },
]

const SUPER_ADMIN = 'SUPER_ADMIN'

// ── Reusable checkbox dropdown multi-select ──────────────────────────
// A Select-style trigger that summarises the chosen values as chips and
// opens a popover checklist bound to a string[] form field.
function CheckDropdown({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Array<{ value: string; label: string; hint?: string }>
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  const selected = options.filter((o) => value.includes(o.value))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex flex-wrap items-center gap-1 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {o.hint && <span className="font-mono text-[10px] font-bold text-muted-foreground">{o.hint}</span>}
                  {o.label}
                </span>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1.5">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {options.map((o) => {
            const checked = value.includes(o.value)
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={checked}
                onClick={() => toggle(o.value)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent',
                  checked && 'bg-accent/40',
                )}
              >
                <Checkbox checked={checked} className="pointer-events-none" tabIndex={-1} />
                {o.hint && (
                  <span className="font-mono text-[10px] font-bold text-muted-foreground">{o.hint}</span>
                )}
                <span className="truncate">{o.label}</span>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Schemas ─────────────────────────────────────────────────────────
// Two schemas because email + password are required for create but
// locked / optional on edit. Roles & branches are now arrays; a
// non-super-admin must be assigned at least one branch.

const rolesField = z.array(z.string()).min(1, 'Select at least one role')
const branchRequirement = (
  data: { roles: string[]; branchIds: string[] },
  ctx: z.RefinementCtx,
) => {
  if (!data.roles.includes(SUPER_ADMIN) && data.branchIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branchIds'],
      message: 'Select at least one branch (or assign the Super Admin role for all branches)',
    })
  }
}

const createSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email required'),
    phone: z.string().min(10, 'Valid phone number required').regex(/^\d+$/, 'Phone must be digits only'),
    roles: rolesField,
    password: z.string().min(6, 'Password must be at least 6 characters'),
    branchIds: z.array(z.string()),
    isActive: z.boolean(),
  })
  .superRefine(branchRequirement)

const editSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Valid phone number required').regex(/^\d+$/, 'Phone must be digits only'),
    roles: rolesField,
    newPassword: z.string().min(6, 'Password must be at least 6 characters').or(z.literal('')).optional(),
    branchIds: z.array(z.string()),
    isActive: z.boolean(),
  })
  .superRefine(branchRequirement)

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

const EMPTY_CREATE: CreateValues = {
  name: '',
  email: '',
  phone: '',
  roles: [],
  password: '',
  branchIds: [],
  isActive: true,
}

// Maps an API user object to the table row shape shared with UsersPage.
function toRow(u: any, fallback?: Partial<UserDrawerRow>): UserDrawerRow {
  const branches = u.branches ?? (u.branch ? [u.branch] : [])
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? fallback?.email ?? '',
    phone: u.phone ?? '',
    role: u.role,
    roles: u.roles ?? (u.role ? [u.role] : []),
    isActive: u.isActive ?? fallback?.isActive ?? true,
    branchId: u.branchId ?? '',
    branchIds: u.branchIds ?? branches.map((b: any) => b.id),
    branch: u.branch ?? null,
    branches,
    lastLogin: u.updatedAt ?? fallback?.lastLogin ?? '',
  }
}

// ── Component ───────────────────────────────────────────────────────

export function UserFormDrawer({
  open,
  onOpenChange,
  editing,
  branches,
  allowSuperAdmin = true,
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
            allowSuperAdmin={allowSuperAdmin}
            onClose={() => onOpenChange(false)}
            onSaved={(u) => onSaved(u, 'update')}
          />
        ) : (
          <CreateUserBody
            key="create"
            branches={branches}
            allowSuperAdmin={allowSuperAdmin}
            onClose={() => onOpenChange(false)}
            onSaved={(u) => onSaved(u, 'create')}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

// Shared role + branch assignment block used by both create and edit forms.
function RoleBranchFields({
  control,
  branches,
  allowSuperAdmin = true,
  rolesError,
  branchError,
}: {
  control: any
  branches: UserFormDrawerProps['branches']
  allowSuperAdmin?: boolean
  rolesError?: string
  branchError?: string
}) {
  const selectedRoles: string[] = useWatch({ control, name: 'roles' }) ?? []
  const isSuper = selectedRoles.includes(SUPER_ADMIN)
  // Branch Admins can't grant Super Admin — drop it from the options.
  const roleOptions = allowSuperAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value !== SUPER_ADMIN)
  const activeBranches = branches.filter((b) => b.isActive)
  const branchOptions = activeBranches.map((b) => ({ value: b.id, label: b.name, hint: b.code }))
  // A Branch Admin who manages exactly one branch has no choice to make — the
  // branch is auto-assigned (set in the form defaults) and shown read-only.
  const singleManaged = !allowSuperAdmin && activeBranches.length === 1
  const fixedBranch = singleManaged ? activeBranches[0] : null

  return (
    <>
      {/* Roles (multi-select) */}
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Roles * <span className="normal-case font-normal text-muted-foreground/70">(select one or more)</span>
        </Label>
        <Controller
          control={control}
          name="roles"
          render={({ field }) => (
            <CheckDropdown
              options={roleOptions}
              value={field.value ?? []}
              onChange={field.onChange}
              placeholder="Select roles"
            />
          )}
        />
        {rolesError && <p className="text-xs text-destructive">{rolesError}</p>}
      </div>

      {/* Branch assignment (hidden for Super Admin = all branches) */}
      {isSuper ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Super Admin</span> has access to{' '}
          <span className="font-medium text-foreground">all branches</span> — no branch selection needed.
        </div>
      ) : fixedBranch ? (
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Branch Access
          </Label>
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm">
            <span className="font-mono text-[10px] font-bold text-muted-foreground">{fixedBranch.code}</span>
            <span className="truncate">{fixedBranch.name}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Assigned to your branch automatically.
          </p>
        </div>
      ) : (
        branches.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Branch Access * <span className="normal-case font-normal text-muted-foreground/70">(select one or more)</span>
            </Label>
            <Controller
              control={control}
              name="branchIds"
              render={({ field }) => (
                <CheckDropdown
                  options={branchOptions}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Select branches"
                />
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              The user can switch between assigned branches; data stays scoped to the active one.
            </p>
            {branchError && <p className="text-xs text-destructive">{branchError}</p>}
          </div>
        )
      )}
    </>
  )
}

// ── Create body ─────────────────────────────────────────────────────

function CreateUserBody({
  branches,
  allowSuperAdmin = true,
  onClose,
  onSaved,
}: {
  branches: UserFormDrawerProps['branches']
  allowSuperAdmin?: boolean
  onClose: () => void
  onSaved: (saved: UserDrawerRow) => void
}) {
  const [showPassword, setShowPassword] = useState(false)
  // Branch Admins who manage a single branch get it pre-selected (the picker is
  // shown read-only); everyone else starts with an empty branch selection.
  const activeBranches = branches.filter((b) => b.isActive)
  const autoBranchIds =
    !allowSuperAdmin && activeBranches.length === 1 ? [activeBranches[0].id] : []
  const initialValues = useMemo<CreateValues>(
    () => ({ ...EMPTY_CREATE, branchIds: autoBranchIds }),
    [autoBranchIds.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: initialValues,
  })

  useEffect(() => {
    reset(initialValues)
  }, [reset, initialValues])

  async function onSubmit(data: CreateValues) {
    try {
      const res = await api.post('/users', {
        name: data.name,
        email: data.email,
        phone: data.phone,
        roles: data.roles,
        password: data.password,
        branchIds: data.roles.includes(SUPER_ADMIN) ? [] : data.branchIds,
        isActive: data.isActive,
      })
      const u = res.data?.data ?? res.data
      toast.success(`User ${data.name} created successfully`)
      onSaved(toRow(u))
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
                Create a login for a team member and assign their roles
              </p>
            </div>
          </div>
        </div>
      </SheetHeader>

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="flex flex-col flex-1 min-h-0">
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

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Email *
            </Label>
            <Input type="email" placeholder="user@company.com" autoComplete="off" {...register('email')} />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
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
                autoComplete="new-password"
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

          <RoleBranchFields
            control={control}
            branches={branches}
            allowSuperAdmin={allowSuperAdmin}
            rolesError={errors.roles?.message as string | undefined}
            branchError={errors.branchIds?.message as string | undefined}
          />

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
  allowSuperAdmin = true,
  onClose,
  onSaved,
}: {
  user: UserDrawerRow
  branches: UserFormDrawerProps['branches']
  allowSuperAdmin?: boolean
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
      roles: user.roles?.length ? user.roles : (user.role ? [user.role] : []),
      newPassword: '',
      branchIds: user.branchIds ?? (user.branchId ? [user.branchId] : []),
      isActive: user.isActive,
    },
  })

  async function onSubmit(data: EditValues) {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        phone: data.phone,
        roles: data.roles,
        branchIds: data.roles.includes(SUPER_ADMIN) ? [] : data.branchIds,
        isActive: data.isActive,
      }
      if (data.newPassword) payload.password = data.newPassword
      const res = await api.patch(`/users/${user.id}`, payload)
      const u = res.data?.data ?? res.data
      toast.success('User updated successfully')
      onSaved(toRow(u, user))
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

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="flex flex-col flex-1 min-h-0">
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

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input value={user.email} disabled className="bg-muted/40" />
            <p className="text-[11px] text-muted-foreground">
              Email cannot be changed after creation.
            </p>
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
                autoComplete="new-password"
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

          <RoleBranchFields
            control={control}
            branches={branches}
            allowSuperAdmin={allowSuperAdmin}
            rolesError={errors.roles?.message as string | undefined}
            branchError={errors.branchIds?.message as string | undefined}
          />

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
