import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import api, { handleApiError } from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import { ComboboxInput } from '@/components/ui/combobox-input'
import {
  productSchema,
  productFormDefaults,
  type ProductFormValues,
} from '@/components/products/productFormSchema'
import { CategorySearchDropdown } from '@/components/products/CategorySearchDropdown'
import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/unitOfMeasureOptions'
import type { Product } from '@/types'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional pre-fill (e.g. the query the user typed before clicking "Add"). */
  prefillName?: string
  /** Called after a successful POST /products. Caller decides whether to
   *  refresh master data, auto-add to a row, etc. */
  onSaved?: (product: Product) => void
}

// Small inline label suffix to mark an optional field. Mirrors the wording
// pattern from other forms across the app so the visual cue is consistent.
const OPTIONAL = <span className="text-muted-foreground/60 font-normal normal-case"> (optional)</span>

export function ProductFormDialog({
  open,
  onOpenChange,
  prefillName,
  onSaved,
}: ProductFormDialogProps) {
  const categories = useMasterDataStore(s => s.categories)
  const fetchCategories = useMasterDataStore(s => s.fetchCategories)
  const suppliers = useMasterDataStore(s => s.suppliers)
  const products = useMasterDataStore(s => s.products)

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: productFormDefaults,
    // Validate on blur so the Selling Price ≤ MRP refine surfaces as soon
    // as the user leaves the offending field — not silent until Save.
    mode: 'onBlur',
  })
  const { register, handleSubmit, reset, watch, control, formState } = form
  const { errors, isSubmitting } = formState

  // Reset form whenever the drawer reopens — prevents stale state from a
  // prior cancel/close leaking into a fresh open. Deliberately does NOT depend
  // on `categories` — otherwise adding a category mid-edit (which changes the
  // categories list) would re-run this and wipe everything the user has typed,
  // including the category they just picked.
  useEffect(() => {
    if (!open) return
    reset({ ...productFormDefaults, name: prefillName ?? '' })
  }, [open, prefillName, reset])

  // Lazily fetch the category list the first time the drawer is opened. Kept
  // separate from the reset so a category change never triggers a form reset.
  useEffect(() => {
    if (open && categories.length === 0) fetchCategories()
  }, [open, categories.length, fetchCategories])

  const manufacturers = useMemo(() => {
    const fromSuppliers = suppliers.map(s => s.name)
    const fromProducts = products.map(p => p.manufacturer).filter(Boolean)
    return [...new Set([...fromSuppliers, ...fromProducts])].sort()
  }, [suppliers, products])

  async function onSubmit(values: ProductFormValues) {
    try {
      const payload = {
        ...values,
        schedule: values.schedule.toUpperCase(),
        categoryId: values.categoryId || undefined,
      }
      const res = await api.post('/products', payload, { suppressGlobalToast: true } as never)
      toast.success(`Product "${values.name}" added — add stock via a Goods Received Note (GRN) to bill this item`)
      onSaved?.(res.data as Product)
      onOpenChange(false)
    } catch (error: unknown) {
      // Check if it's a duplicate name error and surface it inline
      const err = error as { response?: { data?: { message?: string } } }
      const msg = err?.response?.data?.message ?? ''
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        form.setError('name', { type: 'manual', message: msg || 'A product with this name already exists' })
      }
      handleApiError(error, 'Failed to add product')
    }
  }

  function checkDuplicateName(name: string) {
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) return
    const duplicate = products.find(p => p.name.trim().toLowerCase() === trimmed)
    if (duplicate) {
      form.setError('name', { type: 'manual', message: 'A product with this name already exists' })
    } else {
      form.clearErrors('name')
    }
  }

  // Section-progress pills track which required fields each section still
  // needs. Optional fields don't count toward "filled" — they're nice-to-have.
  const isSubmitted = formState.isSubmitted
  const identityFilled = !!watch('name') && !!watch('genericName') && !!watch('manufacturer')
  const identityError = !!(errors.name || errors.genericName || errors.manufacturer)
  const packagingFilled = !!watch('hsnCode')
  const packagingError = !!(errors.hsnCode)
  const pricingFilled = Number(watch('mrp')) > 0 && Number(watch('sellingRate')) > 0
  const pricingError = !!(errors.mrp || errors.sellingRate)
  const stockFilled = String(watch('minStock') ?? '').trim() !== ''
  const stockError = !!errors.minStock

  const sections = [
    { value: 'identity', label: 'Identity', filled: identityFilled, error: identityError },
    { value: 'packaging', label: 'Packaging', filled: packagingFilled, error: packagingError },
    { value: 'pricing', label: 'Pricing', filled: pricingFilled, error: pricingError },
    { value: 'stock', label: 'Stock', filled: stockFilled, error: stockError },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 gap-0 w-full sm:w-3/5 sm:max-w-[60vw] flex flex-col h-dvh overflow-hidden"
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
          <div className="flex items-center gap-4 pr-8">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-lg flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-primary" />
                Add New Product
              </SheetTitle>
              <SheetDescription className="text-sm">
                Saves to product master. Stock will be 0 until a Goods Received Note (GRN) is recorded.
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

            {/* ── Identity ── */}
            <div className="scroll-mt-2">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Identity</h3>
              </div>
              <div className="p-6 pb-8 space-y-3">
                <div className="grid grid-cols-12 gap-2.5">
                  <div className="col-span-12 sm:col-span-5 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product Name *</Label>
                    <Input
                      className="h-9"
                      {...register('name')}
                      placeholder="e.g. Torsemide 20mg Tab"
                      error={!!errors.name}
                      onBlur={e => {
                        register('name').onBlur(e)
                        checkDuplicateName(e.target.value)
                      }}
                    />
                    {errors.name && <p className="text-[11px] text-rose-500">{errors.name.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-4 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Generic Name *</Label>
                    <Input className="h-9" {...register('genericName')} placeholder="e.g. Torsemide" error={!!errors.genericName} />
                    {errors.genericName && <p className="text-[11px] text-rose-500">{errors.genericName.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manufacturer *</Label>
                    <Controller control={control} name="manufacturer" render={({ field }) => (
                      <ComboboxInput
                        value={field.value}
                        onChange={field.onChange}
                        options={manufacturers}
                        placeholder="Select or type..."
                        error={!!errors.manufacturer}
                      />
                    )} />
                    {errors.manufacturer && <p className="text-[11px] text-rose-500">{errors.manufacturer.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-5 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category{OPTIONAL}</Label>
                    <Controller control={control} name="categoryId" render={({ field }) => (
                      <CategorySearchDropdown value={field.value ?? ''} onChange={field.onChange} hasError={false} />
                    )} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Packaging & Regulatory ── */}
            <div className="scroll-mt-2 border-t border-border/40">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Packaging & Regulatory</h3>
              </div>
              <div className="p-6 pb-8 space-y-3">
                <div className="grid grid-cols-12 gap-2.5">
                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pack Size{OPTIONAL}</Label>
                    <Input className="h-9" {...register('packSize')} placeholder="10x10" />
                  </div>
                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit of Measure{OPTIONAL}</Label>
                    <Controller control={control} name="unitOfMeasure" render={({ field }) => (
                      <ComboboxInput
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        options={UNIT_OF_MEASURE_OPTIONS}
                        placeholder="Select or type..."
                      />
                    )} />
                  </div>
                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">HSN Code *</Label>
                    <Input className="h-9" {...register('hsnCode')} placeholder="30049099" error={!!errors.hsnCode} />
                    {errors.hsnCode && <p className="text-[11px] text-rose-500">{errors.hsnCode.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Drug Schedule *</Label>
                    <Controller control={control} name="schedule" render={({ field }) => (
                      <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4 h-9 items-center">
                        {(['NONE', 'H', 'H1', 'X'] as const).map(s => (
                          <div key={s} className="flex items-center gap-1.5">
                            <RadioGroupItem value={s} id={`pfd-schedule-${s}`} />
                            <Label htmlFor={`pfd-schedule-${s}`} className="cursor-pointer font-normal text-xs">{s === 'NONE' ? 'None' : s}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Pricing ── */}
            <div className="scroll-mt-2 border-t border-border/40">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Pricing</h3>
              </div>
              <div className="p-6 pb-8 space-y-3">
                {/* Two rows of three columns. Top row groups the rupee
                    figures most relevant when pricing a new product (what
                    you bill the customer + what you paid the supplier).
                    Bottom row carries the wholesale rate and the GST
                    bracket — both reference values you'd rarely change
                    once set on the master. Same 3-col grid on both rows
                    keeps the inputs vertically aligned. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MRP (₹) *</Label>
                    <Input className="h-9" type="number" step="0.01" placeholder="e.g. 250" {...register('mrp')} error={!!errors.mrp} />
                    {errors.mrp && <p className="text-[11px] text-rose-500">{errors.mrp.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selling Price (₹) *</Label>
                    <Input className="h-9" type="number" step="0.01" placeholder="e.g. 235" {...register('sellingRate')} error={!!errors.sellingRate} />
                    {errors.sellingRate && <p className="text-[11px] text-rose-500">{errors.sellingRate.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Purchase (₹){OPTIONAL}</Label>
                    <Input className="h-9" type="number" step="0.01" placeholder="e.g. 180" {...register('purchaseRate')} error={!!errors.purchaseRate} />
                    {errors.purchaseRate && <p className="text-[11px] text-rose-500">{errors.purchaseRate.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wholesale (₹){OPTIONAL}</Label>
                    <Input className="h-9" type="number" step="0.01" placeholder="e.g. 200" {...register('wholesaleRate')} error={!!errors.wholesaleRate} />
                    {errors.wholesaleRate && <p className="text-[11px] text-rose-500">{errors.wholesaleRate.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GST Rate *</Label>
                    <Controller control={control} name="gstRate" render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0, 5, 12, 18, 28].map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Stock Settings ── */}
            <div className="scroll-mt-2 border-t border-border/40">
              <div className="px-6 pt-5 pb-2 border-b border-border/40 bg-background sticky top-0 z-10">
                <h3 className="text-sm font-semibold">Stock Settings</h3>
              </div>
              <div className="p-6 pb-8 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Stock *</Label>
                    <Input className="h-9" type="number" placeholder="e.g. 10" {...register('minStock')} error={!!errors.minStock} />
                    {errors.minStock && <p className="text-[11px] text-rose-500">{errors.minStock.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max Stock{OPTIONAL}</Label>
                    <Input className="h-9" type="number" placeholder="e.g. 100" {...register('maxStock')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reorder Qty{OPTIONAL}</Label>
                    <Input className="h-9" type="number" placeholder="e.g. 20" {...register('reorderQty')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rack Location{OPTIONAL}</Label>
                    <Input className="h-9" {...register('rackLocation')} placeholder="A1-01" />
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
              {isSubmitting ? 'Saving…' : 'Add Product'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
