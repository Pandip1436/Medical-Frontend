import { useEffect, useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft, FileX2, Phone, User, Calendar, Mail, MessageSquare,
  CheckCircle2, AlertCircle, XCircle, Clock, Plus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { goBack as routerGoBack, useRoute } from '@/lib/router'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

type ContactStatus = 'TALKED' | 'NOT_RESPONDED' | 'DENIED' | 'NEED_TO_TALK' | 'SCHEDULED'

interface ContactLog {
  id: string
  status: ContactStatus
  notes?: string | null
  contactedAt: string
}

interface Reminder {
  id: string
  customerId: string
  dayOfMonth: number
  title: string
  notes?: string | null
  customer: { id: string; name: string; phone: string; type: string; email?: string | null }
  contacts: ContactLog[]
}

const STATUS_CONFIG: Record<ContactStatus, { label: string; variant: any; icon: React.ReactNode }> = {
  TALKED:        { label: 'Talked',        variant: 'success',     icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  NOT_RESPONDED: { label: 'Not Responded', variant: 'warning',     icon: <AlertCircle className="h-3.5 w-3.5" /> },
  DENIED:        { label: 'Denied',        variant: 'destructive', icon: <XCircle className="h-3.5 w-3.5" /> },
  NEED_TO_TALK:  { label: 'Need to Talk',  variant: 'secondary',   icon: <MessageSquare className="h-3.5 w-3.5" /> },
  SCHEDULED:     { label: 'Scheduled',     variant: 'info',        icon: <Clock className="h-3.5 w-3.5" /> },
}

// Reminder Detail Page — destination for Reminder notifications. Shows
// the customer, reminder copy, and full contact log with a "Log contact"
// quick action so the user can act in one place.
export default function ReminderDetailPage() {
  const { search } = useRoute()
  // Accept either `?id=` (new) or `?reminderId=` (legacy).
  const params = new URLSearchParams(search)
  const id = params.get('id') ?? params.get('reminderId')

  const [reminder, setReminder] = useState<Reminder | null>(null)
  const [contacts, setContacts] = useState<ContactLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [logOpen, setLogOpen] = useState(false)
  const [logStatus, setLogStatus] = useState<ContactStatus>('TALKED')
  const [logNotes, setLogNotes] = useState('')
  const [logSaving, setLogSaving] = useState(false)

  const todayDay = new Date().getDate()

  const fetchReminder = useCallback(async (reminderId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      // No dedicated GET /reminders/:id endpoint — fetch the list and pick
      // ours. The reminders list is small in practice.
      const [listRes, contactsRes] = await Promise.all([
        api.get('/reminders'),
        api.get(`/reminders/${reminderId}/contacts`),
      ])
      const all: Reminder[] = listRes.data ?? []
      const found = all.find((r) => r.id === reminderId) ?? null
      if (!found) {
        setError('Reminder not found')
        return
      }
      setReminder(found)
      setContacts(Array.isArray(contactsRes.data) ? contactsRes.data : [])
    } catch (err: any) {
      const msg = err.response?.status === 404 ? 'Reminder not found' : 'Failed to load reminder'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) fetchReminder(id)
    else { setIsLoading(false); setError('No reminder id provided') }
  }, [id, fetchReminder])

  const handleLogContact = async () => {
    if (!reminder) return
    setLogSaving(true)
    try {
      await api.post(`/reminders/${reminder.id}/contacts`, {
        status: logStatus,
        notes: logNotes.trim() || undefined,
      })
      toast.success('Contact logged')
      setLogOpen(false)
      setLogNotes('')
      setLogStatus('TALKED')
      // Refresh contacts
      const res = await api.get(`/reminders/${reminder.id}/contacts`)
      setContacts(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to log contact')
    } finally {
      setLogSaving(false)
    }
  }

  const isToday = useMemo(() => reminder?.dayOfMonth === todayDay, [reminder, todayDay])

  const goBack = () => routerGoBack('/reminders')

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Button>

      <Card>
        {isLoading ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Loading reminder…</p>
          </CardContent>
        ) : error || !reminder ? (
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <FileX2 className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{error ?? 'Reminder unavailable'}</p>
              <p className="mt-1 text-xs text-muted-foreground">It may have been deleted.</p>
            </div>
            <Button size="sm" variant="outline" onClick={goBack}>Back to reminders</Button>
          </CardContent>
        ) : (
          <>
            <CardHeader className="border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-11 w-11 flex-col items-center justify-center rounded-xl text-center',
                    isToday ? 'bg-amber-500 text-white' : 'bg-muted/60 text-foreground',
                  )}>
                    <span className="text-[9px] font-medium uppercase tracking-wider">Day</span>
                    <span className="text-base font-bold leading-none">{reminder.dayOfMonth}</span>
                  </div>
                  <div>
                    <p className="text-base font-semibold leading-snug">{reminder.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Follow up with {reminder.customer.name}
                      {isToday && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Clock className="h-3 w-3" /> Due today</span>}
                    </p>
                  </div>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setLogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Log contact
                </Button>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-5">
              {/* Customer card */}
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Customer</p>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <Field icon={User} label="Name" value={reminder.customer.name} />
                  <Field icon={Phone} label="Phone" value={reminder.customer.phone} />
                  {reminder.customer.email && (
                    <Field icon={Mail} label="Email" value={reminder.customer.email} />
                  )}
                  <Field icon={Calendar} label="Recurs on" value={`Day ${reminder.dayOfMonth} every month`} />
                </div>
              </div>

              {/* Notes */}
              {reminder.notes && (
                <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Notes</p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{reminder.notes}</p>
                </div>
              )}

              {/* Contact log */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Contact history · {contacts.length}
                </p>
                <div className="mt-2 space-y-2">
                  {contacts.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-xs text-muted-foreground">
                      No contacts logged yet. Use "Log contact" above after speaking with the customer.
                    </p>
                  ) : contacts.map((c) => {
                    const cfg = STATUS_CONFIG[c.status]
                    return (
                      <div key={c.id} className="flex items-start gap-3 rounded-xl border border-border/40 bg-muted/10 p-3">
                        <Badge variant={cfg.variant} size="sm" className="gap-1 shrink-0">
                          {cfg.icon} {cfg.label}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          {c.notes && <p className="text-sm">{c.notes}</p>}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {new Date(c.contactedAt).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </>
        )}
      </Card>

      {/* Log contact dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="log-status" className="text-xs">Status</Label>
              <Select value={logStatus} onValueChange={(v) => setLogStatus(v as ContactStatus)}>
                <SelectTrigger id="log-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_CONFIG) as ContactStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_CONFIG[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-notes" className="text-xs">Notes (optional)</Label>
              <Textarea
                id="log-notes"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={3}
                placeholder="What did they say? Next steps?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)} disabled={logSaving}>Cancel</Button>
            <Button onClick={handleLogContact} disabled={logSaving}>
              {logSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function Field({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
