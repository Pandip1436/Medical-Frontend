import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, Plus, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import api from '@/lib/api'
import {
  USE_MOCK_DATA,
  mockActivitiesForLead,
  mockAddActivity,
  mockUpdateActivity,
} from '../mockData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'

import {
  LeadActivityDialog,
  type LeadActivity,
  type LeadActivityPayload,
} from '../components/LeadActivityDialog'
import type { Lead } from '../types'

interface FollowUpsTabProps {
  lead: Lead
}

/**
 * Follow Ups tab — a focused view of REMINDER-type activities that are still
 * pending (i.e. unresolved follow-ups). It's powered by the same
 * /leads/:id/activities endpoint as ActivityTab but with a fixed filter so
 * the user sees only their open to-dos at a glance.
 *
 * Each row carries a Mark Done / Cancel pair. Completing or cancelling a
 * follow-up removes it from this list (the underlying activity sticks
 * around with its new status in the Activity tab).
 */
export function FollowUpsTab({ lead }: FollowUpsTabProps) {
  const [items, setItems] = useState<LeadActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      if (USE_MOCK_DATA) {
        const all = mockActivitiesForLead(lead.id) as LeadActivity[]
        setItems(
          all.filter((a) => a.type === 'REMINDER' && a.status === 'PENDING'),
        )
        return
      }
      const res = await api.get(`/leads/${lead.id}/activities`, {
        params: { type: 'REMINDER' },
      })
      const data: LeadActivity[] = Array.isArray(res.data)
        ? res.data
        : (res.data?.data ?? [])
      // Only show pending follow-ups; DONE / CANCELLED live in the full
      // activity timeline.
      setItems(data.filter((a) => a.status === 'PENDING'))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Failed to load follow-ups')
    } finally {
      setLoading(false)
    }
  }, [lead.id])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const updateStatus = async (
    activity: LeadActivity,
    status: 'DONE' | 'CANCELLED',
  ) => {
    if (USE_MOCK_DATA) {
      mockUpdateActivity(lead.id, activity.id, { status })
      toast.success(status === 'DONE' ? 'Marked done' : 'Cancelled')
      fetchItems()
      return
    }
    try {
      await api.patch(`/leads/${lead.id}/activities/${activity.id}`, { status })
      toast.success(status === 'DONE' ? 'Marked done' : 'Cancelled')
      fetchItems()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      toast.error(e?.response?.data?.message ?? 'Update failed')
    }
  }

  const handleCreate = async (payload: LeadActivityPayload) => {
    if (USE_MOCK_DATA) {
      mockAddActivity(lead.id, { ...payload, type: 'REMINDER', status: 'PENDING' })
      toast.success('Follow-up scheduled')
      fetchItems()
      return
    }
    await api.post(`/leads/${lead.id}/activities`, payload)
    toast.success('Follow-up scheduled')
    fetchItems()
  }

  // Bucket by overdue / today / upcoming so the user can scan urgency.
  const now = Date.now()
  const overdue: LeadActivity[] = []
  const today: LeadActivity[] = []
  const upcoming: LeadActivity[] = []
  for (const a of items) {
    if (!a.dueAt) {
      upcoming.push(a)
      continue
    }
    const due = new Date(a.dueAt).getTime()
    const sameDay = new Date(a.dueAt).toDateString() === new Date().toDateString()
    if (due < now && !sameDay) overdue.push(a)
    else if (sameDay) today.push(a)
    else upcoming.push(a)
  }

  return (
    <div className="space-y-4 p-5">
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                Follow Ups
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({items.length} pending)
                </span>
              </h3>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Schedule Follow Up</span>
            </Button>
          </div>

          {loading && items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
              <CalendarClock className="h-8 w-8 opacity-40" />
              <p>No pending follow-ups</p>
              <p className="text-xs">
                Schedule one to make sure this lead doesn&apos;t go cold.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {overdue.length > 0 && (
                <FollowUpBucket
                  label="Overdue"
                  tone="rose"
                  items={overdue}
                  onDone={(a) => updateStatus(a, 'DONE')}
                  onCancel={(a) => updateStatus(a, 'CANCELLED')}
                />
              )}
              {today.length > 0 && (
                <FollowUpBucket
                  label="Today"
                  tone="amber"
                  items={today}
                  onDone={(a) => updateStatus(a, 'DONE')}
                  onCancel={(a) => updateStatus(a, 'CANCELLED')}
                />
              )}
              {upcoming.length > 0 && (
                <FollowUpBucket
                  label="Upcoming"
                  tone="blue"
                  items={upcoming}
                  onDone={(a) => updateStatus(a, 'DONE')}
                  onCancel={(a) => updateStatus(a, 'CANCELLED')}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule dialog — always renders the REMINDER variant. */}
      <LeadActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type="REMINDER"
        editing={null}
        onSubmit={handleCreate}
      />
    </div>
  )
}

function FollowUpBucket({
  label,
  tone,
  items,
  onDone,
  onCancel,
}: {
  label: string
  tone: 'rose' | 'amber' | 'blue'
  items: LeadActivity[]
  onDone: (a: LeadActivity) => void
  onCancel: (a: LeadActivity) => void
}) {
  const toneClass =
    tone === 'rose'
      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
      : tone === 'amber'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'bg-blue-500/10 text-blue-700 dark:text-blue-400'

  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between px-5 py-2">
        <Badge size="sm" className={cn('font-semibold', toneClass)}>
          {label} ({items.length})
        </Badge>
      </div>
      <ul className="divide-y divide-border/40">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{a.title ?? 'Follow-up'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.dueAt ? `Due ${formatDate(a.dueAt)}` : 'No due date set'}
                {a.createdBy?.name && (
                  <>
                    {' · '}by {a.createdBy.name}
                  </>
                )}
              </p>
              {a.notes && (
                <p className="mt-1.5 text-xs text-foreground/80">{a.notes}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => onDone(a)}
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span>Done</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => onCancel(a)}
                title="Cancel"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
