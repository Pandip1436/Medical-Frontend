import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Filter,
  MoreHorizontal,
  Plus,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import {
  USE_MOCK_DATA,
  mockActivitiesForLead,
  mockAddActivity,
  mockUpdateActivity,
  mockDeleteActivity,
} from '../mockData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatDate } from '@/lib/utils'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

import {
  LeadActivityDialog,
  TYPE_META,
  type LeadActivity,
  type LeadActivityPayload,
  type LeadActivityType,
} from '../components/LeadActivityDialog'
import type { Lead } from '../types'

interface ActivityTabProps {
  lead: Lead
}

type TypeFilter = 'ALL' | LeadActivityType

const ALL_TYPES: { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'CALL', label: 'Call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'NOTE', label: 'Note' },
  { value: 'REMINDER', label: 'Reminder' },
]

/**
 * Activity tab — timeline of CALL / WHATSAPP / EMAIL / NOTE / REMINDER
 * entries against this lead. Drives off `/leads/:leadId/activities`.
 *
 * Top toolbar:
 *   - Type filter dropdown (All Types / Call / WhatsApp / Email / Note / Reminder)
 *   - + Add Activity (opens LeadActivityDialog with a chosen type)
 *
 * Each timeline entry shows type icon + title/notes + timestamp + owner.
 * REMINDER entries also surface their pending/done lifecycle with quick
 * Mark Done / Cancel actions.
 */
export function ActivityTab({ lead }: ActivityTabProps) {
  const [items, setItems] = useState<LeadActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<LeadActivityType>('NOTE')
  const [editing, setEditing] = useState<LeadActivity | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LeadActivity | null>(null)

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK_DATA) {
        const all = mockActivitiesForLead(lead.id) as LeadActivity[]
        setItems(typeFilter === 'ALL' ? all : all.filter((a) => a.type === typeFilter))
        return
      }
      const params: Record<string, string> = {}
      if (typeFilter !== 'ALL') params.type = typeFilter
      const res = await api.get(`/leads/${lead.id}/activities`, { params })
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
      setItems(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to load activities')
    } finally {
      setLoading(false)
    }
  }, [lead.id, typeFilter])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  const handleCreate = async (payload: LeadActivityPayload) => {
    if (USE_MOCK_DATA) {
      // Mock mode now persists to the shared activity store, so the next
      // fetchActivities() picks up the change exactly like the real API
      // would after a successful POST/PATCH.
      if (editing) {
        mockUpdateActivity(lead.id, editing.id, payload)
        toast.success('Activity updated')
      } else {
        mockAddActivity(lead.id, payload)
        toast.success('Activity logged')
      }
      setEditing(null)
      fetchActivities()
      return
    }
    if (editing) {
      await api.patch(`/leads/${lead.id}/activities/${editing.id}`, payload)
      toast.success('Activity updated')
    } else {
      await api.post(`/leads/${lead.id}/activities`, payload)
      toast.success('Activity logged')
    }
    setEditing(null)
    fetchActivities()
  }

  const setReminderStatus = async (
    activity: LeadActivity,
    status: 'DONE' | 'CANCELLED',
  ) => {
    if (USE_MOCK_DATA) {
      mockUpdateActivity(lead.id, activity.id, { status })
      toast.success(status === 'DONE' ? 'Marked done' : 'Reminder cancelled')
      fetchActivities()
      return
    }
    try {
      await api.patch(`/leads/${lead.id}/activities/${activity.id}`, { status })
      toast.success(status === 'DONE' ? 'Marked done' : 'Reminder cancelled')
      fetchActivities()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Update failed')
    }
  }

  const handleDelete = (activity: LeadActivity) => {
    setDeleteTarget(activity)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const activity = deleteTarget
    if (USE_MOCK_DATA) {
      mockDeleteActivity(lead.id, activity.id)
      toast.success('Activity deleted')
      fetchActivities()
      setDeleteTarget(null)
      return
    }
    try {
      await api.delete(`/leads/${lead.id}/activities/${activity.id}`)
      toast.success('Activity deleted')
      fetchActivities()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Delete failed')
    } finally {
      setDeleteTarget(null)
    }
  }

  const currentFilterLabel =
    ALL_TYPES.find((t) => t.value === typeFilter)?.label ?? 'All Types'

  return (
    <div className="space-y-4 p-5">
      <Card>
        <CardContent className="p-0">
          {/* In-card header — title + count on the left, filter + Add Activity
              on the right. Matches the pattern in QuotationsTab and InvoicesTab. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-5 py-3">
            <h3 className="text-sm font-semibold">
              Activity
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            </h3>
            <div className="flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Filter className="h-3.5 w-3.5" />
                    <span className="text-xs">{currentFilterLabel}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                  style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
                >
                  {ALL_TYPES.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onSelect={() => setTypeFilter(opt.value)}
                      className={cn(
                        'cursor-pointer text-xs',
                        typeFilter === opt.value && 'bg-accent font-semibold',
                      )}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="text-xs">Add Activity</span>
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                  style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
                >
                  {(['CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'REMINDER'] as LeadActivityType[]).map(
                    (t) => {
                      const Icon = TYPE_META[t].icon
                      return (
                        <DropdownMenuItem
                          key={t}
                          onSelect={() => {
                            setEditing(null)
                            setDialogType(t)
                            setDialogOpen(true)
                          }}
                          className="cursor-pointer gap-2 text-xs"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{TYPE_META[t].label}</span>
                        </DropdownMenuItem>
                      )
                    },
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Body — loading / empty / timeline */}
          {loading && items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
              <p>
                No {typeFilter === 'ALL' ? 'activities' : `${currentFilterLabel.toLowerCase()}s`} yet
              </p>
              <p className="text-xs">
                Add a call, WhatsApp, email, note or reminder to track every touch
                with this lead.
              </p>
            </div>
          ) : (
            <ol className="relative space-y-3 border-l border-border/40 px-5 pb-5 pt-4 pl-10">
              {/* Note: pl-10 absorbs the relative timeline track so the avatars
                  align inside the card padding. */}
          {items.map((a) => {
            const meta = TYPE_META[a.type]
            const Icon = meta.icon
            const isReminder = a.type === 'REMINDER'
            const isPending = isReminder && a.status === 'PENDING'
            return (
              <li key={a.id} className="relative">
                <span
                  className={cn(
                    'absolute -left-[33px] top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border bg-background',
                    meta.chip,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <Card>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold">
                            {meta.label}
                          </span>
                          {isReminder && a.status && (
                            <Badge
                              size="sm"
                              className={cn(
                                'text-[10px]',
                                a.status === 'DONE'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : a.status === 'CANCELLED'
                                    ? 'bg-muted text-muted-foreground'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                              )}
                            >
                              {a.status}
                            </Badge>
                          )}
                          {a.title && (
                            <span className="text-xs font-medium text-foreground">
                              · {a.title}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {a.createdBy?.name ?? 'Unknown'} ·{' '}
                          {isReminder
                            ? `Due ${formatDate(a.dueAt ?? a.createdAt)}`
                            : formatDate(a.occurredAt ?? a.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {isPending && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setReminderStatus(a, 'DONE')}
                              title="Mark done"
                              className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setReminderStatus(a, 'CANCELLED')}
                              title="Cancel"
                              className="h-7 w-7 text-muted-foreground hover:bg-muted"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7 text-muted-foreground"
                              aria-label="More"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(a)
                                setDialogType(a.type)
                                setDialogOpen(true)
                              }}
                              className="cursor-pointer text-xs"
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => handleDelete(a)}
                              className="cursor-pointer text-xs text-rose-600"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {a.notes && (
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">
                        {a.notes}
                      </p>
                    )}
                    {a.type === 'EMAIL' && a.subject && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold">Subject:</span>{' '}
                        {a.subject}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            )
          })}
            </ol>
          )}
        </CardContent>
      </Card>

      <LeadActivityDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v)
          if (!v) setEditing(null)
        }}
        type={dialogType}
        editing={editing}
        onSubmit={handleCreate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete activity?"
        description="This will permanently remove this activity from the lead timeline. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
