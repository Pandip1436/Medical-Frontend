import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PackagePlus } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useMasterDataStore } from '@/stores/masterDataStore'
import {
  productSchema,
  productFormDefaults,
  type ProductFormValues,
} from '@/components/products/productFormSchema'
import { CategorySearchDropdown } from '@/components/products/CategorySearchDropdown'
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
  })
  const { register, handleSubmit, reset, watch, control, formState } = form
  const { errors, isSubmitting } = formState

  // Reset form whenever the drawer reopens — prevents stale state from a
  // prior cancel/close leaking into a fresh open. Also lazily fetches
  // categories the first time the drawer is used.
  useEffect(() => {
    if (!open) return
    reset({ ...productFormDefaults, name: prefillName ?? '' })
    if (categories.length === 0) fetchCategories()
  }, [open, prefillName, reset, categories.length, fetchCategories])

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
        storageCondition: values.storageCondition.toUpperCase(),
        categoryId: values.categoryId || undefined,
      }
      const res = await api.post('/products', payload)
      toast.success(`Product "${values.name}" added — add stock via Purchase Received to bill this item`)
      onSaved?.(res.data as Product)
      onOpenChange(false)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message ?? 'Failed to add product')
    }
  }

  // Section-progress pill state — mirrors PO / Supplier drawers.
  const isSubmitted = formState.isSubmitted
  const identityFilled = !!watch('name') && !!watch('genericName') && !!watch('manufacturer') && !!watch('categoryId')
  const identityError = !!(errors.name || errors.genericName || errors.manufacturer || errors.categoryId)
  const packagingFilled = !!watch('packSize') && !!watch('unitOfMeasure') && !!watch('hsnCode')
  const packagingError = !!(errors.packSize || errors.unitOfMeasure || errors.hsnCode)
  const pricingFilled = Number(watch('mrp')) > 0 && Number(watch('purchaseRate')) > 0
  const pricingError = !!(errors.mrp || errors.purchaseRate)
  const stockFilled = !!watch('rackLocation')
  const stockError = !!errors.rackLocation

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
        className="p-0 gap-0 w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl flex flex-col h-dvh overflow-hidden"
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-muted/20">
          <div className="flex items-center gap-4 pr-8">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-lg flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-primary" />
                Add New Product
              </SheetTitle>
              <SheetDescription className="text-sm">
                Saves to product master. Stock will be 0 until a Purchase Received entry is made.
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
                    <Input className="h-9" {...register('name')} placeholder="e.g. Torsemide 20mg Tab" error={!!errors.name} />
                    {errors.name && <p className="text-[11px] text-rose-500">{errors.name.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-4 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Generic Name *</Label>
                    <Input className="h-9" {...register('genericName')} placeholder="e.g. Torsemide" error={!!errors.genericName} />
                    {errors.genericName && <p className="text-[11px] text-rose-500">{errors.genericName.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manufacturer *</Label>
                    <Input
                      className="h-9"
                      {...register('manufacturer')}
                      list="pfd-manufacturer-list"
                      placeholder="Select or type..."
                      autoComplete="off"
                      error={!!errors.manufacturer}
                    />
                    <datalist id="pfd-manufacturer-list">
                      {manufacturers.map(m => <option key={m} value={m} />)}
                    </datalist>
                    {errors.manufacturer && <p className="text-[11px] text-rose-500">{errors.manufacturer.message}</p>}
                  </div>
                  <div className="col-span-12 sm:col-span-7 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Salt Composition</Label>
                    <Input className="h-9" {...register('saltComposition')} placeholder="e.g. Paracetamol 500mg + Caffeine 65mg" />
                  </div>
                  <div className="col-span-12 sm:col-span-5 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category *</Label>
                    <Controller control={control} name="categoryId" render={({ field }) => (
                      <CategorySearchDropdown categories={categories} value={field.value ?? ''} onChange={field.onChange} hasError={!!errors.categoryId} />
                    )} />
                    {errors.categoryId && <p className="text-[11px] text-rose-500">{errors.categoryId.message}</p>}
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
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pack Size *</Label>
                    <Input className="h-9" {...register('packSize')} placeholder="10x10" error={!!errors.packSize} />
                    {errors.packSize && <p className="text-[11px] text-rose-500">{errors.packSize.message}</p>}
                  </div>
                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit of Measure *</Label>
                    <Input className="h-9" {...register('unitOfMeasure')} placeholder="Strip, Vial" error={!!errors.unitOfMeasure} />
                    {errors.unitOfMeasure && <p className="text-[11px] text-rose-500">{errors.unitOfMeasure.message}</p>}
                  </div>
                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">HSN Code *</Label>
                    <Input className="h-9" {...register('hsnCode')} placeholder="30049099" error={!!errors.hsnCode} />
                    {errors.hsnCode && <p className="text-[11px] text-rose-500">{errors.hsnCode.message}</p>}
                  </div>
                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Storage</Label>
                    <Controller control={control} name="storageCondition" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ROOM_TEMP">Room Temperature</SelectItem>
                          <SelectItem value="COOL_DRY">Cool & Dry</SelectItem>
                          <SelectItem value="REFRIGERATED">Refrigerated</SelectItem>
                          <SelectItem value="FROZEN">Frozen</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="col-span-12 sm:col-span-8 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Drug Schedule</Label>
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
                  <div className="col-span-12 sm:col-span-4 flex items-center justify-between rounded-md border border-border/60 px-3 h-9 self-end">
                    <Label className="text-xs cursor-pointer">Is Narcotic</Label>
                    <Controller control={control} name="isNarcotic" render={({ field }) => (
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MRP (₹) *</Label>
                    <Input className="h-9" type="number" step="0.01" {...register('mrp')} error={!!errors.mrp} />
                    {errors.mrp && <p className="text-[11px] text-rose-500">{errors.mrp.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Purchase (₹) *</Label>
                    <Input className="h-9" type="number" step="0.01" {...register('purchaseRate')} error={!!errors.purchaseRate} />
                    {errors.purchaseRate && <p className="text-[11px] text-rose-500">{errors.purchaseRate.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selling (₹)</Label>
                    <Input className="h-9" type="number" step="0.01" {...register('sellingRate')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wholesale (₹)</Label>
                    <Input className="h-9" type="number" step="0.01" {...register('wholesaleRate')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">GST Rate</Label>
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Stock</Label>
                    <Input className="h-9" type="number" {...register('minStock')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max Stock</Label>
                    <Input className="h-9" type="number" {...register('maxStock')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reorder Qty</Label>
                    <Input className="h-9" type="number" {...register('reorderQty')} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rack Location *</Label>
                    <Input className="h-9" {...register('rackLocation')} placeholder="A1-01" error={!!errors.rackLocation} />
                    {errors.rackLocation && <p className="text-[11px] text-rose-500">{errors.rackLocation.message}</p>}
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
