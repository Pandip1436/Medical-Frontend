import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { StatusBadge } from '@/components/shared/StatusBadge'

import { useBranchStore } from '@/stores/branchStore'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { getInitials, getAvatarColor } from '@/lib/salespersonUtils'
import type { Salesperson } from '@/types'

// Shared schemas — mirror the inline rules that previously lived in
// SalespersonsPage so both the list page and the detail page enforce the same
// validation. Create requires a password; edit leaves it optional.
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

export type SalespersonFormValues = z.infer<typeof baseSchema>

interface SalespersonFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the dialog is in edit mode and PATCHes /salespersons/:id; otherwise POSTs to create. */
  editing: Salesperson | null
  /** Called after a successful save so callers can refresh their data. */
  onSaved?: (values: SalespersonFormValues, mode: 'create' | 'update') => void
}

export function SalespersonFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: SalespersonFormDialogProps) {
  const { branches, fetchBranches } = useBranchStore()
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SalespersonFormValues>({
    resolver: zodResolver(editing ? editSchema : createSchema),
    defaultValues: { branchId: '', commissionRate: 0 },
  })

  const watchBranchId = watch('branchId')

  useEffect(() => { fetchBranches() }, [fetchBranches])

  useEffect(() => {
    if (!open) return
    if (editing) {
      reset({
        name: editing.name,
        email: editing.email,
        phone: editing.phone,
        password: '',
        branchId: editing.branchId ?? '',
        commissionRate: editing.commissionRate ?? 0,
      })
    } else {
      reset({ name: '', email: '', phone: '', password: '', branchId: '', commissionRate: 0 })
    }
  }, [open, editing, reset])

  const onSubmit = async (values: SalespersonFormValues) => {
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
      const mode: 'create' | 'update' = editing ? 'update' : 'create'
      if (editing) {
        await api.patch(`/salespersons/${editing.id}`, payload)
        toast.success('Salesperson updated')
      } else {
        await api.post('/salespersons', payload)
        toast.success('Salesperson created')
      }
      onSaved?.(values, mode)
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save salesperson'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 gap-0 flex flex-col">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full min-h-0">
          {/* Sticky header */}
          <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-4 space-y-0">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div className="flex min-w-0 items-center gap-3">
                {editing ? (
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className={cn('text-sm font-bold', getAvatarColor(editing.name))}>
                      {getInitials(editing.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserPlus className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <SheetTitle className="text-base font-semibold truncate">
                    {editing ? 'Edit Salesperson' : 'Add Salesperson'}
                  </SheetTitle>
                  <SheetDescription className="text-[11px] truncate">
                    {editing
                      ? `${editing.name} · ${editing.email}`
                      : 'Create a new login for the sales team'}
                  </SheetDescription>
                </div>
              </div>
              {editing && <StatusBadge status={editing.isActive ? 'active' : 'inactive'} />}
            </div>
          </SheetHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Identity */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-name">Full Name</Label>
                  <Input id="sp-name" {...register('name')} placeholder="John Doe" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-phone">Phone</Label>
                  <Input
                    id="sp-phone"
                    placeholder="9876543210"
                    maxLength={10}
                    inputMode="numeric"
                    {...register('phone')}
                    // Accept digits only, capped at 10 (overrides register's onChange).
                    onChange={(e) => setValue('phone', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true, shouldDirty: true })}
                  />
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</h3>
              <div className="space-y-1.5">
                <Label htmlFor="sp-email">Email</Label>
                <Input id="sp-email" type="email" {...register('email')} placeholder="john@example.com" />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </section>

            {/* Assignment */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assignment</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <Label htmlFor="sp-commissionRate">Commission (%)</Label>
                  <Input
                    id="sp-commissionRate"
                    type="number"
                    step="0.5"
                    min={0}
                    max={100}
                    {...register('commissionRate', { valueAsNumber: true })}
                    placeholder="0"
                  />
                  {errors.commissionRate
                    ? <p className="text-xs text-destructive">{errors.commissionRate.message}</p>
                    : <p className="text-[11px] text-muted-foreground">0–100% of invoice value</p>}
                </div>
              </div>
            </section>

            {/* Access */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Access</h3>
              <div className="space-y-1.5">
                <Label htmlFor="sp-password">Password</Label>
                <Input
                  id="sp-password"
                  type="password"
                  {...register('password')}
                  placeholder={editing ? '••••••••' : 'Min 6 characters'}
                  autoComplete="new-password"
                />
                {errors.password
                  ? <p className="text-xs text-destructive">{errors.password.message}</p>
                  : <p className="text-[11px] text-muted-foreground">
                      {editing ? 'Leave blank to keep current password' : 'Minimum 6 characters'}
                    </p>}
              </div>
            </section>
          </div>

          {/* Sticky footer */}
          <SheetFooter className="shrink-0 border-t border-border/40 bg-muted/20 px-5 py-3 flex-row sm:justify-end gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
