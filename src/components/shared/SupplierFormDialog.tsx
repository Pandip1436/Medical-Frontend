import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import type { Supplier } from '@/types'

// Shared schema — used by both list page (Add/Edit) and detail page (Edit).
export const supplierFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(/^\d+$/, 'Phone must contain only digits'),
  email: z.string().email('Invalid email address'),
  gstin: z
    .string()
    .length(15, 'GSTIN must be 15 characters')
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      'Invalid GSTIN format (e.g. 33ABCDE1234F1Z5)',
    ),
  drugLicense: z
    .string()
    .min(5, 'Drug license number required')
    .regex(/^[A-Za-z0-9\-/]+$/, 'Drug license can only contain letters, digits, - and /'),
  address: z.string().min(10, 'Address is required'),
  paymentTerms: z.enum(['NET_30', 'NET_45', 'NET_60'], {
    message: 'Select payment terms',
  }),
  bankDetails: z.string().optional(),
  // Supplier-level consent for low-stock WhatsApp alerts. Defaults to true so
  // existing suppliers participate as soon as the WHATSAPP_LOW_STOCK_ENABLED
  // flag flips on. Toggle off for suppliers who prefer phone calls.
  whatsappOptIn: z.boolean().optional(),
  // Optional override of `phone` when the supplier's WhatsApp lives on a
  // different number. Empty → backend falls back to `phone`.
  whatsappNumber: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^\d{10}$/.test(v),
      'WhatsApp number must be 10 digits',
    ),
})

export type SupplierFormValues = z.input<typeof supplierFormSchema>

const EMPTY_VALUES: SupplierFormValues = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  gstin: '',
  drugLicense: '',
  address: '',
  paymentTerms: 'NET_30',
  bankDetails: '',
  whatsappOptIn: true,
  whatsappNumber: '',
}

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, the dialog is in edit mode and PATCHes /suppliers/:id; otherwise POSTs to create. */
  editingSupplier: Supplier | null
  /** Called after a successful save. Receives the latest supplier patch payload for optimistic UI. */
  onSaved?: (saved: SupplierFormValues, mode: 'create' | 'update') => void
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  editingSupplier,
  onSaved,
}: SupplierFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: EMPTY_VALUES,
  })

  // Whenever the dialog opens or the editing target changes, reset the form
  // with the right values. Keeps create- and edit-modes from leaking state.
  useEffect(() => {
    if (!open) return
    if (editingSupplier) {
      reset({
        name: editingSupplier.name,
        contactPerson: editingSupplier.contactPerson,
        phone: editingSupplier.phone,
        email: editingSupplier.email,
        gstin: editingSupplier.gstin,
        drugLicense: editingSupplier.drugLicense,
        address: editingSupplier.address,
        paymentTerms: editingSupplier.paymentTerms,
        bankDetails: editingSupplier.bankDetails || '',
        // `whatsappOptIn` / `whatsappNumber` came in with the new low-stock
        // WhatsApp pipeline. Older Supplier rows may not have them yet —
        // default opt-in to true to match the DB default.
        whatsappOptIn: (editingSupplier as any).whatsappOptIn ?? true,
        whatsappNumber: (editingSupplier as any).whatsappNumber ?? '',
      })
    } else {
      reset(EMPTY_VALUES)
    }
  }, [open, editingSupplier, reset])

  const paymentTermsValue = watch('paymentTerms')

  async function onSubmit(data: SupplierFormValues) {
    try {
      if (editingSupplier) {
        await api.patch(`/suppliers/${editingSupplier.id}`, data)
        toast.success(`Supplier "${data.name}" updated successfully`)
        onSaved?.(data, 'update')
      } else {
        await api.post('/suppliers', data)
        toast.success(`Supplier "${data.name}" added successfully`)
        onSaved?.(data, 'create')
      }
      onOpenChange(false)
    } catch {
      toast.error('Failed to save supplier. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
          </DialogTitle>
          <DialogDescription>
            {editingSupplier
              ? 'Update supplier information below.'
              : 'Fill in the supplier details to add them to your directory.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Company Name
              </Label>
              <Input placeholder="e.g. Cipla Ltd" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contact Person
              </Label>
              <Input placeholder="e.g. Arun Menon" {...register('contactPerson')} />
              {errors.contactPerson && (
                <p className="text-xs text-destructive">{errors.contactPerson.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Phone
              </Label>
              <Input placeholder="10-digit phone number" {...register('phone')} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input type="email" placeholder="supplier@company.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                GSTIN
              </Label>
              <Input
                placeholder="15-character GSTIN"
                className="font-mono"
                {...register('gstin')}
              />
              {errors.gstin && <p className="text-xs text-destructive">{errors.gstin.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Drug License #
              </Label>
              <Input
                placeholder="Drug license number"
                className="font-mono"
                {...register('drugLicense')}
              />
              {errors.drugLicense && (
                <p className="text-xs text-destructive">{errors.drugLicense.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Address
            </Label>
            <Textarea placeholder="Full address" {...register('address')} />
            {errors.address && (
              <p className="text-xs text-destructive">{errors.address.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                WhatsApp Number
              </Label>
              <Input
                placeholder="Leave blank to use the phone above"
                {...register('whatsappNumber')}
              />
              {errors.whatsappNumber && (
                <p className="text-xs text-destructive">{errors.whatsappNumber.message}</p>
              )}
            </div>
            <div className="space-y-2 sm:invisible sm:pointer-events-none">
              {/* Empty grid slot to keep the layout balanced; the opt-in
                  toggle below spans the full width. */}
            </div>
          </div>

          {/* WhatsApp opt-in — controls whether low-stock alerts auto-deliver
              to this supplier's phone via Meta Cloud API. Defaults to on;
              toggle off for suppliers who prefer phone calls or email. */}
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
                Send WhatsApp messages to this supplier
              </Label>
              <p className="text-xs text-muted-foreground">
                Low-stock alerts will be auto-delivered to the WhatsApp number above (or the phone
                number if blank). Turn off for suppliers who prefer phone calls.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Payment Terms
              </Label>
              <Select
                value={paymentTermsValue}
                onValueChange={(val) =>
                  setValue('paymentTerms', val as 'NET_30' | 'NET_45' | 'NET_60', {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NET_30">Net 30</SelectItem>
                  <SelectItem value="NET_45">Net 45</SelectItem>
                  <SelectItem value="NET_60">Net 60</SelectItem>
                </SelectContent>
              </Select>
              {errors.paymentTerms && (
                <p className="text-xs text-destructive">{errors.paymentTerms.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Bank Details
              </Label>
              <Input placeholder="Bank, A/c, IFSC (optional)" {...register('bankDetails')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving…'
                : editingSupplier
                  ? 'Update Supplier'
                  : 'Add Supplier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
