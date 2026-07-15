import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Truck } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
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
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Supplier } from '@/types'

// Shared schema — used by both list page (Add/Edit) and detail page (Edit).
export const supplierFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
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
      (v) => !v || /^[6-9]\d{9}$/.test(v),
      'Enter a valid 10-digit Indian mobile number',
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
    formState,
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: EMPTY_VALUES,
  })
  const { errors, isSubmitting } = formState

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
      // Suppress the global axios toast so we can surface the server's specific
      // reason ourselves (e.g. "Another supplier already uses GSTIN … in this
      // branch") rather than a generic failure message.
      const opts = { suppressGlobalToast: true } as Record<string, unknown>
      if (editingSupplier) {
        await api.patch(`/suppliers/${editingSupplier.id}`, data, opts)
        toast.success(`Supplier "${data.name}" updated successfully`)
        onSaved?.(data, 'update')
      } else {
        await api.post('/suppliers', data, opts)
        toast.success(`Supplier "${data.name}" added successfully`)
        onSaved?.(data, 'create')
      }
      onOpenChange(false)
    } catch (err: unknown) {
      // The backend returns a clear 409 message for duplicate GSTIN/phone and
      // 400 for validation — show it so the user knows what to fix.
      const resp = (err as { response?: { data?: { message?: string | string[] } } })?.response
      const raw = resp?.data?.message
      const message = Array.isArray(raw) ? raw[0] : raw
      toast.error(message || 'Failed to save supplier. Please try again.')
    }
  }

  // Section-progress pill state. Mirrors the PO / Product drawers so the
  // header gives a quick scannable view of which sections still need input.
  const isSubmitted = formState.isSubmitted
  const identityFilled = !!watch('name') && !!watch('contactPerson') && !!watch('phone') && !!watch('email') && !!watch('address')
  const identityError = !!(errors.name || errors.contactPerson || errors.phone || errors.email || errors.address)
  const regulatoryFilled = !!watch('gstin') && !!watch('drugLicense')
  const regulatoryError = !!(errors.gstin || errors.drugLicense)
  const paymentFilled = !!watch('paymentTerms')
  const paymentError = !!(errors.paymentTerms || errors.whatsappNumber)

  const sections = [
    { value: 'identity', label: 'Identity', filled: identityFilled, error: identityError },
    { value: 'regulatory', label: 'Regulatory', filled: regulatoryFilled, error: regulatoryError },
    { value: 'payment', label: 'Payment', filled: paymentFilled, error: paymentError },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 gap-0 w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl flex flex-col h-dvh overflow-hidden"
      >
        {/* Header — title on the left, section progress on the right. */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
          <div className="flex items-center gap-4 pr-8">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-lg flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </SheetTitle>
              <SheetDescription className="text-sm">
                {editingSupplier
                  ? 'Update supplier information below.'
                  : 'Fill in the supplier details to add them to your directory.'}
              </SheetDescription>
            </div>
            <div className="hidden md:flex shrink-0 items-center gap-1.5 max-w-full overflow-x-auto">
              {sections.map((s, i) => {
                const showError = s.error && isSubmitted
                const isComplete = s.filled && !s.error
                return (
                  <div key={s.value} className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                      showError ? 'bg-rose-500 text-white'
                        : isComplete ? 'bg-emerald-500 text-white'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {showError ? '!' : isComplete ? '✓' : i + 1}
                    </span>
                    <span className={cn(
                      'text-xs font-medium',
                      showError ? 'text-rose-500'
                        : isComplete ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground',
                    )}>{s.label}</span>
                    {i < sections.length - 1 && (
                      <span className="text-muted-foreground/30 mx-0.5">›</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">

            {/* ── Identity & Contact ── */}
            <div className="scroll-mt-2">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Identity & Contact</h3>
              </div>
              <div className="p-6 pb-8 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Company Name <span className="text-rose-500">*</span>
                    </Label>
                    <Input placeholder="e.g. Cipla Ltd" {...register('name')} />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact Person <span className="text-rose-500">*</span>
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
                      Phone <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit phone number"
                      {...register('phone')}
                      // Accept digits only, capped at 10 (overrides register's onChange).
                      onChange={(e) => setValue('phone', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Email <span className="text-rose-500">*</span>
                    </Label>
                    <Input type="email" placeholder="supplier@company.com" {...register('email')} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Address <span className="text-rose-500">*</span>
                  </Label>
                  <Textarea placeholder="Full address" rows={2} {...register('address')} />
                  {errors.address && (
                    <p className="text-xs text-destructive">{errors.address.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Regulatory ── */}
            <div className="scroll-mt-2 border-t border-border/40">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Regulatory</h3>
              </div>
              <div className="p-6 pb-8 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      GSTIN <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      placeholder="15-character GSTIN"
                      className="font-mono uppercase"
                      maxLength={15}
                      {...register('gstin')}
                      // GSTIN is 15 uppercase alphanumerics — force case, strip
                      // anything else, cap at 15 (overrides register's onChange).
                      onChange={(e) => setValue('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15), { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.gstin && <p className="text-xs text-destructive">{errors.gstin.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Drug License # <span className="text-rose-500">*</span>
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
              </div>
            </div>

            {/* ── Payment & Messaging ── */}
            <div className="scroll-mt-2 border-t border-border/40">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Payment & Messaging</h3>
              </div>
              <div className="p-6 pb-8 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Payment Terms <span className="text-rose-500">*</span>
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

                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    WhatsApp Number
                  </Label>
                  <Input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Leave blank to use the phone number above"
                    {...register('whatsappNumber')}
                    // Accept digits only, capped at 10 (overrides register's onChange).
                    onChange={(e) => setValue('whatsappNumber', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true, shouldDirty: true })}
                  />
                  {errors.whatsappNumber && (
                    <p className="text-xs text-destructive">{errors.whatsappNumber.message}</p>
                  )}
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
              </div>
            </div>

          </div>{/* end scrollable body */}

          {/* Sticky footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 shrink-0">
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
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
