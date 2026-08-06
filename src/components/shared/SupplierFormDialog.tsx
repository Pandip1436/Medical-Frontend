import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { requiredGstin, requiredDrugLicense, GSTIN_REGEX, DL_REGEX, DL_MAX, optionalBankAccount, optionalIfsc, optionalUpi } from '@/lib/validators'
import { useDuplicateFieldCheck } from '@/hooks/useDuplicateFieldCheck'
import { toast } from 'sonner'
import { Truck, Upload, X, FileText, FileImage } from 'lucide-react'

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
  gstin: requiredGstin(),
  drugLicense: requiredDrugLicense(),
  address: z.string().min(10, 'Address is required'),
  // Alternate phone (optional) — parity with the customer form.
  alternatePhone: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^[6-9]\d{9}$/.test(v),
      'Enter a valid 10-digit Indian mobile number',
    ),
  // Structured bank details (all optional, format-checked when present).
  bankAccountName: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: optionalBankAccount(),
  bankIfsc: optionalIfsc(),
  bankUpiId: optionalUpi(),
  notes: z.string().optional(),
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
  alternatePhone: '',
  bankAccountName: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankUpiId: '',
  notes: '',
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
    setError,
    clearErrors,
    watch,
    control,
    formState,
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: EMPTY_VALUES,
  })
  const { errors, isSubmitting } = formState

  // Address-proof / documents to upload. Stored in R2 against the supplier's
  // linked customer twin (the same real-world party) via /prescriptions/upload,
  // reusing the existing document pipeline.
  const [docFiles, setDocFiles] = useState<File[]>([])
  const addDocFiles = (files: FileList | null) => {
    if (!files) return
    setDocFiles((prev) => [...prev, ...Array.from(files)])
  }
  const removeDocFile = (idx: number) => setDocFiles((prev) => prev.filter((_, i) => i !== idx))

  // Whenever the dialog opens or the editing target changes, reset the form
  // with the right values. Keeps create- and edit-modes from leaking state.
  useEffect(() => {
    if (!open) return
    setDocFiles([])
    setPhoneDupWarning('')
    setEmailDupWarning('')
    if (editingSupplier) {
      reset({
        name: editingSupplier.name,
        contactPerson: editingSupplier.contactPerson,
        phone: editingSupplier.phone,
        email: editingSupplier.email,
        gstin: editingSupplier.gstin,
        drugLicense: editingSupplier.drugLicense,
        address: editingSupplier.address,
        alternatePhone: editingSupplier.alternatePhone ?? '',
        bankAccountName: editingSupplier.bankAccountName ?? '',
        bankName: editingSupplier.bankName ?? '',
        bankAccountNumber: editingSupplier.bankAccountNumber ?? '',
        bankIfsc: editingSupplier.bankIfsc ?? '',
        bankUpiId: editingSupplier.bankUpiId ?? '',
        notes: editingSupplier.notes ?? '',
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

  // Live "already used" check — flags a taken GSTIN / drug licence as the user
  // types (debounced), so they don't have to submit to find out.
  const gstinValue = watch('gstin') ?? ''
  const drugLicenseValue = watch('drugLicense') ?? ''
  const dlTrimmed = drugLicenseValue.trim()
  useDuplicateFieldCheck({
    enabled: open,
    endpoint: '/suppliers/check-duplicate',
    entity: 'supplier',
    excludeId: editingSupplier?.id,
    setError,
    clearErrors,
    fields: [
      { name: 'gstin', param: 'gstin', responseKey: 'gstin', value: gstinValue, valid: GSTIN_REGEX.test(gstinValue.trim()), label: 'GSTIN' },
      { name: 'drugLicense', param: 'drugLicense', responseKey: 'drugLicense', value: drugLicenseValue, valid: dlTrimmed.length >= 4 && dlTrimmed.length <= DL_MAX && DL_REGEX.test(dlTrimmed), label: 'Drug License' },
    ],
  })

  // Live "already used" check for phone + email — soft warnings surfaced on
  // blur. Phone dup is also hard-blocked by the backend on save (unique key);
  // email isn't a uniqueness key, so its warning is informational only.
  const [phoneDupWarning, setPhoneDupWarning] = useState('')
  const [emailDupWarning, setEmailDupWarning] = useState('')

  const checkSupplierPhoneDup = async (raw: string) => {
    const phone = raw.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(phone)) { setPhoneDupWarning(''); return }
    if ((editingSupplier?.phone ?? '').replace(/\D/g, '').slice(-10) === phone) { setPhoneDupWarning(''); return }
    try {
      const res = await api.get(`/suppliers?q=${phone}`, { suppressGlobalToast: true } as Record<string, unknown>)
      const list: Supplier[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
      const dup = list.find((s) => (s.phone ?? '').replace(/\D/g, '').slice(-10) === phone && s.id !== editingSupplier?.id)
      if (dup) setPhoneDupWarning(`Phone already used by "${dup.name}". Please verify.`)
    } catch { /* ignore */ }
  }

  const checkSupplierEmailDup = async (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailDupWarning(''); return }
    if ((editingSupplier?.email ?? '').trim().toLowerCase() === email) { setEmailDupWarning(''); return }
    try {
      const res = await api.get(`/suppliers?q=${encodeURIComponent(email)}`, { suppressGlobalToast: true } as Record<string, unknown>)
      const list: Supplier[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
      const dup = list.find((s) => (s.email ?? '').trim().toLowerCase() === email && s.id !== editingSupplier?.id)
      if (dup) setEmailDupWarning(`Email already used by "${dup.name}". Please verify.`)
    } catch { /* ignore */ }
  }

  async function onSubmit(data: SupplierFormValues) {
    try {
      // Suppress the global axios toast so we can surface the server's specific
      // reason ourselves (e.g. "Another supplier already uses GSTIN … in this
      // branch") rather than a generic failure message.
      const opts = { suppressGlobalToast: true } as Record<string, unknown>
      // The party's documents live on the linked customer twin. On edit we
      // already have its id; on create the API returns it.
      let twinCustomerId: string | null | undefined = editingSupplier?.customerId
      if (editingSupplier) {
        await api.patch(`/suppliers/${editingSupplier.id}`, data, opts)
        toast.success(`Supplier "${data.name}" updated successfully`)
        onSaved?.(data, 'update')
      } else {
        const res = await api.post('/suppliers', data, opts)
        // Inventory Managers can't create suppliers directly — the backend files
        // an admin approval instead. No supplier (or customer twin) exists yet,
        // so surface that and stop before the document-upload step below.
        if (res.data?.approvalRequested) {
          toast.success(
            `Approval request sent to admin. Supplier "${data.name}" will be created once approved.`,
            { duration: 6000 },
          )
          onOpenChange(false)
          return
        }
        twinCustomerId = (res.data?.customerId as string | undefined) ?? null
        toast.success(`Supplier "${data.name}" added successfully`)
        onSaved?.(data, 'create')
      }
      // Upload address-proof documents to R2 (via the customer-twin document
      // pipeline). Best-effort — never block the save on an upload hiccup.
      if (docFiles.length) {
        if (twinCustomerId) {
          // The upload endpoint is ADMIN/PHARMACIST-only, so roles that may
          // otherwise manage suppliers (e.g. INVENTORY_MANAGER) get a 403 here.
          // Suppress the generic "Forbidden resource" toast and report the
          // skipped uploads once, after the loop.
          let denied = false
          for (const file of docFiles) {
            try {
              const fd = new FormData()
              fd.append('file', file)
              fd.append('customerId', twinCustomerId)
              fd.append('doctorName', 'Supplier Document')
              await api.post('/prescriptions/upload', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
                suppressGlobalToast: true,
              } as Record<string, unknown>)
            } catch (uploadErr: unknown) {
              // keep going; the supplier itself saved fine
              if ((uploadErr as { response?: { status?: number } })?.response?.status === 403) denied = true
            }
          }
          if (denied) {
            toast.message("Supplier saved — documents weren't uploaded (your role can't attach documents).")
          }
        } else {
          toast.message('Supplier saved — document upload skipped (no linked customer record).')
        }
      }
      onOpenChange(false)
    } catch (err: unknown) {
      // The backend returns a clear 409 message for duplicate GSTIN / Drug
      // License / phone and 400 for validation.
      const resp = (err as { response?: { data?: { message?: string | string[] } } })?.response
      const raw = resp?.data?.message
      const message = Array.isArray(raw) ? raw[0] : raw

      // Pin field-specific "already used" conflicts to their field so the
      // message shows inline (like the format errors), not just as a toast.
      // The inline error clears itself as soon as the user edits that field
      // (the live-validation onChange re-runs the resolver).
      if (message) {
        const lower = message.toLowerCase()
        if (lower.includes('gstin')) {
          setError('gstin', { type: 'server', message })
          return
        }
        if (lower.includes('drug license')) {
          setError('drugLicense', { type: 'server', message })
          return
        }
        if (lower.includes('phone')) {
          setError('phone', { type: 'server', message })
          return
        }
      }

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
  // "Bank & Messaging" is entirely optional, so it counts as "filled" as long as
  // it has no validation errors (e.g. a bad WhatsApp number).
  const bankError = !!(errors.whatsappNumber || errors.alternatePhone)

  const sections = [
    { value: 'identity', label: 'Identity', filled: identityFilled, error: identityError },
    { value: 'regulatory', label: 'Regulatory', filled: regulatoryFilled, error: regulatoryError },
    { value: 'bank', label: 'Bank', filled: !bankError, error: bankError },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 gap-0 w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl flex flex-col overflow-hidden"
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
          <div data-sheet-body className="flex-1 min-h-0 overflow-y-auto">

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
                      error={!!errors.phone || !!phoneDupWarning}
                      // Accept digits only, capped at 10 (overrides register's onChange).
                      onChange={(e) => { setValue('phone', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true, shouldDirty: true }); if (phoneDupWarning) setPhoneDupWarning('') }}
                      onBlur={(e) => checkSupplierPhoneDup(e.target.value)}
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                    {!errors.phone && phoneDupWarning && <p className="text-xs text-rose-500">{phoneDupWarning}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Email <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      placeholder="supplier@company.com"
                      {...register('email')}
                      error={!!errors.email || !!emailDupWarning}
                      onChange={(e) => { setValue('email', e.target.value, { shouldValidate: true, shouldDirty: true }); if (emailDupWarning) setEmailDupWarning('') }}
                      onBlur={(e) => checkSupplierEmailDup(e.target.value)}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                    {!errors.email && emailDupWarning && <p className="text-xs text-rose-500">{emailDupWarning}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Alternate Phone
                  </Label>
                  <Input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Optional 10-digit number"
                    {...register('alternatePhone')}
                    onChange={(e) => setValue('alternatePhone', e.target.value.replace(/\D/g, '').slice(0, 10), { shouldValidate: true, shouldDirty: true })}
                  />
                  {errors.alternatePhone && (
                    <p className="text-xs text-destructive">{errors.alternatePhone.message}</p>
                  )}
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
                      maxLength={30}
                      {...register('drugLicense')}
                      // Validate as the user types so the error shows inline (like GSTIN).
                      onChange={(e) => setValue('drugLicense', e.target.value, { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.drugLicense && (
                      <p className="text-xs text-destructive">{errors.drugLicense.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bank & Messaging ── */}
            <div className="scroll-mt-2 border-t border-border/40">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Bank & Messaging</h3>
              </div>
              <div className="p-6 pb-8 space-y-4">
                {/* Structured bank details — all optional (for paying the supplier). */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Account Holder Name
                  </Label>
                  <Input placeholder="Name as per bank account" {...register('bankAccountName')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Bank Name
                    </Label>
                    <Input placeholder="e.g. HDFC Bank" {...register('bankName')} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Account Number
                    </Label>
                    <Input
                      className="font-mono"
                      inputMode="numeric"
                      maxLength={18}
                      placeholder="9–18 digit account number"
                      {...register('bankAccountNumber')}
                      onChange={(e) => setValue('bankAccountNumber', e.target.value.replace(/\D/g, '').slice(0, 18), { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.bankAccountNumber && <p className="text-xs text-destructive">{errors.bankAccountNumber.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      IFSC Code
                    </Label>
                    <Input
                      className="font-mono uppercase"
                      maxLength={11}
                      placeholder="e.g. HDFC0001234"
                      {...register('bankIfsc')}
                      onChange={(e) => setValue('bankIfsc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11), { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.bankIfsc && <p className="text-xs text-destructive">{errors.bankIfsc.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      UPI ID
                    </Label>
                    <Input
                      placeholder="name@bank (optional)"
                      {...register('bankUpiId')}
                      onChange={(e) => setValue('bankUpiId', e.target.value.replace(/\s/g, ''), { shouldValidate: true, shouldDirty: true })}
                    />
                    {errors.bankUpiId && <p className="text-xs text-destructive">{errors.bankUpiId.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Notes
                  </Label>
                  <Textarea placeholder="Any internal notes about this supplier (optional)" rows={2} {...register('notes')} />
                </div>

                {/* Address Proof & Documents — uploaded to R2 (via the shared
                    customer-twin document pipeline). */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Address Proof & Documents
                    </Label>
                    {docFiles.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{docFiles.length} file{docFiles.length !== 1 ? 's' : ''} selected</span>
                    )}
                  </div>
                  {docFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {docFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                          <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded bg-muted">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{file.name}</span>
                          <button type="button" onClick={() => removeDocFile(idx)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-600 transition">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/10 py-5">
                    <div className="flex h-10 w-14 items-center justify-center rounded-lg border-2 border-border/40 bg-muted/30">
                      <FileImage className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">Upload GST certificate, drug license, bank proof, etc.</p>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/40 transition shadow-sm">
                      <Upload className="h-3.5 w-3.5 text-amber-500" />
                      Add Files
                      <input
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        multiple
                        onChange={(e) => { addDocFiles(e.target.files); e.target.value = '' }}
                      />
                    </label>
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
          <div data-sheet-footer className="flex items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 shrink-0">
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
