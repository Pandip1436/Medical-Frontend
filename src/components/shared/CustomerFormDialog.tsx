import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import api from '@/lib/api'
import type { Customer } from '@/types'

// Shared schema — mirrors the inline customerSchema in CustomersPage so both
// entry points enforce the same rules. Kept here to make this dialog the
// canonical create/edit form for customers going forward.
export const customerFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    phone: z
      .string()
      .min(10, 'Phone must be 10 digits')
      .max(10, 'Phone must be 10 digits')
      .regex(/^\d{10}$/, 'Must be exactly 10 digits'),
    alternatePhone: z
      .string()
      .regex(/^\d{10}$/, 'Must be exactly 10 digits')
      .or(z.literal(''))
      .optional(),
    type: z.enum(['RETAIL', 'WHOLESALE', 'DOCTOR']),
    email: z.string().email('Invalid email').or(z.literal('')).optional(),
    address: z.string().min(1, 'Address is required'),
    gstin: z.string().optional(),
    dlNumber: z.string().optional(),
    registrationNumber: z.string().optional(),
    referredBy: z.string().optional(),
    source: z.string().optional(),
    doctorRef: z.string().optional(),
    creditLimit: z.coerce.number().min(0, 'Credit limit must be ≥ 0').optional(),
    notes: z.string().optional(),
    // Toggle whether this customer receives transactional WhatsApp messages
    // (invoice PDF + payment QR via Meta Cloud API). Defaults to true; user
    // can switch off if a customer explicitly opts out.
    whatsappOptIn: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'WHOLESALE') {
      if (!data.gstin || data.gstin.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN is required for Wholesale' })
      }
      if (!data.dlNumber || data.dlNumber.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['dlNumber'], message: 'DL Number is required for Wholesale' })
      }
    }
    if (data.type === 'DOCTOR') {
      if (!data.registrationNumber || data.registrationNumber.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['registrationNumber'], message: 'Registration Number is required for Doctor' })
      }
    }
  })

export type CustomerFormValues = z.input<typeof customerFormSchema>

const EMPTY_VALUES: CustomerFormValues = {
  name: '',
  phone: '',
  alternatePhone: '',
  type: 'RETAIL',
  email: '',
  address: '',
  gstin: '',
  dlNumber: '',
  registrationNumber: '',
  referredBy: '',
  source: '',
  doctorRef: '',
  creditLimit: 0,
  notes: '',
  whatsappOptIn: true,
}

// How the customer was acquired. Optional, free-form-ish — kept as a fixed
// list so reporting stays consistent across the team.
const CUSTOMER_SOURCES = [
  'Walk-in',
  'Referral',
  'IndiaMART',
  'Just Dial',
  'WhatsApp',
  'Social Media',
  'Website',
  'Advertisement',
  'Other',
] as const

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the dialog is in edit mode and PATCHes /customers/:id; otherwise POSTs to create. */
  editingCustomer: Customer | null
  /** Called after a successful save. Receives the patch values for optimistic UI. */
  onSaved?: (saved: CustomerFormValues, mode: 'create' | 'update') => void
  /**
   * Optional override for the submit action. When provided, the dialog defers
   * persistence to the caller (used by CustomersPage which routes some
   * pharmacist creates through an approval workflow instead of direct POST).
   * Receives the validated values + mode and is expected to await the network
   * round-trip itself; throwing rolls the dialog back open.
   */
  submitOverride?: (values: CustomerFormValues, mode: 'create' | 'update') => Promise<void>
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editingCustomer,
  onSaved,
  submitOverride,
}: CustomerFormDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    if (editingCustomer) {
      reset({
        name: editingCustomer.name,
        phone: editingCustomer.phone,
        alternatePhone: editingCustomer.alternatePhone ?? '',
        type: editingCustomer.type,
        email: editingCustomer.email ?? '',
        address: editingCustomer.address ?? '',
        gstin: editingCustomer.gstin ?? '',
        dlNumber: editingCustomer.dlNumber ?? '',
        registrationNumber: (editingCustomer as any).registrationNumber ?? '',
        referredBy: editingCustomer.referredBy ?? '',
        source: (editingCustomer as any).source ?? '',
        doctorRef: editingCustomer.doctorRef ?? '',
        creditLimit: editingCustomer.creditLimit ?? 0,
        notes: editingCustomer.notes ?? '',
        // Pre-fill with the existing customer's value. Older customer records
        // saved before this column existed will be null/undefined — treat
        // those as opted-in (matches the schema default).
        whatsappOptIn: (editingCustomer as any).whatsappOptIn ?? true,
      })
    } else {
      reset(EMPTY_VALUES)
    }
  }, [open, editingCustomer, reset])

  const typeValue = watch('type')

  async function onSubmit(values: CustomerFormValues) {
    setSubmitting(true)
    try {
      const mode: 'create' | 'update' = editingCustomer ? 'update' : 'create'
      if (submitOverride) {
        await submitOverride(values, mode)
      } else if (editingCustomer) {
        await api.patch(`/customers/${editingCustomer.id}`, values)
        toast.success(`Customer "${values.name}" updated successfully`)
      } else {
        await api.post('/customers', values)
        toast.success(`Customer "${values.name}" added successfully`)
      }
      onSaved?.(values, mode)
      onOpenChange(false)
    } catch {
      toast.error('Failed to save customer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </DialogTitle>
          <DialogDescription>
            {editingCustomer
              ? 'Update customer information below.'
              : 'Fill in the customer details to add them to your directory.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <Input placeholder="Customer name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RETAIL">Retail</SelectItem>
                      <SelectItem value="WHOLESALE">Wholesale</SelectItem>
                      <SelectItem value="DOCTOR">Doctor</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Phone
              </Label>
              <Input placeholder="10-digit phone number" inputMode="numeric" {...register('phone')} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Alternate Phone (optional)
              </Label>
              <Input placeholder="10-digit alternate" inputMode="numeric" {...register('alternatePhone')} />
              {errors.alternatePhone && <p className="text-xs text-destructive">{errors.alternatePhone.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email (optional)
              </Label>
              <Input type="email" placeholder="customer@example.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Credit Limit
              </Label>
              <Input type="number" min={0} step="0.01" placeholder="0" {...register('creditLimit')} />
              {errors.creditLimit && <p className="text-xs text-destructive">{errors.creditLimit.message as string}</p>}
            </div>
          </div>

          {typeValue === 'WHOLESALE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  GSTIN
                </Label>
                <Input placeholder="15-character GSTIN" className="font-mono" {...register('gstin')} />
                {errors.gstin && <p className="text-xs text-destructive">{errors.gstin.message}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Drug License #
                </Label>
                <Input placeholder="Drug license number" className="font-mono" {...register('dlNumber')} />
                {errors.dlNumber && <p className="text-xs text-destructive">{errors.dlNumber.message}</p>}
              </div>
            </div>
          )}

          {typeValue === 'DOCTOR' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Medical Reg. #
                </Label>
                <Input placeholder="MCI / State Council Reg. No." className="font-mono" {...register('registrationNumber')} />
                {errors.registrationNumber && <p className="text-xs text-destructive">{errors.registrationNumber.message}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Doctor Reference
                </Label>
                <Input placeholder="Referring doctor (if any)" {...register('doctorRef')} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Address
            </Label>
            <Textarea placeholder="Full address" rows={2} {...register('address')} />
            {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Referred By (salesperson)
              </Label>
              <Input placeholder="Salesperson name" {...register('referredBy')} />
              {errors.referredBy && <p className="text-xs text-destructive">{errors.referredBy.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Source (optional)
              </Label>
              <Controller
                control={control}
                name="source"
                render={({ field }) => (
                  <Select value={field.value || ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="How acquired?" />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </Label>
            <Input placeholder="Additional notes (optional)" {...register('notes')} />
          </div>

          {/* WhatsApp opt-in — controls whether invoices + payment QRs auto-
              deliver to this customer's phone via Meta Cloud API. Defaults to
              on; toggle off for customers who explicitly opt out. */}
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-3">
            <Controller
              control={control}
              name="whatsappOptIn"
              render={({ field }) => (
                <Switch
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                  className="mt-0.5"
                />
              )}
            />
            <div className="space-y-0.5">
              <Label className="text-sm font-medium leading-none cursor-pointer">
                Send WhatsApp messages to this customer
              </Label>
              <p className="text-xs text-muted-foreground">
                Invoices and payment QR codes will be auto-delivered to the phone number above.
                Turn off if the customer prefers not to receive WhatsApp messages.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : editingCustomer ? 'Update Customer' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
