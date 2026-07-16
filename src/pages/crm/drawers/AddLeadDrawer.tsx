import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Building2,
  Save,
  Search as SearchIcon,
  User as UserIcon,
  X,
} from 'lucide-react'

import api from '@/lib/api'
import { USE_MOCK_DATA, mockCreateLead } from '../mockData'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { SalesPersonPicker, type SalesPersonOption } from '../components/SalesPersonPicker'
import { CompanySearchField } from '../components/CompanySearchField'
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
import { cn } from '@/lib/utils'
import { usePaginatedSearch } from '@/hooks/usePaginatedSearch'

import {
  type LeadPipeline,
  type LeadSource,
  type LeadStage,
  STAGES,
  SOURCES,
} from '../types'

interface AddLeadDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const PIPELINES: { value: LeadPipeline; label: string }[] = [
  { value: 'SALES', label: 'Sales Pipeline' },
  { value: 'PROCUREMENT', label: 'Procurement' },
  { value: 'SUPPORT', label: 'Support' },
]

// Two contact modes — drives the CONTACT* section's render and the schema.
type ContactMode = 'search' | 'new'

const schema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    source: z.string(),
    pipeline: z.string(),
    stage: z.string(),
    value: z.number().min(0).optional(),
    currency: z.string(),
    score: z.number().min(0).max(100),
    expectedCloseDate: z.string().optional(),
    validUntil: z.string().optional(),
    linkedCompanyId: z.string().optional(),
    assignedToUserId: z.string().optional(),
    // Contact mode A — selected existing contact
    contactId: z.string().optional(),
    // Contact mode B — new-contact fields
    contactFirstName: z.string().optional(),
    contactLastName: z.string().optional(),
    contactPhoneCountryCode: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional().or(z.literal('')),
    contactJobTitle: z.string().optional(),
    contactCompanyId: z.string().optional(),
    contactCompanyName: z.string().optional(),
    contactAddress: z.string().optional(),
    contactCity: z.string().optional(),
    contactState: z.string().optional(),
    contactCountry: z.string().optional(),
    // Requirement details — the "Requirements" card (mirrors IndiaMART payload).
    reqProduct: z.string().optional(),
    reqCategory: z.string().optional(),
    reqCity: z.string().optional(),
    reqState: z.string().optional(),
    reqMessage: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Either an existing contact OR a fully-populated new-contact block must
    // be present. We validate that here rather than in the form-level rules
    // because the user toggles modes.
    if (!data.contactId) {
      if (!data.contactFirstName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contactFirstName'],
          message: 'First name is required',
        })
      }
      if (!data.contactPhone?.trim() || !/^\d{7,15}$/.test(data.contactPhone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contactPhone'],
          message: 'Phone must be 7–15 digits',
        })
      }
    }
  })

type FormValues = z.input<typeof schema>

const defaultValues: FormValues = {
  title: '',
  description: '',
  source: 'MANUAL',
  pipeline: 'SALES',
  stage: 'LEAD',
  value: 0,
  currency: 'INR',
  score: 50,
  expectedCloseDate: '',
  validUntil: '',
  linkedCompanyId: undefined,
  assignedToUserId: undefined,
  contactId: undefined,
  contactFirstName: '',
  contactLastName: '',
  contactPhoneCountryCode: '+91',
  contactPhone: '',
  contactEmail: '',
  contactJobTitle: '',
  contactCompanyId: undefined,
  contactCompanyName: '',
  contactAddress: '',
  contactCity: '',
  contactState: '',
  contactCountry: '',
  reqProduct: '',
  reqCategory: '',
  reqCity: '',
  reqState: '',
  reqMessage: '',
}

export function AddLeadDrawer({
  open,
  onOpenChange,
  onCreated,
}: AddLeadDrawerProps) {
  const [contactMode, setContactMode] = useState<ContactMode>('search')
  const [selectedContact, setSelectedContact] = useState<{
    id: string
    label: string
  } | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<{
    id: string
    name: string
  } | null>(null)
  // Lead-level "Linked Company" (separate from the contact's company) + owner.
  const [selectedLinkedCompany, setSelectedLinkedCompany] = useState<{
    id: string
    name: string
  } | null>(null)
  const [selectedAssignee, setSelectedAssignee] = useState<SalesPersonOption | null>(null)
  const [keepOpenAfterSave, setKeepOpenAfterSave] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // Reset when the drawer toggles open so we never leak state across sessions.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
      setContactMode('search')
      setSelectedContact(null)
      setSelectedCompany(null)
      setSelectedLinkedCompany(null)
      setSelectedAssignee(null)
    }
  }, [open, form])

  const onSubmit = async (values: FormValues) => {
    try {
      const payload: Record<string, unknown> = {
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        source: values.source as LeadSource,
        pipeline: values.pipeline as LeadPipeline,
        stage: values.stage as LeadStage,
        score: Number(values.score) || 0,
        value: Number(values.value) || 0,
        currency: values.currency,
        expectedCloseDate: values.expectedCloseDate ? new Date(values.expectedCloseDate).toISOString() : undefined,
        validUntil: values.validUntil ? new Date(values.validUntil).toISOString() : undefined,
        companyId: values.linkedCompanyId || undefined,
        assignedToUserId: values.assignedToUserId || undefined,
        externalProductName: values.reqProduct?.trim() || undefined,
        externalCategory: values.reqCategory?.trim() || undefined,
        externalCity: values.reqCity?.trim() || undefined,
        externalState: values.reqState?.trim() || undefined,
        externalMessage: values.reqMessage?.trim() || undefined,
      }
      if (contactMode === 'search' && values.contactId) {
        payload.contactId = values.contactId
      } else {
        payload.contact = {
          firstName: values.contactFirstName?.trim(),
          lastName: values.contactLastName?.trim() || undefined,
          phoneCountryCode: values.contactPhoneCountryCode || '+91',
          phone: values.contactPhone,
          email: values.contactEmail?.trim() || undefined,
          jobTitle: values.contactJobTitle?.trim() || undefined,
          companyName: values.contactCompanyName?.trim() || undefined,
          address: values.contactAddress?.trim() || undefined,
          city: values.contactCity?.trim() || undefined,
          state: values.contactState?.trim() || undefined,
          country: values.contactCountry?.trim() || undefined,
        }
      }
      if (USE_MOCK_DATA) {
        // Mock mode: build a Lead-shaped object and append to MOCK_LEADS.
        // selectedContact only carries {id, label}, so when the user picked
        // an existing contact, use the label as the display name. New
        // contacts come from the form fields directly.
        const contactInput =
          contactMode === 'search' && selectedContact
            ? {
                id: selectedContact.id,
                firstName: selectedContact.label.split(' ')[0] || 'Contact',
                lastName:
                  selectedContact.label.split(' ').slice(1).join(' ') ||
                  undefined,
                phone: '',
              }
            : {
                firstName: values.contactFirstName?.trim() || 'Unnamed',
                lastName: values.contactLastName?.trim() || undefined,
                phoneCountryCode: values.contactPhoneCountryCode || '+91',
                phone: values.contactPhone || '',
                email: values.contactEmail?.trim() || undefined,
                jobTitle: values.contactJobTitle?.trim() || undefined,
              }
        mockCreateLead({
          title: payload.title as string,
          description: payload.description as string | undefined,
          source: payload.source as LeadSource,
          pipeline: payload.pipeline as 'SALES' | 'PROCUREMENT' | 'SUPPORT',
          stage: payload.stage as LeadStage,
          score: Number(values.score) || 50,
          value: Number(values.value) || 0,
          currency: payload.currency as string,
          contact: contactInput,
          company: values.contactCompanyName?.trim()
            ? { id: 'new', name: values.contactCompanyName.trim() }
            : undefined,
        })
      } else {
        await api.post('/leads', payload)
      }
      toast.success('Lead created')
      onCreated()
      if (keepOpenAfterSave) {
        form.reset(defaultValues)
        setContactMode('search')
        setSelectedContact(null)
        setSelectedCompany(null)
        setKeepOpenAfterSave(false)
      } else {
        onOpenChange(false)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string | string[] } } }
      const raw = e?.response?.data?.message
      const msg = Array.isArray(raw) ? raw.join(' • ') : raw
      toast.error(msg ?? 'Failed to create lead')
    }
  }

  const errors = form.formState.errors

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-120"
      >
        <SheetHeader className="shrink-0 border-b border-border/40 px-5 py-3.5">
          <SheetTitle className="text-base font-semibold">Add Lead</SheetTitle>
        </SheetHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {/* ── LEAD INFORMATION ── */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lead Information
              </h3>
              <div className="space-y-1.5">
                <Label>
                  Title <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="Lead title or opportunity name"
                  autoFocus
                  {...form.register('title')}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  placeholder="Additional details about the lead"
                  {...form.register('description')}
                />
              </div>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Controller
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SOURCES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pipeline</Label>
                  <Controller
                    control={form.control}
                    name="pipeline"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Controller
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    {...form.register('value', { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Controller
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INR">₹ INR — Indian Rupee</SelectItem>
                          <SelectItem value="USD">$ USD — US Dollar</SelectItem>
                          <SelectItem value="EUR">€ EUR — Euro</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Controller
                  control={form.control}
                  name="score"
                  render={({ field }) => (
                    <>
                      <div className="flex items-center justify-between">
                        <Label>Lead Score: {field.value}/100</Label>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={field.value}
                        onChange={(e) =>
                          field.onChange(Number(e.target.value) || 0)
                        }
                        className="w-full accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Cold</span>
                        <span>Warm</span>
                        <span>Hot</span>
                      </div>
                    </>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Expected Close Date</Label>
                  <Controller
                    control={form.control}
                    name="expectedCloseDate"
                    render={({ field }) => (
                      <DatePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Select date"
                      />
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valid Until</Label>
                  <Controller
                    control={form.control}
                    name="validUntil"
                    render={({ field }) => (
                      <DatePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Select date"
                      />
                    )}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Linked Company</Label>
                <CompanySearchField
                  value={selectedLinkedCompany}
                  onChange={(c) => {
                    setSelectedLinkedCompany(c)
                    form.setValue('linkedCompanyId', c?.id ?? undefined, {
                      shouldDirty: true,
                    })
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned To</Label>
                <SalesPersonPicker
                  value={selectedAssignee?.id ?? null}
                  onChange={(person) => {
                    setSelectedAssignee(person)
                    form.setValue('assignedToUserId', person?.id ?? undefined, {
                      shouldDirty: true,
                    })
                  }}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <UserIcon className="mr-2 size-4 opacity-60" />
                      {selectedAssignee?.name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </Button>
                  }
                />
              </div>
            </section>

            {/* ── REQUIREMENTS (optional) — populates the lead's Requirements
                card, same fields IndiaMART leads carry. ── */}
            <section className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Requirements
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Product</Label>
                  <Input placeholder="e.g. Renocrit 2000 IU" {...form.register('reqProduct')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input placeholder="e.g. Erythropoietin Injection" {...form.register('reqCategory')} />
                </div>
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input placeholder="City" {...form.register('reqCity')} />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input placeholder="State" {...form.register('reqState')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Buyer's Message</Label>
                <Textarea
                  placeholder="Requirement details, quantity, order value…"
                  rows={3}
                  {...form.register('reqMessage')}
                />
              </div>
            </section>

            {/* ── CONTACT ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact <span className="text-rose-500">*</span>
                </h3>
                {contactMode === 'new' && (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-primary hover:underline"
                    onClick={() => {
                      setContactMode('search')
                      form.setValue('contactId', undefined)
                    }}
                  >
                    Select existing instead
                  </button>
                )}
              </div>

              {contactMode === 'search' ? (
                <ContactSearchField
                  value={selectedContact}
                  onChange={(c) => {
                    setSelectedContact(c)
                    form.setValue('contactId', c?.id)
                  }}
                  onNew={() => {
                    setContactMode('new')
                    setSelectedContact(null)
                    form.setValue('contactId', undefined)
                  }}
                />
              ) : (
                <NewContactFields
                  form={form}
                  selectedCompany={selectedCompany}
                  onCompanyChange={(c) => {
                    setSelectedCompany(c)
                    form.setValue('contactCompanyId', c?.id)
                  }}
                />
              )}
            </section>
          </div>

          {/* Sticky footer */}
          <div className="flex shrink-0 items-center gap-2 border-t border-border/40 bg-background px-5 py-3">
            <Button
              type="submit"
              className="gap-1.5"
              disabled={form.formState.isSubmitting}
              onClick={() => setKeepOpenAfterSave(false)}
            >
              <Save className="h-4 w-4" />
              <span>{form.formState.isSubmitting ? 'Saving…' : 'Save'}</span>
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="gap-1.5"
              disabled={form.formState.isSubmitting}
              onClick={() => setKeepOpenAfterSave(true)}
            >
              <span>+ Save &amp; New</span>
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ── Mode A: existing-contact dropdown ────────────────────────
function ContactSearchField({
  value,
  onChange,
  onNew,
}: {
  value: { id: string; label: string } | null
  onChange: (c: { id: string; label: string } | null) => void
  onNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const search = usePaginatedSearch<{
    id: string
    firstName: string
    lastName?: string | null
    phone: string
    email?: string | null
  }>({
    endpoint: '/contacts',
    pageSize: 20,
    enabled: open,
  })
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) search.setQuery(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-border/80',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="flex items-center gap-2">
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">
            {value?.label ?? 'Search and select a contact…'}
          </span>
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear contact"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
              search.loadMore()
            }
          }}
        >
          <div className="sticky top-0 border-b border-border/60 bg-popover px-3 py-2">
            <Input
              icon={<SearchIcon className="h-3.5 w-3.5" />}
              placeholder="Type to search…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </div>
          {search.items.length === 0 && !search.loading && (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              {text ? 'No matches' : 'Start typing to search'}
            </div>
          )}
          {search.items.map((c) => {
            const label = `${c.firstName} ${c.lastName ?? ''}`.trim()
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange({ id: c.id, label })
                  setOpen(false)
                }}
                className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.phone}
                    {c.email && ` · ${c.email}`}
                  </p>
                </div>
              </button>
            )
          })}
          {search.loading && search.items.length > 0 && (
            <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">
              Loading more…
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNew()
            }}
            className="sticky bottom-0 w-full border-t border-border/60 bg-popover px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
          >
            + Add new contact
          </button>
        </div>
      )}
    </div>
  )
}

// ── Mode B: new contact form fields ──────────────────────────
function NewContactFields({
  form,
  selectedCompany,
  onCompanyChange,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  selectedCompany: { id: string; name: string } | null
  onCompanyChange: (c: { id: string; name: string } | null) => void
}) {
  const errors = form.formState.errors
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold">New Contact Details</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>
            First Name <span className="text-rose-500">*</span>
          </Label>
          <Input placeholder="John" {...form.register('contactFirstName')} />
          {errors.contactFirstName && (
            <p className="text-xs text-destructive">
              {errors.contactFirstName.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Last Name</Label>
          <Input placeholder="Doe" {...form.register('contactLastName')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>
          Phone <span className="text-rose-500">*</span>
        </Label>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <Input
            placeholder="+91"
            {...form.register('contactPhoneCountryCode')}
          />
          <Input
            placeholder="9999999999"
            inputMode="numeric"
            {...form.register('contactPhone')}
          />
        </div>
        {errors.contactPhone && (
          <p className="text-xs text-destructive">
            {errors.contactPhone.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          placeholder="john@example.com"
          {...form.register('contactEmail')}
        />
        {errors.contactEmail && (
          <p className="text-xs text-destructive">
            {errors.contactEmail.message}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Job Title</Label>
        <Input
          placeholder="Sales Manager"
          {...form.register('contactJobTitle')}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Company</Label>
        <Input placeholder="Company name" {...form.register('contactCompanyName')} />
      </div>
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Input placeholder="Street address" {...form.register('contactAddress')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input placeholder="City" {...form.register('contactCity')} />
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Input placeholder="State" {...form.register('contactState')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Country</Label>
        <Input placeholder="India" {...form.register('contactCountry')} />
      </div>
    </div>
  )
}
