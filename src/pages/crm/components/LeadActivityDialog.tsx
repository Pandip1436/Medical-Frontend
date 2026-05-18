import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Clock,
  Mail,
  MessageCircle,
  Phone,
  StickyNote,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'

export type LeadActivityType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'NOTE' | 'REMINDER'
export type LeadActivityStatus = 'PENDING' | 'DONE' | 'CANCELLED'

export interface LeadActivity {
  id: string
  type: LeadActivityType
  notes?: string | null
  title?: string | null
  occurredAt?: string | null
  dueAt?: string | null
  status?: LeadActivityStatus | null
  contactName?: string | null
  subject?: string | null
  createdAt: string
  createdBy?: { id: string; name: string; email: string } | null
}

const TYPE_META: Record<
  LeadActivityType,
  { label: string; icon: typeof Phone; chip: string }
> = {
  CALL: { label: 'Call', icon: Phone, chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle, chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  EMAIL: { label: 'Email', icon: Mail, chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  NOTE: { label: 'Note', icon: StickyNote, chip: 'bg-slate-50 text-slate-700 border-slate-200' },
  REMINDER: { label: 'Reminder', icon: Clock, chip: 'bg-amber-50 text-amber-700 border-amber-200' },
}

// Mirrors the SupplierActivityDialog form schema — same shape, just lives
// under the CRM tree and points at /leads/:id/activities at submit time.
const formSchema = z
  .object({
    type: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'REMINDER']),
    notes: z.string().optional(),
    title: z.string().optional(),
    contactName: z.string().optional(),
    subject: z.string().optional(),
    occurredAt: z.string().optional(),
    dueAt: z.string().optional(),
    status: z.enum(['PENDING', 'DONE', 'CANCELLED']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'REMINDER') {
      if (!data.title || data.title.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Title is required for reminders',
          path: ['title'],
        })
      }
      if (!data.dueAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Due date is required for reminders',
          path: ['dueAt'],
        })
      }
    } else {
      if (!data.notes || data.notes.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Notes are required',
          path: ['notes'],
        })
      }
    }
  })

export type LeadActivityFormValues = z.input<typeof formSchema>

function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(val?: string): string | undefined {
  if (!val) return undefined
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export interface LeadActivityPayload {
  type: LeadActivityType
  notes?: string
  title?: string
  contactName?: string
  subject?: string
  occurredAt?: string
  dueAt?: string
  status?: LeadActivityStatus
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: LeadActivityType
  editing: LeadActivity | null
  onSubmit: (payload: LeadActivityPayload) => Promise<void> | void
}

export function LeadActivityDialog({
  open,
  onOpenChange,
  type,
  editing,
  onSubmit,
}: Props) {
  const meta = TYPE_META[type]
  const Icon = meta.icon

  const defaults: LeadActivityFormValues = useMemo(
    () => ({
      type,
      notes: '',
      title: '',
      contactName: '',
      subject: '',
      occurredAt:
        type === 'REMINDER' ? '' : toDatetimeLocal(new Date().toISOString()),
      dueAt: '',
      status: 'PENDING',
    }),
    [type],
  )

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LeadActivityFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  })

  useEffect(() => {
    if (!open) return
    if (editing) {
      reset({
        type: editing.type,
        notes: editing.notes ?? '',
        title: editing.title ?? '',
        contactName: editing.contactName ?? '',
        subject: editing.subject ?? '',
        occurredAt: toDatetimeLocal(editing.occurredAt),
        dueAt: toDatetimeLocal(editing.dueAt),
        status: editing.status ?? 'PENDING',
      })
    } else {
      reset(defaults)
    }
  }, [open, editing, reset, defaults])

  async function handleFormSubmit(data: LeadActivityFormValues) {
    try {
      const payload: LeadActivityPayload = { type: data.type }
      if (data.type === 'REMINDER') {
        payload.title = data.title?.trim()
        payload.dueAt = fromDatetimeLocal(data.dueAt)
        if (data.notes?.trim()) payload.notes = data.notes.trim()
        if (data.status) payload.status = data.status
      } else {
        payload.notes = data.notes?.trim()
        payload.occurredAt = fromDatetimeLocal(data.occurredAt)
        if (data.contactName?.trim()) payload.contactName = data.contactName.trim()
        if (data.type === 'EMAIL' && data.subject?.trim()) {
          payload.subject = data.subject.trim()
        }
      }
      await onSubmit(payload)
      onOpenChange(false)
    } catch {
      toast.error('Failed to save activity. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${meta.chip}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <DialogTitle>
              {editing ? `Edit ${meta.label}` : `Log ${meta.label}`}
            </DialogTitle>
          </div>
          <DialogDescription>
            {type === 'REMINDER'
              ? 'Schedule a future follow-up — it will appear in Pending until marked Done.'
              : `Record this ${meta.label.toLowerCase()} so the team has a shared history.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {type === 'REMINDER' ? (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Title
                </Label>
                <Input
                  placeholder="e.g. Follow up on Terifrac quotation"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Due At
                </Label>
                <Controller
                  control={control}
                  name="dueAt"
                  render={({ field }) => (
                    <DateTimeInput
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.dueAt && (
                  <p className="text-xs text-destructive">
                    {errors.dueAt.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes (optional)
                </Label>
                <Textarea
                  placeholder="Extra context for this reminder"
                  rows={3}
                  {...register('notes')}
                />
              </div>
            </>
          ) : (
            <>
              {(type === 'CALL' || type === 'WHATSAPP' || type === 'EMAIL') && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contact Name (optional)
                    </Label>
                    <Input placeholder="e.g. Mr. Sharma" {...register('contactName')} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Occurred At
                    </Label>
                    <Controller
                      control={control}
                      name="occurredAt"
                      render={({ field }) => (
                        <DateTimeInput
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                </div>
              )}
              {type === 'EMAIL' && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Subject (optional)
                  </Label>
                  <Input placeholder="e.g. Payment reminder" {...register('subject')} />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  placeholder={
                    type === 'NOTE'
                      ? 'Free-text note about this lead'
                      : `What was discussed in this ${meta.label.toLowerCase()}?`
                  }
                  rows={4}
                  {...register('notes')}
                />
                {errors.notes && (
                  <p className="text-xs text-destructive">
                    {errors.notes.message}
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving…'
                : editing
                  ? `Update ${meta.label}`
                  : `Log ${meta.label}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { TYPE_META }

// DatePicker + native time input pair, kept in sync with a single
// "YYYY-MM-DDTHH:mm" string so it slots into the existing form schema
// without rewriting the submit pipeline. Native time fields render
// consistently across browsers — the chrome we wanted to avoid was the
// big calendar pop-out attached to datetime-local.
function DateTimeInput({
  value,
  onChange,
}: {
  value?: string
  onChange: (next: string) => void
}) {
  const [datePart, timePart] = splitDatetimeLocal(value)
  const handleDateChange = (next: string) => {
    if (!next) {
      onChange('')
      return
    }
    onChange(`${next}T${timePart || '09:00'}`)
  }
  const handleTimeChange = (t: string) => {
    if (!datePart) {
      // No date yet — default to today so the value is still parseable.
      const today = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
        today.getDate(),
      )}`
      onChange(t ? `${iso}T${t}` : '')
      return
    }
    onChange(t ? `${datePart}T${t}` : '')
  }
  return (
    <div className="flex w-full min-w-0 gap-2">
      <div className="min-w-0 flex-1">
        <DatePicker value={datePart} onChange={handleDateChange} />
      </div>
      <div className="w-[120px] shrink-0">
        <TimePicker value={timePart} onChange={handleTimeChange} />
      </div>
    </div>
  )
}

function splitDatetimeLocal(val?: string): [string, string] {
  if (!val) return ['', '']
  const [d = '', t = ''] = val.split('T')
  return [d, t.slice(0, 5)]
}
